# Aziz ORB + VWAP & VWAP Reversion Strategies Design

Two Pine Script + Alpaca bot strategies for TradingView backtesting and live trading, designed for 200 GBP starting capital with 10% equity position sizing.

## Constraints

- Starting capital: 200 GBP
- Market: US stocks via Alpaca (fractional shares available)
- Risk style: High frequency, tight stops
- Position size: **10% of equity or minimum 20 GBP**, whichever is greater
- Auto-select symbols by RVOL scanner each morning
- Day trading only — no overnight positions

## Strategy A: Aziz ORB + VWAP

**Edge:** Opening range breakout with VWAP as stop — tighter stops mean higher win rate. Based on Andrew Aziz's peer-reviewed ORB strategy (SSRN #4729284: 1,637% total return, Sharpe 2.81, 2016-2023).

**Logic:**
1. Track first 5-min candle (9:30-9:35 ET) as opening range
2. Breakout above OR high → long entry
3. Breakout below OR low → short entry
4. No retest required — enter on breakout direction
5. No wick filter — more trades

**Exits:**
- SL: Bar close below VWAP for longs, bar close above VWAP for shorts (not just a wick — must close past VWAP)
- TP: 2R from entry (risk = entry price - VWAP distance)
- Session end close: 11:30 ET

**Filters:**
- RVOL filter: breakout candle volume >= 1.5x average (stricter than current to match Aziz displacement requirement)
- ATR filter: OR range must be < daily ATR (if OR is too wide, skip — chop risk)
- VWAP bias: long only if price > VWAP, short only if price < VWAP

**Position sizing:** `default_qty_type=strategy.percent_of_equity, default_qty_value=10`

**Symbol selection:** Auto-scan by RVOL — fetch top 5 stocks with highest opening relative volume from Alpaca scanner each morning.

## Strategy B: VWAP Reversion (Tuned)

**Edge:** Fade extended moves away from VWAP — price tends to revert to VWAP intraday.

**Logic:**
1. Active session: 9:45-11:30 ET (after opening range settles)
2. Calculate ATR(14) on 5m chart
3. Track distance from VWAP in ATR units
4. Long when price is **1.0 ATR** below VWAP (relaxed from 1.5 for more trades)
5. Short when price is **1.0 ATR** above VWAP

**Exits:**
- SL: 0.5 ATR from entry (very tight)
- TP: VWAP touch (price returning to VWAP)
- Session end close: 11:30 ET

**Filters:**
- RSI filter: RSI < 70 for longs, RSI > 30 for shorts
- Cooldown: 10 bars (50 min) between trades
- Volume filter: current bar volume > SMA(volume, 12)
- Max 1 position at a time

**Position sizing:** `default_qty_type=strategy.percent_of_equity, default_qty_value=10`

## Position Sizing Logic (Alpaca Bot)

For both strategies in the Alpaca bot implementation:
```
positionValue = max(equity * 0.10, 20)  // 10% or minimum £20
qty = positionValue / currentPrice     // fractional shares
```

At £200 starting equity: 10% = £20 per trade. As equity grows, position scales proportionally.

## RVOL Scanner

Each morning (pre-market), scan for the top 5 most active stocks:
- Fetch stocks with highest relative volume at open from Alpaca
- Filter: price under $200 (ensures fractional shares are meaningful)
- Filter: daily ATR > $1 (sufficient volatility)
- Both strategies trade the same watchlist

## Deliverables

Two Pine Script v6 files + updated Alpaca bot:
1. `scripts/aziz_orb_vwap.pine` — Strategy A (new file)
2. `scripts/vwap_reversion_scalp.pine` — Strategy B (update existing: ATR distance 1.5→1.0, position size 1%→10%)
3. `scripts/backtest.js` — Updated with new strategies and 10% equity / min £20 sizing
4. `scripts/or_micro_scalp.pine` — Keep as reference (not actively traded)

## Next Steps (after backtesting)

- Evaluate backtest results for both strategies
- Pick winner(s) to implement as live Alpaca bot
- Add RVOL scanner to alpaca-bot.js for auto symbol selection

## Sources

- Andrew Aziz ORB research: SSRN #4729284 "A Profitable Day Trading Strategy for U.S. Equity Market"
- Aziz VWAP research: SSRN #4631351 "VWAP: The Holy Grail for Day Trading Systems"
- TickerDaily 2026 strategy comparison: https://tickerdaily.com/learn/day-trading/strategies