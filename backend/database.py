"""
database.py — SQLite connection and schema initialization.
Creates all tables on first run if they do not exist.
"""
import sqlite3
import os
from pathlib import Path
import contextlib

# Place the database at the project root level
DB_PATH = Path(__file__).parent.parent / "scanner.db"


@contextlib.contextmanager
def get_connection():
    """Yield a SQLite connection and close it after the context block."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


DDL = """
CREATE TABLE IF NOT EXISTS symbols (
    symbol      TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    exchange    TEXT NOT NULL,
    sector      TEXT,
    market_cap  REAL,
    is_active   INTEGER DEFAULT 1,
    synced_at   TEXT
);

CREATE TABLE IF NOT EXISTS ohlcv_cache (
    symbol      TEXT NOT NULL,
    timeframe   TEXT NOT NULL,
    timestamp   TEXT NOT NULL,
    open        REAL NOT NULL,
    high        REAL NOT NULL,
    low         REAL NOT NULL,
    close       REAL NOT NULL,
    volume      INTEGER NOT NULL,
    fetched_at  TEXT NOT NULL,
    PRIMARY KEY (symbol, timeframe, timestamp),
    FOREIGN KEY (symbol) REFERENCES symbols (symbol) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_tf
    ON ohlcv_cache (symbol, timeframe);

CREATE TABLE IF NOT EXISTS scanners (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    timeframe   TEXT NOT NULL,
    universe    TEXT DEFAULT 'nse500',
    rules       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scanner_id  INTEGER NOT NULL,
    ran_at      TEXT NOT NULL,
    match_count INTEGER DEFAULT 0,
    FOREIGN KEY (scanner_id) REFERENCES scanners (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scan_results (
    run_id          INTEGER NOT NULL,
    symbol          TEXT NOT NULL,
    last_close      REAL,
    data_as_of      TEXT,
    metric_values   TEXT,
    PRIMARY KEY (run_id, symbol),
    FOREIGN KEY (run_id) REFERENCES scan_runs (id) ON DELETE CASCADE,
    FOREIGN KEY (symbol) REFERENCES symbols (symbol) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS watchlists (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    watchlist_id    INTEGER NOT NULL,
    symbol          TEXT NOT NULL,
    name            TEXT,
    sector          TEXT,
    added_at        TEXT NOT NULL,
    notes           TEXT,
    UNIQUE (watchlist_id, symbol),
    FOREIGN KEY (watchlist_id) REFERENCES watchlists (id) ON DELETE CASCADE
);
"""


def init_db():
    """Initialize database schema. Safe to call multiple times."""
    with get_connection() as conn:
        conn.executescript(DDL)
        # WAL checkpoint to keep WAL file small
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        # Migration: ensure universe column exists in scanners
        columns = [row[1] for row in conn.execute("PRAGMA table_info(scanners)").fetchall()]
        if "universe" not in columns:
            conn.execute("ALTER TABLE scanners ADD COLUMN universe TEXT DEFAULT 'nse500'")
        # Seed default watchlist if none exist
        wl_count = conn.execute("SELECT COUNT(*) FROM watchlists").fetchone()[0]
        if wl_count == 0:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc).isoformat()
            conn.execute("INSERT INTO watchlists (name, created_at) VALUES (?, ?)", ("My Watchlist", now))

        from datetime import datetime, timezone
        import json
        count = conn.execute("SELECT COUNT(*) FROM scanners").fetchone()[0]
        if count == 0:
            now = datetime.now(timezone.utc).isoformat()
            default_scanners = [
                (
                    "EMA 20 Crosses Above EMA 50",
                    "1D",
                    "nse500",
                    json.dumps([
                        {"indicator": "EMA", "params": {"length": 20}, "operator": "crosses_above", "value_type": "indicator", "value": {"indicator": "EMA", "params": {"length": 50}}}
                    ]),
                    now, now
                ),
                (
                    "RSI Bullish Breakout (> 55)",
                    "1D",
                    "nse500",
                    json.dumps([
                        {"indicator": "RSI", "params": {"length": 14}, "operator": ">", "value_type": "number", "value": 55}
                    ]),
                    now, now
                ),
                (
                    "EMA 20 > EMA 50 (Uptrend)",
                    "1D",
                    "nse500",
                    json.dumps([
                        {"indicator": "EMA", "params": {"length": 20}, "operator": ">", "value_type": "indicator", "value": {"indicator": "EMA", "params": {"length": 50}}}
                    ]),
                    now, now
                ),
                (
                    "Bullish: ORB Bullish Breakout (Price > VWAP, RSI > 50 & RelVol 1.5x)",
                    "15m",
                    "fno",
                    json.dumps([
                        {"indicator": "Price", "params": {}, "operator": ">", "value_type": "indicator", "value": {"indicator": "VWAP", "params": {}}},
                        {"indicator": "RSI", "params": {"length": 14}, "operator": ">", "value_type": "number", "value": 50},
                        {"indicator": "RelVol", "params": {}, "operator": ">", "value_type": "number", "value": 1.5}
                    ]),
                    now, now
                ),
                (
                    "Bearish: ORB Bearish Breakdown (Price < VWAP, RSI < 50 & RelVol 1.5x)",
                    "15m",
                    "fno",
                    json.dumps([
                        {"indicator": "Price", "params": {}, "operator": "<", "value_type": "indicator", "value": {"indicator": "VWAP", "params": {}}},
                        {"indicator": "RSI", "params": {"length": 14}, "operator": "<", "value_type": "number", "value": 50},
                        {"indicator": "RelVol", "params": {}, "operator": ">", "value_type": "number", "value": 1.5}
                    ]),
                    now, now
                ),
                (
                    "Bullish: Minervini VCP (Volatility Contraction Pattern)",
                    "1D",
                    "fno",
                    json.dumps([
                        {"indicator": "EMA", "params": {"length": 50}, "operator": ">", "value_type": "indicator", "value": {"indicator": "EMA", "params": {"length": 200}}},
                        {"indicator": "RSI", "params": {"length": 14}, "operator": ">", "value_type": "number", "value": 50},
                        {"indicator": "RelVol", "params": {}, "operator": ">", "value_type": "number", "value": 1.2}
                    ]),
                    now, now
                ),
                (
                    "Bullish: EMA 20 Crosses Above EMA 50",
                    "1D",
                    "nse500",
                    json.dumps([
                        {"indicator": "EMA", "params": {"length": 20}, "operator": "crosses_above", "value_type": "indicator", "value": {"indicator": "EMA", "params": {"length": 50}}}
                    ]),
                    now, now
                ),
                (
                    "Bearish: EMA 20 Crosses Below EMA 50",
                    "1D",
                    "nse500",
                    json.dumps([
                        {"indicator": "EMA", "params": {"length": 20}, "operator": "crosses_below", "value_type": "indicator", "value": {"indicator": "EMA", "params": {"length": 50}}}
                    ]),
                    now, now
                ),
                (
                    "Momentum: High Relative Volume (> 1.5x)",
                    "1D",
                    "nse500",
                    json.dumps([
                        {"indicator": "RelVol", "params": {}, "operator": ">", "value_type": "number", "value": 1.5}
                    ]),
                    now, now
                ),
                (
                    "Bullish: Multi-Timeframe RSI Breakout (Monthly > 60, Weekly > 60, Daily Cross 55)",
                    "1D",
                    "nse500",
                    json.dumps([
                        {"indicator": "RSI", "params": {"length": 14, "timeframe": "1MO"}, "operator": ">", "value_type": "number", "value": 60},
                        {"indicator": "RSI", "params": {"length": 14, "timeframe": "1WK"}, "operator": ">", "value_type": "number", "value": 60},
                        {"indicator": "RSI", "params": {"length": 14, "timeframe": "1D"}, "operator": "crosses_above", "value_type": "number", "value": 55}
                    ]),
                    now, now
                ),
                (
                    "Bearish: F&O Top Losers (-22% to -2% Change)",
                    "1D",
                    "fno",
                    json.dumps([
                        {"indicator": "Change %", "params": {}, "operator": ">=", "value_type": "number", "value": -22},
                        {"indicator": "Change %", "params": {}, "operator": "<=", "value_type": "number", "value": -2}
                    ]),
                    now, now
                ),
            ]
            conn.executemany(
                "INSERT INTO scanners (name, timeframe, universe, rules, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                default_scanners
            )
            print("[DB] Default scanners seeded.")
    print(f"[DB] Database initialized at {DB_PATH}")


if __name__ == "__main__":
    init_db()

