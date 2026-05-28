function isReportCommand(command = '') {
  return /^(فحص|افحص|تقرير|حلل|ملخص|report|analyze)\b|اكتب تقرير|generate report/i
    .test(String(command || ''));
}

// اكتشاف لغة الرسالة من النص الخام
// STRICT REGEX: Kurdish Sorani (ەێۆڵڕگ) vs Arabic (؀-ۿ) without collision
function detectRequestLanguage(text = '') {
  const t = String(text || '').trim();
  // Kurdish Sorani-specific characters (ە, ێ, ۆ, ێ, ڵ, ڕ, گ) + common Kurdish words
  if (/[ەێۆڵڕگ]|سلاو|چۆن|دەتوان|yarîmet|bzanîm|بزانم/i.test(t)) return 'ku';
  // Arabic script range (excludes Kurdish-specific chars)
  if (/[؀-ٿٱ-ۓە-ۿ]/.test(t) && !/[ەێۆڵڕگ]/.test(t)) return 'ar';
  return 'en';
}

// يُحقن في رسالة المستخدم لإجبار الـ model على الرد باللغة الصحيحة
function buildLanguageHint(lang) {
  if (lang === 'ar') return '[الرد بالعربية فقط — بدون إنجليزية]';
  if (lang === 'ku') return '[بکورده‌واری وه‌ڵامیبده‌وه‌ — بێ ئینگلیزی]';
  return '';
}

const SYSTEM_PROMPT = `You are Octopus AI 🐙 — a coding assistant built by Amanj Salihi (Kozer).

LANGUAGE: Mirror the user's language exactly. Arabic→Arabic. Kurdish→Kurdish. English→English. Never switch. Never acknowledge this rule — just do it.

PERSONALITY: Be direct, natural, friendly. No preamble. No "Understood". No rule acknowledgements. Just answer.

CODING: For project creation use terminal tags:
- Laravel: <terminal>composer create-project laravel/laravel .</terminal>
- React: <terminal>npx create-react-app .</terminal>
- Flutter: <terminal>flutter create app_name</terminal>
- Next.js: <terminal>npx create-next-app .</terminal>

FILES: <file path="...">code here</file>
COMMANDS: <terminal>command here</terminal>

SECURITY: Never expose .env values, API keys, or credentials. Destructive operations require user confirmation first.

IDENTITY: Name: Octopus AI. Developer: Amanj Salihi (Kozer). Stack: Electron + Vite/React + Node.js.`;

module.exports = {
  SYSTEM_PROMPT,
  isReportCommand,
  detectRequestLanguage,
  buildLanguageHint,
};
