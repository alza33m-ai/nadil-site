موقع نادل: طريقة الرفع على السيرفر (Coolify)
=============================================

الملفات:
- index.html     صفحة الموقع كاملة
- server.js      خادم بسيط يعرض الموقع ويشغّل المساعد الذكي
- package.json   تعريف التشغيل (node server.js)

قبل الرفع، افتح index.html وعدّل الإعدادات في أول السكربت (ابحث عن «إعدادات نادل»):
  whatsapp: "9665XXXXXXXX"
  email:    "hello@nadil.sa"

الرفع على Coolify:
1. ارفع المجلد إلى مستودع GitHub خاص.
2. في Coolify: New Resource ← Application ← اختر المستودع ← Build Pack: Nixpacks.
3. Port: 3000
4. Environment Variables:
     ANTHROPIC_API_KEY = مفتاحك من console.anthropic.com
5. Domain: https://nadil.sa  ثم Deploy.

بدون مفتاح API الموقع يشتغل عادي، والمساعد يرد بإجابات جاهزة عن الأسعار والمزايا.
المساعد عليه حد ٢٠ سؤال لكل زائر كل ١٠ دقائق عشان ما تزيد التكلفة.
