import * as storageForm from "storage-form";
import * as keyInput from "key-input-elements";
import settings from "./lib/settings";
import { waitUntil } from "./lib/animations";
import { printError } from "./lib/errors";

async function init() {
  await waitUntil(() => Boolean(document.body));

  const body = document.body;
  await settings.init();

  storageForm.register();
  keyInput.register();
  registerKnaviStorageUsage();

  initClearButton(body);
  initRestoreButton(body);
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

init().catch(printError);
