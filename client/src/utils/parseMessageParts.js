/**
 * parseMessageParts — يحلل نص رسالة Octopus إلى أجزاء قابلة للعرض
 *
 * يُعيد مصفوفة من:
 *   { type: 'text',     content: string }
 *   { type: 'terminal', command: string }
 *   { type: 'file',     path: string, code: string }
 *
 * مثال:
 *   "Here is the fix:\n<file path=\"src/x.js\">const x=1;</file>\nDone!"
 *   →  [
 *        { type: 'text',  content: 'Here is the fix:\n' },
 *        { type: 'file',  path: 'src/x.js', code: 'const x=1;' },
 *        { type: 'text',  content: '\nDone!' },
 *      ]
 */

// Streaming state for incremental parsing
class StreamingParser {
  constructor() {
    this.buffer = '';
    this.parts = [];
    this.inTerminal = false;
    this.inFile = false;
    this.currentFilePath = '';
    this.currentFileContent = '';
    this.currentTerminalContent = '';
  }

  append(chunk) {
    this.buffer += chunk;
    this.parseBuffer();
    return this.parts;
  }

  parseBuffer() {
    let i = 0;
    const len = this.buffer.length;

    while (i < len) {
      if (!this.inTerminal && !this.inFile) {
        // Look for opening tags
        const terminalOpen = this.buffer.indexOf('<terminal>', i);
        const fileOpen = this.buffer.indexOf('<file path="', i);

        if (terminalOpen === -1 && fileOpen === -1) {
          // No more tags, save remaining as text
          const text = this.buffer.slice(i);
          if (text) this.parts.push({ type: 'text', content: text });
          this.buffer = '';
          break;
        }

        // Find which tag comes first
        const firstTag = terminalOpen !== -1 && (fileOpen === -1 || terminalOpen < fileOpen)
          ? { type: 'terminal', index: terminalOpen }
          : fileOpen !== -1 ? { type: 'file', index: fileOpen }
          : null;

        if (!firstTag) break;

        // Save text before tag
        const text = this.buffer.slice(i, firstTag.index);
        if (text) this.parts.push({ type: 'text', content: text });

        if (firstTag.type === 'terminal') {
          this.inTerminal = true;
          this.currentTerminalContent = '';
          i = firstTag.index + '<terminal>'.length;
        } else {
          // Extract file path
          const pathEnd = this.buffer.indexOf('">', firstTag.index + '<file path="'.length);
          if (pathEnd === -1) break; // Incomplete tag, wait for more
          this.currentFilePath = this.buffer.slice(firstTag.index + '<file path="'.length, pathEnd);
          this.inFile = true;
          this.currentFileContent = '';
          i = pathEnd + '">'.length;
        }
      } else if (this.inTerminal) {
        // Look for closing </terminal>
        const terminalClose = this.buffer.indexOf('</terminal>', i);
        if (terminalClose === -1) {
          // Incomplete, save what we have and wait
          this.currentTerminalContent += this.buffer.slice(i);
          this.buffer = '';
          break;
        }
        this.currentTerminalContent += this.buffer.slice(i, terminalClose);
        const command = this.currentTerminalContent.trim();
        if (command) this.parts.push({ type: 'terminal', command });
        this.inTerminal = false;
        this.currentTerminalContent = '';
        i = terminalClose + '</terminal>'.length;
      } else if (this.inFile) {
        // Look for closing </file>
        const fileClose = this.buffer.indexOf('</file>', i);
        if (fileClose === -1) {
          // Incomplete, save what we have and wait
          this.currentFileContent += this.buffer.slice(i);
          this.buffer = '';
          break;
        }
        this.currentFileContent += this.buffer.slice(i, fileClose);
        const code = this.currentFileContent.trim();
        if (this.currentFilePath && code) {
          this.parts.push({ type: 'file', path: this.currentFilePath, code });
        }
        this.inFile = false;
        this.currentFilePath = '';
        this.currentFileContent = '';
        i = fileClose + '</file>'.length;
      }
    }

    // Keep unparsed portion
    this.buffer = this.buffer.slice(i);
  }

  finalize() {
    if (this.buffer) {
      this.parts.push({ type: 'text', content: this.buffer });
      this.buffer = '';
    }
    return this.parts;
  }
}

export function parseMessageParts(rawText) {
  const parts = [];
  const text = rawText || '';

  // يطابق: <terminal>...</terminal>  أو  <file path="...">...</file>
  const blockRe = /<terminal>([\s\S]*?)<\/terminal>|<file\s+path="([^"]*)">([\s\S]*?)<\/file>/gi;

  let lastIndex = 0;
  let match;

  while ((match = blockRe.exec(text)) !== null) {
    // النص قبل هذه الكتلة
    const before = text.slice(lastIndex, match.index);
    if (before) parts.push({ type: 'text', content: before });

    if (match[1] !== undefined) {
      // <terminal>command</terminal>
      const command = match[1].trim();
      if (command) parts.push({ type: 'terminal', command });
    } else {
      // <file path="...">code</file>
      const path = match[2] || '';
      const code = (match[3] || '').trim();
      if (path) parts.push({ type: 'file', path, code });
    }

    lastIndex = blockRe.lastIndex;
  }

  // النص المتبقي بعد آخر كتلة
  const rest = text.slice(lastIndex);
  if (rest) parts.push({ type: 'text', content: rest });

  return parts;
}

/**
 * createStreamingParser — creates a new streaming parser instance
 */
export function createStreamingParser() {
  return new StreamingParser();
}

/**
 * hasBlocks — هل تحتوي الرسالة على كتل terminal أو file؟
 */
export function hasBlocks(rawText) {
  return /<terminal>|<file\s+path="/i.test(rawText || '');
}
