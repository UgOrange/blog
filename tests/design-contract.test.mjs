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
