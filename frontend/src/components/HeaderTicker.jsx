import React from 'react'
import { Layout, Layers, RefreshCw, TrendingUp } from 'lucide-react'

export function HeaderTicker({
  indices,
  status,
  layoutMode,
  onChangeLayout,
  onRefresh,
  loading,
  activeView = 'screener',
  onChangeView,
  onOpenOptions,
  onOpenAlerts,
  onOpenDesk,
}) {
  return (
    <div className="dext-header-bar">
      <div className="dext-brand">
        <div className="dext-logo-icon">
          <TrendingUp size={16} />
        </div>
        <div className="dext-title" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="brand-accent">NSE</span>
          <span className="brand-sub">PRO SCREENER</span>
        </div>
      </div>

      {/* Indices Ticker Tape */}
      <div className="dext-ticker-container">
        {indices.map((idx) => {
          const isPos = idx.change_pct >= 0
          return (
            <div key={idx.symbol} className="dext-ticker-item">
              <span className="ticker-symbol">{idx.symbol}</span>
              <span className="ticker-ltp">₹{idx.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              <span className={`ticker-badge ${isPos ? 'bullish' : 'bearish'}`}>
                {isPos ? '▲ +' : '▼ '}{idx.change_pct.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>

      {/* Layout Presets & View Modes */}
      <div className="dext-controls">
        <div className="view-switcher-group">
          <button
            className={`view-toggle-btn ${activeView === 'screener' ? 'active' : ''}`}
            onClick={() => onChangeView('screener')}
            title="Live Market Screener & Charts"
          >
            <span className="view-indicator-dot"></span>
            <span>Live Screener</span>
          </button>
          <button
            className={`view-toggle-btn ${activeView === 'backtest' ? 'active' : ''}`}
            onClick={() => onChangeView('backtest')}
            title="Quantitative Backtest & Strategy Lab"
          >
            <span>⚡ Backtest Lab</span>
          </button>
        </div>

        {activeView === 'screener' && (
          <div className="layout-switcher">
            <button
              className={`layout-btn ${layoutMode === 'split' ? 'active' : ''}`}
              onClick={() => onChangeLayout('split')}
              title="Split View (Table + Chart)"
            >
              <Layout size={13} />
              <span>Split</span>
            </button>

            <button
              className={`layout-btn ${layoutMode === 'grid' ? 'active' : ''}`}
              onClick={() => onChangeLayout('grid')}
              title="Full Table View"
            >
              <Layers size={13} />
              <span>Table</span>
            </button>
          </div>
        )}

        <button
          className="layout-btn"
          style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}
          onClick={onOpenOptions}
          title="Open Real-time Option Chain & Greeks Ladder"
        >
          <span>⚡ Option Chain</span>
        </button>

        <button
          className="layout-btn"
          style={{ color: '#fbbf24', borderColor: 'rgba(251, 191, 36, 0.3)' }}
          onClick={onOpenAlerts}
          title="Manage Real-time Alerts & Webhooks"
        >
          <span>🔔 Alerts</span>
        </button>

        <button
          className="layout-btn"
          style={{ color: '#4ade80', borderColor: 'rgba(74, 222, 128, 0.3)' }}
          onClick={onOpenDesk}
          title="Open Paper & Live Trading Desk"
        >
          <span>💼 Trade Desk</span>
        </button>

        {activeView === 'screener' && (
          <button
            className="refresh-btn"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh Snapshot"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
        )}

        <div className="status-pill">
          <span className="status-dot"></span>
          <span>{status || 'LIVE'}</span>
        </div>
      </div>
    </div>
  )
}

