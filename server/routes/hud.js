const fs = require('fs');
const path = require('path');
const { readObject, readString } = require('../services/inputValidation');
const { hudLog } = require('../hud-ws');

const SOURCE_EXTENSIONS = new Set(['.jsx', '.js', '.css']);
const MAX_FILES = 120;
const MAX_FILE_BYTES = 180_000;

function walkSourceFiles(rootDir, results = []) {
  if (results.length >= MAX_FILES || !fs.existsSync(rootDir)) return results;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (results.length >= MAX_FILES) break;
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(fullPath, results);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

function issueKeywords(issueId) {
  const map = {
    FIXED_WIDTH_IN_FLEX: ['width:', 'display:', 'flex', 'grid', 'maxWidth'],
    MISSING_TEXT_OVERFLOW: ['overflow', 'textOverflow', 'whiteSpace', 'minWidth'],
    LOW_COLOR_CONTRAST: ['color:', 'background', 'textMuted', 'accent'],
    MISSING_ARIA_LABEL: ['button', 'aria-label', 'title='],
    FORM_MISSING_LABEL: ['input', 'textarea', 'aria-label', 'placeholder'],
  };
  return map[issueId] || [issueId.toLowerCase().replaceAll('_', '-')];
}

function textNeedles(issue) {
  const examples = Array.isArray(issue.examples) ? issue.examples : [];
  return examples
    .flatMap(example => [example.text, example.id, example.className])
    .filter(Boolean)
    .map(value => String(value).trim())
    .filter(value => value.length >= 4)
    .slice(0, 8);
}

function scoreFile(content, issue) {
  const keywords = issueKeywords(issue.id);
  const needles = textNeedles(issue);
  let score = 0;
  for (const keyword of keywords) {
    if (content.includes(keyword)) score += 2;
  }
  for (const needle of needles) {
    if (content.includes(needle)) score += 5;
  }
  return score;
}

function buildSnippet(content) {
  const lines = content.split(/\r?\n/);
  return lines.slice(0, 220).join('\n');
}

function findSourceCandidates(issue, rootDir) {
  const sourceRoot = path.join(rootDir, 'client', 'src');
  return walkSourceFiles(sourceRoot)
    .map(filePath => {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_BYTES) return null;
      const content = fs.readFileSync(filePath, 'utf8');
      const score = scoreFile(content, issue);
      if (score <= 0) return null;
      return {
        path: path.relative(rootDir, filePath).replaceAll('\\', '/'),
        score,
        snippet: buildSnippet(content),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function buildPrompt(issue, candidates) {
  return [
    `Issue: ${issue.id}`,
    `Severity: ${issue.severity}`,
    `Message: ${issue.message}`,
    `Suggested generic fix: ${issue.fix}`,
    '',
    'DOM examples:',
    JSON.stringify(issue.examples || [], null, 2).slice(0, 3500),
    '',
    'Candidate source files:',
    candidates.map(candidate => [
      `--- ${candidate.path} (score ${candidate.score}) ---`,
      candidate.snippet,
    ].join('\n')).join('\n\n').slice(0, 9000),
    '',
    'Return a concise JSON object only:',
    '{ "summary": "...", "confidence": "low|medium|high", "files": [{"path":"...","reason":"..."}], "patch": "unified diff or empty string", "notes": "..." }',
    'Do not apply changes. Do not mention files that are not in the candidates.',
  ].join('\n');
}

function registerHudRoutes(app, { callAI, rootDir }) {
  app.post('/api/hud/ai-fix', async (req, res) => {
    try {
      const body = readObject(req.body, 'body');
      const rawIssue = readObject(body.issue, 'issue');
      const issue = {
        id: readString(rawIssue.id, 'issue.id', { required: true, max: 80 }),
        severity: readString(rawIssue.severity, 'issue.severity', { max: 40 }),
        message: readString(rawIssue.message, 'issue.message', { max: 1000 }),
        fix: readString(rawIssue.fix, 'issue.fix', { max: 1000 }),
        examples: Array.isArray(rawIssue.examples) ? rawIssue.examples.slice(0, 3) : [],
      };

      const candidates = findSourceCandidates(issue, rootDir);
      if (candidates.length === 0) {
        return res.json({
          success: true,
          proposal: {
            summary: 'No matching source candidates were found for this DOM issue.',
            confidence: 'low',
            files: [],
            patch: '',
            notes: 'Run the DOM audit from the exact screen where the issue appears, then try again.',
          },
        });
      }

      hudLog('info', `AI fix requested for ${issue.id}`);
      const response = await callAI([
        {
          role: 'system',
          content: 'You are Octopus Engineer HUD. Propose safe React/CSS patches from DOM audit evidence and candidate source snippets. Return JSON only.',
        },
        {
          role: 'user',
          content: buildPrompt(issue, candidates),
        },
      ], 1800, `hud ai fix ${issue.id}`);

      res.json({
        success: true,
        proposal: response,
        candidates: candidates.map(({ path: filePath, score }) => ({ path: filePath, score })),
      });
    } catch (error) {
      hudLog('err', `AI fix failed: ${error.message}`);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerHudRoutes };
