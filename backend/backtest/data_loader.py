"""
data_loader.py — Historical OHLCV Data Ingestion for NSE Backtesting
Downloads daily data via Yahoo Finance (yfinance) and prepares indicators.
"""

from typing import Dict, Optional, List
import pandas as pd
import yfinance as yf
import numpy as np


DEFAULT_TICKERS = {
    "NIFTY50": "^NSEI",
    "BANKNIFTY": "^NSEBANK",
    "RELIANCE": "RELIANCE.NS",
    "HDFCBANK": "HDFCBANK.NS",
    "TCS": "TCS.NS",
    "INFY": "INFY.NS",
}


def fetch_historical_ohlcv(
    ticker: str,
    period: str = "5y",
    interval: str = "1d",
    start: Optional[str] = None,
    end: Optional[str] = None
) -> pd.DataFrame:
    """
    Download daily OHLCV data for a ticker using yfinance.
    Ensures clean datetime index, timezone normalization, and valid OHLCV columns.
    """
    clean_ticker = ticker.strip()
    if not clean_ticker.startswith("^") and not (clean_ticker.endswith(".NS") or clean_ticker.endswith(".BO")):
        clean_ticker = f"{clean_ticker}.NS"

    print(f"[DATA_LOADER] Fetching {clean_ticker} (period={period}, interval={interval})...")
    
    if start and end:
        df = yf.download(clean_ticker, start=start, end=end, interval=interval, progress=False, auto_adjust=True)
    else:
        df = yf.download(clean_ticker, period=period, interval=interval, progress=False, auto_adjust=True)

    if df.empty:
        raise ValueError(f"No historical data returned for ticker '{clean_ticker}'.")

    # Handle multi-level columns if returned by newer yfinance
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]

    # Standardize column names
    df = df.rename(columns={
        "Open": "Open",
        "High": "High",
        "Low": "Low",
        "Close": "Close",
        "Volume": "Volume"
    })

    # Drop any rows with NaN in Close
    df = df.dropna(subset=["Close"])
    
    # Ensure index is timezone-naive DatetimeIndex for vectorbt / quantstats compatibility
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)

    # Basic indicator calculations
    df = calculate_base_indicators(df)
    
    return df


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Calculate standard RSI."""
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    
    # Exponential smoothing for RSI
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, min_periods=period, adjust=False).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50.0)


def calculate_base_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Enrich dataframe with EMA, SMA, RSI, Relative Volume, and Multi-Timeframe signals."""
    df = df.copy()

    # Moving averages
    df["EMA_20"] = df["Close"].ewm(span=20, adjust=False).mean()
    df["EMA_50"] = df["Close"].ewm(span=50, adjust=False).mean()
    df["EMA_200"] = df["Close"].ewm(span=200, adjust=False).mean()
    df["SMA_20"] = df["Close"].rolling(window=20).mean()

    # Daily RSI (14)
    df["RSI_14"] = compute_rsi(df["Close"], period=14)

    # Volume Indicators
    df["VOL_SMA_20"] = df["Volume"].rolling(window=20).mean()
    df["RelVol"] = df["Volume"] / df["VOL_SMA_20"].replace(0, np.nan)
    df["RelVol"] = df["RelVol"].fillna(1.0)

    # Weekly RSI for Multi-Timeframe Strategy
    try:
        weekly_close = df["Close"].resample("W-FRI").last().dropna()
        weekly_rsi = compute_rsi(weekly_close, period=14)
        # Forward fill weekly RSI to daily timeframe
        df["Weekly_RSI_14"] = weekly_rsi.reindex(df.index, method="ffill").fillna(50.0)
    except Exception:
        df["Weekly_RSI_14"] = df["RSI_14"]

    return df


def load_all_target_data(tickers: Optional[Dict[str, str]] = None, period: str = "5y") -> Dict[str, pd.DataFrame]:
    """Load historical data for all requested tickers."""
    target_tickers = tickers or DEFAULT_TICKERS
    data_dict = {}
    for name, sym in target_tickers.items():
        try:
            data_dict[name] = fetch_historical_ohlcv(sym, period=period)
        except Exception as e:
            print(f"[DATA_LOADER] Error loading {name} ({sym}): {e}")
    return data_dict
