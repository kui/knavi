- Fix textareas and other editable elements inside a clickable element, such
  as a `role=button` container, getting no hint of their own. They were
  folded into the container's Click hint, so hitting it clicked the
  container instead of focusing the field. They now get an Edit hint.
  Content of a rich text editor still follows the link around it.
