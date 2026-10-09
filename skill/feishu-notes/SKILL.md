---
name: feishu-notes
description: Archive authorized Feishu docx/docs/wiki links into the local feishu-notes library using ChatGPT Web and CodexPro or a local Agent CLI. Inspect existing local archives, validate downloaded media and produce optional source-grounded Explain deep-deconstruction chapters. Trigger on 飞书文档下载、归档、离线阅读、原文深度拆解 and Feishu URLs.
---

# Feishu Notes

This skill is an adapter, not a separate browser/downloader. The Windows project owns Chrome Profile, files, Reader and Explain.

## Mandatory current rules
Open the authorized project and read its current AGENTS.md, docs/PROJECT-HANDBOOK.md, docs/ARCHITECTURE.md and README.md before capture. For Explain, also read docs/EXPLAIN-WORKFLOW.md. Those local files are authoritative, not any bundled snapshot. If missing, do not mutate files.

## Host selection
- ChatGPT web: read references/chatgpt-codexpro.md. Use connected CodexPro to open the authorized local workspace, inspect files and execute only the project CLI.
- Local Codex, Hermes, WorkBuddy: read references/local-agent.md and use the authorized local command runner. Skills do not by themselves grant filesystem/terminal access.
- Always consult references/validation.md for acceptance.

## Modes
- archive (default): inspect first; capture only when missing. For an existing incomplete archive, offer safe media-only resume after authorization; never silently overwrite original prose or Explain.
- explain: work from an existing verified archive, follow current Explain workflow, keep originals immutable, pilot one or two chapters first. The initializer creates structure but does not generate chapters.
- full: run archive first; begin Explain only after required source completeness and user-requested scope are satisfied.

## Capture
1. Check workspace root and current git status. Never export sessions, credentials, private article data or Chrome Profiles.
2. Run `node scripts/agent-capture.js inspect "<feishu-url>"` first. Parse AGENT_CAPTURE_RESULT and process exit code. Return existing complete archives read-only.
3. If absent: `node scripts/agent-capture.js capture "<feishu-url>" --profile default`. The wrapper and CLI both hold scoped capture locks; never bypass them.
4. For existing `pending_confirmation` / `partial`, inspect warning reasons and obtain task-specific consent. Only then use `node scripts/agent-capture.js resume "<feishu-url>" --profile default --confirm-unknown` when unknown sizes exist. `--confirm-large` is a separate deliberate choice for remaining warnings. Neither confirmation overrides actual per-file and total transfer budgets.
5. Resume requires a stable full-document scan, matching stable source record identities and content fingerprint (including links, attachments, and media relationships), validated SHA-256 assets, a journal for file-level retry and a rollback snapshot before three-file publication. No automatic old-media deletion, source refresh, stale-lock removal or cookie export.
6. Stop and report login_required, permission_denied, source_changed, scan_incomplete, locked, pending_confirmation, partial, needs_review, resume_failed or an absent result. If the connector times out, query task status/logs and verify actual state; do not blindly retry.
7. Validate the document ID, manifest state, local Markdown/HTML, physical media files, missing attachments, and Sheet extraction. The Reader format and optional Explain are independent; plain capture/resume never auto-generates Explain.

## Full-document fidelity and delivery acceptance

Never equate a successful CLI call, verified 100-media subset, or legacy `status=complete` with fully delivered original content. The actual source has document text, nested structures, file attachments, image/video occurrences and possible embedded Sheets. Before marking delivery complete, validate `archive.json.quality.verified`, `scan.calloutCoverage` (including all nested virtualized Callout children), full Block accounting, unresolved file attachments, media SHA-256, offline Reader and required source version.

For an incomplete or suspected truncated archive, do NOT auto-overwrite it or bypass the media-only resume source check. When comparing repeat Feishu scans, prefer `data-record-id` over volatile `data-block-id`; a changed block-id alone is not a real source content edit. Never auto-remap already-downloaded assets without a verified record + occurrence identity. First use the current local project rules and `node scripts/audit-source.js "<feishu-url>"` to preserve original Markdown/HTML/Manifest and generate a private authenticated source snapshot. Audit `docx-view-block` file cards: visually present, non-downloadable file cards must remain recorded as `unresolved`; a disabled Feishu download control is a hard permission boundary. Build/re-render a candidate in `data/tmp/archive-candidates/` before publishing anything. For local user inspection, `preview-candidate.bat` serves the latest candidate only on `http://127.0.0.1:4174/`; it does not serve or mutate the formal library. Candidate-only bounded transfers may download up to the configured 100-item soft limit, marking remaining media `skipped_by_media_limit` rather than claiming complete. A candidate with restricted attachments or missing assets is partial and must not silently replace the formal library.

The local source snapshot/candidate contains private content and MUST NOT be bundled into this Skill, sent to cloud, published in Git or copied to unauthorized systems. Follow references/validation.md and run the source-fidelity test plus Reader/Release regressions. Only report success for the components actually verified.

## V3 quality gate and safe publication

Before any capture/resume handoff, read the current local `docs/ARCHIVE-QUALITY-V3.md`. Treat `src/archive/quality-gate.js` as the only quality/status authority. Differentiate `pending_confirmation` / `partial` / `complete` (legacy status) from `unverified`, `partial_candidate`, `complete_candidate`, `partial_verified`, and `complete_verified` (candidate QA verdicts). A command returning 0, an old manifest saying `complete`, or downloaded assets with valid hashes alone NEVER certifies a document.

For existing incomplete-looking originals, keep the formal `library/` unchanged. First preserve rollback evidence, audit source, then work in `data/tmp/archive-candidates/`. `node scripts/candidate-report.js <document-id> [run]` dynamically checks Manifest and physical media SHA-256. `node scripts/verify-candidate-reader.js <document-id> [run]` tests desktop/mobile, offline media, and stores QA bound to Manifest/HTML/Markdown digests. Do not use stale `candidate-report.json` counts to conclude success. Media inventory counts must agree with offline Reader DOM after any case-study rearrangement, including every `reader-media--unavailable` placeholder. Exclude Feishu `.loading-placeholder-wrapper` UI thumbnails from source scans; do not convert them to media.

Publication is a separate, authorized step. The shared `publish-transaction.js` uses a private backup, a `.publish-state.json` journal and a Reader HTTP 503 gate; interrupted journals require explicit review/recovery. Never delete markers, force refresh an existing archive, bypass disabled Feishu attachment downloads, exceed the authorized 100-item media subset or copy private source snapshots to Skill packages. `partial_verified` may be published ONLY after a distinct user authorization. A present but inaccessible attachment stays visible as unresolved. An explicitly reviewed provisional preview may copy old SHA-256-checked media into a new isolated candidate only after unique source-record/kind matching and permission to use the old candidate. Without a fresh byte comparison it MUST retain `policy.provisionalAssetReuse` and verdict `unverified`, regardless of Reader QA. All hosts must obey this rule; see references/validation.md.

## Limitations
The safe resume mode supports per-file retries (not byte-range resumability), holds a shared lock with legacy CLI and preserves old media and backups. The journal does not provide automatic scheduling or externally managed background work. Existing Explain source hashes may become stale when media paths change; never silently update them. Generic Feishu attachments remain unverified. Never claim end-to-end success without a verified, source-consistent manifest. Do not commit, push, install or modify unrelated workspaces without explicit permission.
