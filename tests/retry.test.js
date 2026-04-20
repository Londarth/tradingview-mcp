// tests/retry.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { retry } from '../scripts/lib/retry.js';

describe('retry', () => {
  it('returns result on first successful call', async () => {
    const result = await retry(() => Promise.resolve(42));
    assert.equal(result, 42);
  });

  it('retries on failure and succeeds on second attempt', async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      if (calls === 1) throw new Error('transient');
      return Promise.resolve('ok');
    };
    const result = await retry(fn, { maxRetries: 3, baseDelay: 10 });
    assert.equal(result, 'ok');
    assert.equal(calls, 2);
  });

  it('throws after exhausting retries', async () => {
    let calls = 0;
    const fn = () => {
      calls++;
      throw new Error('persistent');
    };
    await assert.rejects(
      () => retry(fn, { maxRetries: 2, baseDelay: 10 }),
      { message: 'persistent' }
    );
    assert.equal(calls, 3); // initial + 2 retries
  });

  it('uses default options when none provided', async () => {
    const result = await retry(() => Promise.resolve('default'));
    assert.equal(result, 'default');
  });
});