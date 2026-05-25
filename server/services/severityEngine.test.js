const test = require('node:test');
const assert = require('node:assert/strict');
const {
  enrichIssues,
  enrichSeverity,
  severityLabel,
} = require('./severityEngine');

test('severity engine scores issues across risk dimensions', () => {
  const issue = enrichSeverity({
    level: 'critical',
    title: 'Raw SQL queries مشبوهة',
    detail: 'DB::select uses request input — تحقق من SQL Injection',
  });

  assert.equal(issue.severity.label, 'critical');
  assert.ok(issue.severity.score >= 85);
  assert.ok(issue.severity.dimensions.exploitability >= 90);
  assert.ok(issue.severity.dimensions.userImpact >= 90);
  assert.ok(issue.severity.confidence >= 90);
});

test('severity engine accepts explicit dimension overrides', () => {
  const issue = enrichSeverity({
    level: 'warning',
    title: 'Cosmetic issue',
    dimensions: {
      exploitability: 5,
      userImpact: 10,
      reproducibility: 100,
      productionRisk: 15,
      confidence: 95,
    },
  });

  assert.equal(issue.severity.dimensions.exploitability, 5);
  assert.equal(issue.severity.dimensions.reproducibility, 100);
  assert.equal(issue.severity.confidence, 95);
  assert.equal(issue.severity.label, 'minor');
});

test('severity labels have stable thresholds', () => {
  assert.equal(severityLabel(90), 'critical');
  assert.equal(severityLabel(70), 'major');
  assert.equal(severityLabel(45), 'moderate');
  assert.equal(severityLabel(20), 'minor');
  assert.equal(enrichIssues([{ level: 'info', title: 'note' }]).length, 1);
});
