- Fix GitHub showing "Unable to render code block" for mermaid files while
  knavi was enabled. Every iframe sent its frame ID to its parent page with
  `postMessage`, and GitHub's mermaid preview fails on unexpected messages.
  Frames are now identified by their position in the frame tree, which each
  frame reports to the background when hinting starts. Only cross-origin
  iframes inside shadow roots, cross-origin iframes inside an iframe that is
  itself in a shadow root, and their descendants still receive a message
  from their parent, once each time hinting starts. Until hints have been
  shown once, the blur key can do nothing in such an iframe and in the
  iframes under it, and the blur indicator is not relayed to the parent. An
  iframe that gets its path from its parent gets no hints until the next
  time hinting starts if it, or its parent, loads after hinting has
  started. In an iframe inside a closed shadow root, the blur indicator is
  not relayed to the parent.
