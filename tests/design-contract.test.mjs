import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("shared shell exposes the approved brand and design tokens", async () => {
  const [header, globalCss] = await Promise.all([
    read("src/components/Header.astro"),
    read("src/styles/global.css"),
  ]);

  assert.match(header, /ugorange\.com/);
  assert.match(header, /\/log/);
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
