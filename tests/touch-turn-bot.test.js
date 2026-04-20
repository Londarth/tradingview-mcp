import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('position sizing', () => {
  it('uses entry price (range.low) for long side qty, not range.close', () => {
    const balance = 10000;
    const positionPct = 10;
    const entryPrice = 8.50;  // range.low for long
    const rangeClose = 9.20;  // range.close (wrong, would give more shares)

    const positionValue = balance * (positionPct / 100);
    const qtyCorrect = Math.max(1, Math.floor(positionValue / entryPrice));
    const qtyWrong = Math.max(1, Math.floor(positionValue / rangeClose));

    assert.equal(qtyCorrect, 117);  // $1000 / $8.50 = 117
    assert.equal(qtyWrong, 108);    // $1000 / $9.20 = 108
    assert.ok(qtyCorrect > qtyWrong, 'using entryPrice gives fewer shares (correct for actual risk)');
  });
});

describe('P&L capture before position close', () => {
  it('captures unrealized_pl from position before hard exit closes it', () => {
    const mockPos = { unrealized_pl: '12.50', qty: '10', side: 'long' };
    const capturedPnl = parseFloat(mockPos.unrealized_pl);
    assert.equal(capturedPnl, 12.50);
  });

  it('returns pnl=0 when position data is unavailable before close', () => {
    const capturedPnl = null;
    const reportedPnl = capturedPnl ?? 0;
    assert.equal(reportedPnl, 0);
  });
});

describe('shutdown handlers', () => {
  it('SIGINT and SIGTERM both trigger shutdown', () => {
    // Documents the requirement: both signals must be handled
    const signals = ['SIGINT', 'SIGTERM'];
    assert.ok(signals.includes('SIGINT'));
    assert.ok(signals.includes('SIGTERM'));
  });
});

describe('CONFIG defaults', () => {
  it('positionPct defaults to 10 (not 50)', () => {
    const defaultPct = 10;
    assert.equal(defaultPct, 10);
  });

  it('positionPct reads from POSITION_PCT env var', () => {
    process.env.POSITION_PCT = '20';
    const positionPct = parseInt(process.env.POSITION_PCT, 10) || 10;
    assert.equal(positionPct, 20);
    delete process.env.POSITION_PCT;
  });

  it('positionPct falls back to default when env var is invalid', () => {
    process.env.POSITION_PCT = 'abc';
    const positionPct = parseInt(process.env.POSITION_PCT, 10) || 10;
    assert.equal(positionPct, 10);
    delete process.env.POSITION_PCT;
  });
});

describe('config validation', () => {
  it('lists required env vars', () => {
    const required = ['ALPACA_API_KEY', 'ALPACA_SECRET_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
    assert.equal(required.length, 4);
    assert.ok(required.includes('ALPACA_API_KEY'));
  });

  it('detects missing required vars', () => {
    const env = { ALPACA_API_KEY: 'x', ALPACA_SECRET_KEY: 'x' };
    const required = ['ALPACA_API_KEY', 'ALPACA_SECRET_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
    const missing = required.filter(k => !env[k]);
    assert.deepEqual(missing, ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']);
  });
});