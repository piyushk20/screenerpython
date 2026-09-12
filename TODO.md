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
- [x] **Real-Time Option Chain**: Live call/put open interest (OI) breakdown, change in OI, volume, and strike-wise/total PCR (Put-Call Ratio).
- [x] **Max Pain & Key Strike Levels**: Dynamic Max Pain solver, Highest Call OI (resistance) & Highest Put OI (support).
- [x] **Implied Volatility (IV) Analytics**: Numerical IV solver, 30-day Historical Volatility (HV), IV Percentile (IVP), and IV Rank (IVR).
- [x] **Analytical Greeks Calculation**: Vectorized pure-Python Black-Scholes Delta ($\Delta$), Gamma ($\Gamma$), Theta ($\Theta$), and Vega ($\mathcal{V}$) for liquid weekly/monthly strikes.
- [x] **Option Chain Visual UI**: Interactive strike ladder modal with Call/Put bars, Greeks badges, and IV smile plot.

### Phase 7: Real-Time Alerts & Webhooks
- [x] **Unified Background Alert Engine**: Async market-hours scheduler evaluating active triggers every 60 seconds with anti-spam cooldowns.
- [x] **Telegram Bot Notifications**: Automated Markdown trade alerts with current price, ADR % from LOD, RSI, and direct chart links.
- [x] **Discord Webhook Alerts**: Formatted embed notifications with color-coded severity (Green = Breakout, Red = Breakdown, Orange = ADR Climax).
- [x] **Custom Price Cross Alerts**: User-defined price triggers (`>`, `<`, `crosses_above`, `trailing_stop`).
- [x] **Browser Push Notifications**: HTML5 Notifications API integration for native desktop popups.
- [x] **Alerts Management UI**: Modal to create, pause, edit, and review trigger history and webhook configurations.

### Phase 8: Automation & Broker Integration
- [x] **Broker Abstraction Interface (`BaseBroker`)**: Pluggable interface for orders, positions, account balance, and square-off operations.
- [x] **Full-Featured Paper Trading Engine (`PaperBroker`)**: Virtual ₹1,000,000 portfolio with realistic slippage (0.05%), transaction fees, F&O lot sizes, and MTM P&L tracking.
- [x] **Dhan HQ API Adapter (`DhanBroker`)**: Live order placement (Regular, Intraday MIS, Delivery CNC, SL/SL-M) and margin inquiry.
- [x] **Zerodha Kite Connect Adapter (`KiteBroker`)**: Session token authentication and 1-click execution.
- [x] **Frontend Trading Desk**: Quick-order drawer from scanner table and chart, position book, and prominent Paper/Live toggle guardrail.
