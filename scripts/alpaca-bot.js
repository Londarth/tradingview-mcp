import dotenv from 'dotenv';
dotenv.config();

import Alpaca from '@alpacahq/alpaca-trade-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  sendTelegram, tgTradeSignal, tgDryRunSignal, tgBreakout,
  tgMorningBrief, tgEODSummary, tgError, tgStartup, tgShutdown,
  telegramEnabled
} from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'alpaca-config.json'), 'utf8'));
const DRY_RUN = config.dryRun ?? true;

// ─── Alpaca client ───
const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: process.env.ALPACA_PAPER !== 'false',
  feed: 'iex',
});

const IS_PAPER = process.env.ALPACA_PAPER !== 'false';
const LOG_FILE = path.join(__dirname, 'trade-log.json');

// ─── Normalize bar field names (Alpaca v2 uses OpenPrice etc.) ───
function norm(bar) {
  return {
    Open: bar.OpenPrice ?? bar.Open,
    High: bar.HighPrice ?? bar.High,
    Low: bar.LowPrice ?? bar.Low,
    Close: bar.ClosePrice ?? bar.Close,
    Volume: bar.Volume ?? bar.Volume,
    VWAP: bar.VWAP ?? bar.VWAP,
    Symbol: bar.Symbol ?? bar.Symbol,
  };
}

// ─── State per symbol ───
const state = {};
for (const sym of config.symbols) {
  state[sym] = {
    bars: [],
    volumeHistory: [],
    openingRange: null,
    brokeAbove: false,
    brokeBelow: false,
    longReady: false,
    shortReady: false,
    tradesToday: 0,
    dailyATR: null,
    lastTradeDate: null,
  };
}

let tradeLog = [];
if (fs.existsSync(LOG_FILE)) {
  try { tradeLog = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch {}
}

// ─── Helpers ───
const log = (msg, type = 'info') => {
  const ts = new Date().toISOString();
  const prefix = { info: 'ℹ️ ', trade: '📊', signal: '🔔', error: '❌', win: '✅', loss: '🛑' }[type] || '  ';
  console.log(`${prefix} [${ts}] ${msg}`);
  tradeLog.push({ ts, type, msg });
  if (tradeLog.length > 5000) tradeLog = tradeLog.slice(-3000);
};

const saveLog = () => fs.writeFileSync(LOG_FILE, JSON.stringify(tradeLog, null, 2));

function getNYTime() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function isMarketHours() {
  const ny = getNYTime();
  const hhmm = ny.getHours() * 100 + ny.getMinutes();
  const [sh, sm] = config.strategy.sessionStart.split(':').map(Number);
  const [eh, em] = config.strategy.sessionEnd.split(':').map(Number);
  return hhmm >= sh * 100 + sm && hhmm < eh * 100 + em;
}

function isNewDay(sym) {
  const ny = getNYTime();
  const today = ny.toDateString();
  if (state[sym].lastTradeDate !== today) {
    state[sym].lastTradeDate = today;
    return true;
  }
  return false;
}

// ─── ATR calculation ───
function calcATR(bars, period) {
  if (bars.length < period + 1) return null;
  let atr = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const h = bars[i].HighPrice ?? bars[i].High;
    const l = bars[i].LowPrice ?? bars[i].Low;
    const c = bars[i].ClosePrice ?? bars[i].Close;
    const pc = bars[i - 1].ClosePrice ?? bars[i - 1].Close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    atr += tr;
  }
  return atr / period;
}

// ─── RVOL calculation ───
function calcRVOL(sym) {
  const s = state[sym];
  const len = config.strategy.rvolLength;
  if (s.volumeHistory.length < len) return 0;
  const avg = s.volumeHistory.slice(-len).reduce((a, b) => a + b, 0) / len;
  const current = s.volumeHistory[s.volumeHistory.length - 1];
  return avg > 0 ? current / avg : 0;
}

// ─── Reset daily state ───
function resetDailyState(sym) {
  const s = state[sym];
  s.openingRange = null;
  s.brokeAbove = false;
  s.brokeBelow = false;
  s.longReady = false;
  s.shortReady = false;
  s.tradesToday = 0;
  log(`${sym}: New session — state reset`, 'info');
}

// ─── Process bar ───
function processBar(sym, bar) {
  const s = state[sym];
  const ny = getNYTime();
  const hhmm = ny.getHours() * 100 + ny.getMinutes();
  const [sh, sm] = config.strategy.sessionStart.split(':').map(Number);
  const [eh, em] = config.strategy.sessionEnd.split(':').map(Number);
  const sessionStart = sh * 100 + sm;
  const sessionEnd = eh * 100 + em;

  // Track volume for RVOL
  s.volumeHistory.push(bar.Volume);
  if (s.volumeHistory.length > 50) s.volumeHistory.shift();

  // Reset if new day
  if (isNewDay(sym)) resetDailyState(sym);

  // Only trade during session
  if (hhmm < sessionStart || hhmm >= sessionEnd) {
    // Auto-close at session end
    if (hhmm >= sessionEnd && s.tradesToday > 0) {
      closeAllPositions(sym, 'Session end');
    }
    return;
  }

  // ── Opening range: first 3 bars (15 min) ──
  const barIndex = hhmm - sessionStart; // rough bar count
  const openingBars = config.strategy.openingBars;

  if (s.openingRange === null) {
    // First bar of session
    s.openingRange = { high: bar.High, low: bar.Low, open: bar.Open, barCount: 1 };
  } else if (s.openingRange.barCount < openingBars) {
    // Accumulate opening range
    s.openingRange.high = Math.max(s.openingRange.high, bar.High);
    s.openingRange.low = Math.min(s.openingRange.low, bar.Low);
    s.openingRange.barCount++;
  }

  // Wait for opening range to complete
  if (s.openingRange.barCount < openingBars) return;

  const range = s.openingRange;
  const rangeSize = range.high - range.low;
  const rangePct = (rangeSize / bar.Close) * 100;

  // ── Filters ──
  const dailyATR = s.dailyATR || calcATR(s.bars, config.strategy.atrPeriod) || rangeSize;
  s.dailyATR = dailyATR;
  const atrPct = (rangeSize / dailyATR) * 100;

  if (config.strategy.useAtrFilter && atrPct < config.strategy.atrPctThreshold) return;
  if (config.strategy.useRangeFilter && (rangePct < config.strategy.minRangePct || rangePct > config.strategy.maxRangePct)) return;

  const rvol = calcRVOL(sym);
  if (config.strategy.useRvolFilter && rvol < config.strategy.rvolThreshold) return;

  // ── VWAP (from Alpaca bar if available, otherwise close) ──
  const vwap = bar.VWAP || bar.Close;
  // In production, you'd calculate cumulative (H+L+C)/3 * Volume / cumulative Volume

  // ── Breakout detection ──
  if (s.tradesToday >= config.risk.maxTradesPerDay) return;

  if (!s.brokeAbove && bar.Close > range.high) {
    s.brokeAbove = true;
    s.longReady = true;
    log(`${sym}: BREAKOUT ABOVE ${range.high.toFixed(2)} (ATR%: ${atrPct.toFixed(1)}, RVOL: ${rvol.toFixed(2)})`, 'signal');
    tgBreakout(sym, 'above', range.high, atrPct, rvol);
  }
  if (!s.brokeBelow && bar.Close < range.low) {
    s.brokeBelow = true;
    s.shortReady = true;
    log(`${sym}: BREAKOUT BELOW ${range.low.toFixed(2)} (ATR%: ${atrPct.toFixed(1)}, RVOL: ${rvol.toFixed(2)})`, 'signal');
    tgBreakout(sym, 'below', range.low, atrPct, rvol);
  }

  // ── Retest entry ──
  const wickRatio = (Math.min(bar.Open, bar.Close) - bar.Low) / (bar.High - bar.Low || 1);
  const invWickRatio = (bar.High - Math.max(bar.Open, bar.Close)) / (bar.High - bar.Low || 1);
  const minWick = config.strategy.wickConfirmMinRatio;
  const atr5m = calcATR(s.bars, 14) || rangeSize / 3;

  // Long entry
  if (s.longReady && bar.Low <= range.high && bar.Close > range.high && bar.Close > vwap) {
    const bullConfirm = bar.Close > bar.Open && (wickRatio >= minWick || bar.Close > bar.Open);
    if (bullConfirm) {
      const stop = range.low - atr5m * config.strategy.stopAtrMultiplier;
      const target = range.high + rangeSize * config.strategy.targetRiskReward;
      placeTrade(sym, 'long', bar.Close, stop, target, range);
    }
  }

  // Short entry
  if (s.shortReady && bar.High >= range.low && bar.Close < range.low && bar.Close < vwap) {
    const bearConfirm = bar.Close < bar.Open && (invWickRatio >= minWick || bar.Close < bar.Open);
    if (bearConfirm) {
      const stop = range.high + atr5m * config.strategy.stopAtrMultiplier;
      const target = range.low - rangeSize * config.strategy.targetRiskReward;
      placeTrade(sym, 'short', bar.Close, stop, target, range);
    }
  }
}

// ─── Place trade ───
async function placeTrade(sym, side, price, stop, target, range) {
  const s = state[sym];
  if (s.tradesToday >= config.risk.maxTradesPerDay) return;

  const direction = side === 'long' ? 'buy' : 'sell';
  const opposite = side === 'long' ? 'sell' : 'buy';

  // Calculate position size
  let qty;
  try {
    const acct = await alpaca.getAccount();
    const buyingPower = parseFloat(acct.buying_power);
    const positionValue = buyingPower * (config.risk.positionSizePct / 100);
    qty = Math.max(1, Math.floor(positionValue / price));

    if (DRY_RUN) {
      const rr = side === 'long' ? (target - price) / (price - stop) : (price - target) / (stop - price);
      log(`${sym} ${side.toUpperCase()} signal: qty=${qty} @ $${price.toFixed(2)} | SL=$${stop.toFixed(2)} TP=$${target.toFixed(2)} | R:R=${rr.toFixed(1)} | DRY RUN — no order placed`, 'trade');
      tgDryRunSignal(sym, side, price, stop, target, rr, qty);
      s.longReady = false;
      s.shortReady = false;
      saveLog();
      return;
    }

    const order = await alpaca.createOrder({
      symbol: sym,
      qty,
      side: direction,
      type: 'market',
      time_in_force: 'day',
      order_class: 'bracket',
      stop_loss: { stop_price: stop.toFixed(2) },
      take_profit: { limit_price: target.toFixed(2) },
    });

    log(`${sym} ${side.toUpperCase()}: qty=${qty} @ market | SL=$${stop.toFixed(2)} TP=$${target.toFixed(2)} | Order: ${order.id}`, 'trade');
    const rr = side === 'long' ? (target - price) / (price - stop) : (price - target) / (stop - price);
    tgTradeSignal(sym, side, price, stop, target, rr, qty);
    s.tradesToday++;
    s.longReady = false;
    s.shortReady = false;
    saveLog();
  } catch (err) {
    log(`${sym} ORDER ERROR: ${err.message}`, 'error');
    tgError(`${sym} order failed: ${err.message}`);
  }
}

// ─── Close all positions ───
async function closeAllPositions(sym, reason) {
  try {
    if (DRY_RUN) {
      log(`${sym}: ${reason} — DRY RUN, no close executed`, 'info');
      return;
    }
    const pos = await alpaca.getPosition(sym).catch(() => null);
    if (pos && parseFloat(pos.qty) > 0) {
      await alpaca.createOrder({
        symbol: sym,
        qty: pos.qty,
        side: pos.side === 'long' ? 'sell' : 'buy',
        type: 'market',
        time_in_force: 'day',
      });
      log(`${sym}: Closed position (${reason})`, 'trade');
    }
  } catch (err) {
    log(`${sym} CLOSE ERROR: ${err.message}`, 'error');
  }
}

// ─── Fetch daily ATR via REST ───
async function fetchDailyATR(sym) {
  try {
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${sym}&timeframe=1Day&start=${start}&end=${end}&limit=21&feed=iex`;
    const resp = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
      },
    });
    const data = await resp.json();
    const rawBars = data.bars?.[sym] || [];
    const arr = rawBars.map(b => ({ High: b.h, Low: b.l, Close: b.c }));
    if (arr.length < 2) {
      log(`${sym}: Not enough daily bars for ATR (${arr.length}), using fallback`, 'info');
      return;
    }
    state[sym].dailyATR = calcATR(arr, config.strategy.atrPeriod);
    state[sym].lastPrice = arr.length > 0 ? arr[arr.length - 1].Close : null;
    log(`${sym}: Daily ATR = $${state[sym].dailyATR?.toFixed(2) ?? 'N/A'}`, 'info');
  } catch (err) {
    log(`${sym} ATR fetch error: ${err.message}`, 'error');
  }
}

// ─── Main loop ───
async function main() {
  log('═'.repeat(60), 'info');
  log(`One Candle Scalp v2 Bot — ${IS_PAPER ? 'PAPER' : 'LIVE'} — DRY_RUN=${DRY_RUN}`, 'info');
  log(`Symbols: ${config.symbols.join(', ')}`, 'info');
  log(`Session: ${config.strategy.sessionStart}–${config.strategy.sessionEnd} ET`, 'info');
  log(`Telegram: ${telegramEnabled() ? 'ON' : 'OFF'}`, 'info');
  log('═'.repeat(60), 'info');
  await tgStartup(`${IS_PAPER ? 'PAPER' : 'LIVE'}${DRY_RUN ? ' (DRY RUN)' : ''}`, config.symbols);

  // Verify connection
  try {
    const acct = await alpaca.getAccount();
    log(`Connected: $${parseFloat(acct.cash).toFixed(2)} cash | $${parseFloat(acct.portfolio_value).toFixed(2)} portfolio | ${acct.status}`, 'info');
  } catch (err) {
    log(`FATAL: Cannot connect to Alpaca — ${err.message}`, 'error');
    tgError(`Cannot connect to Alpaca: ${err.message}`);
    process.exit(1);
  }

  // Fetch daily ATR for each symbol
  for (const sym of config.symbols) {
    await fetchDailyATR(sym);
  }

  // Subscribe to 5-minute bars
  const conn = alpaca.data_stream_v2;
  conn.onConnect(() => {
    log('Data stream connected', 'info');
    conn.subscribeForBars(config.symbols.map(s => s));
  });

  conn.onStockBar((bar) => {
    const b = norm(bar);
    const sym = b.Symbol;
    if (!state[sym]) return;
    state[sym].bars.push(b);
    if (state[sym].bars.length > 200) state[sym].bars.shift();
    processBar(sym, b);
  });

  conn.onError((err) => log(`Stream error: ${err.message || err}`, 'error'));
  conn.onStateChange((s) => log(`Stream state: ${s}`, 'info'));

  // Morning brief (send once at startup)
  const briefData = config.symbols.map(sym => ({
    symbol: sym,
    atr: state[sym].dailyATR,
    lastPrice: state[sym].lastPrice,
  }));
  await tgMorningBrief(briefData);
  setInterval(() => {
    const ny = getNYTime();
    const hhmm = ny.getHours() * 100 + ny.getMinutes();
    if (hhmm >= 1100 && hhmm < 1105) {
      for (const sym of config.symbols) {
        closeAllPositions(sym, 'Session end (11:00 ET)');
      }
    }
  }, 60000);

  // Save log every 5 minutes
  setInterval(saveLog, 300000);

  conn.connect();
}

main().catch(err => {
  log(`FATAL: ${err.message}`, 'error');
  saveLog();
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  log('Shutting down...', 'info');
  await tgShutdown();
  saveLog();
  process.exit(0);
});