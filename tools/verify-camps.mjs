#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAll, readSources, campFiles, readCamp, OUTPUT_DIR, pageUrl, basePath } from "./build-camps.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => { if (cond) { pass++; return; } failures.push(`${name}${detail ? " — " + detail : ""}`); };
const textOf = (h) => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");

console.log("營隊頁驗收\n");

const { common } = readSources();
const BASE = basePath(common);
const camps = campFiles().map(readCamp);
check("至少有一份營隊 JSON", camps.length > 0);
const built = buildAll({ quiet: true });
check("每份 JSON 都產生一頁", built.length === camps.length);

// 🔴 2027 寒假未開課清單（保旭 2026-09-04 確認）——這些字樣不得在頁面上復活
const NOT_RUNNING = ["材質模組設計營", "進階程式創客營", "進階班", "進階須上過", "全台唯一麥塊教育版", "參加過初階班", "4~7 年級", "小三到國一"];

for (const camp of camps) {
  const tag = `[${camp.slug}]`;
  const file = join(OUTPUT_DIR, camp.slug, "index.html");
  if (!existsSync(file)) { check(`${tag} 頁面產生`, false); continue; }
  const html = readFileSync(file, "utf8");
  const text = textOf(html);
  const url = pageUrl(camp.slug);

  check(`${tag} 無未填 placeholder`, !/\{\{[A-Z0-9_]+\}\}/.test(html));
  check(`${tag} canonical 指向自己`, html.includes(`<link rel="canonical" href="${url}">`));
  check(`${tag} og:url 指向自己`, html.includes(`<meta property="og:url" content="${url}">`));
  // 🔴 製作期（origin＝poshlin、開著公開的 GitHub Pages 預覽）必須 noindex，
  // 否則 Google 會收錄一份未發布的副本跟官網現行頁打架。上線當天改成 index。
  check(`${tag} 預覽期為 noindex`, /content="noindex, follow"/.test(html));
  check(`${tag} title 帶入當季年份`, html.includes(common.season));

  // 未開課內容不得復活
  for (const w of NOT_RUNNING) check(`${tag} 未開課內容「${w}」＝0`, !text.includes(w), w);

  // 保留內容
  for (const w of ["麥塊程式創客營", "影片創作營", "初階班課表", "麥塊影片營課表", "小三到小六"]) {
    check(`${tag} 保留內容「${w}」仍在`, text.includes(w), w);
  }

  // 圖片：不得殘留 data-src（靜態站沒有 lazy JS，會變成看不見的圖）
  const imgs = html.match(/<img[^>]*>/g) || [];
  // 🔴 自家檔案一律相對路徑：預覽站掛在 poshlin.github.io/oa-page-camps/ 底下，
  // 寫 "/assets/..." 會指到 poshlin.github.io 根目錄、整頁的圖與 CSS 全 404。
  // （站內連結如 /camps/registration、/privacy 指的是官網，維持根絕對路徑才對）
  // 自家資產一律「BASE + 根絕對路徑」：正式站 /camps、預覽站 /oa-page-camps。
  // 不能用 ../assets（會被尾斜線綁死），也不能裸寫 /assets（預覽站會 404）。
  check(`${tag} 資產前綴正確`, !html.includes('"../assets/') && !/(?:src|href)="\/(assets|css)\//.test(html) || BASE === "");
  check(`${tag} 資產都帶 BASE 前綴`, (html.match(new RegExp(`"${BASE}/(assets|css)/`, "g")) || []).length > 30);
  check(`${tag} 未殘留 BASE placeholder`, !html.includes("{{BASE}}"));
  // canonical／og:url 本來就是官網絕對網址，這裡只擋「外部載入的資源」（追蹤碼與字型圖示由 shell 管）
  const extLinks = (html.match(/<link[^>]*>/g) || []).filter((t) => t.includes("stylesheet") && /href="https?:/.test(t));
  check(`${tag} 無外部樣式表`, extLinks.length === 0, extLinks.join(" "));
  check(`${tag} 無外部 script`, !/<script[^>]+src="https?:/.test(html));

  check(`${tag} 圖片無 data-src 殘留`, !imgs.some((t) => t.includes("data-src")));
  check(`${tag} 圖片全部指向本 repo`, imgs.every((t) => !/src="https?:\/\/orangeapple\.co/.test(t)));
  const srcs = [...html.matchAll(/src="[^"]*?(assets\/[^"]+)"/g)].map((m) => m[1]);
  const missing = srcs.filter((s) => !existsSync(join(OUTPUT_DIR, s)));
  check(`${tag} 圖片檔案都存在`, missing.length === 0, missing.slice(0, 3).join(","));

  // 背景圖（style="background-image"）也要存在——只檢查 <img> 會漏掉整頁配色
  const bgUrls = [...html.matchAll(/url\((?:&#39;|['"])?[^)'"]*?(assets\/[^)'"]+?)(?:&#39;|['"])?\)/g)].map((m) => m[1]);
  const bgMissing = [...new Set(bgUrls)].filter((u) => !existsSync(join(OUTPUT_DIR, u)));
  check(`${tag} 背景圖檔案都存在`, bgMissing.length === 0, bgMissing.slice(0, 3).join(","));
  check(`${tag} 有背景圖（頁面配色沒掉）`, bgUrls.length >= 5, `僅 ${bgUrls.length} 張`);

  // 刪內容留下的「空殼」：容器還在、裡面的字被拿掉了，畫面會出現一顆沒有文字的按鈕
  // （2026-09-06 實際發生：移除「進階班課表」時只刪了 <a>，留下帶背景圖的空 div）
  check(`${tag} 無空殼按鈕（有背景圖卻沒內容）`, !/<div[^>]*background-image[^>]*>\s*<\/div>/.test(html));
  check(`${tag} 無空的 button-text`, !/<div class="button-text">\s*<\/div>/.test(html));

  // 🔴 圖片型的未開課內容：文字斷言完全抓不到（那些區塊標題是圖，有的連 alt 都沒有）
  // 2026-09-06 實際發生：手機版「材質模組設計營」標題圖 b_m_icon_3h.png 還在頁上，
  // 但因為它沒有 alt、也沒有任何文字，上面所有 NOT_RUNNING 斷言全部綠燈。
  const banned = camp.not_running_assets?.files || [];
  for (const f of banned) {
    check(`${tag} 未開課圖檔「${f}」未出現在頁面`, !html.includes(f));
    check(`${tag} 未開課圖檔「${f}」已從 assets 刪除`, !existsSync(join(ROOT, "assets", f)));
  }
  check(`${tag} 有列未開課圖檔清單`, banned.length > 0 || !camp.not_running_assets);

  // 內容畫在圖裡的素材：用尺寸釘住版本，避免有人把「含國中生見證」的原圖蓋回來
  for (const [file, spec] of Object.entries(camp.pinned_assets || {})) {
    if (file.startsWith("_")) continue;
    const f = join(ROOT, "assets", file);
    if (!existsSync(f)) { check(`${tag} 釘住的圖「${file}」存在`, false); continue; }
    const b = readFileSync(f);
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    check(`${tag} 「${file}」仍是指定版本`, w === spec.w && h === spec.h, `實際 ${w}x${h}，應為 ${spec.w}x${spec.h}`);
  }
  check(`${tag} 課表按鈕都有文字`, (html.match(/class="button-text"/g) || []).length === (html.match(/課表<\/a>/g) || []).length);

  // 比較表欄數 = 標籤欄 + 開課中的營隊數
  // 🔴 桌機（≥992px）的比較表不是 <table>，是「一張圖 ＋ 絕對定位疊字」：
  // .first-N 是欄標題、.row-word ... .row-N 是每一格。刪營隊時三種版型都要同步刪，
  // 2026-09-06 就漏了 .row-word.fifth.row-4（材質營的成果收穫）還留在圖上的空白欄裡。
  // 比較表已改成由 comparison.columns 產生，桌機不再用「畫死欄數的圖 ＋ 絕對定位疊字」
  const nCols = camp.comparison.columns.length;
  check(`${tag} 已無圖片版比較表（會留空白欄）`, !html.includes("b_6_icon-2") && !/class="first first-\d"/.test(html));
  check(`${tag} 比較表由 JSON 產生`, camp.comparison && nCols > 0);
  const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
  check(`${tag} 桌機與手機各一張比較表`, tables.length === 2, `實際 ${tables.length} 張`);
  check(`${tag} 兩張比較表內容一致`, tables.length === 2 && tables[0] === tables[1]);
  for (const c of camp.comparison.columns) check(`${tag} 比較表含「${c.subtitle}」`, text.includes(c.subtitle));
  check(`${tag} 無空的清單項目`, !/<li>\s*<\/li>/.test(html));

  const firstRow = html.match(/<table[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>/);
  if (firstRow) {
    const cells = (firstRow[1].match(/<(th|td)[\s>]/g) || []).length;
    check(`${tag} 比較表欄數 = 營隊數 + 標籤欄`, cells === nCols + 1, `實際 ${cells} 欄`);
  }

  // 價格組數
  const priceGroups = (text.match(/【[^】]+】/g) || []).filter((x) => x.includes("營"));
  check(`${tag} 價格組數 = 開課營隊數`, priceGroups.length === nCols, priceGroups.join(","));

  // 梯次區塊：靜態站無法產生，必須保留錨點給官網接，且參數不含未開課代號
  const tf = html.match(/<turbo-frame[^>]*id="get_stages"[^>]*>/);
  check(`${tag} 保留梯次待接錨點`, !!tf);
  if (tf) check(`${tag} 梯次參數不含未開課代號`, !tf[0].includes("mctexture"));

  // 表單：留單流程要完整，且下拉不得出現未開課營隊
  check(`${tag} 留單表單完整`, html.includes('action="/potential_students"'));
  const opts = [...html.matchAll(/<option[^>]*value="([^"]*)"/g)].map((m) => m[1]);
  check(`${tag} 表單下拉無未開課營隊`, !opts.some((o) => o.includes("材質模組")), opts.join(","));

  // 版型與紅線
  check(`${tag} 保留 header/footer 注入錨點`, html.includes("<oa-header></oa-header>") && html.includes("<oa-footer></oa-footer>"));
  check(`${tag} 桌機與手機兩個版本都在`, html.includes("d-md-block") && html.includes("d-md-none"));
  check(`${tag} 品牌名正確`, !text.includes("學院"));
  check(`${tag} 無「免費再上一次」`, !text.includes("免費再上一次"));

  // schema
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  check(`${tag} 有結構化資料`, blocks.length > 0);
  let graph = null;
  try { graph = JSON.parse(blocks[0][1]); } catch { /* noop */ }
  check(`${tag} JSON-LD 可解析`, graph !== null);
  if (graph) {
    const org = graph["@graph"].find((n) => String(n["@id"]).endsWith("#organization"));
    check(`${tag} sameAs 唯三`, org && org.sameAs.length === 3);
    check(`${tag} schema 不含未開課營隊`, !NOT_RUNNING.some((w) => JSON.stringify(graph).includes(w)));
  }
}

// assets 不得有孤兒檔：刪內容卻沒刪圖，通常代表版面上還留著半截殘骸
{
  const assetDir = join(OUTPUT_DIR, "assets");
  const allHtml = camps.map((c) => join(OUTPUT_DIR, c.slug, "index.html")).filter(existsSync).map((f) => readFileSync(f, "utf8")).join("\n");
  const orphans = readdirSync(assetDir).filter((f) => !allHtml.includes(f));
  check("assets 無孤兒檔", orphans.length === 0, orphans.slice(0, 5).join(","));
}

const sitemap = readFileSync(join(OUTPUT_DIR, "sitemap.xml"), "utf8");
check("sitemap 涵蓋所有營隊頁", camps.every((c) => sitemap.includes(pageUrl(c.slug))));

console.log(failures.length === 0
  ? `通過 ${pass} 項斷言。\n\n全數通過。`
  : `通過 ${pass} 項斷言。\n\n失敗 ${failures.length} 項：\n` + failures.map((f) => "  ✗ " + f).join("\n"));
process.exit(failures.length === 0 ? 0 : 1);
