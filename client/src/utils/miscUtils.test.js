import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLegUpdates, finishLeg, resetLegState, startLeg } from './legState.js';
import { buildOpenFilesContext, isComplexOctopusTask } from './octopusPromptContext.js';
import { detectRunCommand } from './projectRunCommand.js';
import { flattenVisibleFileTree, getVirtualWindow } from './fileTreeView.js';
import { clampPanelWidth, getViewportBoundedPanelMax } from './panelResize.js';
import { addRecentProject, getFolderName } from './recentProjects.js';
import { createSessionId } from '../config/uiConfig.js';

test('detectRunCommand detects Laravel and Python projects', () => {
  assert.equal(detectRunCommand([{ name: 'artisan' }]), 'php artisan serve');
  assert.equal(detectRunCommand([{ name: 'manage.py' }]), 'python manage.py runserver');
  assert.equal(detectRunCommand([{ name: 'package.json' }]), 'npm run dev');
});

test('recent project helpers parse and dedupe projects', () => {
  assert.equal(getFolderName('C:\\Users\\demo\\project'), 'project');

  const projects = [{ name: 'project', path: 'C:\\Users\\demo\\project' }];
  assert.equal(addRecentProject(projects, projects[0]), projects);
  assert.deepEqual(addRecentProject(projects, { name: 'next', path: '/tmp/next' }), [...projects, { name: 'next', path: '/tmp/next' }]);
});

test('session ids are created lazily and reused per browser session', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };

  const first = createSessionId({ storage, now: () => 123 });
  const second = createSessionId({ storage, now: () => 456 });

  assert.match(first, /^session_123_/);
  assert.equal(second, first);
});

test('octopus prompt helpers build bounded context and detect complex tasks', () => {
  const files = [
    { name: 'a.js', content: 'a'.repeat(600) },
    { name: 'empty.js', content: '' },
  ];

  const context = buildOpenFilesContext(files);
  assert.match(context, /### a\.js/);
  assert.equal(context.includes('empty.js'), false);
  assert.equal(isComplexOctopusTask('report'), true);
  assert.equal(isComplexOctopusTask('short'), false);
});

test('leg state helpers update a single leg', () => {
  const legs = [{ id: 1, status: 'idle', progress: 0 }, { id: 2, status: 'idle', progress: 0 }];

  assert.deepEqual(startLeg(legs, 1, 'work')[0], { id: 1, status: 'working', progress: 0, task: 'work' });
  assert.deepEqual(finishLeg(legs, 2)[1], { id: 2, status: 'done', progress: 100 });
  assert.ok(Array.isArray(resetLegState()));
});

test('applyLegUpdates coalesces streamed leg updates in one state pass', () => {
  const legs = [
    { id: 1, status: 'idle', task: 'Waiting...', progress: 0 },
    { id: 2, status: 'working', task: 'Reviewing', progress: 20 },
  ];

  const updated = applyLegUpdates(legs, [
    { legId: 1, status: 'working', task: 'Writing' },
    { legId: 1, status: 'done' },
    { legId: 2, status: 'error', error: 'failed' },
  ]);

  assert.deepEqual(updated, [
    { id: 1, status: 'done', task: 'Writing', progress: 100 },
    { id: 2, status: 'error', task: 'failed', progress: 100 },
  ]);
  assert.equal(applyLegUpdates(updated, []), updated);
});

test('file tree view flattens only expanded folders and calculates a virtual window', () => {
  const tree = [
    {
      name: 'src',
      path: '/repo/src',
      type: 'dir',
      children: [
        { name: 'App.jsx', path: '/repo/src/App.jsx', type: 'file' },
        { name: 'lib', path: '/repo/src/lib', type: 'dir', children: [
          { name: 'x.js', path: '/repo/src/lib/x.js', type: 'file' },
        ] },
      ],
    },
    { name: 'package.json', path: '/repo/package.json', type: 'file' },
  ];

  assert.deepEqual(
    flattenVisibleFileTree(tree, new Set()).map(row => row.item.name),
    ['src', 'package.json'],
  );

  assert.deepEqual(
    flattenVisibleFileTree(tree, new Set(['/repo/src'])).map(row => row.item.name),
    ['src', 'App.jsx', 'lib', 'package.json'],
  );

  assert.deepEqual(
    getVirtualWindow({ rowCount: 100, rowHeight: 20, scrollTop: 200, viewportHeight: 60, overscan: 1 }),
    { start: 9, end: 14, offsetY: 180 },
  );
});

test('panel resize helpers preserve a minimum editor viewport', () => {
  assert.equal(clampPanelWidth(600, { minWidth: 150, maxWidth: 350 }), 350);
  assert.equal(clampPanelWidth(100, { minWidth: 150, maxWidth: 350 }), 150);
  assert.equal(
    getViewportBoundedPanelMax({
      maxWidth: 520,
      minEditorWidth: 300,
      otherPanelOpen: true,
      otherPanelWidth: 350,
      reservedWidth: 86,
      viewportWidth: 900,
    }),
    164,
  );
});
