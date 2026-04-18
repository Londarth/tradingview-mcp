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

**Universe**: SOFI, INTC, Z, DAL, RIVN, SBUX, CCL, DIS, F, GM, PLTR, SNAP

**Position sizing**: 50% of account balance per trade

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/Londarth/scalp-bot.git ~/scalp-bot
cd ~/scalp-bot
npm install
```

### 2. Configure credentials

Create `.env` with:

```
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
ALPACA_PAPER=true
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
DRY_RUN=true
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

## Backtesting

```bash
npm run backtest           # Day-trading strategies (Aziz ORB + Touch & Turn)
npm run swing-backtest     # Swing trading strategies (CRSI2, IBS, Failed Breakout)
```

---

## Configuration

| File | Purpose |
|------|---------|
| `.env` | Alpaca API keys, Telegram credentials, DRY_RUN toggle (gitignored) |
| `ecosystem.config.cjs` | PM2 process definition for touch-turn-bot |

Bot parameters (ATR threshold, Fib level, R:R ratio, position size, session times) are configured in `scripts/touch-turn-bot.js`.

---

## Project Structure

```
scalp-bot/
├── scripts/
│   ├── touch-turn-bot.js       # Main trading bot
│   ├── telegram.js             # Telegram notification functions
│   ├── telegram-ctl.js         # Telegram command listener (VPS)
│   ├── backtest.js             # Day-trading backtester
│   ├── swing-backtest.js       # Swing trading backtester
│   ├── setup-vps.sh            # VPS provisioning script
│   └── scalp-bot-ctl.service   # Systemd unit file template
├── tests/
│   └── telegram-ctl.test.js    # Telegram controller unit tests
├── skills/
│   └── scalp-bot/SKILL.md      # Claude Code skill
├── ecosystem.config.cjs        # PM2 config
└── .env                        # Credentials (gitignored)
```

---

## Disclaimer

This project is provided **for personal, educational, and research purposes only**. Trading involves significant risk. Use at your own risk.

## License

MIT — see [LICENSE](LICENSE).