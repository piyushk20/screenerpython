import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function OptionChainModal({ symbol, onClose, onTradeStrike }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedExpiry, setSelectedExpiry] = useState(null);

  const cleanSym = symbol ? symbol.replace('.NS', '').replace('^', '') : 'NIFTY';

  useEffect(() => {
    fetchChain(selectedExpiry);
  }, [cleanSym, selectedExpiry]);

  async function fetchChain(exp) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOptionChain(cleanSym, exp);
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

  const s = data?.summary || {};
  const maxOi = data?.chain ? Math.max(...data.chain.flatMap(r => [r.call.oi, r.put.oi]), 1) : 1;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card option-chain-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>⚡</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Option Chain & Greeks Ladder — {cleanSym}
              </h2>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Spot Price: <strong style={{ color: 'var(--accent-primary)' }}>₹{data?.spot_price?.toFixed(2)}</strong> | Lot Size: <strong>{data?.lot_size}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {data?.available_expiries && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Expiry:</label>
                <select
                  className="timeframe-select"
                  value={selectedExpiry || data.target_expiry}
                  onChange={e => setSelectedExpiry(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: '12px' }}
                >
                  {data.available_expiries.map(exp => (
                    <option key={exp} value={exp}>
                      {exp} ({data.target_expiry === exp ? 'Current' : 'Next'})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button className="btn-close" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Summary Metric Ribbon */}
        {data && (
          <div className="option-chain-metrics-ribbon">
            <div className="metric-chip">
              <span className="metric-label">Put-Call Ratio (PCR)</span>
              <span className={`metric-val ${s.pcr >= 1.0 ? 'text-success' : 'text-danger'}`} style={{ fontWeight: 700 }}>
                {s.pcr} {s.pcr >= 1.0 ? '🟢 (Bullish Bias)' : '🔴 (Bearish Bias)'}
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
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Calculating Black-Scholes Greeks and assembling option chain...
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
                          onClick={() => onTradeStrike && onTradeStrike({ symbol: cleanSym, strike: row.strike, type: 'CE', ltp: c.ltp, lotSize: data.lot_size })}
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
                          onClick={() => onTradeStrike && onTradeStrike({ symbol: cleanSym, strike: row.strike, type: 'PE', ltp: p.ltp, lotSize: data.lot_size })}
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
