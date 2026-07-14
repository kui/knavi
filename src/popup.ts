import settingsClient from "./lib/settings-client";
import { BlackList, parsePatterns } from "./lib/blacklist";
import { printError } from "./lib/errors";

interface PopupUI {
  statusEl: HTMLElement;
  siteButton: HTMLButtonElement;
  urlButton: HTMLButtonElement;
  siteLabel: HTMLElement;
  urlLabel: HTMLElement;
  reloadButton: HTMLButtonElement;
}

function updateButtonState(
  button: HTMLButtonElement,
  label: string,
  isPresent: boolean,
) {
  const labelEl = button.querySelector(".btn-label");
  if (!labelEl) throw new Error("button is missing its .btn-label element");
  if (isPresent) {
    labelEl.textContent = `Remove ${label} from blacklist`;
    button.classList.add("is-removed");
  } else {
    labelEl.textContent = `Blacklist ${label}`;
    button.classList.remove("is-removed");
  }
}

function refreshStatus(
  ui: PopupUI,
  blackListRaw: string,
  url: URL,
  sitePattern: string,
  urlPattern: string,
) {
  const blackList = new BlackList(blackListRaw);
  const patterns = parsePatterns(blackListRaw);

  updateButtonState(ui.siteButton, "site", patterns.includes(sitePattern));
  updateButtonState(ui.urlButton, "URL", patterns.includes(urlPattern));

  const matches = blackList.match(url.toString());
  if (matches.length > 0) {
    const matchedByButtonPattern =
      matches.includes(sitePattern) || matches.includes(urlPattern);
    ui.statusEl.textContent = matchedByButtonPattern
      ? "Disabled (blacklisted)"
      : `Disabled (matched: ${matches[0]})`;
    ui.statusEl.className = "status disabled";
  } else {
    ui.statusEl.textContent = "Enabled";
    ui.statusEl.className = "status enabled";
  }
}

async function init() {
  const ui = initUI();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url: URL;
  try {
    url = new URL(tab?.url ?? tab?.pendingUrl ?? "");
  } catch {
    showInvalidPage(ui);
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    showInvalidPage(ui);
    return;
  }

  /**
   * WHY: The popup always uses these canonical pattern forms. A user may have
   * blacklisted the same page in a different shape via the options page, in
   * which case the toggle here adds a separate line rather than reusing it.
   */
  const sitePattern = `${url.origin}/*`;
  const urlPattern = `${url.origin}${url.pathname}*`;

  ui.siteLabel.textContent = sitePattern;
  ui.urlLabel.textContent = urlPattern;

  const blackListRaw =
    (await settingsClient.get(["blackList"])).blackList ?? "";
  refreshStatus(ui, blackListRaw, url, sitePattern, urlPattern);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" && area !== "local") return;
    if (!("blackList" in changes)) return;
    const newValue = (changes.blackList.newValue as string) ?? "";
    refreshStatus(ui, newValue, url, sitePattern, urlPattern);
  });

  ui.siteButton.addEventListener("click", () => {
    void togglePattern(sitePattern, ui, tab.id);
  });
  ui.urlButton.addEventListener("click", () => {
    void togglePattern(urlPattern, ui, tab.id);
  });
  ui.reloadButton.addEventListener("click", () => {
    if (tab.id != null) {
      chrome.tabs.reload(tab.id, () => window.close());
    } else {
      window.close();
    }
  });
}

function initUI(): PopupUI {
  const statusEl = document.getElementById("status");
  const siteButton = document.getElementById("blacklist-site");
  const urlButton = document.getElementById("blacklist-url");
  const siteLabel = document.getElementById("site-pattern");
  const urlLabel = document.getElementById("url-pattern");
  const reloadButton = document.getElementById("reload");
  if (
    !(statusEl instanceof HTMLElement) ||
    !(siteButton instanceof HTMLButtonElement) ||
    !(urlButton instanceof HTMLButtonElement) ||
    !(siteLabel instanceof HTMLElement) ||
    !(urlLabel instanceof HTMLElement) ||
    !(reloadButton instanceof HTMLButtonElement)
  ) {
    throw new Error("popup.html is missing expected elements");
  }
  return { statusEl, siteButton, urlButton, siteLabel, urlLabel, reloadButton };
}

function showInvalidPage(ui: PopupUI) {
  ui.statusEl.textContent = "Not available on this page";
  ui.statusEl.className = "status disabled";
  ui.siteButton.disabled = true;
  ui.urlButton.disabled = true;
  ui.siteLabel.textContent = "";
  ui.urlLabel.textContent = "";
}

async function togglePattern(
  pattern: string,
  ui: PopupUI,
  tabId: number | undefined,
) {
  ui.siteButton.disabled = true;
  ui.urlButton.disabled = true;
  try {
    await settingsClient.toggleBlacklist(pattern);
    if (tabId != null) ui.reloadButton.hidden = false;
  } catch (e) {
    printError(e);
    ui.statusEl.textContent = "Failed to update blacklist";
    ui.statusEl.className = "status error";
  } finally {
    ui.siteButton.disabled = false;
    ui.urlButton.disabled = false;
  }
}

init().catch(printError);
