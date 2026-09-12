"""
reporter.py — QuantStats Performance Analysis & Tearsheet Generator
Generates full HTML tearsheets and consolidated comparative metrics matrix.
"""

from pathlib import Path
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
import quantstats as qs


# Extend pandas with quantstats functions
qs.extend_pandas()


def generate_quantstats_tearsheet(
    returns: pd.Series,
    benchmark_returns: Optional[pd.Series],
    strategy_name: str,
    ticker: str,
    output_dir: Path
) -> str:
    """
    Generate an interactive standalone HTML performance tearsheet via QuantStats.
    Returns the absolute path to the generated HTML report.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    
    clean_sym = ticker.replace("^", "").replace(".NS", "").replace(":", "_")
    clean_strat = strategy_name.replace(" ", "_").replace("/", "_").replace(">", "GT").replace("<", "LT")
    filename = f"{clean_sym}_{clean_strat}_tearsheet.html"
    report_path = output_dir / filename

    # Prepare and align returns series
    ret = returns.dropna()
    if ret.empty:
        return ""

    bench = None
    if benchmark_returns is not None and not benchmark_returns.empty:
        bench = benchmark_returns.reindex(ret.index).fillna(0.0)

    title = f"{strategy_name} on {ticker} — QuantStats Performance Tearsheet"

    try:
        qs.reports.html(
            returns=ret,
            benchmark=bench,
            output=str(report_path),
            title=title,
            download_filename=filename
        )
        print(f"[REPORTER] Generated tearsheet: {report_path}")
        return str(report_path)
    except Exception as e:
        print(f"[REPORTER] Error generating HTML tearsheet for {ticker} - {strategy_name}: {e}")
        # Fallback: create a custom styled summary HTML if QuantStats plotly/template encounters issue
        return generate_custom_html_report(ret, bench, strategy_name, ticker, report_path)


def generate_custom_html_report(
    returns: pd.Series,
    benchmark_returns: Optional[pd.Series],
    strategy_name: str,
    ticker: str,
    report_path: Path
) -> str:
    """Fallback generator for self-contained HTML performance overview."""
    cum_returns = (1 + returns).cumprod() - 1
    total_ret = cum_returns.iloc[-1] * 100.0 if not cum_returns.empty else 0.0
    cagr = qs.stats.cagr(returns) * 100.0
    sharpe = qs.stats.sharpe(returns)
    sortino = qs.stats.sortino(returns)
    max_dd = qs.stats.max_drawdown(returns) * 100.0
    win_rate = qs.stats.win_rate(returns) * 100.0

    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{strategy_name} - {ticker} Performance</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 30px; }}
        .card {{ background: #1e293b; border-radius: 12px; padding: 24px; max-width: 800px; margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }}
        h1 {{ color: #38bdf8; font-size: 24px; margin-top: 0; }}
        .badge {{ background: #0284c7; padding: 4px 10px; border-radius: 6px; font-size: 13px; }}
        .grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px; }}
        .metric {{ background: #334155; padding: 16px; border-radius: 8px; text-align: center; }}
        .metric-label {{ font-size: 12px; color: #94a3b8; text-transform: uppercase; }}
        .metric-val {{ font-size: 22px; font-weight: bold; margin-top: 8px; color: #38bdf8; }}
        .positive {{ color: #4ade80 !important; }}
        .negative {{ color: #f87171 !important; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>{ticker} <span class="badge">{strategy_name}</span></h1>
        <p style="color: #94a3b8;">Daily timeframe backtest over historical period.</p>
        <div class="grid">
            <div class="metric">
                <div class="metric-label">Total Return</div>
                <div class="metric-val {'positive' if total_ret >= 0 else 'negative'}">{total_ret:.2f}%</div>
            </div>
            <div class="metric">
                <div class="metric-label">CAGR</div>
                <div class="metric-val {'positive' if cagr >= 0 else 'negative'}">{cagr:.2f}%</div>
            </div>
            <div class="metric">
                <div class="metric-label">Sharpe Ratio</div>
                <div class="metric-val">{sharpe:.2f}</div>
            </div>
            <div class="metric">
                <div class="metric-label">Sortino Ratio</div>
                <div class="metric-val">{sortino:.2f}</div>
            </div>
            <div class="metric">
                <div class="metric-label">Max Drawdown</div>
                <div class="metric-val negative">{max_dd:.2f}%</div>
            </div>
            <div class="metric">
                <div class="metric-label">Win Rate</div>
                <div class="metric-val">{win_rate:.2f}%</div>
            </div>
        </div>
    </div>
</body>
</html>"""
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    return str(report_path)


def build_summary_dataframe(results: List[Dict[str, Any]]) -> pd.DataFrame:
    """Build a comprehensive DataFrame aggregating results across all strategies & assets."""
    rows = []
    for res in results:
        m = res.get("metrics", {})
        rows.append({
            "Ticker": res.get("ticker"),
            "Strategy": res.get("strategy_name"),
            "Total Return (%)": m.get("Total Return (%)", 0.0),
            "CAGR (%)": m.get("CAGR (%)", 0.0),
            "Sharpe": m.get("Sharpe Ratio", 0.0),
            "Sortino": m.get("Sortino Ratio", 0.0),
            "Max DD (%)": m.get("Max Drawdown (%)", 0.0),
            "Win Rate (%)": m.get("Win Rate (%)", 0.0),
            "Trades": m.get("Total Trades", 0),
            "Profit Factor": m.get("Profit Factor", 0.0),
            "Tearsheet": res.get("tearsheet_path", "")
        })
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.sort_values(by="Sharpe", ascending=False).reset_index(drop=True)
    return df
