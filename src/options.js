import sf from "storage-form";
import * as ki from "key-input-elements";
import settings from "./lib/settings.ts";
import { waitUntil } from "./lib/animations.ts";

async function init() {
  waitUntil(() => document.body);
  const body = document.body;
  await settings.init();

  sf.default.register();
  ki.register();

  initClearButton(body);
  initRestoreButton(body);
  initBytesDisplay();
}

async function initRestoreButton(body) {
  for (const element of body.querySelectorAll("[data-restore-target]")) {
    console.log("restore button: ", element);
    element.addEventListener("click", async () => {
      const settingValues = await settings.defaults();
      for (const target of document.querySelectorAll(
        element.dataset.restoreTarget,
      )) {
        console.log("restore: ", target);
        if (!target.name) {
          throw new Error("name is not specified");
        } else if (target.name in settingValues) {
          target.value = settingValues[target.name];
        } else {
          throw new Error(`unknown setting name: ${target.name}`);
        }
      }
    });
  }
}

function initClearButton(body) {
  for (const element of body.querySelectorAll("[data-clear-target]")) {
    console.log("clear button: ", element);
    element.addEventListener("click", () => {
      for (const target of document.querySelectorAll(
        element.dataset.clearTarget,
      )) {
        console.log("clear: ", target);
        if ("value" in target) target.value = "";
      }
    });
  }
}

async function initBytesDisplay() {
  for (const bytesDisplay of document.querySelectorAll(".js-bytes-display")) {
    const itemName = bytesDisplay.dataset.name;
    if (!itemName) continue;

    const update = async () => {
      const storage = await settings.init();
      bytesDisplay.textContent = new Intl.NumberFormat("en").format(
        await storage.getBytes(itemName),
      );
    };
    update();
    chrome.storage.onChanged.addListener(() => update());
  }

  for (const bytesMaxDisplay of document.querySelectorAll(
    ".js-bytes-max-display",
  )) {
    const update = async () => {
      bytesMaxDisplay.textContent = new Intl.NumberFormat("en").format(
        await settings.quotaBytesPerItem(),
      );
    };
    update();
    chrome.storage.onChanged.addListener(() => update());
  }

  for (const bytesPercentDisplay of document.querySelectorAll(
    ".js-bytes-percent-display",
  )) {
    const itemName = bytesPercentDisplay.dataset.name;
    if (!itemName) continue;

    const update = async () => {
      const storage = await settings.init();
      const bytes = await storage.getBytes(itemName);
      const max = await settings.quotaBytesPerItem();
      const ratio = bytes / max;
      const formater = new Intl.NumberFormat("en", { style: "percent" });
      bytesPercentDisplay.textContent = formater.format(ratio);
      styleStorageLimit(bytesPercentDisplay.parentElement, ratio);
    };
    update();
    chrome.storage.onChanged.addListener(() => update());
  }

  for (const bytesDisplay of document.querySelectorAll(
    ".js-total-bytes-display",
  )) {
    const update = async () => {
      const storage = await settings.init();
      bytesDisplay.textContent = new Intl.NumberFormat("en").format(
        await storage.getTotalBytes(),
      );
    };
    update();
    chrome.storage.onChanged.addListener(() => update());
  }

  for (const bytesMaxDisplay of document.querySelectorAll(
    ".js-total-bytes-max-display",
  )) {
    const update = async () => {
      bytesMaxDisplay.textContent = new Intl.NumberFormat("en").format(
        await settings.quotaTotalBytes(),
      );
    };
    update();
    chrome.storage.onChanged.addListener(() => update());
  }

  for (const bytesPercentDisplay of document.querySelectorAll(
    ".js-total-bytes-percent-display",
  )) {
    const update = async () => {
      const storage = await settings.init();
      const bytes = await storage.getTotalBytes();
      const max = await settings.quotaTotalBytes();
      const ratio = bytes / max;
      const formater = new Intl.NumberFormat("en", { style: "percent" });
      bytesPercentDisplay.textContent = formater.format(ratio);
      styleStorageLimit(bytesPercentDisplay.parentElement, ratio);
    };
    update();
    chrome.storage.onChanged.addListener(() => update());
  }
}

function styleStorageLimit(element, ratio) {
  if (!element) return;
  if (ratio > 0.9) {
    element.classList.add("storage-limit");
  } else {
    element.classList.remove("storage-limit");
  }
}

init();
