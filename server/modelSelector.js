/**
 * Model Router — Multi-Factor Decision Engine
 *
 * يختار النموذج بناءً على عوامل متعددة:
 *   1. taskType    — نوع المهمة (debug, code, planning, ...)
 *   2. complexity  — تعقيد الطلب (low/medium/high)
 *   3. fileType    — نوع الملف النشط (code/docs/config/style)
 *   4. contextSize — حجم الـ context بالـ tokens
 *   5. latencySensitive — هل السرعة أهم من الجودة
 *
 * Backward compatible: selectModel(command) لا يزال يعمل
 */

const path = require('path');
const { getDefaultModel, getModelById } = require('./services/ModelRegistry');

// ─── Task Types ──────────────────────────────────────────────
const TASK_TYPES = {
  DEBUG:         'debug',
  REFACTOR:      'refactor',
  CODE_GENERATION:'code_generation',
  PLANNING:      'planning',
  ANALYSIS:      'analysis',
  TESTING:       'testing',
  DOCUMENTATION: 'documentation',
  GENERAL:       'general',
};

const COMPLEXITY_LEVELS = {
  LOW:    'low',
  MEDIUM: 'medium',
  HIGH:   'high',
};

// ─── File Type Classification ─────────────────────────────────
const FILE_TYPE_HINTS = {
  // Code → biases toward code-specialized models
  '.js': 'code', '.ts': 'code', '.jsx': 'code', '.tsx': 'code',
  '.py': 'code', '.go': 'code', '.rs': 'code',  '.java': 'code',
  '.c':  'code', '.cpp': 'code', '.cs': 'code', '.rb': 'code',
  '.php': 'code', '.swift': 'code', '.kt': 'code',
  // Docs → fast model is sufficient
  '.md': 'docs', '.txt': 'docs', '.rst': 'docs',
  // Config → fast model is sufficient
  '.json': 'config', '.yaml': 'config', '.yml': 'config',
  '.toml': 'config', '.env': 'config', '.ini': 'config',
  // Style → lightweight
  '.css': 'style', '.scss': 'style', '.less': 'style', '.html': 'style',
};

function detectFileTypeHint(activeFile) {
  if (!activeFile) return null;
  const ext = path.extname(String(activeFile)).toLowerCase();
  return FILE_TYPE_HINTS[ext] || null;
}

// ─── Task Detection ───────────────────────────────────────────

function detectTaskType(command = '') {
  const text = String(command || '').toLowerCase();
  if (/debug|fix|error|bug|خطأ|تصحيح|إصلاح/i.test(text))              return TASK_TYPES.DEBUG;
  if (/refactor|optimize|improve|تحسين|إعادة هيكلة/i.test(text))       return TASK_TYPES.REFACTOR;
  if (/create|build|make|add|implement|write|أنشئ|ابني|أضف|اكتب/i.test(text)) return TASK_TYPES.CODE_GENERATION;
  if (/plan|design|architecture|how to|خطط|صمم|هيكل/i.test(text))      return TASK_TYPES.PLANNING;
  if (/analyze|explain|understand|review|حلل|اشرح|افهم/i.test(text))   return TASK_TYPES.ANALYSIS;
  if (/test|verify|check|اختبار|تحقق/i.test(text))                     return TASK_TYPES.TESTING;
  if (/document|readme|comment|وثق|توثيق/i.test(text))                 return TASK_TYPES.DOCUMENTATION;
  return TASK_TYPES.GENERAL;
}

function detectComplexity(command = '') {
  const text = String(command || '').toLowerCase();
  const len  = text.length;

  const highSignals = ['complex', 'advanced', 'architecture', 'system', 'integration',
    'معقد', 'متقدم', 'نظام', 'تكامل', 'هيكلية'];
  const lowSignals  = ['simple', 'basic', 'quick', 'small', 'minor',
    'بسيط', 'أساسي', 'سريع', 'صغير', 'طفيف'];

  if (highSignals.some(s => text.includes(s)) || len > 300) return COMPLEXITY_LEVELS.HIGH;
  if (lowSignals.some(s => text.includes(s))  || len < 100)  return COMPLEXITY_LEVELS.LOW;
  return COMPLEXITY_LEVELS.MEDIUM;
}

// ─── Model Matrix ─────────────────────────────────────────────
const FALLBACK_MODEL = 'deepseek/deepseek-chat-v3-0324';

// [low, medium, high] complexity per task
const MODEL_MATRIX = {
  debug:          { low: FALLBACK_MODEL,                         medium: 'deepseek/deepseek-r1',            high: 'deepseek/deepseek-r1'              },
  refactor:       { low: FALLBACK_MODEL,                         medium: 'qwen/qwen2.5-coder-32b-instruct', high: 'qwen/qwen2.5-coder-32b-instruct'   },
  code_generation:{ low: 'qwen/qwen2.5-coder-32b-instruct',     medium: 'qwen/qwen2.5-coder-32b-instruct', high: FALLBACK_MODEL                      },
  planning:       { low: FALLBACK_MODEL,                         medium: 'google/gemini-flash-1.5',         high: 'google/gemini-flash-1.5'            },
  analysis:       { low: FALLBACK_MODEL,                         medium: 'deepseek/deepseek-r1',            high: 'deepseek/deepseek-r1'               },
  testing:        { low: 'meta-llama/llama-3.1-8b-instruct',    medium: 'meta-llama/llama-3.1-8b-instruct',high: FALLBACK_MODEL                      },
  documentation:  { low: 'meta-llama/llama-3.1-8b-instruct',    medium: FALLBACK_MODEL,                    high: FALLBACK_MODEL                      },
  general:        { low: FALLBACK_MODEL,                         medium: FALLBACK_MODEL,                    high: FALLBACK_MODEL                      },
};

// Timeout tiers per model class (ms) — used by aiService for per-model timeout
const MODEL_TIMEOUT_TIERS = {
  'deepseek/deepseek-r1':               90_000,  // reasoning models are slow
  'google/gemini-flash-1.5':            45_000,  // large context but fast
  'qwen/qwen2.5-coder-32b-instruct':    60_000,
  'meta-llama/llama-3.1-8b-instruct':   20_000,  // fast/cheap
  [FALLBACK_MODEL]:                     60_000,
};

// Large-context threshold: if context > this many tokens, prefer Gemini
const LARGE_CONTEXT_TOKEN_THRESHOLD = 30_000;

// ─── Model Selection Logic ────────────────────────────────────

function selectModelForTask(taskType, complexity) {
  return MODEL_MATRIX?.[taskType]?.[complexity] || FALLBACK_MODEL;
}

function selectProviderForModel(modelName) {
  return getModelById(modelName)?.provider || getDefaultModel().provider;
}

/**
 * Multi-factor model selection
 *
 * @param {string}  command            — طلب المستخدم
 * @param {object}  [opts]
 * @param {string}  [opts.activeFile]        — مسار الملف النشط
 * @param {number}  [opts.contextSize]       — حجم الـ context بالـ tokens
 * @param {boolean} [opts.latencySensitive]  — true → fast model فقط
 * @returns {ModelSelection}
 */
function selectModel(command = '', opts = {}) {
  const {
    activeFile       = '',
    contextSize      = 0,
    latencySensitive = false,
  } = (typeof opts === 'object' && opts !== null) ? opts : {};

  const taskType    = detectTaskType(command);
  const complexity  = detectComplexity(command);
  const fileType    = detectFileTypeHint(activeFile);

  // Base model from matrix
  let modelName = selectModelForTask(taskType, complexity);

  // ── Factor: latency-sensitive → always use fast model ──────
  if (latencySensitive) {
    modelName = 'meta-llama/llama-3.1-8b-instruct';
  }

  // ── Factor: large context → prefer Gemini (1M token window) ─
  else if (contextSize > LARGE_CONTEXT_TOKEN_THRESHOLD) {
    modelName = 'google/gemini-flash-1.5';
  }

  // ── Factor: code file + general task → bias toward coder ────
  else if (fileType === 'code' && (taskType === TASK_TYPES.GENERAL || taskType === TASK_TYPES.CODE_GENERATION)) {
    modelName = MODEL_MATRIX.code_generation[complexity] || 'qwen/qwen2.5-coder-32b-instruct';
  }

  // ── Factor: docs/config file + general → fast model ─────────
  else if ((fileType === 'docs' || fileType === 'config') && taskType === TASK_TYPES.GENERAL) {
    modelName = 'meta-llama/llama-3.1-8b-instruct';
  }

  const provider   = selectProviderForModel(modelName);
  const isDefault  = modelName === FALLBACK_MODEL;
  const timeoutMs  = MODEL_TIMEOUT_TIERS[modelName] || 60_000;

  const reasoning = [
    `Task: ${taskType}`,
    `Complexity: ${complexity}`,
    fileType      ? `FileType: ${fileType}`           : null,
    contextSize   ? `Context: ~${contextSize}t`        : null,
    latencySensitive ? 'latencySensitive: true'        : null,
  ].filter(Boolean).join(' | ') + ` → ${modelName} via ${provider}${isDefault ? ' [default]' : ' [specialized]'}`;

  return {
    taskType,
    complexity,
    fileType,
    contextSize,
    latencySensitive,
    modelName,
    provider,
    fallbackModel: FALLBACK_MODEL,
    timeoutMs,
    reasoning,
  };
}

module.exports = {
  selectModel,
  detectTaskType,
  detectComplexity,
  detectFileTypeHint,
  MODEL_TIMEOUT_TIERS,
  TASK_TYPES,
  COMPLEXITY_LEVELS,
  FALLBACK_MODEL,
};
