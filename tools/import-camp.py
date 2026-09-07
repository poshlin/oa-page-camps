#!/usr/bin/env python3
"""把官網的營隊頁搬進本 repo（可重複執行）。

    python3 tools/import-camp.py <slug> [已下載的 HTML 檔]

做的事：
  ① 從 </header> 到 <footer> 之間取出頁面主體（頁首頁尾由數位長的 shell 注入，不搬）
  ② 抽出頁內 <style> 存成 templates/css/<slug>-inline.css（頁尾那段 324 字的共用樣式丟掉）
  ③ 移除 fbq 追蹤 script（追蹤碼由 shell 管）；其餘 script 保留但加 jQuery 防護
  ④ 資產網址 /assets/camps/<slug>/名稱-<64位digest>.ext → {{BASE}}/assets/<slug>/名稱.ext，並實際下載
  ⑤ lazy 圖（class="lazy" + data-src）還原成一般 <img src>——本站沒有 lazy 的 JS，不還原會整頁空白

🔴 這支只做「機械性搬運」。未開課營隊的內容移除、季節字樣參數化、比較表抽成 JSON，
   都要人工判斷，搬完後另外處理。搬完務必跑 npm test 並實際截圖看——
   這些頁大量內容是圖片，文字檢查會給你假的綠燈。
"""
import re
import sys
import html as H
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://orangeapple.co"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main(slug: str, src_path: str | None, asset_dir: str | None = None) -> None:
    asset_dir = asset_dir or slug   # 總覽頁的 slug 是 index，但頁面網址是 /camps
    url = f"{SITE}/camps" if slug == "index" else f"{SITE}/camps/{slug}"
    raw = Path(src_path).read_text(encoding="utf-8") if src_path else fetch(url).decode("utf-8")

    # ① 主體
    he = re.search(r"</header>", raw)
    fs = re.search(r"<footer", raw)
    if not he or not fs:
        sys.exit(f"{slug}: 找不到 </header> 或 <footer>，頁面結構跟預期不同")
    body = raw[he.end():fs.start()]

    # ② 頁內樣式
    styles = re.findall(r"<style[^>]*>([\s\S]*?)</style>", body)
    page_css = [c for c in styles if "address.location-info" not in c]
    dropped = len(styles) - len(page_css)
    body = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", body)

    # ③ script
    kept_scripts = []
    for m in re.finditer(r"<script[^>]*>([\s\S]*?)</script>", body):
        code = m.group(1)
        if "fbq(" in code:
            continue
        kept_scripts.append(code)
    body = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", body)
    if kept_scripts:
        joined = "\n".join(kept_scripts)
        # 預覽站沒有 shell 的 jQuery，不擋會在 load 時丟錯
        guarded = "if (window.jQuery) {\n" + joined + "\n}" if "$(" in joined else joined
        body += f"\n<script>\n{guarded}\n</script>\n"

    # ④ 資產：/assets/<路徑>-<64位digest>.<副檔名>
    #    本營隊的 → assets/<slug>/名稱.ext；其餘（別的營隊、campaigns、courses、loading）
    #    → assets/_site/<原路徑>，保留原目錄結構避免撞名
    #
    #    HTML 用 {{BASE}}/assets/…（build 時代換）；CSS 用 ../assets/…
    #    ——CSS 檔本身就住在 {BASE}/css/ 底下，相對路徑自動跟著 BASE 走，不必再套模板。
    body = H.unescape(body)
    pat = re.compile(r"(?:https?://orangeapple\.co)?/assets/([^\"'\s)]+?)-([0-9a-f]{64})\.(\w+)")
    found: dict[str, str] = {}   # repo 內相對路徑 → 官網來源網址
    outside: set[str] = set()

    def rewrite(text: str, prefix: str) -> str:
        def repl(m):
            path, digest, ext = m.group(1), m.group(2), m.group(3)
            own = f"camps/{asset_dir}/"
            if path.startswith(own):
                rel = f"{slug}/{path[len(own):]}.{ext}"
            else:
                rel = f"_site/{path}.{ext}"
                outside.add(path)
            found[rel] = f"{SITE}/assets/{path}-{digest}.{ext}"
            return f"{prefix}{rel}"
        return pat.sub(repl, text)

    body = rewrite(body, "{{BASE}}/assets/")
    page_css = [rewrite(H.unescape(c), "../assets/") for c in page_css]
    leftover = sorted(set(re.findall(r"(?<!BASE\}\})(?<!\.\.)/assets/([^\"'\s)]+)", body + "\n".join(page_css))))

    # ⑤ lazy 圖
    lazy = len(re.findall(r"data-src=", body))
    body = re.sub(r'\ssrc="[^"]*"(?=[^>]*\sdata-src=)', "", body)   # 先拿掉佔位 src
    body = re.sub(r"\sdata-src=", " src=", body)
    body = re.sub(r'class="([^"]*?)\blazy\b\s*', lambda m: f'class="{m.group(1)}', body)
    body = re.sub(r'class="\s*"', "", body)

    # 下載資產
    got, failed = 0, []
    for rel, url in sorted(found.items()):
        dest = ROOT / "assets" / rel
        if dest.exists():
            got += 1
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            dest.write_bytes(fetch(url))
            got += 1
        except Exception as e:  # noqa: BLE001
            failed.append(f"{rel}: {e}")

    (ROOT / "templates" / "css" / f"{slug}-inline.css").write_text("\n".join(page_css), encoding="utf-8")
    (ROOT / "templates" / "bodies" / f"{slug}.html").write_text(body.strip() + "\n", encoding="utf-8")

    print(f"=== {slug} ===")
    print(f"  主體 {len(body):,} 字元｜樣式 {len(page_css)} 段（丟掉共用頁尾樣式 {dropped} 段）")
    print(f"  script 保留 {len(kept_scripts)} 段（已移除 fbq 追蹤）")
    print(f"  資產 {len(found)} 個，下載/已存在 {got} 個" + (f"，失敗 {len(failed)}" if failed else ""))
    for f in failed:
        print(f"    ✗ {f}")
    print(f"  lazy 圖還原 {lazy} 張")
    if outside:
        print(f"  共用資產 {len(outside)} 個放到 assets/_site/：{sorted(outside)[:4]}")
    if leftover:
        print(f"  🔴 沒被改寫的 /assets 參照 {len(leftover)} 個（沒有 digest？要人工看）：{leftover[:5]}")
    print(f"  → templates/bodies/{slug}.html, templates/css/{slug}-inline.css, assets/{slug}/")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None, sys.argv[3] if len(sys.argv) > 3 else None)
