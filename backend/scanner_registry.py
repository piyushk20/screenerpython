"""
scanner_registry.py — Universal Scanner Registry & Adapter

Standardizes scanner outputs across:
  1. Live TradingView Snapshots / Movers (default)
  2. Saved Custom SQLite Rule Scanners (run_scanner)
  3. PKScreener (run_pkscreener)
  4. VCP Pattern Screener (run_vcp_screener)
  5. RRG Relative Rotation (live snapshot sorted by RS)
  6. Options & Key Levels (live snapshot with level overlays)
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional

sys.path.insert(0, str(Path(__file__).parent))

from tvscreener_service import fetch_live_snapshot
from database import get_connection

SCANNER_CATEGORIES = [
    {
        "id": "movers",
        "name": "Live Movers & Snapshots",
        "type": "live",
        "description": "Real-time top volume, top gainers/losers from TradingView",
        "icon": "Zap"
    },
    {
        "id": "custom",
        "name": "Custom Rule Scanners",
        "type": "rules",
        "description": "User-configured multi-indicator technical rules",
        "icon": "Filter"
    },
    {
        "id": "pkscreener",
        "name": "PKScreener Momentum",
        "type": "pkscreener",
        "description": "Breakouts, momentum surge, volume shocks",
        "icon": "TrendingUp"
    },
    {
        "id": "vcp",
        "name": "VCP Patterns",
        "type": "pattern",
        "description": "Minervini Volatility Contraction Pattern setups",
        "icon": "Activity"
    },
    {
        "id": "rrg",
        "name": "RRG Rotation",
        "type": "rotation",
        "description": "Relative strength vs Nifty 50 benchmark",
        "icon": "RefreshCw"
    },
    {
        "id": "options",
        "name": "Options & Key Levels",
        "type": "levels",
        "description": "Max Pain, Support & Resistance strike levels",
        "icon": "BarChart2"
    },
    {
        "id": "adr_expansion",
        "name": "ADR Contraction & Expansion",
        "type": "expansion",
        "description": "Volatility contraction setups, LOD runs, and ADR usage meter",
        "icon": "Compass"
    }
]


def get_scanner_categories() -> List[Dict[str, Any]]:
    """Return available scanner categories."""
    return SCANNER_CATEGORIES


def _normalize_symbol(sym: str) -> str:
    """Clean ticker to plain NSE symbol (NSE:RELIANCE -> RELIANCE)."""
    if not sym:
        return ""
    if ":" in sym:
        sym = sym.split(":")[1]
    if sym.endswith(".NS") or sym.endswith(".BO"):
        sym = sym[:-3]
    return sym.upper()


import math

def _clean_float(val: Any, default: float = 0.0) -> float:
    """Sanitize floats — convert NaN, Inf, and None to safe default for JSON compliance."""
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (ValueError, TypeError):
        return default


def _build_stock_row(
    symbol: str,
    name: str,
    ltp: float,
    change_pct: float,
    volume: int,
    rsi: float,
    signal: str,
    sector: str = "NSE",
    lod: float = 0.0,
    hod: float = 0.0,
    adr_14: float = 0.0,
    adr_pct: float = 0.0,
    pct_from_lod: float = 0.0,
    adr_pct_from_lod: float = 0.0,
    prev_range_lt_adr: Optional[bool] = None,
) -> Dict[str, Any]:
    """Return a standardized stock dict with Indian market range extension metrics."""
    sym_clean = _normalize_symbol(symbol)
    ltp_val = _clean_float(ltp, 0.0)
    chg_val = _clean_float(change_pct, 0.0)
    rsi_val = _clean_float(rsi, 50.0)
    supp = round(ltp_val * (0.97 if chg_val >= 0 else 0.94), 2)
    resist = round(ltp_val * (1.05 if chg_val >= 0 else 1.02), 2)
    max_p = round((supp + resist) / 2, 2)

    lod_val = round(_clean_float(lod, 0.0), 2)
    hod_val = round(_clean_float(hod, 0.0), 2)
    adr_val = round(_clean_float(adr_14, 0.0), 2)
    adr_pct_val = round(_clean_float(adr_pct, 0.0), 2)

    # 1. % Change from Low (LOD)
    pct_lod = round(_clean_float(pct_from_lod, 0.0), 2)
    if pct_lod == 0.0 and lod_val > 0 and ltp_val > 0:
        pct_lod = round(((ltp_val - lod_val) / lod_val) * 100.0, 2)

    # 2. ADR % from LOD
    adr_lod = round(_clean_float(adr_pct_from_lod, 0.0), 1)
    if adr_lod == 0.0 and adr_val > 0 and ltp_val > 0 and lod_val > 0:
        adr_lod = round(((ltp_val - lod_val) / adr_val) * 100.0, 1)

    return {
        "symbol":            sym_clean,
        "raw_symbol":        f"{sym_clean}.NS",
        "name":              name or sym_clean,
        "ltp":               ltp_val,
        "change_pct":        round(chg_val, 4),
        "volume":            int(_clean_float(volume, 0)),
        "rsi":               round(rsi_val, 2),
        "signal":            signal or "Live",
        "support":           supp,
        "resistance":        resist,
        "max_pain":          max_p,
        "sector":            str(sector or "NSE"),
        "lod":               lod_val,
        "hod":               hod_val,
        "adr_14":            adr_val,
        "adr_pct":           adr_pct_val,
        "pct_from_lod":      pct_lod,
        "adr_pct_from_lod":  adr_lod,
        "prev_range_lt_adr": prev_range_lt_adr,
    }



def _live_snapshot_stocks(universe: str, timeframe: str, limit: int) -> List[Dict[str, Any]]:
    """Fetch live TradingView snapshot and normalize to standard rows."""
    df = fetch_live_snapshot(timeframe=timeframe, limit=limit, universe=universe)
    if df is None or df.empty:
        return []
    results = []
    for idx, r in df.iterrows():
        sym = str(r.get("tv_ticker", r.get("symbol", idx)))
        ltp = float(r.get("price", r.get("close", r.get("ltp", 0))) or 0)
        chg = float(r.get("change_pct", 0) or 0)
        vol = int(r.get("volume", 0) or 0)
        rsi = float(r.get("rsi", r.get("RSI", 50)) or 50)
        name = str(r.get("name", r.get("description", "")))
        sector = str(r.get("sector", "NSE"))

        lod = float(r.get("low", 0) or 0)
        hod = float(r.get("high", 0) or 0)
        adr_14 = float(r.get("adr_14", 0) or 0)
        adr_pct = float(r.get("adr_pct", 0) or 0)
        pct_from_lod = float(r.get("pct_from_lod", 0) or 0)
        adr_pct_from_lod = float(r.get("adr_pct_from_lod", 0) or 0)

        if chg > 1.5 and rsi > 55:
            sig = "Bullish Momentum"
        elif chg < -1.5:
            sig = "Bearish Pressure"
        else:
            sig = "Consolidation"

        results.append(_build_stock_row(
            sym, name, ltp, chg, vol, rsi, sig, sector,
            lod=lod, hod=hod, adr_14=adr_14, adr_pct=adr_pct,
            pct_from_lod=pct_from_lod, adr_pct_from_lod=adr_pct_from_lod
        ))
    return results


def run_generic_scanner(
    category_id: str,
    scanner_id: Optional[int] = None,
    pk_option_id: Optional[str] = None,
    mover_type: Optional[str] = None,   # 'gainers' | 'losers' | None (all)
    universe: str = "nse500",
    timeframe: str = "1D",
    limit: int = 100
) -> List[Dict[str, Any]]:
    """
    Dispatch to the correct scanner engine and return standardized stock rows.
    mover_type: 'gainers' returns top +ve change_pct stocks,
                'losers'  returns top -ve change_pct stocks,
                None      returns all movers sorted by abs(change_pct).
    """

    # ── 1. Custom Rule Scanner (runs saved SQLite rule via scanner_engine) ──────
    if category_id == "custom" and scanner_id:
        try:
            from scanner_engine import run_scanner as _run_rule_scanner
            result = _run_rule_scanner(
                scanner_id=scanner_id,
                save_results=False,
                timeframe_override=timeframe,
                universe_override=universe
            )
            matches = result.get("matches", [])
            out = []
            for m in matches:
                sym = _normalize_symbol(m.get("symbol", ""))
                ltp = float(m.get("last_close", m.get("ltp", m.get("price", 0))) or 0)
                chg = float(m.get("change_pct", 0) or 0)
                vol = int(m.get("volume", 0) or 0)
                rsi = float(m.get("rsi", m.get("RSI", 50)) or 50)
                name = str(m.get("name", sym))
                sector = str(m.get("sector", "NSE"))
                metric_vals = m.get("metric_values", {}) or {}
                # Best RSI source: TV metric_values -> row field -> default 50
                rsi_val = 50.0
                for k, v in metric_vals.items():
                    if "RSI" in k.upper() and v is not None:
                        try:
                            rsi_val = float(v)
                            break
                        except (ValueError, TypeError):
                            pass
                if rsi_val == 50.0:
                    rsi_val = float(m.get("rsi", m.get("RSI", 50)) or 50)
                sig = f"Rule Match: {result.get('scanner_name', 'Custom')}"
                row = _build_stock_row(sym, name, ltp, chg, vol, rsi_val, sig, sector)
                # Inject indicator values from metric_values
                row["indicator_values"] = {k: round(float(v), 4) if v is not None else None
                                            for k, v in metric_vals.items()}
                out.append(row)
            if out:
                return out
        except Exception as e:
            print(f"[SCANNER_REGISTRY] Custom rule scanner error: {e}")
        # Fallback to live snapshot if rule scanner returned nothing
        return _live_snapshot_stocks(universe, timeframe, limit)

    # ── 2. PKScreener ─────────────────────────────────────────────────────────
    if category_id == "pkscreener":
        try:
            from pkscreener_service import run_pkscreener
            # Use specific pk_option_id if provided, otherwise default to Momentum Gainers
            option = pk_option_id or "pk_momentum_gainers"
            res = run_pkscreener(option_id=option, universe=universe, limit=limit)
            matches = res.get("pkscreener_matches", [])
            out = []
            for m in matches:
                sym = _normalize_symbol(m.get("symbol", ""))
                if not sym:
                    continue
                ltp = float(m.get("price", m.get("ltp", 0)) or 0)
                chg = float(m.get("change_pct", 0) or 0)
                rsi = float(m.get("rsi", 55) or 55)
                vol = int(m.get("volume", 0) or 0)
                sig = m.get("badge_text", "Momentum Surge")
                out.append(_build_stock_row(
                    sym, m.get("name", sym), ltp, chg, vol, rsi, sig, m.get("sector", "NSE")
                ))
            if out:
                return out
        except Exception as e:
            print(f"[SCANNER_REGISTRY] PKScreener error: {e}")
        return _live_snapshot_stocks(universe, timeframe, limit)

    # ── 3. VCP Pattern Screener ───────────────────────────────────────────────
    if category_id == "vcp":
        try:
            from vcp_service import run_vcp_screener
            res = run_vcp_screener(universe=universe, limit=limit)
            matches = res.get("vcp_matches", [])
            out = []
            for v in matches:
                sym = _normalize_symbol(v.get("symbol", ""))
                if not sym:
                    continue
                ltp = float(v.get("price", v.get("close", 0)) or 0)
                chg = float(v.get("change_pct", 0) or 0)
                rsi = float(v.get("rsi", 60) or 60)
                vol = int(v.get("volume", 0) or 0)
                vcp_score = v.get("vcp_score", 70)
                pivot = v.get("pivot_level", ltp * 1.03)
                n_contractions = v.get("contraction_count", 0)
                sig = f"VCP {n_contractions}T — Score {vcp_score:.0f}"
                row = _build_stock_row(
                    sym, v.get("name", sym), ltp, chg, vol, rsi, sig, v.get("sector", "Growth")
                )
                row["resistance"] = float(pivot or row["resistance"])
                row["vcp_score"] = vcp_score
                row["pivot_level"] = pivot
                row["contraction_summary"] = v.get("contraction_summary", "")
                out.append(row)
            if out:
                return out
            # VCP found no matches — return an informative empty response
            print("[SCANNER_REGISTRY] VCP returned 0 matches — all stocks failed trend template / VCP criteria")
            return []
        except Exception as e:
            print(f"[SCANNER_REGISTRY] VCP error: {e}")
        return _live_snapshot_stocks(universe, timeframe, limit)

    # ── 4. ADR Range & Volatility Expansion Screener ─────────────────────────
    if category_id == "adr_expansion":
        stocks = _live_snapshot_stocks(universe, timeframe, max(limit, 100))
        # Filter for active moves with valid ADR
        valid_adr = [s for s in stocks if _clean_float(s.get("adr_14")) > 0 and _clean_float(s.get("lod")) > 0]
        # Sort by ADR % from LOD
        valid_adr.sort(key=lambda s: _clean_float(s.get("adr_pct_from_lod")), reverse=True)
        for s in valid_adr:
            used = _clean_float(s.get("adr_pct_from_lod"))
            pct_lod = _clean_float(s.get("pct_from_lod"))
            if used < 40:
                s["signal"] = f"Early ADR ({used}% used | +{pct_lod}% LOD)"
            elif used <= 70:
                s["signal"] = f"Active ADR ({used}% used | +{pct_lod}% LOD)"
            else:
                s["signal"] = f"Extended ADR ({used}% used | +{pct_lod}% LOD)"
        return valid_adr[:limit]

    # ── 5. RRG Rotation — sort by RSI vs 50 as RS proxy ──────────────────────
    if category_id == "rrg":
        stocks = _live_snapshot_stocks(universe, timeframe, limit)
        # Sort by RSI descending as relative strength proxy
        stocks.sort(key=lambda s: s.get("rsi", 50), reverse=True)
        for s in stocks:
            rsi = s.get("rsi", 50)
            if rsi >= 65:
                s["signal"] = "Leading Quadrant"
            elif rsi >= 55:
                s["signal"] = "Improving Quadrant"
            elif rsi >= 45:
                s["signal"] = "Lagging Quadrant"
            else:
                s["signal"] = "Weakening Quadrant"
        return stocks

    # ── 5. Options / Key Levels & Live Movers (default) ───────────────────────
    # Fetch more stocks when filtering for gainers/losers so we have enough to choose top 20 from
    fetch_limit = 300 if mover_type in ("gainers", "losers") else limit
    stocks = _live_snapshot_stocks(universe, timeframe, fetch_limit)

    if mover_type == "gainers":
        # Filter to positive change only, sort highest gain first, cap at 20
        stocks = [s for s in stocks if _clean_float(s.get("change_pct")) > 0]
        stocks.sort(key=lambda s: _clean_float(s.get("change_pct")), reverse=True)
        stocks = stocks[:20]
        for s in stocks:
            chg = _clean_float(s.get("change_pct"))
            s["signal"] = f"▲ Top Gainer +{round(chg, 2)}%"
    elif mover_type == "losers":
        # Filter to negative change only, sort biggest loss first, cap at 20
        stocks = [s for s in stocks if _clean_float(s.get("change_pct")) < 0]
        stocks.sort(key=lambda s: _clean_float(s.get("change_pct")), reverse=False)
        stocks = stocks[:20]
        for s in stocks:
            chg = _clean_float(s.get("change_pct"))
            s["signal"] = f"▼ Top Loser {round(chg, 2)}%"
    else:
        # All movers: sort by absolute change desc
        stocks.sort(key=lambda s: abs(_clean_float(s.get("change_pct"))), reverse=True)

    return stocks



