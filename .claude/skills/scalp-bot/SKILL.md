---
name: scalp-bot
description: Start or stop the One Candle Scalp trading bot. Starting also launches TradingView Desktop with CDP enabled. Stopping shuts down the bot process.
---

# Scalp Bot Skill

Control the One Candle Scalp Alpaca trading bot. Starting the bot also ensures TradingView Desktop is running with CDP.

## `/scalp-bot start`

1. **Launch TradingView Desktop with CDP** — find and run the appropriate launch script:
   - Windows: `scripts/launch_tv_debug.bat`
   - macOS: `scripts/launch_tv_debug_mac.sh`
   - Linux: `scripts/launch_tv_debug_linux.sh`
   - If already running, skip this step (check via `tv health_check` or `curl -s http://localhost:9222/json`)

2. **Verify CDP connection**:
   ```
   curl -s http://localhost:9222/json
   ```
   If it returns target data, TradingView is ready. If not, wait 10 seconds and retry (up to 3 times).

3. **Start the bot in the background**:
   ```
   cd ~/tradingview-mcp-jackson && node scripts/alpaca-bot.js &
   ```

4. **Confirm startup** — check output contains "Connected:" and "Data stream connected"

5. **Report to user**: bot is running, whether TradingView was already open or just launched, and the current mode (PAPER/DRY RUN)

## `/scalp-bot stop`

1. Find and kill the bot process:
   ```
   ps aux | grep alpaca-bot | grep -v grep
   kill <PID>
   ```
2. Confirm process is stopped
3. Report to user that the bot has been stopped

## `/scalp-bot status`

1. Check if the bot process is running
2. Read the last 10 entries from `scripts/trade-log.json` to show recent activity
3. Report: running/stopped, last activity time, today's trade count

## `/scalp-bot dry-run`

1. Read `scripts/alpaca-config.json`
2. Toggle the `dryRun` field (true → false or false → true)
3. Write updated config back
4. Report the new mode
5. Remind user that the bot must be restarted for changes to take effect

## Configuration

- **Config**: `~/tradingview-mcp-jackson/scripts/alpaca-config.json`
  - `dryRun`: true = signals only, false = places orders
  - `symbols`: array of tickers (default: AMD, AMZN, SPY, TSLA, NVDA)
  - `strategy`: session times, ATR%, RVOL, range filters
  - `risk`: position size %, max trades/day
- **Credentials**: `~/tradingview-mcp-jackson/.env`
  - `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `ALPACA_PAPER`
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

## Safety Rules

- Always warn the user before switching from paper to live trading (`ALPACA_PAPER=false`)
- Always warn before disabling dry-run mode
- Never modify `.env` API keys without explicit user instruction
- The bot auto-closes all positions at 11:00 AM ET