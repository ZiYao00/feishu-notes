# Architecture

## Product boundary

`feishu-notes` is a local Feishu archive and reader. Obsidian is not a runtime dependency. The offline library uses portable Markdown and local assets so it can be consumed by the built-in viewer, Obsidian, Typora, VS Code, or ordinary file tools.

## Pipeline

1. Browser/Profile Manager launches or reconnects to a named Chrome profile.
2. Feishu Scanner performs a fresh navigation of the target URL inside that authenticated profile.
3. The scanner walks Feishu's virtualized document repeatedly until the stable block set stops growing.
4. Blocks are collected by `data-block-id` and hierarchy rather than global text deduplication.
5. Media Inventory probes size/type without bulk download, records media dimensions/context, and ignores expired UI-only Blob resources.
6. Media Policy checks configurable soft limits.
7. Archive Writer downloads approved media, calculates SHA-256 content hashes, and deduplicates physical assets inside each article while preserving every logical media occurrence.
8. Canonical media assets use content-addressed paths such as `assets/videos/sha256-<hash>.mp4`; Markdown/HTML references are rewritten only after the canonical asset is available.
9. Markdown, adaptive sanitized HTML and manifest v2 `archive.json` are written under one folder in `library/`.
10. Viewer wraps archived article HTML in a Reader Shell with TOC, responsive layout, media-context rendering and local lightbox behavior.
11. Viewer reads `library/` only; it does not require Feishu after an archive is complete.
12. Optional Explain material may be added under the article's `explain/` directory. Public learning content is chapter-driven (`chapters/manifest.json` + Markdown); evidence, ASR, frames and legacy lesson drafts remain internal derived material. When a source report has a coherent analytical order, that order is the default public learning spine. `chapters.js` may render a small controlled semantic directive set (`hero`, `split`, `metrics`, `flow`, `compare`, `cards`, `takeaway`) so different information relationships do not collapse into one vertical prose stream. The Viewer exposes a single chapter Reader and never makes Explain a dependency of the canonical archive.

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

## Media identity and deduplication

The archive distinguishes **logical media occurrences** from **physical assets**:

- each Feishu media occurrence keeps its source media id, source URL, block/context relationship and dimensions;
- physical files are identified by SHA-256 content, not by Feishu media id or URL;
- multiple logical occurrences may point to the same canonical physical file;
- deduplication is intentionally scoped to one article directory. There is no global cross-article media pool in V1, so an article remains self-contained and independently movable/deletable;
- cleanup of legacy/non-canonical media happens only after the new article HTML, Markdown and manifest are written successfully.

Manifest v2 records logical/physical counts, logical bytes, physical bytes and deduplicated bytes.

## Adaptive Reader

The Reader is one stable shell with context-aware block rendering rather than one fixed-size article template:

- desktop layout is left-anchored: the TOC sits near the page edge and a keyboard-accessible vertical splitter separates navigation from content;
- the splitter controls TOC width (with local persistence and double-click reset); the remaining viewport width defines the available Reader canvas;
- prose and headings use an adaptive reading measure (about 880–960px on desktop rather than the old hard-coded 760px), while wide tables/media may break out into the remaining Reader canvas; both layers share one left alignment baseline;
- the former full white-paper surface is intentionally removed; visual hierarchy is created by local reading-enhancement components rather than one giant card;
- standalone videos preserve source aspect ratio and are bounded by viewport height;
- multiple media items may form a grid only inside the same source media block; media is never regrouped across block boundaries;
- table-cell videos use a minimal icon/pill launcher and table-cell images use a small thumbnail launcher, while standalone videos also become explicit media triggers; all Reader media opens in one reusable transparent Media Dialog, and video activation starts playback;
- standalone local images are size-bounded and open in the same dialog; Escape or a blank-stage click closes it and focus returns to the opener;
- desktop tables use compact / standard / wide width modes driven by column type plus estimated natural content width: short low-density tables have no arbitrary minimum width, normal tables use a bounded content-derived width, and only genuinely wide/complex tables use the available Reader canvas; media presence alone does not force wide mode. Content-aware column weighting and wrapping prevent horizontal scrolling, while narrow layouts convert rows into labeled record cards;
- the Original Reader has two presentation strategies selected from generic document structure only: long-form for report/article documents and dense-note for heading-dense or prompt-heavy research notes; source block order and semantic heading tags remain unchanged in both modes;
- dense-note assigns visual heading roles (major / note / long), defaults TOC to major headings with an explicit all-items toggle, and upgrades long prompt-like code blocks into wrappable, collapsible Prompt Cards with full-copy actions;
- dense-note may visually group consecutive short note/text blocks into a Commentary Stream. The stream is a source-order presentation adapter, not a chat reconstruction: real major sections, media, code, tables and embeds break the run, and no absent speaker/time/reply semantics are invented;
- Explain chapters expose a controlled `case` directive for case metadata, tags and optional archive-local media. Video-to-Prompt relationships remain unbound unless the source provides explicit evidence;
- image-only blocks and heading-attached media remain first-class content; empty-block detection cannot hide them. Embedded Feishu Sheets without extracted cell data render a visible offline fallback instead of an inert source-page shell;
- heading anchors are based on stable block ids, so repeated heading text remains navigable;
- desktop TOC can resize or collapse; the splitter is hidden and the TOC becomes a drawer on narrower screens;
- Reader CSS provides restrained visual hierarchy for headings, lists, links, tables, quotes, inline/code blocks and media groups while keeping document structure unchanged;
- unknown/future blocks use a conservative text/media fallback rather than being dropped silently;
- archived article HTML remains portable and readable without the Viewer shell.

## Library and external note tools

`library/` is the single source of truth for saved notes. The project does not maintain an Obsidian copy or store an Obsidian path. Users may expose the same directory to an external note application using an operating-system directory link.

Browser Reader CSS is a project-local runtime concern and does not depend on Obsidian CSS. Optional machine-specific visual overrides may be placed at `data/styles/reader.user.css`; that file is ignored by Git and loads after the official Reader stylesheet.

## Viewer security

The viewer binds to loopback by default. Archived HTML is sanitized before it is written and is treated as inert content by the viewer. No source scripts are preserved. Local video is served with byte-range support for normal seeking.
