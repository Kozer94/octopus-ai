require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const pathModule = require('path');
const { exec, spawn } = require('child_process');
const chokidar = require('chokidar');

const app = express();
const PORT = process.env.PORT || 3001;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json());

// تخزين تاريخ المحادثات لكل جلسة
const sessions = {};
let runningProcess = null;
let watcher = null;
let watchClients = [];

const PROVIDERS = [
  // Groq
  async (messages, maxTokens) => {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages, temperature: 0.5, max_tokens: maxTokens,
    });
    return completion.choices[0].message.content;
  },
  // Groq backup model
  async (messages, maxTokens) => {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages, temperature: 0.5, max_tokens: maxTokens,
    });
    return completion.choices[0].message.content;
  },
  // OpenRouter
  async (messages, maxTokens) => {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('no key');
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        messages, max_tokens: maxTokens,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
  },
  // Gemini
  async (messages, maxTokens) => {
    if (!process.env.GEMINI_API_KEY) throw new Error('no key');
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const result = await model.generateContent(prompt);
    return result.response.text();
  },
];

async function callAI(messages, maxTokens = 400) {
  for (const provider of PROVIDERS) {
    try {
      const result = await provider(messages, maxTokens);
      if (result) return result;
    } catch (error) {
      if (error.message === 'no key') continue;
      if (error.status === 429 || (error.message && error.message.includes('Rate limit'))) {
        console.log(`⚠️ provider محدود، جرب التالي...`);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      console.log(`⚠️ خطأ في provider: ${error.message}`);
      continue;
    }
  }
  throw new Error('كل الـ providers محدودة، انتظر قليلاً');
}

function createEightLegPlan(command, terminal = null) {
  return {
    tasks: [
      { leg: 1, name: "رجل الكتابة", task: "كتابة الكود الرئيسي", prompt: `اكتب الجزء الرئيسي المطلوب لهذا الطلب: ${command}` },
      { leg: 2, name: "رجل الفحص", task: "فحص وتحليل المتطلبات", prompt: `حلل المتطلبات والمخاطر لهذا الطلب: ${command}` },
      { leg: 3, name: "رجل التعديل", task: "تعديل الملفات الموجودة", prompt: `حدد وعدل الملفات الموجودة اللازمة لهذا الطلب: ${command}` },
      { leg: 4, name: "رجل الاختبار", task: "التحقق والاختبار", prompt: `اقترح أو اكتب اختبارات وتحقق من صحة هذا الطلب: ${command}` },
      { leg: 5, name: "رجل الإدارة", task: "تنظيم هيكل المشروع", prompt: `نظم هيكل الملفات والمجلدات لهذا الطلب: ${command}` },
      { leg: 6, name: "رجل التوليد", task: "توليد كود إضافي", prompt: `ولد أي كود مساعد أو إضافي مطلوب لهذا الطلب: ${command}` },
      { leg: 7, name: "رجل التحديث", task: "تحديث الإعدادات", prompt: `حدث إعدادات المشروع أو config المطلوبة لهذا الطلب: ${command}` },
      { leg: 8, name: "رجل الدمج", task: "دمج النتائج", prompt: `ادمج وتأكد من تكامل كل أجزاء هذا الطلب: ${command}` },
    ],
    summary: command,
    terminal,
  };
}

const SYSTEM_PROMPT = `أنت أخطبوط 🐙 — مساعد ذكاء اصطناعي متخصص في بناء المشاريع البرمجية.

## قاعدة ذهبية:
- إنشاء مشروع Laravel = <terminal>composer create-project laravel/laravel .</terminal>
- إنشاء مشروع React = <terminal>npx create-react-app .</terminal>
- إنشاء مشروع Next.js = <terminal>npx create-next-app .</terminal>
- لا تكتب محتوى composer.json أو package.json يدوياً أبداً عند إنشاء مشروع جديد

## قواعد صارمة:

### لتشغيل أمر في terminal:
<terminal>npm install</terminal>
<terminal>composer create-project laravel/laravel .</terminal>
<terminal>php artisan migrate</terminal>

### لإنشاء أو تعديل ملف:
<file path="routes/web.php">
<?php
Route::get('/', function () {
    return view('welcome');
});
</file>

### مهم جداً:
- إنشاء مشروع = <terminal>composer create-project...</terminal> وليس <file>
- كل ملف له وسم <file path="..."> خاص به
- لا تضع كل شيء في ملف واحد
- الأوامر في <terminal> فقط
- الكود في <file path="..."> فقط
- تجيب بالعربية دائماً`;

function saveTaggedFiles(response, projectDir = '') {
  const fileMatches = response.matchAll(/<file path="([^"]+)">([\s\S]*?)<\/file>/g);
  const savedFiles = [];
  const rootDir = projectDir ? pathModule.resolve(projectDir) : process.cwd();

  for (const match of fileMatches) {
    const filePath = match[1];
    const fileContent = match[2].trim();
    if (filePath.toLowerCase() === 'terminal') {
      console.warn('تم تجاهل ملف غير صالح باسم terminal');
      continue;
    }

    try {
      const fullPath = pathModule.resolve(rootDir, filePath);
      fs.mkdirSync(pathModule.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, fileContent, 'utf8');
      savedFiles.push({ path: fullPath, name: pathModule.basename(fullPath) });
      console.log(`🐙 حفظ: ${fullPath}`);
    } catch (e) {
      console.error(`خطأ في حفظ ${filePath}:`, e.message);
    }
  }

  return savedFiles;
}

app.get('/', (req, res) => {
  res.json({ message: '🐙 أخطبوط يعمل!' });
});

app.post('/api/octopus', async (req, res) => {
  try {
    const { command, sessionId = 'default', activeFile = '', activeFileContent = '', projectDir = '' } = req.body;

    if (!sessions[sessionId]) {
      sessions[sessionId] = [];
    }

    const fullCommand = activeFileContent
      ? `الملف الحالي المفتوح: ${activeFile}\n\`\`\`\n${activeFileContent.slice(0, 3000)}\n\`\`\`\n\nطلب المستخدم: ${command}`
      : command;

    sessions[sessionId].push({ role: 'user', content: fullCommand });

    if (sessions[sessionId].length > 20) {
      sessions[sessionId] = sessions[sessionId].slice(-20);
    }

    const response = await callAI([
      { role: 'system', content: SYSTEM_PROMPT },
      ...sessions[sessionId]
    ], 2048);

    const savedFiles = saveTaggedFiles(response, projectDir);

    sessions[sessionId].push({ role: 'assistant', content: response });

    res.json({ success: true, result: response, sessionId, savedFiles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/octopus/parallel', async (req, res) => {
  try {
    const { command, sessionId = 'default', activeFile = '', activeFileContent = '', projectDir = '' } = req.body;

    const planPrompt = `أنت دماغ أخطبوط. مهمتك توزيع العمل على الأرجل الثمانية دائماً.

الطلب: ${command}
الملف الحالي: ${activeFile}

قاعدة ذهبية للمشاريع الجديدة:
- إنشاء مشروع Laravel يجب أن يكون terminal فقط: composer create-project laravel/laravel .
- إنشاء مشروع React يجب أن يكون terminal فقط: npx create-react-app .
- إنشاء مشروع Next.js يجب أن يكون terminal فقط: npx create-next-app .
- لا تطلب كتابة composer.json أو package.json يدوياً عند إنشاء مشروع جديد.
- إذا كان الطلب إنشاء مشروع جديد، ضع الأمر المناسب في حقل terminal.

وزّع العمل على الأرجل الثمانية — كل رجل لها دور حتى لو كان صغيراً:
1. رجل الكتابة — يكتب الكود الرئيسي
2. رجل الفحص — يفحص ويحلل المتطلبات
3. رجل التعديل — يعدّل الملفات الموجودة
4. رجل الاختبار — يكتب اختبارات أو يتحقق
5. رجل الإدارة — ينظم هيكل المشروع
6. رجل التوليد — يولّد كود إضافي
7. رجل التحديث — يحدّث الإعدادات والـ config
8. رجل الدمج — يدمج ويتأكد من التكامل

أجب بـ JSON فقط:
{
  "tasks": [
    {"leg": 1, "name": "رجل الكتابة", "task": "وصف مهمته", "prompt": "تفاصيل ما يجب يكتبه"},
    {"leg": 2, "name": "رجل الفحص", "task": "وصف مهمته", "prompt": "تفاصيل ما يجب يفحصه"},
    {"leg": 3, "name": "رجل التعديل", "task": "وصف مهمته", "prompt": "تفاصيل ما يجب يعدله"},
    {"leg": 4, "name": "رجل الاختبار", "task": "وصف مهمته", "prompt": "تفاصيل ما يجب يختبره"},
    {"leg": 5, "name": "رجل الإدارة", "task": "وصف مهمته", "prompt": "تفاصيل ما يجب ينظمه"},
    {"leg": 6, "name": "رجل التوليد", "task": "وصف مهمته", "prompt": "تفاصيل ما يجب يولده"},
    {"leg": 7, "name": "رجل التحديث", "task": "وصف مهمته", "prompt": "تفاصيل ما يجب يحدثه"},
    {"leg": 8, "name": "رجل الدمج", "task": "وصف مهمته", "prompt": "تفاصيل ما يجب يدمجه"}
  ],
  "summary": "ملخص ما سيتم بناؤه",
  "terminal": "الأمر إذا كان مطلوباً وإلا null"
}`;

    let plan;
    try {
      const planText = await callAI([{ role: 'user', content: planPrompt }], 1000);
      const jsonMatch = planText.match(/\{[\s\S]*\}/);
      plan = JSON.parse(jsonMatch[0]);
    } catch {
      plan = createEightLegPlan(command);
    }

    // إجبار 8 أرجل دائماً
    const allLegs = [
      { leg: 1, name: "رجل الكتابة" },
      { leg: 2, name: "رجل الفحص" },
      { leg: 3, name: "رجل التعديل" },
      { leg: 4, name: "رجل الاختبار" },
      { leg: 5, name: "رجل الإدارة" },
      { leg: 6, name: "رجل التوليد" },
      { leg: 7, name: "رجل التحديث" },
      { leg: 8, name: "رجل الدمج" },
    ];

    if (!Array.isArray(plan.tasks)) {
      plan.tasks = [];
    }

    allLegs.forEach(leg => {
      if (!plan.tasks.find(task => Number(task.leg) === leg.leg)) {
        plan.tasks.push({
          leg: leg.leg,
          name: leg.name,
          task: `مساعدة في: ${command}`,
          prompt: `ساعد في تنفيذ هذا الطلب من منظور ${leg.name}: ${command}`
        });
      }
    });

    plan.tasks = plan.tasks
      .filter(task => Number(task.leg) >= 1 && Number(task.leg) <= 8)
      .sort((a, b) => Number(a.leg) - Number(b.leg))
      .slice(0, 8);

    if (String(plan.terminal || '').toLowerCase() === 'null') {
      plan.terminal = null;
    }

    // تقسيم المهام لمجموعتين من 4 تعملان بالتوازي
    const chunk1 = plan.tasks.slice(0, 4);
    const chunk2 = plan.tasks.slice(4, 8);

    const runChunk = async (chunk) => Promise.all(chunk.map(async (task) => {
      try {
        const result = await callAI([
          {
            role: 'system',
            content: `أنت ${task.name} في نظام أخطبوط. مهمتك: ${task.task}. اكتب الكود في كتلة \`\`\`.`
          },
          {
            role: 'user',
            content: activeFileContent
              ? `الملف الحالي (${activeFile}):\n\`\`\`\n${activeFileContent.slice(0, 1000)}\n\`\`\`\n\n${task.prompt}`
              : task.prompt
          }
        ], 400);
        return { leg: task.leg, name: task.name, task: task.task, result };
      } catch (e) {
        return { leg: task.leg, name: task.name, task: task.task, result: `// ${task.name} غير متاح حالياً` };
      }
    }));

    const [results1, results2] = await Promise.all([runChunk(chunk1), runChunk(chunk2)]);
    const results = [...results1, ...results2];

    // المرحلة الثالثة: رجل الدمج يجمع النتائج
    const mergePrompt = `أنت رجل الدمج في أخطبوط. اجمع نتائج الأرجل في إجابة واحدة متكاملة.

الطلب الأصلي: ${command}

نتائج الأرجل:
${results.map(r => `### ${r.name}:\n${r.result}`).join('\n\n')}

اكتب النتيجة النهائية بوسوم ملفات منفصلة فقط بهذا الشكل:
<file path="المسار/النسبي/للملف">
الكود هنا
</file>

لا تستخدم كتلة \`\`\` للكود النهائي إذا كان هناك ملفات.

إذا كان هناك أمر terminal، اتركه كوسم <terminal>الأمر</terminal> ولا تحوله إلى <file path="terminal">.`;

    const finalResult = await callAI([{ role: 'user', content: mergePrompt }], 2000);
    const savedFiles = saveTaggedFiles(finalResult, projectDir);

    const terminalMatch = finalResult.match(/<terminal>(.*?)<\/terminal>/s);
    const terminalCommand = terminalMatch ? terminalMatch[1].trim() : (plan.terminal || null);

    res.json({
      success: true,
      result: finalResult,
      plan: plan,
      legResults: results,
      terminalCommand,
      sessionId,
      savedFiles,
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// مسح جلسة معينة
app.post('/api/reset', (req, res) => {
  const { sessionId = 'default' } = req.body;
  sessions[sessionId] = [];
  res.json({ success: true, message: 'تم مسح المحادثة' });
});

// كتابة ملف
app.post('/api/files/write', async (req, res) => {
  try {
    const { filePath, content } = req.body;
    const fullPath = pathModule.resolve(filePath);
    fs.mkdirSync(pathModule.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    res.json({ success: true, path: fullPath });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// قراءة ملف
app.post('/api/files/read', async (req, res) => {
  try {
    const { filePath } = req.body;
    const fullPath = pathModule.resolve(filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    res.json({ success: true, content });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// قراءة مجلد
app.post('/api/files/list', async (req, res) => {
  try {
    const { dirPath } = req.body;
    const fullPath = pathModule.resolve(dirPath);

    function readDir(dir, base = '') {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      let dirs = [];
      let files = [];

      for (const item of items) {
        if (['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', 'vendor'].includes(item.name)) continue;
        if (item.name === '.env' || item.name.endsWith('.env')) continue;
        const fullItemPath = pathModule.join(dir, item.name);
        if (item.isDirectory()) {
          dirs.push({ name: item.name, type: 'dir', path: fullItemPath, children: readDir(fullItemPath) });
        } else {
          files.push({ name: item.name, type: 'file', path: fullItemPath });
        }
      }

      dirs.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));

      return [...dirs, ...files];
    }

    const items = readDir(fullPath);
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/terminal', async (req, res) => {
  try {
    const { command, cwd } = req.body;
    const blocked = ['rm -rf', 'del /f /s', 'format', 'shutdown', 'reboot'];
    if (blocked.some(b => command.toLowerCase().includes(b))) {
      return res.json({ success: false, error: 'هذا الأمر ممنوع' });
    }

    exec(command, {
      cwd: cwd || process.cwd(),
      timeout: 600000,
      maxBuffer: 1024 * 1024 * 10,
      shell: 'cmd.exe'
    }, (error, stdout, stderr) => {
      if (!res.headersSent) {
        res.json({
          success: !error || !!stdout,
          output: stdout || stderr || error?.message || '',
        });
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/terminal/stream', async (req, res) => {
  try {
    const { command, cwd } = req.body;
    const blocked = ['rm -rf', 'del /f /s', 'format', 'shutdown', 'reboot'];
    if (blocked.some(b => command.toLowerCase().includes(b))) {
      return res.json({ success: false, error: 'هذا الأمر ممنوع' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    req.setTimeout(0);
    res.setTimeout(0);

    const proc = spawn('cmd.exe', ['/c', command], {
      cwd: cwd || process.cwd(),
      env: { ...process.env }
    });

    proc.stdout.on('data', d => {
      try { res.write(`data: ${JSON.stringify({ output: d.toString() })}\n\n`); } catch { }
    });

    proc.stderr.on('data', d => {
      try { res.write(`data: ${JSON.stringify({ output: d.toString() })}\n\n`); } catch { }
    });

    proc.on('close', (code) => {
      try {
        res.write(`data: ${JSON.stringify({ done: true, code: code || 0 })}\n\n`);
        res.end();
      } catch { }
    });

    proc.on('error', (err) => {
      try {
        res.write(`data: ${JSON.stringify({ output: err.message, done: true, code: 1 })}\n\n`);
        res.end();
      } catch { }
    });

    req.on('close', () => proc.kill());
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// تشغيل عملية طويلة
app.post('/api/run', async (req, res) => {
  try {
    const { command, cwd } = req.body;

    if (runningProcess) {
      runningProcess.kill('SIGTERM');
      runningProcess = null;
    }

    const parts = command.split(' ');
    runningProcess = spawn(parts[0], parts.slice(1), {
      cwd: cwd || process.cwd(),
      shell: true,
      env: { ...process.env }
    });

    let output = '';
    runningProcess.stdout.on('data', d => { output += d.toString(); });
    runningProcess.stderr.on('data', d => { output += d.toString(); });
    runningProcess.on('exit', () => { runningProcess = null; });

    setTimeout(() => {
      res.json({ success: true, output: output || '✅ العملية شغّالة في الخلفية', pid: runningProcess?.pid });
    }, 5000);

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// إيقاف العملية
app.post('/api/stop', async (req, res) => {
  try {
    if (runningProcess) {
      runningProcess.kill('SIGTERM');
      runningProcess = null;
      res.json({ success: true, output: '⏹ تم الإيقاف' });
    } else {
      res.json({ success: true, output: 'لا توجد عملية شغّالة' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// SSE لمراقبة الملفات
app.get('/api/watch', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write('data: {"connected": true}\n\n');

  watchClients.push(res);
  req.on('close', () => {
    watchClients = watchClients.filter(client => client !== res);
  });
});

app.post('/api/watch/start', (req, res) => {
  const { dirPath } = req.body;
  if (watcher) watcher.close();

  watcher = chokidar.watch(dirPath, {
    ignored: /(node_modules|\.git|vendor|\.next|dist)/,
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on('add', filePath => {
    const event = JSON.stringify({ type: 'add', path: filePath, name: pathModule.basename(filePath) });
    watchClients.forEach(client => {
      try { client.write(`data: ${event}\n\n`); } catch { }
    });
  });

  watcher.on('change', filePath => {
    const event = JSON.stringify({ type: 'change', path: filePath, name: pathModule.basename(filePath) });
    watchClients.forEach(client => {
      try { client.write(`data: ${event}\n\n`); } catch { }
    });
  });

  res.json({ success: true });
});

app.post('/api/watch/stop', (req, res) => {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  res.json({ success: true });
});

app.post('/api/search', async (req, res) => {
  try {
    const { query, dirPath } = req.body;
    if (!query || !dirPath) return res.json({ success: true, results: [] });

    const results = [];

    function searchDir(dir) {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (['node_modules', '.git', '.next', 'dist', 'vendor'].includes(item.name)) continue;
        const fullPath = pathModule.join(dir, item.name);
        if (item.isDirectory()) {
          searchDir(fullPath);
        } else {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            lines.forEach((line, i) => {
              if (line.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                  file: item.name,
                  path: fullPath,
                  line: i + 1,
                  text: line.trim(),
                });
              }
            });
          } catch { }
        }
      }
    }

    searchDir(pathModule.resolve(dirPath));
    res.json({ success: true, results: results.slice(0, 100) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Git status
app.post('/api/git/status', async (req, res) => {
  try {
    const { cwd } = req.body;
    exec('git status --porcelain', { cwd }, (error, stdout) => {
      if (error) return res.json({ success: false, error: 'ليس مشروع Git' });
      const files = stdout.trim().split('\n').filter(Boolean).map(line => ({
        status: line.slice(0, 2).trim(),
        file: line.slice(2).trim(),
      }));
      res.json({ success: true, files });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Git commit
app.post('/api/git/commit', async (req, res) => {
  try {
    const { cwd, message } = req.body;
    const safeMessage = String(message || '').replace(/"/g, '\\"');
    exec(`git add . && git commit -m "${safeMessage}"`, { cwd }, (error, stdout, stderr) => {
      res.json({ success: !error, output: stdout || stderr || error?.message });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Git diff
app.post('/api/git/diff', async (req, res) => {
  try {
    const { cwd, file } = req.body;
    exec(`git diff ${file}`, { cwd }, (error, stdout) => {
      res.json({ success: true, diff: stdout });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`🐙 أخطبوط شغّال على http://localhost:${PORT}`);
});
