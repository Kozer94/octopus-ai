import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSavedFileDisplayName,
  getSavedFileReadPath,
  getTerminalCommandsFromResponse,
  splitSavedFiles,
} from './octopusResponse.js';

test('getTerminalCommandsFromResponse combines explicit and tagged commands', () => {
  assert.deepEqual(
    getTerminalCommandsFromResponse({
      terminalCommand: 'npm test',
      result: 'done <terminal>npm run build</terminal>',
    }),
    ['npm test', 'npm run build'],
  );
});

test('splitSavedFiles separates reviewable files from files to open', () => {
  const review = { path: 'a.js', oldContent: 'old', newContent: 'new' };
  const opened = { path: 'b.js' };

  assert.deepEqual(splitSavedFiles([review, opened]), {
    filesForReview: [review],
    filesToOpen: [opened],
  });
});

test('saved file helpers prefer relative path and explicit name', () => {
  const file = { name: 'shown.js', path: 'src/fallback.js', relativePath: 'src/read.js' };

  assert.equal(getSavedFileReadPath(file), 'src/read.js');
  assert.equal(getSavedFileDisplayName(file, 'src/read.js'), 'shown.js');
});

test('getSavedFileDisplayName falls back to basename', () => {
  assert.equal(getSavedFileDisplayName({}, 'src/read.js'), 'read.js');
});
