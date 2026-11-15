- Read settings and the blacklist directly from `chrome.storage` in content
  scripts instead of sending the background a settings or blacklist message
  on every page and iframe load and on every in-page navigation.
