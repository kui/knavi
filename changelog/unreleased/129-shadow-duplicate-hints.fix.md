- Fix two or more hints appearing at the same spot for one control on pages
  built from shadow-DOM components, such as Reddit. An element inside a
  shadow tree now targets the link or button that hosts it, and a hint for
  an element that only looks clickable (`cursor: pointer`) is dropped when a
  real control, or a nested pointer element, covers exactly the same area.
