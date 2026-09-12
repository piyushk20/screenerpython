"""
strategies.py — Strategy Signal Generators for NSE Screener
Translates application scanner rules into vectorized entry/exit boolean signals.
"""

from typing import Tuple, Dict, Callable, Any
import pandas as pd


def strategy_ema_golden_cross(df: pd.DataFrame) -> Tuple[pd.Series, pd.Series]:
    """
    Bullish: EMA 20 Crosses Above EMA 50
    Exit: EMA 20 Crosses Below EMA 50
    """
    fast = df["EMA_20"]
    slow = df["EMA_50"]
    entries = (fast > slow) & (fast.shift(1) <= slow.shift(1))
    exits = (fast < slow) & (fast.shift(1) >= slow.shift(1))
    return entries.fillna(False), exits.fillna(False)


def strategy_ema_death_cross(df: pd.DataFrame) -> Tuple[pd.Series, pd.Series]:
    """
    Bearish: EMA 20 Crosses Below EMA 50
    Exit: EMA 20 Crosses Above EMA 50
    """
    fast = df["EMA_20"]
    slow = df["EMA_50"]
    entries = (fast < slow) & (fast.shift(1) >= slow.shift(1))
    exits = (fast > slow) & (fast.shift(1) <= slow.shift(1))
    return entries.fillna(False), exits.fillna(False)


def strategy_ema_trend_holding(df: pd.DataFrame) -> Tuple[pd.Series, pd.Series]:
    """
    EMA 20 > EMA 50 (Uptrend) with Pullback Recovery
    Entry: Fast EMA > Slow EMA and Price crosses above Fast EMA
    Exit: Price closes below Slow EMA 50
    """
    fast = df["EMA_20"]
    slow = df["EMA_50"]
    close = df["Close"]
    entries = (fast > slow) & (close > fast) & (close.shift(1) <= fast.shift(1))
    exits = close < slow
    return entries.fillna(False), exits.fillna(False)


def strategy_rsi_breakout(df: pd.DataFrame) -> Tuple[pd.Series, pd.Series]:
    """
    RSI Bullish Breakout (> 55)
    Entry: RSI crosses above 55
    Exit: RSI falls below 45
    """
    rsi = df["RSI_14"]
    entries = (rsi > 55) & (rsi.shift(1) <= 55)
    exits = rsi < 45
    return entries.fillna(False), exits.fillna(False)


def strategy_mtf_rsi_momentum(df: pd.DataFrame) -> Tuple[pd.Series, pd.Series]:
    """
    Bullish: Multi-Timeframe RSI Breakout
    Entry: Monthly/Weekly RSI > 60 AND Daily RSI crosses above 55
    Exit: Daily RSI falls below 45
    """
    daily_rsi = df["RSI_14"]
    weekly_rsi = df.get("Weekly_RSI_14", daily_rsi)
    entries = (weekly_rsi > 60) & (daily_rsi > 55) & (daily_rsi.shift(1) <= 55)
    exits = daily_rsi < 45
    return entries.fillna(False), exits.fillna(False)


def strategy_minervini_vcp(df: pd.DataFrame) -> Tuple[pd.Series, pd.Series]:
    """
    Bullish: Minervini VCP Trend Filter
    Entry: EMA 50 > EMA 200, RSI > 50, Relative Volume > 1.2x, Price crosses EMA 50
    Exit: Price closes below EMA 50
    """
    ema_50 = df["EMA_50"]
    ema_200 = df["EMA_200"]
    rsi = df["RSI_14"]
    rel_vol = df["RelVol"]
    close = df["Close"]

    entries = (
        (ema_50 > ema_200) &
        (rsi > 50) &
        (rel_vol > 1.2) &
        (close > ema_50) &
        (close.shift(1) <= ema_50.shift(1))
    )
    exits = close < ema_50
    return entries.fillna(False), exits.fillna(False)


def strategy_relative_volume_breakout(df: pd.DataFrame) -> Tuple[pd.Series, pd.Series]:
    """
    Momentum: High Relative Volume Breakout (> 1.5x)
    Entry: Volume > 1.5x 20-day average, Close > EMA 20 and positive candle
    Exit: Price closes below EMA 20
    """
    rel_vol = df["RelVol"]
    close = df["Close"]
    ema_20 = df["EMA_20"]
    open_p = df["Open"]

    entries = (rel_vol > 1.5) & (close > ema_20) & (close > open_p) & (close.shift(1) <= ema_20.shift(1))
    exits = close < ema_20
    return entries.fillna(False), exits.fillna(False)


def strategy_daily_momentum_breakout(df: pd.DataFrame) -> Tuple[pd.Series, pd.Series]:
    """
    ORB/Momentum Proxy (Daily): Price > SMA 20, RSI > 50, Relative Volume > 1.2x
    Entry: Price crosses above SMA 20 with RSI > 50 & Volume > 1.2x
    Exit: Price falls below SMA 20
    """
    sma_20 = df["SMA_20"]
    close = df["Close"]
    rsi = df["RSI_14"]
    rel_vol = df["RelVol"]

    entries = (close > sma_20) & (close.shift(1) <= sma_20.shift(1)) & (rsi > 50) & (rel_vol > 1.2)
    exits = close < sma_20
    return entries.fillna(False), exits.fillna(False)


# Registry of all strategies for dynamic iteration
STRATEGY_REGISTRY: Dict[str, Dict[str, Any]] = {
    "EMA_20_50_Golden_Cross": {
        "name": "EMA 20/50 Golden Cross",
        "description": "Fast EMA 20 crosses above Slow EMA 50",
        "func": strategy_ema_golden_cross,
        "direction": "long"
    },
    "EMA_20_50_Death_Cross": {
        "name": "EMA 20/50 Death Cross",
        "description": "Fast EMA 20 crosses below Slow EMA 50 (Short/Exit)",
        "func": strategy_ema_death_cross,
        "direction": "short"
    },
    "EMA_Trend_Holding": {
        "name": "EMA 20 > 50 Trend Holding",
        "description": "Uptrend continuation with pullback above EMA 20",
        "func": strategy_ema_trend_holding,
        "direction": "long"
    },
    "RSI_Bullish_Breakout": {
        "name": "RSI Bullish Breakout (>55)",
        "description": "RSI(14) crosses above 55 bullish momentum zone",
        "func": strategy_rsi_breakout,
        "direction": "long"
    },
    "Multi_Timeframe_RSI": {
        "name": "Multi-Timeframe RSI Momentum",
        "description": "Weekly RSI > 60 with Daily RSI crossing 55",
        "func": strategy_mtf_rsi_momentum,
        "direction": "long"
    },
    "Minervini_VCP": {
        "name": "Minervini VCP Trend Filter",
        "description": "EMA 50 > 200, RSI > 50, RelVol > 1.2x",
        "func": strategy_minervini_vcp,
        "direction": "long"
    },
    "High_Relative_Volume": {
        "name": "High Relative Volume Breakout",
        "description": "Volume surge > 1.5x with close > EMA 20",
        "func": strategy_relative_volume_breakout,
        "direction": "long"
    },
    "Daily_Momentum_Breakout": {
        "name": "Daily Momentum Breakout",
        "description": "SMA 20 breakout with RSI > 50 and volume confirmation",
        "func": strategy_daily_momentum_breakout,
        "direction": "long"
    }
}
