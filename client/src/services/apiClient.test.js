import test from 'node:test';
import assert from 'node:assert/strict';
import { postEventStream } from './apiClient.js';

function makeStreamResponse(chunks, init = {}) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    ...init,
  });
}

test('postEventStream rejects required streams that close before complete', async () => {
  globalThis.localStorage = { getItem: () => '' };
  globalThis.fetch = async () => makeStreamResponse([
    'event: leg_update\ndata: {"legId":1,"status":"working"}\n\n',
  ]);

  await assert.rejects(
    postEventStream('/stream', {}, { requireComplete: true }),
    /disconnected before completion/,
  );
});

test('postEventStream resolves complete payload when complete event arrives', async () => {
  globalThis.localStorage = { getItem: () => '' };
  globalThis.fetch = async () => makeStreamResponse([
    'event: complete\ndata: {"success":true,"result":"done"}\n\n',
  ]);

  const result = await postEventStream('/stream', {}, { requireComplete: true });
  assert.deepEqual(result, { success: true, result: 'done' });
});
