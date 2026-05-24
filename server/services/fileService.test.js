const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  deleteProjectFile,
  listProjectFiles,
  readProjectFile,
  renameProjectFile,
  writeProjectFile,
} = require('./fileService');

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-file-service-'));
}

test('writeProjectFile writes normal files inside the project', () => {
  const projectDir = makeTempProject();

  const result = writeProjectFile({
    projectDir,
    filePath: 'src/example.txt',
    content: 'hello',
  });

  assert.equal(fs.readFileSync(result.fullPath, 'utf8'), 'hello');
  assert.equal(result.relativePath, 'src/example.txt');
});

test('readProjectFile blocks sensitive files', () => {
  const projectDir = makeTempProject();
  fs.writeFileSync(path.join(projectDir, '.env'), 'TOKEN=secret');

  assert.throws(
    () => readProjectFile({ projectDir, filePath: '.env' }),
    /حساس/
  );
});

test('writeProjectFile blocks path traversal outside the project', () => {
  const projectDir = makeTempProject();

  assert.throws(
    () => writeProjectFile({
      projectDir,
      filePath: '../outside.txt',
      content: 'nope',
    }),
    /مسار ممنوع/
  );
});

test('writeProjectFile protectCore blocks core files for AI writes', () => {
  const projectDir = makeTempProject();

  assert.throws(
    () => writeProjectFile({
      projectDir,
      filePath: 'package.json',
      content: '{}',
      protectCore: true,
    }),
    /محمي/
  );
});

test('deleteProjectFile deletes normal files and blocks protected files', () => {
  const projectDir = makeTempProject();
  const normalPath = path.join(projectDir, 'note.txt');
  const protectedPath = path.join(projectDir, 'main.js');
  fs.writeFileSync(normalPath, 'delete me');
  fs.writeFileSync(protectedPath, 'protected');

  deleteProjectFile({ projectDir, filePath: 'note.txt' });
  assert.equal(fs.existsSync(normalPath), false);

  assert.throws(
    () => deleteProjectFile({ projectDir, filePath: 'main.js' }),
    /محمي|حساس/
  );
});

test('renameProjectFile rejects nested destination names', () => {
  const projectDir = makeTempProject();
  fs.writeFileSync(path.join(projectDir, 'note.txt'), 'rename me');

  assert.throws(
    () => renameProjectFile({
      projectDir,
      oldPath: 'note.txt',
      newName: '../escape.txt',
    }),
    /غير صالح/
  );
});

test('listProjectFiles hides ignored and sensitive entries', () => {
  const projectDir = makeTempProject();
  fs.mkdirSync(path.join(projectDir, 'node_modules'));
  fs.writeFileSync(path.join(projectDir, 'node_modules', 'hidden.js'), '');
  fs.writeFileSync(path.join(projectDir, '.env'), 'secret');
  fs.writeFileSync(path.join(projectDir, 'visible.txt'), 'ok');

  const result = listProjectFiles(projectDir);
  const names = result.items.map(item => item.name);

  assert.deepEqual(names, ['visible.txt']);
});
