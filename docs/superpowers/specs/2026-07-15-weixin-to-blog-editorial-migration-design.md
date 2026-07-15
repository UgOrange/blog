# Weixin to Blog Editorial Migration Design

## Goal

Migrate the canonical articles from `/Users/orange/content/weixin-skill` into the Astro blog while adapting them from WeChat publishing conventions to durable, content-first technical blog posts.

## Scope

- Import all 33 canonical Chinese `article.md` files, preserving the 2 articles already migrated and adding 31.
- Import all 5 complete English `article-en.md` variants, preserving the 2 already migrated and adding 3.
- Exclude Zhihu variants, Xiaohongshu content, render files, research notes, samples, generated cards, and interactive applications.
- Preserve technical claims, data, quotations, code, external links, and useful explanatory images.

## Editorial Transformation

### Page-Owned Information

The blog layout, not the article body, owns the title, description, publication date, tags, and hero image. The migration removes the repeated body H1 and does not reproduce author or cover metadata inside the article.

### Introduction

- Start with the technical background, concrete problem, or main conclusion.
- Remove promotional hooks, urgency written only for social distribution, and repeated summaries already visible in the page header.
- Convert promotional blockquotes into ordinary prose.
- Keep blockquotes that quote a source, paper, product statement, or technically meaningful claim.

### Body Structure

- Preserve the logical order and technical meaning of the source.
- Retain headings that describe a stable topic or argument.
- Normalize headings such as “先说结论”, “为什么值得关注”, and other distribution-oriented labels when a clearer technical heading is available from the section content.
- Merge adjacent short paragraphs only when they express one continuous idea. Do not merge lists, code explanations, quotations, or deliberate step boundaries.
- Keep code blocks, tables, numbered procedures, citations, and external links unchanged unless path rewriting is required.

### Conclusion

- Keep technical conclusions, limitations, recommendations, and open questions.
- Remove calls to follow the account, scan a QR code, like, share, comment, join a group, or reply with a keyword.
- Remove standalone `Guardrails AI` promotional signatures.
- Do not invent a new conclusion when the source already ends on a substantive technical point.

### Images

- Use the selected cover as `heroImage` only; do not repeat it in the body.
- Copy images that are directly referenced by the retained Markdown body.
- Exclude social cards, QR codes, promotional posters, alternate upload formats, and unused render artifacts.
- Preserve meaningful captions and alt text.

## Metadata Mapping

- `title` → `title`
- `summary` → `description`
- explicit `date`, otherwise the `YYYY-MM-DD` source directory → `pubDate`
- `tags` → `tags`
- `coverImage`, `cover`, or `featureImage` → `heroImage`

String metadata is safely quoted for YAML. Existing manually migrated articles are not overwritten.

## Transformation Architecture

The migration has two layers:

1. A deterministic Node script handles discovery, metadata conversion, duplicate H1 removal, image path rewriting, asset copying, and explicit platform-call-to-action removal.
2. A focused editorial review pass checks each generated article’s opening, ending, headings, short-paragraph rhythm, retained images, and technical fidelity. Changes that require semantic judgment are made in the generated blog article, never in the source Weixin project.

The script must be idempotent for already-existing targets. Validation compares every canonical source slug with its expected blog target and checks all local image references.

## Validation

- Coverage tests prove that all 33 Chinese and 5 English sources have targets.
- Content tests require Astro-compatible `title`, `description`, and `pubDate` fields.
- Asset tests resolve every local Markdown image and hero image.
- A platform-language scan must find no account-following, QR-code, like/share, or reply-keyword calls to action in migrated targets.
- Astro must build 38 Chinese and 10 English article routes.
- Representative long, image-heavy, code-heavy, and bilingual articles receive visual inspection in the local preview.

## Non-Goals

- Rewriting technical claims, updating time-sensitive facts, or adding new research.
- Forcing every article into an identical outline.
- Translating Chinese-only articles into English.
- Importing platform-specific derivative content solely to increase article count.
