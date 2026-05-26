function shouldRequestFormatting(command = '') {
  const text = String(command || '').trim();
  if (!text) return false;

  const explicitFormatRequest = /(```|<file\s+path=|تنسيق|نسق|رتب الكود|جمّل الكود|format|formatter|prettier|beautify)/i
    .test(text);
  const codeLikeText = /(\b(function|const|let|var|class|import|export|return|if|else|for|while)\b|<\?php|<\/?[a-z][\s\S]*>|[{;}])/i
    .test(text);

  return explicitFormatRequest || (codeLikeText && text.split(/\s+/).length > 4);
}

class CodeFormatter {
  constructor() {
    this.id = 'code-formatter';
    this.name = 'منسق الكود';
    this.version = '1.0.0';
    this.description = 'يضيف تعليمة للـ AI بتنسيق الكود بشكل جميل ومنظم';
    this.author = 'Octopus Team';
    this.icon = '✨';
    this.enabled = true;

    this.hooks = {
      beforeSend: async (command) => {
        try {
          if (!shouldRequestFormatting(command)) {
            return command;
          }

          const formattingInstruction = '\n\nيرجى تنسيق الكود بشكل جميل ومنظم مع مسافات بادئة مناسبة.';
          return command + formattingInstruction;
        } catch (error) {
          console.error('Code-formatter error:', error.message);
          return command;
        }
      }
    };

    this.routes = [
      {
        method: 'POST',
        path: '/api/plugin/code-formatter/format',
        handler: async (req, res) => {
          try {
            const { code } = req.body;
            if (!code) {
              return res.status(400).json({ success: false, error: 'code required' });
            }

            const lines = code.split('\n');
            let indentLevel = 0;
            const formatted = lines.map(line => {
              const trimmed = line.trim();
              if (!trimmed) return '';

              if (trimmed.startsWith('}') || trimmed.startsWith(']') || trimmed.startsWith(')')) {
                indentLevel = Math.max(0, indentLevel - 1);
              }

              const formattedLine = '  '.repeat(indentLevel) + trimmed;

              if (trimmed.endsWith('{') || trimmed.endsWith('[') || trimmed.endsWith('(')) {
                indentLevel++;
              }

              return formattedLine;
            }).join('\n');

            res.json({ success: true, formatted });
          } catch (error) {
            res.status(500).json({ success: false, error: error.message });
          }
        }
      }
    ];
  }

  async initialize() {
    console.log('CodeFormatter plugin initialized');
  }
}

module.exports = CodeFormatter;
