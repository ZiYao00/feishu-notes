# Local Agent routing

All hosts must first read the latest `docs/ARCHIVE-QUALITY-V3.md` and use `quality-gate.js` + `publish-transaction.js` via the project workflow. Never infer complete from CLI exit 0 or old manifest status alone. Require hash-bound desktop/mobile Reader QA, distinguish dynamic candidate reports from stale JSON, preserve publish markers and original library, and obtain separate user permission before publishing `partial_verified`.

Codex, Hermes and WorkBuddy should reuse the same canonical SKILL.md and local feishu-notes CLI, provided that host has an authorized Windows project directory and shell. Do not assume native Skill discovery is installed; inspect host conventions before creating junctions or links.

Read local AGENTS.md, PROJECT-HANDBOOK.md, ARCHITECTURE.md and README.md before mutating anything. Check git status. Run `node scripts/agent-capture.js inspect "<url>"`, then `capture` only if the target is missing. For user-approved partial/pending recovery, use `resume "<url>" --profile default --confirm-unknown` after checking unknown-media consent. Never auto-override other preflight warnings.

The shared CLI capture lock protects legacy and Agent callers. Respect authentication, scan verification, old source fingerprints, media transfer hard budgets and retention of staging/rollback data. Do not develop host-specific downloading logic. For any incomplete-looking source, run the current project's source-fidelity audit and test an isolated candidate instead of declaring success from an exit code. File card permissions are authoritative; an undownloadable attachment remains visible and unresolved. Verify quality.verified, Block coverage, local media hashes, source version and desktop/narrow-screen Reader before reporting full completion.
