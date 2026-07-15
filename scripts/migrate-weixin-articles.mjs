import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const sourceRoot = "/Users/orange/content/weixin-skill/posts";
const projectRoot = path.resolve(import.meta.dirname, "..");
const contentRoot = path.join(projectRoot, "src/content/blog");
const assetRoot = path.join(projectRoot, "src/assets/weixin");
const preservedTargets = new Set([
  "zh/pcfi-prompt-injection",
  "zh/runtime-agnostic-agent",
  "en/pcfi-prompt-injection",
  "en/runtime-agnostic-agent",
]);
const refreshGenerated = process.argv.includes("--refresh");

async function discover(filename) {
  const articles = [];
  const dates = await readdir(sourceRoot, { withFileTypes: true });

  for (const date of dates.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dateDir = path.join(sourceRoot, date.name);
    const topics = await readdir(dateDir, { withFileTypes: true });
    for (const topic of topics.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dateDir, topic.name, filename);
      if (existsSync(file)) articles.push({ date: date.name, slug: topic.name, file });
    }
  }

  return articles;
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) return JSON.parse(trimmed);
  if (trimmed.startsWith("'")) return trimmed.slice(1, -1).replaceAll("''", "'");
  return trimmed;
}

const platformCtaPatterns = [
  /(?:欢迎\s*)?关注\s*(?:\*\*)?Guardrails AI/i,
  /(?:follow|subscribe to)\s+Guardrails AI/i,
  /(?:关注|添加).{0,12}(?:公众号|二维码)/i,
  /(?:扫码|扫描二维码)\s*(?:关注|添加|获取|回复|加入)/i,
  /^\s*(?:(?:点赞|转发|在看)(?:[、，,\s]+(?:点赞|转发|在看))*|后台回复|加入(?:读者|粉丝)群)\s*$/i,
];

function isPlatformCta(line) {
  const text = line.replace(/^>\s?/, "").trim();
  if (!text) return false;
  return platformCtaPatterns.some((pattern) => pattern.test(text));
}

function isBodyAuthorMetadata(line) {
  return /^\s*(?:作者|author)\s*[:：]\s*Guardrails AI\s*$/i.test(line.replace(/^>\s?/, ""));
}

function normalizeBody(body) {
  const lines = body.split(/\r?\n/);
  const cleaned = lines.filter((line) => !isPlatformCta(line) && !isBodyAuthorMetadata(line));

  return cleaned
    .map((line) => (line.trim() === ">" ? "" : line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseSource(markdown, fallbackDate) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) throw new Error("source article has no frontmatter");

  const metadata = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (field) metadata[field[1]] = field[2];
  }

  const title = parseScalar(metadata.title);
  const description = parseScalar(metadata.summary ?? metadata.description ?? '""');
  const tags = metadata.tags ? JSON.parse(metadata.tags) : undefined;
  const pubDate = metadata.date ? parseScalar(metadata.date) : fallbackDate;
  const cover = metadata.coverImage ?? metadata.cover ?? metadata.featureImage;
  const coverPath = cover ? parseScalar(cover) : undefined;
  let body = markdown.slice(match[0].length).trimStart();

  const firstHeading = body.match(/^#\s+(.+)\n+/);
  if (firstHeading && firstHeading[1].trim() === title.trim()) {
    body = body.slice(firstHeading[0].length).trimStart();
  }

  return { title, description, tags, pubDate, coverPath, body: normalizeBody(body) };
}

async function copyAsset(articleDir, slug, relativePath) {
  const source = path.resolve(articleDir, relativePath);
  if (!existsSync(source)) throw new Error(`${slug}: missing source asset ${relativePath}`);

  const pathWithinImages = relativePath.replace(/^imgs\//, "");
  const target = path.join(assetRoot, slug, pathWithinImages);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return pathWithinImages;
}

async function migrateArticle({ date, slug, file }, lang) {
  const target = path.join(contentRoot, lang, `${slug}.md`);
  if (existsSync(target) && (!refreshGenerated || preservedTargets.has(`${lang}/${slug}`))) {
    return { status: "skipped", slug, lang, assets: 0 };
  }

  const articleDir = path.dirname(file);
  const source = await readFile(file, "utf8");
  const parsed = parseSource(source, date);
  const referencedAssets = new Set();

  const body = parsed.body.replace(/\]\(imgs\/([^)]+)\)/g, (_match, imagePath) => {
    referencedAssets.add(`imgs/${imagePath}`);
    return `](../../../assets/weixin/${slug}/${imagePath})`;
  });

  if (parsed.coverPath) referencedAssets.add(parsed.coverPath);
  for (const asset of referencedAssets) await copyAsset(articleDir, slug, asset);

  const coverFile = parsed.coverPath?.replace(/^imgs\//, "");
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(parsed.title)}`,
    `description: ${JSON.stringify(parsed.description)}`,
    `pubDate: ${parsed.pubDate}`,
    parsed.tags ? `tags: ${JSON.stringify(parsed.tags)}` : undefined,
    coverFile ? `heroImage: ../../../assets/weixin/${slug}/${coverFile}` : undefined,
    "---",
  ].filter(Boolean).join("\n");

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${frontmatter}\n\n${body.trimEnd()}\n`, "utf8");
  return { status: "created", slug, lang, assets: referencedAssets.size };
}

async function migrateLanguage(lang, filename) {
  const results = [];
  for (const article of await discover(filename)) results.push(await migrateArticle(article, lang));
  return results;
}

const results = [
  ...(await migrateLanguage("zh", "article.md")),
  ...(await migrateLanguage("en", "article-en.md")),
];

const createdChinese = results.filter((result) => result.lang === "zh" && result.status === "created").length;
const createdEnglish = results.filter((result) => result.lang === "en" && result.status === "created").length;
const copiedAssets = results.reduce((total, result) => total + result.assets, 0);

console.log(`${createdChinese} Chinese created`);
console.log(`${createdEnglish} English created`);
console.log(`${copiedAssets} article assets copied`);
