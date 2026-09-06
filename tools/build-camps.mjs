#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const OUTPUT_DIR = join(ROOT, "dist");
export const SITE = "https://orangeapple.co";

export const pageUrl = (slug) => `${SITE}/camps/${slug}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function campFiles() {
  return readdirSync(join(ROOT, "content", "camps")).filter((f) => f.endsWith(".json")).sort();
}

export function readCamp(file) {
  const camp = JSON.parse(readFileSync(join(ROOT, "content", "camps", file), "utf8"));
  const expected = file.replace(/\.json$/, "");
  if (camp.slug !== expected) throw new Error(`${file}: slug「${camp.slug}」與檔名不符`);
  for (const f of ["slug", "name", "body", "meta"]) {
    if (!camp[f]) throw new Error(`${file}: 缺少必填欄位 ${f}`);
  }
  return camp;
}

// 資產前綴：正式站掛在 /camps、GitHub Pages 預覽掛在 /oa-page-camps。
// 兩者都是根絕對路徑，才不會被「網址有沒有尾斜線」影響（相對路徑 ../assets 會）。
export function basePath(common) {
  const b = process.env.OA_BASE ?? common.base_path ?? "";
  if (b && !b.startsWith("/")) throw new Error(`OA_BASE 必須以 / 開頭，收到「${b}」`);
  return b.replace(/\/$/, "");
}

export function readSources() {
  const common = JSON.parse(readFileSync(join(ROOT, "content", "shared", "camps_common.json"), "utf8"));
  for (const f of ["season", "season_type"]) {
    if (!common[f]) throw new Error(`camps_common.json 缺少必填欄位 ${f}`);
  }
  return { common, template: readFileSync(join(ROOT, "templates", "camp-page.html"), "utf8") };
}

// {{SEASON}} / {{SEASON_TYPE}} 由共用檔帶入，年份季節只改一處
const applySeason = (text, common) =>
  String(text).replace(/\{\{SEASON\}\}/g, common.season).replace(/\{\{SEASON_TYPE\}\}/g, common.season_type)
    .replace(/\{\{SEASON_SHORT\}\}/g, common.season_short)
    .replace(/\{\{SEASON_WORD\}\}/g, common.season_word)
    .replace(/\{\{BASE\}\}/g, basePath(common));

function graphJsonLd(camp, title, description, url) {
  const org = {
    "@type": ["EducationalOrganization", "Organization"],
    "@id": `${SITE}/#organization`,
    name: "橘子蘋果程式學苑", url: `${SITE}/`,
    logo: `${SITE}/logo-2023-color.svg`, foundingDate: "2012",
    sameAs: ["https://www.facebook.com/OrangeApplePad", "https://www.instagram.com/orangeapple.tw/", "https://www.youtube.com/@orangeapple-academy"],
  };
  const breadcrumb = {
    "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "寒暑假營隊", item: `${SITE}/camps` },
      { "@type": "ListItem", position: 3, name: camp.name, item: url },
    ],
  };
  const webpage = { "@type": "WebPage", "@id": `${url}#webpage`, url, name: title, description, inLanguage: "zh-TW", about: { "@id": `${SITE}/#organization` } };
  const courses = (camp.courses_for_schema || []).map((c) => ({
    "@type": "Course", name: c.name, description: c.description,
    provider: { "@id": `${SITE}/#organization` }, educationalLevel: c.grade, courseMode: "onsite",
  }));
  return '  <script type="application/ld+json">' + JSON.stringify({ "@context": "https://schema.org", "@graph": [org, breadcrumb, webpage, ...courses] }) + "</script>";
}

// 「營隊比一比」由 camp.comparison.columns 產生：拿掉一個營隊＝刪掉一項，
// 桌機與手機兩張表同時少一欄，不會留下空白欄（2026-09-06 之前是畫死的圖，所以做不到）。
export function comparisonTable(camp) {
  const cmp = camp.comparison;
  if (!cmp) return null;   // 沒抽成 JSON 的頁，比較表就留在 body 裡的原始 HTML
  if (!Array.isArray(cmp.columns) || cmp.columns.length === 0) {
    throw new Error(`${camp.slug}: comparison.columns 至少要有一個營隊`);
  }
  const li = (item) =>
    typeof item === "string"
      ? `<li>${esc(item)}</li>`
      : `<li>${item.accent ? `<span class="text-other-orange">${esc(item.text)}</span>` : esc(item.text)}</li>`;
  const list = (items, col, key) => {
    if (!Array.isArray(items) || items.length === 0) throw new Error(`${camp.slug}: 「${col.subtitle}」缺少 ${key}`);
    return `<td><ul>${items.map(li).join("")}</ul></td>`;
  };
  // 標籤欄要 150px 才容得下左上角那顆 150px 的 MINECRAFT logo；其餘寬度由營隊平分
  const colW = `calc((100% - 150px) / ${cmp.columns.length})`;
  const head =
    '<tr><th style="width: 150px;"></th>' +
    cmp.columns.map((c) =>
      `<th class="text-center" style="width: ${colW};">${esc(c.title)}<br/><div class="text-white p-1 mt-1" style="display: inline-block;">${esc(c.subtitle)}</div></th>`
    ).join("") + "</tr>";
  const fit =
    '<tr><td class="text-center" style="background-color: #ffd52f;font-size: 1.2rem;font-weight: bold">適合</td>' +
    cmp.columns.map((c) =>
      `<td class="text-center" style="background-color: #ffd52f;">${c.fit.map(esc).join("<br/>")}</td>`
    ).join("") + "</tr>";
  const row = (label, key) =>
    `<tr><td class="text-center" style="font-size: 1.2rem;font-weight: bold">${label}</td>` +
    cmp.columns.map((c) => list(c[key], c, key)).join("") + "</tr>";
  return `<table>${head}${fit}${row("營隊<br/>特色", "features")}${row("學習<br/>技能", "skills")}${row("成果<br/>收穫", "outcome")}</table>`;
}

export function buildAll({ quiet = false } = {}) {
  const { common, template } = readSources();
  if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  cpSync(join(ROOT, "assets"), join(OUTPUT_DIR, "assets"), { recursive: true });
  cpSync(join(ROOT, "templates", "css"), join(OUTPUT_DIR, "css"), { recursive: true });

  const results = [];
  for (const file of campFiles()) {
    const camp = readCamp(file);
    const bodyPath = join(ROOT, "templates", "bodies", camp.body);
    if (!existsSync(bodyPath)) throw new Error(`${file}: 找不到 body 檔 ${camp.body}`);
    const table = comparisonTable(camp);
    let body = applySeason(readFileSync(bodyPath, "utf8"), common);
    if (table) body = body.replace(/\{\{COMPARISON_DESKTOP\}\}/g, table).replace(/\{\{COMPARISON_MOBILE\}\}/g, table);
    const title = applySeason(camp.meta.title, common) + " — 橘子蘋果程式學苑";
    const description = applySeason(camp.meta.description, common);
    const url = pageUrl(camp.slug);
    const html = applySeason(template, common)
      .replace(/\{\{SLUG\}\}/g, camp.slug)
      .replace(/\{\{TITLE\}\}/g, esc(title))
      .replace(/\{\{DESCRIPTION\}\}/g, esc(description))
      .replace(/\{\{PAGE_URL\}\}/g, url)
      .replace("{{GRAPH_JSON_LD}}", graphJsonLd(camp, title, description, url))
      .replace("{{BODY}}", body);
    mkdirSync(join(OUTPUT_DIR, camp.slug), { recursive: true });
    writeFileSync(join(OUTPUT_DIR, camp.slug, "index.html"), html, "utf8");
    results.push({ slug: camp.slug, name: camp.name, bytes: html.length });
    if (!quiet) console.log(`  ${camp.slug.padEnd(12)} ${camp.name.padEnd(10)} ${String(Math.round(html.length / 1024)).padStart(3)} KB  → dist/${camp.slug}/index.html`);
  }
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    results.map((r) => `  <url><loc>${pageUrl(r.slug)}</loc></url>`).join("\n") + "\n</urlset>\n";
  writeFileSync(join(OUTPUT_DIR, "sitemap.xml"), sitemap, "utf8");
  if (!quiet) console.log(`  營隊 sitemap                          → dist/sitemap.xml\n\n完成：${results.length} 頁。`);
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) buildAll();
