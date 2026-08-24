# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project scaffold, continuous integration, and GitHub Pages deployment.
- Import of an IMDb `ratings.csv` and of the `diary`, `ratings`, and `watched`
  files of a Letterboxd export, merged into a single film library.
- Ratings normalized across IMDb's ten-point scale and Letterboxd's half stars,
  so both sources rank on one scale and still read back in their own.
- Deduplication of films imported from both services, matched on a shared IMDb
  identifier or a shared TMDB identifier where there is one, and on title and
  year otherwise, so a film appears once.
- Filters by rating, watch date, genre, director, decade, runtime, rewatch,
  distance from the public rating, and a top-N limit, combining freely.
- Default S/A/B/C/D/F tiers, with a board that either starts pre-filled from your
  own ratings or starts empty for ranking by hand.
- Import screen: drop an IMDb `ratings.csv` or a Letterboxd export `.zip` and see your library.
- Posters and public ratings from TMDB, filled in progressively and cached locally.
- The imported library is remembered between visits.
- A filter rail over the whole library: rating, era, type, genre, director,
  runtime, watch dates, rewatches and a top-N limit, each section showing how
  many titles it admits on its own, with the active filters as removable chips
  and a screen that names the criterion doing the cutting when nothing matches.
- Genres, directors and runtimes fetched from TMDB after posters, so a
  Letterboxd import filters on the same axes an IMDb one does.
- The active filters are remembered between visits, in the browser.
- A tier board: rows of ranked films, drag and drop, undo and redo, and a pool
  built from the filtered library. Keyboard operation — space to lift, arrows
  to move, space to drop — has been driven end to end in a browser, and its
  screen-reader announcements are tested.
- The pool stays pinned to the bottom of the screen while the rows scroll past
  it, so a row and the pool are always in view together and a film can be
  dragged from one to the other.
- Pre-filling the board from imported ratings, with editable thresholds and a
  count of what each one would place shown before it happens.
- Rows can be renamed, recoloured, added, removed and reordered. Removing a row
  returns its films to the pool rather than deleting them.
- The board is remembered between visits, in the browser.
- Saving the board as a PNG: rows, row colours, posters and the board's name,
  cropped to the width its longest row actually uses, drawn in whichever theme
  is on screen. Films whose poster never arrived keep their title, as they do
  on the board. The cards shrink to keep the image inside what a browser will
  allocate, so a ranking of any size produces a file.
