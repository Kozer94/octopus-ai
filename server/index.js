require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const pathModule = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json());

// تخزين تاريخ المحادثات لكل جلسة
const sessions = {};

const SYSTEM_PROMPT = `أنت أخطبوط 🐙 — مساعد ذكاء اصطناعي متخصص في بناء وتعديل المشاريع البرمجية الكاملة.

قدراتك:
- تكتب وتعدّل كود احترافي بأي لغة برمجة
- تفهم محتوى الملفات وتعدّل عليها بدقة
- تتذكر كل ما تحدثنا عنه في هذه الجلسة
- عندما يشاركك المستخدم محتوى ملف، تحلله وتعدّل عليه مباشرة
- تجيب دائماً بالعربية ما لم يطلب المستخدم غير ذلك
- عندما تكتب كوداً للحفظ، ضعه دائماً في كتلة \`\`\`

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
    const items = fs.readdirSync(fullPath, { withFileTypes: true });
    const result = items.map(item => ({
      name: item.name,
      type: item.isDirectory() ? 'dir' : 'file',
      path: pathModule.join(fullPath, item.name)
    }));
    res.json({ success: true, items: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🐙 أخطبوط شغّال على http://localhost:${PORT}`);
});
