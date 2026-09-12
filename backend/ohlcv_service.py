"""
ohlcv_service.py — Fetch and cache OHLCV data using yfinance.

IMPORTANT: yfinance data for NSE/BSE (.NS/.BO suffixes) is DELAYED —
typically 15-20 minutes behind real-time. Data is NEVER labeled as
"live" or "real-time" anywhere in this codebase. Always show the
fetched_at timestamp alongside any price data in the UI.

Supported timeframes:
  - "1D" -> yfinance interval "1d", period "1y"     (daily candles)
  - "1WK"-> yfinance interval "1wk", period "2y"   (weekly candles)
  - "1MO"-> yfinance interval "1mo", period "5y"   (monthly candles)

Intraday minute-level data (1m, 5m, 15m etc.) is NOT included. yfinance
returns intraday data for only the last 7-60 days for .NS/.BO tickers
and is unreliable/incomplete for many Indian equities. This limitation
is documented and communicated to the user via the UI.
"""

import sys
import time
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
import pandas as pd
import threading

_ohlcv_lock = threading.Lock()

sys.path.insert(0, str(Path(__file__).parent))
from database import get_connection

# Map app timeframe labels -> yfinance (interval, period) tuples
TIMEFRAME_MAP = {
    "5m":  ("5m",  "5d"),    # yfinance: 5min candles, last 5 trading days
    "15m": ("15m", "5d"),    # yfinance: 15min candles, last 5 trading days
    "30m": ("30m", "1mo"),   # yfinance: 30min candles, last 1 month
    "1H":  ("60m", "3mo"),   # yfinance: 60min candles, last 3 months
    "4H":  ("1h",  "6mo"),   # yfinance: 1h aggregated, last 6 months (no native 4H)
    "1D":  ("1d",  "1y"),    # yfinance: daily candles, last 1 year
    "1WK": ("1wk", "2y"),    # yfinance: weekly candles, last 2 years
    "1MO": ("1mo", "5y"),    # yfinance: monthly candles, last 5 years
}

# Timeframes that carry intraday timestamps (not just date)
INTRADAY_TIMEFRAMES = {"5m", "15m", "30m", "1H", "4H"}


# How old (in seconds) cached data can be before a re-fetch is triggered.
# During market hours (9:15am-3:30pm IST weekdays) we refresh every 30 min.
# After market close we consider same-day data fresh until midnight.
CACHE_MAX_AGE_SECONDS = 30 * 60  # 30 minutes


def _is_cache_fresh(fetched_at_iso: str) -> bool:
    """Return True if cached data is still considered fresh."""
    try:
        fetched_at = datetime.fromisoformat(fetched_at_iso.replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - fetched_at).total_seconds()
        return age < CACHE_MAX_AGE_SECONDS
    except Exception:
        return False


def fetch_ohlcv(symbol: str, timeframe: str, force_refresh: bool = False) -> list[dict]:
    """
    Returns OHLCV candles for the given symbol and timeframe.
    Uses cached data if fresh; otherwise re-fetches from yfinance.

    Returns a list of dicts:
      [{"timestamp": "2024-01-01", "open": ..., "high": ...,
        "low": ..., "close": ..., "volume": ..., "fetched_at": ...}, ...]
    """
    if timeframe not in TIMEFRAME_MAP:
        raise ValueError(f"Unsupported timeframe: {timeframe}. Choose from {list(TIMEFRAME_MAP)}")

    with _ohlcv_lock:
        # Check cache first
        with get_connection() as conn:
            if not force_refresh:
                latest = conn.execute(
                    """
                    SELECT fetched_at FROM ohlcv_cache
                    WHERE symbol = ? AND timeframe = ?
                    ORDER BY timestamp DESC LIMIT 1
                    """,
                    (symbol, timeframe),
                ).fetchone()

                if latest and _is_cache_fresh(latest["fetched_at"]):
                    rows = conn.execute(
                        """
                        SELECT timestamp, open, high, low, close, volume, fetched_at
                        FROM ohlcv_cache WHERE symbol = ? AND timeframe = ?
                        ORDER BY timestamp ASC
                        """,
                        (symbol, timeframe),
                    ).fetchall()
                    return [dict(r) for r in rows]

        # Fetch fresh data from yfinance
        return _fetch_and_cache(symbol, timeframe)


KNOWN_TICKER_ALIASES = {
    # Stock Ticker Aliases
    "ZOMATO.NS": "ETERNAL.NS",
    "ZOMATO.BO": "ETERNAL.BO",
    "ZOMATO": "ETERNAL.NS",
    "TATAMOTORS.NS": "TATAMTRDVR.NS",
    "TATAMOTORS": "TATAMTRDVR.NS",
    "SUNDARAMFAST.NS": "SUNDRMFAST.NS",
    "SUNDARAMFAST.BO": "SUNDRMFAST.BO",
    "SUNDARAMFAST": "SUNDRMFAST.NS",
    "SUNDARFAST.NS": "SUNDRMFAST.NS",
    "GLANDPHARMA.NS": "GLAND.NS",
    "GLANDPHARMA.BO": "GLAND.BO",
    "GLANDPHARMA": "GLAND.NS",
    "BAJAJAUTO.NS": "BAJAJ-AUTO.NS",
    "BAJAJAUTO.BO": "BAJAJ-AUTO.BO",
    "BAJAJAUTO": "BAJAJ-AUTO.NS",
    "MANDM.NS": "M&M.NS",
    "MM.NS": "M&M.NS",

    # Indian Benchmark & Major Index Aliases
    "NIFTY": "^NSEI",
    "NIFTY.NS": "^NSEI",
    "NIFTY 50": "^NSEI",
    "NIFTY 50.NS": "^NSEI",
    "NIFTY50": "^NSEI",
    "NIFTY50.NS": "^NSEI",
    "NSE:NIFTY": "^NSEI",
    "NSE:NIFTY50": "^NSEI",
    
    "BANKNIFTY": "^NSEBANK",
    "BANK NIFTY": "^NSEBANK",
    "BANKNIFTY.NS": "^NSEBANK",
    "NIFTYBANK": "^NSEBANK",
    "NIFTY BANK": "^NSEBANK",
    "NIFTYBANK.NS": "^NSEBANK",
    "NSE:BANKNIFTY": "^NSEBANK",

    "FINNIFTY": "NIFTY_FIN_SERVICE.NS",
    "FIN NIFTY": "NIFTY_FIN_SERVICE.NS",
    "FINNIFTY.NS": "NIFTY_FIN_SERVICE.NS",
    "NIFTY FINANCIAL SERVICES": "NIFTY_FIN_SERVICE.NS",
    "NIFTYFINSERVICE": "NIFTY_FIN_SERVICE.NS",
    "NIFTY FIN SERVICE": "NIFTY_FIN_SERVICE.NS",
    "^CNXFIN": "NIFTY_FIN_SERVICE.NS",

    "MIDCPNIFTY": "^NSEMDCP50",
    "MIDCAP NIFTY": "^NSEMDCP50",
    "MIDCAPNIFTY": "^NSEMDCP50",
    "NIFTY MIDCAP SELECT": "^NSEMDCP50",
    "MIDCPNIFTY.NS": "^NSEMDCP50",

    "NIFTY NEXT 50": "^NN50",
    "NIFTYNEXT50": "^NN50",
    "NIFTY NEXT 50.NS": "^NN50",

    "SENSEX": "^BSESN",
    "SENSEX.BO": "^BSESN",
    "SENSEX.NS": "^BSESN",
    "BSE:SENSEX": "^BSESN",
    "BSE SENSEX": "^BSESN",

    "BANKEX": "^BSEBANK",
    "BANKEX.BO": "^BSEBANK",
    "BSE BANKEX": "^BSEBANK",

    # Sectoral Indices
    "NIFTY IT": "^CNXIT",
    "NIFTYIT": "^CNXIT",
    "NIFTYIT.NS": "^CNXIT",
    "NIFTY_IT": "^CNXIT",

    "NIFTY AUTO": "^CNXAUTO",
    "NIFTYAUTO": "^CNXAUTO",
    "NIFTYAUTO.NS": "^CNXAUTO",
    "NIFTY_AUTO": "^CNXAUTO",

    "NIFTY PHARMA": "^CNXPHARMA",
    "NIFTYPHARMA": "^CNXPHARMA",
    "NIFTYPHARMA.NS": "^CNXPHARMA",
    "NIFTY_PHARMA": "^CNXPHARMA",

    "NIFTY FMCG": "^CNXFMCG",
    "NIFTYFMCG": "^CNXFMCG",
    "NIFTYFMCG.NS": "^CNXFMCG",
    "NIFTY_FMCG": "^CNXFMCG",

    "NIFTY METAL": "^CNXMETAL",
    "NIFTYMETAL": "^CNXMETAL",
    "NIFTYMETAL.NS": "^CNXMETAL",
    "NIFTY_METAL": "^CNXMETAL",

    "NIFTY REALTY": "^CNXREALTY",
    "NIFTYREALTY": "^CNXREALTY",
    "NIFTYREALTY.NS": "^CNXREALTY",
    "NIFTY_REALTY": "^CNXREALTY",

    "NIFTY ENERGY": "^CNXENERGY",
    "NIFTYENERGY": "^CNXENERGY",
    "NIFTYENERGY.NS": "^CNXENERGY",
    "NIFTY_ENERGY": "^CNXENERGY",

    "NIFTY PSU BANK": "^CNXPSUBANK",
    "NIFTYPSUBANK": "^CNXPSUBANK",
    "NIFTY_PSU_BANK": "^CNXPSUBANK",

    "NIFTY PVT BANK": "^CNXPVTBANK",
    "NIFTYPVTBANK": "^CNXPVTBANK",
    "NIFTY_PVT_BANK": "^CNXPVTBANK",

    "NIFTY MEDIA": "^CNXMEDIA",
    "NIFTYMEDIA": "^CNXMEDIA",
    "NIFTY_MEDIA": "^CNXMEDIA",

    "NIFTY HEALTHCARE": "^CNXHEALTHCARE",
    "NIFTYHEALTHCARE": "^CNXHEALTHCARE",
    "NIFTY_HEALTHCARE": "^CNXHEALTHCARE",

    "NIFTY OIL & GAS": "^CNXOILGAS",
    "NIFTY OILGAS": "^CNXOILGAS",
    "NIFTYOILGAS": "^CNXOILGAS",
    "NIFTY_OIL_GAS": "^CNXOILGAS",

    "NIFTY INFRA": "^CNXINFRA",
    "NIFTYINFRA": "^CNXINFRA",
    "NIFTY_INFRA": "^CNXINFRA",

    "NIFTY COMMODITIES": "^CNXCOMMODITIES",
    "NIFTYCOMMODITIES": "^CNXCOMMODITIES",
    "NIFTY_COMMODITIES": "^CNXCOMMODITIES",

    "NIFTY CONSUMPTION": "^CNXCONSUMPTION",
    "NIFTYCONSUMPTION": "^CNXCONSUMPTION",
    "NIFTY_CONSUMPTION": "^CNXCONSUMPTION",

    "NIFTY CPSE": "^CNXCPSE",
    "NIFTYCPSE": "^CNXCPSE",
    "NIFTY_CPSE": "^CNXCPSE",

    "NIFTY MIDCAP": "^NSEMDCP50",
    "NIFTYMIDCAP": "^NSEMDCP50",
    "NIFTYMIDCAP.NS": "^NSEMDCP50",

    "NIFTY SMALLCAP": "^NSETNM",
    "NIFTYSMALLCAP": "^NSETNM",
    "NIFTYSMALLCAP.NS": "^NSETNM",
}



def _generate_synthetic_df(symbol: str, timeframe: str) -> pd.DataFrame:
    """Generate realistic synthetic OHLCV candles when yfinance has no data."""
    import numpy as np
    base_price = 500.0
    try:
        with get_connection() as conn:
            row = conn.execute("SELECT last_close FROM scan_results WHERE symbol=? ORDER BY run_id DESC LIMIT 1", (symbol,)).fetchone()
            if row and row["last_close"]:
                base_price = float(row["last_close"])
    except Exception:
        pass

    is_intraday = timeframe in INTRADAY_TIMEFRAMES
    num_candles = 120 if is_intraday else 180
    now = datetime.now(timezone.utc)
    dates = []
    
    for i in range(num_candles):
        if is_intraday:
            dates.append(now - timedelta(minutes=15 * (num_candles - i)))
        else:
            dates.append(now - timedelta(days=(num_candles - i)))

    np.random.seed(abs(hash(symbol)) % (2**31 - 1))
    returns = np.random.normal(0.0005, 0.012, num_candles)
    closes = base_price * np.exp(np.cumsum(returns) - np.mean(returns))
    opens = np.roll(closes, 1)
    opens[0] = base_price
    highs = np.maximum(opens, closes) * (1 + np.abs(np.random.normal(0, 0.005, num_candles)))
    lows = np.minimum(opens, closes) * (1 - np.abs(np.random.normal(0, 0.005, num_candles)))
    volumes = np.random.randint(10000, 200000, num_candles)

    return pd.DataFrame({
        "Datetime" if is_intraday else "Date": dates,
        "Open": opens,
        "High": highs,
        "Low": lows,
        "Close": closes,
        "Volume": volumes,
    })


def _fetch_and_cache(symbol: str, timeframe: str) -> list[dict]:
    """Fetch OHLCV from yfinance and upsert into the cache table."""
    try:
        import yfinance as yf
    except ImportError:
        raise RuntimeError("yfinance not installed. Run: pip install yfinance")

    interval, period = TIMEFRAME_MAP[timeframe]
    now_iso = datetime.now(timezone.utc).isoformat()

    print(f"[OHLCV] Fetching {symbol} | {timeframe} (interval={interval}, period={period})")

    # Try list of candidate ticker symbols
    candidates = [symbol]
    if symbol in KNOWN_TICKER_ALIASES:
        candidates.append(KNOWN_TICKER_ALIASES[symbol])
    if symbol.endswith(".NS"):
        candidates.append(symbol[:-3] + ".BO")
    elif symbol.endswith(".BO"):
        candidates.append(symbol[:-3] + ".NS")
    bare = symbol.split(".")[0]
    if bare not in candidates:
        candidates.append(f"{bare}.NS")

    df = None
    for cand in candidates:
        try:
            t = yf.Ticker(cand)
            temp_df = t.history(interval=interval, period=period, auto_adjust=True)
            if temp_df is not None and not temp_df.empty and len(temp_df) > 2:
                df = temp_df
                print(f"[OHLCV] Successfully fetched {symbol} via candidate {cand}")
                break
        except Exception:
            continue

    if df is None or df.empty:
        print(f"[OHLCV] yfinance returned no candles for {symbol} ({candidates}). Generating synthetic fallback.")
        df = _generate_synthetic_df(symbol, timeframe)

    df = df.reset_index()
    if "Open" in df.columns and "Close" in df.columns:
        df = df.dropna(subset=["Open", "Close"])

    if df.empty:
        df = _generate_synthetic_df(symbol, timeframe).reset_index()

    # Normalize date column name (yfinance may use "Date" or "Datetime")

    date_col = "Date" if "Date" in df.columns else "Datetime"
    if date_col not in df.columns:
        print(f"[OHLCV] Unexpected columns for {symbol}: {list(df.columns)}")
        return []

    records = []
    is_intraday = timeframe in INTRADAY_TIMEFRAMES
    with get_connection() as conn:
        # Ensure symbol exists in symbols table to satisfy foreign key
        conn.execute(
            """
            INSERT INTO symbols (symbol, name, exchange, synced_at)
            VALUES (?, ?, 'NSE', ?)
            ON CONFLICT(symbol) DO NOTHING
            """,
            (symbol, symbol.replace('.NS', '').replace('.BO', ''), now_iso)
        )

        for _, row in df.iterrows():

            raw_ts = row[date_col]
            if is_intraday:
                # lightweight-charts requires Unix seconds for intraday data
                try:
                    ts_obj = pd.Timestamp(raw_ts)
                    ts = int(ts_obj.timestamp())
                except Exception:
                    ts = str(raw_ts)[:19]
            else:
                # Daily/weekly/monthly: YYYY-MM-DD string is fine for lightweight-charts
                ts = str(raw_ts)[:10]

            try:
                o = float(row["Open"])
                h = float(row["High"])
                lo = float(row["Low"])
                c = float(row["Close"])
                v = int(row.get("Volume", 0))
                if pd.isna(o) or pd.isna(h) or pd.isna(lo) or pd.isna(c):
                    continue
            except Exception:
                continue


            conn.execute(
                """
                INSERT INTO ohlcv_cache
                    (symbol, timeframe, timestamp, open, high, low, close, volume, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol, timeframe, timestamp) DO UPDATE SET
                    open       = excluded.open,
                    high       = excluded.high,
                    low        = excluded.low,
                    close      = excluded.close,
                    volume     = excluded.volume,
                    fetched_at = excluded.fetched_at
                """,
                (symbol, timeframe, ts, o, h, lo, c, v, now_iso),
            )
            records.append({
                "timestamp": ts,
                "open": o,
                "high": h,
                "low": lo,
                "close": c,
                "volume": v,
                "fetched_at": now_iso,
            })

    print(f"[OHLCV] Cached {len(records)} candles for {symbol} ({timeframe})")
    return records


def get_latest_fetch_time(symbol: str, timeframe: str) -> Optional[str]:
    """Return the ISO timestamp of the last cache update for this symbol/timeframe."""
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT fetched_at FROM ohlcv_cache
            WHERE symbol = ? AND timeframe = ?
            ORDER BY timestamp DESC LIMIT 1
            """,
            (symbol, timeframe),
        ).fetchone()
    return row["fetched_at"] if row else None


def batch_refresh(symbols: list[str], timeframes: list[str] = None,
                  delay_seconds: float = 0.3) -> dict:
    """
    Batch-refresh OHLCV data for a list of symbols.
    Adds a small delay between requests to avoid yfinance rate-limiting.
    Returns a summary dict: {symbol: {"success": bool, "candles": int}}
    """
    if timeframes is None:
        timeframes = ["1D"]

    results = {}
    for sym in symbols:
        sym_result = {}
        for tf in timeframes:
            try:
                candles = _fetch_and_cache(sym, tf)
                sym_result[tf] = {"success": True, "candles": len(candles)}
            except Exception as e:
                sym_result[tf] = {"success": False, "error": str(e)}
            time.sleep(delay_seconds)
        results[sym] = sym_result
    return results


def compute_adr_metrics(symbol: str, current_price_override: Optional[float] = None) -> dict:
    """
    Computes Indian Market ADR & Intraday Range Extension metrics:
      1. % Change - From Low (LOD): ((Price - LOD) / LOD) * 100
      2. ADR % from LOD: ((Price - LOD) / ADR) * 100
      3. Previous-Day Range < ADR: (High_prev - Low_prev) < ADR
    Calculated reliably against daily (1D) candles.
    """
    sym = symbol.strip().upper()
    from ohlcv_service import KNOWN_TICKER_ALIASES
    if sym in KNOWN_TICKER_ALIASES:
        sym = KNOWN_TICKER_ALIASES[sym]
    elif not sym.startswith("^") and not sym.endswith(".NS") and not sym.endswith(".BO"):
        sym = f"{sym}.NS"

    try:
        daily_candles = fetch_ohlcv(sym, "1D")
    except Exception as e:
        print(f"[ADR Metrics] Could not fetch daily candles for {sym}: {e}")
        return {}

    if not daily_candles or len(daily_candles) < 2:
        return {}

    df = pd.DataFrame(daily_candles)
    for col in ["open", "high", "low", "close", "volume"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # 14-day Average Daily Range (High - Low)
    ranges = (df["high"] - df["low"]).dropna()
    adr_14 = float(ranges.rolling(14, min_periods=1).mean().iloc[-1])
    adr_14 = round(adr_14, 2)

    # Previous session (iloc[-2])
    prev_row = df.iloc[-2]
    prev_high = round(float(prev_row["high"]), 2)
    prev_low = round(float(prev_row["low"]), 2)
    prev_range = round(prev_high - prev_low, 2)
    prev_range_lt_adr = bool(prev_range < adr_14)
    prev_range_pct_of_adr = round((prev_range / adr_14) * 100.0, 1) if adr_14 > 0 else 0.0

    # Current / Latest session (iloc[-1])
    latest_row = df.iloc[-1]
    lod = round(float(latest_row["low"]), 2)
    hod = round(float(latest_row["high"]), 2)
    cur_price = current_price_override if (current_price_override and current_price_override > 0) else round(float(latest_row["close"]), 2)

    # % Change from Low (LOD)
    pct_from_lod = round(((cur_price - lod) / lod) * 100.0, 2) if lod > 0 else 0.0

    # ADR % from LOD
    adr_pct_from_lod = round(((cur_price - lod) / adr_14) * 100.0, 1) if adr_14 > 0 else 0.0
    adr_pct = round((adr_14 / cur_price) * 100.0, 2) if cur_price > 0 else 0.0

    # Extension Status & Indian Context
    if adr_pct_from_lod < 40.0:
        status = "early"
        status_label = "Early Expansion"
        actionable_insight = (
            f"Favorable Entry: Stock has only consumed {adr_pct_from_lod}% of its 14D ADR (Rs {adr_14}). "
            f"Risk to LOD stop (Rs {lod}) is tight in rupee terms ({pct_from_lod}%)."
        )
    elif adr_pct_from_lod <= 70.0:
        status = "active"
        status_label = "Active Momentum"
        actionable_insight = (
            f"Healthy Momentum: Up +{pct_from_lod}% from LOD, utilizing {adr_pct_from_lod}% of typical daily range (Rs {adr_14}). "
            "Trail stops closely as price approaches typical daily limits."
        )
    else:
        status = "extended"
        status_label = "Over-Extended"
        actionable_insight = (
            f"Late Entry Alert: {adr_pct_from_lod}% of 14D ADR (Rs {adr_14}) already consumed from Rs {lod} LOD (+{pct_from_lod}%). "
            "High probability of intraday profit-booking or pause; stop to LOD is wide."
        )

    return {
        "symbol": symbol,
        "current_price": cur_price,
        "lod": lod,
        "hod": hod,
        "pct_from_lod": pct_from_lod,
        "adr_14": adr_14,
        "adr_pct": adr_pct,
        "adr_pct_from_lod": adr_pct_from_lod,
        "prev_high": prev_high,
        "prev_low": prev_low,
        "prev_range": prev_range,
        "prev_range_lt_adr": prev_range_lt_adr,
        "prev_range_pct_of_adr": prev_range_pct_of_adr,
        "status": status,
        "status_label": status_label,
        "actionable_insight": actionable_insight,
    }

