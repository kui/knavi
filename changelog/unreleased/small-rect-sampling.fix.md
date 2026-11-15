- Fix small links and buttons, 5 to 7 px wide or tall, sometimes getting no
  hint depending on where they were on the page, and links that showed only
  along their right or bottom edge, for example under a fixed banner,
  getting no hint. The visibility check sampled points on a fixed 4 px grid,
  which could miss such an element entirely. It now samples the element's
  centre first, then points spread across the element up to 1 px inside
  each edge.
