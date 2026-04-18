# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TradingView MCP server + autonomous trading bot. Two independent systems:

1. **MCP Server** — Controls TradingView Desktop via Chrome DevTools Protocol (CDP). 81 tools for chart manipulation, Pine Script, data reading, drawing, alerts, replay, and UI automation.
2. **Alpaca Bot** — Standalone Node.js script that implements the "One Candle Scalp v2" strategy for live/paper trading via Alpaca's API, with Telegram notifications.

## Architecture

```
Claude Code ←→ MCP Server (stdio) ←→ CDP (localhost:9222) ←→ TradingView Desktop (Electron)

Alpaca Bot (standalone) ←→ Alpaca API (REST + WebSocket) ←→ Market data + order execution
                              ←→ Telegram Bot API ←→ Trade notifications to user
```

### MCP Server Layers

- **`connection.js`** — CDP client. Connects to `localhost:9222`, discovers TradingView tab, injects JS via `Runtime.evaluate()`. Caches client, reconnects on failure.
- **`core/`** — Pure business logic. No MCP imports. Plain JS objects in/out. Can be imported independently via `import { chart } from 'tradingview-mcp/core'`.
- **`tools/`** — MCP registration layer. Zod schemas, wraps `core/` functions, registers on `McpServer`. Shared `jsonResult()` helper in `_format.js`.
- **`cli/`** — Terminal interface. `tv` command with subcommands. Wraps `core/` functions with arg parsing.

All chart manipulation works by constructing JS strings that access `window.TradingViewApi` internal paths, then evaluating them in the TradingView page context.

### Alpaca Bot

- **`scripts/alpaca-bot.js`** — Main bot. Subscribes to Alpaca's real-time 5-min bar stream, implements opening range breakout strategy, places bracket orders.
- **`scripts/telegram.js`** — Sends formatted HTML messages via Telegram Bot API (trade signals, morning brief, EOD summary, errors).
- **`scripts/alpaca-config.json`** — Strategy parameters, symbol list, risk settings, dry-run toggle.

## Commands

```bash
# MCP server (used by Claude Code automatically)
npm start

# CLI usage
node src/cli/index.js <command> [options]
# e.g.: tv status, tv symbol AAPL, tv quote, tv pine set --file script.pine

# Alpaca bot
node scripts/alpaca-bot.js          # Start bot (dry-run by default)

# Tests
npm test                            # All tests
npm run test:unit                   # Unit tests only
npm run test:e2e                    # E2E tests (requires TV Desktop running)

# Pine Script sync
node scripts/pine_pull.js           # Pull from TV editor → scripts/current.pine
node scripts/pine_push.js           # Push scripts/current.pine → TV editor + compile

# Launch TradingView with CDP
scripts/launch_tv_debug.bat         # Windows
scripts/launch_tv_debug_mac.sh      # macOS
scripts/launch_tv_debug_linux.sh    # Linux
```

## Key Patterns

### CDP JavaScript Injection
Core functions construct JS as strings and inject via `CDP.Runtime.evaluate()`. Example:
```js
// chart.getState() injects:
(function() {
  var chart = window.TradingViewApi._activeChartWidgetWV.value();
  return { symbol: chart.symbol(), resolution: chart.resolution(), ... };
})()
```

### Pine Editor Manipulation
Uses React Fiber traversal (`__reactFiber$` keys) up to 15 levels deep to find the Monaco editor instance, then calls `.setValue()`, `.getValue()`, and model marker APIs.

### Alpaca Data Field Names
Alpaca v2 bars use `OpenPrice`, `HighPrice`, `LowPrice`, `ClosePrice` (not `Open`, `High`, etc.). The bot's `norm()` function normalizes these. REST API calls for historical data require `feed=iex` query parameter for paper/free accounts (SIP data requires paid subscription).

## Context Management Rules

1. **Always use `summary: true` on `data_get_ohlcv`** unless you need individual bars
2. **Always use `study_filter`** on pine tools when targeting a specific indicator
3. **Never use `verbose: true`** on pine tools unless specifically requested
4. **Avoid `pine_get_source`** on complex scripts (can return 200KB+)
5. **Use `capture_screenshot`** for visual context instead of pulling large datasets
6. **Call `chart_get_state` once** at start to get entity IDs, then reference them
7. **Cap OHLCV requests**: `count: 20` for quick, `count: 100` for deep, `count: 500` only when needed

## Tool Decision Tree

### "What's on my chart?"
`chart_get_state` → `data_get_study_values` → `quote_get`

### "What levels/lines are showing?"
`data_get_pine_lines` / `data_get_pine_labels` / `data_get_pine_tables` / `data_get_pine_boxes` (use `study_filter` to target)

### "Analyze my chart" (full workflow)
`quote_get` → `data_get_study_values` → `data_get_pine_lines` → `data_get_pine_labels` → `data_get_pine_tables` → `data_get_ohlcv` (summary) → `capture_screenshot`

### Pine Script workflow
`pine_set_source` → `pine_smart_compile` → `pine_get_errors` → `pine_get_console` → `pine_save`

### TradingView not running
`tv_launch` → `tv_health_check`

## Configuration Files

- **`.env`** — `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `ALPACA_PAPER`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (gitignored)
- **`rules.json`** — User's watchlist, bias rules, risk parameters for morning brief
- **`scripts/alpaca-config.json`** — Bot strategy params (symbols, session times, ATR/RVOL thresholds, risk)
- **`~/.claude/.mcp.json`** — MCP server registration for Claude Code

## Scalp Bot Skill

The `/scalp-bot` skill manages the Alpaca trading bot:
- `start` — Launches bot + TradingView Desktop with CDP
- `stop` — Kills bot process
- `status` — Shows running state + recent trades from trade-log.json
- `dry-run` — Toggles dryRun in alpaca-config.json (requires restart)