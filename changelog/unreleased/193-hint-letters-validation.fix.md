- Fix the options page saving Hint Letters that cannot label hints. An empty
  value made the Peek Key do nothing; a single letter, a repeated letter,
  whitespace or a non-BMP character gave hints that cannot be selected. They
  are now reported as invalid and not saved
  ([#193](https://github.com/kui/knavi/issues/193)).
