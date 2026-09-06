# 給 Claude 的 repo 指令

動這個 repo 之前，先讀 `README.md`。以下是最容易犯錯的三件事。

## 1. 這頁大量內容是圖片，文字檢查會給你假的綠燈

見證、比較表標題、部分按鈕都畫在 PNG 裡，有些連 `alt` 都沒有。
「grep 某某字樣＝0」通過**不代表**畫面上沒有那個東西。改完一定要跑 `npm test`（會做資產差集、孤兒檔、空殼容器、圖片尺寸等檢查），並實際截圖看。

## 2. 資產路徑一律 `{{BASE}}/assets/…`

不要寫 `/assets/…`（預覽站 404），也不要寫 `../assets/…`（被網址尾斜線綁死）。
理由與對照表見 README 的「資產路徑：為什麼要有 BASE」。

## 3. 製作期必須 noindex

`templates/camp-page.html` 現在是 `noindex, follow`，因為 GitHub Pages 預覽是公開的。
**不要「順手改成 index」**——那要等上線當天，照 README 的切換清單一起做。

## 改完的收尾

```bash
npm run build && npm test          # 正式站前綴
OA_BASE=/oa-page-camps npm test    # 預覽站前綴，兩種都要過
```

push 到 main 後，GitHub Action 會自動用預覽前綴重建並部署到
<https://poshlin.github.io/oa-page-camps/>。
