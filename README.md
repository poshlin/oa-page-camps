# oa-page-camps — 橘子蘋果寒暑假營隊頁

從官網 `/camps/{slug}` 搬過來的營隊頁，改成「JSON 內容 ＋ 模板 ＋ build」的自主管理模式，
行銷部自己就能改內容與版型，不必每季找工程師。目前只有麥塊營（`minecraft`），驗證成功後再搬其餘 8 頁。

```bash
npm run build   # 產生 dist/
npm test        # 67 項驗收斷言，全過才准 push
```

---

## 🔴 上線當天必做的切換

現在是**製作期**：origin 指 `poshlin`、GitHub Pages 預覽公開可存取，所以頁面刻意設成 `noindex`。

交接給數位長、正式上線那天，逐項打勾：

- [ ] `templates/camp-page.html` 的 `<meta name="robots">` → `index, follow, max-image-preview:large, max-snippet:-1`
      （檔案裡該行上方有紅字註解）
- [ ] `tools/verify-camps.mjs` 的「預覽期為 noindex」斷言改成「可被索引」
- [ ] 確認 Cloudflare 專案掛在 `/camps`，與 `content/shared/camps_common.json` 的 `base_path` 一致
- [ ] `command grep -rn 'poshlin' .` 歸零（🔴 不能用內建 grep，它會跳過 .gitignore 的檔）
- [ ] 關閉 `poshlin/oa-page-camps` 的 GitHub Pages，再封存 repo
- [ ] origin 改指 `OrangeApple-Lab/oa-page-camps`

完整流程見 iCloud 知識庫 `OA_LandingPage_上線流程.md`。

---

## 資產路徑：為什麼要有 BASE

正式站把這個 repo 掛在 `/camps` 底下，GitHub Pages 預覽掛在 `/oa-page-camps/` 底下，
路徑深度不同。三種寫法只有一種兩邊都對：

| 寫法 | 正式站 | 預覽站 | 問題 |
|---|---|---|---|
| `/assets/x.png` | ❌ 打到 Rails | ❌ 404 | 沒掛在網站根目錄 |
| `../assets/x.png` | ⚠️ 只在網址帶尾斜線時才對 | ✅ | **被尾斜線綁死**，而官網現行 `/camps/minecraft` 沒有尾斜線 |
| `{{BASE}}/assets/x.png` | ✅ `/camps/assets/` | ✅ `/oa-page-camps/assets/` | 無 |

所以模板一律寫 `{{BASE}}/assets/…`，build 時代換：

```bash
npm run build                          # BASE = /camps（吃 camps_common.json 的 base_path）
OA_BASE=/oa-page-camps npm run build   # BASE = /oa-page-camps（GitHub Action 用這個）
```

---

## 要改內容時，改哪一個檔

| 想改什麼 | 改哪裡 |
|---|---|
| 年份、季節（冬令營／夏令營） | `content/shared/camps_common.json` 的 `season` / `season_type` — **改一處，所有營隊頁一起變** |
| 「營隊比一比」要拿掉／加回一個營隊 | `content/camps/{slug}.json` 的 `comparison.columns` 刪一項或補一項。桌機與手機兩張表會同時變、不會留空白欄 |
| title / description | `content/camps/{slug}.json` 的 `meta` |
| 版面、區塊 | `templates/bodies/{slug}.html` |
| 樣式 | `templates/css/page-inline.css`（`oa-site.css` 是官網全站樣式的快照，不要手改） |

---

## 🔴 這頁大量內容是「圖」，不是文字

見證、比較表標題、按鈕文字很多都畫在 PNG 裡。**用 grep 檢查「某某字樣＝0」會全部綠燈，但畫面上東西還在**——
2026-09 搬家時被這件事咬了三次。所以 `npm test` 的重點不是文字比對，而是：

- 資產清單比對（線上頁 vs 產出頁的圖檔差集）
- 孤兒圖檔（刪了內容卻沒刪圖，通常代表版面上還留著半截殘骸）
- 空殼容器（刪了文字沒刪容器，畫面上是一顆沒有字的按鈕）
- 背景圖存在性（只檢查 `<img>` 會漏掉整頁配色）
- `pinned_assets` 尺寸（內容畫在圖裡的素材，用尺寸釘住版本）

要改「圖裡面的內容」只能改圖。原始素材封存在 `assets-archive/`。

---

## 不要動的地方

- `<oa-header></oa-header>` / `<oa-footer></oa-footer>` 是數位長注入 shell 的合約錨點，**不得移除、也不要自己做 header/footer**
- `<turbo-frame id="get_stages">` 是梯次的待接錨點，靜態站產不出來，要留給官網接
- 不加外部 `<script src="https://…">` 或外部樣式表（追蹤碼與字型圖示由 shell 管）
- `data-oa-cta` 只加在試聽 modal 的 `<button>`
