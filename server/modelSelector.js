/**
 * Model Abstraction Layer
 * يختار النموذج الأنسب بناءً على نوع المهمة وتعقيدها
 */

const TASK_TYPES = {
  DEBUG: 'debug',
  REFACTOR: 'refactor',
  CODE_GENERATION: 'code_generation',
  PLANNING: 'planning',
  ANALYSIS: 'analysis',
  TESTING: 'testing',
  DOCUMENTATION: 'documentation',
  GENERAL: 'general',
};

const COMPLEXITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

/**
 * تحديد نوع المهمة من النص
 */
function detectTaskType(command = '') {
  const text = String(command || '').toLowerCase();
  
  if (/debug|fix|error|bug|خطأ|تصحيح|إصلاح/i.test(text)) return TASK_TYPES.DEBUG;
  if (/refactor|optimize|improve|تحسين|إعادة هيكلة/i.test(text)) return TASK_TYPES.REFACTOR;
  if (/create|build|make|add|implement|write|أنشئ|ابني|أضف|اكتب/i.test(text)) return TASK_TYPES.CODE_GENERATION;
  if (/plan|design|architecture|how to|خطط|صمم|هيكل/i.test(text)) return TASK_TYPES.PLANNING;
  if (/analyze|explain|understand|review|حلل|اشرح|افهم/i.test(text)) return TASK_TYPES.ANALYSIS;
  if (/test|verify|check|اختبار|تحقق/i.test(text)) return TASK_TYPES.TESTING;
  if (/document|readme|comment|وثق|توثيق/i.test(text)) return TASK_TYPES.DOCUMENTATION;
  
  return TASK_TYPES.GENERAL;
}

/**
 * تحديد مستوى التعقيد من النص
 */
function detectComplexity(command = '') {
  const text = String(command || '').toLowerCase();
  const length = text.length;
  
  // مؤشرات التعقيد العالي
  const highComplexityIndicators = [
    'complex', 'advanced', 'architecture', 'system', 'integration',
    'معقد', 'متقدم', 'نظام', 'تكامل', 'هيكلية'
  ];
  
  // مؤشرات التعقيد المنخفض
  const lowComplexityIndicators = [
    'simple', 'basic', 'quick', 'small', 'minor',
    'بسيط', 'أساسي', 'سريع', 'صغير', 'طفيف'
  ];
  
  const hasHigh = highComplexityIndicators.some(indicator => text.includes(indicator));
  const hasLow = lowComplexityIndicators.some(indicator => text.includes(indicator));
  
  if (hasHigh || length > 300) return COMPLEXITY_LEVELS.HIGH;
  if (hasLow || length < 100) return COMPLEXITY_LEVELS.LOW;
  
  return COMPLEXITY_LEVELS.MEDIUM;
}

/**
 * اختيار النموذج الأنسب بناءً على نوع المهمة والتعقيد
 */
function selectModelForTask(taskType, complexity) {
  // المهام البرمجية المعقدة - نستخدم أقوى model مجاني
  if (taskType === TASK_TYPES.DEBUG || taskType === TASK_TYPES.REFACTOR) {
    if (complexity === COMPLEXITY_LEVELS.HIGH) {
      return 'llama-3.3-70b-versatile'; // Groq - الأقوى
    }
    return 'llama-3.3-70b-versatile';
  }
  
  // التخطيط والتحليل - نستخدم model متوازن
  if (taskType === TASK_TYPES.PLANNING || taskType === TASK_TYPES.ANALYSIS) {
    if (complexity === COMPLEXITY_LEVELS.HIGH) {
      return 'llama-3.3-70b-versatile';
    }
    return 'gemma2-9b-it'; // Groq - سريع وجيد للتحليل
  }
  
  // توليد الكود - نستخدم model قوي
  if (taskType === TASK_TYPES.CODE_GENERATION) {
    if (complexity === COMPLEXITY_LEVELS.HIGH) {
      return 'llama-3.3-70b-versatile';
    }
    return 'llama-3.1-8b-instant'; // Groq - سريع جداً
  }
  
  // الاختبار والتوثيق - نستخدم model سريع
  if (taskType === TASK_TYPES.TESTING || taskType === TASK_TYPES.DOCUMENTATION) {
    return 'llama-3.1-8b-instant';
  }
  
  // الافتراضي - نستخدم model متوازن
  if (complexity === COMPLEXITY_LEVELS.HIGH) {
    return 'llama-3.3-70b-versatile';
  }
  if (complexity === COMPLEXITY_LEVELS.LOW) {
    return 'llama-3.1-8b-instant';
  }
  
  return 'llama-3.3-70b-versatile';
}

/**
 * اختيار provider بناءً على النموذج المطلوب
 */
function selectProviderForModel(modelName) {
  const modelProviderMap = {
    'llama-3.3-70b-versatile': 'groq',
    'llama-3.1-8b-instant': 'groq',
    'gemma2-9b-it': 'groq',
    'mistral-small-latest': 'mistral',
    'command-r-plus': 'cohere',
    'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free': 'together',
    'meta-llama/llama-3.3-70b-instruct:free': 'openrouter',
    'gemini-2.0-flash': 'gemini',
  };
  
  return modelProviderMap[modelName] || 'groq';
}

/**
 * الدالة الرئيسية لاختيار النموذج
 */
function selectModel(command = '') {
  const taskType = detectTaskType(command);
  const complexity = detectComplexity(command);
  const modelName = selectModelForTask(taskType, complexity);
  const provider = selectProviderForModel(modelName);
  
  return {
    taskType,
    complexity,
    modelName,
    provider,
    reasoning: `Task: ${taskType}, Complexity: ${complexity} → Model: ${modelName} (${provider})`,
  };
}

module.exports = {
  selectModel,
  detectTaskType,
  detectComplexity,
  TASK_TYPES,
  COMPLEXITY_LEVELS,
};
