# Architecture

## Product boundary

`feishu-notes` is a local Feishu archive and reader. Obsidian is not a runtime dependency. The offline library uses portable Markdown and local assets so it can be consumed by the built-in viewer, Obsidian, Typora, VS Code, or ordinary file tools.

## Pipeline

1. Browser/Profile Manager launches or reconnects to a named Chrome profile.
2. Feishu Scanner performs a fresh navigation of the target URL inside that authenticated profile.
3. The scanner walks Feishu's virtualized document repeatedly until the stable block set stops growing.
4. Blocks are collected by `data-block-id` and hierarchy rather than global text deduplication.
5. Media Inventory probes size/type without bulk download and ignores expired UI-only Blob resources.
6. Media Policy checks configurable soft limits.
7. Archive Writer downloads approved media and rewrites remote references to local relative paths.
8. Markdown, sanitized HTML and `archive.json` are written under one folder in `library/`.
9. Viewer reads `library/` only; it does not require Feishu after an archive is complete.

## Runtime data

All runtime data remains under the project root but outside Git:

- named account/browser profiles;
- cache/temp/logs/state;
- offline library;
- local configuration and secrets.

Tracked source/configuration must not contain machine-specific absolute paths, cookies, tokens, credentials, or document-specific test URLs.

## Browser profile lifecycle

A named account profile is a Chrome user-data directory under `data/profiles/`. It owns the login/session state for that account. A small runtime record stores the last CDP endpoint so a still-running dedicated Chrome instance can be reused.

Authentication state and browser cache are different classes of data:

- session state such as Cookies, Local Storage, IndexedDB and Network state is preserved;
- rebuildable Cache, Code Cache, Service Worker CacheStorage and selected Chrome component caches may be cleaned.

Ordinary disk/media caches are launched with configurable size limits. Service Worker cache may still grow, so the CLI warns when a profile crosses the configured size threshold and exposes an explicit `cleanup --profile` maintenance command. Cleanup refuses to run while that profile's Chrome endpoint is active.

## Offline completeness

Every archive has an explicit state:

- `complete`: all requested media is local;
- `partial`: one or more media objects were skipped or failed;
- `pending_confirmation`: media download was stopped by a soft limit before bulk transfer.

Skipped media is never silent. `archive.json` records the reason and source URL. If a previously complete archive later encounters a preflight warning, the complete archive is preserved and the new preflight is written separately instead of downgrading the archive.

## Multi-account model

One named account profile maps to one Chrome user-data directory. The CLI accepts a profile name. Automatic cross-profile discovery is intentionally deferred; it can be added later without changing the archive format.

## Library and external note tools

`library/` is the single source of truth for saved notes. The project does not maintain an Obsidian copy or store an Obsidian path. Users may expose the same directory to an external note application using an operating-system directory link.

## Viewer security

The viewer binds to loopback by default. Archived HTML is sanitized before it is written and is treated as inert content by the viewer. No source scripts are preserved. Local video is served with byte-range support for normal seeking.
