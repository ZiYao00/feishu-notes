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
12. Optional Explain material may be added under the article's `explain/` directory. Public deconstruction content is chapter-driven (`chapters/manifest.json` + separate Markdown source files); evidence, ASR, frames and legacy lesson drafts remain internal derived material. At render time, every ready chapter is composed in manifest order into one continuous Reader page with chapter-scoped unique ids, hash navigation and ScrollSpy. Desktop chapter navigation and the narrow-screen selector scroll the current page instead of loading chapter pages; legacy `?chapter=<id>` URLs redirect to the matching hash anchor. When a source report has a coherent analytical order, that order is the default public spine. `chapters.js` may render a small controlled semantic directive set (`hero`, `split`, `metrics`, `flow`, `compare`, `cards`, `case`, `takeaway`) where a real information relationship or media/Prompt reuse task warrants it; ordinary argument and long classifications remain prose, lists or light tables. Component selection follows `docs/EXPLAIN-WORKFLOW.md`. Explain remains optional and never becomes a dependency of the canonical archive.

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
- desktop tables use an AutoFit / Clamp layout contract based on the browser's measured rendered widths rather than semantic field names or fixed weights. When the measured natural table fits, it keeps that natural width; when it exceeds the Reader canvas, it fills the available width and compresses columns from preferred widths toward header-based minimums. Numeric / percent / status / media classification affects presentation only, not width. Tables with spans or a source colgroup use native auto layout, and narrow layouts convert rows into labeled record cards;
- the Original Reader has three presentation strategies selected from generic document structure only: long-form for prose-led articles, structured-report for multi-section reports with repeated tables/lists and short explanatory blocks, and dense-note for heading-dense or prompt-heavy research notes. Dense-note has priority when signals overlap; source block order and semantic heading tags remain unchanged in every mode;
- structured-report treats H2 as primary Smart TOC entries and H3/H4 as secondary entries available through the explicit all-items toggle. Its Reading Visual Grammar intentionally reduces decorative surfaces, table chrome, card effects and accent frequency so typography, spacing and alignment carry hierarchy, while AutoFit / Clamp, Splitter, media and narrow-screen record-card behavior remain shared;
- dense-note assigns visual heading roles (major / note / long), defaults TOC to major headings with an explicit all-items toggle, and upgrades long prompt-like code blocks into wrappable, collapsible Prompt Cards with full-copy actions;
- dense-note may visually group consecutive short note/text blocks into a Commentary Stream. The stream is a source-order presentation adapter, not a chat reconstruction: real major sections, media, code, tables and embeds break the run, and no absent speaker/time/reply semantics are invented;
- Explain/deconstruction chapters expose a controlled `case` directive for case metadata, tags and optional archive-local media. Prompt cases use one first-level Case container; the complete Prompt is enhanced and moved inside that Case without a second bordered card. Video-to-Prompt relationships remain unbound unless the source provides explicit evidence;
- image-only blocks and heading-attached media remain first-class content; empty-block detection cannot hide them. Embedded Feishu Sheets are virtualized Canvas UI, so capture first attempts authenticated clipboard HTML extraction into the existing table model, records extraction provenance in `archive.json`, and restores the prior clipboard; only failed extraction renders a visible fallback;
- heading anchors are based on stable block ids, so repeated heading text remains navigable;
- desktop TOC can resize or collapse; the splitter is hidden and the TOC becomes a drawer on narrower screens;
- collapsed desktop layout has two grid columns (collapsed TOC and content) because the hidden splitter no longer occupies a grid cell; the content must use the remaining width without unbounded height growth;
- Original Reader and Explain share the 60px section-gap token for independent blocks, while paragraph rhythm and nested Case/table spacing remain local; section wrappers and children must not duplicate the gap;
- Reader CSS provides restrained visual hierarchy for headings, lists, links, tables, quotes, inline/code blocks and media groups while keeping document structure unchanged;
- unknown/future blocks use a conservative text/media fallback rather than being dropped silently;
- archived article HTML remains portable and readable without the Viewer shell.

## Library and external note tools

`library/` is the single source of truth for saved notes. The project does not maintain an Obsidian copy or store an Obsidian path. Users may expose the same directory to an external note application using an operating-system directory link.

Browser Reader CSS is a project-local runtime concern and does not depend on Obsidian CSS. Optional machine-specific visual overrides may be placed at `data/styles/reader.user.css`; that file is ignored by Git and loads after the official Reader stylesheet.

## Viewer security

The viewer binds to loopback by default. Archived HTML is sanitized before it is written and is treated as inert content by the viewer. No source scripts are preserved. Local video is served with byte-range support for normal seeking.

## Windows service and portable delivery

`service.bat` is a small Windows PowerShell entry point. `scripts/service.ps1` manages only a listener whose command line belongs to this checkout's `src/cli.js serve`; an unrelated occupied port is never stopped. It reads host/port through `scripts/service-config.js` and the existing config loader, and passes the quoted entry path as one Start-Process argument string. Config changes require stopping the old configured listener before changing its port. `notes.bat` is the CLI entry point. Both prefer `runtime/node.exe` and fall back to system Node for source installations; neither changes the system PATH.

`src/config/runtime.js` checks the declared minimum Node version and requires direct dependencies to resolve inside this project's node_modules. Ancestor or global dependency fallback must not mask an incomplete installation. Viewer does not require Chrome; capture and browser verification require a separately installed Chrome.

`scripts/package-portable.ps1` exports a selected committed source tree through an artifact allowlist, verifies an official Windows x64 Node ZIP against the supplied official SHA-256, installs locked dependencies using that ZIP's npm and isolated configs/cache, and retains Node executable/LICENSE plus complete application dependency directories. Runtime npm and installation utilities are not shipped. Package installation scripts are disallowed pending review. The output ZIP contains empty data/library placeholders, per-file build hashes, and third-party license notices, never machine state or archived documents. Project code is UNLICENSED by the owner's decision; dependency licenses remain intact. An explicitly authorized prerelease may distribute the verified portable artifact with outstanding target-environment acceptance disclosed; stable-release readiness still requires that acceptance. Release tags and artifact build manifests must point to the same source commit.

Video GET supports one byte range including suffix ranges, bounds validation and 416 for unsatisfiable ranges; invalid or multiple ranges are ignored with a full 200 response. HEAD reports full resource headers without applying Range. This contract is covered by `verify:release`.
