const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createTaggedFileSaver } = require('./taggedFileService');
const { isSensitiveFile, writeProjectFile } = require('./fileService');

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-tagged-files-'));
}

test('saveTaggedFiles writes regular file tags and skips protected files', async () => {
  const projectDir = makeTempProject();
  const savedTodoUpdates = [];
  const hookCalls = [];
  const saveTaggedFiles = createTaggedFileSaver({
    appendTodoUpdate: update => savedTodoUpdates.push(update),
    ensureProjectMap: () => {},
    executeHook: (_hook, data) => hookCalls.push(data),
    isSensitiveFile,
    writeProjectFile,
  });

  const result = await saveTaggedFiles([
    '<file path="src/hello.txt">hello</file>',
    '<file path="package.json">{"bad":true}</file>',
  ].join('\n'), projectDir);

  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'hello.txt');
  assert.equal(fs.readFileSync(path.join(projectDir, 'src/hello.txt'), 'utf8'), 'hello');
  assert.equal(fs.existsSync(path.join(projectDir, 'package.json')), false);
  assert.equal(savedTodoUpdates.length, 1);
  assert.equal(hookCalls.length, 1);
});
