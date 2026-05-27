const { readObject, readString } = require('../services/inputValidation');
const { hudLog } = require('../hud-ws');

const AI_TIMEOUT_MS = 15_000;

const FALLBACK_PATCHES = {
  MISSING_TEXT_OVERFLOW: {
    type: 'css', selector: '.target', property: 'overflow', oldValue: 'visible', newValue: 'hidden',
    code: '.target {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n}',
    safe: true, sideEffects: [],
  },
  FONT_SIZE_TOO_SMALL: {
    type: 'css', selector: '.target', property: 'font-size', oldValue: '< 12px', newValue: '12px',
    code: '.target {\n  font-size: 12px;\n}',
    safe: true, sideEffects: [],
  },
  LOW_COLOR_CONTRAST: {
    type: 'css', selector: '.target', property: 'color', oldValue: 'low-contrast', newValue: 'var(--text-primary, #e6edf3)',
    code: '.target {\n  color: var(--text-primary, #e6edf3);\n}',
    safe: true, sideEffects: [],
  },
  MISSING_ARIA_LABEL: {
    type: 'html', selector: 'button', property: 'aria-label', oldValue: '', newValue: '"action"',
    code: '// Add aria-label to icon-only buttons:\n<button aria-label="Describe the action">\n  <i className="codicon codicon-icon" />\n</button>',
    safe: true, sideEffects: [],
  },
  HEAVY_ANIMATION: {
    type: 'css', selector: '.animated', property: 'transition', oldValue: 'layout property', newValue: 'transform opacity',
    code: '.animated {\n  transition: transform 0.3s ease, opacity 0.3s ease;\n  will-change: transform;\n}',
    safe: true, sideEffects: [],
  },
  ANIMATION_PERF: {
    type: 'css', selector: '.animated', property: 'will-change', oldValue: 'auto', newValue: 'transform',
    code: '.animated {\n  will-change: transform;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .animated {\n    animation: none !important;\n    transition: none !important;\n    will-change: auto !important;\n  }\n}',
    safe: true, sideEffects: [],
  },
  GRID_MIN_WIDTH: {
    type: 'css', selector: '.grid', property: 'grid-template-columns', oldValue: '1fr', newValue: 'minmax(0, 1fr)',
    code: '.grid {\n  grid-template-columns: minmax(0, 1fr);\n}\n/* or on grid children: */\n.grid > * { min-width: 0; }',
    safe: true, sideEffects: [],
  },
  FIXED_WIDTH_IN_FLEX: {
    type: 'css', selector: '.flex-child', property: 'width', oldValue: 'fixed px', newValue: 'max-width + 100%',
    code: '.flex-child {\n  width: 100%;\n  max-width: 240px; /* original fixed value */\n}',
    safe: true, sideEffects: [],
  },
  MISSING_ALT_TEXT: {
    type: 'html', selector: 'img', property: 'alt', oldValue: '', newValue: '"description"',
    code: '<img src="..." alt="Describe the image content" />\n// or for decorative images:\n<img src="..." alt="" role="presentation" />',
    safe: true, sideEffects: [],
  },
  MISSING_FOCUS_STYLE: {
    type: 'css', selector: '.focusable', property: ':focus-visible', oldValue: 'none', newValue: 'outline',
    code: '.focusable:focus-visible {\n  outline: 2px solid var(--accent, #58a6ff);\n  outline-offset: 2px;\n}',
    safe: true, sideEffects: [],
  },
  FORM_MISSING_LABEL: {
    type: 'html', selector: 'input', property: 'aria-label', oldValue: '', newValue: '"label"',
    code: '// Option A — visible label:\n<label htmlFor="field-id">Label</label>\n<input id="field-id" />\n\n// Option B — aria-label:\n<input aria-label="Field label" />',
    safe: true, sideEffects: [],
  },
  Z_INDEX_CHAOS: {
    type: 'css', selector: '.element', property: 'z-index', oldValue: 'arbitrary value', newValue: '100/200/300',
    code: '/* Use a consistent z-index scale */\n.layer-base    { z-index: 100; }\n.layer-overlay { z-index: 200; }\n.layer-modal   { z-index: 300; }',
    safe: true, sideEffects: [],
  },
  RESPONSIVE_OVERFLOW: {
    type: 'css', selector: '.element', property: 'max-width', oldValue: 'unconstrained', newValue: '100%',
    code: '.element {\n  max-width: 100%;\n  overflow-x: hidden;\n}',
    safe: true, sideEffects: [],
  },
};

const SYSTEM_PROMPT = `You are a senior frontend engineer specialized in fixing CSS and HTML accessibility/performance issues.
Analyze the DOM Audit problem and produce a precise, safe patch.

STRICT RULES:
- Fix ONLY the exact issue described — nothing else
- Do NOT change unrelated properties
- Do NOT add new dependencies
- Prefer CSS variables (--accent, --text, --border, --bg, --sidebar) over hardcoded colors
- Return JSON ONLY — no markdown, no backticks, no text outside JSON

EXACT RESPONSE FORMAT (JSON only):
{
  "analysis": "one sentence: root cause of the issue",
  "patch": {
    "type": "css",
    "selector": ".exact-selector",
    "property": "css-property-or-html-attr",
    "oldValue": "current broken value",
    "newValue": "corrected value",
    "code": "complete ready-to-paste snippet",
    "safe": true,
    "sideEffects": []
  },
  "confidence": "high"
}`;

function buildPrompt({ ruleId, severity, description, affected, elements, pageContext }) {
  return [
    `Audit Rule: ${ruleId}`,
    `Severity: ${severity}`,
    `Issue: ${description}`,
    `Affected elements: ${affected}`,
    '',
    `DOM examples (first ${Math.min(elements.length, 5)}):`,
    JSON.stringify(elements.slice(0, 5), null, 2),
    '',
    `Page: ${pageContext.title || ''} — ${pageContext.url || ''}`,
    '',
    'Return the JSON patch.',
  ].join('\n');
}

function getFallback(ruleId) {
  return FALLBACK_PATCHES[ruleId] || {
    type: 'css',
    selector: '.target',
    property: 'unknown',
    oldValue: '',
    newValue: '',
    code: `/* Manual fix needed for ${ruleId}.\n * Inspect the affected elements and apply the recommended fix. */`,
    safe: false,
    sideEffects: ['Manual review required'],
  };
}

function parseAiResponse(text, ruleId) {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.patch && typeof parsed.analysis === 'string' && parsed.confidence) {
      return { analysis: parsed.analysis, patch: parsed.patch, confidence: parsed.confidence };
    }
  } catch { /* fall through */ }
  return {
    analysis: `Could not parse AI response for ${ruleId}. Using rule-based fallback.`,
    patch: getFallback(ruleId),
    confidence: 'low',
  };
}

function registerHudAiFixRoutes(app, { callAI }) {
  app.post('/api/hud/ai-fix', async (req, res) => {
    let ruleId = 'UNKNOWN';
    try {
      const body = readObject(req.body, 'body');

      let normalized;
      if (body.ruleId) {
        ruleId = readString(body.ruleId, 'ruleId', { required: true, max: 80 });
        normalized = {
          ruleId,
          severity: readString(body.severity, 'severity', { max: 40 }) || 'minor',
          description: readString(body.description, 'description', { max: 1000 }) || '',
          affected: typeof body.affected === 'number' ? body.affected : 0,
          elements: Array.isArray(body.elements) ? body.elements.slice(0, 5) : [],
          pageContext: body.pageContext && typeof body.pageContext === 'object' ? body.pageContext : {},
        };
      } else {
        // Legacy format: { issue: { id, severity, message, fix, count, examples } }
        const issue = readObject(body.issue, 'issue');
        ruleId = readString(issue.id, 'issue.id', { required: true, max: 80 });
        normalized = {
          ruleId,
          severity: readString(issue.severity, 'issue.severity', { max: 40 }) || 'minor',
          description: readString(issue.message, 'issue.message', { max: 1000 }) || '',
          affected: issue.count || 0,
          elements: Array.isArray(issue.examples)
            ? issue.examples.slice(0, 5).map(e => ({
                tag: String(e.tagName || e.tag || 'element').slice(0, 40),
                className: String(e.className || '').slice(0, 120),
                inlineStyle: e.style ? JSON.stringify(e.style).slice(0, 200) : '',
                textContent: String(e.text || e.textContent || '').slice(0, 120),
              }))
            : [],
          pageContext: {},
        };
      }

      hudLog('info', `AI fix requested: ${normalized.ruleId} (${normalized.affected} elements)`);

      let aiText;
      try {
        aiText = await Promise.race([
          callAI(
            [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: buildPrompt(normalized) },
            ],
            800,
            `hud groq fix ${normalized.ruleId}`
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI timeout after 15s')), AI_TIMEOUT_MS)
          ),
        ]);
      } catch (aiError) {
        hudLog('warn', `Groq fallback for ${normalized.ruleId}: ${aiError.message}`);
        return res.json({
          success: true,
          status: 'success',
          ruleId: normalized.ruleId,
          analysis: `Groq unavailable — using rule-based fallback. (${aiError.message})`,
          patch: getFallback(normalized.ruleId),
          confidence: 'low',
          fallback: true,
        });
      }

      const result = parseAiResponse(aiText, normalized.ruleId);
      hudLog('ok', `AI fix ready: ${normalized.ruleId} — ${result.confidence} confidence`);

      res.json({
        success: true,
        status: 'success',
        ruleId: normalized.ruleId,
        analysis: result.analysis,
        patch: result.patch,
        confidence: result.confidence,
      });
    } catch (error) {
      hudLog('err', `AI fix error (${ruleId}): ${error.message}`);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { registerHudAiFixRoutes };
