# Weixin Article Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every canonical Weixin article and every complete English variant into the Astro blog without importing platform-specific derivative drafts.

**Architecture:** Treat `/Users/orange/content/weixin-skill/posts/YYYY-MM-DD/<slug>/article.md` as the canonical Chinese source and `article-en.md` as an optional English source. Use two passes: a deterministic Node script handles frontmatter, duplicate titles, platform CTA cleanup, image-reference rewriting, and selective asset copying; a focused editorial review checks that the result reads like a technical blog post rather than a WeChat distribution draft.

**Tech Stack:** Node.js built-ins, Astro Content Collections, Markdown, Node.js built-in test runner.

## Global Constraints

- Migrate 33 canonical Chinese articles, preserving the 2 already present and adding 31.
- Migrate 5 complete English variants, preserving the 2 already present and adding 3.
- Exclude Zhihu variants, Xiaohongshu content, render files, research notes, test samples, and interactive applications.
- Map `summary` to `description`, the containing date directory or explicit `date` to `pubDate`, and preserve `tags`.
- Copy only the selected cover and images referenced by migrated Markdown.
- Preserve existing blog routes and do not overwrite the two manually migrated bilingual articles.
- Keep technical claims, code, tables, citations, useful quotes, and referenced images; do not mechanically flatten the article structure.
- Remove publishing-language residue such as `关注 Guardrails AI`, `Follow Guardrails AI`, QR-code prompts, like/share/read-group prompts, and duplicate author/cover metadata.
- Keep source attribution and technical references even when they mention the original publishing channel.

---

### Task 1: Migration Coverage Contract

**Files:**
- Create: `tests/weixin-content-migration.test.mjs`

**Interfaces:**
- Consumes: source Weixin post directories and `src/content/blog/{zh,en}`.
- Produces: assertions that every canonical source slug exists in Chinese, every English variant exists in English, required Astro frontmatter is present, and every rewritten local image exists.

- [x] **Step 1: Write the failing coverage test**

The test enumerates canonical source files by basename, compares them with blog Markdown filenames, parses each generated frontmatter block, and resolves every `../../../assets/weixin/` image reference against the Markdown file.

- [x] **Step 2: Verify the coverage test fails**

```bash
node --test tests/weixin-content-migration.test.mjs
```

Expected: FAIL listing the 31 missing Chinese slugs and 3 missing English slugs.

### Task 2: Deterministic Content and Image Migration

**Files:**
- Create: `scripts/migrate-weixin-articles.mjs`
- Create: `src/content/blog/zh/<31-source-slugs>.md`
- Create: `src/content/blog/en/clawxray-ebpf-agent-observability.md`
- Create: `src/content/blog/en/claude-security-decoded.md`
- Create: `src/content/blog/en/finance-agents-four-controls.md`
- Create: `src/assets/weixin/<source-slug>/<referenced-images>`

**Interfaces:**
- Consumes: `article.md`, optional `article-en.md`, source frontmatter keys `title`, `summary`, `date`, `tags`, `coverImage`, `cover`, and relative `imgs/` references.
- Produces: Astro-compatible Markdown with `title`, `description`, `pubDate`, optional `tags`, optional `heroImage`, and resolvable asset imports.

- [x] **Step 1: Implement the migration script**

The script must use only Node built-ins, skip targets that already exist, JSON-quote string and array frontmatter values, derive dates from the directory when absent, remove the first body H1 when it matches the frontmatter title, remove only explicit platform-publishing CTA lines, rewrite `](imgs/<path>)` to `](../../../assets/weixin/<slug>/<path>)`, and copy the rewritten image plus the selected cover while preserving subdirectories.

- [x] **Step 2: Run the migration**

```bash
node scripts/migrate-weixin-articles.mjs
```

Expected: report `31 Chinese created`, `3 English created`, and no missing assets.

- [x] **Step 3: Run migration and design contracts**

```bash
node --test tests/design-contract.test.mjs tests/weixin-content-migration.test.mjs
```

Expected: all tests pass with zero failures.

### Task 2b: Editorial Blogification Review

**Files:**
- Modify: `scripts/migrate-weixin-articles.mjs`
- Modify: `tests/weixin-content-migration.test.mjs`
- Review: generated Markdown under `src/content/blog/{zh,en}`

- [x] **Step 1: Verify platform language is absent**

Assert that generated bodies contain no explicit follow/like/share/QR/group CTA and no duplicate body H1. The check must be phrase-specific so technical uses of words such as “关注” or “转发” remain intact.

- [x] **Step 2: Manually inspect representative articles**

Review a short article, a long technical analysis, an English article, and an image-heavy article. Confirm that the page frontmatter owns title/date/cover metadata, that technical opening context remains, and that lists, code, tables, references, and useful images are preserved.

### Task 3: Astro Production Verification

**Files:**
- Modify only generated content or assets found invalid by Astro.

**Interfaces:**
- Consumes: all migrated Markdown and assets.
- Produces: valid static routes for 38 Chinese posts and 10 English posts.

- [x] **Step 1: Build the complete site**

```bash
npm run build
```

Expected: Astro builds 48 article routes plus home, archive, about, and RSS routes without content-schema errors, missing-image errors, or platform-language residue in generated article bodies.

- [x] **Step 2: Verify route counts and representative output**

```bash
find dist/blog -mindepth 1 -maxdepth 1 -type d | wc -l
find dist/en/blog -mindepth 1 -maxdepth 1 -type d | wc -l
```

Expected: `38` Chinese article directories and `10` English article directories.

- [x] **Step 3: Commit the migration**

```bash
git add docs/superpowers/plans/2026-07-14-weixin-article-migration.md scripts/migrate-weixin-articles.mjs tests/weixin-content-migration.test.mjs src/content/blog src/assets/weixin
git commit -m "feat: migrate weixin articles into blog"
```
