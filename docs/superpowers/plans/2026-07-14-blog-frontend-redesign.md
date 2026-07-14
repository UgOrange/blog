# Blog Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the bilingual Astro blog presentation as a clear, restrained `ugorange.com` technical journal with an implicit AI and isolation-boundary visual language.

**Architecture:** Keep the existing Astro routes, content collections, and components. Centralize color, typography, spacing, focus, and prose behavior in `src/styles/global.css`; keep navigation and footer rules in their components; keep only structural page-specific rules inside each Astro page and the blog layout.

**Tech Stack:** Astro 5, Astro Content Collections, scoped Astro CSS, CSS custom properties, Node.js built-in test runner.

## Global Constraints

- Site identity and header brand are both `ugorange.com`.
- Use near-black charcoal, high-contrast off-white, readable gray, and one low-saturation mint accent.
- Do not add a UI framework or change content schemas, routes, RSS, sitemap, SEO, or Giscus behavior.
- Do not use literal terminal prompts, fake commands, window chrome, `sandbox online` labels, glowing effects, decorative gradients, or excessive animation.
- Preserve Chinese and English page parity.
- Respect `prefers-reduced-motion` and provide visible keyboard focus states.

---

### Task 1: Shared Design System, Header, and Footer

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/components/Header.astro`
- Modify: `src/components/HeaderLink.astro`
- Modify: `src/components/Footer.astro`
- Create: `tests/design-contract.test.mjs`

**Interfaces:**
- Consumes: existing `NAV_LINKS`, `AUTHOR`, language helpers, and global CSS import from `BaseHead.astro`.
- Produces: global CSS tokens (`--surface`, `--surface-raised`, `--text`, `--text-muted`, `--accent`, `--border`, `--content-width`, `--reading-width`) and stable `.shell-label` / `.page-heading` utilities for page tasks.

- [ ] **Step 1: Add failing design-contract assertions**

Create a Node test that reads source files and asserts the header includes the clear `ugorange.com` domain brand, global CSS defines the new surface and reading tokens, and no component contains `SANDBOX ONLINE`.

- [ ] **Step 2: Run the contract test and confirm failure**

Run: `node --test tests/design-contract.test.mjs`

Expected: FAIL because the current header and CSS still use the old Bear Blog design.

- [ ] **Step 3: Implement global tokens and component shells**

Replace Bear Blog defaults with the approved charcoal system, readable type scale, accessible focus styles, responsive spacing, prose defaults, and reduced-motion handling. Rebuild the header as a thin bordered bar with `ugorange.com`, compact route links, language switcher, and quiet GitHub link. Rebuild the footer as one compact metadata row containing copyright, GitHub, email, and RSS.

- [ ] **Step 4: Run tests and build**

Run: `node --test tests/design-contract.test.mjs && npm run build`

Expected: all Node tests pass and Astro exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css src/components/Header.astro src/components/HeaderLink.astro src/components/Footer.astro tests/design-contract.test.mjs
git commit -m "feat: add minimal shell design system"
```

### Task 2: Chinese and English Home Pages

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/pages/en/index.astro`
- Modify: `src/i18n/ui.ts`
- Modify: `tests/design-contract.test.mjs`

**Interfaces:**
- Consumes: shared design tokens and utilities from Task 1, existing localized content collection filtering, `FormattedDate`, and translation helpers.
- Produces: matching Chinese and English hero structures and `.post-stream` article lists reused conceptually by the index pages.

- [ ] **Step 1: Add failing home-page assertions**

Assert both home pages contain the shared semantic classes `home-intro`, `topic-line`, and `post-stream`, and translations include concise professional positioning copy without literal sandbox status language.

- [ ] **Step 2: Run the contract test and confirm failure**

Run: `node --test tests/design-contract.test.mjs`

Expected: FAIL because the current pages use `hero`, `recent-posts`, and the generic welcome copy.

- [ ] **Step 3: Implement both home pages**

Add the positioning label, clear headline, short introduction, subject line, and three-row recent article stream. Use the actual title, description, and date fields. Keep links server-rendered and route-correct for each language.

- [ ] **Step 4: Run tests and build**

Run: `node --test tests/design-contract.test.mjs && npm run build`

Expected: all tests pass and both `/index.html` and `/en/index.html` build.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro src/pages/en/index.astro src/i18n/ui.ts tests/design-contract.test.mjs
git commit -m "feat: redesign bilingual home pages"
```

### Task 3: Bilingual Blog Index

**Files:**
- Modify: `src/pages/blog/index.astro`
- Modify: `src/pages/en/blog/index.astro`
- Modify: `tests/design-contract.test.mjs`

**Interfaces:**
- Consumes: content collection entries with `title`, `description`, `pubDate`, `tags`, and optional `heroImage`; shared Task 1 tokens.
- Produces: equivalent `.archive-list` and `.archive-entry` structures for Chinese and English routes.

- [ ] **Step 1: Add failing archive assertions**

Assert both index pages contain `archive-list` and `archive-entry`, render descriptions and tags, and no longer contain the first-child oversized-card rule.

- [ ] **Step 2: Run the contract test and confirm failure**

Run: `node --test tests/design-contract.test.mjs`

Expected: FAIL because the current archive uses a two-column image card grid and special first item.

- [ ] **Step 3: Implement the linear archive**

Render every article as a bordered row with date, title, description, optional tags, and directional link indicator. Keep images out of the index stream so mixed image availability does not distort hierarchy.

- [ ] **Step 4: Run tests and build**

Run: `node --test tests/design-contract.test.mjs && npm run build`

Expected: all tests pass and localized blog index output is generated.

- [ ] **Step 5: Commit**

```bash
git add src/pages/blog/index.astro src/pages/en/blog/index.astro tests/design-contract.test.mjs
git commit -m "feat: rebuild bilingual article archive"
```

### Task 4: Article and About Reading Experience

**Files:**
- Modify: `src/layouts/BlogPost.astro`
- Modify: `src/pages/about.astro`
- Modify: `src/pages/en/about.astro`
- Modify: `src/components/Giscus.astro`
- Modify: `tests/design-contract.test.mjs`

**Interfaces:**
- Consumes: `--reading-width`, global prose rules, localized dates, existing article slots, and Giscus configuration.
- Produces: `.article-shell`, `.article-header`, `.about-shell`, and `.comments-section` structures using a consistent reading column.

- [ ] **Step 1: Add failing reading-layout assertions**

Assert the blog layout contains `article-shell` and `article-header`, both about pages contain `about-shell`, certification labels use an outlined style, and Giscus keeps dark color-scheme configuration.

- [ ] **Step 2: Run the contract test and confirm failure**

Run: `node --test tests/design-contract.test.mjs`

Expected: FAIL because the current layout uses the old centered title and colorful certification gradient.

- [ ] **Step 3: Implement article and about layouts**

Move article metadata above a left-aligned high-contrast title, constrain optional hero images to the reading context, apply global prose rules, and separate comments with a boundary. Restyle both about pages with the same reading width, compact section labels, quiet certification chips, and simplified contact links.

- [ ] **Step 4: Run tests and build**

Run: `node --test tests/design-contract.test.mjs && npm run build`

Expected: all tests pass and every article/about route builds.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/BlogPost.astro src/pages/about.astro src/pages/en/about.astro src/components/Giscus.astro tests/design-contract.test.mjs
git commit -m "feat: refine article and about reading layouts"
```

### Task 5: Production and Visual Verification

**Files:**
- Modify only files found defective during verification.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: verified production output across representative Chinese and English routes.

- [ ] **Step 1: Run full automated verification**

Run: `node --test tests/design-contract.test.mjs && npm run build`

Expected: all tests pass and Astro exits with code 0.

- [ ] **Step 2: Start the production preview**

Run: `npm run preview -- --host 127.0.0.1`

Expected: Astro prints a local preview URL and remains running.

- [ ] **Step 3: Inspect representative pages**

Verify `/`, `/en/`, `/blog/`, `/en/blog/`, `/about/`, `/en/about/`, and one Chinese and English article at desktop and mobile widths. Confirm readable contrast, natural title wrapping, correct active navigation, language links, image containment, code blocks, footer, and comments spacing.

- [ ] **Step 4: Re-run verification after any correction**

Run: `node --test tests/design-contract.test.mjs && npm run build`

Expected: all tests pass and Astro exits with code 0.

- [ ] **Step 5: Commit verification fixes when present**

```bash
git add src/styles/global.css src/components/Header.astro src/components/HeaderLink.astro src/components/Footer.astro src/components/Giscus.astro src/pages/index.astro src/pages/en/index.astro src/pages/blog/index.astro src/pages/en/blog/index.astro src/pages/about.astro src/pages/en/about.astro src/layouts/BlogPost.astro tests/design-contract.test.mjs
git commit -m "fix: polish responsive blog presentation"
```
