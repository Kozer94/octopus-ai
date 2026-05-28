import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OCTOPUS_BUSY_MESSAGE,
  INITIAL_CHAT_MESSAGES,
  octopusErrorMessage,
  octopusMessage,
  octopusScanErrorMessage,
  userMessage,
} from './chatMessages.js';
import { displayFilePath } from './pathDisplay.js';
import { getEditorLanguage, isBinaryEditorFile } from './editorLanguage.js';
import { THEMES } from '../config/uiConfig.js';
import { cleanChatText, removeUnknownScriptCharacters } from './diffUtils.js';
import { splitTerminalLinks } from './terminalLinks.js';
import {
  TERMINAL_READY_ENTRY,
  appendTerminalOutputChunk,
  finishTerminalStream,
  terminalApprovalEntry,
  terminalErrorEntry,
  terminalExitEntry,
  terminalInputEntry,
  terminalOutputEntry,
  terminalResultEntry,
  terminalRunEntry,
  terminalSkippedEntry,
  terminalStreamingEntry,
  terminalSystemEntry,
} from './terminalHistory.js';
import { analyzeTerminalCommandRisk } from './terminalRisk.js';
import { bidiIsolateStyle, bidiPlainTextStyle, codeTextStyle, getTextDirection } from './bidiText.js';

test('chat message helpers keep role and text shape stable', () => {
  assert.equal(INITIAL_CHAT_MESSAGES[0].role, 'octopus');
  assert.match(INITIAL_CHAT_MESSAGES[0].id, /initial-octopus-ready/);
  assert.deepEqual(
    { role: userMessage('hello').role, text: userMessage('hello').text },
    { role: 'user', text: 'hello' },
  );
  assert.deepEqual(
    { role: octopusMessage('done').role, text: octopusMessage('done').text },
    { role: 'octopus', text: 'done' },
  );
  assert.deepEqual(
    { role: octopusErrorMessage('bad').role, text: octopusErrorMessage('bad').text },
    { role: 'octopus', text: 'Error: bad' },
  );
  assert.deepEqual(
    { role: octopusScanErrorMessage('scan bad').role, text: octopusScanErrorMessage('scan bad').text },
    { role: 'octopus', text: 'Scan error: scan bad' },
  );
  assert.equal(OCTOPUS_BUSY_MESSAGE.role, 'octopus');
});

test('chat text cleanup removes unknown CJK script leaks', () => {
  assert.equal(removeUnknownScriptCharacters('أستطيع أن أ提供 النصائح'), 'أستطيع أن أ النصائح');
  assert.equal(removeUnknownScriptCharacters('لكي أ trở أذكى'), 'لكي أ أذكى');
  assert.equal(cleanChatText('أستطيع أن أ提供 النصائح'), 'أستطيع أن أ النصائح');
});

test('terminal history helpers preserve entry types', () => {
  assert.deepEqual(TERMINAL_READY_ENTRY, { type: 'system', text: '🐙 Terminal ready' });
  assert.deepEqual(terminalInputEntry('npm test'), { type: 'input', text: '$ npm test' });
  assert.deepEqual(terminalResultEntry({ success: true, output: 'ok' }), { type: 'output', text: 'ok' });
  assert.deepEqual(terminalResultEntry({ success: false, error: 'bad' }), { type: 'error', text: 'bad' });
  assert.deepEqual(terminalOutputEntry('stdout'), { type: 'output', text: 'stdout' });
  assert.deepEqual(terminalSystemEntry('system'), { type: 'system', text: 'system' });
  assert.deepEqual(terminalStreamingEntry(), { type: 'output', text: '', streaming: true });
  assert.deepEqual(terminalErrorEntry('bad'), { type: 'error', text: '⚠️ bad' });
  assert.deepEqual(terminalRunEntry('npm run dev'), { type: 'system', text: '🚀 Running: npm run dev' });
  assert.deepEqual(terminalApprovalEntry('npm test'), { type: 'system', text: 'Approval required: npm test' });
  assert.deepEqual(terminalApprovalEntry('rm -rf .', analyzeTerminalCommandRisk('rm -rf .')), {
    type: 'system',
    text: 'Approval required: rm -rf . [High risk: Can delete data, reset state, stop services, or change the database. Confirm only if this exact action is intended.]',
  });
  assert.deepEqual(terminalSkippedEntry('npm test'), { type: 'system', text: 'Skipped: npm test' });
  assert.deepEqual(terminalExitEntry(0), { type: 'system', text: 'Process exited with code 0' });
});

test('terminal risk classifier highlights destructive and package commands', () => {
  assert.equal(analyzeTerminalCommandRisk('npm test').level, 'safe');
  assert.equal(analyzeTerminalCommandRisk('npm install').level, 'caution');
  assert.equal(analyzeTerminalCommandRisk('php artisan migrate').level, 'destructive');
  assert.equal(analyzeTerminalCommandRisk('git reset --hard').level, 'destructive');
});

test('terminal stream helpers append chunks to the active output entry', () => {
  const history = appendTerminalOutputChunk([TERMINAL_READY_ENTRY], 'one');
  assert.deepEqual(history.at(-1), { type: 'output', text: 'one', streaming: true });

  const updated = appendTerminalOutputChunk(history, ' two');
  assert.deepEqual(updated.at(-1), { type: 'output', text: 'one two', streaming: true });

  assert.deepEqual(finishTerminalStream(updated).at(-1), { type: 'output', text: 'one two' });
});

test('splitTerminalLinks extracts clickable urls from terminal text', () => {
  assert.deepEqual(splitTerminalLinks('Local: http://localhost:4028.'), [
    { type: 'text', value: 'Local: ' },
    { type: 'link', value: 'http://localhost:4028' },
    { type: 'text', value: '.' },
  ]);

  assert.deepEqual(splitTerminalLinks('no url'), [{ type: 'text', value: 'no url' }]);
});

test('displayFilePath normalizes project-relative paths', () => {
  assert.equal(
    displayFilePath({
      currentDir: 'C:\\repo',
      file: { path: 'C:\\repo\\src\\App.jsx' },
      projectName: 'Octopus',
    }),
    'Octopus › src › App.jsx',
  );
});

test('displayFilePath falls back to active file when no file is selected', () => {
  assert.equal(displayFilePath({ activeFile: 'README.md' }), 'README.md');
});

test('editor language and binary detection classify opened files', () => {
  assert.equal(getEditorLanguage('src/App.jsx'), 'javascript');
  assert.equal(getEditorLanguage('schema.prisma'), 'plaintext');
  assert.equal(isBinaryEditorFile('dev.db'), true);
  assert.equal(isBinaryEditorFile('README.md'), false);
});

test('solarized uses a matching Monaco editor theme', () => {
  assert.equal(THEMES.solarized.editorTheme, 'octopus-solarized');
});

test('bidi text helpers preserve mixed Arabic and English rendering intent', () => {
  assert.equal(getTextDirection('hello src/App.jsx'), 'ltr');
  assert.equal(getTextDirection('افتح src/App.jsx'), 'rtl');
  assert.equal(bidiPlainTextStyle().unicodeBidi, 'plaintext');
  assert.equal(bidiIsolateStyle().unicodeBidi, 'isolate');
  assert.equal(codeTextStyle().direction, 'ltr');
});
