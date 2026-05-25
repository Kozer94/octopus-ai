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

هذا التيرمنال صار متقدم، لكنه ليس PTY كامل مثل VS Code Terminal. لذلك توجد حدود:

- لا يدعم برامج تفاعلية بالكامل مثل `vim`, `nano`, `mysql` interactive shell، أو prompts التي تحتاج إدخال مستمر.
- لا يدعم ألوان ANSI بشكل كامل حتى الآن.
- لا يدعم resize terminal الحقيقي الذي يرسل حجم الأعمدة والسطور للـ process.
- لا يدعم جلسات متعددة للتيرمنال.
- لا يدعم حفظ history بعد إغلاق التطبيق.
- لا يدعم autocomplete للأوامر أو الملفات.

## الباقي للتطوير

أفضل مراحل لاحقة:

1. إضافة `xterm.js` في الواجهة لعرض terminal احترافي.
2. إضافة `node-pty` في السيرفر لتشغيل shell تفاعلي حقيقي.
3. ربط التيرمنال عبر WebSocket بدل HTTP streaming.
4. دعم ANSI colors.
5. دعم جلسات متعددة tabs.
6. حفظ command history لكل مشروع.
7. إضافة autocomplete للأوامر والمسارات.
8. إضافة terminal profiles مثل PowerShell وCMD وGit Bash.

## الخلاصة

التيرمنال الحالي مناسب لتشغيل أوامر التطوير اليومية ومشاهدة output حي وإيقاف العمليات. إذا نريد تجربة مثل VS Code تماما، المرحلة القادمة لازم تكون PTY/WebSocket.
