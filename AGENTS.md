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

## Explain / derived-deconstruction rules

- Original archive files remain the source of truth. Derived source-deconstruction material belongs under `library/<article>/explain/` and must never be written into `archive.json`.
- Viewer support for Explain must remain optional; ordinary archived articles must work with no Explain directory and no ASR service.
- Public UI calls Explain **原文深度拆解**. Its job is to analyze source claims, evidence, structure, trade-offs and reusable cases; avoid teacher-note, study-instruction or editorial-process wording addressed to the reader.
- `explain/manifest.json` must keep a source fingerprint so source updates can be detected instead of silently presenting stale deconstruction material.
- Public Explain content is chapter-driven: `explain/chapters/manifest.json` + Markdown chapters. Only `status=ready` chapters with an existing file are user-visible.
- Legacy `explain/lessons/`, Evidence Cases, ASR records, frames and other analysis artifacts are internal material; do not expose their counts or lists in normal navigation.
- Video evidence uses archive `contentHash` (SHA-256) as the canonical identity. ASR, keyframes, cases and chapter citations must preserve that identity for traceability.
- ASR output sidecars must record the content hash, canonical source video path, logical source occurrences, ASR service/model metadata, transcript and available segments.
- `local-ASR-service` is an external local capability. Reuse it when available; do not copy business media into that repository or make the Viewer depend on it.
- Visual review should prefer a small number of explicit timestamp frames. Frame evidence must record source video, timestamp and output image SHA-256; do not bulk-export hundreds of frames by default.
- Reuse Evidence Cases across chapters rather than re-analysing the same video independently in every chapter.
- Detailed schema and workflow are defined in `docs/EXPLAIN-WORKFLOW.md`.

## Viewer/service rules

- Viewer binds to loopback only by default.
- Viewer reads `library/`; it must not need Feishu to render a complete archive.
- Do not preserve/execute source-page scripts in offline HTML.
- Local video must retain byte-range support.
- Reader rendering must respect media context: standalone media and table-cell media are different layout cases.
- Standalone video must preserve source aspect ratio with viewport bounds; table-cell media must remain compact and must not expand table rows into full-size players.
- Multiple media items may form a grid only when they belong to the same source media block. Never regroup media across block boundaries.
- Local images and standalone/table-cell videos use one shared transparent media dialog. Explicit video activation starts playback; Escape or a blank-stage click closes the dialog and returns focus to the opener.
- Desktop Reader tables use generic AutoFit / Clamp behavior based on browser-measured rendered widths, not field names, first-column status, character-count estimates, column count, or semantic-type weights. If the natural table width fits, keep that natural width; otherwise clamp to the available Reader canvas and compress columns from their preferred widths toward header-based minimums. Tables with row/column spans or a source colgroup fall back to native auto layout; narrow screens become labeled record cards.
- Table-cell video is a compact icon/pill launcher because playback happens in the shared Media Dialog; it must not reserve thumbnail-card height inside the row. Table-cell images may keep a small thumbnail launcher.
- Table column kinds such as numeric / percent / status / media are visual semantics only and must never determine layout width. Percent styling requires cells whose content is primarily a percentage value; prose that merely contains a percentage must remain ordinary text.
- Original Reader may switch between long-form and dense-note presentation only from generic document structure signals (for example heading density and long prompt/code density). Never key Reader modes to a document title, URL, block id, or other article-specific identifier.
- Dense-note mode must preserve source heading semantics and order while assigning visual roles (major / note / long), defaulting Smart TOC to major headings, and rendering long prompt-like code blocks as readable, wrappable, collapsible Prompt Cards with full-copy actions.
- Dense notes may group consecutive short heading/text records into a generic Commentary Stream when the source behaves like live notes or chat-style one-line commentary. Do not invent speakers, timestamps, reply relationships, or chat bubbles that are absent from the source; real chapters, media, code, tables and embeds must break the stream.
- Explain/deconstruction case libraries may use the controlled `:::case` directive for case metadata/tags and optional local archive media. Prompt Library cases use exactly one first-level visual container: analysis, Prompt anatomy, constraints and the complete Prompt belong inside the same Case; the embedded Prompt region must not render as a second bordered card. Never bind a video to a Prompt without explicit source evidence; keep unverified video and Prompt cases separate.
- Empty-block detection must never hide meaningful media or embeds. Heading-attached media and image-only blocks remain visible. Embedded Feishu Sheets should first be extracted through the authenticated Sheet copy/clipboard HTML path and stored as normal offline tables; the user's clipboard must be restored after capture. Only failed extraction may degrade to a visible offline fallback.
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
