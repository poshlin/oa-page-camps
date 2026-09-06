#!/usr/bin/env python3
"""把產出頁跟官網現行頁對照，找出搬家過程中掉了什麼。

    python3 tools/compare-with-live.py <slug> [官網 HTML 檔]

比兩件事：
  ① 文字：官網有、我們沒有的句子（掉內容）；我們有、官網沒有的（自己加的或改的）
  ② 資產：官網引用、我們沒引用的圖檔（🔴 最重要——這些頁大量內容是圖，
     只比文字會全部綠燈，但畫面上整個區塊不見了）

有差異不一定是錯（未開課營隊本來就要移除），但每一項都要能講出為什麼。
"""
import re
import sys
import html as H
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://orangeapple.co"


def fetch(url: str) -> str:
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


def visible_text(html: str) -> str:
    html = re.sub(r"<(script|style)[^>]*>[\s\S]*?</\1>", " ", html)
    return H.unescape(re.sub(r"<[^>]+>", "\n", html))


def sentences(text: str) -> set[str]:
    out = set()
    for line in text.split("\n"):
        line = re.sub(r"\s+", " ", line).strip()
        if len(line) >= 6:
            out.add(line)
    return out


def asset_names(text: str) -> set[str]:
    text = H.unescape(text)
    names = set()
    for m in re.finditer(r"/assets/([^\"'\s)]+)", text):
        p = m.group(1).split("/")[-1]
        p = re.sub(r"-[0-9a-f]{64}(?=\.)", "", p)
        p = re.sub(r"-s-[0-9a-f]{64}(?=\.)", "", p)
        if "." in p:
            names.add(p)
    for m in re.finditer(r"\.\./assets/([^\"'\s)]+)", text):
        names.add(m.group(1).split("/")[-1])
    return names


def main(slug: str, live_path: str | None) -> None:
    live = Path(live_path).read_text(encoding="utf-8") if live_path else fetch(f"{SITE}/camps/{slug}")
    mine_path = ROOT / "dist" / slug / "index.html"
    if not mine_path.exists():
        sys.exit(f"找不到 {mine_path}，先跑 npm run build")
    mine = mine_path.read_text(encoding="utf-8")
    css_path = ROOT / "dist" / "css" / f"{slug}-inline.css"
    mine_css = css_path.read_text(encoding="utf-8") if css_path.exists() else ""

    # 官網頁只取主體，避開頁首頁尾（我們本來就不搬）
    he = re.search(r"</header>", live)
    fs = re.search(r"<footer", live)
    live_body = live[he.end():fs.start()] if he and fs else live

    lost = sorted(sentences(visible_text(live_body)) - sentences(visible_text(mine)), key=len, reverse=True)
    added = sorted(sentences(visible_text(mine)) - sentences(visible_text(live_body)), key=len, reverse=True)
    la, ma = asset_names(live_body), asset_names(mine + mine_css)

    print(f"=== {slug} 對照官網 ===")
    print(f"\n🔴 官網有、我們沒有的圖 {len(la - ma)} 個：")
    for a in sorted(la - ma):
        print(f"    - {a}")
    print(f"\n我們有、官網沒有的圖 {len(ma - la)} 個：")
    for a in sorted(ma - la):
        print(f"    + {a}")
    print(f"\n共用 {len(la & ma)} 個圖")

    print(f"\n官網有、我們沒有的句子 {len(lost)} 句（前 25 句，長的先列）：")
    for s in lost[:25]:
        print(f"    - {s[:90]}")
    print(f"\n我們有、官網沒有的句子 {len(added)} 句（前 12 句）：")
    for s in added[:12]:
        print(f"    + {s[:90]}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
