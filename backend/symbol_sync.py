"""
symbol_sync.py — Sync NSE/BSE symbol master from tvscreener.
Fetches top equities from India (NSE exchange) and stores in the symbols table.
"""
import sys
import json
from datetime import datetime, timezone
from pathlib import Path

# Allow running from project root
sys.path.insert(0, str(Path(__file__).parent))

from database import get_connection, init_db


def sync_symbols(limit: int = 500) -> int:
    """
    Fetch top Indian equities using tvscreener (TradingView public screener).
    Returns the count of symbols upserted.
    
    NOTE: tvscreener returns data from TradingView's public screener endpoint.
    Symbols are NSE-listed equities filtered by India market. We append '.NS'
    suffix to make them yfinance-compatible.
    """
    try:
        from tvscreener import StockScreener
        import tvscreener as tvs
    except ImportError:
        print("[SYNC] tvscreener not installed. Run: pip install tvscreener")
        return 0

    print(f"[SYNC] Fetching top {limit} NSE equities from TradingView screener...")

    ss = StockScreener()
    ss.set_markets("india")

    # Request relevant columns
    columns = [
        "name",
        "exchange",
        "sector",
        "market_cap_basic",
        "close",
        "volume",
        "description",
    ]

    try:
        df = ss.get(columns=columns, limit=limit, sort_by="market_cap_basic", sort_order="desc")
    except Exception as exc:
        print(f"[SYNC] Error fetching from tvscreener: {exc}")
        return 0

    if df is None or len(df) == 0:
        print("[SYNC] No data returned from tvscreener.")
        return 0

    print(f"[SYNC] Received {len(df)} rows from tvscreener.")
    print(f"[SYNC] Columns: {list(df.columns)}")

    now = datetime.now(timezone.utc).isoformat()
    synced = 0

    with get_connection() as conn:
        for _, row in df.iterrows():
            # tvscreener uses short ticker without suffix (e.g. "RELIANCE")
            # TradingView ticker includes exchange prefix like "NSE:RELIANCE"
            raw_ticker = str(row.get("ticker", row.name) if hasattr(row, "name") else "")

            # Extract clean symbol
            if ":" in raw_ticker:
                exchange, ticker = raw_ticker.split(":", 1)
            else:
                ticker = raw_ticker
                exchange_raw = str(row.get("exchange", "NSE")).upper()
                exchange = "NSE" if "NSE" in exchange_raw else "BSE"

            if not ticker:
                continue

            # Map to yfinance suffix
            if exchange == "BSE":
                yf_symbol = f"{ticker}.BO"
            else:
                yf_symbol = f"{ticker}.NS"
                exchange = "NSE"

            name = str(row.get("description", row.get("name", ticker)))
            sector = str(row.get("sector", "")) or None
            market_cap = float(row.get("market_cap_basic", 0) or 0)

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

    print(f"[SYNC] Upserted {synced} symbols into database.")
    return synced


if __name__ == "__main__":
    init_db()
    count = sync_symbols(limit=500)
    print(f"[SYNC] Done. {count} symbols in database.")
