import * as storageForm from "storage-form";
import * as keyInput from "key-input-elements";
import settings from "./lib/settings";
import { keyCodeToChars } from "./lib/key-chars";
import { waitUntil } from "./dom/animations";
import { printError } from "./lib/errors";

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

const KEY_LABELS: Record<string, string> = {
  magicKey: "Peek Key",
  stickyKey: "Sticky Key",
  blurKey: "Blur Key",
  actionKey: "Action Key",
  cancelKey: "Cancel Key",
  hints: "Hint Letters",
};

// Key-pattern pairs that must not be bound to the same key.
//
// Keys are split by the phase in which they fire:
//   - while NOT hinting: Magic Key, Sticky Key, Blur Key
//   - while hinting:     Action Key, Cancel Key, hint letters
//     (the Magic Key is also held throughout a hold session, so it overlaps
//      the hinting phase too)
// Keys that only ever fire in different phases can safely share a binding.
// Hence Blur Key may share with Action/Cancel/hints, and Sticky Key may share
// with Action/Cancel/hints.
const KEY_PAIR_CONFLICTS: [string, string][] = [
  ["magicKey", "stickyKey"],
  ["magicKey", "blurKey"],
  ["magicKey", "actionKey"],
  ["magicKey", "cancelKey"],
  ["stickyKey", "blurKey"],
  ["actionKey", "cancelKey"],
];

// Key patterns that must not coincide with a hint letter: only keys that fire
// during the hinting phase. (Sticky Key and Blur Key fire only while not
// hinting, so they are excluded.)
const HINTS_VS_KEYS = ["magicKey", "actionKey", "cancelKey"];

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

// Sets the target input(s) selected by `data-valueset-target` to a value:
//   - `data-valueset-default` (boolean): the input's default value, or
//   - `data-valueset="<literal>"`: a fixed value (e.g. "" to disable a key).
// The button is disabled while every target already holds that value, since
// clicking it would be a no-op.
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
