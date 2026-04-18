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
npm test                            # telegram-ctl.test.js

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
The bot reads all configuration from `.env` and hardcoded constants in `scripts/touch-turn-bot.js`. There is no separate config file for the Touch & Turn strategy.

### PM2 Process Names
- `touch-turn-bot` — the trading bot (session-only, autorestart: false)
- The systemd service `scalp-bot-ctl` manages `telegram-ctl.js` (always-on)

## Configuration Files

- **`.env`** — `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `ALPACA_PAPER`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DRY_RUN` (gitignored)
- **`ecosystem.config.cjs`** — PM2 process definition for touch-turn-bot
- **`scripts/alpaca-config.json`** — Legacy config (used by telegram-ctl.js for reference)

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
| `scripts/telegram.js` | Telegram notification functions |
| `scripts/telegram-ctl.js` | Telegram command listener |
| `scripts/backtest.js` | Day-trading backtester |
| `scripts/swing-backtest.js` | Swing trading backtester |
| `scripts/setup-vps.sh` | VPS provisioning script |
| `scripts/scalp-bot-ctl.service` | Systemd unit file template |
| `tests/telegram-ctl.test.js` | Telegram controller unit tests |