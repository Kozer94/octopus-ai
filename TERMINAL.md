# Octopus Terminal Guide

هذا الملف يشرح شنو يقدر يسوي التيرمنال داخل Octopus AI حاليا، وشنو باقي إذا نريد نخليه مثل Terminal حقيقي بالكامل.

## التشغيل الحالي

التيرمنال يشغل أوامر shell داخل مجلد المشروع المفتوح حاليا. إذا فتحت مشروع مثل `VCC CARD`، الأوامر تنفذ داخل مسار هذا المشروع.

يدعم حاليا:

- تشغيل أوامر عادية مثل `npm install`, `npm run dev`, `npm test`, `git status`.
- عرض المخرجات بشكل live streaming أثناء تنفيذ الأمر.
- إيقاف الأمر الجاري بـ `Ctrl+C` أو زر stop.
- فتح روابط `http://` و`https://` من مخرجات التيرمنال بالنقر عليها.
- أوامر متعددة الأسطر عبر `Shift+Enter`.
- تاريخ أوامر محلي عبر الأسهم `Up` و`Down`.
- نسخ ولصق من قائمة الكليك يمين.

## أمثلة أوامر مفيدة

### Node / React / Next.js

```bash
npm install
npm run dev
npm run build
npm test
npm run lint
npm run check
```

### Laravel / PHP

```bash
composer install
php artisan serve
php artisan migrate
php artisan test
php -l app/Models/User.php
```

### Git

```bash
git status
git diff
git log --oneline -5
git branch
git remote -v
```

### Windows / PowerShell style

```powershell
dir
Get-ChildItem
Get-Content README.md
```

## اختصارات التيرمنال

| الاختصار | الوظيفة |
| --- | --- |
| `Enter` | تنفيذ الأمر الحالي |
| `Shift+Enter` | إضافة سطر جديد داخل الأمر |
| `Ctrl+C` | إيقاف الأمر الجاري إذا يوجد أمر يعمل |
| `Ctrl+L` | تنظيف مخرجات التيرمنال |
| `Ctrl+A` | تحديد الأمر المكتوب حاليا |
| `Arrow Up` | استرجاع الأمر السابق |
| `Arrow Down` | الرجوع للأمر الأحدث أو تفريغ السطر |

## كليك يمين

قائمة الكليك يمين داخل التيرمنال تدعم:

- `Copy Selection`
- `Copy All`
- `Paste`
- `Interrupt`
- `Clear`
- `Focus Prompt`

## أوامر ممنوعة حاليا

Octopus يمنع بعض الأوامر الخطيرة حتى ما يصير حذف أو إيقاف للنظام بالخطأ:

```bash
rm -rf
del /f /s
format
shutdown
reboot
git reset --hard
git clean -fd
```

## حدود التيرمنال الحالية

التيرمنال انتقل إلى `xterm.js + node-pty + WebSocket`، لذلك صار أقرب إلى تيرمنال حقيقي:

- `xterm.js` يعرض ANSI colors ويتعامل مع الإدخال والمخرجات كواجهة terminal.
- `@xterm/addon-fit` يضبط حجم الأعمدة والسطور عند resize.
- `node-pty` يشغل shell حقيقي مثل PowerShell على Windows أو bash على Linux/macOS.
- WebSocket يربط الواجهة بالـ PTY كـ stream مستمر.

## حدود التيرمنال الحالية

رغم الانتقال إلى PTY، ما زالت توجد نقاط تحتاج تحسين:

- يحتاج اختبار أوسع مع برامج تفاعلية مثل `vim`, `nano`, `mysql` interactive shell.
- لا يدعم جلسات متعددة للتيرمنال.
- لا يدعم حفظ history بعد إغلاق التطبيق.
- لا يدعم autocomplete للأوامر أو الملفات.
- أوامر Run Project من المينيوبار ما زالت تستخدم runner منفصل، وليست مدمجة بالكامل داخل جلسة PTY.

## الباقي للتطوير

أفضل مراحل لاحقة:

1. دعم جلسات متعددة tabs.
2. حفظ command history لكل مشروع.
3. إضافة autocomplete للأوامر والمسارات.
4. إضافة terminal profiles مثل PowerShell وCMD وGit Bash.
5. دمج Run Project داخل جلسة PTY بدل runner منفصل.
6. إضافة reconnect/resume للجلسة إذا أغلقت الواجهة.
7. إضافة بحث داخل مخرجات التيرمنال.

## الخلاصة

التيرمنال الحالي صار مبني على PTY/WebSocket، وهذا هو الأساس الصحيح لتجربة قريبة من VS Code Terminal. الباقي الآن تحسينات تجربة مثل تعدد الجلسات، history دائم، profiles، ودمج أوامر التشغيل مع نفس الجلسة.
