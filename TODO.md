# 📋 Project Roadmap & Task Status (TODO)

Tracked features, architectural milestones, and planned enhancements for the **NSE Stock Screener (`screenerpython`)**.

---

## ✅ Completed Milestones

### 1. Real-Time Market Data Engine
- [x] **TradingView Screener Integration**: Real-time snapshot retrieval via `tvscreener` with deduplication prioritizing NSE over BSE listings.
- [x] **Sector & Industry Resolution**: Enriched metadata for all liquid NSE stocks.
- [x] **Top Indices Live Bar**: Continuous ticker tracking NIFTY 50, BANKNIFTY, SENSEX, NIFTY IT, and NIFTY MIDCAP.

### 2. Universal Scanner Framework
- [x] **Live Movers**: Real-time Top Gainers, Top Losers, and Volume Shockers.
- [x] **Custom Rule Engine**: Multi-indicator SQLite condition builder with crossover and crossunder operators.
- [x] **PKScreener Algorithm Suite**: 32 algorithmic scans (Golden Cross, 5-EMA, Support Bounces, Aroon, PSAR/RSI, etc.).
- [x] **Mark Minervini VCP Patterns**: Multi-stage contraction detection (2T, 3T, 4T) with Trend Template qualification.
- [x] **RRG Relative Rotation**: Real-time momentum ranking (Leading, Improving, Weakening, Lagging) against Nifty 50.
- [x] **Options & Strike Levels**: Automated Max Pain, Immediate Support, and Resistance strike overlays.

### 3. Indian Market ADR & Intraday Range Extension *(New)*
- [x] **% Change From Low (LOD)**: Real-time calculation of run-up percentage from day's low.
- [x] **ADR % from LOD**: Percentage of 14-day Average Daily Range consumed from low of day.
- [x] **ADR Range Meter**: Dynamic progress bar with color-coded risk bands (Early <40%, Active 40-70%, Over-Extended >70%).
- [x] **Previous-Day Range < ADR Check**: Volatility contraction indicator ($\checkmark$ Tight vs $\triangle$ Wide).
- [x] **Indian Market Context Callout**: Actionable risk advisories covering mid-cap circuit bands and late-chasing dangers.

### 4. Interactive Institutional Charting
- [x] **Lightweight Charts v5 Migration**: Upgraded series creation API (`addSeries(CandlestickSeries)`).
- [x] **Multi-Pane Indicators**: Synchronized main candlestick chart, Volume histogram, RSI sub-chart, and MACD sub-chart.
- [x] **Intraday & Historical Timeframes**: Support for `5m`, `15m`, `30m`, `1H`, `4H`, `1D`, `1WK`, `1MO`.
- [x] **Strike Level Overlays**: On-chart horizontal price lines for Key Resistance, Max Pain, and Key Support.

### 5. Quantitative Backtesting Lab
- [x] **VectorBT Simulation Engine**: Fast vectorized portfolio backtesting across target NSE symbols and indices.
- [x] **QuantStats Tearsheet Generation**: Comprehensive HTML performance tearsheets with monthly return grids and underwater drawdowns.
- [x] **Interactive UI Lab**: Strategy configuration, equity curve visualization, and trade logs.

---

## 🚀 In Progress & Upcoming Roadmap

### Phase 6: Advanced Options & Greeks
- [ ] **Real-Time Option Chain**: Live call/put open interest (OI) breakdown, change in OI, and PCR (Put-Call Ratio).
- [ ] **Implied Volatility (IV) Skew**: IV percentile and IV rank relative to historical volatility.
- [ ] **Greeks Calculation**: Black-Scholes Delta, Gamma, Theta, and Vega on liquid NSE monthly/weekly strikes.

### Phase 7: Real-Time Alerts & Webhooks
- [ ] **Telegram / Discord Alerts**: Instant notifications when high-priority scans match (e.g., VCP breakout or early ADR expansion).
- [ ] **Custom Price Alerts**: User-defined price crosses and trailing stop notifications.
- [ ] **Browser Push Notifications**: Web notification API integration.

### Phase 8: Automation & Broker Integration
- [ ] **Dhan / Zerodha Kite Connect Integration**: 1-click order placement directly from chart or screener table.
- [ ] **Paper Trading Mode**: Virtual execution environment to test scanner setups in real-time forward trading.
- [ ] **Multi-Stock Watchlists**: Custom user-saved portfolios with cloud or local SQLite persistence.
