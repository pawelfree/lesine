import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readResponseLimited } from './import-jobs.js';

test('response reader caps bytes before retaining an oversized provider body', async () => {
  let pulls = 0;
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(65_536));
    },
    cancel() { canceled = true; },
  });
  await assert.rejects(() => readResponseLimited(new Response(body), 'invalid_action_payload'),
    /invalid_action_payload/);
  assert.equal(canceled, true);
  assert.ok(pulls < 100, 'oversized response should stop before the whole body is read');
  assert.equal(await readResponseLimited(new Response('[]'), 'invalid_action_payload'), '[]');
});
