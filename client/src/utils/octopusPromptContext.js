const REPORT_REQUEST_PATTERN = /فحص|تقرير|تقريري|حلل|تحليل|وثق|توثيق|ملخص|ملخّص|report|analyze|analysis|documentation|markdown|\bmd\b/i;
const EXECUTION_REQUEST_PATTERN = /أنشئ|انشئ|ابني|اصنع|نفذ|طبق|اكتب|أضف|اضف|عدل|عدّل|اصلح|أصلح|ركب|ثبّت|ثبت|اختبر|شغل|شغّل|احذف|انقل|ارفع|build|create|implement|add|fix|refactor|test|run|install|delete|move|push/i;
const QUESTION_PATTERN = /^(هل|ما|ماذا|من|متى|أين|اين|ليش|لماذا|كيف|شنو|اشرح لي|اريد اعرف|أريد أعرف|who|what|when|where|why|how)\b/i;
const CONTEXT_REQUEST_PATTERN = /الكود|كود|الملف|ملف|المشروع|مشروع|current file|this file|code|repo|repository|project|bug|error|خطأ/i;
const OCTOPUS_IDENTITY_PATTERN = /من.*(مطورك|صنعك|سواك|مبرمجك)|مطورك|صاحب فكرة|فكرة اخطبوط|عن نفسك|من انت|من أنت|ما هو اخطبوط|ماهو اخطبوط|who (built|made|developed) you|who are you|about yourself/i;

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

export function getLocalEconomyReply(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized || !OCTOPUS_IDENTITY_PATTERN.test(normalized)) return '';

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
