const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SYSTEM_PROMPT,
  isReportCommand,
} = require('./octopusConfig');

test('isReportCommand detects Arabic and English report requests', () => {
  assert.equal(isReportCommand('اكتب تقرير عن المشروع'), true);
  assert.equal(isReportCommand('analyze this project'), true);
  assert.equal(isReportCommand('generate report for runtime'), true);
  assert.equal(isReportCommand('create a button'), false);
  assert.equal(isReportCommand('documentation cleanup'), false);
});

test('SYSTEM_PROMPT contains required output tags', () => {
  assert.equal(SYSTEM_PROMPT.includes('<terminal>'), true);
  assert.equal(SYSTEM_PROMPT.includes('<file path='), true);
});

test('SYSTEM_PROMPT contains Octopus identity facts', () => {
  assert.equal(SYSTEM_PROMPT.includes('ئامانج صالحي'), true);
  assert.equal(SYSTEM_PROMPT.includes('كوزر'), true);
  assert.equal(SYSTEM_PROMPT.includes('24-30 مايو 2026'), true);
  assert.equal(SYSTEM_PROMPT.includes('Electron + Vite/React'), true);
});
