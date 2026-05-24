import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertAcceptedDiffFile, upsertFileByName, upsertFileByPathOrName, upsertOpenedFile } from './openFilesState.js';

test('upsertOpenedFile updates an existing file by path', () => {
  const files = [{ name: 'a.js', path: '/tmp/a.js', content: 'old' }];

  assert.deepEqual(
    upsertOpenedFile(files, { name: 'a.js', path: '/tmp/a.js' }, 'new'),
    [{ name: 'a.js', path: '/tmp/a.js', content: 'new' }],
  );
});

test('upsertFileByName adds missing file by name', () => {
  assert.deepEqual(
    upsertFileByName([], 'new.js', 'content'),
    [{ name: 'new.js', content: 'content' }],
  );
});

test('upsertFileByPathOrName updates matching file', () => {
  const files = [{ name: 'old.js', path: '/tmp/file.js', content: 'old' }];

  assert.deepEqual(
    upsertFileByPathOrName(files, { name: 'new.js', path: '/tmp/file.js', content: 'new' }),
    [{ name: 'new.js', path: '/tmp/file.js', content: 'new' }],
  );
});

test('upsertAcceptedDiffFile stores accepted diff content', () => {
  const diffFile = { path: '/tmp/a.js', newContent: 'new' };

  assert.deepEqual(
    upsertAcceptedDiffFile([], diffFile, 'a.js'),
    [{ name: 'a.js', path: '/tmp/a.js', content: 'new' }],
  );
});
