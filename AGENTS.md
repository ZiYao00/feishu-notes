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
- Local rollback copies under `data/backups/` are private user data too; never stage them or include them in a Release artifact.
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
- Callout containers have their own virtual list: a stable top-level tail does NOT prove the nested content is complete. Collect overlapping nested `data-record-id` units across the scroll, require a unique gap-free chain with known first/last units, reconstruct only verified chains, and mark `scan.stopReason=callout_incomplete` if any placeholder/gap remains. Do not silently discard child text, and do not certify a partial Callout as complete.
- Prefer stable Feishu `data-record-id` for cross-scan document identity/hierarchy, not transient `data-block-id`: verified real source scans retained all 555 recordIds but changed most blockIds. Use occurrence ordinals within the same stable record; do not guess reattachment if identity is missing.
- Do not treat Feishu player UI, transient Blob previews, controls, or cover artifacts as authoritative document media. In particular, `.loading-placeholder-wrapper` may contain a second IMG/Blob thumbnail; remove it from captured source HTML and media inventory, not merely from the rendered Reader.
- Preserve repeated legitimate document content; never deduplicate by visible text string globally.

## Media/archive rules

- Scan first, build a media inventory, then download.
- Large/unknown media must be gated by configurable soft limits.
- Never silently skip media and still report the archive as complete.
- Record failed/skipped media explicitly in `archive.json`.
- A previously `complete` archive must not be downgraded just because a later preflight needs confirmation.
- Complete archives must use local relative media paths and should not depend on Feishu CDN/blob URLs.
- Media content deduplication is per-article and SHA-256 based. Never deduplicate solely by file size, filename, source URL, or Feishu media id.
- Physical deduplication must preserve every logical media occurrence in the article. Frontend case-study regrouping must also preserve `reader-media--unavailable` placeholders; never remove a media block before its media children have been transferred. Multiple logical entries may intentionally point to one canonical asset.
- Canonical asset cleanup is allowed only after the replacement Markdown/HTML/manifest has been written successfully.
- Do not introduce a cross-article/global media pool without a separate architecture decision. A reviewed, **isolated** preview may copy SHA-256-verified old candidate media by a provably unique stable parent `recordId` and media kind; this is still historical byte provenance. Mark `policy.provisionalAssetReuse=true`, force `unverified`, never silently certify or publish it.

## Explain / derived-deconstruction rules

- Original archive files remain the source of truth. Derived source-deconstruction material belongs under `library/<article>/explain/` and must never be written into `archive.json`.
- Viewer support for Explain must remain optional; ordinary archived articles must work with no Explain directory and no ASR service.
- Public UI calls Explain **原文深度拆解**. Its job is to analyze source claims, evidence, structure, trade-offs and reusable cases; avoid teacher-note, study-instruction or editorial-process wording addressed to the reader.
- Explain must support continuous document reading: prose carries argument, long independent records use lists, and repeated fields use light tables when comparison is needed. Keep visual directives only where their information relationship warrants them; numeric card metadata must not automatically outrank explanatory copy. Compare reuses Reader table layout and narrow-screen labeled records. Preserve evidence boundaries, statistical uncertainty and chapter/subsection anchor order, and regress neighboring Explain Case/Prompt surfaces after shared changes.
- Follow `docs/EXPLAIN-WORKFLOW.md` for reading-task and component selection: explanatory chapters prioritize sustained reading, while complete media/Prompt libraries retain functional Cases. Case analysis stays at body size; Prompt structure does not imply a sequence. Preserve full Prompt code, media identities and table field/header meaning when simplifying content.
- Original Reader and Explain share section-level whitespace through `--reader-section-gap` (currently a 60px trial); do not apply it to ordinary paragraphs or nested Case/table content, and avoid duplicate wrapper/child margins.
- `explain/manifest.json` must keep a source fingerprint so source updates can be detected instead of silently presenting stale deconstruction material.
- Public Explain content is chapter-driven: `explain/chapters/manifest.json` + Markdown chapters. Only `status=ready` chapters with an existing file are user-visible.
- Keep chapter Markdown as separate maintainable source files, but render every ready chapter in manifest order as one continuous public page. Desktop chapter navigation and the narrow-screen chapter selector must scroll within that page and synchronize active state; they must not paginate or reload chapters. Legacy `?chapter=<id>` links may redirect to the equivalent `#chapter-<id>` anchor.
- Legacy `explain/lessons/`, Evidence Cases, ASR records, frames and other analysis artifacts are internal material; do not expose their counts or lists in normal navigation.
- Video evidence uses archive `contentHash` (SHA-256) as the canonical identity. ASR, keyframes, cases and chapter citations must preserve that identity for traceability.
- ASR output sidecars must record the content hash, canonical source video path, logical source occurrences, ASR service/model metadata, transcript and available segments.
- `local-ASR-service` is an external local capability. Reuse it when available; do not copy business media into that repository or make the Viewer depend on it.
- Visual review should prefer a small number of explicit timestamp frames. Frame evidence must record source video, timestamp and output image SHA-256; do not bulk-export hundreds of frames by default.
- Reuse Evidence Cases across chapters rather than re-analysing the same video independently in every chapter.
- Detailed schema and workflow are defined in `docs/EXPLAIN-WORKFLOW.md`.

## Source fidelity and delivery gate

**V3 authority:** Follow `docs/ARCHIVE-QUALITY-V3.md` before capture, resume, candidate promotion or quality claims. Quality states come only from `src/archive/quality-gate.js`; a process exit code or legacy `archive.json.status=complete` is not a certified full document. A Reader QA result is valid only when bound to the Manifest, HTML and Markdown hashes. Do not publish unverified candidates. A `partial_verified` publication needs explicit user authorization.

- A complete Feishu capture is NOT the same as a successful CLI process. Keep an authenticated source snapshot under the private runtime candidate workspace so that every source Block can be audited and re-rendered without silently erasing content.
- Treat `docx-view-block` wrapping `docx-file-block` as a first-class file attachment when not a video, even if there is no `img`/`video` URL. Preserve filename, visible size, block identity and status. Do not remove "附件不支持打印" before checking the containing file block.
- Disabled Feishu preview download controls are an authorization boundary. Do not invoke undocumented endpoints to bypass the page's permission decisions. Such files remain visible and `unresolved`, never reported as downloaded.
- Distinguish top-level Block count from rendered Section count. Every top-level Block must be `rendered`, `empty_verified`, `unsupported_visible`, or `failed`; meaningful source content must not silently vanish.
- Preserve Markdown heading number and title on one semantic heading line; maintain Callout, table, Prompt and inline link semantics. Avoid destructive global HTML cleanup.
- For Agent/new captures, `archive.json.quality.verified` is separate from legacy `status`. Never assert source-faithful complete delivery until scan stability, Block coverage, media/attachment inventory, local assets, Reader playback and view testing all pass. Old archives lacking quality verification remain readable but not retroactively certified.
- Preview or transfer real document repairs only in `data/tmp/archive-candidates/` until reviewed. Keep `library/` original/Explain untouched; make backups before any controlled publication.
- The configured 100-media threshold is a warning; approved bounded candidates may attempt at most 100 items and mark the rest `skipped_by_media_limit`. Unknown Blob sources must be retained as failed/pending media, not removed from the inventory. Recover expiring image Blob URLs only from the same authorized visible source block.
- Never hardcode specific user document URLs or tokens in tracked scripts. Run `node scripts/verify-source-fidelity.js` for scanner/renderer/media fidelity changes in addition to existing Agent, Reader and Release regression tests.

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
- Original Reader may switch among long-form, structured-report and dense-note presentation only from generic document structure signals. Dense-note keeps priority when prompt-heavy/high-heading-density signals overlap; structured-report is evaluated only after dense-note. Never key Reader modes to a document title, URL, block id, or other article-specific identifier.
- Structured-report mode is for multi-section reports with repeated structured evidence such as tables/lists and short explanatory blocks. It must preserve source semantics/order, keep H2 as primary Smart TOC entries with H3/H4 available through the explicit full-directory toggle, and use a low-noise reading grammar where typography/spacing carry hierarchy instead of decorative containers. AutoFit / Clamp, Splitter, media behavior and narrow-screen record cards remain unchanged.
- Dense-note mode must preserve source heading semantics and order while assigning visual roles (major / note / long), defaulting Smart TOC to major headings, and rendering long prompt-like code blocks as readable, wrappable, collapsible Prompt Cards with full-copy actions. Dense-note visual treatment is intentionally low-noise: Prompt Cards remain functional containers rather than decorative cards, repeated media groups should not add redundant outer surfaces, long-note callouts stay lightweight, and small metadata must retain readable contrast without changing global Reader tokens.
- Dense notes may group consecutive short heading/text records into a generic Commentary Stream when the source behaves like live notes or chat-style one-line commentary. Do not invent speakers, timestamps, reply relationships, or chat bubbles that are absent from the source; real chapters, media, code, tables and embeds must break the stream.
- Explain/deconstruction case libraries may use the controlled `:::case` directive for case metadata/tags and optional local archive media. Prompt Library cases use exactly one first-level visual container: analysis, Prompt anatomy, constraints and the complete Prompt belong inside the same Case; the embedded Prompt region must not render as a second bordered card. Never bind a video to a Prompt without explicit source evidence; keep unverified video and Prompt cases separate.
- Empty-block detection must never hide meaningful media or embeds. Heading-attached media and image-only blocks remain visible. Embedded Feishu Sheets should first be extracted through the authenticated Sheet copy/clipboard HTML path and stored as normal offline tables; the user's clipboard must be restored after capture. Only failed extraction may degrade to a visible offline fallback.
- Desktop Reader width is user-controlled through the TOC/content splitter; do not reintroduce a hard-coded prose width such as 760px.
- Splitter behavior must remain keyboard accessible, locally persistent, double-click resettable, and disabled in drawer/mobile layout.
- Reading-enhancement CSS may style headings, lists, links, tables, quotes, code and media groups, but must not alter source block order or semantics.
- Unknown/future blocks must degrade conservatively: preserve available text or media instead of disappearing silently.
- Heading navigation must use stable block ids rather than heading text so duplicate headings remain addressable. Reader/Explain navigation is page-local: TOC/chapter links must not be resolved through the archive `<base>` into `/library/`. Clicking navigation updates the current hash and scroll position without a page reload, and ScrollSpy must keep the visible menu state synchronized with manual scrolling.
- Browser Reader CSS is independent from Obsidian CSS. Do not copy or runtime-link external Obsidian snippets into the Viewer.
- Optional `data/styles/reader.user.css` is a machine-local visual override only; keep it Git-ignored and do not rely on it for functional DOM contracts.
- `service.bat stop` must verify process ownership before killing a PID; never kill arbitrary processes solely because they use port 4173.

## Agent Skill + safe capture boundary

- Canonical Skill source: `skill/feishu-notes/`. ChatGPT web uses CodexPro; supported local Agents use the project CLI. Do not embed the local Chrome Profile or library inside Skill archives.
- Use `node scripts/agent-capture.js inspect <url>` first. Use `capture` for an absent article and `resume` only for an explicitly authorized existing `pending_confirmation` / `partial` archive. Existing `complete` is read-only; never silently refresh source text.
- Every CLI capture (including legacy) uses the shared `data/state/capture-global.lock`; the Agent wrapper also holds its own cooperative `agent-capture.lock`. A stale lock is never auto-removed. Do not run concurrent capture on the same profile.
- The scanner must prove a stable, repeated end-of-document pass (`scan.verifiedComplete=true`). The resume path must compare original reader text, block identities and logical media relationships before downloading; a changed source must stop without publishing.
- File-level resume records SHA-256 assets in `data/state/agent-resume-<documentId>.json`, hard limits stream bytes per media/task, and only publishes verified Markdown/HTML/Manifest after backing up the original three files. Keep old assets/staging; never recursively clean up. `--confirm-unknown` is explicit opt-in for unknown-sized media and never bypasses hard byte limits.
- Treat `pending_confirmation`, `partial`, failed embedded Sheet, missing media and unverified scanner tails as incomplete. The current 100-item threshold is a warning, not a claim that any 100 items are safe to download.
- For Agent changes run `node scripts/verify-agent-capture.js` and `node scripts/verify-agent-resume.js`. Follow current `docs/EXPLAIN-WORKFLOW.md` for Explain; media-only path changes can invalidate older Explain file fingerprints.

## Required validation

For V3 refactors and multi-agent handoffs, preserve existing source and user data. If the local `library/` already contains formal archives, verify an appropriate private `data/backups/fidelity-v3-*/baseline.json` checkpoint before publication or any authorized archive replacement, creating a new protected checkpoint first if none exists. A fresh clone with no formal archive does NOT require another machine's private baseline; run isolated fixture tests there instead. Run `node scripts/verify-source-protection-regression.js`, `node scripts/verify-quality-gate.js`, `node scripts/verify-publish-transaction.js`, `node scripts/verify-source-fidelity.js`, `node scripts/verify-agent-capture.js`, `node scripts/verify-agent-resume.js`, plus Reader/Release regressions. Where a local baseline exists, run `node scripts/verify-fidelity-v3-baseline.js`. Check candidate reports dynamically; Reader must return HTTP 503 while `.publish-state.json` exists. Never treat a stale candidate-report.json as truth.


For scanner/archive changes:

- Verify the document reaches its known tail or equivalent completeness check.
- Verify stable Block/media counts across repeated scans when practical.
- Verify `archive.json` status is correct.
- Verify expected media files exist.
- Verify Markdown/HTML contain no unintended remote Feishu media dependencies.
- Verify Feishu UI noise is not leaking into output.

For Viewer/service changes:

- `npm run verify:reader`
- `npm run verify:release` for service/runtime/HTTP changes; this covers minimum Node and video byte-range contracts.
- Use `service.bat restart` after the repair so the running Viewer picks up the latest code.
- GET `http://127.0.0.1:4173/` returns HTTP 200.
- Local MP4 Range requests should return HTTP 206 when testing Viewer behavior.
- When navigation/Reader layout changes, verify real click-to-anchor behavior (same pathname, expected hash, target below sticky UI), active-menu ScrollSpy, zero duplicate ids on combined Explain pages, mobile chapter selection without reload, and legacy `?chapter=` compatibility when applicable.
- When mode-scoped Reader CSS changes, verify desktop and narrow-screen overflow, light/dark hierarchy, the intended mode-specific visual contract, and at least one neighboring surface that shares the same base component (for example Explain Prompt Cards) to prove the scoped override did not leak.
- Final service status should be `running` after a repair/validation cycle so the user can immediately test the result.
- Do not stop the Viewer at the end unless the user explicitly asks for it to be stopped.

## Safety

- Portable builds must retain Node and dependency license/NOTICE files and per-file build hashes. Use the committed-source allowlist in `scripts/package-portable.ps1`, not a working-directory ZIP. Bundled runtime/dependencies are artifact-only, not tracked source. Project code is currently UNLICENSED by owner decision.
- Before a Release, follow `docs/PROJECT-HANDBOOK.md` section 14. Export only the authorized committed source; inspect artifact contents separately from `.gitignore`. Validate documented installation on a clean Windows environment without existing dependencies, configuration, profiles or archives. Record reused-dependency tests as simulations, not clean-install acceptance. Dependency installation, publishing and remote Git changes need their own authorization.
- For Reader verification in this workspace, set `FEISHU_NOTES_VERIFY_KEEP_FIXTURE=1` so fixture creation does not trigger recursive deletion.

- Preserve unrelated files.
- Do not recursively delete project/runtime/user data unless explicitly authorized.
- Prefer reversible operations.
- Treat `library/` and `data/profiles/` as user data even though they are inside the project.
