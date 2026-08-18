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
- Deduplication of films imported from both services, matched on IMDb identifier
  where there is one and on title and year otherwise, so a film appears once.
- Filters by rating, watch date, genre, director, decade, runtime, rewatch,
  distance from the public rating, and a top-N limit, combining freely.
- Default S/A/B/C/D/F tiers, with a board that either starts pre-filled from your
  own ratings or starts empty for ranking by hand.
