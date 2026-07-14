import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("shared shell exposes the clear domain brand and design tokens", async () => {
  const [header, globalCss] = await Promise.all([
    read("src/components/Header.astro"),
    read("src/styles/global.css"),
  ]);

  assert.match(header, /ugorange\.com/);
  assert.doesNotMatch(header, />\/log</);
  assert.match(globalCss, /--surface:/);
  assert.match(globalCss, /--reading-width:/);
});

test("literal sandbox status language is absent from UI components", async () => {
  const components = await Promise.all([
    read("src/components/Header.astro"),
    read("src/components/Footer.astro"),
  ]);

  for (const source of components) {
    assert.doesNotMatch(source, /sandbox online/i);
  }
});

test("bilingual home pages share the clear editorial structure", async () => {
  const [zhHome, enHome, translations] = await Promise.all([
    read("src/pages/index.astro"),
    read("src/pages/en/index.astro"),
    read("src/i18n/ui.ts"),
  ]);

  for (const source of [zhHome, enHome]) {
    assert.match(source, /class="home-intro"/);
    assert.match(source, /class="topic-line"/);
    assert.match(source, /class="post-stream"/);
  }

  assert.match(translations, /构建更安全的智能系统/);
  assert.match(translations, /Building safer intelligent systems/);
  assert.doesNotMatch(translations, /sandbox online/i);
});

test("bilingual archives use a linear article index", async () => {
  const archives = await Promise.all([
    read("src/pages/blog/index.astro"),
    read("src/pages/en/blog/index.astro"),
  ]);

  for (const source of archives) {
    assert.match(source, /class="archive-list"/);
    assert.match(source, /class="archive-entry"/);
    assert.match(source, /post\.data\.description/);
    assert.match(source, /post\.data\.tags/);
    assert.doesNotMatch(source, /li:first-child/);
  }
});

test("articles and about pages share the focused reading layout", async () => {
  const [layout, zhAbout, enAbout, giscus] = await Promise.all([
    read("src/layouts/BlogPost.astro"),
    read("src/pages/about.astro"),
    read("src/pages/en/about.astro"),
    read("src/components/Giscus.astro"),
  ]);

  assert.match(layout, /class="article-shell"/);
  assert.match(layout, /class="article-header"/);
  for (const source of [zhAbout, enAbout]) {
    assert.match(source, /class="about-shell"/);
    assert.match(source, /border: 1px solid var\(--border\)/);
    assert.doesNotMatch(source, /linear-gradient/);
  }
  assert.match(giscus, /theme: "dark"/);
});

test("mobile layouts cannot be widened by navigation or long titles", async () => {
  const [header, zhHome, zhArchive] = await Promise.all([
    read("src/components/Header.astro"),
    read("src/pages/index.astro"),
    read("src/pages/blog/index.astro"),
  ]);

  assert.match(header, /min-width: 0/);
  assert.match(header, /nth-child\(2\)/);
  assert.match(zhHome, /overflow-wrap: anywhere/);
  assert.match(zhArchive, /overflow-wrap: anywhere/);
});
