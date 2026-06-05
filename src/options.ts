import * as storageForm from "storage-form";
import * as keyInput from "key-input-elements";
import settings from "./lib/settings.ts";
import { keyCodeToChars } from "./lib/key-chars.ts";
import { waitUntil } from "./dom/animations.ts";
import { printError } from "./lib/errors.ts";

async function init() {
  await waitUntil(() => Boolean(document.body));

  const body = document.body;
  await settings.init();

  storageForm.register();
  keyInput.register();
  registerKnaviStorageUsage();

  initClearButton(body);
  initRestoreButton(body);
  initValuesetButton(body);
  initKeyConflictValidation(body);
}

const KEY_LABELS: Record<string, string> = {
  magicKey: "Magic Key",
  stickyKey: "Sticky Key",
  blurKey: "Blur Key",
  actionKey: "Action Key",
  cancelKey: "Cancel Key",
  hints: "Hint Letters",
};

// Key-pattern pairs that must not be bound to the same key.
// Sticky Key is intentionally allowed to share a key with Action/Cancel/hints
// since it is released before the hinting input phase begins.
const KEY_PAIR_CONFLICTS: [string, string][] = [
  ["magicKey", "stickyKey"],
  ["magicKey", "blurKey"],
  ["magicKey", "actionKey"],
  ["magicKey", "cancelKey"],
  ["stickyKey", "blurKey"],
  ["blurKey", "actionKey"],
  ["blurKey", "cancelKey"],
  ["actionKey", "cancelKey"],
];

// Key patterns that must not coincide with a hint letter. (Sticky Key excluded.)
const HINTS_VS_KEYS = ["magicKey", "blurKey", "actionKey", "cancelKey"];

// Normalize a key-input pattern string (e.g. "Ctrl + KeyA") for comparison.
function normalizeKeyPattern(value: string): string {
  return value
    .split("+")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(" + ");
}

// Return the hint letter that a bare single-key pattern (no modifiers/history)
// would type, or null. Covers letters, digits, and punctuation across common
// keyboard layouts via `keyCodeToChars`.
function conflictingHintChar(value: string, hints: string): string | null {
  const n = normalizeKeyPattern(value);
  if (n === "" || n.includes(" + ")) return null;
  return keyCodeToChars(n).find((c) => hints.includes(c.toLowerCase())) ?? null;
}

function computeKeyConflicts(values: Record<string, string>): {
  messages: string[];
  invalid: Set<string>;
} {
  const messages: string[] = [];
  const invalid = new Set<string>();

  for (const [a, b] of KEY_PAIR_CONFLICTS) {
    const va = normalizeKeyPattern(values[a] ?? "");
    const vb = normalizeKeyPattern(values[b] ?? "");
    if (va !== "" && va === vb) {
      messages.push(
        `${KEY_LABELS[a]} and ${KEY_LABELS[b]} are both bound to "${va}".`,
      );
      invalid.add(a);
      invalid.add(b);
    }
  }

  const hints = (values.hints ?? "").toLowerCase();
  for (const name of HINTS_VS_KEYS) {
    const ch = conflictingHintChar(values[name] ?? "", hints);
    if (ch) {
      messages.push(`${KEY_LABELS[name]} ("${ch}") is also a Hint Letter.`);
      invalid.add(name);
      invalid.add("hints");
    }
  }

  return { messages, invalid };
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
    const { messages, invalid } = computeKeyConflicts(values);

    for (const [name, el] of inputs) {
      el.setCustomValidity(
        invalid.has(name) ? "This key conflicts with another setting." : "",
      );
    }

    if (!summary) return;
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

  body.addEventListener("input", validate);
  body.addEventListener("change", validate);
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

function initClearButton(body: HTMLElement) {
  for (const element of body.querySelectorAll("[data-clear-target]")) {
    if (!(element instanceof HTMLElement)) continue;
    console.log("clear button: ", element);
    element.addEventListener("click", () => {
      const targetSelector = element.dataset.clearTarget;
      if (!targetSelector) return;
      for (const target of document.querySelectorAll(targetSelector)) {
        console.log("clear: ", target);
        (target as HTMLInputElement).value =
          (target as HTMLInputElement).defaultValue ?? "";
        dispatchChangeEvent(target as HTMLElement);
      }
    });
  }
}

// Sets the target input to a fixed value from `data-valueset`.
// Unlike the clear button (which resets to the input's defaultValue), this can
// force an empty value to disable a key such as the Magic Key.
function initValuesetButton(body: HTMLElement) {
  for (const element of body.querySelectorAll("[data-valueset-target]")) {
    if (!(element instanceof HTMLElement)) continue;
    console.log("valueset button: ", element);
    element.addEventListener("click", () => {
      const targetSelector = element.dataset.valuesetTarget;
      if (!targetSelector) return;
      const value = element.dataset.valueset ?? "";
      for (const target of document.querySelectorAll(targetSelector)) {
        console.log("valueset: ", target, value);
        (target as HTMLInputElement).value = value;
        dispatchChangeEvent(target as HTMLElement);
      }
    });
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
