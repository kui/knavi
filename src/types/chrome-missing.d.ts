// chrome.runtime.getFrameId was added in Chrome 106 but is missing from
// @types/chrome 0.1.43 (the latest available version).
declare namespace chrome.runtime {
  function getFrameId(target: WindowProxy): number;
}
