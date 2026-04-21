# Scalp Bot

Alpaca trading bot with Telegram control and backtesting. Implements the Touch & Turn scalper strategy — one trade per day, fully automated on a VPS.

---

## Architecture

```
Phone (Telegram) ←→ VPS
                       ├── telegram-ctl.js  (always-on, polls for commands)
                       ├── PM2 process manager
                       │     └── touch-turn-bot.js (runs during session hours)
                       └── cron
                             ├── 9:25 AM ET → start bot
                             └── 11:30 AM ET → stop bot
```

---

## Touch & Turn Strategy

1. Wait for 15-min opening range (9:30–9:45 ET) to close
2. Confirm liquidity candle: range >= 25% of daily ATR(14)
3. Red candle (close < open) → LONG limit at range low
4. Green candle (close > open) → SHORT limit at range high
5. Target: 61.8% of range from entry (Fibonacci)
6. Stop: half the target distance (2:1 R:R)
7. Cancel unfilled orders at 11:00 ET, close open positions at 11:30 ET
8. One trade per day max

**Universe**: SOFI, INTC, Z, DAL, RIVN, SBUX, CCL, DIS, F, GM, PLTR, SNAP (configurable via `UNIVERSE` env var)

**Position sizing**: 10% of account balance per trade (configurable via `POSITION_PCT` env var)

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/Londarth/scalp-bot.git ~/scalp-bot
cd ~/scalp-bot
npm install
```

### 2. Configure credentials

Copy the template and fill in your values:

```bash
cp .env.example .env
```

Required env vars:

```
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
ALPACA_PAPER=true
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

Optional strategy parameters (with defaults):

```
UNIVERSE=SOFI,INTC,Z,DAL,RIVN,SBUX,CCL,DIS,F,GM,PLTR,SNAP
POSITION_PCT=10
ATR_PCT_THRESHOLD=0.25
TARGET_FIB=0.618
RR_RATIO=2.0
SESSION_END=1100
HARD_EXIT=1130
POLL_INTERVAL_MS=30000
MIN_ATR=0.50
MIN_POSITION_USD=100
DRY_RUN=false
```

### 3. Run locally (paper mode)

```bash
node scripts/touch-turn-bot.js
```

Or use PM2:

```bash
pm2 start ecosystem.config.cjs --only touch-turn-bot
```

---

## Telegram Commands

Send commands to your Telegram bot from anywhere:

| Command | Action |
|---------|--------|
| `/start` | Start the trading bot via PM2 |
| `/stop` | Stop the trading bot |
| `/status` | Show bot status + recent activity |
| `/help` | List available commands |

Only messages from your `TELEGRAM_CHAT_ID` are processed.

---

## VPS Deployment

### Automated setup

```bash
git clone https://github.com/Londarth/scalp-bot.git /root/scalp-bot
cd /root/scalp-bot
bash scripts/setup-vps.sh
```

This installs Node.js, PM2, sets up systemd for the Telegram controller, and configures cron jobs for session scheduling.

### Manual VPS management

```bash
pm2 list                    # Show managed processes
pm2 logs touch-turn-bot     # View bot logs
pm2 describe touch-turn-bot # Detailed bot status
sudo systemctl status scalp-bot-ctl  # Telegram controller status
```

---

## Resilience

- **Retry/backoff**: All Alpaca and Telegram API calls retry with exponential backoff (3 retries, 1s base delay)
- **Graceful shutdown**: SIGINT/SIGTERM cancels open orders, closes positions past hard-exit time, saves logs
- **Config validation**: Bot exits with a clear error if required env vars are missing
- **Periodic log saving**: Trade log saved every 5 minutes during monitoring

---

## Backtesting

```bash
npm run backtest           # Day-trading strategies (Aziz ORB + Touch & Turn)
npm run swing-backtest     # Swing trading strategies (CRSI2, IBS, Failed Breakout)
```

---

## Configuration

| File | Purpose |
|------|---------|
| `.env` | All secrets and config (gitignored). See `.env.example` for full list. |
| `.env.example` | Template documenting all required and optional env vars |
| `ecosystem.config.cjs` | PM2 process definition for touch-turn-bot |

All strategy parameters are configurable via env vars with sensible defaults. No code edits needed.

---

## Project Structure

```
scalp-bot/
├── scripts/
│   ├── touch-turn-bot.js       # Main trading bot
│   ├── telegram.js             # Unified Telegram module
│   ├── telegram-ctl.js         # Telegram command listener (VPS)
│   ├── lib/
│   │   ├── retry.js            # Retry/backoff utility
│   │   ├── indicators.js      # SMA, ATR, RSI, VWAP
│   │   ├── alpaca-data.js     # Fetch bars, normalize, ATR map
│   │   └── backtest-utils.js  # Stats, combine results, calcQty
│   ├── backtest.js             # Day-trading backtester
│   ├── swing-backtest.js       # Swing trading backtester
│   ├── setup-vps.sh            # VPS provisioning script
│   └── scalp-bot-ctl.service   # Systemd unit file template
├── tests/
│   ├── touch-turn-bot.test.js  # Bot core logic tests
│   ├── telegram-ctl.test.js   # Telegram controller tests
│   ├── indicators.test.js      # Indicator unit tests
│   └── retry.test.js           # Retry/backoff tests
├── skills/
│   └── scalp-bot/SKILL.md      # Claude Code skill
├── ecosystem.config.cjs        # PM2 config
├── .env.example                # Env var template
└── .env                        # Credentials (gitignored)
```

---

## Disclaimer

This project is provided **for personal, educational, and research purposes only**. Trading involves significant risk. Use at your own risk.

## License

MIT — see [LICENSE](LICENSE).