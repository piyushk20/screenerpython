import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { TrendingUp, Activity, BarChart2, Zap, Shield, Search, ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';

const POPULAR_INDICES = [
  { symbol: 'NIFTY', label: 'NIFTY 50', category: 'Benchmark' },
  { symbol: 'BANKNIFTY', label: 'BANK NIFTY', category: 'Benchmark' },
  { symbol: 'FINNIFTY', label: 'FIN NIFTY', category: 'Benchmark' },
  { symbol: 'MIDCPNIFTY', label: 'MIDCAP NIFTY', category: 'Benchmark' },
  { symbol: 'SENSEX', label: 'SENSEX', category: 'Benchmark' },
  { symbol: 'NIFTY IT', label: 'NIFTY IT', category: 'Sectoral' },
  { symbol: 'NIFTY AUTO', label: 'NIFTY AUTO', category: 'Sectoral' },
  { symbol: 'NIFTY PHARMA', label: 'NIFTY PHARMA', category: 'Sectoral' },
  { symbol: 'NIFTY FMCG', label: 'NIFTY FMCG', category: 'Sectoral' },
  { symbol: 'NIFTY METAL', label: 'NIFTY METAL', category: 'Sectoral' },
  { symbol: 'NIFTY REALTY', label: 'NIFTY REALTY', category: 'Sectoral' },
  { symbol: 'NIFTY ENERGY', label: 'NIFTY ENERGY', category: 'Sectoral' },
  { symbol: 'NIFTY PSU BANK', label: 'NIFTY PSU BANK', category: 'Sectoral' },
  { symbol: 'NIFTY PVT BANK', label: 'NIFTY PVT BANK', category: 'Sectoral' },
  { symbol: 'NIFTY INFRA', label: 'NIFTY INFRA', category: 'Sectoral' },
];

export default function OptionChainModal({ symbol, onClose, onTradeStrike }) {
  const [activeSym, setActiveSym] = useState(
    symbol ? symbol.replace('.NS', '').replace('^', '') : 'NIFTY'
  );
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedExpiry, setSelectedExpiry] = useState(null);

  useEffect(() => {
    fetchChain(activeSym, selectedExpiry);
  }, [activeSym, selectedExpiry]);

  async function fetchChain(sym, exp) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOptionChain(sym, exp);
      setData(res);
      if (!selectedExpiry && res.target_expiry) {
        setSelectedExpiry(res.target_expiry);
      }
    } catch (err) {
      setError(err.message || 'Failed to load option chain');
    } finally {
      setLoading(false);
    }
  }

  function handleSelectSymbol(sym) {
    const clean = sym.trim().toUpperCase().replace('.NS', '').replace('^', '');
    if (clean) {
      setActiveSym(clean);
      setSelectedExpiry(null); // Reset expiry to fetch default for new symbol
      setSearchInput('');
    }
  }

  const s = data?.summary || {};
  const t = s?.technical_analysis || {};
  const maxOi = data?.chain ? Math.max(...data.chain.flatMap(r => [r.call.oi, r.put.oi]), 1) : 1;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card option-chain-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ flexDirection: 'column', gap: 12, alignItems: 'stretch' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '22px' }}>⚡</span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Option Chain & Greeks Ladder — {activeSym}
                  </h2>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                    Lot: {data?.lot_size || 100}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>
                  Spot Price: <strong style={{ color: 'var(--accent-primary)', fontSize: 13 }}>₹{data?.spot_price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                  {data?.days_to_expiry != null && (
                    <span style={{ marginLeft: 10 }}>• {data.days_to_expiry} Days to Expiry ({data.target_expiry})</span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Expiry Selector */}
              {data?.available_expiries && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Expiry:</label>
                  <select
                    className="timeframe-select"
                    value={selectedExpiry || data.target_expiry}
                    onChange={e => setSelectedExpiry(e.target.value)}
                    style={{ padding: '5px 10px', fontSize: '12px', borderRadius: 6, background: '#1e293b', color: '#f8fafc', borderColor: '#334155' }}
                  >
                    {data.available_expiries.map(exp => (
                      <option key={exp} value={exp}>
                        {exp} ({data.target_expiry === exp ? 'Current' : 'Next'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button className="btn-close" onClick={onClose} style={{ fontSize: 20 }}>×</button>
            </div>
          </div>

          {/* Index & Sector Quick Selector Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
              Quick Indices:
            </span>
            {POPULAR_INDICES.map(idx => (
              <button
                key={idx.symbol}
                onClick={() => handleSelectSymbol(idx.symbol)}
                style={{
                  padding: '3px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: '1px solid',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                  borderColor: activeSym === idx.symbol ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                  background: activeSym === idx.symbol ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                  color: activeSym === idx.symbol ? '#38bdf8' : 'var(--text-muted)'
                }}
              >
                {idx.label}
              </button>
            ))}

            {/* Custom Symbol Search Form */}
            <form
              onSubmit={e => { e.preventDefault(); handleSelectSymbol(searchInput) }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}
            >
              <input
                type="text"
                placeholder="Search stock / index..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  borderRadius: 6,
                  border: '1px solid #334155',
                  background: '#0f172a',
                  color: '#fff',
                  width: 140
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'rgba(56, 189, 248, 0.2)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                Go
              </button>
            </form>
          </div>
        </div>

        {/* Technical Indicators & Derivatives Confluence Banner */}
        {data && t && (
          <div style={{
            margin: '0 16px 12px',
            padding: '12px 16px',
            borderRadius: 8,
            background: 'rgba(15, 23, 42, 0.85)',
            border: `1px solid ${t.badge_color ? `${t.badge_color}44` : 'rgba(255,255,255,0.1)'}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.4px',
                  background: `${t.badge_color || '#38bdf8'}22`,
                  color: t.badge_color || '#38bdf8',
                  border: `1px solid ${t.badge_color || '#38bdf8'}66`
                }}>
                  {t.confluence_badge || 'TECHNICAL & OI ANALYSIS'}
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                  Trend: <strong style={{ color: '#f8fafc' }}>{t.trend_bias || 'Neutral'}</strong>
                </span>
              </div>

              {/* Quick Tech Badges */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>RSI (14):</span>
                  <span style={{ fontWeight: 700, color: t.rsi >= 60 ? '#4ade80' : t.rsi <= 40 ? '#f87171' : '#38bdf8' }}>
                    {t.rsi} ({t.rsi_status})
                  </span>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.15)' }}>|</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>MACD:</span>
                  <span style={{ fontWeight: 700, color: t.macd_hist >= 0 ? '#4ade80' : '#f87171' }}>
                    {t.macd_status} (Hist: {t.macd_hist})
                  </span>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.15)' }}>|</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>EMA 20/50:</span>
                  <span style={{ fontWeight: 600, color: '#e2e8f0' }}>
                    ₹{t.ema_20} / ₹{t.ema_50}
                  </span>
                </div>
              </div>
            </div>

            {/* Explanatory Confluence Text */}
            <div style={{ fontSize: 11.5, color: '#cbd5e1', lineHeight: 1.4, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
              💡 <strong style={{ color: '#f8fafc' }}>Actionable Confluence:</strong> {t.confluence_summary || 'Derivatives open interest and technical indicators analyzed in unison.'}
            </div>
          </div>
        )}

        {/* Summary Metric Ribbon */}
        {data && (
          <div className="option-chain-metrics-ribbon">
            <div className="metric-chip">
              <span className="metric-label">Put-Call Ratio (PCR)</span>
              <span className={`metric-val ${s.pcr >= 1.0 ? 'text-success' : 'text-danger'}`} style={{ fontWeight: 700 }}>
                {s.pcr} {s.pcr >= 1.2 ? '🟢 (Strong Put Support)' : s.pcr >= 1.0 ? '🟢 (Mild Bullish)' : '🔴 (Call Resistance)'}
              </span>
            </div>

            <div className="metric-chip">
              <span className="metric-label">Max Pain Strike</span>
              <span className="metric-val text-warning" style={{ fontWeight: 700 }}>
                ₹{s.max_pain}
              </span>
            </div>

            <div className="metric-chip">
              <span className="metric-label">ATM Strike & IV</span>
              <span className="metric-val" style={{ color: '#38bdf8' }}>
                ₹{s.atm_strike} ({s.atm_iv}%)
              </span>
            </div>

            <div className="metric-chip">
              <span className="metric-label">IV Rank / Percentile</span>
              <span className="metric-val">
                IVR: <strong>{s.iv_rank}%</strong> | IVP: <strong>{s.iv_percentile}%</strong>
              </span>
            </div>

            <div className="metric-chip">
              <span className="metric-label">Major Support (Max Put OI)</span>
              <span className="metric-val text-success">
                ₹{s.major_support}
              </span>
            </div>

            <div className="metric-chip">
              <span className="metric-label">Major Resistance (Max Call OI)</span>
              <span className="metric-val text-danger">
                ₹{s.major_resistance}
              </span>
            </div>
          </div>
        )}

        {/* Main Ladder Table */}
        <div className="option-chain-table-container">
          {loading ? (
            <div style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              Calculating analytical Black-Scholes Greeks, IV skew, and technical confluence...
            </div>
          ) : error ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-danger)' }}>
              {error}
            </div>
          ) : (
            <table className="option-chain-table">
              <thead>
                <tr>
                  <th colSpan="7" style={{ textAlign: 'center', background: 'rgba(34, 197, 94, 0.08)', color: '#4ade80', borderRight: '2px solid var(--border-color)' }}>
                    CALL OPTIONS (CE)
                  </th>
                  <th style={{ textAlign: 'center', background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}>
                    STRIKE
                  </th>
                  <th colSpan="7" style={{ textAlign: 'center', background: 'rgba(239, 68, 68, 0.08)', color: '#f87171', borderLeft: '2px solid var(--border-color)' }}>
                    PUT OPTIONS (PE)
                  </th>
                </tr>
                <tr className="sub-headers">
                  {/* Calls */}
                  <th>OI</th>
                  <th>Chg OI</th>
                  <th>IV %</th>
                  <th>Delta</th>
                  <th>Theta</th>
                  <th>LTP (₹)</th>
                  <th style={{ borderRight: '2px solid var(--border-color)' }}>Trade</th>

                  {/* Strike */}
                  <th>Price</th>

                  {/* Puts */}
                  <th style={{ borderLeft: '2px solid var(--border-color)' }}>Trade</th>
                  <th>LTP (₹)</th>
                  <th>Delta</th>
                  <th>Theta</th>
                  <th>IV %</th>
                  <th>Chg OI</th>
                  <th>OI</th>
                </tr>
              </thead>
              <tbody>
                {data.chain.map(row => {
                  const isAtm = row.is_atm;
                  const c = row.call;
                  const p = row.put;
                  const cOiPct = Math.min(100, (c.oi / maxOi) * 100);
                  const pOiPct = Math.min(100, (p.oi / maxOi) * 100);

                  return (
                    <tr key={row.strike} className={isAtm ? 'row-atm' : ''}>
                      {/* CALLS */}
                      <td className="oi-cell">
                        <div className="oi-bar call-oi-bar" style={{ width: `${cOiPct}%` }} />
                        <span className="oi-text">{c.oi.toLocaleString()}</span>
                      </td>
                      <td className={c.change_in_oi >= 0 ? 'text-success' : 'text-danger'}>
                        {c.change_in_oi > 0 ? `+${c.change_in_oi}` : c.change_in_oi}
                      </td>
                      <td>{c.iv}%</td>
                      <td>{c.delta}</td>
                      <td className="text-muted">{c.theta}</td>
                      <td style={{ fontWeight: 600, color: '#4ade80' }}>₹{c.ltp}</td>
                      <td style={{ borderRight: '2px solid var(--border-color)' }}>
                        <button
                          className="btn-mini-trade buy"
                          onClick={() => onTradeStrike && onTradeStrike({ symbol: activeSym, strike: row.strike, type: 'CE', ltp: c.ltp, lotSize: data.lot_size })}
                        >
                          BUY
                        </button>
                      </td>

                      {/* STRIKE */}
                      <td className={`strike-cell ${isAtm ? 'atm-badge' : ''}`}>
                        <strong>{row.strike}</strong>
                        {isAtm && <span className="atm-pill">ATM</span>}
                        {row.strike === s.max_pain && <span className="max-pain-pill">PAIN</span>}
                      </td>

                      {/* PUTS */}
                      <td style={{ borderLeft: '2px solid var(--border-color)' }}>
                        <button
                          className="btn-mini-trade sell"
                          onClick={() => onTradeStrike && onTradeStrike({ symbol: activeSym, strike: row.strike, type: 'PE', ltp: p.ltp, lotSize: data.lot_size })}
                        >
                          BUY
                        </button>
                      </td>
                      <td style={{ fontWeight: 600, color: '#f87171' }}>₹{p.ltp}</td>
                      <td>{p.delta}</td>
                      <td className="text-muted">{p.theta}</td>
                      <td>{p.iv}%</td>
                      <td className={p.change_in_oi >= 0 ? 'text-success' : 'text-danger'}>
                        {p.change_in_oi > 0 ? `+${p.change_in_oi}` : p.change_in_oi}
                      </td>
                      <td className="oi-cell">
                        <div className="oi-bar put-oi-bar" style={{ width: `${pOiPct}%` }} />
                        <span className="oi-text">{p.oi.toLocaleString()}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

