// @flow

import sf from "storage-form";
import * as ki from "key-input-elements";
import CodeMirror from "codemirror";
import "codemirror/mode/css/css.js";
import settings from "./lib/settings";
import * as utils from "./lib/utils";

async function init() {
  initCodeMirror();

  sf.register();
  ki.register();

  initClearButton();
  initRevertButton();
}

async function initRevertButton() {
  const settingValues = await settings.loadDefaults();
  for (const e of document.body.getElementsByClassName("js-revert-button")) {
    console.log("revert button: ", e);
    e.addEventListener("click", (e: MouseEvent) => {
      if (!(e.target instanceof HTMLElement)) return false;
      const targetQuery = e.target.dataset["target"];
      if (!targetQuery) return false;
      const targets = document.querySelectorAll(targetQuery);
      for (const t of targets) {
        const name = (t: any).name;
        if (!name) continue;
        const defaultValue = (settingValues: any)[name];
        if (defaultValue == null) continue;
        (t: any).value = defaultValue;
      }
      return false;
    });
  }
}

function initClearButton() {
  for (const e of document.body.getElementsByClassName("js-clear-button")) {
    console.log("clear button: ", e);
    e.addEventListener("click", (e: MouseEvent) => {
      if (!(e.target instanceof HTMLElement)) return false;
      const targetQuery = e.target.dataset["target"];
      if (!targetQuery) return false;
      const targets = document.querySelectorAll(targetQuery);
      for (const t of targets) {
        if ("value" in t) (t: any).value = "";
      }
      return false;
    });
  }
}

async function initCodeMirror() {
  const form = document.querySelector("form[is=storage-form]");
  if (form == null) throw Error("form element not found");
  const t: HTMLTextAreaElement = (document.getElementsByName("css")[0]: any);
  await new Promise((resolve) => {
    const waitingInitSync = () => {
      if (t.value) {
        console.log("storage-form init sync");
        form.removeEventListener("storage-from-sync", waitingInitSync, false);
        resolve();
      }
    };
    form.addEventListener("storage-form-sync", waitingInitSync, false);
  });
  t.style.display = "none";

  const w =  document.getElementById("cm-wrapper");
  const cm = CodeMirror(w, { value: t.value });

  // for styling
  cm.on("focus", () => w.classList.add("focused"));
  cm.on("blur",  () => w.classList.remove("focused"));

  let cssValue = t.value;
  // two way data binding with textarea and codemirror
  cm.on("change", () => {
    const v = cm.getValue();
    if (v !== cssValue) t.value = cssValue = v;
  });
  (async () => {
    while (true) {
      await utils.nextAnimationFrame();
      if (cssValue !== t.value) cm.setValue(cssValue = t.value);
    }
  })();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
