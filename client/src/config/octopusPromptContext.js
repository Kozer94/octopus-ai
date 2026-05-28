const REPORT_REQUEST_PATTERN = /فحص|تقرير|تقريري|حلل|تحليل|وثق|توثيق|ملخص|ملخّص|report|analyze|analysis|documentation|markdown|\bmd\b/i;
const EXECUTION_REQUEST_PATTERN = /أنشئ|انشئ|ابني|اصنع|نفذ|طبق|اكتب|أضف|اضف|عدل|عدّل|اصلح|أصلح|ركب|ثبّت|ثبت|اختبر|شغل|شغّل|احذف|انقل|ارفع|build|create|implement|add|fix|refactor|test|run|install|delete|move|push/i;
const QUESTION_PATTERN = /^(هل|ما|ماذا|من|متى|أين|اين|ليش|لماذا|كيف|شنو|اشرح لي|اريد اعرف|أريد أعرف|who|what|when|where|why|how)\b/i;
const CONTEXT_REQUEST_PATTERN = /الكود|كود|الملف|ملف|المشروع|مشروع|current file|this file|code|repo|repository|project|bug|error|خطأ/i;
const OCTOPUS_IDENTITY_PATTERN = /من.*(مطورك|صنعك|سواك|مبرمجك)|مطورك|صاحب فكرة|فكرة اخطبوط|عن نفسك|من انت|من أنت|ما هو اخطبوط|ماهو اخطبوط|who (built|made|developed) you|who are you|about yourself/i;
const KURDISH_SIGNAL_PATTERN = /سلاو|چۆن|جون|دەتوان|دەتوانیت|دةتوان|دةتوانيت|یارمەت|یارمەتی|يارمة|يارمةت|بزانم|دەمەو|دةمةو|دە|ئەم|ئێ|کە|بکەم|بکەیت|[ەێۆڵڕگ]/i;
const ARABIC_HELP_PATTERN = /كيف\s+(تقدر|يمكنك|تستطيع|تگدر|تكدر|تساعدني|تساعدنى)|شلون\s+(تساعدني|تگدر|تكدر)|شنو\s+(تقدر|تكدر|تگدر)/i;
const ENGLISH_HELP_PATTERN = /\b(how can you help|what can you do|help me|what do you do)\b/i;
const GREETING_PATTERN = /^(hi|hello|hey|salam|slaw|سلام|مرحبا|هلا|اهلا|أهلا|سلاو)(?:\s|[!؟?،,.]*$)/i;
const CAPABILITIES_PATTERN = /مواصفاتك|قدراتك|امكانياتك|إمكانياتك|شنو تقدر|ماذا تستطيع|what are your capabilities|your capabilities|your specs|what are you good at/i;
const CREATE_PROJECT_PATTERN = /أنشئ|انشئ|قم ب|ابني|اصنع|create|new|make| scaffold/i;
const PROJECT_TYPES = [
  { id: 'laravel', label: 'Laravel', command: 'composer create-project laravel/laravel .', pattern: /لارافيل|laravel/i },
  { id: 'flutter', label: 'Flutter', command: 'flutter create project_name', pattern: /فلتر|flutter/i },
  { id: 'react', label: 'React', command: 'npx create-react-app .', pattern: /رياكت|ريأكت|react/i },
  { id: 'next', label: 'Next.js', command: 'npx create-next-app .', pattern: /next\.?js|نكست|نيكست/i },
];
const LANGUAGE_LOCKS = {
  ar: { label: 'العربية', instruction: 'Arabic' },
  ku: { label: 'الكردية', instruction: 'Kurdish' },
  en: { label: 'English', instruction: 'English' },
};

export const LANGUAGE_LOCK_STORAGE_KEY = 'octopus-language-lock';

export function buildOpenFilesContext(files = []) {
  return files
    .filter(file => file.content)
    .slice(0, 5)
    .map(file => `### ${file.name}:\n\`\`\`\n${file.content?.slice(0, 500)}\n\`\`\``)
    .join('\n\n');
}

export function isComplexOctopusTask(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) return false;

  if (REPORT_REQUEST_PATTERN.test(normalized)) return true;
  if (QUESTION_PATTERN.test(normalized) && !EXECUTION_REQUEST_PATTERN.test(normalized)) return false;

  return EXECUTION_REQUEST_PATTERN.test(normalized);
}

export function shouldSendProjectContext(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  return CONTEXT_REQUEST_PATTERN.test(normalized) || EXECUTION_REQUEST_PATTERN.test(normalized) || REPORT_REQUEST_PATTERN.test(normalized);
}

function normalizeLanguageCode(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (/^(ar|arabic|عربي|العربي|العربية|العربيه)$/.test(normalized)) return 'ar';
  if (/^(ku|ckb|kurdish|sorani|كردي|الكردي|الكردية|كوردي|كوردی)$/.test(normalized)) return 'ku';
  if (/^(en|eng|english|انجليزي|إنجليزي|الانجليزية|الإنجليزية)$/.test(normalized)) return 'en';
  return '';
}

export function isSupportedLanguageLock(language = '') {
  return Boolean(LANGUAGE_LOCKS[language]);
}

export function getLanguageLockLabel(language = '') {
  return LANGUAGE_LOCKS[language]?.label || '';
}

export function parseLanguageLockCommand(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) return null;

  const clearMatch = normalized.match(/^\/lang(?:uage)?\s+(off|auto|clear|reset)$/i)
    || normalized.match(/^(الغ|إلغاء|الغي|امسح|ازل|أزل)\s+(تثبيت|قفل)?\s*اللغة/i);
  if (clearMatch) return { action: 'clear', language: '' };

  const slashMatch = normalized.match(/^\/lang(?:uage)?\s+(.+)$/i);
  if (slashMatch) {
    const language = normalizeLanguageCode(slashMatch[1]);
    return language ? { action: 'set', language } : null;
  }

  const naturalMatch = normalized.match(/^(ثبت|ثبّت|خلي|اجعل|اقفل|قفل)\s+(اللغة\s+)?(.+)$/i);
  if (naturalMatch) {
    const language = normalizeLanguageCode(naturalMatch[3]);
    return language ? { action: 'set', language } : null;
  }

  return null;
}

export function getLanguageLockReply(command) {
  if (!command) return '';
  if (command.action === 'clear') return 'تم إلغاء تثبيت اللغة. سأرجع لاكتشاف لغة كل رسالة تلقائياً.';
  const label = getLanguageLockLabel(command.language);
  if (!label) return '';
  if (command.language === 'ku') return `باشە، زمان کرا بە ${label}. لەمەودوا بە هەمان زمان وەڵام دەدەم.`;
  if (command.language === 'en') return `Done. Language is locked to ${label}. I will keep replying in English.`;
  return `تم تثبيت اللغة على ${label}. من الآن سأحافظ على نفس اللغة في الردود.`;
}

export function applyLanguageLockToCommand(command = '', language = '') {
  if (!isSupportedLanguageLock(language)) return command;
  const { instruction, label } = LANGUAGE_LOCKS[language];
  return [
    `[Language Lock: ${label}]`,
    `Reply ONLY in ${instruction}. Do not switch languages unless the user explicitly changes the language lock.`,
    '',
    'User message:',
    command,
  ].join('\n');
}

export function getProjectCreationAction(text = '', { languageLock = '' } = {}) {
  const normalized = String(text || '').trim();
  if (!normalized || !CREATE_PROJECT_PATTERN.test(normalized)) return null;
  const project = PROJECT_TYPES.find(item => item.pattern.test(normalized));
  if (!project) return null;
  const language = detectLocalLanguage(normalized, languageLock);
  const reply = language === 'ku'
    ? `باشە، بۆ دروستکردنی پڕۆژەی ${project.label} ئەم فەرمانە ئامادەیە:\n\n<terminal>${project.command}</terminal>`
    : language === 'en'
      ? `Sure. To create the ${project.label} project here, run:\n\n<terminal>${project.command}</terminal>`
      : `تمام، لإنشاء مشروع ${project.label} داخل هذا المجلد شغّل الأمر التالي:\n\n<terminal>${project.command}</terminal>`;
  return {
    type: project.id,
    label: project.label,
    command: project.command,
    reply,
  };
}

function detectLocalLanguage(text = '', languageLock = '') {
  if (isSupportedLanguageLock(languageLock)) return languageLock;
  const normalized = String(text || '').trim();
  if (KURDISH_SIGNAL_PATTERN.test(normalized)) return 'ku';
  if (/[ء-ي]/.test(normalized)) return 'ar';
  return 'en';
}

function getGreetingReply(text = '', languageLock = '') {
  if (!GREETING_PATTERN.test(String(text || '').trim())) return '';
  const language = detectLocalLanguage(text, languageLock);
  if (language === 'ku') return 'سلاو! دەتوانم یارمەتیت بدەم لە نووسین، چاککردنەوە، ڕوونکردنەوە و پشکنینی کۆد. چی دەتەوێت؟';
  if (language === 'ar') return 'أهلاً! أقدر أساعدك في بناء الميزات، إصلاح الأخطاء، شرح الكود، تشغيل الأوامر، مراجعة المشروع، وتحسين الواجهة. ماذا تريد أن نبدأ؟';
  return 'Hello! I can help you build features, fix bugs, explain code, run checks, review the project, and improve the UI. What should we start with?';
}

function getCapabilitiesReply(text = '', languageLock = '') {
  const normalized = String(text || '').trim();
  const language = detectLocalLanguage(normalized, languageLock);
  const asksForSpecs = CAPABILITIES_PATTERN.test(normalized);
  const isHelpQuestion = ENGLISH_HELP_PATTERN.test(normalized)
    || ARABIC_HELP_PATTERN.test(normalized)
    || asksForSpecs
    || (language === 'ku' && /یارمەت|يارمة|دەتوان|دةتوان|چۆن|جون/.test(normalized));
  if (!isHelpQuestion) return '';

  if (language === 'ku') {
    return [
      'دەتوانم وەک هاوکاری ئەندازیاری لەناو Octopus AI یارمەتیت بدەم:',
      '',
      '- کۆد بنووسم یان هەڵەکان چاک بکەم.',
      '- فایلەکانی پڕۆژە بخوێنمەوە و ڕوونی بکەمەوە.',
      '- terminal command پێشنیار بکەم و ئەنجامەکان شی بکەمەوە.',
      '- UI، performance، security و architecture باشتر بکەم.',
      '- کاتێک کارەکە گەورەیە، پلان دروست بکەم و پێش جێبەجێکردن داوای پشتڕاستکردنەوە بکەم.',
    ].join('\n');
  }

  if (language === 'ar') {
    if (asksForSpecs) {
      return [
        'مواصفاتي باختصار: أنا Octopus AI، مساعد هندسي مدمج داخل هذا التطبيق.',
        '',
        '- أقرأ سياق المشروع والملفات المفتوحة عند الحاجة.',
        '- أساعد في بناء الميزات، إصلاح الأخطاء، شرح الكود، وتشغيل الفحوصات.',
        '- عند المهام الكبيرة أجهز خطة وأطلب موافقتك قبل التنفيذ.',
        '- أتعامل أفضل مع العربية والإنجليزية، وأدعم الكردية في المحادثات العامة.',
        '- داخلياً أعتمد على واجهة React/Vite وخادم Node.js وتكامل مزودي AI وطبقات مراقبة مثل GPS/Telemetry.',
      ].join('\n');
    }

    return [
      'أقدر أساعدك كرفيق هندسي داخل Octopus AI:',
      '',
      '- أبني ميزات جديدة أو أعدل ملفات موجودة.',
      '- أصلح الأخطاء وأشرح السبب الحقيقي.',
      '- أقرأ سياق المشروع وأشرح الكود خطوة بخطوة.',
      '- أشغل فحوصات أو أوامر Terminal عند الحاجة.',
      '- أحسن الواجهة، الأداء، الأمان، وتنظيم المعمارية.',
      '- إذا كان الطلب كبيراً، أجهز خطة وأنت توافق قبل التنفيذ.',
    ].join('\n');
  }

  return [
    'I can help as an engineering partner inside Octopus AI:',
    '',
    '- Build new features or edit existing files.',
    '- Fix bugs and explain the root cause.',
    '- Read project context and explain code clearly.',
    '- Run checks or terminal commands when needed.',
    '- Improve UI, performance, security, and architecture.',
    '- For larger tasks, prepare a plan and ask before executing.',
  ].join('\n');
}

export function getLocalEconomyReply(text = '', { languageLock = '' } = {}) {
  const normalized = String(text || '').trim();
  if (!normalized) return '';

  const greetingReply = getGreetingReply(normalized, languageLock);
  if (greetingReply) return greetingReply;

  const capabilitiesReply = getCapabilitiesReply(normalized, languageLock);
  if (capabilitiesReply) return capabilitiesReply;

  if (!OCTOPUS_IDENTITY_PATTERN.test(normalized)) return '';

  return [
    'أنا Octopus AI، مساعد هندسي ذكي داخل هذا التطبيق.',
    '',
    'صاحب الفكرة والمطور الأساسي هو ئامانج صالحي، ولقبه كوزر، وهو مطور عراقي وصاحب رؤية المشروع.',
    '',
    'وقت التطوير الموثق حالياً هو هذا الأسبوع: 24-30 مايو 2026. وإذا سألتني عن يوم أو ساعة دقيقة فسأقول لك بصراحة إنها غير موثقة لدي.',
    '',
    'تقنياً أنا مبني كتطبيق سطح مكتب يعتمد على Electron وVite/React في الواجهة وNode.js في الخادم، مع تكامل مزودي ذكاء اصطناعي ونظام plugins وEngineer HUD لمراقبة الأخطاء.',
  ].join('\n');
}

export function getPromptEconomyProfile(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return {
      id: 'empty',
      label: 'Economy ready',
      detail: 'اكتب سؤالاً عاماً ليعمل بدون سياق ملفات، أو اطلب تعديل كود عند الحاجة.',
      sendsAi: false,
      sendsProjectContext: false,
    };
  }

  if (getLocalEconomyReply(normalized)) {
    return {
      id: 'local',
      label: 'Local reply',
      detail: 'هذا السؤال يرد عليه Octopus محلياً بدون AI tokens.',
      sendsAi: false,
      sendsProjectContext: false,
    };
  }

  const sendsProjectContext = shouldSendProjectContext(normalized);
  if (!sendsProjectContext) {
    return {
      id: 'light',
      label: 'Light AI',
      detail: 'سيتم إرسال السؤال فقط بدون ملفات المشروع.',
      sendsAi: true,
      sendsProjectContext: false,
    };
  }

  return {
    id: 'project',
    label: 'Project context',
    detail: 'سيتم إرسال سياق المشروع لأن الطلب يحتاج كود أو ملف.',
    sendsAi: true,
    sendsProjectContext: true,
  };
}
