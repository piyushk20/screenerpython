# AGENTS.md — NSE Stock Screener (screenerpython)

> Behavioral rules and architecture conventions for AI agents working in this codebase.

---

## Project Overview

This is a **real-time NSE stock screener** with:
- **Backend**: FastAPI (Python 3.11+) on port **8009**
- **Frontend**: React + Vite on port **5180**
- **Database**: SQLite (`scanner.db` in project root)
- **Data Sources**: `tvscreener` (live indicators) + `yfinance` (OHLCV charts)

---

## Startup Protocol

When asked to "run", "start", or "open in browser":

1. **Check if backend is already running:**
   ```bash
   curl http://127.0.0.1:8009/health
   ```

2. **Start backend** (if not running):
   ```bash
   .venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8009
   ```

3. **Start frontend** (if not running):
   ```bash
   cd frontend && npm run dev
   ```

4. **Verify** before opening browser:
   - Backend: `http://127.0.0.1:8009/health` must return 200
   - Frontend: `http://localhost:5180` must load HTML

---

## Architecture Rules

### Backend Files

| File | Responsibility | Do NOT |
|------|---------------|--------|
| `main.py` | FastAPI routes only | Add business logic here |
| `tvscreener_service.py` | All live TradingView data | Import yfinance here |
| `ohlcv_service.py` | yfinance OHLCV for charts | Use for live indicators |
| `scanner_engine.py` | Rule evaluation vs DataFrame | Add API calls here |
| `indicators.py` | Map indicator names to TV fields | Hardcode strings elsewhere |
| `database.py` | SQLite schema + get_connection() | Use raw sqlite3 outside |
| `symbol_sync.py` | Periodic NSE symbol refresh | Call on every request |

### Frontend Files

| File | Responsibility |
|------|---------------|
| `App.jsx` | All UI components + state |
| `api.js` | ALL API calls — use typed wrappers only |
| `index.css` | Design tokens — use CSS variables, not hardcoded colors |

---

## Critical Rules

### 1. Symbol Normalization
- TradingView returns `NSE:RELIANCE` or `BSE:RELIANCE`
- Always normalize to `RELIANCE.NS` (NSE) or `RELIANCE.BO` (BSE) for yfinance
- `ohlcv_service.py` handles this — do not bypass it

### 2. Deduplication
- TradingView lists same company on NSE and BSE
- Deduplicate by `Description` (company name), keep NSE entry
- Runs inside `tvscreener_service.fetch_live_snapshot()` — do not remove

### 3. Timeframe Mapping
- Frontend sends: `5m`, `15m`, `30m`, `1H`, `4H`, `1D`, `1WK`, `1MO`
- Map via `TIMEFRAME_MAP` in `main.py` before passing to tvscreener or yfinance

### 4. F&O Universe
- Defined as `NSE_FNO_SYMBOLS` list in `tvscreener_service.py`
- Post-filtered after screener fetch (not a TradingView API param)
- To update eligible stocks: edit `NSE_FNO_SYMBOLS` only

### 5. Scanner Rules JSON Format
```json
{
  "indicator": "RSI",
  "params": { "length": 14 },
  "operator": ">",
  "value_type": "number",
  "value": 55
}
```
Indicator vs indicator (crossover):
```json
{
  "indicator": "EMA",
  "params": { "length": 20 },
  "operator": "crosses_above",
  "value_type": "indicator",
  "value": { "indicator": "EMA", "params": { "length": 50 } }
}
```

### 6. Database
- Always use `database.get_connection()` — never raw `sqlite3.connect()`
- Schema: add columns only — never drop or rename

### 7. lightweight-charts v5 API
- CORRECT: `chart.addSeries(CandlestickSeries, options)`
- WRONG: `chart.addCandlestickSeries(options)` — removed in v5

---

## Anti-Patterns

| Anti-Pattern | Why Bad | Correct Approach |
|-------------|---------|-----------------|
| `nsefin` import | Hangs on Windows | Use `yfinance` |
| `scipy.stats.linregress` | Not installed | Use numpy manual regression |
| tvscreener per-request for charts | Too slow | Use `ohlcv_service.py` |
| Global `pip install` | Breaks venv | `.venv\Scripts\pip install` |
| `chart.addCandlestickSeries()` | v5 removed | `chart.addSeries(CandlestickSeries)` |
| Hardcoded hex colors in JSX | Inconsistent | Use `var(--color-*)` CSS tokens |

---

## Scanner Naming Convention

For auto-categorization, names must follow `{Category}: {Description}`:
- `Bullish: ...`  → Green badge
- `Bearish: ...`  → Red badge
- `Momentum: ...` → Amber badge
- Other           → Purple (Custom) badge

---

## Quick Test Commands

```bash
# Health check
curl http://127.0.0.1:8009/health

# Live snapshot
curl "http://127.0.0.1:8009/api/live?universe=nse500&limit=10&timeframe=1D"

# F&O universe
curl "http://127.0.0.1:8009/api/live?universe=fno&limit=20&timeframe=1D"

# Chart data
curl "http://127.0.0.1:8009/api/ohlcv/RELIANCE?interval=1d&period=3mo"

# All scanners
curl http://127.0.0.1:8009/api/scanners

# Frontend build check
cd frontend && npm run build
```

---

## Stable State

| Component | Port | Launch Command |
|-----------|------|----------------|
| FastAPI Backend | 8009 | `.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8009` |
| Vite Frontend | 5180 | `cd frontend && npm run dev` |

### Key Verified Capabilities (2026-08-13):
- **FastAPI Health Check**: `http://127.0.0.1:8009/health` returns `200 OK`.
- **Timeframe Scanner Engine**: Server-side `FieldWithInterval` filters for TradingView API across `5m`, `15m`, `30m`, `1H`, `4H`, `1D`, `1WK`, `1MO`.
- **Universe Post-Filtering**: Strict post-filters for `fno`, `largecap`, `midcap`, `smallcap`, and `microcap`.
- **Intraday Charts**: `ohlcv_service.py` stores numeric Unix epoch seconds for intraday candles (`5m` to `4H`) so `lightweight-charts` renders sub-daily candles accurately.
- **Institutional UI/UX**: Dark theme with live symbol search, universe pills, RSI badges, stats summary cards, and in-chart timeframe toolbar.
- **Thread-safe Backend Architecture**: All critical data-fetching endpoints (`/api/ohlcv`, `/api/scanners/run`, `/api/live`) execute synchronously via `async def` and SQLite utilizes a `@contextmanager` to prevent file descriptor leaks and native crashes during rapid concurrent chart interactions.

Last verified: **2026-08-13**
