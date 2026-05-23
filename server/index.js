require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3001;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json());

// تخزين تاريخ المحادثات لكل جلسة
const sessions = {};

const SYSTEM_PROMPT = `أنت أخطبوط 🐙 — مساعد ذكاء اصطناعي متخصص في بناء المشاريع البرمجية الكاملة.

قدراتك:
- تكتب كود احترافي بأي لغة برمجة
- تشرح كل خطوة بوضوح
- تتذكر كل ما تحدثنا عنه في هذه الجلسة
- تقترح أفضل الحلول التقنية
- تجيب دائماً بالعربية ما لم يطلب المستخدم غير ذلك

أسلوبك: دقيق، مباشر، عملي. لا حشو ولا كلام فارغ.`;

app.get('/', (req, res) => {
  res.json({ message: '🐙 أخطبوط يعمل!' });
});

app.post('/api/octopus', async (req, res) => {
  try {
    const { command, sessionId = 'default' } = req.body;

    // إنشاء جلسة جديدة إن لم تكن موجودة
    if (!sessions[sessionId]) {
      sessions[sessionId] = [];
    }

    // إضافة رسالة المستخدم للتاريخ
    sessions[sessionId].push({ role: 'user', content: command });

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

app.listen(PORT, () => {
  console.log(`🐙 أخطبوط شغّال على http://localhost:${PORT}`);
});