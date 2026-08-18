# Security Policy

## Reporting a vulnerability

Please report security issues through GitHub's private vulnerability reporting
(the Security tab of this repository) rather than in a public issue.

## Scope

Cinetier runs entirely in the browser and has no backend. It stores your film
library locally and sends only a title, year, or IMDb identifier to TMDB in
order to fetch posters.

The TMDB API key present in the built JavaScript is intentional, not a leak: a
client-side application has no server in which to hide it. It is a read-only,
rate-limited key. Reports about its visibility will be closed as by design.
