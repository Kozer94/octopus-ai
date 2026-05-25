const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateHealthScore, generateReport } = require('./scanReportService');
const { enrichSeverity } = require('./severityEngine');

function baseScan(overrides = {}) {
  return {
    name: 'demo',
    scannedAt: '2026-05-25T00:00:00.000Z',
    isLaravel: false,
    frameworks: ['React'],
    stats: {
      avgLines: 10,
      largest: [],
      top: [['.js', { count: 1, lines: 10 }]],
      totalLines: 10,
      totalSize: 1024,
    },
    tables: [],
    models: [],
    controllers: [],
    routes: { summary: { total: 0 }, groups: [] },
    env: null,
    composer: null,
    configCheck: [],
    security: { critical: [], warnings: [], good: [], criticalIssues: [], warningIssues: [] },
    smells: [],
    ...overrides,
  };
}

test('scan report renders severity engine dimensions for security issues', () => {
  const scan = baseScan({
    security: {
      critical: ['Raw SQL queries مشبوهة'],
      warnings: [],
      good: [],
      criticalIssues: [enrichSeverity({
        level: 'critical',
        title: 'Raw SQL queries مشبوهة',
        detail: 'تحقق من SQL Injection',
      })],
      warningIssues: [],
    },
  });

  const report = generateReport(scan);
  assert.match(report, /Severity Engine/);
  assert.match(report, /Exploitability/);
  assert.match(report, /User impact/);
  assert.match(report, /Production risk/);
  assert.match(report, /confidence \d+%/);
});

test('health score uses severity scores instead of issue counts only', () => {
  const scan = baseScan({
    smells: [enrichSeverity({
      level: 'error',
      title: 'نسبة الاختبارات منخفضة جداً',
      detail: '0 tests',
      fix: 'أضف tests',
    })],
  });

  assert.ok(calculateHealthScore(scan) < 100);
});
