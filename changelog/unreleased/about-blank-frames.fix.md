- Fix no hints appearing inside iframes that have no URL of their own, such
  as the Hatena Bookmark button. The page writes their content into a
  src-less `about:blank` frame, which the content script was not injected
  into, so only the "Focus iframe" hint appeared. The content script now
  also runs in `about:blank`, `srcdoc`, `data:` and `blob:` frames.
