# Explain / Learning Workflow

## Purpose

`feishu-notes` keeps the original Feishu archive as the source of truth. Optional learning content lives beside the archive as derived knowledge under:

```text
library/<article>/
├─ article.html
├─ archive.json
├─ <article>.md
├─ assets/
└─ explain/
```

The Viewer may expose both **Original article** and **Explain version**, but the Explain layer must never be required for ordinary offline reading. The public Explain experience is one chapter Reader, not a Course Map or Lesson dashboard.

## Source boundary

- `archive.json`, Markdown, HTML and `assets/` remain the canonical source archive.
- `explain/` is derived material and must not write custom fields back into `archive.json`.
- Re-capturing the same Feishu document may rewrite the canonical archive files, but must not delete `explain/`.
- `explain/manifest.json` stores a source fingerprint. If the archive saved time, document id or source SHA-256 changes, the Viewer marks the Explain topic as requiring review.

## Explain layout

```text
explain/
├─ manifest.json              # source fingerprint + evidence contract
├─ chapters/
│  ├─ manifest.json           # public chapter order/status
│  └─ *.md                    # public reader content
├─ internal/                  # method maps, planning notes, private drafts
├─ lessons/                   # legacy drafts; kept for reuse, never public navigation
└─ evidence/
   ├─ media-index.json
   ├─ cases.json
   ├─ asr/
   └─ frames/
```

Public visibility rule:

- a chapter is user-visible only when it is listed in `chapters/manifest.json` with `status: "ready"` and its Markdown file exists;
- `/explain/<folder>/` opens the first ready chapter;
- chapter switching stays inside the same Reader using the `chapter` query parameter;
- legacy `/explain/<folder>/<lesson>/` routes are hidden;
- Evidence/ASR/frame counts are not shown in normal navigation.

Initialize the structure with:

```bash
node scripts/init-explain.js "<article-folder>"
```

Use `--refresh-source` only after reviewing an updated source archive.

## Evidence identity

The canonical evidence identity for video is the archive media `contentHash` (SHA-256), not filename, Feishu media id, source URL or file size.

`media-index.json` maps one physical video hash back to:

- canonical local media path;
- dimensions and size;
- all logical Feishu media occurrences;
- Block ids and contexts;
- duplicate relationships.

All downstream ASR, keyframes, cases and chapter citations should reference the same `contentHash`. The evidence identity remains internal unless a chapter explicitly needs a source-detail disclosure.

## ASR sidecar contract

ASR remains an external local capability. The Viewer must not depend on the ASR service.

Use the evidence wrapper instead of manually copying ASR stdout:

```bat
node scripts\transcribe-evidence.js ^
  -ArticleDir "<article-dir>" ^
  -ContentHash "<contentHash>" ^
  -AsrRoot "<local-ASR-service-root>" ^
  -Language zh
```

Alternatively set `FEISHU_NOTES_ASR_ROOT` on the local machine and omit `-AsrRoot`. The tracked project never hardcodes the machine-specific ASR repository path. The wrapper forces Windows PowerShell stdout to UTF-8, calls the external service CLI, preserves the archive `contentHash` and logical source occurrences, and writes the result back into the article's Explain evidence directory. Existing sidecars are reused unless `-Force` is supplied.

For each transcribed physical video, use one sidecar JSON named:

```text
explain/evidence/asr/sha256-<contentHash>.asr.json
```

and, when needed:

```text
explain/evidence/asr/sha256-<contentHash>.srt
```

The JSON sidecar should contain at least:

```json
{
  "version": 1,
  "contentHash": "<64-char sha256>",
  "sourceVideo": "assets/videos/sha256-<hash>.mp4",
  "sourceOccurrences": [
    {
      "mediaId": "...",
      "blockIds": ["..."],
      "contexts": ["table-cell"]
    }
  ],
  "asr": {
    "service": "local-ASR-service",
    "model": "...",
    "createdAt": "...",
    "text": "...",
    "segments": []
  }
}
```

Do not copy business media into the ASR service repository. Keep media in the article archive and write final ASR evidence back under the article `explain/` directory.

## Keyframe evidence

Avoid bulk frame export for routine analysis. Prefer a small number of explicit timestamps selected from the ASR/script structure or a specific visual question.

Use:

```bat
scripts\extract-evidence-frames.bat ^
  -ArticleDir "<article-dir>" ^
  -ContentHash "<contentHash>" ^
  -Timestamps "0,1.5,3.2"
```

The default helper uses the project's existing Playwright + local Chrome runtime: it serves the archived MP4 through the local Viewer, seeks to the requested timestamp, captures the decoded frame through Canvas, and does not require an external FFmpeg installation. It refuses more than 12 frames in one run and writes:

```text
explain/evidence/frames/<contentHash>/
├─ sha256-<contentHash>-t-00000000ms.jpg
├─ ...
└─ frames.json
```

`frames.json` records the source video, all logical source occurrences, video dimensions/duration, requested and actual timestamps, byte size and SHA-256 of each extracted image, so every image used for visual analysis can be traced back to the original video and source Block.

## Case contract

`cases.json` is the reusable internal evidence layer between raw media and public chapters. One case may combine:

- source article location;
- contentHash;
- ASR excerpt;
- selected frame evidence;
- author claim;
- independent interpretation;
- hook / angle / mechanic / proof / offer / CTA analysis;
- transferability notes;
- uncertainty or verification flags.

Public chapters should reuse cases instead of independently re-analysing the same evidence. Cases support an analytical conclusion; they do not define the public chapter structure.

## Source-deconstruction authoring contract

The technical capability keeps the internal name `Explain` and the route remains `/explain/<folder>/` for compatibility. The normal public UI should call the result **原文深度拆解**. The artifact analyzes the source's claims, evidence, structure, trade-offs and reusable cases; it must not read like teacher notes, study instructions or editorial commentary addressed to a student.

The source archive remains the evidence source. When the source already has a coherent analytical sequence, preserve its major order. When it is a live-note/chat-style fragment stream, reorganize the derived deconstruction by concepts, relationships and decision logic while keeping the canonical archive unchanged.

Target analytical progression:

```text
识别原文结论
↓
区分事实 / 作者口径 / 案例 / 视觉证据
↓
拆出技术关系与冲突
↓
标明适用边界与待验证项
↓
沉淀可复用的判断与案例结构
```

Preferred transformation pipeline:

```text
原始文章
↓
高解析度拆分：事实 / 数据 / 作者判断 / 案例 / 视觉证据
↓
识别信息结构：模型 / 方法 / 对比 / 因果 / 数据 / 执行 / 案例
↓
保留有效主轴；碎片记录按概念与决策关系重组
↓
区分：原文口径 / 拆解判断 / 待验证
↓
选择对应视觉语义组件
↓
案例拆解：结构 / 约束 / Prompt Anatomy / 完整证据
↓
事实一致性、证据边界与版式压力复核
```

A chapter should normally answer the following analytical questions when relevant; this is not a rigid prose template:

1. what part of the original article is being analyzed;
2. what conclusions or claims the source actually makes;
3. what source evidence supports those claims;
4. how the concepts, mechanisms or trade-offs relate to each other;
5. what conditions limit the claim or require re-verification;
6. which real case materially clarifies the conclusion;
7. what reusable structure, decision rule or production pattern can be extracted;
8. whether the source itself contains contradictions, title/content mismatch or evidence gaps.

Quality gates:

- A chapter should not merely be an easier rewrite of the source report.
- When the source already has a strong analytical sequence, preserve it. When the source is a live-note/chat-style fragment stream, the deconstruction may reorganize it by concept, trade-off and decision path; keep the canonical archive unchanged and distinguish source claims from interpretation.
- Do not flatten every relationship into vertical prose. Parallel, causal, comparative, statistical, categorical and procedural information should look different.
- Keep source facts, source/marketing claims, project interpretation and independently verified external facts distinguishable.
- Evidence supports an analytical conclusion; the existence or order of Evidence Cases must not dictate the chapter outline.
- Do not transplant unverified medical, safety, performance or regulatory claims into a new context merely because the source used them.
- Avoid teacher-facing language such as “先理解为什么难读”, “你应该”, “这一章记住”, or explanations of why the editor reorganized the content. Replace that with source structure, source claims, deconstruction judgment, applicability boundaries and evidence status.
- Prefer a small number of meaningful examples over exhaustive repetition, except when the artifact is intentionally a complete case library such as Prompt Library.
- Public navigation should expose only `status=ready` chapters with an existing Markdown file.

## Visual deconstruction grammar

Public chapter Markdown may use a small controlled directive set when plain Markdown would hide the relationship between pieces of information:

- `:::hero` — compact chapter orientation or core framing;
- `:::split` — two-sided interpretation such as source vs learner view;
- `:::metrics` — a small group of headline numbers with labels and notes;
- `:::flow` — causal, temporal or procedural sequence;
- `:::compare` — row-based A/B or current/future comparison;
- `:::cards` — parallel categories, personas, scenes or options;
- `:::case` — one reusable case record with title, meta, repeated tags, summary, optional archive-local image/video, repeated `analysis:` / `anatomy:` / `constraint:` fields and an evidence/boundary note. For Prompt Library, `prompt: true` marks the immediately following fenced code block as the complete Prompt for this Case; the Viewer moves that Prompt inside the same Case and removes its independent card border;
- `:::takeaway` — durable summary or boundary that should stand apart from prose.

Use these blocks semantically, not decoratively. A page should not add badges, eyebrow labels, color blocks or oversized headings unless they carry information. Keep the visual hierarchy compact enough for long desktop study sessions. Ordinary prose remains ordinary Markdown.

Numeric hierarchy is semantic rather than automatic. Enlarge numbers only when they carry data, stage, order, time, ratio, ranking or comparison meaning; ordinary years, ids and incidental numbers should stay at body size. Use three approximate levels on desktop: headline metrics about 28–36px, emphasized numbers about 20–24px, and comparison/table numbers about 16–18px. Numeric values should use tabular figures where practical so percentages and counts align cleanly.

`:::flow` is a continuous sequence, not a row of unrelated cards. On desktop, 2–5 steps should read as one connected horizontal track with a strong step number, compact title and short explanation. A 6-step flow should split into two connected 3-step tracks rather than six narrow cards. On narrow layouts, flow steps become a vertical timeline. Keep flow copy concise enough that the skeleton is visible at a glance; move deeper explanation outside the flow when necessary.

Directive values use simple `key: value` fields. Repeated fields such as `card:`, `step:`, `metric:`, `row:`, `tag:`, `analysis:`, `anatomy:`, `constraint:` and `item:` build repeated visual items. `:::case` media paths must resolve to archived `assets/images/sha256-...` or `assets/videos/sha256-...` files; arbitrary external media is not accepted. A video and Prompt must remain separate cases when the source does not explicitly establish their relationship. Prompt Library uses exactly one outer Case rectangle per case; nested bordered cards are prohibited. The Viewer sanitizes the resulting HTML; do not use the directive system to inject arbitrary markup or scripts.

## Rollout rule

Do not transcribe every archived video before the deconstruction structure is validated. Start from the source article and evidence map, use only the evidence required for the analytical conclusions, then expand ASR/cases when a chapter has a real evidence gap.

For a new article, validate the deconstruction approach on the first one or two chapters before expanding the full chapter set. Once that pilot is accepted, complete the remaining chapters using the same source-deconstruction contract. If the source report has a coherent order, preserve it; if it is a fragment stream, reorganize only in the derived Explain layer and keep the canonical archive untouched.
