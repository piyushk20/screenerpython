"""
engine.py — Vectorized Backtesting Engine using vectorbt
Simulates portfolio performance, trade execution, transaction costs, equity curves, and trade records.
"""

from typing import Dict, Any, Optional, List
import pandas as pd
import numpy as np
import vectorbt as vbt


def run_vectorbt_backtest(
    df: pd.DataFrame,
    entries: pd.Series,
    exits: pd.Series,
    strategy_name: str,
    ticker: str,
    direction: str = "long",
    init_cash: float = 1_000_000.0,
    fees: float = 0.0005,      # 0.05% brokerage / STT
    slippage: float = 0.0005,  # 0.05% slippage
    benchmark_df: Optional[pd.DataFrame] = None
) -> Dict[str, Any]:
    """
    Run vectorized portfolio simulation using vectorbt.
    Returns portfolio object, returns series, equity curves, monthly heatmap, and trade logs.
    """
    close = df["Close"]
    
    # Ensure aligned boolean series
    entries = entries.reindex(close.index).fillna(False).astype(bool)
    exits = exits.reindex(close.index).fillna(False).astype(bool)

    if direction == "short":
        pf = vbt.Portfolio.from_signals(
            close=close,
            short_entries=entries,
            short_exits=exits,
            init_cash=init_cash,
            fees=fees,
            slippage=slippage,
            freq="1D"
        )
    else:
        pf = vbt.Portfolio.from_signals(
            close=close,
            entries=entries,
            exits=exits,
            init_cash=init_cash,
            fees=fees,
            slippage=slippage,
            freq="1D"
        )

    # Extract returns series
    returns_series = pf.returns()
    if isinstance(returns_series, pd.DataFrame):
        returns_series = returns_series.iloc[:, 0]
    
    # Ensure returns have proper DatetimeIndex
    returns_series.index = pd.to_datetime(returns_series.index)
    returns_series.name = f"{ticker}_{strategy_name}"

    # Extract equity series
    equity_series = pf.value()
    if isinstance(equity_series, pd.DataFrame):
        equity_series = equity_series.iloc[:, 0]

    # Calculate Drawdown series
    cum_max = equity_series.cummax()
    drawdown_series = (equity_series - cum_max) / cum_max * 100.0

    # Benchmark equity curve
    benchmark_equity = None
    if benchmark_df is not None and not benchmark_df.empty:
        b_close = benchmark_df["Close"].reindex(close.index).ffill().bfill()
        b_returns = b_close.pct_change().fillna(0.0)
        benchmark_equity = init_cash * (1 + b_returns).cumprod()

    # Format Equity Curve for Frontend Chart
    equity_curve: List[Dict[str, Any]] = []
    for dt, val in equity_series.items():
        dt_str = dt.strftime("%Y-%m-%d")
        b_val = float(benchmark_equity.loc[dt]) if benchmark_equity is not None and dt in benchmark_equity.index else init_cash
        dd_val = float(drawdown_series.loc[dt]) if dt in drawdown_series.index else 0.0
        equity_curve.append({
            "date": dt_str,
            "equity": round(float(val), 2),
            "benchmark": round(b_val, 2),
            "drawdown": round(dd_val, 2)
        })

    # Summary Metrics Calculations
    try:
        total_return = float(pf.total_return()) * 100.0
    except Exception:
        total_return = 0.0

    try:
        cagr = float(pf.annualized_return()) * 100.0
    except Exception:
        cagr = 0.0

    try:
        sharpe = float(pf.sharpe_ratio())
        if np.isnan(sharpe) or np.isinf(sharpe):
            sharpe = 0.0
    except Exception:
        sharpe = 0.0

    try:
        sortino = float(pf.sortino_ratio())
        if np.isnan(sortino) or np.isinf(sortino):
            sortino = 0.0
    except Exception:
        sortino = 0.0

    try:
        calmar = float(pf.calmar_ratio())
        if np.isnan(calmar) or np.isinf(calmar):
            calmar = 0.0
    except Exception:
        calmar = 0.0

    try:
        max_dd = float(pf.max_drawdown()) * 100.0
    except Exception:
        max_dd = 0.0

    # Trade Statistics & Trade Log
    trades = pf.trades
    total_trades = int(trades.count())
    trade_log: List[Dict[str, Any]] = []

    try:
        win_rate = float(trades.win_rate()) * 100.0 if total_trades > 0 else 0.0
        profit_factor = float(trades.profit_factor()) if total_trades > 0 else 0.0
        if np.isnan(win_rate):
            win_rate = 0.0
        if np.isnan(profit_factor) or np.isinf(profit_factor):
            profit_factor = 0.0

        records = trades.records_readable
        if records is not None and not records.empty:
            for _, r in records.iterrows():
                entry_time = pd.to_datetime(r.get("Entry Index", r.get("Entry Date", None)))
                exit_time = pd.to_datetime(r.get("Exit Index", r.get("Exit Date", None)))
                ret_pct = float(r.get("Return", 0.0)) * 100.0
                pnl = float(r.get("PnL", 0.0))
                dur = int(r.get("Duration", 0))

                trade_log.append({
                    "entry_date": entry_time.strftime("%Y-%m-%d") if pd.notnull(entry_time) else "—",
                    "entry_price": round(float(r.get("Entry Price", 0.0)), 2),
                    "exit_date": exit_time.strftime("%Y-%m-%d") if pd.notnull(exit_time) else "—",
                    "exit_price": round(float(r.get("Exit Price", 0.0)), 2),
                    "direction": direction.upper(),
                    "return_pct": round(ret_pct, 2),
                    "pnl": round(pnl, 2),
                    "duration_days": dur,
                    "won": ret_pct > 0
                })
    except Exception as e:
        print(f"[ENGINE] Trade log extraction error: {e}")
        win_rate = 0.0
        profit_factor = 0.0

    # Monthly Returns Matrix (Year x Month Grid)
    monthly_heatmap: Dict[str, Dict[str, float]] = {}
    try:
        monthly_ret = returns_series.resample("ME").apply(lambda r: (1 + r).prod() - 1) * 100.0
        for dt, m_ret in monthly_ret.items():
            yr = str(dt.year)
            m_name = dt.strftime("%b")
            if yr not in monthly_heatmap:
                monthly_heatmap[yr] = {}
            monthly_heatmap[yr][m_name] = round(float(m_ret), 2)

        # Add Year total column
        for yr in monthly_heatmap:
            yr_returns = [v for k, v in monthly_heatmap[yr].items() if k != "Year"]
            if yr_returns:
                compounded = ((np.prod([1 + r/100.0 for r in yr_returns])) - 1) * 100.0
                monthly_heatmap[yr]["Year"] = round(float(compounded), 2)
    except Exception as e:
        print(f"[ENGINE] Monthly heatmap error: {e}")

    # Alpha / Beta vs Benchmark
    alpha, beta = 0.0, 1.0
    if benchmark_df is not None and not benchmark_df.empty:
        try:
            b_ret = benchmark_df["Close"].pct_change().reindex(returns_series.index).dropna()
            strat_ret = returns_series.reindex(b_ret.index).dropna()
            if len(strat_ret) > 10 and len(b_ret) > 10:
                cov = np.cov(strat_ret, b_ret)[0][1]
                var_b = np.var(b_ret)
                beta = cov / var_b if var_b != 0 else 1.0
                # Annualized alpha
                alpha = (cagr - (float(beta) * float(((1 + b_ret).prod() ** (252 / len(b_ret)) - 1) * 100.0)))
                if np.isnan(alpha) or np.isinf(alpha):
                    alpha = 0.0
                if np.isnan(beta) or np.isinf(beta):
                    beta = 1.0
        except Exception:
            pass

    return {
        "ticker": ticker,
        "strategy_name": strategy_name,
        "direction": direction,
        "initial_capital": init_cash,
        "portfolio": pf,
        "returns": returns_series,
        "equity_curve": equity_curve,
        "monthly_heatmap": monthly_heatmap,
        "trade_log": trade_log,
        "metrics": {
            "Total Return (%)": round(total_return, 2),
            "CAGR (%)": round(cagr, 2),
            "Sharpe Ratio": round(sharpe, 2),
            "Sortino Ratio": round(sortino, 2),
            "Calmar Ratio": round(calmar, 2),
            "Max Drawdown (%)": round(max_dd, 2),
            "Win Rate (%)": round(win_rate, 2),
            "Total Trades": total_trades,
            "Profit Factor": round(profit_factor, 2),
            "Alpha (%)": round(float(alpha), 2),
            "Beta": round(float(beta), 2)
        }
    }
