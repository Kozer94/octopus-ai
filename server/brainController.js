/**
 * 🧠 Brain Controller v3
 *
 * طبقة التفكير الوحيدة في النظام:
 *  - المهندس 1 (تقني)  → يجلب أفكاراً مبنية على الملفات الحقيقية
 *  - المهندس 2 (إبداعي) → يجلب بدائل وأنماط تصميم
 *  - العقل المدبر        → يقرر ويبني dependency graph + خارطة عمل
 *  - الأرجل 1-8         → تنفّذ فقط (بدون تفكير مستقل)
 */

const fs = require('fs');
const path = require('path');
const { getProjectSnapshot, getTaskContext } = require('./truthLayer');
const { extractAndWrite, extractTerminalCommands } = require('./validatorLayer');

// ─── أوضاع التشغيل ───────────────────────────────────────────
const MODES = {
  REPORT:   'report',
  CODE:     'code',
  DEBUG:    'debug',
  REFACTOR: 'refactor',
  EXPLAIN:  'explain',
};

function detectMode(command) {
  if (/فحص|تقرير|حلل|تحليل|analyze|inspect|report|audit|ملخص/i.test(command)) return MODES.REPORT;
  if (/خطأ|error|bug|إصلاح|fix|مشكلة|لا يعمل|crash/i.test(command))           return MODES.DEBUG;
  if (/أعد هيكلة|refactor|نظف|clean|restructure/i.test(command))               return MODES.REFACTOR;
  if (/اشرح|explain|وثّق|document|كيف يعمل/i.test(command))                    return MODES.EXPLAIN;
  return MODES.CODE;
}

// ─── Dependency Graph حقيقي بين الأرجل ──────────────────────
// كل رجل يحدد أي الأرجل يجب أن تنتهي قبله
const LEG_DEPS = {
  1: [],        // Writer    → يبدأ فوراً
  2: [1, 3, 6], // Review    → ينتظر Writer + Edit + Generate
  3: [],        // Edit      → يبدأ فوراً
  4: [2],       // Test      → ينتظر Review
  5: [],        // Manager   → يبدأ فوراً (يقسّم المهام)
  6: [],        // Generate  → يبدأ فوراً
  7: [1, 3],    // Update    → ينتظر Writer + Edit
  8: [2, 4, 7], // Merge     → ينتظر Review + Test + Update
};

// ─── تعريف الأرجل الثمانية ───────────────────────────────────
const LEG_DEFINITIONS = {
  1: { name: 'رجل الكتابة',   emoji: '✍️',  role: 'Writer',   focus: 'يكتب الكود الجديد من الصفر' },
  2: { name: 'رجل الفحص',    emoji: '🔍',  role: 'Review',   focus: 'يفحص الكود ويكتشف الأخطاء' },
  3: { name: 'رجل التعديل',   emoji: '✏️',  role: 'Edit',     focus: 'يعدّل ملفات موجودة' },
  4: { name: 'رجل الاختبار',  emoji: '🧪',  role: 'Test',     focus: 'يكتب اختبارات ويتحقق من المنطق' },
  5: { name: 'رجل الإدارة',   emoji: '⚡',  role: 'Manager',  focus: 'ينسّق بين الأرجل ويحدد الأولويات' },
  6: { name: 'رجل التوليد',   emoji: '⚙️',  role: 'Generate', focus: 'يولّد ملفات تلقائية (routes, models)' },
  7: { name: 'رجل التحديث',   emoji: '🔄',  role: 'Update',   focus: 'يحدّث config وdependencies' },
  8: { name: 'رجل الدمج',     emoji: '🔀',  role: 'Merge',    focus: 'يدمج نتائج الأرجل في output نهائي' },
};

// ─── System Prompts ───────────────────────────────────────────
function buildEngineer1Prompt() {
  return `أنت المهندس التقني الأول في نظام أخطبوط.
مهمتك: تحليل المشروع وجلب أفكار تقنية واقعية.

قواعد صارمة:
- اقرأ الملفات الموجودة فعلاً فقط
- لا تخمّن ملفات غير موجودة
- لا تكتب كوداً — أفكار نصية فقط
- اذكر اسم الملف المرتبط مع كل فكرة

الناتج المطلوب (نص عربي فقط):
### تحليل تقني
- فكرة 1: [الملف: xxx] — [ماذا تقترح بالضبط]
- فكرة 2: [الملف: xxx] — [ماذا تقترح بالضبط]
- فكرة 3: [الملف: xxx] — [ماذا تقترح بالضبط]

### ملفات يجب تعديلها
- [اسم الملف] — [السبب]

### تحذيرات تقنية
- [أي مخاطر أو تعارضات]`;
}

function buildEngineer2Prompt() {
  return `أنت المهندس الإبداعي الثاني في نظام أخطبوط.
مهمتك: اقتراح أنماط تصميم وبدائل غير واضحة.

قواعد صارمة:
- لا تكرر ما يقوله المهندس الأول
- فكّر في الأنماط والبنية العامة
- لا تكتب كوداً — أفكار نصية فقط
- كن محدداً في كل اقتراح

الناتج المطلوب (نص عربي فقط):
### أنماط مقترحة
- نمط 1: [الاسم] — [أين يُطبَّق ولماذا أفضل]

### بدائل للتنفيذ الحالي
- بديل 1: [لماذا أفضل من الحالي]

### تحسينات غير واضحة
- تحسين 1: [الفائدة المتوقعة]`;
}

function buildBrainPrompt(command, eng1Result, eng2Result, snapshot) {
  const mode = detectMode(command);
  const isReport = mode === MODES.REPORT;

  const reportInstructions = isReport ? `
⚠️ هذا طلب تقرير/تحليل — ليس بناء كود.
قواعد خاصة بالتقرير:
- رجل 1 فقط يكتب report.md شامل (تحليل المشروع، الهيكل، الملفات، التقنيات، التوصيات)
- رجل 2 يراجع التقرير ويضيف ملاحظات
- رجل 8 يدمج ويكمل التقرير النهائي
- باقي الأرجل (3,4,5,6,7) = "غير مطلوب"
- لا تكتب كوداً PHP أو JavaScript أو أي لغة برمجة
- الملف الوحيد المسموح: report.md
` : '';

  return `أنت العقل المدبر في نظام أخطبوط.
لديك أفكار المهندسَين — قرارك نهائي.
${reportInstructions}
المشروع: ${snapshot.summary.split('\n').slice(0, 5).join('\n')}
Frameworks: ${snapshot.frameworks.join(', ') || 'Unknown'}

--- أفكار المهندس التقني ---
${eng1Result}

--- أفكار المهندس الإبداعي ---
${eng2Result}

--- طلب المستخدم ---
${command}

مهمتك: ابنِ خارطة عمل واضحة للأرجل 1-8.

قواعد:
- قرر أي الأفكار تُنفَّذ وأيها تُرفض
- حدد لكل رجل: ماذا يفعل بالضبط + اسم الملف
- الأرجل غير المطلوبة اكتب لها: "غير مطلوب"
- لا تكتب كوداً هنا

الناتج يجب أن يكون JSON فقط بهذا الشكل:
\`\`\`json
{
  "decision": "ما قررت تنفيذه في جملة واحدة",
  "rejected": "ما رفضته ولماذا",
  "mode": "${detectMode(command)}",
  "tasks": [
    { "leg": 1, "active": true,  "task": "اكتب [ملف] لـ [غرض محدد]", "file": "path/to/file.js", "prompt": "تعليمات تفصيلية للرجل 1" },
    { "leg": 2, "active": true,  "task": "افحص مخرجات رجل 1 و3 و6",  "file": "review",          "prompt": "تعليمات تفصيلية للرجل 2" },
    { "leg": 3, "active": false, "task": "غير مطلوب", "file": "", "prompt": "" },
    { "leg": 4, "active": true,  "task": "اكتب اختبار لـ [ملف]",      "file": "tests/file.test.js", "prompt": "تعليمات تفصيلية للرجل 4" },
    { "leg": 5, "active": false, "task": "غير مطلوب", "file": "", "prompt": "" },
    { "leg": 6, "active": false, "task": "غير مطلوب", "file": "", "prompt": "" },
    { "leg": 7, "active": false, "task": "غير مطلوب", "file": "", "prompt": "" },
    { "leg": 8, "active": true,  "task": "ادمج مخرجات الأرجل النشطة", "file": "final", "prompt": "تعليمات الدمج" }
  ]
}
\`\`\``;
}

function buildLegExecutionPrompt(task, legDef, mode, sharedContext) {
  const isReport = mode === MODES.REPORT;

  if (isReport) {
    return {
      system: `أنت ${legDef.name} في نظام أخطبوط. دورك: ${legDef.focus}
قواعد لا تُكسر:
- اكتب بالعربية فقط
- ممنوع أي كود Python أو bash أو JavaScript
- ممنوع وسوم <file> أو <terminal>
- اكتب تحليلاً نصياً فقط في قسمك المحدد`,
      user: `${sharedContext}\n\n---\nمهمتك: ${task.task}\n${task.prompt}`,
    };
  }

  return {
    system: `أنت ${legDef.name} في نظام أخطبوط. دورك: ${legDef.focus}
قواعد:
- نفّذ مهمتك المحددة فقط: ${task.task}
- استخدم <file path="المسار"> لكل ملف تكتبه
- استخدم <terminal> للأوامر فقط إذا ضروري
- لا تعيد تحليل المشروع — البيانات موجودة أمامك`,
    user: `${sharedContext}\n\n---\nمهمتك المحددة: ${task.task}\nالملف المستهدف: ${task.file || 'حسب الحاجة'}\n\n${task.prompt}`,
  };
}

// ─── تحليل نتائج الأرجل لرجل المراجعة ───────────────────────
function buildReviewContext(legResults) {
  return legResults
    .filter(r => r.legId !== 2 && r.result)
    .map(r => `### نتيجة رجل ${r.legId} (${LEG_DEFINITIONS[r.legId]?.name}):\n${r.result}`)
    .join('\n\n---\n\n');
}

// ─── تحليل نتائج الأرجل لرجل الدمج ──────────────────────────
function buildMergeContext(legResults, command, mode) {
  const sections = legResults.filter(r => r.result).map(r => r.result).join('\n\n---\n\n');

  if (mode === MODES.REPORT) {
    return `اجمع الأقسام التالية في تقرير report.md واحد منظم.

${sections}

⚠️ يجب أن يكون ردك بهذا الشكل الحرفي فقط (لا تغيّر):

<file path="report.md">
# تقرير شامل للمشروع

[محتوى التقرير هنا]
</file>

القواعد:
- ابدأ مباشرة بـ <file path="report.md"> ولا تكتب أي نص قبله
- أنهِ بـ </file> ولا تكتب أي نص بعده
- رتّب الأقسام منطقياً واحذف التكرار
- ممنوع أي كود برمجي`;
  }

  return `اجمع نتائج الأرجل في ملفات نهائية.

الطلب: ${command}

${legResults.filter(r => r.result).map(r =>
  `### ${LEG_DEFINITIONS[r.legId]?.name} (رجل ${r.legId}):\n${r.result}`
).join('\n\n')}

القواعد:
- كل ملف في <file path="المسار الصحيح">
- لا تعدّل الملفات المحمية (App.jsx, main.js, package.json...)
- استخدم <terminal> فقط إذا مطلوب تثبيت packages
- اجمع فقط — لا تعيد التفكير`;
}

// ─── الدالة الرئيسية ──────────────────────────────────────────
async function runBrainController({
  command,
  projectDir,
  activeFile = '',
  activeFileContent = '',
  callAI,
  onUpdate,        // callback(legId, status, data)
}) {
  const timeline = [];
  const tick = (legId, status, data = {}) => {
    const entry = { legId, status, time: Date.now(), ...data };
    timeline.push(entry);
    onUpdate?.(entry);
  };

  tick(0, 'brain_start', { command });

  // ① Truth Layer — snapshot مرة واحدة
  const snapshot    = getProjectSnapshot(projectDir);
  const mode        = detectMode(command);
  const baseContext = getTaskContext(projectDir, command, activeFile, activeFileContent);

  tick(0, 'snapshot_ready', { frameworks: snapshot.frameworks, mode });

  // ② المهندس 1 و2 بالتوازي
  tick(1, 'thinking');
  tick(2, 'thinking');

  const [eng1Result, eng2Result] = await Promise.all([
    callAI([
      { role: 'system', content: buildEngineer1Prompt() },
      { role: 'user',   content: `${snapshot.summary}\n\n${baseContext}\n\nطلب المستخدم: ${command}` },
    ]).then(r => { tick(1, 'ideas_ready'); return r; }),

    callAI([
      { role: 'system', content: buildEngineer2Prompt() },
      { role: 'user',   content: `${snapshot.summary}\n\nطلب المستخدم: ${command}` },
    ]).then(r => { tick(2, 'ideas_ready'); return r; }),
  ]);

  // ③ العقل المدبر يقرر
  tick(0, 'brain_deciding');
  const brainRaw = await callAI([{
    role: 'user',
    content: buildBrainPrompt(command, eng1Result, eng2Result, snapshot),
  }]);

  let plan;
  try {
    const jsonBlock = brainRaw.match(/```json\s*([\s\S]*?)\s*```/);
    plan = JSON.parse(jsonBlock?.[1] || brainRaw);
  } catch {
    plan = { mode, decision: command, rejected: '', tasks: buildDefaultTasks(command) };
  }

  tick(0, 'plan_ready', { plan });

  // ④ تنفيذ الأرجل مع dependency graph حقيقي
  const activeTasks = plan.tasks.filter(t => t.active !== false);
  const legResults  = [];
  const legStatus   = {};   // legId → 'pending' | 'running' | 'done' | 'error'
  activeTasks.forEach(t => { legStatus[t.leg] = 'pending'; });

  // انتظار حتى تنتهي الأرجل المطلوبة
  function waitFor(deps) {
    return new Promise(resolve => {
      function check() {
        if (deps.every(d => legStatus[d] === 'done' || legStatus[d] === 'error' || !legStatus[d])) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      }
      check();
    });
  }

  // تشغيل رجل واحد
  async function runLeg(task) {
    const legDef = LEG_DEFINITIONS[task.leg];
    const deps   = LEG_DEPS[task.leg] || [];

    // انتظر الأرجل التي يعتمد عليها
    const activeDeps = deps.filter(d => legStatus[d] !== undefined);
    if (activeDeps.length > 0) {
      tick(task.leg, 'waiting', { waitingFor: activeDeps });
      await waitFor(activeDeps);
    }

    legStatus[task.leg] = 'running';
    tick(task.leg, 'working', { task: task.task, file: task.file });

    try {
      // رجل الفحص يحتاج نتائج الأرجل الأخرى
      let contextForLeg = baseContext;
      if (task.leg === 2) {
        const reviewCtx = buildReviewContext(legResults);
        contextForLeg = reviewCtx || baseContext;
      }

      // رجل الدمج
      if (task.leg === 8) {
        const mergeCtx = buildMergeContext(legResults, command, mode);
        const result   = await callAI([{ role: 'user', content: mergeCtx }]);
        legStatus[task.leg] = 'done';
        tick(task.leg, 'done', { result: result.slice(0, 200) });
        legResults.push({ legId: task.leg, result });
        return result;
      }

      // ── Black Box: إذا الرجل عنده ملف محدد، اقرأ محتواه الحالي ──
      if (task.file && task.file !== 'review' && task.file !== 'final' && projectDir) {
        try {
          const fullPath = path.resolve(projectDir, task.file);
          const rootDir  = path.resolve(projectDir);
          const rel      = path.relative(rootDir, fullPath);
          const isSafe   = rel && !rel.startsWith('..') && !path.isAbsolute(rel);
          if (isSafe && fs.existsSync(fullPath)) {
            const existing = fs.readFileSync(fullPath, 'utf8');
            if (existing && existing.length < 80000) {
              contextForLeg = `### ${task.file} (المحتوى الحالي)\n\`\`\`\n${existing}\n\`\`\`\n\n${contextForLeg}`;
            }
          }
        } catch { /* تجاهل أخطاء القراءة */ }
      }

      const { system, user } = buildLegExecutionPrompt(task, legDef, mode, contextForLeg);
      const result = await callAI([
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ]);

      legStatus[task.leg] = 'done';
      tick(task.leg, 'done', { result: result.slice(0, 200) });
      legResults.push({ legId: task.leg, result });
      return result;
    } catch (e) {
      legStatus[task.leg] = 'error';
      tick(task.leg, 'error', { error: e.message });
      legResults.push({ legId: task.leg, result: '', error: e.message });
      return '';
    }
  }

  // تشغيل كل الأرجل النشطة (كل رجل ينتظر deps خاصته)
  await Promise.all(activeTasks.map(runLeg));

  // ⑤ استخراج الملف النهائي من رجل الدمج
  const mergeResult = legResults.find(r => r.legId === 8)?.result || '';
  let { written, rejected } = extractAndWrite(mergeResult, projectDir);
  const terminalCommands = extractTerminalCommands(mergeResult);

  // ⑥ Fallback للـ REPORT: إذا AI لم يلتزم بـ <file> tags، اكتب التقرير مباشرة
  if (mode === MODES.REPORT && written.length === 0 && mergeResult.trim()) {
    const { safeWrite } = require('./validatorLayer');
    const cleanContent = mergeResult
      .replace(/<file[^>]*>/g, '').replace(/<\/file>/g, '').trim();
    if (cleanContent) {
      const writeResult = safeWrite(projectDir, 'report.md', cleanContent);
      if (writeResult.success) {
        written = [{ path: 'report.md', size: cleanContent.length }];
      }
    }
  }

  tick(0, 'complete', { written: written.length, rejected: rejected.length });

  return {
    mode,
    plan,
    eng1Result,
    eng2Result,
    legResults,
    finalResult: mergeResult,
    savedFiles: written,
    rejectedFiles: rejected,
    terminalCommands,
    timeline,
  };
}

// ─── preview بدون تنفيذ ───────────────────────────────────────
async function previewBrainController({ command, projectDir, callAI }) {
  const snapshot = getProjectSnapshot(projectDir);
  const mode     = detectMode(command);

  const [eng1, eng2] = await Promise.all([
    callAI([
      { role: 'system', content: buildEngineer1Prompt() },
      { role: 'user',   content: `${snapshot.summary}\nطلب المستخدم: ${command}` },
    ]),
    callAI([
      { role: 'system', content: buildEngineer2Prompt() },
      { role: 'user',   content: `${snapshot.summary}\nطلب المستخدم: ${command}` },
    ]),
  ]);

  const brainRaw = await callAI([{
    role: 'user',
    content: buildBrainPrompt(command, eng1, eng2, snapshot),
  }]);

  let plan;
  try {
    const jsonBlock = brainRaw.match(/```json\s*([\s\S]*?)\s*```/);
    plan = JSON.parse(jsonBlock?.[1] || brainRaw);
  } catch {
    plan = { mode, decision: command, rejected: '', tasks: buildDefaultTasks(command) };
  }

  return { mode, plan, eng1Result: eng1, eng2Result: eng2, snapshot };
}

// ─── خطة افتراضية إذا فشل JSON ───────────────────────────────
function buildDefaultTasks(command) {
  return Object.entries(LEG_DEFINITIONS).map(([leg, def]) => ({
    leg: Number(leg),
    active: [1, 2, 8].includes(Number(leg)),
    task: Number(leg) === 8 ? 'ادمج النتائج' : `${def.focus}: ${command}`,
    file: '',
    prompt: `نفّذ دورك كـ ${def.name} لهذا الطلب: ${command}`,
  }));
}

module.exports = {
  runBrainController,
  previewBrainController,
  detectMode,
  LEG_DEFINITIONS,
  LEG_DEPS,
  MODES,
};