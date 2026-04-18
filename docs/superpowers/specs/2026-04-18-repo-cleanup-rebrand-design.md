# Repo Cleanup & Rebrand Design

Rebrand the forked `tradingview-mcp-jackson` repo as a standalone project under `Londarth/tradingview-mcp`. Remove all references to the original author/fork, clean up stale files, and rewrite docs to reflect the current state (MCP server + Alpaca bot).

## Scope

- Remove all fork/author references (README, LICENSE, SECURITY.md, SETUP_GUIDE.md)
- Delete stale runtime files
- Rewrite README for the current project
- Add untracked project files to git
- Rename GitHub repo from `tradingview-mcp-jackson` to `tradingview-mcp`
- Update all URLs in docs to point to `Londarth/tradingview-mcp`

## Changes

### Delete

| File | Reason |
|------|--------|
| `screenshot_nvda_1m.png` | Stray screenshot in project root |
| `scripts/trade-log.json` | Runtime bot log (gitignore it) |
| `screenshots/*` | Runtime screenshots (already gitignored, clean the folder) |
| `scripts/current.pine` | Temp file from pine_push (already gitignored) |

### .gitignore additions

```
scripts/trade-log.json
screenshot_*
```

### LICENSE

- Change: `Copyright (c) 2026 tradesdontlie` -> `Copyright (c) 2026 Londarth`

### SECURITY.md

- Change: `https://github.com/tradesdontlie/tradingview-mcp/security/advisories/new` -> `https://github.com/Londarth/tradingview-mcp/security/advisories/new`

### SETUP_GUIDE.md

- Change: all `LewisWJackson/tradingview-mcp-jackson` -> `Londarth/tradingview-mcp`

### package.json

- Add: `repository`, `author`, `bugs` fields pointing to `Londarth/tradingview-mcp`

### README.md — full rewrite

Structure:

1. **Title + tagline**: TradingView MCP — no fork/YouTube mentions
2. **What it does**: MCP server (81 tools) + Alpaca trading bot, listed as equal features
3. **Architecture**: MCP server layers + Alpaca bot components (from CLAUDE.md)
4. **Quick Start**: clone from `Londarth/tradingview-mcp`, install, configure, run
5. **MCP Server**: tool categories table, decision tree
6. **Alpaca Bot**: strategy description, setup, config file reference
7. **CLI Commands**: `tv` command reference
8. **Configuration**: .env, rules.json, alpaca-config.json
9. **Troubleshooting**: cleaned-up table
10. **Disclaimer**: keep as-is
11. **License**: MIT — Copyright Londarth
12. **No Credits section**

### Commit staged changes

- `CLAUDE.md` — already updated with MCP + Alpaca bot architecture
- `rules.json` — already updated with 4H bias rules
- `package-lock.json` — alpaca-trade-api dependency added

### Add untracked files

- `.claude/` — project skills + settings
- `scripts/one_candle_scalp.pine` — v1 Pine strategy
- `scripts/one_candle_scalp_v2.pine` — v2 Pine strategy

### Git repo rename

1. Commit and push all changes
2. Rename on GitHub: `tradingview-mcp-jackson` -> `tradingview-mcp`
3. Update local remote: `git remote set-url origin https://github.com/Londarth/tradingview-mcp.git`

## Execution order

1. Delete stale files
2. Update .gitignore
3. Edit LICENSE, SECURITY.md, SETUP_GUIDE.md, package.json
4. Write new README.md
5. Stage all changes (CLAUDE.md, rules.json, package-lock.json, new files)
6. Commit
7. Push
8. Rename repo on GitHub
9. Update local remote URL