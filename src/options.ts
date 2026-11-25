import * as storageForm from "storage-form";
import * as keyInput from "key-input-elements";
import settings from "./lib/settings";
import { waitUntil } from "./dom/animations";
import { printError } from "./lib/errors";
import { KEY_LABELS, computeKeyConflicts } from "./lib/key-conflicts";

async function init() {
  await waitUntil(() => Boolean(document.body));

  const body = document.body;
  await settings.getStorage();

  storageForm.register();
  keyInput.register();
  registerKnaviStorageUsage();

  initRestoreButton(body);
  initValuesetButton(body);
  initKeyConflictValidation(body);
}

function initKeyConflictValidation(body: HTMLElement) {
  const inputs = new Map<string, HTMLInputElement>();
  for (const name of Object.keys(KEY_LABELS)) {
    const el = body.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (el) inputs.set(name, el);
  }
  const summary = document.querySelector<HTMLElement>("#key-conflicts");

  const validate = () => {
    const values: Record<string, string> = {};
    for (const [name, el] of inputs) values[name] = el.value;
    const { messages, invalid, hintsError } = computeKeyConflicts(values);

    for (const [name, el] of inputs) {
      el.setCustomValidity(
        name === "hints" && hintsError
          ? hintsError
          : invalid.has(name)
            ? "This key conflicts with another setting."
            : "",
      );
    }

    if (summary) renderSummary(summary, messages);
    return hintsError;
  };

  const renderSummary = (summary: HTMLElement, messages: string[]) => {
    summary.replaceChildren();
    summary.hidden = messages.length === 0;
    if (messages.length === 0) return;

    const title = document.createElement("strong");
    title.textContent = "Key configuration conflicts:";
    const ul = document.createElement("ul");
    for (const msg of messages) {
      const li = document.createElement("li");
      li.textContent = msg;
      ul.appendChild(li);
    }
    summary.append(title, ul);
  };

  /* WHY: storage-form saves every control on each input/change event without
     looking at validity, and it saves all controls whose value differs from
     the stored one. A capturing listener runs before storage-form's, so
     stopping the event while Hint Letters is invalid keeps the last valid
     value in storage; no edit is saved until Hint Letters is fixed. */
  const onEdit = (event: Event) => {
    if (validate()) event.stopPropagation();
  };
  body.addEventListener("input", onEdit, true);
  body.addEventListener("change", onEdit, true);
  validate();
}

interface ValueContaienrElement extends HTMLElement {
  name: string;
  value: string;
}

function isValueContainer(element: unknown): element is ValueContaienrElement {
  return Boolean(
    element &&
    typeof element === "object" &&
    "name" in element &&
    "value" in element,
  );
}

function initRestoreButton(body: HTMLElement) {
  for (const element of body.querySelectorAll("[data-restore-target]")) {
    if (!(element instanceof HTMLElement)) continue;
    console.log("restore button: ", element);
    element.addEventListener("click", () => {
      (async () => {
        const targetSelector = element.dataset.restoreTarget;
        if (!targetSelector) return;
        const defaultSettingValues = await settings.defaults();
        for (const target of document.querySelectorAll<HTMLElement>(
          targetSelector,
        )) {
          console.log("restore: ", target);
          if (!isValueContainer(target)) {
            console.warn("unknown element: ", target);
          } else if (!(target as HTMLInputElement).name) {
            throw new Error("name is not specified");
          } else if (target.name in defaultSettingValues) {
            target.value = defaultSettingValues[target.name as keyof Settings];
            dispatchChangeEvent(target);
          } else {
            throw new Error(`unknown setting name: ${target.name}`);
          }
        }
      })().catch(printError);
    });
  }
}

/**
 * Sets the target input(s) selected by `data-valueset-target` to a value:
 *   - `data-valueset-default` (boolean): the input's default value, or
 *   - `data-valueset="<literal>"`: a fixed value (e.g. "" to disable a key).
 * The button is disabled while every target already holds that value, since
 * clicking it would be a no-op.
 */
function initValuesetButton(body: HTMLElement) {
  for (const element of body.querySelectorAll("[data-valueset-target]")) {
    if (!(element instanceof HTMLButtonElement)) continue;
    console.log("valueset button: ", element);
    const targetSelector = element.dataset.valuesetTarget;
    if (!targetSelector) continue;
    const literal = element.dataset.valueset ?? "";
    const valueFor = (target: HTMLInputElement) =>
      element.hasAttribute("data-valueset-default")
        ? target.defaultValue
        : literal;

    element.addEventListener("click", () => {
      for (const target of document.querySelectorAll<HTMLInputElement>(
        targetSelector,
      )) {
        console.log("valueset: ", target, valueFor(target));
        target.value = valueFor(target);
        dispatchChangeEvent(target);
      }
    });

    const syncDisabled = () => {
      const targets =
        document.querySelectorAll<HTMLInputElement>(targetSelector);
      element.disabled =
        targets.length > 0 &&
        [...targets].every((t) => t.value === valueFor(t));
    };
    body.addEventListener("input", syncDisabled);
    body.addEventListener("change", syncDisabled);
    syncDisabled();
  }
}

const knaviStorageUsageTemplate = document.querySelector<HTMLTemplateElement>(
  "#knavi-storage-usage-template",
)!;
if (!knaviStorageUsageTemplate) {
  throw new Error("knavi-storage-usage-template is not found");
}

interface AreaHandlerElement extends HTMLElement {
  name: string;
  areaHandler: unknown;
}

class KnaviStorageUsageElement extends HTMLElement {
  constructor() {
    super();
    const template = knaviStorageUsageTemplate.content.cloneNode(true);
    if (!(template instanceof DocumentFragment))
      throw new Error("unexpected template type");
    this.attachShadow({ mode: "open" });
    if (!this.shadowRoot) throw new Error("unexpected null");
    this.shadowRoot.appendChild(template);
  }

  connectedCallback() {
    const name = this.getAttribute("name");
    if (name) {
      if (!this.shadowRoot) throw new Error("unexpected null");
      for (const element of this.shadowRoot.querySelectorAll("*")) {
        if (!("areaHandler" in element)) continue;
        (element as AreaHandlerElement).name = name;
      }
    }
  }
}

function registerKnaviStorageUsage() {
  customElements.define("knavi-storage-usage", KnaviStorageUsageElement);
}

function dispatchChangeEvent(element: HTMLElement) {
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

init().catch(printError);
