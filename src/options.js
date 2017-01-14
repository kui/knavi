// @flow
import se from "storage-element";
import * as ki from "key-input-elements";
import CodeMirror from "codemirror";
import "codemirror/mode/css/css.js";

se.register();
ki.register();

function init() {
  for (const e of document.body.getElementsByClassName("js-clear-button")) {
    console.log("clear button: ", e);
    e.addEventListener("click", (e: MouseEvent) => {
      if (!(e.target instanceof HTMLElement)) return true;
      const targetQuery = e.target.dataset["target"];
      if (!targetQuery) return true;
      const targets = document.querySelectorAll(targetQuery);
      for (const t of targets) {
        if ("value" in t) (t: any).value = "";
      }
    });
  }

  initCodeMirror();
}

function initCodeMirror() {
  const t: HTMLTextAreaElement = (document.getElementsByName("css")[0]: any);
  t.style.display = "none";
  const w =  document.getElementById("cm-wrapper");
  CodeMirror(w, {
    value: t.value,
    onChange: (e) => t.textContent = e.getValue(),
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
