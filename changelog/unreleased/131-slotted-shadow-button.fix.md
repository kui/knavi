- Fix no hint appearing on a shadow-DOM button whose content is only slotted
  light-DOM nodes, such as `<md-button>Label</md-button>`. The pointability
  check hit the slotted node, which `Node.contains()` does not see inside the
  shadow button. It now follows slot assignment. Controls inside closed shadow
  roots still get no hints.
