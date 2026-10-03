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

Public chapters should reuse cases instead of independently re-analysing the same video. Cases support the teaching point; they do not define the public chapter structure.

## Learner-first authoring contract

The technical capability keeps the internal name `Explain` and the route remains `/explain/<folder>/` for compatibility. The normal public UI should call the result **学习版**.

The source report is an evidence and knowledge source, not the chapter outline. Do not paraphrase the source section-by-section and call that a learning version. Rebuild the material around what a learner needs to understand, remember, judge, transfer and review.

Target learning progression:

```text
看懂
↓
记住
↓
会判断
↓
会套用
↓
能复盘
```

Preferred transformation pipeline:

```text
原始文章
↓
事实 / 数据 / 作者判断 / 案例拆分
↓
知识地图
↓
学习目标
↓
概念依赖顺序
↓
学习章节设计
↓
挂载原文证据 / Evidence Case
↓
章节撰写
↓
学习者判断题 / 迁移练习
↓
教学质量复核
```

A chapter should normally move through the following teaching logic when those parts are useful. This is a teaching checklist, not a rigid prose template:

1. state the learner question or outcome;
2. give the core conclusion early;
3. show the minimum source evidence needed;
4. translate the evidence into a simple mental model;
5. explain why the mechanism works;
6. attach a representative real case when it adds evidence;
7. show a common mistake or counterexample;
8. transfer the idea to another product or situation;
9. require the learner to make a judgment or complete a small exercise;
10. finish with a small set of durable takeaways, usually three.

Quality gates:

- A chapter should not merely be an easier rewrite of the source report.
- Keep source facts, source/marketing claims, project interpretation and independently verified external facts distinguishable.
- Evidence supports a teaching point; the existence or order of Evidence Cases must not dictate the chapter outline.
- Do not transplant unverified medical, safety, performance or regulatory claims into a new product merely because the source creative used them.
- A successful chapter should leave the learner able to explain the concept in plain language, diagnose a new example and transfer the method to another brief.
- Prefer a small number of meaningful examples over exhaustive repetition.
- Public navigation should expose only `status=ready` chapters with an existing Markdown file.

## Rollout rule

Do not transcribe every archived video before the teaching structure is validated. Start from the source article and method map, use only a small representative evidence set, then author a few public chapters first. Expand ASR/cases only when a chapter has a real evidence gap.

For a new article, validate the learning approach on the first one or two chapters before expanding the full chapter set. Once that pilot is accepted, complete the remaining chapters using the same learning contract rather than reverting to source-order paraphrasing.
