# 📖 About NSE Stock Screener (`screenerpython`)

## 🎯 Project Vision

**`screenerpython`** is an institutional-grade, real-time analytics and scanning terminal engineered specifically for the **Indian Stock Market (NSE/BSE)**. 

While Western screening tools often assume continuous auction dynamics and wide institutional float, Indian equities have unique market microstructures:
1. **Exchange Price Bands & Circuit Limits**: Daily limits (2%, 5%, 10%, 20%) can abruptly freeze liquidity during rapid momentum spikes.
2. **High Retail Participation & Volatility**: Indian mid-cap and small-cap stocks frequently experience daily ranges (ADR) of 4% to 10%+, leading emotional retail traders to chase extended moves late in the session.
3. **NSE vs. BSE Dual Listings**: Companies listed on both exchanges require automated deduplication and ticker normalization to prevent fragmented signals.

This platform bridges this gap by unifying **real-time TradingView technical indicators**, **quant-grade VectorBT backtesting**, **Minervini VCP pattern detection**, and **specialized intraday volatility metrics (ADR & % from LOD)** into a modern, unified terminal.

---

## 🏛️ Architectural Design & Tech Stack

```
┌────────────────────────────────────────────────────────────┐
│                    React + Vite Frontend                   │
│          Port 5180 | Lightweight Charts v5 | Dark UI       │
└─────────────────────────────┬──────────────────────────────┘
                              │ HTTP / JSON (Proxy)
┌─────────────────────────────▼──────────────────────────────┐
│                    FastAPI Backend Engine                  │
│                     Port 8009 | Python 3.11+               │
└───────┬─────────────────────┬───────────────────────┬──────┘
        │                     │                       │
┌───────▼───────────┐  ┌──────▼────────────┐   ┌──────▼──────┐
│ TradingView Screener│  │ yFinance Provider │   │ SQLite Store│
│  (Live Indicators)│  │ (OHLCV & History) │   │(scanner.db) │
└───────────────────┘  └───────────────────┘   └─────────────┘
```

### 1. Separation of Data Sources
- **TradingView Screener Engine (`tvscreener_service.py`)**: Fetches live snapshots with server-side filters. TradingView computes indicators across thousands of tickers in parallel, offloading heavy CPU computation from the local server.
- **Yahoo Finance OHLCV Engine (`ohlcv_service.py`)**: Historical multi-year candlestick bars for interactive charts and quantitative simulations. Implements automatic SQLite caching to eliminate rate limits.
- **Thread-Safe Concurrency**: All database calls use dedicated context-managed SQLite connections with busy timeouts to avoid locking native crashes on Windows during rapid multi-user chart clicks.

### 2. The Philosophy of Average Daily Range (ADR) in Indian Equities
Average Daily Range over 14 sessions ($ADR_{14}$) represents the typical rupee distance between daily highs and lows. In `screenerpython`, we compute:

- **% Change from Low of Day (LOD)**: $\left(\frac{\text{LTP} - \text{LOD}}{\text{LOD}}\right) \times 100$
- **ADR % Consumed from LOD**: $\left(\frac{\text{LTP} - \text{LOD}}{\text{14D ADR}}\right) \times 100$
- **Previous-Day Volatility Contraction Check**: $\text{Prior Day Range} < 14\text{D ADR}$

#### The Trading Logic:
- **Early Expansion ($<40\%$ ADR used)**: When a stock breaks out from a tight previous day ($\checkmark$ Tight) having consumed under 40% of its normal daily range, a stop-loss placed near the day's low is statistically narrow in rupee terms.
- **Over-Extended ($>70\%$ ADR used)**: Chasing a stock that has already traveled 70%+ of its normal daily volatility forces wide rupee stop-losses and places the trader in the zone where institutions book intraday profits.

---

## 👥 Built For
- **Intraday Traders**: Rapid identification of momentum surges without chasing over-extended breakouts.
- **Swing Traders**: Screening Minervini Volatility Contraction Patterns (VCP) and high relative strength leaders.
- **Systematic & Quant Traders**: Validating edge and historical expectancy using vectorized simulations and HTML performance tearsheets.
