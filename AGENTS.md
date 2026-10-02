# feishu-notes Agent Rules

## Start here

Before modifying this project, read in this order:

1. `AGENTS.md`
2. `docs/PROJECT-HANDBOOK.md`
3. `docs/ARCHITECTURE.md`
4. `README.md`

Then check `git status` and preserve unrelated/uncommitted work.

## Product contract

- `feishu-notes` is a local Feishu document archiver and offline reader.
- It operates on content the selected signed-in account is already authorized to read.
- `library/` is the single source of truth for saved notes.
- The built-in Viewer must work from local archives without requiring Feishu login/network after an archive is complete.
- Obsidian and other note applications are optional external consumers, never runtime dependencies.

## Repository and data rules

- Keep the project self-contained: source, runtime state, account profiles, cache, logs, and offline library live under the project root.
- Never hard-code user-specific absolute paths, Obsidian paths, private document URLs, cookies, tokens, passwords, or API keys in tracked files.
- Track templates/defaults only.
- Local machine configuration, secrets, browser profiles, runtime state, cache, logs, and archived note content must remain Git-ignored.
- Do not commit/push unless explicitly authorized.

## Browser/Profile rules

- One named account profile maps to one Chrome user-data directory under `data/profiles/`.
- Do not manually export browser cookies as the primary login mechanism.
- Never copy, move, clean, or mutate an active Chrome profile while that profile Chrome is running.
- Reuse a valid existing CDP endpoint when available; launch a new dedicated Chrome only when needed.
- Browser cache cleanup must use only the explicit allowlist in `src/browser/profile-maintenance.js`.
- Cleanup must refuse an active profile and must not touch authentication/session stores such as Cookies, Local Storage, IndexedDB, or Network state.

## Feishu scanner rules

- Feishu documents are virtualized/lazy-loaded; one viewport or one bottom-scroll is not sufficient evidence of completeness.
- Scan repeatedly until the stable Block set stops growing.
- Identify document structure using stable block identity/hierarchy (for example `data-block-id`), not global text deduplication.
- Do not treat Feishu player UI, transient Blob previews, controls, or cover artifacts as authoritative document media.
- Preserve repeated legitimate document content; never deduplicate by visible text string globally.

## Media/archive rules

- Scan first, build a media inventory, then download.
- Large/unknown media must be gated by configurable soft limits.
- Never silently skip media and still report the archive as complete.
- Record failed/skipped media explicitly in `archive.json`.
- A previously `complete` archive must not be downgraded just because a later preflight needs confirmation.
- Complete archives must use local relative media paths and should not depend on Feishu CDN/blob URLs.
- Media content deduplication is per-article and SHA-256 based. Never deduplicate solely by file size, filename, source URL, or Feishu media id.
- Physical deduplication must preserve every logical media occurrence in the article. Multiple logical entries may intentionally point to one canonical asset.
- Canonical asset cleanup is allowed only after the replacement Markdown/HTML/manifest has been written successfully.
- Do not introduce a cross-article/global media pool without a separate architecture decision.

## Viewer/service rules

- Viewer binds to loopback only by default.
- Viewer reads `library/`; it must not need Feishu to render a complete archive.
- Do not preserve/execute source-page scripts in offline HTML.
- Local video must retain byte-range support.
- Reader rendering must respect media context: standalone media and table-cell media are different layout cases.
- Standalone video must preserve source aspect ratio with viewport bounds; table-cell media must remain compact and must not expand table rows into full-size players.
- Multiple media items may form a grid only when they belong to the same source media block. Never regroup media across block boundaries.
- Local images are size-bounded in the Reader and may open in the shared cinema lightbox.
- Wide tables must scroll inside their own container and must not create page-level horizontal overflow.
- Desktop Reader width is user-controlled through the TOC/content splitter; do not reintroduce a hard-coded prose width such as 760px.
- Splitter behavior must remain keyboard accessible, locally persistent, double-click resettable, and disabled in drawer/mobile layout.
- Reading-enhancement CSS may style headings, lists, links, tables, quotes, code and media groups, but must not alter source block order or semantics.
- Unknown/future blocks must degrade conservatively: preserve available text or media instead of disappearing silently.
- Heading navigation must use stable block ids rather than heading text so duplicate headings remain addressable.
- Browser Reader CSS is independent from Obsidian CSS. Do not copy or runtime-link external Obsidian snippets into the Viewer.
- Optional `data/styles/reader.user.css` is a machine-local visual override only; keep it Git-ignored and do not rely on it for functional DOM contracts.
- `service.bat stop` must verify process ownership before killing a PID; never kill arbitrary processes solely because they use port 4173.

## Required validation

For scanner/archive changes:

- Verify the document reaches its known tail or equivalent completeness check.
- Verify stable Block/media counts across repeated scans when practical.
- Verify `archive.json` status is correct.
- Verify expected media files exist.
- Verify Markdown/HTML contain no unintended remote Feishu media dependencies.
- Verify Feishu UI noise is not leaking into output.

For Viewer/service changes:

- `npm run verify:reader`
- Use `service.bat restart` after the repair so the running Viewer picks up the latest code.
- GET `http://127.0.0.1:4173/` returns HTTP 200.
- Local MP4 Range requests should return HTTP 206 when testing Viewer behavior.
- Final service status should be `running` after a repair/validation cycle so the user can immediately test the result.
- Do not stop the Viewer at the end unless the user explicitly asks for it to be stopped.

## Safety

- Preserve unrelated files.
- Do not recursively delete project/runtime/user data unless explicitly authorized.
- Prefer reversible operations.
- Treat `library/` and `data/profiles/` as user data even though they are inside the project.
