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
      const targetQuery = element.dataset.restoreTarget;
      const settingValues = settings.defaults();
      if (!targetQuery) throw new Error("data-restore-target is not specified");
      for (const target of document.querySelectorAll(targetQuery)) {
        console.log("restore: ", target);
        if (!target.name) throw new Error("name is not specified");
        const defaultValue = settingValues[target.name];
        if (defaultValue == null) throw new Error("default value is not found");
        target.value = defaultValue;
      }
    });
  }
}

function initClearButton(body) {
  for (const element of body.querySelectorAll("[data-clear-target]")) {
    console.log("clear button: ", element);
    element.addEventListener("click", () => {
      const targetQuery = element.dataset.clearTarget;
      if (!targetQuery) throw new Error("data-clear-target is not specified");
      for (const target of document.querySelectorAll(targetQuery)) {
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
      bytesDisplay.textContent = new Intl.NumberFormat("en").format(
        await getBytesInUse(itemName),
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
        await getMaxBytesPerItem(),
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
      const bytes = await getBytesInUse(itemName);
      const max = await getMaxBytesPerItem();
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
      bytesDisplay.textContent = new Intl.NumberFormat("en").format(
        await settings.getTotalBytesInUse(),
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
        await getMaxBytes(),
      );
    };
    update();
    chrome.storage.onChanged.addListener(() => update());
  }

  for (const bytesPercentDisplay of document.querySelectorAll(
    ".js-total-bytes-percent-display",
  )) {
    const update = async () => {
      const bytes = await settings.getTotalBytesInUse();
      const max = await getMaxBytesPerItem();
      const ratio = bytes / max;
      const formater = new Intl.NumberFormat("en", { style: "percent" });
      bytesPercentDisplay.textContent = formater.format(ratio);
      styleStorageLimit(bytesPercentDisplay.parentElement, ratio);
    };
    update();
    chrome.storage.onChanged.addListener(() => update());
  }
}

async function getMaxBytesPerItem() {
  return (await settings.isLocal())
    ? chrome.storage.local.QUOTA_BYTES
    : chrome.storage.sync.QUOTA_BYTES_PER_ITEM;
}

async function getMaxBytes() {
  return (await settings.isLocal())
    ? chrome.storage.local.QUOTA_BYTES
    : chrome.storage.sync.QUOTA_BYTES;
}

async function getBytesInUse(name) {
  return (await settings.isLocal())
    ? settings.getTotalBytesInUse()
    : settings.getBytesInUse(name);
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
