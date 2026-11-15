- Fix hint letters reaching the page when typed right after the previous hint
  session ended, for example when re-activating Sticky Mode just after an
  action. While the extension was still finishing the previous session, the
  letters were treated as ordinary keystrokes. Hint letters typed in that
  window are now kept in the order typed and applied to the hints once they
  appear. A Cycle Key pressed that early does nothing, and an Action Key
  pressed or a held Magic Key released that early ends the session without
  running an action.
