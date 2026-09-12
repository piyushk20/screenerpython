"""
alert_service.py — Real-Time Alert Engine & Multi-Channel Webhook Dispatcher.

Features:
- Telegram Bot API integration (direct async POST to telegram sendMessage)
- Discord Webhook integration (rich embed color-coded payload)
- In-app notification queue & SQLite alert persistence
- Background scheduler to evaluate active alerts against live screener data
- Cooldown guardrail (15 minutes default) to prevent notification fatigue
"""

from __future__ import annotations

import json
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from pathlib import Path

from database import get_connection
from tvscreener_service import fetch_live_snapshot

ALERT_COOLDOWN_SECONDS = 15 * 60  # 15 minutes cooldown between repeated triggers


def get_broker_setting(key: str, default: str = "") -> str:
    """Retrieve saved webhook token or broker setting from database."""
    try:
        with get_connection() as conn:
            row = conn.execute("SELECT value FROM broker_settings WHERE key = ?", (key,)).fetchone()
            return row["value"] if row else default
    except Exception:
        return default


def set_broker_setting(key: str, value: str) -> None:
    """Save webhook token or broker setting in database."""
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO broker_settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """,
            (key, value, now)
        )


# ---------------------------------------------------------------------------
# Notification Dispatchers
# ---------------------------------------------------------------------------

def send_telegram_alert(bot_token: str, chat_id: str, message: str) -> bool:
    """Dispatch Markdown formatted trade notification to Telegram."""
    if not bot_token or not chat_id:
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "Markdown",
        "disable_web_page_preview": False
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "NSE-Screener/1.0"}
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            return response.status == 200
    except Exception as e:
        print(f"[ALERT] Telegram dispatch failed: {e}")
        return False


def send_discord_alert(webhook_url: str, title: str, description: str, color: int = 0x38bdf8) -> bool:
    """Dispatch rich embed alert to Discord webhook."""
    if not webhook_url:
        return False

    payload = {
        "username": "NSE Terminal Bot",
        "embeds": [{
            "title": title,
            "description": description,
            "color": color,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "footer": {"text": "NSE Stock Screener & Quantitative Terminal"}
        }]
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            webhook_url,
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "NSE-Screener/1.0"}
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            return response.status in (200, 204)
    except Exception as e:
        print(f"[ALERT] Discord dispatch failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Alert Rule CRUD
# ---------------------------------------------------------------------------

def list_user_alerts() -> List[Dict[str, Any]]:
    """List all registered user alert configurations."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, name, alert_type, symbol, condition_json, channels, is_active, last_triggered, created_at
            FROM user_alerts
            ORDER BY id DESC
            """
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            try:
                d["condition"] = json.loads(d["condition_json"])
            except Exception:
                d["condition"] = {}
            result.append(d)
        return result


def create_user_alert(
    name: str,
    alert_type: str,
    symbol: str,
    condition: Dict[str, Any],
    channels: List[str]
) -> int:
    """Create a new alert rule."""
    now = datetime.now(timezone.utc).isoformat()
    clean_sym = symbol.strip().upper().replace(".NS", "")
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO user_alerts (name, alert_type, symbol, condition_json, channels, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)
            """,
            (name, alert_type, clean_sym, json.dumps(condition), ",".join(channels), now)
        )
        return cursor.lastrowid


def toggle_user_alert(alert_id: int, is_active: bool) -> bool:
    """Toggle alert active/paused status."""
    with get_connection() as conn:
        conn.execute("UPDATE user_alerts SET is_active = ? WHERE id = ?", (1 if is_active else 0, alert_id))
        return True


def delete_user_alert(alert_id: int) -> bool:
    """Delete an alert rule."""
    with get_connection() as conn:
        conn.execute("DELETE FROM user_alerts WHERE id = ?", (alert_id,))
        return True


def get_alert_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve history of triggered alerts."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT l.id, l.alert_id, a.name as alert_name, l.symbol, l.message, l.channel, l.status, l.triggered_at
            FROM alert_logs l
            LEFT JOIN user_alerts a ON l.alert_id = a.id
            ORDER BY l.id DESC LIMIT ?
            """,
            (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Background Alert Evaluator
# ---------------------------------------------------------------------------

def evaluate_all_alerts() -> List[Dict[str, Any]]:
    """
    Evaluate active alerts against current market snapshot.
    Triggers webhooks and appends logs when conditions match.
    """
    with get_connection() as conn:
        alerts = conn.execute(
            "SELECT * FROM user_alerts WHERE is_active = 1"
        ).fetchall()

    if not alerts:
        return []

    # Get live snapshot of Nifty 500 for fast in-memory matching
    snapshot = fetch_live_snapshot(timeframe="1D", universe="nse500", limit=300)
    stock_map = {s["symbol"].upper().replace(".NS", ""): s for s in snapshot.get("data", [])}

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    triggered_alerts = []

    # Fetch stored bot credentials
    tg_token = get_broker_setting("telegram_bot_token")
    tg_chat = get_broker_setting("telegram_chat_id")
    discord_url = get_broker_setting("discord_webhook_url")

    for a in alerts:
        alert_id = a["id"]
        alert_name = a["name"]
        alert_type = a["alert_type"]
        symbol = a["symbol"]
        last_trig = a["last_triggered"]
        channels = [c.strip().upper() for c in a["channels"].split(",") if c.strip()]
        
        # Check cooldown
        if last_trig:
            try:
                last_dt = datetime.fromisoformat(last_trig.replace("Z", "+00:00"))
                if (now - last_dt).total_seconds() < ALERT_COOLDOWN_SECONDS:
                    continue
            except Exception:
                pass

        try:
            cond = json.loads(a["condition_json"])
        except Exception:
            cond = {}

        stock = stock_map.get(symbol)
        if not stock:
            continue

        ltp = float(stock.get("close", 0.0))
        matched = False
        message = ""
        color = 0x38bdf8

        # Condition 1: PRICE_CROSS
        if alert_type == "PRICE_CROSS":
            op = cond.get("operator", ">=")
            target = float(cond.get("target_price", 0.0))
            if (op in (">", ">=") and ltp >= target) or (op in ("<", "<=") and ltp <= target):
                matched = True
                message = f"[PRICE ALERT] {symbol} traded at Rs {ltp:.2f} (Target: {op} Rs {target:.2f})"
                color = 0x22c55e if op in (">", ">=") else 0xef4444

        # Condition 2: ADR_CLIMAX
        elif alert_type == "ADR_CLIMAX":
            adr_used = float(stock.get("adr_pct_from_lod", 0.0))
            target_pct = float(cond.get("adr_pct_threshold", 70.0))
            if adr_used >= target_pct:
                matched = True
                message = f"[ADR OVER-EXTENSION] {symbol} consumed {adr_used:.1f}% of 14D ADR from LOD! Current: Rs {ltp:.2f}. Pullback risk elevated."
                color = 0xf97316

        # Condition 3: EARLY_ADR_EXPANSION
        elif alert_type == "EARLY_ADR_EXPANSION":
            adr_used = float(stock.get("adr_pct_from_lod", 0.0))
            prev_tight = stock.get("prev_range_lt_adr", False)
            if prev_tight and adr_used < 40.0:
                matched = True
                message = f"[EARLY ADR EXPANSION] {symbol} broke out after prior day compression! ADR used: {adr_used:.1f}% at Rs {ltp:.2f}. Low risk entry zone."
                color = 0x10b981

        if matched:
            # Update last_triggered timestamp
            with get_connection() as conn:
                conn.execute("UPDATE user_alerts SET last_triggered = ? WHERE id = ?", (now_iso, alert_id))
                
                # Dispatch channels
                if "TELEGRAM" in channels and tg_token and tg_chat:
                    sent = send_telegram_alert(tg_token, tg_chat, message)
                    conn.execute(
                        "INSERT INTO alert_logs (alert_id, symbol, message, channel, status, triggered_at) VALUES (?, ?, ?, ?, ?, ?)",
                        (alert_id, symbol, message, "TELEGRAM", "SENT" if sent else "FAILED", now_iso)
                    )

                if "DISCORD" in channels and discord_url:
                    sent = send_discord_alert(discord_url, alert_name, message, color)
                    conn.execute(
                        "INSERT INTO alert_logs (alert_id, symbol, message, channel, status, triggered_at) VALUES (?, ?, ?, ?, ?, ?)",
                        (alert_id, symbol, message, "DISCORD", "SENT" if sent else "FAILED", now_iso)
                    )

                if "BROWSER" in channels:
                    conn.execute(
                        "INSERT INTO alert_logs (alert_id, symbol, message, channel, status, triggered_at) VALUES (?, ?, ?, ?, ?, ?)",
                        (alert_id, symbol, message, "BROWSER", "SENT", now_iso)
                    )

            triggered_alerts.append({
                "alert_id": alert_id,
                "name": alert_name,
                "symbol": symbol,
                "message": message,
                "triggered_at": now_iso
            })

    return triggered_alerts
