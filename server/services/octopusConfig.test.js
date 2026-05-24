const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SYSTEM_PROMPT,
  isReportCommand,
} = require('./octopusConfig');

test('isReportCommand detects Arabic and English report requests', () => {
  assert.equal(isReportCommand('اكتب تقرير عن المشروع'), true);
  assert.equal(isReportCommand('analyze this project'), true);
  assert.equal(isReportCommand('create a button'), false);
});

test('SYSTEM_PROMPT contains required output tags', () => {
  assert.equal(SYSTEM_PROMPT.includes('<terminal>'), true);
  assert.equal(SYSTEM_PROMPT.includes('<file path='), true);
});
