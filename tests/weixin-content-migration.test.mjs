import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const sourceRoot = "/Users/orange/content/weixin-skill/posts";
const blogRoot = path.resolve("src/content/blog");

async function sourceArticles(filename) {
  const dates = await readdir(sourceRoot, { withFileTypes: true });
  const articles = [];

  for (const date of dates.filter((entry) => entry.isDirectory())) {
    const dateDir = path.join(sourceRoot, date.name);
    const topics = await readdir(dateDir, { withFileTypes: true });
    for (const topic of topics.filter((entry) => entry.isDirectory())) {
      const file = path.join(dateDir, topic.name, filename);
      if (existsSync(file)) articles.push({ date: date.name, slug: topic.name, file });
    }
  }

  return articles.sort((a, b) => a.file.localeCompare(b.file));
}

function frontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, "generated article must contain frontmatter");
  return match[1];
}

const platformCtaPatterns = [
  /(?:欢迎\s*)?关注\s*(?:\*\*)?Guardrails AI/i,
  /(?:follow|subscribe to)\s+Guardrails AI/i,
  /(?:关注|添加).{0,12}(?:公众号|二维码)/i,
  /(?:扫码|扫描二维码)\s*(?:关注|添加|获取|回复|加入)/i,
  /^\s*(?:(?:点赞|转发|在看)(?:[、，,\s]+(?:点赞|转发|在看))*|后台回复|加入(?:读者|粉丝)群)\s*$/i,
];

const preservedTargets = new Set([
  "zh/pcfi-prompt-injection",
  "zh/runtime-agnostic-agent",
  "en/pcfi-prompt-injection",
  "en/runtime-agnostic-agent",
]);

function metadataValue(metadata, field) {
  const match = metadata.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  assert.ok(match, `generated article missing ${field}`);
  return JSON.parse(match[1]);
}

test("every canonical Weixin article has a blog target", async () => {
  const chinese = await sourceArticles("article.md");
  const english = await sourceArticles("article-en.md");
  const missingChinese = chinese.filter(({ slug }) => !existsSync(path.join(blogRoot, "zh", `${slug}.md`))).map(({ slug }) => slug);
  const missingEnglish = english.filter(({ slug }) => !existsSync(path.join(blogRoot, "en", `${slug}.md`))).map(({ slug }) => slug);

  assert.equal(chinese.length, 33);
  assert.equal(english.length, 5);
  assert.deepEqual(missingChinese, [], `missing Chinese articles: ${missingChinese.join(", ")}`);
  assert.deepEqual(missingEnglish, [], `missing English articles: ${missingEnglish.join(", ")}`);
});

test("migrated articles satisfy the Astro schema and resolve local images", async () => {
  const sources = [
    ...(await sourceArticles("article.md")).map((article) => ({ ...article, lang: "zh" })),
    ...(await sourceArticles("article-en.md")).map((article) => ({ ...article, lang: "en" })),
  ];

  for (const { slug, lang } of sources) {
    const target = path.join(blogRoot, lang, `${slug}.md`);
    if (!existsSync(target)) continue;
    const markdown = await readFile(target, "utf8");
    const metadata = frontmatter(markdown);

    assert.match(metadata, /^title:\s*.+$/m, `${lang}/${slug} missing title`);
    assert.match(metadata, /^description:\s*.+$/m, `${lang}/${slug} missing description`);
    assert.match(metadata, /^pubDate:\s*\d{4}-\d{2}-\d{2}$/m, `${lang}/${slug} missing pubDate`);

    const references = [
      ...[...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]),
      ...[...metadata.matchAll(/^heroImage:\s*(.+)$/gm)].map((match) => match[1].trim()),
    ].filter((reference) => !/^(?:https?:|data:)/.test(reference));

    for (const reference of references) {
      const cleanReference = reference.replace(/^['"]|['"]$/g, "").split(/[?#]/)[0];
      assert.ok(existsSync(path.resolve(path.dirname(target), cleanReference)), `${lang}/${slug} missing image ${cleanReference}`);
    }
  }
});

test("migrated articles read as blog posts without publishing CTAs", async () => {
  const sources = [
    ...(await sourceArticles("article.md")).map((article) => ({ ...article, lang: "zh" })),
    ...(await sourceArticles("article-en.md")).map((article) => ({ ...article, lang: "en" })),
  ];

  for (const { slug, lang } of sources) {
    if (preservedTargets.has(`${lang}/${slug}`)) continue;
    const target = path.join(blogRoot, lang, `${slug}.md`);
    assert.ok(existsSync(target), `${lang}/${slug} should be migrated before editorial checks`);
    const markdown = await readFile(target, "utf8");
    const metadata = frontmatter(markdown);
    const title = metadataValue(metadata, "title");
    const body = markdown.replace(/^---\n[\s\S]*?\n---\n?/, "");

    assert.doesNotMatch(body, new RegExp(`^#\\s+${title.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*$`, "m"), `${lang}/${slug} repeats its page title in the body`);
    for (const line of body.split(/\r?\n/)) {
      for (const pattern of platformCtaPatterns) {
        assert.equal(pattern.test(line.replace(/^>\s?/, "")), false, `${lang}/${slug} contains publishing CTA: ${line}`);
      }
    }
  }
});
