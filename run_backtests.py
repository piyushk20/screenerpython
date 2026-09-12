"""
run_backtests.py — CLI Execution Suite for NSE Strategy Backtesting
Runs all screener strategies across target NSE stocks/indices using vectorbt and quantstats.
"""

import sys
import os
from pathlib import Path

# Ensure UTF-8 output on Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Add project root and backend to python path
ROOT_DIR = Path(__file__).parent
sys.path.insert(0, str(ROOT_DIR))
sys.path.insert(0, str(ROOT_DIR / "backend"))

import pandas as pd
from tabulate import tabulate
from backend.backtest.data_loader import fetch_historical_ohlcv, DEFAULT_TICKERS
from backend.backtest.strategies import STRATEGY_REGISTRY
from backend.backtest.engine import run_vectorbt_backtest
from backend.backtest.reporter import generate_quantstats_tearsheet, build_summary_dataframe


def main():
    print("=" * 80)
    print("   [+] NSE STOCK SCREENER - QUANTITATIVE BACKTESTING SUITE (vectorbt + quantstats)   ")
    print("=" * 80)

    reports_dir = ROOT_DIR / "reports"
    tearsheet_dir = reports_dir / "tearsheets"
    tearsheet_dir.mkdir(parents=True, exist_ok=True)

    # 1. Fetch Benchmark Data (Nifty 50)
    print("\n[1/4] Fetching Benchmark Data (Nifty 50: ^NSEI)...")
    try:
        benchmark_df = fetch_historical_ohlcv("^NSEI", period="5y")
        benchmark_returns = benchmark_df["Close"].pct_change().dropna()
        benchmark_returns.name = "NIFTY50_Benchmark"
    except Exception as e:
        print(f"[!] Warning: Could not fetch benchmark ^NSEI: {e}")
        benchmark_returns = None

    # 2. Target Tickers to test
    target_tickers = {
        "RELIANCE": "RELIANCE.NS",
        "NIFTY50": "^NSEI",
        "BANKNIFTY": "^NSEBANK",
        "HDFCBANK": "HDFCBANK.NS",
        "TCS": "TCS.NS"
    }

    # 3. Iterate over tickers and strategies
    print(f"\n[2/4] Executing Backtests across {len(target_tickers)} assets and {len(STRATEGY_REGISTRY)} strategies...")
    all_results = []

    for ticker_name, ticker_symbol in target_tickers.items():
        print(f"\n>>> Processing {ticker_name} ({ticker_symbol})...")
        try:
            df = fetch_historical_ohlcv(ticker_symbol, period="5y")
        except Exception as e:
            print(f"    [X] Failed to load {ticker_name}: {e}")
            continue

        for strat_key, strat_info in STRATEGY_REGISTRY.items():
            strat_name = strat_info["name"]
            strat_func = strat_info["func"]
            direction = strat_info.get("direction", "long")

            try:
                entries, exits = strat_func(df)
                
                # Check if there are any signals generated
                if entries.sum() == 0:
                    print(f"    [!] {strat_name}: No entry signals generated.")
                    continue

                # Run vectorbt simulation
                res = run_vectorbt_backtest(
                    df=df,
                    entries=entries,
                    exits=exits,
                    strategy_name=strat_name,
                    ticker=ticker_name,
                    direction=direction,
                    init_cash=1_000_000.0,
                    fees=0.0005,
                    slippage=0.0005
                )

                # Generate QuantStats Tearsheet
                ts_path = generate_quantstats_tearsheet(
                    returns=res["returns"],
                    benchmark_returns=benchmark_returns,
                    strategy_name=strat_name,
                    ticker=ticker_name,
                    output_dir=tearsheet_dir
                )
                res["tearsheet_path"] = ts_path
                all_results.append(res)

                m = res["metrics"]
                print(f"    [OK] {strat_name:<32} | Ret: {m['Total Return (%)']:>7.2f}% | CAGR: {m['CAGR (%)']:>6.2f}% | Sharpe: {m['Sharpe Ratio']:>5.2f} | MaxDD: {m['Max Drawdown (%)']:>6.2f}% | Trades: {m['Total Trades']:>3}")

            except Exception as e:
                print(f"    [X] Error running {strat_name} on {ticker_name}: {e}")

    # 4. Aggregate and Export Summary
    print("\n[3/4] Aggregating Strategy Performance Matrix...")
    summary_df = build_summary_dataframe(all_results)
    
    csv_path = reports_dir / "summary_matrix.csv"
    summary_df.to_csv(csv_path, index=False)
    print(f"[REPORTS] Summary CSV saved to: {csv_path}")

    # 5. Display Leaderboard
    print("\n[4/4] STRATEGY LEADERBOARD (Sorted by Sharpe Ratio)")
    print("=" * 110)
    display_cols = ["Ticker", "Strategy", "Total Return (%)", "CAGR (%)", "Sharpe", "Sortino", "Max DD (%)", "Win Rate (%)", "Trades", "Profit Factor"]
    if not summary_df.empty:
        print(tabulate(summary_df[display_cols].head(25), headers="keys", tablefmt="grid", showindex=False))
    else:
        print("No strategy results generated.")
    print("=" * 110)
    print(f"\n[+] All HTML tearsheets are stored in: {tearsheet_dir}")


if __name__ == "__main__":
    main()
