/**
 * Context Builder Service — Octopus AI
 *
 * بناء الـ context بشكل ذكي واقتصادي:
 *
 * أولويات المصادر (تنازلياً):
 *   1. project map      — خريطة المشروع الكاملة (الأعلى أولوية)
 *   2. project context  — ملفات مفتوحة من الـ client
 *   3. active file      — محتوى الملف الحالي
 *   4. raw command      — الطلب فقط
 *
 * الميزات:
 *   - token estimation دقيق (يدعم العربية والـ CJK)
 *   - token budget manager — يحترم contextWindow الـ model
 *   - deduplication layer — يزيل الرسائل المتكررة من session history
 *   - smart truncation — يقطع من الأقدم لا من الأحدث
 *   - language hint injection بعد hook (لا يُخزَّن في session)
 */

const { detectRequestLanguage, buildLanguageHint } = require('./octopusConfig');

// ─── Token Estimation ─────────────────────────────────────────
// نسخة محلية مستقلة — تجنباً للـ circular dependency مع aiService

/**
 * يقدّر عدد الـ tokens بدقة أعلى من char/4 البسيط
 * يأخذ في الحسبان الحروف العربية والـ CJK التي تُحسب token واحد لكل حرف
 */
function estimateTokens(text) {
  const str = typeof text === 'string' ? text : JSON.stringify(text || '');
  const arabic = (str.match(/[\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF]/g) || []).length;
  return Math.ceil(arabic + (str.length - arabic) / 4);
}

// ─── Constants ───────────────────────────────────────────────
const MAX_COMMAND_CHARS          = 2000;
const MAX_CONTEXT_CHARS          = 4000;  // مرفوع من 2000 لأن token budget يتحكم لاحقاً
const MAX_TAGGED_COMMAND_CHARS   = 8000;
const DEFAULT_CONTEXT_WINDOW     = 64000; // tokens
const RESPONSE_RESERVE_TOKENS    = 4096;  // حجوز للـ response

// ─── Context Building ─────────────────────────────────────────

/**
 * يبني fullCommand من المصادر المتاحة حسب الأولوية
 * @param {object} opts
 * @returns {string}
 */
function buildFullCommand({ command, projectMapContext, projectContext, activeFile, activeFileContent }) {
  const cmd = String(command || '').slice(0, MAX_COMMAND_CHARS);

  if (projectMapContext) {
    return `خريطة المشروع والسياق الذكي:\n${String(projectMapContext).slice(0, MAX_CONTEXT_CHARS)}\n\n--- USER REQUEST START ---\n${cmd}\n--- USER REQUEST END ---`;
  }

  if (projectContext) {
    return `ملفات المشروع المفتوحة:\n${String(projectContext).slice(0, MAX_CONTEXT_CHARS)}\n\nالملف الحالي: ${activeFile || ''}\n\n--- USER REQUEST START ---\n${cmd}\n--- USER REQUEST END ---`;
  }

  if (activeFileContent) {
    return `الملف الحالي (${activeFile || 'unknown'}):\n\`\`\`\n${String(activeFileContent).slice(0, MAX_CONTEXT_CHARS)}\n\`\`\`\n\n--- USER REQUEST START ---\n${cmd}\n--- USER REQUEST END ---`;
  }

  return cmd;
}

// ─── Language Hint ────────────────────────────────────────────

/**
 * يضيف language hint بعد hook ويُعيد taggedCommand مع metadata
 * لا يُخزَّن الـ hint في session history — يُطبَّق على الرسالة الحالية فقط
 */
function buildTaggedCommand(rawCommand, fullCommand) {
  const bounded = fullCommand.slice(0, MAX_TAGGED_COMMAND_CHARS);
  const lang    = detectRequestLanguage(rawCommand);
  const hint    = buildLanguageHint(lang);
  return {
    taggedCommand: hint ? `${hint}\n${bounded}` : bounded,
    lang,
    hint,
  };
}

// ─── Message Deduplication ────────────────────────────────────

/**
 * يزيل الرسائل المتكررة المتتالية من session history
 * مثال: إذا أُضيف نفس الـ user message مرتين، يُبقي نسخة واحدة
 *
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Array}
 */
function deduplicateMessages(messages) {
  if (!Array.isArray(messages) || messages.length <= 1) return messages || [];

  const result = [];
  for (const msg of messages) {
    const prev = result[result.length - 1];
    if (prev && prev.role === msg.role && prev.content === msg.content) continue;
    result.push(msg);
  }
  return result;
}

// ─── Token Budget Manager ─────────────────────────────────────

/**
 * يقلّص session messages لتناسب الـ token budget المتاح
 * يحذف من الأقدم ويحتفظ بالأحدث دائماً
 *
 * @param {Array}  messages          — session history (بدون system prompt)
 * @param {object} opts
 * @param {string} [opts.systemPrompt]        — لحساب حجمه
 * @param {string} [opts.userCommand]         — الرسالة الجديدة المراد إضافتها
 * @param {number} [opts.modelContextWindow]  — من ModelRegistry
 * @returns {Array} — messages مقلوصة
 */
function budgetSessionMessages(messages, {
  systemPrompt       = '',
  userCommand        = '',
  modelContextWindow = DEFAULT_CONTEXT_WINDOW,
} = {}) {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const totalBudget   = modelContextWindow - RESPONSE_RESERVE_TOKENS;
  const systemTokens  = estimateTokens(systemPrompt);
  const commandTokens = estimateTokens(userCommand);
  let   remaining     = totalBudget - systemTokens - commandTokens;

  if (remaining <= 0) return []; // لا يوجد budget للـ history

  // نقلّص من الأقدم ونحتفظ بالأحدث
  const deduped = deduplicateMessages(messages);
  const result  = [];

  for (let i = deduped.length - 1; i >= 0; i--) {
    const t = estimateTokens(deduped[i].content || '');
    if (remaining - t < 0 && result.length > 0) break;
    result.unshift(deduped[i]);
    remaining -= t;
  }

  return result;
}

// ─── Combined API ─────────────────────────────────────────────

/**
 * الدالة الشاملة — تبني context كاملاً في خطوة واحدة
 * @returns {{ taggedCommand, lang, hint, fullCommand, estimatedTokens }}
 */
function buildRequestContext({ command, projectMapContext, projectContext, activeFile, activeFileContent }) {
  const fullCommand     = buildFullCommand({ command, projectMapContext, projectContext, activeFile, activeFileContent });
  const { taggedCommand, lang, hint } = buildTaggedCommand(command, fullCommand);
  return {
    taggedCommand,
    lang,
    hint,
    fullCommand,
    estimatedTokens: estimateTokens(taggedCommand),
  };
}

module.exports = {
  buildFullCommand,
  buildTaggedCommand,
  buildRequestContext,
  deduplicateMessages,
  budgetSessionMessages,
  estimateTokens,
};
