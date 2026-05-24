import test from 'node:test';
import assert from 'node:assert/strict';
import { finishLeg, resetLegState, startLeg } from './legState.js';
import { buildOpenFilesContext, isComplexOctopusTask } from './octopusPromptContext.js';
import { detectRunCommand } from './projectRunCommand.js';
import { addRecentProject, getFolderName } from './recentProjects.js';

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
