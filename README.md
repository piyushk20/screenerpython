# 📈 NSE Stock Screener

> A powerful, real-time Indian stock screener with TradingView-style condition builders, live candlestick charts, and 12+ premade scans — built with FastAPI + React.

![Tech Stack](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)
![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?style=flat-square&logo=react)
![Data](https://img.shields.io/badge/Data-TradingView%20%2B%20yFinance-orange?style=flat-square)
![DB](https://img.shields.io/badge/Database-SQLite-blue?style=flat-square&logo=sqlite)
![Python](https://img.shields.io/badge/Python-3.11%2B-yellow?style=flat-square&logo=python)

---

## 🚀 Features

### 📊 Live Market Dashboard
- Real-time NSE stock data powered by **TradingView Screener API** via `tvscreener`
- Live table with RSI, MACD, EMA 20/50/200, ADX, Bollinger Bands, ATR, Stochastic RSI and more
- **Deduplication**: NSE listings always preferred over BSE duplicates

### 🔍 Custom Scanner Builder
- Build multi-condition scanners with an intuitive rule builder
- Supports **crossover / crossunder** operators (e.g., EMA 20 crosses above EMA 50)
- **Stepper buttons** (+/−) to fine-tune numeric threshold values
- Timeframe selector: `5m`, `15m`, `30m`, `1H`, `4H`, `1D`, `1WK`, `1MO`
- Universe picker: **NSE 500**, **F&O Stocks**, **Large / Mid / Small / Micro Cap**

### 📦 Premade Scanners (12 built-in)
| Category | Scanners |
|----------|----------|
| 🟢 **Bullish** | RSI Momentum (55–75), Golden Cross, Price Above All EMAs, MACD Crossover |
| 🔴 **Bearish** | RSI Overbought (>70), Death Cross, EMA Crossunder, RSI Oversold (<30) |
| ⚡ **Momentum** | ADX Strong Trend, 52-Week High Breakout, Trend Riding (F&O), RSI+MACD Dual Confirm |

### 🕯️ Candlestick Charts
- Click any stock row → full candlestick chart powered by `lightweight-charts` v5
- Configurable timeframe (5m to 1MO)
- Overlaid EMA 20 and EMA 50 lines
- Automatic NSE suffix mapping (.NS) with BSE fallback (.BO)

### 🌐 Market Universes
| Universe | Description |
|----------|-------------|
| `nse500` | Top 500 NSE-listed companies by market cap |
| `fno` | NSE F&O eligible stocks (~200 liquid derivatives) |
| `largecap` | Market cap > ₹20,000 Cr |
| `midcap` | Market cap ₹4,000–₹20,000 Cr |
| `smallcap` | Market cap ₹800–₹4,000 Cr |
| `microcap` | Market cap < ₹800 Cr |

---

## 🏗️ Architecture

```
screenerpython/
├── backend/
│   ├── main.py                 # API routes & app entry point
│   ├── tvscreener_service.py   # Live data from TradingView Screener
│   ├── ohlcv_service.py        # Historical OHLCV via yfinance
│   ├── scanner_engine.py       # Rule evaluation & match logic
│   ├── indicators.py           # Indicator field resolution helpers
│   ├── symbol_sync.py          # NSE symbol list sync & cache
│   └── database.py             # SQLite schema & connection manager
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Main UI (dashboard, builder, chart)
│   │   ├── api.js              # API client (fetch wrappers)
│   │   ├── index.css           # Dark-mode design system
│   │   └── useToast.js         # Toast notification hook
│   └── vite.config.js          # Vite config with /api proxy → :8009
│
├── scanner.db                  # SQLite database
└── requirements.txt
```

### Data Flow
```
Browser → Vite (:5180) → [/api/*] proxy → FastAPI (:8009)
                                           ├── tvscreener → TradingView (live indicators)
                                           └── yfinance   → Yahoo Finance (OHLCV charts)
```

---

## ⚙️ Setup & Installation

### Prerequisites
- Python 3.11+
- Node.js 18+

### 1. Clone & Install Backend
```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

### 2. Install Frontend
```bash
cd frontend
npm install
```

---

## 🏃 Running the App

### Backend (FastAPI)
```bash
.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8009
```
- API Base: `http://127.0.0.1:8009`
- Swagger Docs: `http://127.0.0.1:8009/docs`

### Frontend (Vite Dev Server)
```bash
cd frontend
npm run dev
# Opens: http://localhost:5180
```

---

## 📡 API Reference

### Live Snapshot
```
GET /api/live?timeframe=1D&limit=200&universe=nse500
```
| Param | Options | Default |
|-------|---------|---------|
| `timeframe` | `5m` `15m` `30m` `1H` `4H` `1D` `1WK` `1MO` | `1D` |
| `limit` | 1–500 | `200` |
| `universe` | `nse500` `fno` `largecap` `midcap` `smallcap` `microcap` | `nse500` |

### OHLCV Chart Data
```
GET /api/ohlcv/{symbol}?interval=1d&period=6mo
```

### Scanners CRUD
```
GET    /api/scanners              # List all scanners
POST   /api/scanners              # Create scanner
PUT    /api/scanners/{id}         # Update scanner
DELETE /api/scanners/{id}         # Delete scanner
POST   /api/scanners/{id}/run     # Run scanner & store results
GET    /api/scanners/{id}/results # Get last run results
```

---

## 🛠️ Supported Indicators

| Indicator | Operators | Notes |
|-----------|-----------|-------|
| RSI | `>` `<` `>=` `<=` `==` | Length: 7, 14, 21 |
| EMA | All + `crosses_above` `crosses_below` | Any length |
| MACD | `>` `<` `==` | 12/26/9 params |
| ADX | `>` `<` | Length 14 |
| Bollinger Bands | `>` `<` | Upper/Lower |
| ATR | `>` `<` | True Range |
| Stochastic RSI | `>` `<` | 3,3,14,14 |
| Volume | `>` `<` | Absolute |

---

## 🎨 Design System

Dark-mode CSS custom properties:

```css
--color-bg          #0d1117   (Main background)
--color-surface     #161b22   (Card surfaces)
--color-border      #30363d   (Borders)
--color-accent      #58a6ff   (Primary accent)
--color-success     #3fb950   (Green)
--color-danger      #f85149   (Red)
--color-warning     #d29922   (Amber)
--color-text        #e6edf3   (Primary text)
--color-text-dim    #8b949e   (Muted text)
```

---

## 🔄 Known Behaviours

| Issue | Resolution |
|-------|-----------|
| Indian tickers need `.NS` suffix in yfinance | `ohlcv_service.py` auto-appends, falls back to `.BO` |
| BSE/NSE duplicate rows in screener | Deduplicated by company name — NSE entry kept |
| `lightweight-charts` v5 API change | Uses `chart.addSeries(CandlestickSeries)` — not legacy methods |

---

## 📦 Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `fastapi` | 0.141.1 | REST API |
| `uvicorn` | 0.52.1 | ASGI server |
| `tvscreener` | 0.4.0 | TradingView screener client |
| `yfinance` | 1.5.2 | Historical OHLCV |
| `pandas` | 3.0.5 | Data processing |
| `APScheduler` | 3.11.3 | Background jobs |
| `ta` | 0.11.0 | Technical indicators |
| `lightweight-charts` | v5 | Candlestick charts |
| `react` + `vite` | 18+ / 8.x | Frontend |

---

## 📝 License

MIT — free to use, modify and distribute.
