#!/usr/bin/env python3
"""مطعم جديد في نادل بأمر واحد.

python3 tools/new_restaurant.py <slug> "<الاسم>" --tables 15 [--en "English Name"] [--color "#8E1B2C"] [--base https://nadil.fastwinds.sa]

- ينسخ قالب المنيو (menu/) لمجلد المطعم
- يكتب data.js بالاسم واللون وطاولات بمفاتيح عشوائية، وبدون أصناف (صاحب المطعم يضيفها من لوحته)
- يضيف رمز سري عشوائي في data/pins.json (يشتغل على طول بدون إعادة تشغيل)
- يولّد صفحة أكواد الطاولات qr.html
"""
import argparse, json, os, random, re, secrets, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = argparse.ArgumentParser()
p.add_argument("slug"); p.add_argument("name")
p.add_argument("--tables", type=int, default=10); p.add_argument("--en", default="")
p.add_argument("--color", default="#8E1B2C"); p.add_argument("--base", default="https://nadil.fastwinds.sa")
a = p.parse_args()
if not re.fullmatch(r"[a-z0-9-]{2,40}", a.slug): sys.exit("slug: حروف إنجليزية صغيرة وأرقام وشرطة فقط")
dst = os.path.join(ROOT, a.slug)
if os.path.exists(dst): sys.exit("المجلد موجود: " + dst)
os.makedirs(dst)
for f in ("index.html", "offers.js", "admin.html"): shutil.copy(os.path.join(ROOT, "menu", f), dst)
letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
tables = [{"n": i, "k": random.choice(letters) + str(random.randint(2, 9))} for i in range(1, a.tables + 1)]
data = {"restaurant": {"name": a.name, "nameEn": a.en, "slug": a.slug, "logo": "", "cover": "", "color": a.color,
        "theme": {}, "currency": "ر.س", "vatNote": "الأسعار شاملة ضريبة القيمة المضافة", "goatcounter": "", "social": []},
        "tables": tables, "categories": [{"id": "main", "name": "المنيو", "en": "Menu"}], "items": [],
        "offersStore": {"type": "auto"}, "offers": []}
with open(os.path.join(dst, "data.js"), "w", encoding="utf-8") as f:
    f.write("/* " + a.name + ": بيانات المنيو */\nwindow.NADIL_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")
pins_file = os.path.join(ROOT, "data", "pins.json"); os.makedirs(os.path.dirname(pins_file), exist_ok=True)
pins = json.load(open(pins_file)) if os.path.exists(pins_file) else {}
pin = str(secrets.randbelow(9000) + 1000); pins[a.slug] = pin
tmp = pins_file + ".tmp"; json.dump(pins, open(tmp, "w"), ensure_ascii=False, indent=1); os.replace(tmp, pins_file)
base = a.base.rstrip("/") + "/" + a.slug + "/"
subprocess.run([sys.executable, os.path.join(ROOT, "tools", "make_qr.py"), base, os.path.join(dst, "qr.html"), os.path.join(dst, "data.js")], check=False)
print("\nتم ✓", a.name)
print("المنيو:        ", base + "?t=1&k=" + tables[0]["k"])
print("لوحة المطعم:   ", base + "admin.html", " الرمز:", pin)
print("أكواد الطاولات:", base + "qr.html")
print("\nملاحظة: data/pins.json على الخادم، ما ينرفع لـ GitHub. شغّل الأمر على الخادم أو انسخ الرمز لملفه.")
