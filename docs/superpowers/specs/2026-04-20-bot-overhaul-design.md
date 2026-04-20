# Touch & Turn Bot Overhaul Design

Layered stabilization: fix critical bugs, harden for production, modernize architecture.

## Layer 1: Fix & Patch

Ship immediately. Fix actively broken things.

### Bug fixes

1. **P&L reporting after hard exit** — Capture position data before closing the position in the hard exit path. Store final P&L in a local variable. Report from that variable instead of re-fetching the (now nonexistent) position from Alpaca.

2. **Position size uses wrong price** — Use `entryPrice` (the limit order price: `range.low` for long, `range.high` for short) instead of `range.close` in the quantity formula. Current code calculates more shares than intended because `range.close` is higher than `range.low` for longs (and lower than `range.high` for shorts).

3. **No SIGTERM handler** — PM2 stops processes via SIGTERM, not SIGINT. Add `process.on('SIGTERM', ...)` that calls the same shutdown logic as the existing SIGINT handler. Without this, PM2 stops kill the bot without saving logs or sending shutdown notifications.

4. **Stale bot name in tgStartup()** — Change "One Candle Scalp Bot" to "Touch & Turn Bot" in `telegram.js` `tgStartup()`.

5. **Hardcoded "Mode: PAPER"** — Read `ALPACA_PAPER` from env and report actual mode in `/start` response from `telegram-ctl.js`.

### Safety defaults

6. **Lower positionPct default** — Change from 50% to 10%. Add env var `POSITION_PCT` to override. Two consecutive losses at 50% = 75% drawdown; at 10% = 19% drawdown.

7. **Add `.env.example`** — Template file documenting all required env vars (`ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ALPACA_PAPER`) and optional ones (`DRY_RUN`, `POSITION_PCT`, plus all strategy params added in Layer 3).

### Cleanup

8. **Remove vestigial `alpaca-config.json` and `readConfig()`** — File is read by `telegram-ctl.js` but the result is never used. Remove both the file and the `readConfig()` function from `telegram-ctl.js` together.

9. **Fix GBP currency symbols** — Change `£` to `$` in `backtest.js` output. Alpaca accounts are USD.

## Layer 2: Harden

Make the bot reliable enough to trust with real money.

### Retry & resilience

1. **Retry/backoff for API calls** — Add `retry(fn, maxRetries=3, baseDelay=1000)` utility with exponential backoff + jitter. Apply to all Alpaca calls (`fetchDailyATRs`, `fetchOpeningRange`, `createOrder`, `getPosition`, `cancelOrder`) and `sendTelegram`. Prevents transient network errors from crashing the bot or losing notifications.

2. **Graceful shutdown** — On SIGINT/SIGTERM, before exit:
   - Cancel all open orders for the current symbol
   - If a position is open and past `hardExit` time, close it with a market order
   - Send the shutdown Telegram message
   - Save the trade log
   - Wait for all async ops to complete before `process.exit`

3. **Config validation on startup** — Check that all required env vars exist. Exit with a clear error message listing missing vars if any are absent.

### Telegram unification

4. **Single `telegram.js` module** — Merge the two `sendTelegram` functions into one: `sendTelegram(text, { parseMode, buttons })`. Remove the duplicate from `telegram-ctl.js`. All message builders (`tgStartup`, `tgSignal`, `tgEod`, `tgShutdown`, `tgError`) remain in `telegram.js`. `telegram-ctl.js` imports from it.

### Periodic log saving

5. **Save trade log every 5 minutes** during monitoring loops. Prevents data loss on ungraceful kills (OOM, `kill -9`, VPS reboot).

## Layer 3: Modernize

Clean architecture for long-term maintainability.

### Config extraction

1. **All strategy params as env vars** — The CONFIG object reads from env with defaults:
   - `UNIVERSE` (comma-separated, default: current hardcoded list)
   - `ATR_PCT_THRESHOLD` (default: 0.25)
   - `TARGET_FIB` (default: 0.618)
   - `RR_RATIO` (default: 2.0)
   - `POSITION_PCT` (default: 10)
   - `SESSION_END` (default: 1100)
   - `HARD_EXIT` (default: 1130)
   - `POLL_INTERVAL_MS` (default: 30000)
   - `MIN_ATR` (default: 0.50)
   - `MIN_POSITION_USD` (default: 100)

### Code deduplication

2. **Extract `scripts/lib/` shared modules:**
   - `indicators.js` — SMA, ATR, RSI, VWAP classes/functions
   - `alpaca-data.js` — `fetchBarsPaginated`, `normD`, `computeDailyATRMap`
   - `backtest-utils.js` — `computeStats`, `combineSymbolResults`, `calcQty`
   - Both `backtest.js` and `swing-backtest.js` import from these

### Test coverage

3. **Bot core logic tests** (`tests/touch-turn-bot.test.js`):
   - `scanCandidates()` — filtering on ATR threshold, range size, direction
   - P&L calculation (post-fix)
   - Position sizing (post-fix)
   - Session time checks (before, during, after)
   - CONFIG defaults and env var overrides

4. **Indicator tests** (`tests/indicators.test.js`):
   - SMA with known values
   - ATR with known values
   - RSI overbought/oversold
   - VWAP reset behavior

### Dead code removal

5. **Remove `tgBreakout()` and `tgMorningBrief()`** from `telegram.js` — dead code from previous strategy. (`readConfig()` was already removed in Layer 1 along with `alpaca-config.json`.)