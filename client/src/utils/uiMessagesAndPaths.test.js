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
import { splitTerminalLinks } from './terminalLinks.js';
import {
  TERMINAL_READY_ENTRY,
  terminalApprovalEntry,
  terminalErrorEntry,
  terminalInputEntry,
  terminalOutputEntry,
  terminalResultEntry,
  terminalRunEntry,
  terminalSkippedEntry,
  terminalSystemEntry,
} from './terminalHistory.js';

test('chat message helpers keep role and text shape stable', () => {
  assert.equal(INITIAL_CHAT_MESSAGES[0].role, 'octopus');
  assert.deepEqual(userMessage('hello'), { role: 'user', text: 'hello' });
  assert.deepEqual(octopusMessage('done'), { role: 'octopus', text: 'done' });
  assert.deepEqual(octopusErrorMessage('bad'), { role: 'octopus', text: 'Error: bad' });
  assert.deepEqual(octopusScanErrorMessage('scan bad'), { role: 'octopus', text: 'Scan error: scan bad' });
  assert.equal(OCTOPUS_BUSY_MESSAGE.role, 'octopus');
});

test('terminal history helpers preserve entry types', () => {
  assert.deepEqual(TERMINAL_READY_ENTRY, { type: 'system', text: '🐙 Terminal ready' });
  assert.deepEqual(terminalInputEntry('npm test'), { type: 'input', text: '$ npm test' });
  assert.deepEqual(terminalResultEntry({ success: true, output: 'ok' }), { type: 'output', text: 'ok' });
  assert.deepEqual(terminalResultEntry({ success: false, error: 'bad' }), { type: 'error', text: 'bad' });
  assert.deepEqual(terminalOutputEntry('stdout'), { type: 'output', text: 'stdout' });
  assert.deepEqual(terminalSystemEntry('system'), { type: 'system', text: 'system' });
  assert.deepEqual(terminalErrorEntry('bad'), { type: 'error', text: '⚠️ bad' });
  assert.deepEqual(terminalRunEntry('npm run dev'), { type: 'system', text: '🚀 Running: npm run dev' });
  assert.deepEqual(terminalApprovalEntry('npm test'), { type: 'system', text: 'Approval required: npm test' });
  assert.deepEqual(terminalSkippedEntry('npm test'), { type: 'system', text: 'Skipped: npm test' });
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
