import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDuration,
  getEventDurationMs,
  getEventFilePath,
} from './eventTimeline.js';

test('getEventDurationMs matches finished events to their started pair', () => {
  const events = [
    { id: 1, type: 'terminal.command.started', timestamp: '2026-05-25T00:00:00.000Z' },
    { id: 2, type: 'terminal.command.finished', timestamp: '2026-05-25T00:00:01.250Z' },
  ];

  assert.equal(getEventDurationMs(events[1], events), 1250);
  assert.equal(formatDuration(1250), '1.3s');
});

test('getEventFilePath reads linked file payload fields', () => {
  assert.equal(getEventFilePath({ payload: { filePath: 'src/App.jsx' } }), 'src/App.jsx');
  assert.equal(getEventFilePath({ payload: { newPath: 'src/New.jsx' } }), 'src/New.jsx');
  assert.equal(getEventFilePath({ payload: {} }), '');
});
