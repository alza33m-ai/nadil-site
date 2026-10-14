"""يولّد صفحة طباعة أكواد الطاولات
الاستخدام: python3 tools/make_qr.py <base_url> <out.html> [data.js]"""
import json, subprocess, sys, io, html
import qrcode, qrcode.image.svg
root = __file__.rsplit("/tools/", 1)[0]
js = "const vm=require('vm');const c={window:{}};vm.createContext(c);vm.runInContext(require('fs').readFileSync('%s','utf8'),c);console.log(JSON.stringify(c.window.NADIL_DATA))" % (sys.argv[3] if len(sys.argv) > 3 else root + "/menu/data.js")
D = json.loads(subprocess.check_output(["node", "-e", js]))
base, out = sys.argv[1], sys.argv[2]
R = D["restaurant"]; color = R.get("color") or "#8E1B2C"
AR = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
def qr_svg(url):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=1, box_size=10)
    q.add_data(url); q.make(fit=True)
    m = q.get_matrix(); n = len(m)
    rects = "".join(f'<rect x="{x}" y="{y}" width="1" height="1"/>' for y, row in enumerate(m) for x, v in enumerate(row) if v)
    return f'<svg viewBox="0 0 {n} {n}" shape-rendering="crispEdges" class="qr"><rect width="{n}" height="{n}" fill="#fff"/><g fill="#111">{rects}</g></svg>'
cloche = f'<svg viewBox="0 0 120 120" width="30" height="30"><path d="M16 92 h88" stroke="{color}" stroke-width="9" stroke-linecap="round"/><path d="M22 84 A38 38 0 0 1 98 84 Z" fill="{color}"/><path d="M60 14 l4.5 11.5 11.5 4.5 -11.5 4.5 -4.5 11.5 -4.5 -11.5 -11.5 -4.5 11.5 -4.5 z" fill="#D99A26"/></svg>'
cards = []
for t in D["tables"]:
    url = f'{base}?t={t["n"]}&k={t["k"]}'
    logo = f'<img src="{html.escape(R["logo"])}" alt="" onerror="this.remove()">' if R.get("logo") else cloche
    cards.append(f'''<div class="card"><div class="top">{logo}<b>{html.escape(R["name"])}</b></div>
<div class="scan">امسح الكود واطلب</div>{qr_svg(url)}
<div class="tbl">طاولة <b>{str(t["n"]).translate(AR)}</b></div>
<div class="sub">رمز الطاولة: <span dir="ltr">{t["k"]}</span> · بدون تطبيق</div>
<div class="pw">منيو ذكي من نادل</div></div>''')
pages = [cards[i:i+6] for i in range(0, len(cards), 6)]
doc = f'''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>أكواد الطاولات · {html.escape(R["name"])}</title>
<style>@page{{size:A4;margin:0}}*{{box-sizing:border-box}}body{{margin:0;font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif;color:#1D1D1F}}
.page{{width:210mm;height:297mm;padding:10mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,1fr);gap:0;page-break-after:always}}
.card{{border:0.3mm dashed #BBB;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2mm;padding:5mm;text-align:center}}
.top{{display:flex;align-items:center;gap:2.5mm;font-size:5.5mm;font-weight:700;color:{color}}}.top img{{height:12mm;width:12mm;border-radius:50%;object-fit:cover}}
.scan{{font-size:4.2mm;font-weight:600;color:{color}}}
.qr{{width:52mm;height:52mm}}
.tbl{{font-size:6mm;line-height:1.3}}.tbl b{{font-size:11mm;color:{color}}}
.sub{{font-size:3.2mm;color:#555}}.pw{{font-size:2.8mm;color:#999}}</style></head><body>
{"".join(f'<div class="page">{"".join(p)}</div>' for p in pages)}</body></html>'''
open(out, "w", encoding="utf-8").write(doc)
print(len(cards), "tables")
