const path = require('path');
const fs = require('fs/promises');
const { readObject, readString } = require('../services/inputValidation');
const { hudLog } = require('../hud-ws');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

function escapeForRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyCssPatch(content, selector, property, newValue, code) {
  const esc = escapeForRegex(selector);
  const propEsc = escapeForRegex(property);

  // Match: selector { single-depth block }
  const blockRe = new RegExp(`(${esc}\\s*\\{)([^}]*)(\\})`, 'g');
  const match = blockRe.exec(content);

  if (!match) {
    // Selector not found — append the full code snippet
    const appended = content.trimEnd() + '\n\n' + code.trim() + '\n';
    return {
      result: appended,
      changed: appended !== content,
      action: appended === content ? 'skipped' : 'appended',
    };
  }

  const [full, open, body, close] = match;
  const propRe = new RegExp(`(${propEsc}\\s*:)[^;\\n}]*(;?)`, 'g');

  if (propRe.test(body)) {
    // Property exists — replace its value
    propRe.lastIndex = 0;
    const newBody = body.replace(propRe, `$1 ${newValue};`);
    const result =
      content.slice(0, match.index) + open + newBody + close +
      content.slice(match.index + full.length);
    return {
      result,
      changed: result !== content,
      action: result === content ? 'skipped' : 'replaced',
    };
  }

  // Selector exists but property missing — inject before closing brace
  const newBody = body.trimEnd() + `\n  ${property}: ${newValue};\n`;
  const result =
    content.slice(0, match.index) + open + newBody + close +
    content.slice(match.index + full.length);
  return {
    result,
    changed: result !== content,
    action: result === content ? 'skipped' : 'added',
  };
}

function buildPreview(after, selector) {
  const lines = after.split('\n');
  // Find the selector line (strip leading dot/hash for a looser match)
  const needle = selector.replace(/^[.#]/, '');
  const idx = lines.findIndex(l => l.includes(needle));
  if (idx === -1) return lines.slice(-12).join('\n');
  const start = Math.max(0, idx - 2);
  const end = Math.min(lines.length, idx + 12);
  return lines.slice(start, end).join('\n');
}

function registerHudApplyPatchRoutes(app, { rootDir } = {}) {
  const effectiveRoot = path.resolve(rootDir || ROOT_DIR);
  const allowedBase = path.resolve(effectiveRoot, 'client', 'src');

  app.post('/api/hud/apply-patch', async (req, res) => {
    let ruleId = 'UNKNOWN';
    try {
      const body = readObject(req.body, 'body');
      ruleId = readString(body.ruleId, 'ruleId', { required: true, max: 80 });
      const patch = readObject(body.patch, 'patch');
      const targetFile = readString(body.targetFile, 'targetFile', { required: true, max: 260 });

      const type = readString(patch.type, 'patch.type', { max: 20 }) || 'css';
      const selector = readString(patch.selector, 'patch.selector', { required: true, max: 500 });
      const property = readString(patch.property, 'patch.property', { required: true, max: 100 });
      const newValue = readString(patch.newValue, 'patch.newValue', { required: true, max: 500 });
      const code = readString(patch.code, 'patch.code', { max: 5000 }) ||
        `${selector} {\n  ${property}: ${newValue};\n}`;

      if (type !== 'css') {
        return res.status(400).json({ success: false, error: 'Only css patches are supported' });
      }

      // Path guard — must be inside client/src, .css only, no traversal
      const clean = targetFile.replace(/^[./\\]+/, '');
      const resolved = path.resolve(effectiveRoot, clean);
      const rel = path.relative(allowedBase, resolved);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return res.status(400).json({ success: false, error: 'targetFile must be inside client/src' });
      }
      if (path.extname(resolved) !== '.css') {
        return res.status(400).json({ success: false, error: 'Only .css files are supported' });
      }

      hudLog('info', `Apply patch: ${ruleId} → ${path.relative(effectiveRoot, resolved)}`);

      // Read
      let content;
      try {
        content = await fs.readFile(resolved, 'utf8');
      } catch {
        hudLog('err', `File not found: ${targetFile}`);
        return res.status(404).json({ success: false, error: `File not found: ${targetFile}` });
      }

      // Apply
      const { result, changed, action } = applyCssPatch(content, selector, property, newValue, code);

      if (!changed) {
        hudLog('warn', `No change needed for ${ruleId} in ${path.basename(targetFile)}`);
        return res.json({
          success: true,
          status: 'skipped',
          changed: false,
          action: 'skipped',
          message: 'Patch skipped because the target file already matches the requested change.',
          preview: '',
        });
      }

      // Write
      await fs.writeFile(resolved, result, 'utf8');
      hudLog('ok', `Patch applied (${action}): ${ruleId} → ${path.basename(targetFile)}`);

      res.json({
        success: true,
        status: 'applied',
        changed: true,
        action,
        message: `Patch ${action} in ${path.basename(targetFile)}.`,
        preview: buildPreview(result, selector),
      });
    } catch (error) {
      hudLog('err', `Apply patch error (${ruleId}): ${error.message}`);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerHudApplyPatchRoutes };
