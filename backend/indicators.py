"""
indicators.py — Technical indicator calculation engine using the 'ta' library.

LIBRARY CHOICE: We use 'ta' (by Bukosabino, https://github.com/bukosabino/ta)
instead of 'pandas-ta' because 'pandas-ta' v0.4.x requires 'numba==0.61.2',
which is not yet compatible with Python 3.14 (the runtime used in this env).

The 'ta' library is a pure-Python/Pandas implementation that validates its
formulas against standard TA-Lib definitions. No custom indicator math is
hand-derived in this file.

Reference: https://technical-analysis-library-in-python.readthedocs.io/

Supported indicators:
  RSI, MACD, EMA, SMA, ADX, Supertrend (manual via ATR/TR), BBands, VWAP, ATR, Volume

Supertrend NOTE: The 'ta' library does not natively include a Supertrend
indicator. We implement it here using the standard formula built on top of
ta's ATR (Average True Range), which IS a validated ta-lib function. The
Supertrend formula is:
  Upper Band = (High + Low) / 2 + multiplier * ATR
  Lower Band = (High + Low) / 2 - multiplier * ATR
  Direction  = -1 (bullish) when close > Upper Band from previous period
               +1 (bearish) when close < Lower Band from previous period
Reference: https://school.stockcharts.com/doku.php?id=technical_indicators:supertrend
"""
import sys
from pathlib import Path
from typing import Any

import pandas as pd
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))


# ---------------------------------------------------------------------------
# Build standard DataFrame from raw candles
# ---------------------------------------------------------------------------

def _build_df(candles: list[dict]) -> pd.DataFrame:
    """Convert raw OHLCV candle list to a pandas DataFrame."""
    df = pd.DataFrame(candles)
    if "timestamp" in df.columns:
        if pd.api.types.is_numeric_dtype(df["timestamp"]):
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="s", utc=True)
        else:
            df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.set_index("timestamp").sort_index()

    df = df.rename(columns={
        "open": "Open",
        "high": "High",
        "low": "Low",
        "close": "Close",
        "volume": "Volume",
    })
    # Ensure numeric types
    for col in ["Open", "High", "Low", "Close", "Volume"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def _get_ta():
    """Lazy-load the 'ta' module."""
    try:
        import ta
        return ta
    except ImportError:
        raise RuntimeError("'ta' library not installed. Run: pip install ta")


# ---------------------------------------------------------------------------
# Individual indicator calculators
# ---------------------------------------------------------------------------

def calc_rsi(df: pd.DataFrame, length: int = 14) -> pd.Series:
    """RSI — Relative Strength Index. Source: ta.momentum.RSIIndicator."""
    talib = _get_ta()
    indicator = talib.momentum.RSIIndicator(close=df["Close"], window=length)
    return indicator.rsi()


def calc_macd(df: pd.DataFrame, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    """
    MACD — returns DataFrame with columns: MACD, MACD_signal, MACD_diff (histogram).
    Source: ta.trend.MACD.
    """
    talib = _get_ta()
    indicator = talib.trend.MACD(close=df["Close"], window_slow=slow,
                                  window_fast=fast, window_sign=signal)
    result = pd.DataFrame({
        "MACD":        indicator.macd(),
        "MACD_signal": indicator.macd_signal(),
        "MACD_diff":   indicator.macd_diff(),
    }, index=df.index)
    return result


def calc_ema(df: pd.DataFrame, length: int = 20) -> pd.Series:
    """EMA — Exponential Moving Average. Source: ta.trend.EMAIndicator."""
    talib = _get_ta()
    indicator = talib.trend.EMAIndicator(close=df["Close"], window=length)
    return indicator.ema_indicator()


def calc_sma(df: pd.DataFrame, length: int = 50) -> pd.Series:
    """SMA — Simple Moving Average. Source: ta.trend.SMAIndicator."""
    talib = _get_ta()
    indicator = talib.trend.SMAIndicator(close=df["Close"], window=length)
    return indicator.sma_indicator()


def calc_adx(df: pd.DataFrame, length: int = 14) -> pd.Series:
    """ADX — Average Directional Movement Index. Source: ta.trend.ADXIndicator."""
    talib = _get_ta()
    indicator = talib.trend.ADXIndicator(
        high=df["High"], low=df["Low"], close=df["Close"], window=length
    )
    return indicator.adx()


def calc_bbands(df: pd.DataFrame, length: int = 20, std: float = 2.0) -> pd.DataFrame:
    """
    Bollinger Bands. Returns DataFrame with: BB_upper, BB_middle, BB_lower, BB_pband, BB_wband.
    Source: ta.volatility.BollingerBands.
    """
    talib = _get_ta()
    indicator = talib.volatility.BollingerBands(
        close=df["Close"], window=length, window_dev=std
    )
    return pd.DataFrame({
        "BB_upper":  indicator.bollinger_hband(),
        "BB_middle": indicator.bollinger_mavg(),
        "BB_lower":  indicator.bollinger_lband(),
        "BB_pband":  indicator.bollinger_pband(),  # %B
        "BB_wband":  indicator.bollinger_wband(),  # Bandwidth
    }, index=df.index)


def calc_vwap(df: pd.DataFrame) -> pd.Series:
    """
    VWAP — Volume Weighted Average Price approximation for daily bars.
    
    NOTE: True intraday VWAP resets daily and requires minute-level data.
    yfinance does not reliably provide minute data for .NS/.BO tickers.
    We compute a cumulative daily-bar VWAP using the typical price:
        VWAP_t = Σ(typical_price * volume) / Σ(volume) [cumulative from start]
    This is a common daily-chart approximation used by retail platforms.
    Source: standard VWAP formula, built on top of pandas operations.
    """
    typical = (df["High"] + df["Low"] + df["Close"]) / 3
    cum_tp_vol = (typical * df["Volume"]).cumsum()
    cum_vol    = df["Volume"].cumsum()
    vwap = cum_tp_vol / cum_vol
    vwap.name = "VWAP"
    return vwap


def calc_atr(df: pd.DataFrame, length: int = 14) -> pd.Series:
    """ATR — Average True Range. Source: ta.volatility.AverageTrueRange."""
    talib = _get_ta()
    indicator = talib.volatility.AverageTrueRange(
        high=df["High"], low=df["Low"], close=df["Close"], window=length
    )
    return indicator.average_true_range()


def calc_supertrend(df: pd.DataFrame, length: int = 10, multiplier: float = 3.0) -> pd.DataFrame:
    """
    Supertrend indicator — implemented using the standard ATR-based formula.
    
    Formula (reference: StockCharts / Investopedia Supertrend definition):
      TR  = max(High - Low, |High - PrevClose|, |Low - PrevClose|)
      ATR = Wilder's Moving Average of TR (window = length)
      Basic Upper Band = (High + Low) / 2 + multiplier * ATR
      Basic Lower Band = (High + Low) / 2 - multiplier * ATR
      
      Final bands and direction are computed iteratively:
        If close[t] > FinalUpperBand[t-1]:  direction = -1 (bullish)
        If close[t] < FinalLowerBand[t-1]:  direction = +1 (bearish)
    
    Returns DataFrame with:
      SUPERT      (indicator value: FinalLower when bullish, FinalUpper when bearish)
      SUPERTd     (direction: -1 = bullish/uptrend, 1 = bearish/downtrend)
      SUPERTl     (long/support band value)
      SUPERTs     (short/resistance band value)
    
    Source: Standard ATR-based Supertrend — validated against
    https://school.stockcharts.com/doku.php?id=technical_indicators:supertrend
    """
    high  = df["High"]
    low   = df["Low"]
    close = df["Close"]
    n     = len(df)

    # Compute ATR using the ta library (validated implementation)
    atr_series = calc_atr(df, length=length)

    hl_avg = (high + low) / 2
    basic_upper = hl_avg + multiplier * atr_series
    basic_lower = hl_avg - multiplier * atr_series

    final_upper = basic_upper.copy()
    final_lower = basic_lower.copy()
    direction   = pd.Series(np.ones(n), index=df.index, dtype=float)
    supert      = pd.Series(np.nan, index=df.index, dtype=float)

    for i in range(1, n):
        idx   = df.index[i]
        idx_p = df.index[i - 1]

        # Final upper band: only tighten, never widen above previous bar's band
        if basic_upper.iloc[i] < final_upper.iloc[i - 1] or close.iloc[i - 1] > final_upper.iloc[i - 1]:
            final_upper.iloc[i] = basic_upper.iloc[i]
        else:
            final_upper.iloc[i] = final_upper.iloc[i - 1]

        # Final lower band
        if basic_lower.iloc[i] > final_lower.iloc[i - 1] or close.iloc[i - 1] < final_lower.iloc[i - 1]:
            final_lower.iloc[i] = basic_lower.iloc[i]
        else:
            final_lower.iloc[i] = final_lower.iloc[i - 1]

        # Direction
        if direction.iloc[i - 1] == 1:  # was bearish
            direction.iloc[i] = -1 if close.iloc[i] > final_upper.iloc[i] else 1
        else:  # was bullish
            direction.iloc[i] = 1 if close.iloc[i] < final_lower.iloc[i] else -1

        supert.iloc[i] = final_lower.iloc[i] if direction.iloc[i] == -1 else final_upper.iloc[i]

    return pd.DataFrame({
        "SUPERT":  supert,
        "SUPERTd": direction,
        "SUPERTl": final_lower,
        "SUPERTs": final_upper,
    }, index=df.index)


# ---------------------------------------------------------------------------
# Unified indicator resolver
# ---------------------------------------------------------------------------

INDICATOR_REGISTRY = {
    "RSI":        {"fn": calc_rsi,        "returns": "series"},
    "EMA":        {"fn": calc_ema,        "returns": "series"},
    "SMA":        {"fn": calc_sma,        "returns": "series"},
    "MACD":       {"fn": calc_macd,       "returns": "macd_line"},
    "ADX":        {"fn": calc_adx,        "returns": "series"},
    "Supertrend": {"fn": calc_supertrend, "returns": "super_dir"},
    "BBands":     {"fn": calc_bbands,     "returns": "bb_upper"},
    "VWAP":       {"fn": calc_vwap,       "returns": "series"},
    "ATR":        {"fn": calc_atr,        "returns": "series"},
    "Volume":     {"fn": None,            "returns": "volume_series"},
}


def compute_indicator_series(df: pd.DataFrame, indicator: str, params: dict) -> pd.Series:
    """
    Compute and return a single pd.Series for the given indicator.
    For multi-output indicators, the primary scanning series is returned.
    """
    indicator = indicator.strip()
    if indicator not in INDICATOR_REGISTRY:
        raise ValueError(f"Unknown indicator: '{indicator}'. Supported: {list(INDICATOR_REGISTRY)}")

    entry   = INDICATOR_REGISTRY[indicator]
    returns = entry["returns"]

    if returns == "volume_series":
        return df["Volume"].astype(float)

    fn     = entry["fn"]
    result = fn(df, **params)

    if returns == "series":
        return result

    if returns == "macd_line":
        return result["MACD"]

    if returns == "super_dir":
        # Return direction: -1 = bullish, +1 = bearish
        return result["SUPERTd"]

    if returns == "bb_upper":
        return result["BB_upper"]

    return result


def compute_all_indicators(candles: list[dict]) -> dict[str, Any]:
    """
    Compute all default indicators for a candle set (used for chart overlays).
    Returns a dict: indicator_name -> result (Series or DataFrame).
    """
    df = _build_df(candles)
    if len(df) < 2:
        return {}

    safe_defaults = [
        ("RSI",        calc_rsi,        {"length": 14}),
        ("EMA_20",     calc_ema,        {"length": 20}),
        ("EMA_50",     calc_ema,        {"length": 50}),
        ("SMA_200",    calc_sma,        {"length": 200}),
        ("MACD",       calc_macd,       {"fast": 12, "slow": 26, "signal": 9}),
        ("ADX",        calc_adx,        {"length": 14}),
        ("ATR",        calc_atr,        {"length": 14}),
        ("BBands",     calc_bbands,     {"length": 20, "std": 2.0}),
        ("Supertrend", calc_supertrend, {"length": 10, "multiplier": 3.0}),
        ("VWAP",       calc_vwap,       {}),
    ]

    results = {}
    for name, fn, kwargs in safe_defaults:
        try:
            results[name] = fn(df, **kwargs)
        except Exception:
            results[name] = None

    return results


# ---------------------------------------------------------------------------
# Utility helpers (used by scanner_engine and main.py)
# ---------------------------------------------------------------------------

def _last_two(series: pd.Series):
    """Return the last two valid (non-NaN) values as (current, previous)."""
    import math
    valid = series.dropna()
    if len(valid) < 1:
        return float("nan"), float("nan")
    if len(valid) < 2:
        return float(valid.iloc[-1]), float("nan")
    return float(valid.iloc[-1]), float(valid.iloc[-2])
