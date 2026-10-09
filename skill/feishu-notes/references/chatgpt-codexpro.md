# ChatGPT Web via CodexPro

V3: read `docs/ARCHIVE-QUALITY-V3.md` in the opened Windows workspace before work. Reuse `node scripts/candidate-report.js <document-id> [run]` for dynamic candidate status and `node scripts/verify-candidate-reader.js <document-id> [run]` for hash-bound Reader QA. Distinguish code test success from archive quality and authorized publication. `partial_verified` cannot be installed into formal `library/` without separate user consent. Never remove `.publish-state.json` or auto-retry when a transaction may be interrupted.

Use mcp__CodexPro__open_workspace with the explicitly authorized Windows directory. Retain workspace_id in read, show_changes and bash calls. Read current local project rules before writes. Use bash only for approved CLI operations.

Begin with `node scripts/agent-capture.js inspect "<url>"`. For missing archive, use `capture`. For existing `partial` / `pending_confirmation` with task-specific media consent, use `resume "<url>" --profile default --confirm-unknown` where required. Confirm separate file-count/known-size warnings with `--confirm-large` only when authorized. Parse AGENT_CAPTURE_RESULT and CLI exit code together.

If an existing original looks truncated or a source version diff blocks resume, inspect the local source-fidelity workflow and run an authorized isolated audit/candidate instead of bypassing the protection. Source snapshots, signed URLs and user file data stay in the authorized Windows workspace. Confirm file-card download permissions, Block coverage, SHA-256 and Reader QA; report any partial candidate distinctly from the original library.

Long scans may exceed a single CodexPro call. When a long operation is explicitly approved, the local `node scripts/agent-task.js start <url> --confirm-unknown` and `status <jobId>` helper permits in-turn polling of the running Windows process. Do not promise asynchronous completion, forget a running process, or re-launch it while a capture lock remains. A stopped task without final result is not success.

Do not export Chrome profiles, private Feishu documents, active CDN URLs or local cookies to the ChatGPT sandbox. Do not expose Viewer/CDP ports externally. A source-changed/scan-incomplete result must preserve the old original archive and be reported as blocked.
