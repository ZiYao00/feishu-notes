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

## Viewer/service rules

- Viewer binds to loopback only by default.
- Viewer reads `library/`; it must not need Feishu to render a complete archive.
- Do not preserve/execute source-page scripts in offline HTML.
- Local video must retain byte-range support.
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

- `service.bat status`
- `service.bat start`
- GET `http://127.0.0.1:4173/` returns HTTP 200.
- `service.bat stop`
- Final status is stopped.
- Local MP4 Range requests should return HTTP 206 when testing Viewer behavior.

## Safety

- Preserve unrelated files.
- Do not recursively delete project/runtime/user data unless explicitly authorized.
- Prefer reversible operations.
- Treat `library/` and `data/profiles/` as user data even though they are inside the project.
