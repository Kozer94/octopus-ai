class SmartComments {
  constructor() {
    this.id = 'smart-comments';
    this.name = 'تعليقات ذكية';
    this.version = '1.0.0';
    this.description = 'يضيف تعليقات عربية للكود المُولَّد تلقائياً';
    this.author = 'Octopus Team';
    this.icon = '💬';
    this.enabled = true;

    this.hooks = {
      afterResponse: async (response) => {
        try {
          const commentedResponse = response
            .replace(/function\s+(\w+)/g, 'function $1 // دالة')
            .replace(/const\s+(\w+)\s*=/g, 'const $1 = // ثابت')
            .replace(/class\s+(\w+)/g, 'class $1 // فئة')
            .replace(/\/\/\s*TODO/gi, '// TODO: مهمة مستقبلية');

          console.log('💬 Smart comments added to response');
          return commentedResponse;
        } catch (error) {
          console.error('Smart-comments error:', error.message);
          return response;
        }
      }
    };

    this.routes = [
      {
        method: 'POST',
        path: '/api/plugin/smart-comments/add',
        handler: async (req, res) => {
          try {
            const { code } = req.body;
            if (!code) {
              return res.status(400).json({ success: false, error: 'code required' });
            }

            const commentedCode = code
              .replace(/function\s+(\w+)/g, 'function $1 // دالة')
              .replace(/const\s+(\w+)\s*=/g, 'const $1 = // ثابت')
              .replace(/let\s+(\w+)\s*=/g, 'let $1 = // متغير')
              .replace(/var\s+(\w+)\s*=/g, 'var $1 = // متغير قديم')
              .replace(/class\s+(\w+)/g, 'class $1 // فئة')
              .replace(/if\s*\(/g, 'if ( // شرط')
              .replace(/for\s*\(/g, 'for ( // حلقة')
              .replace(/while\s*\(/g, 'while ( // حلقة while')
              .replace(/return\s+/g, 'return // إرجاع ')
              .replace(/import\s+/g, 'import // استيراد ')
              .replace(/export\s+/g, 'export // تصدير ');

            res.json({ success: true, commentedCode });
          } catch (error) {
            res.status(500).json({ success: false, error: error.message });
          }
        }
      }
    ];
  }

  async initialize() {
    console.log('SmartComments plugin initialized');
  }
}

module.exports = SmartComments;
