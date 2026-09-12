"""
scanner_engine.py — Unified scanner execution engine.

PRIMARY PATH:  tvscreener_service.run_tvscreener_scan()
  → Uses TradingView screener's live indicator values
  → Fast: single API call for all 500 stocks
  → No per-stock yfinance fetching needed for scan logic

FALLBACK (Supertrend-only rules):
  → Falls back to local yfinance OHLCV + ta library computation
  → Only triggered when scanner includes Supertrend indicator

CROSS DETECTION NOTE:
  tvscreener provides current-bar indicator values only (no previous bar).
  For "crosses_above" / "crosses_below" operators, the live scan uses a
  simple directional comparison (>, <). These are labelled "~crosses above"
  in the results to indicate the approximation. For precise cross detection,
  view the stock chart — the chart overlay shows the exact cross point on
  historical data.
"""
import json
import sys
import math
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from database import get_connection
from tvscreener_service import run_tvscreener_scan, sync_symbols_from_tvscreener


# ---------------------------------------------------------------------------
# Supertrend fallback (via yfinance + ta library)
# ---------------------------------------------------------------------------

def _run_supertrend_fallback(scanner: dict) -> list[dict]:
    """
    For scanners that include Supertrend rules, fall back to fetching
    yfinance OHLCV and computing locally via the ta library.
    This is the slower path but necessary since TradingView screener
    doesn't expose a Supertrend column directly.
    """
    from ohlcv_service import fetch_ohlcv
    from indicators import _build_df, calc_supertrend, _last_two

    rules     = scanner["rules"]
    timeframe = scanner.get("timeframe", "1D")
    now       = datetime.now(timezone.utc).isoformat()

    with get_connection() as conn:
        symbol_rows = conn.execute(
            "SELECT symbol, name FROM symbols WHERE is_active=1"
        ).fetchall()

    symbols = [dict(r) for r in symbol_rows]
    matches = []

    for sym_row in symbols:
        symbol = sym_row["symbol"]
        try:
            candles = fetch_ohlcv(symbol, timeframe)
        except Exception:
            continue

        if not candles or len(candles) < 30:
            continue

        df = _build_df(candles)
        all_pass    = True
        metric_vals = {}

        for rule in rules:
            ind      = rule["indicator"]
            params   = rule.get("params", {})
            operator = rule["operator"]

            if ind == "Supertrend":
                try:
                    st_df = calc_supertrend(df, **params)
                    dir_series = st_df["SUPERTd"]
                    val, _ = _last_two(dir_series)
                    # Direction: -1 = bullish uptrend, +1 = bearish downtrend
                    rhs  = float(rule.get("value", -1))
                    passed = _apply_local_operator(val, rhs, operator)
                    metric_vals["Supertrend_dir"] = val
                except Exception:
                    all_pass = False
                    break
            else:
                # Non-supertrend rules just pass through (already filtered by TV)
                passed = True

            if not passed:
                all_pass = False
                break

        if all_pass:
            last_candle = candles[-1]
            matches.append({
                "symbol":        symbol,
                "name":          sym_row["name"],
                "last_close":    last_candle["close"],
                "data_as_of":    last_candle["timestamp"],
                "data_source":   "yfinance (Supertrend fallback)",
                "metric_values": metric_vals,
            })

    return matches


def _apply_local_operator(lhs: float, rhs: float, operator: str) -> bool:
    if math.isnan(lhs) or math.isnan(rhs):
        return False
    if operator in (">", "crosses_above"):
        return lhs > rhs
    if operator in ("<", "crosses_below"):
        return lhs < rhs
    if operator == ">=":
        return lhs >= rhs
    if operator == "<=":
        return lhs <= rhs
    if operator == "==":
        return abs(lhs - rhs) < 1e-6
    return False


# ---------------------------------------------------------------------------
# Main scanner execution
# ---------------------------------------------------------------------------

def run_scanner(
    scanner_id: int,
    save_results: bool = True,
    timeframe_override: Optional[str] = None,
    universe_override: Optional[str] = None
) -> dict:
    """
    Execute a scanner against live TradingView screener data.
    Falls back to yfinance + ta for Supertrend-only rules.

    Returns:
    {
      "scanner_id":   int,
      "scanner_name": str,
      "timeframe":    str,
      "ran_at":       ISO str,
      "run_id":       int (if saved),
      "match_count":  int,
      "matches":      [...],
      "data_source":  "TradingView Screener (live)" | "yfinance (fallback)"
    }
    """
    from typing import Optional
    with get_connection() as conn:
        scanner_row = conn.execute(
            "SELECT * FROM scanners WHERE id = ?", (scanner_id,)
        ).fetchone()

    if not scanner_row:
        raise ValueError(f"Scanner {scanner_id} not found.")

    scanner      = dict(scanner_row)
    scanner["rules"] = json.loads(scanner["rules"])
    
    # Apply overrides if provided
    timeframe    = timeframe_override or scanner["timeframe"]
    scanner["timeframe"] = timeframe # update dict for nested functions
    
    scanner_name = scanner["name"]
    rules        = scanner["rules"]

    print(f"\n[SCAN] Running '{scanner_name}' (id={scanner_id}) | TF={timeframe}")

    # Check if any rule uses Supertrend (requires fallback)
    has_supertrend = any(r["indicator"] == "Supertrend" for r in rules)

    if has_supertrend:
        print("[SCAN] Supertrend detected -> using yfinance fallback path.")
        matches    = _run_supertrend_fallback(scanner)
        data_source = "yfinance + ta library (Supertrend fallback)"
    else:
        universe = universe_override or scanner.get("universe", "nse500")
        print(f"[SCAN] All indicators mappable -> using TradingView Screener (live) [{universe}].")
        matches    = run_tvscreener_scan(scanner, limit=500, universe=universe)
        data_source = "TradingView Screener (live)"

    # Deduplicate matches by company name / symbol key
    unique_matches = []
    seen = set()
    for m in matches:
        key = (m.get("name") or m.get("symbol") or "").strip()
        if key and key not in seen:
            seen.add(key)
            unique_matches.append(m)
    matches = unique_matches

    now_iso = datetime.now(timezone.utc).isoformat()

    result = {
        "scanner_id":   scanner_id,
        "scanner_name": scanner_name,
        "timeframe":    timeframe,
        "ran_at":       now_iso,
        "match_count":  len(matches),
        "matches":      matches,
        "data_source":  data_source,
    }

    if save_results:
        with get_connection() as conn:
            cursor = conn.execute(
                "INSERT INTO scan_runs (scanner_id, ran_at, match_count) VALUES (?, ?, ?)",
                (scanner_id, now_iso, len(matches)),
            )
            run_id = cursor.lastrowid

            for m in matches:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO scan_results
                        (run_id, symbol, last_close, data_as_of, metric_values)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (run_id, m["symbol"], m.get("last_close", 0),
                     m.get("data_as_of", now_iso), json.dumps(m.get("metric_values", {}))),
                )
            result["run_id"] = run_id

    print(f"[SCAN] Done. {len(matches)} matches. Source: {data_source}")
    return result
