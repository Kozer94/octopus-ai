const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  END_MARKER,
  START_MARKER,
  appendTodoUpdate,
  buildTodoEntry,
  shouldSkipTodoLog,
  upsertAutoTodoSection,
} = require('./todoLogService');

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'octopus-todo-log-'));
}

test('buildTodoEntry formats a stable markdown line', () => {
  const projectRoot = makeTempProject();
  const entry = buildTodoEntry({
    projectRoot,
    filePath: path.join(projectRoot, 'src/app.js'),
    action: 'write',
    source: 'editor',
    details: 'saved from UI',
    now: new Date('2026-05-25T10:20:30.000Z'),
  });

  assert.equal(entry, '- [2026-05-25 10:20:30 UTC] editor:write `src/app.js` - saved from UI');
});

test('upsertAutoTodoSection creates and appends inside the managed section', () => {
  const first = upsertAutoTodoSection('# TODO\n', '- one');
  assert.equal(first.includes(START_MARKER), true);
  assert.equal(first.includes(END_MARKER), true);
  assert.equal(first.includes('- one'), true);

  const second = upsertAutoTodoSection(first, '- two');
  assert.equal(second.includes('- one'), true);
  assert.equal(second.includes('- two'), true);
  assert.equal((second.match(new RegExp(START_MARKER, 'g')) || []).length, 1);
});

test('appendTodoUpdate writes TODO.md in the project root', () => {
  const projectRoot = makeTempProject();
  fs.writeFileSync(path.join(projectRoot, 'TODO.md'), '# Existing TODO\n');

  const result = appendTodoUpdate({
    projectRoot,
    filePath: path.join(projectRoot, 'server/index.js'),
    action: 'write',
    source: 'ai',
    now: new Date('2026-05-25T10:20:30.000Z'),
  });

  const content = fs.readFileSync(result.path, 'utf8');
  assert.equal(content.includes('ai:write `server/index.js`'), true);
});

test('shouldSkipTodoLog skips TODO.md and env-disabled logging', () => {
  const projectRoot = makeTempProject();
  assert.equal(shouldSkipTodoLog(projectRoot, path.join(projectRoot, 'TODO.md')), true);

  const oldValue = process.env.OCTOPUS_AUTO_TODO;
  process.env.OCTOPUS_AUTO_TODO = '0';
  try {
    assert.equal(shouldSkipTodoLog(projectRoot, path.join(projectRoot, 'src/app.js')), true);
  } finally {
    if (oldValue === undefined) delete process.env.OCTOPUS_AUTO_TODO;
    else process.env.OCTOPUS_AUTO_TODO = oldValue;
  }
});
