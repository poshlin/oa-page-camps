#!/usr/bin/env python3
"""一次性轉換：官網麥塊營隊頁主體 → 可自主維護的模板。
   保留原有 DOM 與 class（視覺不變），只移除 2027 寒假未開課的營隊內容。
   未開課清單（保旭 2026-09-04 確認）：進階程式創客營、材質模組設計營。"""
import re, sys
from bs4 import BeautifulSoup

soup = BeautifulSoup(open('/tmp/mc_body.html', encoding='utf-8').read(), 'html.parser')
log = []

def note(msg): log.append(msg)

# ① 材質營整段介紹（桌機＋手機各一）：包住它的 div.container
for el in list(soup.find_all(string=re.compile('全台唯一麥塊教育版模組營隊'))):
    box = el.find_parent('div', class_='container')
    if box:
        note(f"移除材質營介紹段 div.container（含 {len(box.find_all('img'))} 張圖）")
        box.decompose()

# ② 進階班促銷句：只拿掉 <br> 與其後那句，保留前面的營隊介紹
for div in soup.find_all('div', class_='mc-text'):
    for br in div.find_all('br'):
        nxt = br.next_sibling
        if nxt and '參加過初階班' in str(nxt):
            br.extract(); nxt.extract()
            note("移除進階班促銷句（保留前段介紹）")

# ③ 課表按鈕：進階班課表、麥塊材質營課表
for div in list(soup.find_all('div', class_='button-text')):
    t = div.get_text(strip=True)
    if '進階班課表' in t or '材質營課表' in t:
        target = div.find_parent('a') or div
        note(f"移除課表按鈕「{t[:12]}」")
        target.decompose()

open('/tmp/stage1.html', 'w', encoding='utf-8').write(str(soup))
print("=== 轉換紀錄 ===")
for l in log: print("  " + l)
print(f"\n長度 {len(str(soup)):,}（原 {len(open('/tmp/mc_body.html',encoding='utf-8').read()):,}）")

# ══════════ 第二階段：比較表、價格、適合對象 ══════════
soup2 = BeautifulSoup(open('/tmp/stage1.html', encoding='utf-8').read(), 'html.parser')
log2 = []

# ④ table 版比較表：移除材質營整欄（每列的最後一格）
for t in soup2.find_all('table'):
    head = t.find('tr')
    cells = head.find_all(['th', 'td'])
    idx = next((i for i, c in enumerate(cells) if '材質模組設計營' in c.get_text()), None)
    if idx is None:
        continue
    for tr in t.find_all('tr'):
        cs = tr.find_all(['th', 'td'])
        if len(cs) > idx:
            cs[idx].decompose()
    log2.append(f"table 移除第 {idx+1} 欄（材質模組設計營）")

# ⑤ div 版比較表：材質營那一欄用內容特徵定位
FEATS = ['材質模組設計營', '4~7 年級', '打造專屬 3D 麥塊世界', '打造專屬3D 麥塊世界', '基本的繪圖技能']
for d in list(soup2.find_all('div', class_=lambda c: c and 'row-word' in c or c and 'first-3' in c)):
    txt = d.get_text(strip=True)
    if any(f in txt for f in FEATS):
        log2.append(f"div 版移除材質營欄：{'.'.join(d.get('class', []))[:30]} — {txt[:22]}")
        d.decompose()

# ⑥ 進階相關文字（保留欄位內的殘留）
REPL = [
    ('初階無經驗可，進階須上過初階營隊或初階班', '無經驗可'),
    ('進階須上過初階營隊或初階班', '無經驗可'),
    ('初無經驗可', '無經驗可'),
]
for el in soup2.find_all(string=True):
    s = str(el)
    new = s
    for a, b in REPL:
        new = new.replace(a, b)
    for kill in ['進階 3 個程式專案', '進階 1 個麥塊闖關世界']:
        new = new.replace(kill, '')
    if new != s:
        el.replace_with(new)
        log2.append(f"文字更新：{s.strip()[:26]} → {new.strip()[:26]}")

# ⑦ 成果收穫裡的進階項目（獨立 li/div）
for el in list(soup2.find_all(['li', 'div', 'p'])):
    t = el.get_text(strip=True)
    if t in ('進階 3 個程式專案', '進階 1 個麥塊闖關世界'):
        log2.append(f"移除成果項目：{t}")
        el.decompose()

# ⑧ 價格區：移除進階與材質營兩組（<p>【X】</p> + 緊鄰的 <ul>）
for p in list(soup2.find_all('p')):
    t = p.get_text(strip=True)
    if t in ('【進階程式創客營】', '【材質模組設計營】'):
        nxt = p.find_next_sibling()
        log2.append(f"移除價格組 {t}")
        if nxt and nxt.name == 'ul':
            nxt.decompose()
        p.decompose()

# ⑨ 適合對象：小三到國一 → 小三到小六，並拿掉進階但書
for el in soup2.find_all(string=lambda s: s and '小三到國一' in s):
    el.replace_with(' 小三到小六（無相關經驗也能參加）')
    log2.append("適合對象改為「小三到小六（無相關經驗也能參加）」")

# ⑩ 留單表單：移除材質營選項
for opt in list(soup2.find_all('option')):
    if '材質模組設計營' in (opt.get('value', '') + opt.get_text()):
        sel = opt.find_parent('select')
        log2.append(f"移除表單選項「{opt.get_text(strip=True)}」（select#{sel.get('id') if sel else '?'}）")
        opt.decompose()

open('/tmp/stage2.html', 'w', encoding='utf-8').write(str(soup2))
print("\n=== 第二階段轉換紀錄 ===")
for l in log2: print("  " + l)
print(f"\n長度 {len(str(soup2)):,}")
# ══════════ 第三階段：參數化 + 圖片路徑 + 梯次參數 ══════════
from urllib.parse import unquote, quote
raw = open('/tmp/stage2.html', encoding='utf-8').read()
log3 = []

# ⑪ 梯次 turbo-frame：移除未開課營隊的 course code（src 是 URL 編碼，%7C 才是分隔符）
soup3 = BeautifulSoup(raw, 'html.parser')
for tf in soup3.find_all('turbo-frame', id='get_stages'):
    src = tf.get('src', '')
    base, _, qs = src.partition('courses=')
    codes = unquote(qs).split('|')
    keep = [c for c in codes if c and 'mctexture' not in c]
    dropped = [c for c in codes if c and 'mctexture' in c]
    tf['src'] = base + 'courses=' + quote('|'.join(keep), safe='')
    log3.append(f"梯次參數移除 {dropped}，保留 {keep}")
raw = str(soup3)
# ⑫ lazy loading：原頁靠 JS 把 data-src 搬到 src，靜態站沒有那段 JS
#    改用瀏覽器原生 loading="lazy"，圖片直接可見且保留延遲載入
soup_img = BeautifulSoup(raw, 'html.parser')
n_lazy = 0
for img in soup_img.find_all('img'):
    ds = img.get('data-src')
    if ds:
        img['src'] = ds
        del img['data-src']
        img['loading'] = 'lazy'
        cls = [c for c in img.get('class', []) if c != 'lazy']
        if cls: img['class'] = cls
        elif img.has_attr('class'): del img['class']
        n_lazy += 1
raw = str(soup_img)
log3.append(f"data-src → src + 原生 lazy：{n_lazy} 張")

# ⑬ 圖片路徑：官網 /assets/xxx-<digest>.ext → 本 repo /assets/xxx.ext
def strip_digest(fn):
    return re.sub(r'-[0-9a-f]{64}(\.\w+)$', r'\1', fn)
raw, n_img = re.subn(r'src="/assets/([^"]+)"',
                     lambda m: f'src="/assets/{strip_digest(m.group(1).split("/")[-1])}"', raw)
log3.append(f"圖片 src 改指本 repo：{n_img} 處")
raw, n_bg1 = re.subn(r"url\('https://orangeapple\.co/assets/([^']+)'\)",
                     lambda m: f"url('/assets/{strip_digest(m.group(1).split('/')[-1])}')", raw)
raw, n_bg2 = re.subn(r'url\("https://orangeapple\.co/assets/([^"]+)"\)',
                     lambda m: f'url("/assets/{strip_digest(m.group(1).split("/")[-1])}")', raw)
log3.append(f"背景圖路徑改指本 repo：{n_bg1 + n_bg2} 處")

# ⑭ 季節年份參數化（改共用檔一處、全部營隊頁生效）
for a, b in [('2027 寒假', '{{SEASON}}'), ('2027寒假', '{{SEASON}}'), ('冬令營', '{{SEASON_TYPE}}')]:
    raw, n = re.subn(re.escape(a), b, raw)
    if n: log3.append(f"參數化「{a}」→ {b}：{n} 處")

open('/tmp/stage3.html', 'w', encoding='utf-8').write(raw)
print("\n=== 第三階段轉換紀錄 ===")
for l in log3: print("  " + l)
print(f"\n最終長度 {len(raw):,}")
