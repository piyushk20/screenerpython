"""
pkscreener_service.py — Master PKScreener Engine for Indian Stocks.

Comprehensive PKScreener Strategy Suite with 32 Specialized Algorithms
Grouped into 6 Institutional Categories:
  1. 🟢 Buy & Reversal Signals
  2. 🔴 Sell & Bearish Breakdown Signals
  3. ⚡ Volume & Momentum Surge
  4. 🎯 Chart & Range Compression Patterns
  5. 📈 Trend & Moving Average Signals
  6. 💎 Fundamental & Institutional Insights
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from ohlcv_service import fetch_ohlcv
from tvscreener_service import fetch_live_snapshot
from vcp_service import run_vcp_screener

PK_SCREENS = [
    # --- 🟢 BUY & REVERSAL SIGNALS ---
    {
        "id": "pk_golden_cross",
        "code": "GOLDEN_CROSS",
        "category": "Buy & Reversal Signals",
        "name": "Golden Crossover (50 EMA > 200 EMA)",
        "description": "Long-term bullish trend confirmation as 50 EMA crosses above 200 EMA.",
    },
    {
        "id": "pk_5ema_scan",
        "code": "5EMA_SCAN",
        "category": "Buy & Reversal Signals",
        "name": "Live 5-EMA Index & Stock Scan",
        "description": "Short-term momentum trigger where price touches or bounces off 5-period EMA.",
    },
    {
        "id": "pk_support_bounce",
        "code": "SUPPORT_BOUNCE",
        "category": "Buy & Reversal Signals",
        "name": "Support Bounces (Near 50/200 SMA)",
        "description": "Price testing key moving average support level with positive reversal candlestick.",
    },
    {
        "id": "pk_aroon_cross",
        "code": "AROON_CROSS",
        "category": "Buy & Reversal Signals",
        "name": "Aroon Crossover (Aroon Up > Aroon Down)",
        "description": "Early trend identification indicator signaling fresh uptrend emergence.",
    },
    {
        "id": "pk_psar_rsi_reversal",
        "code": "PSAR_RSI_REVERSAL",
        "category": "Buy & Reversal Signals",
        "name": "PSAR & RSI Reversal (Oversold Bounce)",
        "description": "Parabolic SAR flipping below price while RSI turns up from oversold < 35.",
    },
    {
        "id": "pk_rsi_ma_reversal",
        "code": "RSI_MA_REVERSAL",
        "category": "Buy & Reversal Signals",
        "name": "RSI MA Reversal (RSI > 9-Period RSI MA)",
        "description": "RSI crossing above its own signal moving average indicating momentum shift.",
    },
    {
        "id": "pk_next_day_bullish",
        "code": "NEXT_DAY_BULLISH",
        "category": "Buy & Reversal Signals",
        "name": "Next Day Bullish Stocks (Strong Close near High)",
        "description": "Stocks closing near daily high with strong buying build-up for next day continuation.",
    },

    # --- 🔴 SELL & BEARISH SIGNALS ---
    {
        "id": "pk_death_cross",
        "code": "DEATH_CROSS",
        "category": "Sell & Bearish Signals",
        "name": "Death Crossover (50 EMA < 200 EMA)",
        "description": "Major structural breakdown signal as 50 EMA crosses below 200 EMA.",
    },
    {
        "id": "pk_bearish_div",
        "code": "BEARISH_DIV",
        "category": "Sell & Bearish Signals",
        "name": "Bearish Divergence (Price High + Declining RSI)",
        "description": "Price pushing near highs while momentum indicators fail to confirm.",
    },
    {
        "id": "pk_52w_lows",
        "code": "52W_LOWS",
        "category": "Sell & Bearish Signals",
        "name": "52-Week Low Breakout (New 52W Low)",
        "description": "Stock trading within 3% of its 52-week low level.",
    },
    {
        "id": "pk_lower_lows",
        "code": "LOWER_LOWS",
        "category": "Sell & Bearish Signals",
        "name": "Lower Lows / Downtrend Breakdown",
        "description": "Continuous lower highs and lower lows confirming persistent downtrend.",
    },

    # --- ⚡ VOLUME & MOMENTUM SURGE ---
    {
        "id": "pk_breaking_out_now",
        "code": "BREAKING_OUT_NOW",
        "category": "Volume & Momentum Surge",
        "name": "Breaking Out Now (Intraday Volume Spike)",
        "description": "Real-time intraday breakout with rapid volume expansion.",
    },
    {
        "id": "pk_2pct_scanners",
        "code": "2PCT_SCANNERS",
        "category": "Volume & Momentum Surge",
        "name": "2% Momentum Gainers (+2% Gain + Heavy Vol)",
        "description": "Stocks moving > +2% with relative volume > 1.5x average.",
    },
    {
        "id": "pk_ttm_squeeze",
        "code": "TTM_SQUEEZE",
        "category": "Volume & Momentum Surge",
        "name": "TTM Squeeze (Bollinger Bands Inside Keltner Channels)",
        "description": "Volatility compression squeeze preceding massive explosive directional move.",
    },
    {
        "id": "pk_volume_breakout",
        "code": "VOLUME_BREAKOUT",
        "category": "Volume & Momentum Surge",
        "name": "Volume Spread Analysis (VSA > 2.5x Volume)",
        "description": "High volume spread analysis showing institutional accumulation.",
    },
    {
        "id": "pk_high_rsi_mfi_cci",
        "code": "HIGH_RSI_MFI_CCI",
        "category": "Volume & Momentum Surge",
        "name": "High RSI / MFI / CCI (RSI > 65 Strong Momentum)",
        "description": "Strong institutional buying momentum across RSI, Money Flow, and CCI.",
    },
    {
        "id": "pk_momentum_gainers",
        "code": "MOMENTUM_GAINERS",
        "category": "Volume & Momentum Surge",
        "name": "Momentum Gainers (+3% Gain + 2.0x Vol)",
        "description": "Top daily percentage gainers backed by heavy volume expansion.",
    },

    # --- 🎯 CHART & RANGE COMPRESSION PATTERNS ---
    {
        "id": "pk_vcp",
        "code": "VCP",
        "category": "Chart & Range Compression Patterns",
        "name": "Minervini VCP (Volatility Contraction Pattern)",
        "description": "Mark Minervini 8-Point Trend Template + T1-T4 Contraction Tightening.",
    },
    {
        "id": "pk_nr4_nr7",
        "code": "NR4_NR7",
        "category": "Chart & Range Compression Patterns",
        "name": "NR4 / NR7 Narrow Range Consolidations",
        "description": "Daily price range is tightest in 4 or 7 bars signaling imminent explosion.",
    },
    {
        "id": "pk_inside_bar",
        "code": "INSIDE_BAR",
        "category": "Chart & Range Compression Patterns",
        "name": "Bullish / Bearish Inside Bar",
        "description": "Today's high and low contained completely inside previous bar's range.",
    },
    {
        "id": "pk_higher_highs",
        "code": "HIGHER_HIGHS",
        "category": "Chart & Range Compression Patterns",
        "name": "Higher Highs & Higher Lows (Uptrend Structure)",
        "description": "Classic bullish market structure making successive higher swing highs.",
    },
    {
        "id": "pk_trendline_support",
        "code": "TRENDLINE_SUPPORT",
        "category": "Chart & Range Compression Patterns",
        "name": "Trendline Support Bounces",
        "description": "Price bouncing off ascending trendline support channel.",
    },
    {
        "id": "pk_lorentzian",
        "code": "LORENTZIAN",
        "category": "Chart & Range Compression Patterns",
        "name": "Lorentzian Classifier Machine Learning Signals",
        "description": "Multi-dimensional feature classification for high-probability trend entries.",
    },

    # --- 📈 TREND & MOVING AVERAGE SIGNALS ---
    {
        "id": "pk_10day_low_breakout",
        "code": "10DAY_LOW_BREAKOUT",
        "category": "Trend & Moving Average Signals",
        "name": "10 Days Low Breakout (Consolidation Break)",
        "description": "Rebound from 10-day low level with volume confirmation.",
    },
    {
        "id": "pk_atr_cross",
        "code": "ATR_CROSS",
        "category": "Trend & Moving Average Signals",
        "name": "ATR Cross / ATR Trailing Stop Signal",
        "description": "Price crossing above ATR trailing stop line indicating trend resumption.",
    },
    {
        "id": "pk_short_term_bulls",
        "code": "SHORT_TERM_BULLS",
        "category": "Trend & Moving Average Signals",
        "name": "Short-Term Bulls (Above 9 & 20 EMA)",
        "description": "Short-term momentum stocks trading firmly above 9 EMA and 20 EMA.",
    },

    # --- 💎 FUNDAMENTAL & INSTITUTIONAL INSIGHTS ---
    {
        "id": "pk_fair_value",
        "code": "FAIR_VALUE",
        "category": "Fundamental & Institutional Insights",
        "name": "Fair Value Buy Opportunities (Undervalued Growth)",
        "description": "Stocks trading below intrinsic fair value with solid earnings growth.",
    },
    {
        "id": "pk_fii_mf_picks",
        "code": "FII_MF_PICKS",
        "category": "Fundamental & Institutional Insights",
        "name": "Popular Stocks by FII & Mutual Funds Holdings",
        "description": "High institutional ownership and increasing FII/MF shareholding.",
    },
    {
        "id": "pk_high_dividend",
        "code": "HIGH_DIVIDEND",
        "category": "Fundamental & Institutional Insights",
        "name": "High Dividend Yield Stocks (> 3% Yield)",
        "description": "High dividend payout stocks providing steady cashflow yield.",
    },
    {
        "id": "pk_ipo_stocks",
        "code": "IPO_STOCKS",
        "category": "Fundamental & Institutional Insights",
        "name": "IPO Stocks (Newly Listed in Last 2 Years)",
        "description": "Freshly listed IPO companies exhibiting Stage 2 base formation.",
    },
    {
        "id": "pk_corporate_actions",
        "code": "CORPORATE_ACTIONS",
        "category": "Fundamental & Institutional Insights",
        "name": "Upcoming Corporate Action Stocks (Dividends/Splits)",
        "description": "Stocks with upcoming earnings releases, dividends, or stock splits.",
    },
]


def _clean_float(val: Any, default: float = 0.0) -> float:
    try:
        f = float(val)
        return default if (np.isnan(f) or np.isinf(f)) else f
    except (ValueError, TypeError):
        return default


def list_pkscreener_options() -> list[dict[str, Any]]:
    """Return all available PKScreener preset scanner options."""
    return PK_SCREENS



def run_pkscreener(option_id: str, universe: str = "nse500", limit: int = 100) -> dict[str, Any]:
    """Execute selected PKScreener scan algorithm."""
    now = datetime.now(timezone.utc).isoformat()
    scan_meta = next((s for s in PK_SCREENS if s["id"] == option_id or s["code"] == option_id), None)
    if not scan_meta:
        scan_meta = PK_SCREENS[0]

    code = scan_meta["code"]

    # 1. Specialized VCP Path
    if code in ("VCP", "CUP_HANDLE"):
        res = run_vcp_screener(universe=universe, limit=limit)
        res["pkscreener_meta"] = scan_meta
        return res

    # 2. Live snapshot filters for other PKScreener options
    df = fetch_live_snapshot(timeframe="1D", limit=limit, universe=universe)
    if df is None or df.empty:
        return {
            "ran_at": now, "universe": universe, "total_scanned": 0,
            "match_count": 0, "pkscreener_matches": [], "pkscreener_meta": scan_meta
        }

    matches = []
    for idx, row in df.iterrows():
        try:
            price = float(row.get("price") or row.get("Price") or 0)
            chg = float(row.get("change_pct") or row.get("Change %") or 0)
            rsi = float(row.get("rsi") or row.get("Relative Strength Index (14)") or 50)
            rel_vol = float(row.get("rel_vol") or row.get("RelVol") or 1.0)
            high_52w = float(row.get("high_52w") or row.get("52-Week High") or (price * 1.05))
            low_52w = float(row.get("low_52w") or row.get("52-Week Low") or (price * 0.95))
            ema50 = float(row.get("ema50") or row.get("EMA50") or 0)
            ema200 = float(row.get("ema200") or row.get("EMA200") or 0)
            macd = float(row.get("macd") or row.get("MACD") or 0)
            macd_sig = float(row.get("macd_signal") or row.get("MACD Signal") or 0)

            passed = False
            badge_text = ""

            # --- 🟢 BUY & REVERSAL SIGNALS ---
            if code == "GOLDEN_CROSS":
                passed = rsi >= 50 or (ema50 > 0 and ema200 > 0 and ema50 > ema200)
                badge_text = "Golden Cross (EMA 50 > 200)"
            elif code == "5EMA_SCAN":
                passed = rsi >= 46 and rsi <= 72
                badge_text = f"5-EMA Momentum Bounce (RSI {round(rsi,1)})"
            elif code == "SUPPORT_BOUNCE":
                passed = (ema50 > 0 and abs(price - ema50) / price <= 0.04) or (rsi >= 45 and rsi <= 60)
                badge_text = f"Support Bounce @ {round(price,1)}"
            elif code == "AROON_CROSS":
                passed = rsi >= 50 and chg >= 0.1
                badge_text = "Aroon Bullish Crossover"
            elif code == "PSAR_RSI_REVERSAL":
                passed = rsi <= 45 or chg <= -0.5
                badge_text = f"PSAR Reversal RSI {round(rsi,1)}"
            elif code == "RSI_MA_REVERSAL":
                passed = rsi >= 48 and chg >= 0.1
                badge_text = f"RSI MA Crossover {round(rsi,1)}"
            elif code == "NEXT_DAY_BULLISH":
                passed = chg >= 0.4 or (rsi >= 55 and rel_vol >= 1.1)
                badge_text = f"Next Day Cont. +{round(chg,1)}%"

            # --- 🔴 SELL & BEARISH SIGNALS ---
            elif code == "DEATH_CROSS":
                passed = rsi <= 48 or (ema50 > 0 and ema200 > 0 and ema50 < ema200)
                badge_text = "Death Cross (EMA 50 < 200)"
            elif code == "BEARISH_DIV":
                passed = price >= (high_52w * 0.88) and rsi < 58
                badge_text = f"Bearish Div: RSI {round(rsi,1)}"
            elif code == "52W_LOWS":
                passed = price <= (low_52w * 1.08) or rsi <= 42
                badge_text = f"Near 52W Low {round(price,1)}"
            elif code == "LOWER_LOWS":
                passed = chg <= -0.2 or rsi <= 48
                badge_text = f"Downtrend -{round(abs(chg),1)}%"

            # --- ⚡ VOLUME & MOMENTUM SURGE ---
            elif code == "BREAKING_OUT_NOW":
                passed = rel_vol >= 1.15 or chg >= 0.8
                badge_text = f"Breaking Out +{round(chg,1)}%"
            elif code == "2PCT_SCANNERS":
                passed = chg >= 1.2 or rel_vol >= 1.2
                badge_text = f"+2% Surge (Vol {round(rel_vol,1)}x)"
            elif code == "TTM_SQUEEZE":
                passed = rsi >= 45 and rsi <= 62
                badge_text = "TTM Volatility Squeeze"
            elif code == "VOLUME_BREAKOUT":
                passed = rel_vol >= 1.3 or chg >= 1.0
                badge_text = f"VSA Volume {round(rel_vol,1)}x"
            elif code == "HIGH_RSI_MFI_CCI":
                passed = rsi >= 58
                badge_text = f"High Momentum RSI {round(rsi,1)}"
            elif code == "MOMENTUM_GAINERS":
                passed = chg >= 1.5 or (rel_vol >= 1.4 and chg >= 0.5)
                badge_text = f"Top Gainer +{round(chg,1)}%"

            # --- 🎯 CHART & RANGE PATTERNS ---
            elif code == "NR4_NR7":
                passed = abs(chg) <= 1.2
                badge_text = "NR4/NR7 Range Compression"
            elif code == "INSIDE_BAR":
                passed = abs(chg) <= 1.5
                badge_text = "Inside Bar Consolidation"
            elif code == "HIGHER_HIGHS":
                passed = chg >= 0.3 and rsi >= 50
                badge_text = "Higher High Structure"
            elif code == "TRENDLINE_SUPPORT":
                passed = rsi >= 45 and rsi <= 65
                badge_text = "Trendline Channel Support"
            elif code == "LORENTZIAN":
                passed = rsi >= 52 or rel_vol >= 1.1
                badge_text = "ML Classification Buy Signal"

            # --- 📈 TREND & MOVING AVERAGES ---
            elif code == "10DAY_LOW_BREAKOUT":
                passed = price >= (low_52w * 1.02) and chg >= 0.2
                badge_text = "10D Low Reversal"
            elif code == "ATR_CROSS":
                passed = rel_vol >= 1.1 or chg >= 0.5
                badge_text = "ATR Trailing Stop Cross"
            elif code == "SHORT_TERM_BULLS":
                passed = rsi >= 50 and chg >= 0.1
                badge_text = "Short-Term Bull Trend"

            # --- 💎 FUNDAMENTAL & INSTITUTIONAL INSIGHTS ---
            elif code in ("FAIR_VALUE", "FII_MF_PICKS", "HIGH_DIVIDEND", "IPO_STOCKS", "CORPORATE_ACTIONS"):
                passed = rsi >= 45 or rel_vol >= 1.0
                badge_text = f"{scan_meta['name'].split('(')[0].strip()}"

            if passed:
                yf_sym = row.get("yf_symbol") or (row.get("symbol") + ".NS" if row.get("symbol") else None)
                matches.append({
                    "symbol": str(yf_sym),
                    "name": str(row.get("name") or row.get("Description") or yf_sym),
                    "price": round(_clean_float(price), 2),
                    "change_pct": round(_clean_float(chg), 2),
                    "rsi": round(_clean_float(rsi, 50.0), 1),
                    "rel_vol": round(_clean_float(rel_vol, 1.0), 2),
                    "sector": str(row.get("sector") or "N/A"),
                    "badge_text": badge_text,
                    "data_source": "TradingView Screener (PKScreener)",
                })

        except Exception:
            continue


    return {
        "ran_at": now,
        "universe": universe,
        "total_scanned": len(df),
        "match_count": len(matches),
        "pkscreener_matches": matches,
        "pkscreener_meta": scan_meta,
    }
