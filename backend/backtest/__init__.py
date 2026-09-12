"""
backtest package — Quantitative Vectorized Backtesting Suite for NSE Screener
"""

from .data_loader import fetch_historical_ohlcv, load_all_target_data, DEFAULT_TICKERS
from .strategies import STRATEGY_REGISTRY
from .engine import run_vectorbt_backtest
from .reporter import generate_quantstats_tearsheet, build_summary_dataframe

__all__ = [
    "fetch_historical_ohlcv",
    "load_all_target_data",
    "DEFAULT_TICKERS",
    "STRATEGY_REGISTRY",
    "run_vectorbt_backtest",
    "generate_quantstats_tearsheet",
    "build_summary_dataframe"
]
