"""
vcp_service.py — Mark Minervini Volatility Contraction Pattern (VCP) & Trend Template Engine.

Implements Mark Minervini's standard 8-point Trend Template & VCP contraction detection logic:
  1. Price > 150-day & 200-day SMA
  2. 150-day SMA > 200-day SMA
  3. 200-day SMA trending UP for >= 1 month (22 bars)
  4. 50-day SMA > 150-day & 200-day SMA
  5. Price > 50-day SMA
  6. Price >= 30% above 52-week Low
  7. Price within 25% of 52-week High
  8. Successive price contractions (T1 > T2 > T3) with volume drying up near pivot level.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from database import get_connection
from ohlcv_service import fetch_ohlcv
from tvscreener_service import fetch_live_snapshot


def check_trend_template(df: pd.DataFrame) -> dict[str, Any]:
    """
    Validate Minervini's 8 Trend Template rules against daily OHLCV DataFrame.
    """
    if df is None or len(df) < 200:
        return {"is_trend_template": False, "reason": "Insufficient daily candle history (< 200 bars)"}

    close = df["close"]
    high = df["high"]
    low = df["low"]

    current_price = float(close.iloc[-1])
    sma50 = float(close.rolling(50).mean().iloc[-1])
    sma150 = float(close.rolling(150).mean().iloc[-1])
    sma200 = float(close.rolling(200).mean().iloc[-1])
    
    # 200-day SMA 22 bars ago
    sma200_22_ago = float(close.rolling(200).mean().iloc[-22]) if len(close) >= 222 else sma200

    low_52w = float(low.tail(252).min()) if len(low) >= 252 else float(low.min())
    high_52w = float(high.tail(252).max()) if len(high) >= 252 else float(high.max())

    cond1 = current_price > sma150 and current_price > sma200
    cond2 = sma150 > sma200
    cond3 = sma200 > sma200_22_ago  # 200 SMA trending up for at least 1 month
    cond4 = sma50 > sma150 and sma50 > sma200
    cond5 = current_price > sma50
    cond6 = current_price >= (low_52w * 1.30)   # At least 30% above 52W low
    cond7 = current_price >= (high_52w * 0.75)  # Within 25% of 52W high

    passed_count = sum([cond1, cond2, cond3, cond4, cond5, cond6, cond7])
    is_template = passed_count >= 6  # Allow 6 out of 7 for near-perfect setups

    return {
        "is_trend_template": is_template,
        "score": round((passed_count / 7) * 100, 1),
        "current_price": round(current_price, 2),
        "sma50": round(sma50, 2),
        "sma150": round(sma150, 2),
        "sma200": round(sma200, 2),
        "low_52w": round(low_52w, 2),
        "high_52w": round(high_52w, 2),
        "pct_above_52w_low": round(((current_price - low_52w) / low_52w) * 100, 1),
        "pct_below_52w_high": round(((high_52w - current_price) / high_52w) * 100, 1),
    }


def detect_vcp_contractions(df: pd.DataFrame) -> dict[str, Any]:
    """
    Detect Volatility Contraction Pattern (T1, T2, T3) over last 60-120 bars.
    """
    if df is None or len(df) < 60:
        return {"has_vcp": False, "contractions": [], "reason": "Insufficient candles"}

    recent = df.tail(120).copy().reset_index(drop=True)
    highs = recent["high"].values
    lows = recent["low"].values
    closes = recent["close"].values
    volumes = recent["volume"].values

    # Find swing highs (local peaks)
    peaks = []
    for i in range(5, len(highs) - 5):
        if highs[i] == max(highs[i-5:i+6]):
            peaks.append((i, highs[i]))

    if len(peaks) < 2:
        return {"has_vcp": False, "contractions": [], "reason": "Fewer than 2 local peaks"}

    contractions = []
    for idx in range(len(peaks) - 1):
        p1_idx, p1_val = peaks[idx]
        p2_idx, p2_val = peaks[idx+1]
        
        # Min low between p1 and p2
        trough_low = min(lows[p1_idx:p2_idx+1])
        pullback_pct = ((p1_val - trough_low) / p1_val) * 100
        contractions.append({
            "t_index": idx + 1,
            "peak_price": round(p1_val, 2),
            "trough_price": round(trough_low, 2),
            "pullback_pct": round(pullback_pct, 1)
        })

    if not contractions:
        return {"has_vcp": False, "contractions": []}

    # Check contraction tightening: T1 > T2 > T3
    tightening = True
    for i in range(len(contractions) - 1):
        if contractions[i]["pullback_pct"] < contractions[i+1]["pullback_pct"]:
            tightening = False
            break

    # Volume drying up check (current volume < 20-day avg volume)
    avg_vol_20 = np.mean(volumes[-20:]) if len(volumes) >= 20 else np.mean(volumes)
    curr_vol = volumes[-1]
    vol_dry_up = curr_vol < (avg_vol_20 * 0.85)

    pivot_level = max([c["peak_price"] for c in contractions]) if contractions else closes[-1]
    last_contraction = contractions[-1]["pullback_pct"] if contractions else 10.0

    # High quality VCP score formula
    vcp_score = 70.0
    if tightening:
        vcp_score += 15.0
    if vol_dry_up:
        vcp_score += 10.0
    if last_contraction < 5.0:  # Tight final contraction (< 5%)
        vcp_score += 5.0

    return {
        "has_vcp": bool(tightening or last_contraction < 8.0),
        "is_tightening": bool(tightening),
        "vol_dry_up": bool(vol_dry_up),
        "contractions": contractions,
        "contraction_count": int(len(contractions)),
        "vcp_score": float(round(min(vcp_score, 99.0), 1)),
        "pivot_level": float(round(pivot_level, 2)),
        "last_contraction_pct": float(last_contraction),
    }



def run_vcp_screener(universe: str = "nse500", limit: int = 100) -> dict[str, Any]:
    """
    Run full Minervini VCP Screener across live universe stocks.
    """
    now = datetime.now(timezone.utc).isoformat()
    # 1. Fetch live snapshot filtered by market cap / universe
    df_live = fetch_live_snapshot(timeframe="1D", limit=limit, universe=universe)
    if df_live is None or df_live.empty:
        return {"ran_at": now, "universe": universe, "total_scanned": 0, "vcp_matches": []}

    vcp_results = []
    scanned_count = len(df_live)

    # Pre-filter candidates with RSI >= 50 sorted by RSI desc, take top 30 max for fast execution
    candidates = []
    for idx, row in df_live.iterrows():
        rsi_val = float(row.get("rsi") or row.get("Relative Strength Index (14)") or 50)
        if rsi_val >= 50:
            candidates.append((rsi_val, row))
    candidates.sort(key=lambda x: x[0], reverse=True)
    candidates = [c[1] for c in candidates[:30]]

    for row in candidates:
        yf_sym = row.get("yf_symbol") or (row.get("symbol") + ".NS" if row.get("symbol") else None)
        if not yf_sym:
            continue

        raw_name = row.get("name") or row.get("Description") or yf_sym.replace(".NS", "")
        raw_price = float(row.get("price") or row.get("Price") or 0)
        change_pct = float(row.get("change_pct") or row.get("Change %") or 0)
        rsi_val = float(row.get("rsi") or row.get("Relative Strength Index (14)") or 50)



        try:
            # Fetch daily OHLCV candles
            candles = fetch_ohlcv(yf_sym, timeframe="1D", force_refresh=False)
            if not candles or len(candles) < 60:
                continue

            df_candles = pd.DataFrame(candles)
            trend_res = check_trend_template(df_candles)
            if not trend_res["is_trend_template"]:
                continue

            vcp_res = detect_vcp_contractions(df_candles)
            if not vcp_res["has_vcp"]:
                continue

            vcp_results.append({
                "symbol": str(yf_sym),
                "name": str(raw_name),
                "price": float(raw_price or trend_res["current_price"]),
                "change_pct": round(float(change_pct), 2),
                "rsi": round(float(rsi_val), 1),
                "sector": str(row.get("sector") or "N/A"),
                "market_cap": float(row.get("market_cap")) if row.get("market_cap") is not None else None,
                "trend_score": float(trend_res["score"]),
                "vcp_score": float(vcp_res["vcp_score"]),
                "pivot_level": float(vcp_res["pivot_level"]),
                "contractions": vcp_res["contractions"],
                "contraction_summary": " -> ".join([f"T{c['t_index']}: -{c['pullback_pct']}%" for c in vcp_res["contractions"]]),
                "vol_dry_up": bool(vcp_res["vol_dry_up"]),
                "sma50": float(trend_res["sma50"]),
                "sma150": float(trend_res["sma150"]),
                "sma200": float(trend_res["sma200"]),
            })

        except Exception as err:
            print(f"[VCP SCAN] Error processing {yf_sym}: {err}")
            continue

    # Sort results by VCP Score descending
    vcp_results = sorted(vcp_results, key=lambda x: x["vcp_score"], reverse=True)

    return {
        "ran_at": now,
        "universe": universe,
        "total_scanned": scanned_count,
        "match_count": len(vcp_results),
        "vcp_matches": vcp_results,
    }
