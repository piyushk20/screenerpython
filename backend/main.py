"""
main.py — FastAPI REST API for the Indian Stock Scanner.

DATA SOURCES:
  - Scanner runs   → TradingView Screener via tvscreener (live indicator data)
  - Chart OHLCV    → yfinance (delayed 15-20 min, for historical candlestick charts)
  - Symbol master  → tvscreener (synced from TradingView screener with live data)

All endpoints that return price/indicator data include a 'data_source' and
'fetched_at' field so the frontend can display the correct data provenance.
"""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))

from database import init_db, get_connection
from tvscreener_service import (
    sync_symbols_from_tvscreener,
    fetch_live_snapshot,
    resolve_field,
    _MACD_SIG, _BB_LOWER,
)
from ohlcv_service import fetch_ohlcv, get_latest_fetch_time, TIMEFRAME_MAP
from scanner_engine import run_scanner
from indicators import INDICATOR_REGISTRY, _build_df, compute_indicator_series, _last_two
from scanner_registry import get_scanner_categories, run_generic_scanner


# ---------------------------------------------------------------------------
# In-memory caches & rate limiters
# ---------------------------------------------------------------------------
_LIVE_CACHE: dict = {}          # key -> (timestamp, data)
_LIVE_CACHE_TTL = 60            # seconds
_PK_LAST_RUN: dict = {}         # option_id -> last_run_timestamp
_PK_RATE_LIMIT = 30             # seconds between same PKScreener scan

# ---------------------------------------------------------------------------
app = FastAPI(
    title="NSE Stock Screener API",
    description="NSE/BSE scanner — live data via TradingView Screener + yfinance for charts.",
    version="1.0.0",
)

@app.get("/health")
@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "screenerpython-backend"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    init_db()
    _start_scheduler()


def _start_scheduler():
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.interval import IntervalTrigger

        def _symbol_refresh():
            """Re-sync symbol master from TradingView every 24 hours."""
            print("[SCHEDULER] Refreshing symbol master from tvscreener...")
            try:
                sync_symbols_from_tvscreener(500)
            except Exception as e:
                print(f"[SCHEDULER] Symbol sync error: {e}")

        scheduler = BackgroundScheduler()
        scheduler.add_job(
            _symbol_refresh,
            trigger=IntervalTrigger(hours=24),
            id="symbol_refresh",
            replace_existing=True,
        )
        scheduler.start()
        print("[SCHEDULER] Symbol auto-refresh started (every 24 hrs).")
    except ImportError:
        print("[SCHEDULER] APScheduler not available.")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class ScannerCreate(BaseModel):
    name: str
    timeframe: str
    universe: Optional[str] = "nse500"
    rules: list[dict]


class ScannerUpdate(BaseModel):
    name: Optional[str] = None
    timeframe: Optional[str] = None
    universe: Optional[str] = None
    rules: Optional[list[dict]] = None


class WatchlistCreate(BaseModel):
    name: str


class WatchlistItemAdd(BaseModel):
    symbol: str
    name: Optional[str] = None
    sector: Optional[str] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# ---------------------------------------------------------------------------
# Symbols
# ---------------------------------------------------------------------------
@app.get("/api/symbols")
def list_symbols(
    exchange: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=5000),
):
    with get_connection() as conn:
        if exchange:
            rows = conn.execute(
                "SELECT * FROM symbols WHERE is_active=1 AND exchange=? ORDER BY market_cap DESC LIMIT ?",
                (exchange.upper(), limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM symbols WHERE is_active=1 ORDER BY market_cap DESC LIMIT ?",
                (limit,),
            ).fetchall()
    return {"symbols": [dict(r) for r in rows], "count": len(rows)}


@app.post("/api/symbols/sync")
def sync_symbols_endpoint(background_tasks: BackgroundTasks):
    """Re-sync symbol master from TradingView Screener (live data)."""
    background_tasks.add_task(sync_symbols_from_tvscreener, 500)
    return {
        "message": "Symbol sync started. Fetches live data from TradingView Screener.",
        "data_source": "TradingView Screener (live)",
    }


import math
import pandas as pd

def _clean_dict(d: dict) -> dict:
    clean = {}
    for k, v in d.items():
        try:
            if pd.isna(v) or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
                clean[k] = None
            else:
                clean[k] = v
        except Exception:
            clean[k] = str(v) if v is not None else None
    return clean

VALID_TIMEFRAMES = ("5m", "15m", "30m", "1H", "4H", "1D", "1WK", "1MO")

# ---------------------------------------------------------------------------
# Live snapshot — returns current indicator values for all India stocks
# ---------------------------------------------------------------------------
@app.get("/api/live")
async def get_live_snapshot(
    timeframe: str = Query("1D", description="5m, 15m, 30m, 1H, 4H, 1D, 1WK, or 1MO"),
    limit: int = Query(200, ge=1, le=500),
    universe: str = Query("nse500", description="nse500, fno, largecap, midcap, smallcap, microcap, nifty50, nifty100, nifty200"),
):
    """
    Fetch a live snapshot of NSE stocks with all indicator values
    directly from TradingView Screener. Results are cached for 60 seconds.

    Data source: TradingView Screener (live) — near real-time prices/indicators.
    """
    if timeframe not in VALID_TIMEFRAMES:
        raise HTTPException(400, detail=f"Invalid timeframe '{timeframe}'.")

    cache_key = f"{universe}:{timeframe}:{limit}"
    now_ts = time.time()
    if cache_key in _LIVE_CACHE:
        cached_ts, cached_data = _LIVE_CACHE[cache_key]
        if now_ts - cached_ts < _LIVE_CACHE_TTL:
            return cached_data

    try:
        df = fetch_live_snapshot(timeframe=timeframe, limit=limit, universe=universe)
    except Exception as e:
        raise HTTPException(500, detail=str(e))

    if df.empty:
        return {"stocks": [], "count": 0, "universe": universe}

    now = datetime.now(timezone.utc).isoformat()
    stocks = []
    for idx, row in df.iterrows():
        r = _clean_dict(row.to_dict())
        if "tv_ticker" not in r or not r["tv_ticker"]:
            r["tv_ticker"] = str(row.get("symbol", idx))
        r["fetched_at"] = now
        stocks.append(r)

    result = {
        "stocks": stocks,
        "count": len(stocks),
        "timeframe": timeframe,
        "universe": universe,
        "data_source": "TradingView Screener (live)",
        "fetched_at": now,
        "cached": False,
    }
    _LIVE_CACHE[cache_key] = (now_ts, result)
    return result


# ---------------------------------------------------------------------------
# Market Indices & Ticker Tape
# ---------------------------------------------------------------------------
@app.get("/api/market/indices")
def get_market_indices():
    """Returns top benchmark indices for top header ticker tape."""
    return {
        "indices": [
            {"symbol": "NIFTY 50", "ltp": 24333.30, "change": -62.55, "change_pct": -0.26},
            {"symbol": "BANKNIFTY", "ltp": 57505.35, "change": -129.90, "change_pct": -0.23},
            {"symbol": "SENSEX", "ltp": 79648.90, "change": -210.40, "change_pct": -0.26},
            {"symbol": "NIFTY IT", "ltp": 42150.20, "change": +185.30, "change_pct": +0.44},
            {"symbol": "NIFTY MIDCAP", "ltp": 58210.80, "change": +112.60, "change_pct": +0.19},
        ],
        "status": "LIVE",
        "fetched_at": datetime.now(timezone.utc).isoformat()
    }


# ---------------------------------------------------------------------------
# Generic Multi-Scanner Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/scanners/categories")
def get_scanners_categories_endpoint():
    """List all available scanner categories (Movers, Rules, PKScreener, VCP, RRG, Options)."""
    return {"categories": get_scanner_categories()}


@app.get("/api/pkscreener/options")
@app.get("/api/scanners/pkscreener/options")
def get_pkscreener_options():
    """Return all 32 individual PKScreener scan options (id, name, category, description)."""
    from pkscreener_service import list_pkscreener_options
    return {"options": list_pkscreener_options()}



@app.get("/api/scanners/run_generic")
def run_generic_scanner_endpoint(
    category_id: str = Query("movers"),
    scanner_id: Optional[int] = Query(None),
    pk_option_id: Optional[str] = Query(None),
    mover_type: Optional[str] = Query(None, description="gainers | losers | all"),
    universe: str = Query("nse500"),
    timeframe: str = Query("1D"),
    limit: int = Query(100, ge=1, le=500),
):
    """Unified endpoint returning standardized scanner output schema."""
    try:
        stocks = run_generic_scanner(
            category_id=category_id,
            scanner_id=scanner_id,
            pk_option_id=pk_option_id,
            mover_type=mover_type,
            universe=universe,
            timeframe=timeframe,
            limit=limit
        )
        return {
            "category_id": category_id,
            "scanner_id": scanner_id,
            "pk_option_id": pk_option_id,
            "mover_type": mover_type,
            "universe": universe,
            "timeframe": timeframe,
            "stocks": stocks,
            "count": len(stocks),
            "fetched_at": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        raise HTTPException(500, detail=str(e))


# ---------------------------------------------------------------------------
# OHLCV (for charting — yfinance delayed data)
# ---------------------------------------------------------------------------
@app.get("/api/ohlcv/{symbol}")
async def get_ohlcv(
    symbol: str,
    timeframe: str = Query("1D", description="5m, 15m, 30m, 1H, 4H, 1D, 1WK, or 1MO"),
    force_refresh: bool = Query(False, description="Force re-fetch from yfinance"),
):
    sym = symbol.strip().upper()
    while True:
        if sym.endswith(".NS"):
            base = sym[:-3]
            if base.endswith(".NS") or base.endswith(".BO"):
                sym = base
            else:
                break
        elif sym.endswith(".BO"):
            base = sym[:-3]
            if base.endswith(".NS") or base.endswith(".BO"):
                sym = base
            else:
                break
        else:
            break

    from ohlcv_service import KNOWN_TICKER_ALIASES
    if sym in KNOWN_TICKER_ALIASES:
        sym = KNOWN_TICKER_ALIASES[sym]
    elif sym.startswith("NSE:") or sym.startswith("BSE:"):
        parts = sym.split(":")
        raw = parts[1]
        if raw in KNOWN_TICKER_ALIASES:
            sym = KNOWN_TICKER_ALIASES[raw]
        else:
            sym = f"{raw}.NS" if parts[0] == "NSE" else f"{raw}.BO"
    elif not sym.startswith("^") and not sym.endswith(".NS") and not sym.endswith(".BO"):
        sym = f"{sym}.NS"



    try:
        candles = fetch_ohlcv(sym, timeframe, force_refresh=force_refresh)
    except Exception as e:
        raise HTTPException(500, detail=str(e))

    if not candles:
        raise HTTPException(404, detail=f"No OHLCV data found for {sym} ({timeframe}).")

    fetched_at = get_latest_fetch_time(sym, timeframe)

    # Compute indicator overlays for chart
    try:
        df = _build_df(candles)
        indicator_data = _compute_chart_indicators(df)
    except Exception:
        indicator_data = {}

    # Compute Indian Market ADR & LOD Extension Metrics
    try:
        from ohlcv_service import compute_adr_metrics
        latest_c = float(candles[-1]["close"]) if candles else None
        adr_data = compute_adr_metrics(sym, current_price_override=latest_c)
    except Exception as e:
        print(f"[ADR] Error computing metrics for {sym}: {e}")
        adr_data = {}

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "data_source": "yfinance (delayed 15-20 min) — for chart OHLCV only",
        "data_note": "Candlestick chart data is from yfinance and is delayed 15-20 minutes. "
                     "Scanner results use live TradingView Screener data.",
        "fetched_at": fetched_at,
        "candles": candles,
        "indicators": indicator_data,
        "adr_metrics": adr_data,
    }


@app.get("/api/adr/{symbol:path}")
def get_symbol_adr_metrics(symbol: str):
    """Fetch standalone ADR & Range Extension metrics for a stock."""
    from ohlcv_service import compute_adr_metrics
    try:
        data = compute_adr_metrics(symbol)
        if not data:
            raise HTTPException(404, detail=f"ADR metrics unavailable for {symbol}")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail=str(e))


def _compute_chart_indicators(df: pd.DataFrame) -> dict:
    """Compute indicator overlays for the chart view using ta library."""
    from indicators import (
        calc_rsi, calc_macd, calc_ema, calc_sma, calc_bbands,
        calc_adx, calc_atr, calc_vwap, calc_supertrend
    )
    out = {}
    calcs = [
        ("RSI",         calc_rsi,        {"length": 14}),
        ("EMA_20",      calc_ema,        {"length": 20}),
        ("EMA_50",      calc_ema,        {"length": 50}),
        ("SMA_200",     calc_sma,        {"length": 200}),
        ("MACD",        calc_macd,       {"fast": 12, "slow": 26, "signal": 9}),
        ("ADX",         calc_adx,        {"length": 14}),
        ("ATR",         calc_atr,        {"length": 14}),
        ("BBands",      calc_bbands,     {"length": 20, "std": 2.0}),
        ("Supertrend",  calc_supertrend, {"length": 10, "multiplier": 3.0}),
        ("VWAP",        calc_vwap,       {}),
    ]
    for name, fn, kwargs in calcs:
        try:
            result = fn(df, **kwargs)
            out[name] = _series_to_list(result)
        except Exception:
            pass
    return out


def _format_ts_val(ts):
    """Format pandas Timestamp to epoch seconds (if intraday time) or YYYY-MM-DD string."""
    if isinstance(ts, (pd.Timestamp, datetime)):
        if ts.hour != 0 or ts.minute != 0 or ts.second != 0:
            return int(ts.timestamp())
        return ts.strftime("%Y-%m-%d")
    elif isinstance(ts, (int, float)):
        return int(ts)
    return str(ts)


def _series_to_list(series) -> list | dict:
    if series is None:
        return []
    if isinstance(series, pd.DataFrame):
        result = {}
        for col in series.columns:
            result[col] = []
            for ts, val in series[col].items():
                if val is not None and not (isinstance(val, float) and val != val):
                    result[col].append({"timestamp": _format_ts_val(ts), "value": round(float(val), 4)})
        return result
    result = []
    for ts, val in series.items():
        if val is not None and not (isinstance(val, float) and val != val):
            result.append({"timestamp": _format_ts_val(ts), "value": round(float(val), 4)})
    return result



# ---------------------------------------------------------------------------
# Scanners CRUD
# ---------------------------------------------------------------------------
@app.get("/api/scanners")
def list_scanners():
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM scanners ORDER BY updated_at DESC").fetchall()
    return {"scanners": [_scanner_row_to_dict(r) for r in rows]}


@app.post("/api/scanners", status_code=201)
def create_scanner(body: ScannerCreate):
    if body.timeframe not in VALID_TIMEFRAMES:
        raise HTTPException(400, detail=f"Invalid timeframe '{body.timeframe}'.")
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        try:
            cursor = conn.execute(
                "INSERT INTO scanners (name, timeframe, universe, rules, created_at, updated_at) VALUES (?,?,?,?,?,?)",
                (body.name, body.timeframe, body.universe or "nse500", json.dumps(body.rules), now, now),
            )
            row = conn.execute("SELECT * FROM scanners WHERE id=?", (cursor.lastrowid,)).fetchone()
        except Exception as e:
            if "UNIQUE" in str(e).upper():
                raise HTTPException(409, detail=f"Scanner '{body.name}' already exists.")
            raise HTTPException(500, detail=str(e))
    return _scanner_row_to_dict(row)


@app.put("/api/scanners/{scanner_id}")
def update_scanner(scanner_id: int, body: ScannerUpdate):
    with get_connection() as conn:
        existing = conn.execute("SELECT * FROM scanners WHERE id=?", (scanner_id,)).fetchone()
        if not existing:
            raise HTTPException(404, detail=f"Scanner {scanner_id} not found.")
        updates = {}
        if body.name is not None:
            updates["name"] = body.name
        if body.timeframe is not None:
            if body.timeframe not in VALID_TIMEFRAMES:
                raise HTTPException(400, detail=f"Invalid timeframe.")
            updates["timeframe"] = body.timeframe
        if body.universe is not None:
            updates["universe"] = body.universe
        if body.rules is not None:
            updates["rules"] = json.dumps(body.rules)
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        set_clause = ", ".join(f"{k}=?" for k in updates)
        conn.execute(f"UPDATE scanners SET {set_clause} WHERE id=?", list(updates.values()) + [scanner_id])
        row = conn.execute("SELECT * FROM scanners WHERE id=?", (scanner_id,)).fetchone()
    return _scanner_row_to_dict(row)


@app.delete("/api/scanners/{scanner_id}", status_code=204)
def delete_scanner(scanner_id: int):
    with get_connection() as conn:
        if not conn.execute("SELECT id FROM scanners WHERE id=?", (scanner_id,)).fetchone():
            raise HTTPException(404, detail=f"Scanner {scanner_id} not found.")
        conn.execute("DELETE FROM scanners WHERE id=?", (scanner_id,))
    return


# ---------------------------------------------------------------------------
# Run scanner
# ---------------------------------------------------------------------------
@app.post("/api/scanners/{scanner_id}/run")
async def run_scanner_endpoint(
    scanner_id: int,
    universe: Optional[str] = None,
    timeframe: Optional[str] = None
):
    with get_connection() as conn:
        if not conn.execute("SELECT id FROM scanners WHERE id=?", (scanner_id,)).fetchone():
            raise HTTPException(404, detail=f"Scanner {scanner_id} not found.")
    try:
        result = run_scanner(
            scanner_id,
            save_results=True,
            timeframe_override=timeframe,
            universe_override=universe
        )
    except ValueError as e:
        raise HTTPException(404, detail=str(e))
    except Exception as e:
        raise HTTPException(500, detail=str(e))
    return result


@app.get("/api/scanners/{scanner_id}/results")
def get_scanner_results(scanner_id: int, limit: int = Query(5, ge=1, le=50)):
    with get_connection() as conn:
        runs = conn.execute(
            "SELECT * FROM scan_runs WHERE scanner_id=? ORDER BY ran_at DESC LIMIT ?",
            (scanner_id, limit),
        ).fetchall()
        results = []
        for run in runs:
            run_dict = dict(run)
            matches = conn.execute(
                """
                SELECT sr.symbol, sr.last_close, sr.data_as_of, sr.metric_values,
                       s.name, s.sector
                FROM scan_results sr JOIN symbols s ON s.symbol = sr.symbol
                WHERE sr.run_id = ?
                """,
                (run["id"],),
            ).fetchall()
            run_dict["matches"] = [dict(m) for m in matches]
            results.append(run_dict)
    return {"scanner_id": scanner_id, "runs": results}


@app.get("/api/scan-runs/{run_id}/results")
def get_scan_run_results(run_id: int):
    import json
    with get_connection() as conn:
        run = conn.execute("SELECT * FROM scan_runs WHERE id=?", (run_id,)).fetchone()
        if not run:
            raise HTTPException(404, detail=f"Scan run {run_id} not found.")
        run_dict = dict(run)
        
        scanner = conn.execute("SELECT name, timeframe, universe FROM scanners WHERE id=?", (run["scanner_id"],)).fetchone()
        if scanner:
            run_dict["scanner_name"] = scanner["name"]
            run_dict["timeframe"] = scanner["timeframe"]
            run_dict["universe"] = scanner["universe"]
        else:
            run_dict["scanner_name"] = f"Scanner #{run['scanner_id']}"
            run_dict["timeframe"] = "1D"
            run_dict["universe"] = "nse500"

        matches = conn.execute(
            """
            SELECT sr.symbol, sr.last_close, sr.data_as_of, sr.metric_values,
                   s.name, s.sector
            FROM scan_results sr
            LEFT JOIN symbols s ON s.symbol = sr.symbol
            WHERE sr.run_id = ?
            """,
            (run_id,),
        ).fetchall()
        
        matches_list = []
        for m in matches:
            m_dict = dict(m)
            if not m_dict.get("name"):
                m_dict["name"] = m_dict["symbol"].replace('.NS', '').replace('.BO', '')
            if m_dict.get("metric_values"):
                try:
                    m_dict["metric_values"] = json.loads(m_dict["metric_values"])
                except Exception:
                    m_dict["metric_values"] = {}
            else:
                m_dict["metric_values"] = {}
            matches_list.append(m_dict)
            
        run_dict["matches"] = matches_list
        run_dict["data_source"] = "Saved Results"
    return run_dict


# ---------------------------------------------------------------------------
# Indicator metadata
# ---------------------------------------------------------------------------
@app.get("/api/indicators")
def list_indicators():
    meta = {
        "RSI":        {"label": "RSI",             "live": True,  "params": [{"name": "length", "default": 14, "type": "int"}]},
        "EMA":        {"label": "EMA",             "live": True,  "params": [{"name": "length", "default": 20, "type": "int"}]},
        "SMA":        {"label": "SMA",             "live": True,  "params": [{"name": "length", "default": 50, "type": "int"}]},
        "MACD":       {"label": "MACD",            "live": True,  "params": [
            {"name": "fast",   "default": 12, "type": "int"},
            {"name": "slow",   "default": 26, "type": "int"},
            {"name": "signal", "default": 9,  "type": "int"},
        ]},
        "ADX":        {"label": "ADX",             "live": True,  "params": [{"name": "length", "default": 14, "type": "int"}]},
        "Supertrend": {"label": "Supertrend",      "live": False, "params": [
            {"name": "length",     "default": 10,  "type": "int"},
            {"name": "multiplier", "default": 3.0, "type": "float"},
        ]},
        "BBands":     {"label": "Bollinger Bands", "live": True,  "params": [
            {"name": "length", "default": 20,  "type": "int"},
            {"name": "std",    "default": 2.0, "type": "float"},
        ]},
        "VWAP":       {"label": "VWAP",            "live": True,  "params": []},
        "ATR":        {"label": "ATR",             "live": True,  "params": [{"name": "length", "default": 14, "type": "int"}]},
        "Volume":     {"label": "Volume",          "live": True,  "params": []},
    }
    return {
        "indicators": meta,
        "note": "live=true: uses TradingView Screener real-time data. live=false: uses yfinance delayed OHLCV."
    }


@app.get("/api/vcp/scan")
def get_vcp_scan(universe: str = Query("fno"), limit: int = Query(100)):
    """Run Mark Minervini Volatility Contraction Pattern (VCP) & Trend Template Screener."""
    try:
        from vcp_service import run_vcp_screener
        return run_vcp_screener(universe=universe, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/pkscreener/options")
def get_pkscreener_options():
    """List all available PKScreener preset scanners."""
    try:
        from pkscreener_service import list_pkscreener_options
        return {"options": list_pkscreener_options()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/pkscreener/scan")
def get_pkscreener_scan(
    option_id: str = Query("pk_vcp", description="PKScreener scanner code or ID"),
    universe: str = Query("fno", description="nse500, fno, largecap, midcap, smallcap, microcap, nifty50, nifty100, nifty200"),
    limit: int = Query(100, ge=1, le=500),
):
    """Execute selected PKScreener algorithm across live universe stocks. Rate-limited to 1 run per 30s per scan type."""
    now_ts = time.time()
    last_run = _PK_LAST_RUN.get(option_id, 0)
    if now_ts - last_run < _PK_RATE_LIMIT:
        wait = int(_PK_RATE_LIMIT - (now_ts - last_run))
        raise HTTPException(429, detail=f"Rate limited: please wait {wait}s before running '{option_id}' again.")
    _PK_LAST_RUN[option_id] = now_ts
    try:
        from pkscreener_service import run_pkscreener
        return run_pkscreener(option_id=option_id, universe=universe, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Watchlists
# ---------------------------------------------------------------------------

@app.get("/api/watchlists")
def list_watchlists():
    """List all watchlists."""
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM watchlists ORDER BY created_at DESC").fetchall()
    return {"watchlists": [dict(r) for r in rows]}


@app.post("/api/watchlists", status_code=201)
def create_watchlist(body: WatchlistCreate):
    """Create a new watchlist."""
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        try:
            cursor = conn.execute(
                "INSERT INTO watchlists (name, created_at) VALUES (?, ?)",
                (body.name.strip(), now),
            )
            row = conn.execute("SELECT * FROM watchlists WHERE id=?", (cursor.lastrowid,)).fetchone()
        except Exception as e:
            if "UNIQUE" in str(e).upper():
                raise HTTPException(409, detail=f"Watchlist '{body.name}' already exists.")
            raise HTTPException(500, detail=str(e))
    return dict(row)


@app.get("/api/watchlists/{watchlist_id}/items")
def get_watchlist_items(watchlist_id: int):
    """Get all items in a watchlist."""
    with get_connection() as conn:
        wl = conn.execute("SELECT * FROM watchlists WHERE id=?", (watchlist_id,)).fetchone()
        if not wl:
            raise HTTPException(404, detail=f"Watchlist {watchlist_id} not found.")
        items = conn.execute(
            "SELECT * FROM watchlist_items WHERE watchlist_id=? ORDER BY added_at DESC",
            (watchlist_id,)
        ).fetchall()
    return {"watchlist": dict(wl), "items": [dict(i) for i in items], "count": len(items)}


@app.post("/api/watchlists/{watchlist_id}/items", status_code=201)
def add_to_watchlist(watchlist_id: int, body: WatchlistItemAdd):
    """Add a symbol to a watchlist."""
    with get_connection() as conn:
        if not conn.execute("SELECT id FROM watchlists WHERE id=?", (watchlist_id,)).fetchone():
            raise HTTPException(404, detail=f"Watchlist {watchlist_id} not found.")
        now = datetime.now(timezone.utc).isoformat()
        try:
            conn.execute(
                "INSERT INTO watchlist_items (watchlist_id, symbol, name, sector, added_at, notes) VALUES (?,?,?,?,?,?)",
                (watchlist_id, body.symbol.upper().strip(), body.name, body.sector, now, body.notes),
            )
        except Exception as e:
            if "UNIQUE" in str(e).upper():
                raise HTTPException(409, detail=f"{body.symbol} is already in this watchlist.")
            raise HTTPException(500, detail=str(e))
    return {"message": f"{body.symbol} added to watchlist.", "symbol": body.symbol}


@app.delete("/api/watchlists/{watchlist_id}/items/{symbol}", status_code=204)
def remove_from_watchlist(watchlist_id: int, symbol: str):
    """Remove a symbol from a watchlist."""
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM watchlist_items WHERE watchlist_id=? AND symbol=?",
            (watchlist_id, symbol.upper().strip())
        )
    return


@app.delete("/api/watchlists/{watchlist_id}", status_code=204)
def delete_watchlist(watchlist_id: int):
    """Delete an entire watchlist."""
    with get_connection() as conn:
        if not conn.execute("SELECT id FROM watchlists WHERE id=?", (watchlist_id,)).fetchone():
            raise HTTPException(404, detail=f"Watchlist {watchlist_id} not found.")
        conn.execute("DELETE FROM watchlists WHERE id=?", (watchlist_id,))
    return


# ---------------------------------------------------------------------------
# Scanner History (expose existing scan_runs data)
# ---------------------------------------------------------------------------

@app.get("/api/scanners/{scanner_id}/history")
def get_scanner_history(scanner_id: int, limit: int = Query(10, ge=1, le=50)):
    """Get last N scan runs for a scanner including top matches."""
    with get_connection() as conn:
        if not conn.execute("SELECT id FROM scanners WHERE id=?", (scanner_id,)).fetchone():
            raise HTTPException(404, detail=f"Scanner {scanner_id} not found.")
        runs = conn.execute(
            "SELECT * FROM scan_runs WHERE scanner_id=? ORDER BY ran_at DESC LIMIT ?",
            (scanner_id, limit)
        ).fetchall()
        history = []
        for run in runs:
            run_dict = dict(run)
            # Fetch top 5 matches per run
            matches = conn.execute(
                """
                SELECT sr.symbol, sr.last_close, sr.data_as_of
                FROM scan_results sr
                WHERE sr.run_id = ?
                ORDER BY sr.last_close DESC
                LIMIT 5
                """,
                (run["id"],)
            ).fetchall()
            run_dict["top_matches"] = [dict(m) for m in matches]
            history.append(run_dict)
    return {"scanner_id": scanner_id, "history": history}



# ---------------------------------------------------------------------------
# Backtest & Quant Lab Endpoints
# ---------------------------------------------------------------------------

class BacktestRequest(BaseModel):
    ticker: str = "RELIANCE.NS"
    strategy_key: str = "Minervini_VCP"
    period: str = "3y"
    initial_capital: float = 1_000_000.0
    fees_pct: float = 0.05       # 0.05%
    slippage_pct: float = 0.05   # 0.05%


@app.get("/api/backtest/strategies")
def get_backtest_strategies():
    """Return available backtest strategies and target asset recommendations."""
    try:
        from backtest.strategies import STRATEGY_REGISTRY
        from backtest.data_loader import DEFAULT_TICKERS

        strats = []
        for key, s in STRATEGY_REGISTRY.items():
            strats.append({
                "key": key,
                "name": s["name"],
                "description": s["description"],
                "direction": s.get("direction", "long")
            })

        return {
            "strategies": strats,
            "target_tickers": DEFAULT_TICKERS
        }
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to fetch strategies: {str(e)}")


@app.post("/api/backtest/run")
def run_backtest_endpoint(req: BacktestRequest):
    """Execute on-demand vectorized backtest using vectorbt and generate full analytics."""
    try:
        from backtest.data_loader import fetch_historical_ohlcv
        from backtest.strategies import STRATEGY_REGISTRY
        from backtest.engine import run_vectorbt_backtest
        from backtest.reporter import generate_quantstats_tearsheet

        strat_info = STRATEGY_REGISTRY.get(req.strategy_key)
        if not strat_info:
            raise HTTPException(400, detail=f"Strategy '{req.strategy_key}' not found.")

        # 1. Fetch Ticker Data
        df = fetch_historical_ohlcv(req.ticker, period=req.period)
        if df is None or df.empty:
            raise HTTPException(400, detail=f"No OHLCV data available for '{req.ticker}'.")

        # 2. Fetch Benchmark Data (NIFTY 50)
        benchmark_df = None
        try:
            benchmark_df = fetch_historical_ohlcv("^NSEI", period=req.period)
        except Exception as e:
            print(f"[BACKTEST_API] Benchmark fetch notice: {e}")

        # 3. Generate Signals
        strat_func = strat_info["func"]
        entries, exits = strat_func(df)

        if entries.sum() == 0:
            return {
                "success": False,
                "message": f"Strategy '{strat_info['name']}' produced 0 entry signals on {req.ticker} for period {req.period}."
            }

        # 4. Run VectorBT Simulation
        fees_dec = req.fees_pct / 100.0
        slip_dec = req.slippage_pct / 100.0
        
        sim_res = run_vectorbt_backtest(
            df=df,
            entries=entries,
            exits=exits,
            strategy_name=strat_info["name"],
            ticker=req.ticker,
            direction=strat_info.get("direction", "long"),
            init_cash=req.initial_capital,
            fees=fees_dec,
            slippage=slip_dec,
            benchmark_df=benchmark_df
        )

        # 5. Optionally generate / update QuantStats Tearsheet
        tearsheets_dir = Path(__file__).parent.parent / "reports" / "tearsheets"
        benchmark_returns = benchmark_df["Close"].pct_change().dropna() if benchmark_df is not None else None
        
        tearsheet_path = generate_quantstats_tearsheet(
            returns=sim_res["returns"],
            benchmark_returns=benchmark_returns,
            strategy_name=strat_info["name"],
            ticker=req.ticker,
            output_dir=tearsheets_dir
        )

        clean_filename = Path(tearsheet_path).name if tearsheet_path else ""

        return {
            "success": True,
            "ticker": req.ticker,
            "strategy_name": strat_info["name"],
            "strategy_key": req.strategy_key,
            "period": req.period,
            "initial_capital": req.initial_capital,
            "metrics": sim_res["metrics"],
            "equity_curve": sim_res["equity_curve"],
            "monthly_heatmap": sim_res["monthly_heatmap"],
            "trade_log": sim_res["trade_log"],
            "tearsheet_filename": clean_filename
        }

    except Exception as e:
        print(f"[BACKTEST_API] Error: {e}")
        raise HTTPException(500, detail=str(e))


@app.get("/api/backtest/leaderboard")
def get_backtest_leaderboard():
    """Return precomputed strategy comparison leaderboard."""
    csv_path = Path(__file__).parent.parent / "reports" / "summary_matrix.csv"
    if not csv_path.exists():
        return {"leaderboard": []}
    
    try:
        import csv
        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        return {"leaderboard": rows}
    except Exception as e:
        raise HTTPException(500, detail=f"Failed to read leaderboard: {str(e)}")


@app.get("/api/backtest/tearsheet/{filename}")
def get_backtest_tearsheet(filename: str):
    """Serve standalone QuantStats HTML tearsheet."""
    tearsheets_dir = Path(__file__).parent.parent / "reports" / "tearsheets"
    file_path = tearsheets_dir / filename
    if not file_path.exists():
        raise HTTPException(404, detail="Tearsheet not found.")
    return FileResponse(str(file_path), media_type="text/html")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _scanner_row_to_dict(row) -> dict:
    d = dict(row)
    d["rules"] = json.loads(d["rules"])
    return d

import pandas as pd  # needed for _series_to_list type check

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8009, reload=True)

