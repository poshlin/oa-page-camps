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
  // og:image 必須是絕對網址且檔案真的在（貼 LINE／FB 抓不到縮圖是常見的上線漏網）
  const og = html.match(/<meta property="og:image" content="([^"]+)">/);
  check(`${tag} 有 og:image`, !!og);
  if (og) {
    check(`${tag} og:image 是絕對網址`, /^https?:\/\//.test(og[1]));
    check(`${tag} og:image 檔案存在`, existsSync(join(ROOT, "assets", camp.og_image)));
    check(`${tag} twitter:image 與 og:image 一致`, html.includes(`<meta name="twitter:image" content="${og[1]}">`));
  }
  // 🔴 製作期（origin＝poshlin、開著公開的 GitHub Pages 預覽）必須 noindex，
  // 否則 Google 會收錄一份未發布的副本跟官網現行頁打架。上線當天改成 index。
  check(`${tag} 預覽期為 noindex`, /content="noindex, follow"/.test(html));
  // 有些頁（本季不開的 gai、只開線上的 apcs）title 刻意不寫季節，避免對外承諾錯誤
  if (/\{\{SEASON/.test(camp.meta.title)) check(`${tag} title 帶入當季年份`, html.includes(common.season_short));

  // 每頁自己的驗收條件（content/camps/<slug>.json 的 expect）
  const expect = camp.expect || {};
  const NOT_RUNNING = expect.must_not_contain || [];
  check(`${tag} 有列未開課字樣清單`, Array.isArray(expect.must_not_contain));
  for (const w of NOT_RUNNING) check(`${tag} 未開課內容「${w}」＝0`, !text.includes(w), w);
  for (const w of expect.must_contain || []) check(`${tag} 保留內容「${w}」仍在`, text.includes(w), w);
  // 本季不開的營隊不能再有任何「去報名」的出口
  for (const h of expect.must_not_link || []) check(`${tag} 無連往「${h}」`, !html.includes(`href="${h}"`), h);

  // 圖片：不得殘留 data-src（靜態站沒有 lazy JS，會變成看不見的圖）
  const imgs = html.match(/<img[^>]*>/g) || [];
  // 🔴 自家檔案一律相對路徑：預覽站掛在 poshlin.github.io/oa-page-camps/ 底下，
  // 寫 "/assets/..." 會指到 poshlin.github.io 根目錄、整頁的圖與 CSS 全 404。
  // （站內連結如 /camps/registration、/privacy 指的是官網，維持根絕對路徑才對）
  // 自家資產一律「BASE + 根絕對路徑」：正式站 /camps、預覽站 /oa-page-camps。
  // 不能用 ../assets（會被尾斜線綁死），也不能裸寫 /assets（預覽站會 404）。
  check(`${tag} 資產前綴正確`, !html.includes('"../assets/') && !/(?:src|href)="\/(assets|css)\//.test(html) || BASE === "");
  const basedRefs = (html.match(new RegExp(`"${BASE}/(assets|css)/`, "g")) || []).length;
  check(`${tag} 資產都帶 BASE 前綴`, basedRefs >= 2, `僅 ${basedRefs} 處`);
  check(`${tag} 未殘留 BASE placeholder`, !html.includes("{{BASE}}"));
  // 正式建置不該有預覽站網址（註解不算——robots 上方那段說明會提到它）
  const noComments = html.replace(/<!--[\s\S]*?-->/g, "");
  check(`${tag} 正式建置無預覽站網址`, BASE !== "/camps" || !noComments.includes("poshlin.github.io"));
  // JSON-LD 重複 key：JSON.parse 不會報錯，但 Google 會把整份判成無法解析
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const keys = [...m[1].matchAll(/"(@?\w+)":/g)].map((x) => x[1]);
    const top = m[1].match(/"@graph"/g) || [];
    check(`${tag} JSON-LD 可被 JSON.parse`, (() => { try { JSON.parse(m[1]); return true; } catch { return false; } })());
    check(`${tag} JSON-LD 有 @graph`, top.length === 1, `${top.length} 個`);
  }
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
  // 背景圖可能寫在 HTML 的 style 屬性，也可能寫在該頁的 CSS（url(../assets/…)）——兩邊都要看，
  // 只檢查 <img> 或只檢查 HTML 會漏掉整頁配色。
  const cssFile = join(OUTPUT_DIR, "css", `${camp.slug}-inline.css`);
  check(`${tag} 有專屬 CSS`, existsSync(cssFile));
  const css = existsSync(cssFile) ? readFileSync(cssFile, "utf8") : "";
  const bgUrls = [
    ...[...html.matchAll(/url\((?:&#39;|['"])?[^)'"]*?(assets\/[^)'"]+?)(?:&#39;|['"])?\)/g)].map((m) => m[1]),
    ...[...css.matchAll(/url\((?:['"])?\.\.\/(assets\/[^)'"]+?)(?:['"])?\)/g)].map((m) => m[1]),
  ];
  const bgMissing = [...new Set(bgUrls)].filter((u) => !existsSync(join(OUTPUT_DIR, u)));
  check(`${tag} 背景圖檔案都存在`, bgMissing.length === 0, bgMissing.slice(0, 3).join(","));
  // 每頁背景圖數量差很多（有的頁靠色塊、有的頁整頁是圖），只擋「一張都沒有」這種明顯搬壞
  check(`${tag} 有背景圖或圖片（頁面沒被搬空）`, bgUrls.length + imgs.length >= 3, `背景 ${bgUrls.length}／圖 ${imgs.length}`);

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
  // 比較表：有抽成 JSON 的頁才檢查欄數（沒抽的頁維持原始 HTML，見 README）
  const nCols = camp.comparison ? camp.comparison.columns.length : null;
  if (camp.comparison) {
    check(`${tag} 已無圖片版比較表（會留空白欄）`, !html.includes("b_6_icon-2") && !/class="first first-\d"/.test(html));
    const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
    check(`${tag} 桌機與手機各一張比較表`, tables.length === 2, `實際 ${tables.length} 張`);
    check(`${tag} 兩張比較表內容一致`, tables.length === 2 && tables[0] === tables[1]);
    for (const c of camp.comparison.columns) check(`${tag} 比較表含「${c.subtitle}」`, text.includes(c.subtitle));
  }
  check(`${tag} 無空的清單項目`, !/<li>\s*<\/li>/.test(html));

  const firstRow = html.match(/<table[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>/);
  if (firstRow && nCols !== null) {
    const cells = (firstRow[1].match(/<(th|td)[\s>]/g) || []).length;
    check(`${tag} 比較表欄數 = 營隊數 + 標籤欄`, cells === nCols + 1, `實際 ${cells} 欄`);
  }

  // 價格組數
  if (expect.price_groups !== undefined) {
    const priceGroups = (text.match(/【[^】]+】/g) || []).filter((x) => x.includes("營"));
    check(`${tag} 價格組數 = 開課營隊數`, priceGroups.length === expect.price_groups, priceGroups.join(","));
  }

  // 梯次區塊：只有麥塊與 Roblox 的官網頁用 turbo-frame 帶梯次，其餘頁本來就沒有。
  // 有的話要原樣保留給官網接，而且參數不能還帶著未開課營隊的代號。
  const tf = html.match(/<turbo-frame[^>]*id="get_stages"[^>]*>/);
  for (const code of expect.stage_codes_removed || []) {
    check(`${tag} 梯次參數不含「${code}」`, !!tf && !tf[0].includes(code));
  }

  // 表單：留單流程要完整，且下拉不得出現未開課營隊
  // 轉換路徑：有的頁把留單表單直接寫在頁上，有的頁是按鈕開共用 modal（modal 由 shell 提供）
  // 🔴 官網原頁的 authenticity_token 是 Rails 當下產生的，搬成靜態頁後會凍結成一組過期字串，
  // 表單一送就失敗。這裡清空並標記 data-oa-csrf，交接時請數位長的 shell 填入當下的 token。
  const tokens = [...html.matchAll(/<input[^>]*name="authenticity_token"[^>]*>/g)].map((m) => m[0]);
  check(`${tag} 無寫死的 CSRF token`, tokens.every((t) => /value=""/.test(t) && t.includes("data-oa-csrf")), `${tokens.length} 個`);

  const hasForm = html.includes('action="/potential_students"');
  const hasModalCta = /data-bs-target="#(potentialStudent|free-book)/.test(html);
  const hasRegLink = html.includes('href="/camps/registration"');
  check(`${tag} 有轉換路徑（留單表單／報名 modal／報名頁連結）`, hasForm || hasModalCta || hasRegLink);
  const opts = [...html.matchAll(/<option[^>]*value="([^"]*)"/g)].map((m) => m[1]);
  check(`${tag} 表單下拉無未開課營隊`, !opts.some((o) => NOT_RUNNING.some((w) => o.includes(w))), opts.join(","));

  // 「其他營隊」內鏈區塊
  const ocBlock = html.match(/<section class="oa-other-camps">[\s\S]*?<\/section>/);
  check(`${tag} 有「其他營隊」內鏈區塊`, !!ocBlock);
  if (ocBlock) {
    const linked = [...ocBlock[0].matchAll(/href="\/camps\/([a-z_]+)"/g)].map((m) => m[1]);
    check(`${tag} 內鏈不連自己`, !linked.includes(camp.slug));
    check(`${tag} 內鏈數量正確`, linked.length >= camps.length - 2, `${linked.length} 條`);
    // 本季不開的營隊只能出現在它自己指定的來源頁，避免把家長導到不能報名的頁
    for (const other of camps.filter((c) => c.not_running && c.slug !== camp.slug)) {
      const allowed = (other.linked_from || []).includes(camp.slug);
      check(`${tag} 未開課的「${other.slug}」${allowed ? "有" : "沒有"}出現在清單`,
        linked.includes(other.slug) === allowed);
    }
    check(`${tag} 內鏈沒有彩色 emoji`, !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ocBlock[0]));
  }
  // H1：每頁都要有，而且是描述營隊的標題（不是口號）。桌機／手機兩份版型會有兩個，內容要一樣。
  const h1s = (html.match(/<h1[^>]*>[\s\S]*?<\/h1>/g) || []);
  check(`${tag} 有 h1`, h1s.length > 0);
  // <br> 要當成空白，不然桌機版「STEAM 小小創客」跟手機版「STEAM<br>小小創客」會被判成不一樣
  const h1text = h1s.map((x) =>
    (x.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim()
      || (x.match(/alt="([^"]*)"/) || [])[1] || ""));
  check(`${tag} h1 內容一致（桌機／手機）`, new Set(h1text).size <= 1, h1text.join("｜"));
  if (expect.h1_contains) {
    for (const w of expect.h1_contains) check(`${tag} h1 含「${w}」`, h1text.every((t) => t.includes(w)), h1text.join("｜"));
  }

  check(`${tag} 有共用樣式表`, html.includes("camps-shared.css"));
  check(`${tag} 有 .oa-camp-page 外框（手機防溢出規則靠它生效）`, html.includes('class="oa-camp-page"'));
  // 手機破版的常見來源：inline 寫死一個比手機還寬的固定寬度（gai 頁原本 700px，390px 螢幕會橫向溢出）
  const rigid = [...html.matchAll(/style="[^"]*?(?<!max-)width: (\d{3,4})px/g)]
    .map((m) => Number(m[1])).filter((w) => w >= 400);
  check(`${tag} 無寫死的超寬固定寬度`, rigid.length === 0, rigid.join(","));

  // 版型與紅線
  check(`${tag} 保留 header/footer 注入錨點`, html.includes("<oa-header></oa-header>") && html.includes("<oa-footer></oa-footer>"));
  // 只有做了「桌機一份 HTML、手機一份 HTML」的頁才檢查（多數頁是純 CSS 響應式）
  if (expect.rwd_dual_html) check(`${tag} 桌機與手機兩個版本都在`, html.includes("d-md-block") && html.includes("d-md-none"));
  // 只擋品牌名寫錯（正確是「學苑」）。「學院」本身是正常詞——apcs 頁的榜單就有「工程與電資學院」
  check(`${tag} 品牌名正確`, !/橘子蘋果(程式)?學院/.test(text));
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
    // FAQPage：有 FAQ 區塊的頁必須有，而且每一題的文字要跟畫面上逐字相同（不同＝cloaking）
    // 兩種 FAQ 版型：roblox 沿用官網原本的氣泡設計，其餘用 JSON 產生的 <details>
    const qCount = (html.match(/class="qa-question"/g) || []).length + (html.match(/class="oa-faq-item"/g) || []).length;
    const faqNode = graph["@graph"].find((n) => n["@type"] === "FAQPage");
    check(`${tag} 有 FAQ 區塊就有 FAQPage schema`, qCount === 0 || !!faqNode, `畫面 ${qCount} 題`);
    if (faqNode) {
      check(`${tag} FAQPage 題數與畫面一致`, faqNode.mainEntity.length === qCount);
      const flat = text.replace(/\s+/g, " ");
      const bad = faqNode.mainEntity.filter((q) => !flat.includes(q.name));
      check(`${tag} FAQ 問題文字與畫面逐字相同`, bad.length === 0, bad.map((b) => b.name.slice(0, 20)).join("｜"));
    }
    check(`${tag} schema 不含未開課營隊`, !NOT_RUNNING.some((w) => JSON.stringify(graph).includes(w)));
  }
}

// assets 不得有孤兒檔：刪內容卻沒刪圖，通常代表版面上還留著半截殘骸
{
  // 頁面 HTML ＋ 各頁 CSS 都要算進去：背景圖多半只出現在 CSS 裡
  const sources = [
    ...camps.map((c) => join(OUTPUT_DIR, c.slug, "index.html")),
    ...camps.map((c) => join(OUTPUT_DIR, "css", `${c.slug}-inline.css`)),
  ];
  const allHtml = sources.filter(existsSync).map((f) => readFileSync(f, "utf8")).join("\n");
  const walk = (dir, prefix = "") =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]);
  const orphans = walk(join(OUTPUT_DIR, "assets")).filter((f) => !allHtml.includes(f));
  check("assets 無孤兒檔", orphans.length === 0, orphans.slice(0, 5).join(","));
}


{
  const shared = readFileSync(join(OUTPUT_DIR, "css", "camps-shared.css"), "utf8");
  check("手機防溢出規則存在", /@media \(max-width: 767\.98px\)[\s\S]*overflow-x: hidden/.test(shared));
  check("手機圖片限寬規則存在", /\.oa-camp-page img[\s\S]{0,120}max-width: 100% !important/.test(shared));
}

const sitemap = readFileSync(join(OUTPUT_DIR, "sitemap.xml"), "utf8");
check("sitemap 涵蓋所有營隊頁", camps.every((c) => sitemap.includes(pageUrl(c.slug))));

console.log(failures.length === 0
  ? `通過 ${pass} 項斷言。\n\n全數通過。`
  : `通過 ${pass} 項斷言。\n\n失敗 ${failures.length} 項：\n` + failures.map((f) => "  ✗ " + f).join("\n"));
process.exit(failures.length === 0 ? 0 : 1);
