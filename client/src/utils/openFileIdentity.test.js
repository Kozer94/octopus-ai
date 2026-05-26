import test from 'node:test';
import assert from 'node:assert/strict';
import { getOpenFileId, isOpenFileActive } from './openFileIdentity.js';

test('getOpenFileId prefers path over duplicate file names', () => {
  assert.equal(getOpenFileId({ name: 'index.js', path: 'src/index.js' }), 'src/index.js');
  assert.equal(getOpenFileId({ name: 'scratch.js' }), 'scratch.js');
  assert.equal(getOpenFileId(null), '');
});

test('isOpenFileActive matches the stable open file id', () => {
  const file = { name: 'index.js', path: 'src/index.js' };

  assert.equal(isOpenFileActive(file, 'src/index.js'), true);
  assert.equal(isOpenFileActive(file, 'index.js'), false);
});
