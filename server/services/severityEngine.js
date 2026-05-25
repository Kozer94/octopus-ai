const DIMENSIONS = [
  'exploitability',
  'userImpact',
  'reproducibility',
  'productionRisk',
  'confidence',
];

const LEVEL_DEFAULTS = {
  critical: { exploitability: 85, userImpact: 90, reproducibility: 80, productionRisk: 95, confidence: 85 },
  error: { exploitability: 65, userImpact: 75, reproducibility: 70, productionRisk: 80, confidence: 80 },
  warning: { exploitability: 35, userImpact: 50, reproducibility: 65, productionRisk: 55, confidence: 75 },
  info: { exploitability: 15, userImpact: 25, reproducibility: 50, productionRisk: 25, confidence: 65 },
};

const SECURITY_HINTS = [
  { pattern: /sql injection|raw sql|db::select|db::statement/i, boost: { exploitability: 20, userImpact: 15, productionRisk: 15, confidence: 10 } },
  { pattern: /\.env|key|secret|token|تسريب|بيانات/i, boost: { exploitability: 15, userImpact: 20, productionRisk: 20, confidence: 10 } },
  { pattern: /debug|stack trace|production/i, boost: { exploitability: 10, userImpact: 10, productionRisk: 20, confidence: 5 } },
  { pattern: /csrf|mass assignment|guarded/i, boost: { exploitability: 10, userImpact: 10, productionRisk: 10, confidence: 5 } },
];

function clampScore(value) {
  const number = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeBaseLevel(level = 'info') {
  const normalized = String(level || 'info').toLowerCase();
  if (normalized === 'minor') return 'info';
  if (normalized === 'major') return 'error';
  if (normalized === 'critical') return 'critical';
  return LEVEL_DEFAULTS[normalized] ? normalized : 'info';
}

function applyBoost(dimensions, boost = {}) {
  return DIMENSIONS.reduce((next, key) => {
    next[key] = clampScore((next[key] || 0) + (boost[key] || 0));
    return next;
  }, { ...dimensions });
}

function inferDimensions(issue = {}) {
  const baseLevel = normalizeBaseLevel(issue.level || issue.severity);
  let dimensions = { ...LEVEL_DEFAULTS[baseLevel] };
  const text = [issue.title, issue.detail, issue.fix, issue.message, issue.text].filter(Boolean).join(' ');

  for (const hint of SECURITY_HINTS) {
    if (hint.pattern.test(text)) dimensions = applyBoost(dimensions, hint.boost);
  }

  if (issue.dimensions) {
    dimensions = DIMENSIONS.reduce((next, key) => {
      next[key] = issue.dimensions[key] === undefined ? dimensions[key] : clampScore(issue.dimensions[key]);
      return next;
    }, {});
  }

  return dimensions;
}

function calculateSeverityScore(dimensions) {
  return clampScore(
    dimensions.exploitability * 0.25 +
    dimensions.userImpact * 0.25 +
    dimensions.reproducibility * 0.15 +
    dimensions.productionRisk * 0.25 +
    dimensions.confidence * 0.10,
  );
}

function severityLabel(score) {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'major';
  if (score >= 40) return 'moderate';
  return 'minor';
}

function enrichSeverity(issue = {}) {
  const dimensions = inferDimensions(issue);
  const score = calculateSeverityScore(dimensions);
  return {
    ...issue,
    severity: {
      label: severityLabel(score),
      score,
      confidence: dimensions.confidence,
      dimensions,
    },
  };
}

function enrichIssues(issues = []) {
  return issues.map(enrichSeverity);
}

module.exports = {
  DIMENSIONS,
  calculateSeverityScore,
  enrichIssues,
  enrichSeverity,
  inferDimensions,
  severityLabel,
};
