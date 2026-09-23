# Separate the local processing runtime from the static viewer

Claim Ledger will call Jev and process real artifacts only in a local Node runtime; GitHub Pages
will render exported synthetic or explicitly selected manifests without provider credentials.
This adds a build/export step, but avoids exposing API keys and sensitive source text in a
browser-only deployment while preserving a shareable demonstration.
