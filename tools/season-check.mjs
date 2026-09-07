#!/usr/bin/env node
/**
 * 換季演練：把 camps_common.json 暫時切成另一季，重建全部頁面，檢查有沒有殘留舊季字樣，
 * 然後還原。整個搬家的核心承諾是「換季只改一個檔」——這支就是拿來證明它成立的。
 *
 *   npm run season-check
 *
 * 每季真的要換之前先跑一次。有殘留代表某頁把季節寫死了，要改成 {{SEASON}} 系列的參數。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAll, campFiles, readCamp, OUTPUT_DIR } from "./build-camps.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMMON = join(ROOT, "content", "shared", "camps_common.json");

// 兩季互換的字樣。這裡刻意「不」把單獨的「暑假／寒假」當成殘留——
// 有些句子本來就是通用的（roblox 頁的「掌握暑假或寒假黃金學習期」），寫死也沒錯。
const SEASONS = {
  冬: { season: "2027 寒假", season_short: "2027", season_type: "冬令營", season_word: "寒假" },
  夏: { season: "2027 暑假", season_short: "2027", season_type: "夏令營", season_word: "暑假" },
};
const GENERIC = ["暑假或寒假", "寒暑假"];

const textOf = (h) =>
  h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function scan(oldType, oldSeason) {
  const found = [];
  for (const file of campFiles()) {
    const camp = readCamp(file);
    const f = join(OUTPUT_DIR, camp.slug, "index.html");
    if (!existsSync(f)) continue;
    let t = textOf(readFileSync(f, "utf8"));
    for (const g of GENERIC) t = t.split(g).join(" ");   // 通用句先拿掉再找殘留
    const hits = [];
    for (const w of [oldType, oldSeason]) {
      if (t.includes(w)) hits.push(w);
    }
    if (hits.length) found.push(`${camp.slug}: 殘留「${hits.join("、")}」`);
  }
  return found;
}

const original = readFileSync(COMMON, "utf8");
let failed = [];
try {
  for (const [to, from] of [["夏", "冬"], ["冬", "夏"]]) {
    const next = { ...JSON.parse(original), ...SEASONS[to] };
    writeFileSync(COMMON, JSON.stringify(next, null, 2) + "\n", "utf8");
    buildAll({ quiet: true });
    const hits = scan(SEASONS[from].season_type, SEASONS[from].season);
    console.log(`切成「${next.season}${next.season_type}」→ ` + (hits.length ? `🔴 ${hits.length} 頁有殘留` : "✅ 沒有殘留舊季字樣"));
    hits.forEach((h) => console.log("    " + h));
    failed = failed.concat(hits);
  }
} finally {
  writeFileSync(COMMON, original, "utf8");
  buildAll({ quiet: true });
  console.log(`\n已還原成「${JSON.parse(original).season}${JSON.parse(original).season_type}」並重建。`);
}

console.log(failed.length === 0
  ? "\n✅ 換季只要改 content/shared/camps_common.json 一個檔，9 頁全部跟著變。"
  : `\n🔴 有 ${failed.length} 處把季節寫死了，改成 {{SEASON}} / {{SEASON_TYPE}} / {{SEASON_WORD}} 再跑一次。`);
process.exit(failed.length === 0 ? 0 : 1);
