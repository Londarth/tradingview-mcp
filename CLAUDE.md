# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Alpaca trading bot (Touch & Turn scalper) with Telegram control, PM2 process management, and backtesting. Runs on a Hetzner VPS, controlled via Telegram commands, started by cron on trading days.

## Architecture

```
Phone (Telegram) ←→ telegram-ctl.js (always-on systemd service)
                       ↓ PM2 commands
                    touch-turn-bot.js (session: 9:25–11:30 ET)
                       ↓ REST API
                    Alpaca API ←→ Market data + order execution
                       ↓
                    Telegram notifications
```

## Commands

```bash
# Run the bot
npm start                           # node scripts/touch-turn-bot.js

# Tests
npm test                            # Run all test suites
npm run test:bot                    # Bot core logic tests only
npm run test:ctl                    # Telegram controller tests only
npm run test:indicators             # Indicator unit tests only

# Backtesting
npm run backtest                    # Day-trading strategies
npm run swing-backtest              # Swing trading strategies

# PM2 (on VPS)
pm2 start ecosystem.config.cjs --only touch-turn-bot
pm2 stop touch-turn-bot
pm2 logs touch-turn-bot
```

## Key Patterns

### Alpaca Data Field Names
Alpaca v2 bars use `OpenPrice`, `HighPrice`, `LowPrice`, `ClosePrice` (not `Open`, `High`, etc.). The bot's `norm()` function normalizes these. REST API calls for historical data require `feed=iex` for paper/free accounts.

### Env-Based Config
All configuration is via `.env` with sensible defaults. See `.env.example` for the full list. Strategy parameters override from env vars:

| Env Var | Default | Description |
|---------|---------|-------------|
| `UNIVERSE` | SOFI,INTC,Z,DAL,RIVN,SBUX,CCL,DIS,F,GM,PLTR,SNAP | Comma-separated symbols |
| `ATR_PCT_THRESHOLD` | 0.25 | Min range/ATR ratio for entry |
| `TARGET_FIB` | 0.618 | Fibonacci target level |
| `RR_RATIO` | 2.0 | Risk:reward ratio |
| `POSITION_PCT` | 10 | % of equity per trade |
| `SESSION_END` | 1100 | Entry window close (HHMM) |
| `HARD_EXIT` | 1130 | Force-close time (HHMM) |
| `POLL_INTERVAL_MS` | 30000 | Polling interval in ms |
| `MIN_ATR` | 0.50 | Min daily ATR filter |
| `MIN_POSITION_USD` | 100 | Min position size in USD |

### Resilience
- **Retry/backoff**: All Alpaca and Telegram API calls use exponential backoff with jitter (3 retries, 1s base delay)
- **Graceful shutdown**: SIGINT/SIGTERM cancels open orders, closes positions past hard-exit time, saves logs
- **Config validation**: Bot exits with clear error if required env vars are missing
- **Periodic log saving**: Trade log saved every 5 minutes during monitoring loops

### Telegram Module
`telegram.js` is the single source for all Telegram messaging. It exports `sendTelegram(text, {parseMode, buttons})`, `telegramEnabled()`, `tgTradeSignal()`, `tgEODSummary()`, `tgError()`, `tgStartup()`, `tgShutdown()`, `MAIN_BUTTONS`, `escapeHtml`, and `TG_API`. The controller (`telegram-ctl.js`) imports from it.

### PM2 Process Names
- `touch-turn-bot` — the trading bot (session-only, autorestart: false)
- The systemd service `scalp-bot-ctl` manages `telegram-ctl.js` (always-on)

## Configuration Files

- **`.env`** — All secrets and config (gitignored). See `.env.example` for full list.
- **`.env.example`** — Template documenting all required and optional env vars
- **`ecosystem.config.cjs`** — PM2 process definition for touch-turn-bot

## Scalp Bot Skill

The `/scalp-bot` skill manages the trading bot:
- `start` — Starts bot via PM2
- `stop` — Stops bot via PM2
- `status` — Shows running state + recent trades from touch-turn-log.json
- `dry-run` — Toggles DRY_RUN in `.env` (requires restart)

## Key Files

| File | Purpose |
|------|---------|
| `scripts/touch-turn-bot.js` | Main trading bot |
| `scripts/telegram.js` | Unified Telegram module (send, format, buttons) |
| `scripts/telegram-ctl.js` | Telegram command listener (VPS daemon) |
| `scripts/lib/retry.js` | Retry/backoff utility for API calls |
| `scripts/lib/indicators.js` | SMA, ATR, RSI, VWAP indicator closures |
| `scripts/lib/alpaca-data.js` | Fetch bars, normalize, compute daily ATR map |
| `scripts/lib/backtest-utils.js` | Stats, combine results, calcQty |
| `scripts/backtest.js` | Day-trading backtester |
| `scripts/swing-backtest.js` | Swing trading backtester |
| `scripts/setup-vps.sh` | VPS provisioning script |
| `scripts/scalp-bot-ctl.service` | Systemd unit file template |
| `tests/touch-turn-bot.test.js` | Bot core logic tests |
| `tests/telegram-ctl.test.js` | Telegram controller unit tests |
| `tests/indicators.test.js` | Indicator unit tests |
| `tests/retry.test.js` | Retry/backoff unit tests |