"""
tvscreener_service.py — Primary live data engine using tvscreener.

ARCHITECTURE:
  tvscreener → TradingView's public screener API → near real-time indicator data
  yfinance   → Historical OHLCV only (for candlestick charts)
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd
import tvscreener as tv
from tvscreener import StockScreener, FilterOperator, StockField
from tvscreener.field import FieldWithInterval

# Monkey patch FieldWithInterval to prevent library AttributeError in get_columns_to_request
FieldWithInterval.has_recommendation = property(lambda self: getattr(self.field, 'has_recommendation', False))

# Map our timeframe labels → TradingView interval strings used in FieldWithInterval
# TradingView uses: '1'=1min, '5'=5min, '15'=15min, '30'=30min, '60'=1H, '240'=4H, '1D'=day, '1W'=week, '1M'=month
TV_INTERVAL_MAP = {
    "5m":  "5",
    "15m": "15",
    "30m": "30",
    "1H":  "60",
    "4H":  "240",
    "1D":  "1D",
    "1WK": "1W",
    "1MO": "1M",
}

_MACD_FIELD = "MACD Level (12, 26)"
_MACD_SIG   = "MACD Signal (12, 26)"
_BB_LOWER   = "Bollinger Lower Band (20)"


def resolve_field(indicator: str, params: dict, timeframe: str = "1D") -> Optional[str]:
    ind = indicator.strip()
    base_name = None
    
    if ind == "RSI":
        length = params.get("length", 14)
        if length == 7:
            base_name = "Relative Strength Index (7)"
        else:
            base_name = "Relative Strength Index (14)"
    elif ind == "MACD":
        base_name = "MACD Level (12, 26)"
    elif ind == "EMA":
        length = params.get("length", 20)
        valid = [5, 10, 20, 30, 50, 100, 200]
        closest = min(valid, key=lambda k: abs(k - length))
        base_name = f"Exponential Moving Average ({closest})"
    elif ind == "SMA":
        length = params.get("length", 50)
        valid = [5, 10, 20, 30, 50, 100, 200]
        closest = min(valid, key=lambda k: abs(k - length))
        base_name = f"Simple Moving Average ({closest})"
    elif ind == "ADX":
        base_name = "Average Directional Index (14)"
    elif ind == "BBands":
        base_name = "Bollinger Upper Band (20)"
    elif ind == "VWAP":
        base_name = "Volume Weighted Average Price"
    elif ind == "ATR":
        base_name = "Average True Range (14)"
    elif ind == "Volume":
        base_name = "Volume"
    elif ind in ("RelVol", "Relative Volume", "Rel_Vol"):
        base_name = "Relative Volume"
    elif ind in ("Price", "Close"):
        base_name = "Price"
    elif ind in ("Change", "Change %"):
        base_name = "Change %"
    elif ind == "Stochastic":
        base_name = "Stochastic %K (14, 3, 3)"
    elif ind == "Stoch_RSI":
        base_name = "Stochastic RSI Fast (3, 3, 14, 14)"
    elif ind == "CCI":
        base_name = "Commodity Channel Index (20)"
    elif ind == "Williams_R":
        base_name = "Williams Percent Range (14)"
    elif ind == "PE_Ratio":
        base_name = "Price to Earnings Ratio (TTM)"
    elif ind == "PB_Ratio":
        base_name = "Price to Book (MRQ)"
    elif ind == "Dividend_Yield":
        base_name = "Dividend Yield %"
    elif ind == "Market_Cap":
        base_name = "Market Capitalization"
    elif ind in ("52w_High", "High_52W"):
        base_name = "52 Week High"
    elif ind in ("52w_Low", "Low_52W"):
        base_name = "52 Week Low"
    elif ind == "Perf_1W":
        base_name = "Weekly Performance"
    elif ind == "Perf_1M":
        base_name = "Monthly Performance"
    elif ind == "Perf_3M":
        base_name = "3-Month Performance"
    elif ind == "Perf_1Y":
        base_name = "Yearly Performance"
    elif ind == "Perf_YTD":
        base_name = "YTD Performance"

    if not base_name:
        return None

    rule_tf = params.get("timeframe", timeframe) if isinstance(params, dict) else timeframe
    tv_interval = TV_INTERVAL_MAP.get(rule_tf)
    if tv_interval and tv_interval != "1D" and ind not in ("RelVol", "Relative Volume", "Rel_Vol", "Market_Cap", "PE_Ratio", "PB_Ratio", "Dividend_Yield", "52w_High", "High_52W", "52w_Low", "Low_52W"):
        return f"{base_name} ({tv_interval})"
    return base_name


# NSE F&O eligible stock symbols (top-200 liquid F&O stocks as of 2025)
NSE_FNO_SYMBOLS = [
    "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "BHARTIARTL", "SBIN", "INFY", "LICI",
    "HINDUNILVR", "ITC", "KOTAKBANK", "LT", "BAJFINANCE", "HCLTECH", "MARUTI", "SUNPHARMA",
    "AXISBANK", "ASIANPAINT", "TITAN", "BAJAJFINSV", "ULTRACEMCO", "WIPRO", "NESTLEIND",
    "ONGC", "POWERGRID", "NTPC", "ADANIENT", "TATAMOTORS", "INDUSINDBK", "TECHM",
    "COALINDIA", "JSWSTEEL", "TATASTEEL", "BPCL", "HINDALCO", "EICHERMOT", "CIPLA",
    "GRASIM", "BRITANNIA", "DRREDDY", "DIVISLAB", "APOLLOHOSP", "M&M", "ADANIPORTS",
    "TATACONSUM", "SBILIFE", "BAJAJ-AUTO", "HEROMOTOCO", "SHREECEM", "HDFCLIFE",
    "BANKBARODA", "CANBK", "PNB", "IDFCFIRSTB", "RBLBANK", "FEDERALBNK", "INDIGO",
    "MUTHOOTFIN", "HAVELLS", "PIDILITIND", "DABUR", "MARICO", "COLPAL", "GODREJCP",
    "BERGEPAINT", "MCDOWELL-N", "UBL", "VOLTAS", "WHIRLPOOL", "IPCALAB", "AUROPHARMA",
    "TORNTPHARM", "LUPIN", "BIOCON", "ABBOTINDIA", "ALKEM", "NATCOPHARM", "GRANULES",
    "TATAPOWER", "ADANIGREEN", "ADANITRANS", "TRENT", "ZOMATO", "NYKAA", "PAYTM",
    "DELHIVERY", "IRCTC", "RAILTEL", "CONCOR", "HAL", "BEL", "BHEL", "SAIL",
    "GAIL", "PETRONET", "IGL", "MGL", "ATGL", "GUJGASLTD", "MAHAGAS",
    "CHOLAFIN", "SHRIRAMFIN", "M&MFIN", "MANAPPURAM", "JKCEMENT", "AMBUJACEMENT",
    "ACC", "RAMCOCEM", "DALMIACEM", "HEIDELBERG", "STARCEMENT", "NCLIND",
    "APLAPOLLO", "JINDALSTEL", "RATNAMANI", "WELCORP", "JSWENERGY", "TATAELXSI",
    "PERSISTENT", "MPHASIS", "COFORGE", "LTIM", "LTTS", "INFY", "KPITTECH",
    "ZYDUSLIFE", "SUNPHARMA", "GLENMARK", "MANKIND", "AJANTPHARM", "INDIAMART",
    "POLICYBZR", "CARERATING", "CRISIL", "MCX", "BSE", "IEX", "CDSL",
    "ANGELONE", "MOTILALOFS", "IIFL", "5PAISA", "CENTRUM", "SBICARD", "ICICIPRULI",
    "HDFCAMC", "NIPPONLIFE", "MFSL", "MAXHEALTH", "FORTIS", "THYROCARE", "METROPOLIS",
    "LALPATHLAB", "KIMS", "IEHFL", "UCOBANK", "MAHABANK", "IDBI", "SOUTHBANK",
    "KARURVYSYA", "DCBBANK", "EQUITASBNK", "SURYODAY", "UJJIVANSFB", "ESAFSFB",
    "CEATLTD", "APOLLOTYRE", "BALKRISIND", "MRF", "EXIDEIND", "AMARAJABAT",
    "MAHLE", "MOTHERSON", "BOSCHLTD", "MINDAIND", "SUNDARAMFIN", "SCHAEFFLER",
    "SKFINDIA", "TIMKEN", "GRINDWELL", "CARBORUNIV", "RKFORGE", "RAMKRISHNA",
    "PIDW", "DEEPAKFERT", "GNFC", "GSPL", "BASF", "TATACHEM", "APCOTEX",
    "GHCL", "ALKYLAMINE", "NAVINFLUOR", "AAVAS", "CANFINHOME", "PNBHOUSING",
    "REPCO", "INDIABULL", "HOMEFIRST", "APTUS", "GRUH", "LICHSGFIN",
    "AWHCL", "AWHCL", "ZEEL", "PVRINOX", "INOXWIND", "SUZLON", "THERMAX",
    "CUMMINSIND", "KSB", "KIRLOSBROS", "GREAVESCOT", "PRAJ",
]

UNIVERSE_CAPS = {
    "nifty50": 50,
    "nifty_50": 50,
    "nifty100": 100,
    "nifty_100": 100,
    "nifty200": 200,
    "nifty_200": 200,
    "nifty500": 500,
    "nse500": 500,
}


def _apply_universe_filter(ss: StockScreener, universe: str):
    """Apply market cap / universe filter to StockScreener instance.
    
    TradingView stores Market Capitalization in USD.
    SEBI INR thresholds converted at ~₹84/USD:
      Large Cap  > ₹20,000 Cr  → > ~$2.38B USD
      Mid Cap    ₹4,000–20,000 Cr → $476M–$2.38B USD
      Small Cap  ₹800–4,000 Cr → $95M–$476M USD
      Micro Cap  < ₹800 Cr    → < $95M USD
    """
    u = (universe or "nse500").lower().strip()
    if u in ("largecap", "large_cap", "large"):
        # Large Cap: > ₹20,000 Cr (~$2.38B USD)
        ss.add_filter(StockField.MARKET_CAPITALIZATION, FilterOperator.ABOVE, 2_380_000_000)
    elif u in ("midcap", "mid_cap", "mid"):
        # Mid Cap: ₹4,000 Cr–₹20,000 Cr ($476M–$2.38B USD)
        ss.add_filter(StockField.MARKET_CAPITALIZATION, FilterOperator.IN_RANGE, [476_000_000, 2_380_000_000])
    elif u in ("smallcap", "small_cap", "small"):
        # Small Cap: ₹800 Cr–₹4,000 Cr ($95M–$476M USD)
        ss.add_filter(StockField.MARKET_CAPITALIZATION, FilterOperator.IN_RANGE, [95_000_000, 476_000_000])
    elif u in ("microcap", "micro_cap", "micro"):
        # Micro Cap: < ₹800 Cr (~$95M USD)
        ss.add_filter(StockField.MARKET_CAPITALIZATION, FilterOperator.BELOW, 95_000_000)
    elif u in ("fno", "f&o", "futures", "derivatives"):
        # F&O eligible stocks — filter by NSE exchange
        ss.add_filter(StockField.EXCHANGE, FilterOperator.EQUAL, "NSE")


def fetch_live_snapshot(timeframe: str = "1D", limit: int = 500, universe: str = "nse500") -> pd.DataFrame:
    now = datetime.now(timezone.utc).isoformat()
    u = (universe or "nse500").lower().strip()
    if u in UNIVERSE_CAPS:
        limit = min(limit, UNIVERSE_CAPS[u])

    ss = StockScreener()
    ss.set_markets(tv.Market.INDIA)
    _apply_universe_filter(ss, universe)
    ss.sort_by(StockField.MARKET_CAPITALIZATION, ascending=False)
    # Fetch range to account for NSE/BSE deduplication
    ss.set_range(0, min(limit * 2, 1000))
    
    try:
        df = ss.get()
    except Exception as e:
        print(f"[TV SNAPSHOT] Error fetching live data: {e}")
        return pd.DataFrame()

    if df is None or df.empty:
        return pd.DataFrame()

    # Deduplicate companies: prioritize NSE exchange entries over BSE entries
    if "Exchange" in df.columns:
        df["_is_nse"] = df["Exchange"].astype(str).str.upper() == "NSE"
        df = df.sort_values(by=["_is_nse", "Market Capitalization"], ascending=[False, False])
    if "Description" in df.columns:
        df = df.drop_duplicates(subset=["Description"], keep="first")
    if "_is_nse" in df.columns:
        df = df.drop(columns=["_is_nse"])

    # For F&O universe, filter down to F&O eligible symbols only
    if u in ("fno", "f&o", "futures", "derivatives") and "Symbol" in df.columns:
        fno_set = {s.upper() for s in NSE_FNO_SYMBOLS}
        def _is_fno(sym):
            s = str(sym).upper()
            if ":" in s:
                s = s.split(":", 1)[1]
            return s in fno_set
        df = df[df["Symbol"].apply(_is_fno)].copy()

    # Limit strictly to exact universe capacity cap
    df = df.head(limit).copy()


    tv_tickers = []
    yf_symbols = []
    for idx, row in df.iterrows():
        tv_sym = str(row.get("Symbol", ""))
        if ":" in tv_sym:
            exch, sym = tv_sym.split(":", 1)
            yf = f"{sym}.NS" if exch.upper() == "NSE" else f"{sym}.BO"
        else:
            sym = tv_sym
            exch = str(row.get("Exchange", "NSE")).upper()
            yf = f"{sym}.NS" if exch == "NSE" else f"{sym}.BO"
        tv_tickers.append(tv_sym)
        yf_symbols.append(yf)

    df["tv_ticker"] = tv_tickers
    df["yf_symbol"] = yf_symbols

    col_map = {
        "Symbol":                       "symbol",
        "Description":                  "name",
        "Exchange":                     "exchange",
        "Sector":                       "sector",
        "Price":                        "price",
        "Open":                         "open",
        "High":                         "high",
        "Low":                          "low",
        "Volume":                       "volume",
        "Change %":                     "change_pct",
        "Market Capitalization":        "market_cap",
        "Relative Strength Index (14)": "rsi",
        "MACD Level (12, 26)":          "macd",
        "MACD Signal (12, 26)":         "macd_signal",
        "Exponential Moving Average (20)":"ema20",
        "Exponential Moving Average (50)":"ema50",
        "Simple Moving Average (50)":   "sma50",
        "Simple Moving Average (200)":  "sma200",
        "Average Directional Index (14)":"adx",
        "Bollinger Upper Band (20)":    "bb_upper",
        "Bollinger Lower Band (20)":    "bb_lower",
        "Volume Weighted Average Price":"vwap",
        "Average True Range (14)":     "atr",
        "Average Day Range (14)":       "adr_14",
        "Average True Range % (14)":    "adr_pct",
        "Price to Earnings Ratio (TTM)":"pe_ratio",
        "Price to Book (MRQ)":          "pb_ratio",
        "Dividend Yield %":             "dividend_yield",
        "52 Week High":                 "high_52w",
        "52 Week Low":                  "low_52w",
        "Weekly Performance":           "perf_1w",
        "Monthly Performance":          "perf_1m",
        "3-Month Performance":          "perf_3m",
        "Yearly Performance":           "perf_1y",
    }

    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

    # Calculate Indian Market ADR & LOD Extension metrics
    if "price" in df.columns and "low" in df.columns:
        p = pd.to_numeric(df["price"], errors="coerce").fillna(0.0)
        lod = pd.to_numeric(df["low"], errors="coerce").fillna(0.0)
        df["pct_from_lod"] = np.where(lod > 0, ((p - lod) / lod) * 100.0, 0.0)

        # ADR 14 (rupees) and ADR % from LOD
        adr_val = pd.to_numeric(df.get("adr_14", df.get("atr", 0.0)), errors="coerce").fillna(0.0)
        df["adr_14"] = adr_val
        df["adr_pct_from_lod"] = np.where(adr_val > 0, ((p - lod) / adr_val) * 100.0, 0.0)
        if "adr_pct" not in df.columns or df["adr_pct"].isnull().all():
            df["adr_pct"] = np.where(p > 0, (adr_val / p) * 100.0, 0.0)

    df["fetched_at"] = now
    df["timeframe"]  = timeframe
    df["universe"]   = universe or "nse500"
    df = df.where(pd.notnull(df), None)
    return df

def _get_db_conn():
    try:
        from database import get_connection
        return get_connection()
    except ImportError:
        from backend.database import get_connection
        return get_connection()

def _make_field_with_interval(field: StockField, tv_interval: Optional[str]):
    """Wrap a StockField with a TradingView time interval (or return base field if 1D or RELATIVE_VOLUME)."""
    if not tv_interval or tv_interval == "1D" or field == StockField.RELATIVE_VOLUME:
        return field
    return FieldWithInterval(field, tv_interval)



# Map indicator names → StockField for FieldWithInterval filter construction
_INDICATOR_TO_FIELD = {
    "RSI":     StockField.RELATIVE_STRENGTH_INDEX_14,
    "EMA":     StockField.EXPONENTIAL_MOVING_AVERAGE_20,
    "MACD":    StockField.MACD_LEVEL_12_26,
    "ADX":     StockField.AVERAGE_DIRECTIONAL_INDEX_14,
    "Volume":  StockField.VOLUME,
    "VWAP":    StockField.VOLUME_WEIGHTED_AVERAGE_PRICE,
    "Price":   StockField.PRICE,
    "RelVol":          StockField.RELATIVE_VOLUME,
    "Relative Volume": StockField.RELATIVE_VOLUME,
    "Rel_Vol":         StockField.RELATIVE_VOLUME,
    "Change %":        StockField.CHANGE_PERCENT,
    "Change":          StockField.CHANGE_PERCENT,
    "pChange":         StockField.CHANGE_PERCENT,
}



def run_tvscreener_scan(scanner: dict, limit: int = 500, universe: Optional[str] = None) -> list[dict]:
    rules       = scanner["rules"]
    timeframe   = scanner.get("timeframe", "1D")
    scan_univ   = universe or scanner.get("universe", "nse500")
    now         = datetime.now(timezone.utc).isoformat()
    tv_interval = TV_INTERVAL_MAP.get(timeframe, "1D")

    u_key = (scan_univ or "nse500").lower().strip()
    if u_key in UNIVERSE_CAPS:
        limit = min(limit, UNIVERSE_CAPS[u_key])

    print(f"[TV SCAN] Timeframe={timeframe} -> TV interval={tv_interval} | Univ={scan_univ} (Cap={limit})")

    try:
        ss = StockScreener()
        ss.set_markets(tv.Market.INDIA)
        _apply_universe_filter(ss, scan_univ)
        ss.sort_by(StockField.MARKET_CAPITALIZATION, ascending=False)
        ss.set_range(0, limit)

        # Construct the requested select columns list dynamically to include all rule fields
        select_fields = [
            StockField.NAME,
            StockField.DESCRIPTION,
            StockField.SECTOR,
            StockField.PRICE,
            StockField.CHANGE_PERCENT,
            StockField.MARKET_CAPITALIZATION,
            StockField.EXCHANGE,
        ]

        for rule in rules:
            ind        = rule.get("indicator", "")
            params     = rule.get("params", {})
            value_type = rule.get("value_type")
            value      = rule.get("value")

            rule_tf     = params.get("timeframe", timeframe)
            rule_tv_int = TV_INTERVAL_MAP.get(rule_tf, tv_interval)

            base_field = _INDICATOR_TO_FIELD.get(ind)
            if base_field:
                if ind == "EMA":
                    length = params.get("length", 20)
                    if length == 50:
                        base_field = StockField.EXPONENTIAL_MOVING_AVERAGE_50
                    elif length == 200:
                        base_field = StockField.EXPONENTIAL_MOVING_AVERAGE_200
                    else:
                        base_field = StockField.EXPONENTIAL_MOVING_AVERAGE_20
                elif ind == "SMA":
                    length = params.get("length", 50)
                    if length == 20:
                        base_field = StockField.SIMPLE_MOVING_AVERAGE_20
                    elif length == 200:
                        base_field = StockField.SIMPLE_MOVING_AVERAGE_200
                    else:
                        base_field = StockField.SIMPLE_MOVING_AVERAGE_50
                select_fields.append(_make_field_with_interval(base_field, rule_tv_int))

            if value_type == "indicator" and isinstance(value, dict):
                rhs_ind    = value.get("indicator", "")
                rhs_params = value.get("params", {})
                rhs_tf     = rhs_params.get("timeframe", rule_tf)
                rhs_tv_int = TV_INTERVAL_MAP.get(rhs_tf, tv_interval)
                rhs_base   = _INDICATOR_TO_FIELD.get(rhs_ind)
                if rhs_base:
                    if rhs_ind == "EMA":
                        rhs_len = rhs_params.get("length", 50)
                        if rhs_len == 200:
                            rhs_base = StockField.EXPONENTIAL_MOVING_AVERAGE_200
                        elif rhs_len == 50:
                            rhs_base = StockField.EXPONENTIAL_MOVING_AVERAGE_50
                        else:
                            rhs_base = StockField.EXPONENTIAL_MOVING_AVERAGE_20
                    elif rhs_ind == "SMA":
                        rhs_len = rhs_params.get("length", 50)
                        if rhs_len == 200:
                            rhs_base = StockField.SIMPLE_MOVING_AVERAGE_200
                        else:
                            rhs_base = StockField.SIMPLE_MOVING_AVERAGE_50
                    select_fields.append(_make_field_with_interval(rhs_base, rhs_tv_int))

        ss.select(*select_fields)


        # Apply timeframe-aware filters using FieldWithInterval for ALL timeframes
        # so TradingView evaluates each rule on the exact requested timeframe server-side.
        for rule in rules:
            ind        = rule.get("indicator", "")
            operator   = rule.get("operator", ">")
            value_type = rule.get("value_type", "number")
            value      = rule.get("value")
            params     = rule.get("params", {})

            rule_tf     = params.get("timeframe", timeframe)
            rule_tv_int = TV_INTERVAL_MAP.get(rule_tf, tv_interval)

            base_field = _INDICATOR_TO_FIELD.get(ind)
            if base_field is None:
                continue

            if ind == "EMA":
                length = params.get("length", 20)
                if length == 50:
                    base_field = StockField.EXPONENTIAL_MOVING_AVERAGE_50
                elif length == 200:
                    base_field = StockField.EXPONENTIAL_MOVING_AVERAGE_200
                else:
                    base_field = StockField.EXPONENTIAL_MOVING_AVERAGE_20

            try:
                lhs_fwi = _make_field_with_interval(base_field, rule_tv_int)
                if value_type == "number":
                    rhs = float(value)
                    if operator in (">", "crosses_above"):
                        ss.add_filter(lhs_fwi, FilterOperator.ABOVE, rhs)
                    elif operator in ("<", "crosses_below"):
                        ss.add_filter(lhs_fwi, FilterOperator.BELOW, rhs)
                    elif operator == ">=":
                        ss.add_filter(lhs_fwi, FilterOperator.ABOVE_OR_EQUAL, rhs)
                    elif operator == "<=":
                        ss.add_filter(lhs_fwi, FilterOperator.BELOW_OR_EQUAL, rhs)
                elif value_type == "indicator" and isinstance(value, dict):
                    rhs_ind    = value.get("indicator", "")
                    rhs_params = value.get("params", {})
                    rhs_tf     = rhs_params.get("timeframe", rule_tf)
                    rhs_tv_int = TV_INTERVAL_MAP.get(rhs_tf, tv_interval)
                    rhs_base   = _INDICATOR_TO_FIELD.get(rhs_ind)
                    if rhs_base and ind == "EMA":
                        rhs_len = rhs_params.get("length", 50)
                        if rhs_len == 200:
                            rhs_base = StockField.EXPONENTIAL_MOVING_AVERAGE_200
                        elif rhs_len == 50:
                            rhs_base = StockField.EXPONENTIAL_MOVING_AVERAGE_50
                        else:
                            rhs_base = StockField.EXPONENTIAL_MOVING_AVERAGE_20
                    if rhs_base:
                        rhs_fwi = _make_field_with_interval(rhs_base, rhs_tv_int)
                        if operator == "crosses_above":
                            ss.add_filter(lhs_fwi, FilterOperator.ABOVE, rhs_fwi)
                        elif operator == "crosses_below":
                            ss.add_filter(lhs_fwi, FilterOperator.BELOW, rhs_fwi)
                        elif operator == ">":
                            ss.add_filter(lhs_fwi, FilterOperator.ABOVE, rhs_fwi)
                        elif operator == "<":
                            ss.add_filter(lhs_fwi, FilterOperator.BELOW, rhs_fwi)
            except Exception as fe:
                print(f"[TV SCAN] Filter application error for {ind}: {fe}")
                continue

        df_raw = ss.get()
    except Exception as e:
        print(f"[TV SCAN] Error fetching screener data: {e}")
        return []

    if df_raw is None or df_raw.empty:
        return []

    # -----------------------------------------------------------------------
    # Post-filtering for Universe (F&O and Market Cap bounds) and Crossovers
    # -----------------------------------------------------------------------
    u = (scan_univ or "nse500").lower().strip()
    if u in ("fno", "f&o", "futures", "derivatives") and "Symbol" in df_raw.columns:
        fno_set = {s.upper() for s in NSE_FNO_SYMBOLS}
        def _is_fno(sym):
            s = str(sym).upper()
            if ":" in s:
                s = s.split(":", 1)[1]
            return s in fno_set
        df_raw = df_raw[df_raw["Symbol"].apply(_is_fno)].copy()

    if "Market Capitalization" in df_raw.columns:
        if u in ("largecap", "large_cap", "large"):
            df_raw = df_raw[df_raw["Market Capitalization"] > 2500000000].copy()
        elif u in ("midcap", "mid_cap", "mid"):
            df_raw = df_raw[(df_raw["Market Capitalization"] >= 500000000) & (df_raw["Market Capitalization"] <= 2500000000)].copy()
        elif u in ("smallcap", "small_cap", "small"):
            df_raw = df_raw[(df_raw["Market Capitalization"] >= 100000000) & (df_raw["Market Capitalization"] <= 500000000)].copy()
        elif u in ("microcap", "micro_cap", "micro"):
            df_raw = df_raw[df_raw["Market Capitalization"] < 100000000].copy()

    # Post-filtering for dynamic field-vs-field comparisons (which TradingView ignored)
    for rule in rules:
        op = rule.get("operator")
        val_type = rule.get("value_type")
        if val_type == "indicator":
            ind = rule.get("indicator")
            params = rule.get("params", {})
            lhs_col = resolve_field(ind, params, timeframe)
            
            value = rule.get("value")
            if isinstance(value, dict):
                rhs_ind = value.get("indicator")
                rhs_params = value.get("params", {})
                rhs_col = resolve_field(rhs_ind, rhs_params, timeframe)
                
                if lhs_col and rhs_col and lhs_col in df_raw.columns and rhs_col in df_raw.columns:
                    try:
                        lhs_series = pd.to_numeric(df_raw[lhs_col], errors='coerce')
                        rhs_series = pd.to_numeric(df_raw[rhs_col], errors='coerce')
                        
                        if op == ">":
                            df_raw = df_raw[lhs_series > rhs_series].copy()
                        elif op == "<":
                            df_raw = df_raw[lhs_series < rhs_series].copy()
                        elif op == ">=":
                            df_raw = df_raw[lhs_series >= rhs_series].copy()
                        elif op == "<=":
                            df_raw = df_raw[lhs_series <= rhs_series].copy()
                    except Exception as ex:
                        print(f"[TV SCAN] Error in post-filter comparison for {lhs_col} vs {rhs_col}: {ex}")

    # Generic Precision Crossover Post-Filtering (Fresh Crosses within tight timeframe-aware gap)
    is_intraday = timeframe in ("5m", "15m", "30m", "1H", "4H")
    crossover_threshold = 0.8 if is_intraday else 1.5

    for rule in rules:
        op = rule.get("operator")
        if op in ("crosses_above", "crosses_below"):
            ind = rule.get("indicator")
            params = rule.get("params", {})
            lhs_col = resolve_field(ind, params, timeframe)
            
            val_type = rule.get("value_type")
            value = rule.get("value")
            
            if val_type == "indicator" and isinstance(value, dict):
                rhs_ind = value.get("indicator")
                rhs_params = value.get("params", {})
                rhs_col = resolve_field(rhs_ind, rhs_params, timeframe)
                
                if lhs_col in df_raw.columns and rhs_col in df_raw.columns:
                    try:
                        lhs_series = pd.to_numeric(df_raw[lhs_col], errors='coerce')
                        rhs_series = pd.to_numeric(df_raw[rhs_col], errors='coerce')
                        
                        if op == "crosses_above":
                            gap = (lhs_series - rhs_series) / rhs_series * 100
                        else:
                            gap = (rhs_series - lhs_series) / rhs_series * 100
                            
                        df_raw = df_raw[(gap >= 0) & (gap <= crossover_threshold)].copy()
                    except Exception as ex:
                        print(f"[TV SCAN] Error in crossover calculation for {lhs_col} vs {rhs_col}: {ex}")
            
            elif val_type == "number":
                try:
                    rhs_val = float(value)
                    if lhs_col in df_raw.columns:
                        lhs_series = pd.to_numeric(df_raw[lhs_col], errors='coerce')
                        if rhs_val != 0:
                            if op == "crosses_above":
                                gap = (lhs_series - rhs_val) / rhs_val * 100
                            else:
                                gap = (rhs_val - lhs_series) / rhs_val * 100
                            df_raw = df_raw[(gap >= 0) & (gap <= crossover_threshold)].copy()
                        else:
                            if op == "crosses_above":
                                gap = lhs_series - rhs_val
                            else:
                                gap = rhs_val - lhs_series
                            df_raw = df_raw[(gap >= 0) & (gap <= (crossover_threshold * 1.5))].copy()
                except Exception as ex:
                    print(f"[TV SCAN] Error in crossover calculation for {lhs_col} vs number: {ex}")

    matches = []

    with _get_db_conn() as conn:
        for idx, row in df_raw.iterrows():
            tv_symbol = str(row.get("Symbol", ""))
            if ":" in tv_symbol:
                _, sym = tv_symbol.split(":", 1)
            else:
                sym = tv_symbol
            
            # Standardize yfinance symbol to .NS for 100% chart loading reliability
            from ohlcv_service import KNOWN_TICKER_ALIASES
            raw_ns = f"{sym}.NS"
            yf_sym = KNOWN_TICKER_ALIASES.get(raw_ns, raw_ns)
            exch = "NSE"


            sym_name   = str(row.get("Description", sym))
            sector     = str(row.get("Sector", "")) or None
            price      = _safe_float(row.get("Price")) or 0.0
            chg_pct    = _safe_float(row.get("Change %")) or 0.0
            market_cap = _safe_float(row.get("Market Capitalization")) or 0.0

            conn.execute(
                """
                INSERT INTO symbols (symbol, name, exchange, sector, market_cap, synced_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol) DO UPDATE SET
                    name       = excluded.name,
                    exchange   = excluded.exchange,
                    sector     = excluded.sector,
                    market_cap = excluded.market_cap,
                    synced_at  = excluded.synced_at,
                    is_active  = 1
                """,
                (yf_sym, sym_name, exch, sector, market_cap, now),
            )

            metric_vals = {}
            for i, rule in enumerate(rules):
                ind    = rule["indicator"]
                params = rule.get("params", {})
                rule_tf = params.get("timeframe")
                lhs_col = resolve_field(ind, params, timeframe)
                if lhs_col and lhs_col in row:
                    lhs_val = _safe_float(row.get(lhs_col))
                    if lhs_val is not None:
                        key = f"{ind} ({rule_tf})" if rule_tf else ind
                        metric_vals[key] = round(lhs_val, 4)

                if rule.get("value_type") == "indicator" and isinstance(rule.get("value"), dict):
                    rhs_dict = rule.get("value")
                    rhs_ind = rhs_dict.get("indicator")
                    rhs_params = rhs_dict.get("params", {})
                    rhs_tf = rhs_params.get("timeframe", rule_tf)
                    rhs_col = resolve_field(rhs_ind, rhs_params, timeframe)
                    if rhs_col and rhs_col in row:
                        rhs_val = _safe_float(row.get(rhs_col))
                        if rhs_val is not None:
                            key = f"{rhs_ind} ({rhs_tf})" if rhs_tf else rhs_ind
                            metric_vals[key] = round(rhs_val, 4)

            # Every row surviving server-side filters and universe post-filter is a match
            matches.append({
                "symbol":        yf_sym,
                "tv_ticker":     tv_symbol,
                "name":          sym_name,
                "sector":        sector,
                "last_close":    round(price, 2),
                "change_pct":    round(chg_pct, 2),
                "data_as_of":    now,
                "data_source":   f"TradingView Screener ({timeframe} live)",
                "metric_values": metric_vals,
            })


    return matches

def sync_symbols_from_tvscreener(limit: int = 500, universe: str = "nse500") -> int:
    now = datetime.now(timezone.utc).isoformat()
    print(f"[TV SYNC] Fetching top {limit} India equities ({universe}) from TradingView screener...")

    try:
        ss = StockScreener()
        ss.set_markets(tv.Market.INDIA)
        _apply_universe_filter(ss, universe)
        ss.sort_by(StockField.MARKET_CAPITALIZATION, ascending=False)
        ss.set_range(0, limit)
        df = ss.get()
    except Exception as exc:
        print(f"[TV SYNC] Error: {exc}")
        return 0

    if df is None or df.empty:
        print("[TV SYNC] No data returned.")
        return 0

    synced = 0
    with _get_db_conn() as conn:
        for idx, row in df.iterrows():
            tv_symbol = str(row.get("Symbol", ""))
            if ":" in tv_symbol:
                exch, sym = tv_symbol.split(":", 1)
                exchange = exch.upper()
            else:
                sym = tv_symbol
                exchange = str(row.get("Exchange", "NSE")).upper()

            yf_symbol  = f"{sym}.NS" if exchange == "NSE" else f"{sym}.BO"
            name       = str(row.get("Description", sym))
            sector     = str(row.get("Sector", "")) or None
            market_cap = _safe_float(row.get("Market Capitalization")) or 0.0

            conn.execute(
                """
                INSERT INTO symbols (symbol, name, exchange, sector, market_cap, synced_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol) DO UPDATE SET
                    name       = excluded.name,
                    exchange   = excluded.exchange,
                    sector     = excluded.sector,
                    market_cap = excluded.market_cap,
                    synced_at  = excluded.synced_at,
                    is_active  = 1
                """,
                (yf_symbol, name, exchange, sector, market_cap, now),
            )
            synced += 1

    print(f"[TV SYNC] Done. {synced} symbols upserted.")
    return synced

def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        return None if f != f else f
    except (TypeError, ValueError):
        return None

def _apply_operator(lhs: float, rhs: float, operator: str) -> bool:
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
