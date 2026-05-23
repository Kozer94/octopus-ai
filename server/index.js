require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const pathModule = require('path');
const { exec, spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json());

// تخزين تاريخ المحادثات لكل جلسة
const sessions = {};
let runningProcess = null;

const SYSTEM_PROMPT = `أنت أخطبوط 🐙 — مساعد ذكاء اصطناعي متخصص في بناء وتعديل المشاريع البرمجية الكاملة.

قدراتك:
- تكتب وتعدّل كود احترافي بأي لغة برمجة
- تفهم محتوى الملفات وتعدّل عليها بدقة
- تتذكر كل ما تحدثنا عنه في هذه الجلسة
- عندما يشاركك المستخدم محتوى ملف، تحلله وتعدّل عليه مباشرة
- تجيب دائماً بالعربية ما لم يطلب المستخدم غير ذلك
- عندما تكتب كوداً للحفظ، ضعه دائماً في كتلة \`\`\`

عندما يطلب المستخدم تشغيل أمر أو تنفيذ شيء في Terminal، أجب بهذا الشكل بالضبط:
<terminal>الأمر هنا</terminal>

مثال: إذا قال "شغّل المشروع" أجب:
<terminal>npm run dev</terminal>

أسلوبك: دقيق، مباشر، عملي. لا حشو ولا كلام فارغ.`;

app.get('/', (req, res) => {
  res.json({ message: '🐙 أخطبوط يعمل!' });
});

app.post('/api/octopus', async (req, res) => {
  try {
    const { command, sessionId = 'default', activeFile = '', activeFileContent = '' } = req.body;

    // إنشاء جلسة جديدة إن لم تكن موجودة
    if (!sessions[sessionId]) {
      sessions[sessionId] = [];
    }

    // إضافة رسالة المستخدم للتاريخ
    const fullCommand = activeFileContent
      ? `الملف الحالي المفتوح: ${activeFile}\n\`\`\`\n${activeFileContent.slice(0, 3000)}\n\`\`\`\n\nطلب المستخدم: ${command}`
      : command;
    sessions[sessionId].push({ role: 'user', content: fullCommand });

    // الاحتفاظ بآخر 20 رسالة فقط لتجنب تجاوز الحد
    if (sessions[sessionId].length > 20) {
      sessions[sessionId] = sessions[sessionId].slice(-20);
    }

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...sessions[sessionId]
      ],
      temperature: 0.7,
      max_tokens: 2048,
    });

    const response = completion.choices[0].message.content;

    // استخراج الكود تلقائياً وحفظه
    const codeMatch = response.match(/```(?:\w+)?\n([\s\S]*?)```/);
    const fileMatch = response.match(/([a-zA-Z0-9_\-]+\.[a-zA-Z]+)/);
    if (codeMatch && fileMatch) {
      const fileName = fileMatch[1];
      const code = codeMatch[1];
      const savePath = path.join('C:\\Users\\kozer\\Desktop\\octopus-ai', fileName);
      try {
        fs.mkdirSync(path.dirname(savePath), { recursive: true });
        fs.writeFileSync(savePath, code, 'utf8');
        console.log(`🐙 حفظ الملف: ${savePath}`);
      } catch(e) {
        console.error('خطأ في حفظ الملف:', e.message);
      }
    }

    // إضافة رد أخطبوط للتاريخ
    sessions[sessionId].push({ role: 'assistant', content: response });

    res.json({ success: true, result: response, sessionId });
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
        // تجاهل المجلدات الثقيلة
        if (['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', 'vendor'].includes(item.name)) continue;
        if (item.name === '.env' || item.name.endsWith('.env')) continue;
        const fullItemPath = pathModule.join(dir, item.name);
        if (item.isDirectory()) {
          dirs.push({ name: item.name, type: 'dir', path: fullItemPath, children: readDir(fullItemPath) });
        } else {
          files.push({ name: item.name, type: 'file', path: fullItemPath });
        }
      }

      // مجلدات أولاً ثم ملفات، كل مجموعة مرتبة أبجدياً
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
    exec(command, { cwd: cwd || process.cwd(), timeout: 30000 }, (error, stdout, stderr) => {
      res.json({
        success: !error,
        output: stdout || stderr || error?.message || '',
        error: error ? error.message : null
      });
    });
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

    // أرجع response بعد ثانيتين
    setTimeout(() => {
      res.json({ success: true, output: output || '✅ العملية شغّالة في الخلفية', pid: runningProcess?.pid });
    }, 2000);

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
