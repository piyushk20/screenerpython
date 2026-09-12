import { useState, useEffect, useMemo } from 'react'
import { api } from '../api'
import {
  Play, TrendingUp, TrendingDown, RefreshCw, BarChart2,
  Calendar, DollarSign, Percent, Shield, ArrowUpRight,
  ArrowDownRight, CheckCircle2, XCircle, Award, FileText,
  ExternalLink, Maximize2, Minimize2, Search, Sliders, Info
} from 'lucide-react'

const QUICK_ASSETS = [
  { label: '🏆 NIFTY 50', value: '^NSEI', name: 'Nifty 50 Benchmark' },
  { label: '⚡ BANK NIFTY', value: '^NSEBANK', name: 'Nifty Bank Index' },
  { label: '🔷 RELIANCE', value: 'RELIANCE.NS', name: 'Reliance Industries' },
  { label: '🏦 HDFC BANK', value: 'HDFCBANK.NS', name: 'HDFC Bank Ltd.' },
  { label: '💻 TCS', value: 'TCS.NS', name: 'Tata Consultancy Services' },
  { label: '🚀 INFY', value: 'INFY.NS', name: 'Infosys Ltd.' },
]

const PERIOD_OPTIONS = [
  { label: '1 Year', value: '1y' },
  { label: '3 Years', value: '3y' },
  { label: '5 Years', value: '5y' },
]

export function BacktestLab() {
  const [strategies, setStrategies] = useState([])
  const [selectedStrategy, setSelectedStrategy] = useState('Minervini_VCP')
  const [selectedAsset, setSelectedAsset] = useState('^NSEI')
  const [customTicker, setCustomTicker] = useState('')
  const [period, setPeriod] = useState('3y')
  const [initialCapital, setInitialCapital] = useState(1000000)
  const [feesPct, setFeesPct] = useState(0.05)
  const [slippagePct, setSlippagePct] = useState(0.05)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [activeTab, setActiveTab] = useState('dashboard') // 'dashboard' | 'heatmap' | 'trades' | 'leaderboard'
  const [tearsheetModalOpen, setTearsheetModalOpen] = useState(false)
  const [hoveredPoint, setHoveredPoint] = useState(null)

  // Load available strategies & leaderboard on mount
  useEffect(() => {
    async function loadMeta() {
      try {
        const res = await api.getBacktestStrategies()
        if (res && res.strategies) {
          setStrategies(res.strategies)
          if (res.strategies.length > 0) {
            setSelectedStrategy(res.strategies[5]?.key || res.strategies[0].key)
          }
        }
        const lb = await api.getBacktestLeaderboard()
        if (lb && lb.leaderboard) {
          setLeaderboard(lb.leaderboard)
        }
      } catch (err) {
        console.error('[BacktestLab] Failed to load meta:', err)
      }
    }
    loadMeta()
  }, [])

  // Execute Backtest
  const handleRunBacktest = async (assetOverride = null, strategyOverride = null) => {
    setLoading(true)
    setError(null)
    const targetTicker = assetOverride || (customTicker.trim() ? customTicker.trim().toUpperCase() : selectedAsset)
    const targetStrategy = strategyOverride || selectedStrategy

    try {
      const res = await api.runBacktest({
        ticker: targetTicker,
        strategy_key: targetStrategy,
        period: period,
        initial_capital: Number(initialCapital),
        fees_pct: Number(feesPct),
        slippage_pct: Number(slippagePct)
      })

      if (res && res.success) {
        setResults(res)
        setActiveTab('dashboard')
      } else {
        setError(res?.message || 'Backtest produced 0 trades or invalid data.')
      }
    } catch (err) {
      setError(err.message || 'Failed to execute backtest simulation.')
    } finally {
      setLoading(false)
    }
  }

  // Initial backtest run on first load once strategy is ready
  useEffect(() => {
    if (strategies.length > 0 && !results && !loading) {
      handleRunBacktest('^NSEI', 'Minervini_VCP')
    }
  }, [strategies])

  // Current active strategy info
  const currentStratInfo = useMemo(() => {
    return strategies.find(s => s.key === selectedStrategy) || {}
  }, [strategies, selectedStrategy])

  // Equity SVG Chart Coordinates
  const chartData = useMemo(() => {
    if (!results || !results.equity_curve || results.equity_curve.length === 0) return null
    const curve = results.equity_curve
    const minEq = Math.min(...curve.map(d => Math.min(d.equity, d.benchmark)))
    const maxEq = Math.max(...curve.map(d => Math.max(d.equity, d.benchmark)))
    const rangeEq = (maxEq - minEq) || 1

    const minDd = Math.min(...curve.map(d => d.drawdown))
    const rangeDd = Math.abs(minDd) || 1

    const width = 800
    const height = 240
    const ddHeight = 70

    const ptsStrategy = curve.map((d, i) => {
      const x = (i / (curve.length - 1)) * width
      const y = height - ((d.equity - minEq) / rangeEq) * (height - 20) - 10
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')

    const ptsBenchmark = curve.map((d, i) => {
      const x = (i / (curve.length - 1)) * width
      const y = height - ((d.benchmark - minEq) / rangeEq) * (height - 20) - 10
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')

    const ptsDd = curve.map((d, i) => {
      const x = (i / (curve.length - 1)) * width
      const y = (Math.abs(d.drawdown) / rangeDd) * (ddHeight - 15) + 5
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')

    return {
      ptsStrategy,
      ptsBenchmark,
      ptsDd,
      minEq,
      maxEq,
      minDd,
      width,
      height,
      ddHeight,
      raw: curve
    }
  }, [results])

  return (
    <div className="backtest-lab-container">
      {/* ── TOP CONFIGURATION BAR ─────────────────────────────────────── */}
      <div className="bt-config-panel">
        <div className="bt-panel-header">
          <div className="bt-title-row">
            <div className="bt-icon-box">⚡</div>
            <div>
              <h2 className="bt-main-title">Backtest & Quantitative Lab</h2>
              <p className="bt-subtitle">Vectorized Portfolio Simulation (vectorbt) with Institutional Analytics (QuantStats)</p>
            </div>
          </div>
          <div className="bt-tab-pill-group">
            <button
              className={`bt-tab-pill ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              📊 Performance Overview
            </button>
            <button
              className={`bt-tab-pill ${activeTab === 'heatmap' ? 'active' : ''}`}
              onClick={() => setActiveTab('heatmap')}
            >
              🗓️ Monthly Matrix
            </button>
            <button
              className={`bt-tab-pill ${activeTab === 'trades' ? 'active' : ''}`}
              onClick={() => setActiveTab('trades')}
            >
              📋 Trade Log ({results?.trade_log?.length || 0})
            </button>
            <button
              className={`bt-tab-pill ${activeTab === 'leaderboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('leaderboard')}
            >
              🏆 Strategy Leaderboard
            </button>
          </div>
        </div>

        {/* CONTROLS GRID */}
        <div className="bt-controls-grid">
          {/* ASSET SELECTOR */}
          <div className="bt-control-col">
            <label className="bt-label">Target NSE Asset</label>
            <div className="bt-quick-assets">
              {QUICK_ASSETS.map(a => (
                <button
                  key={a.value}
                  className={`bt-asset-btn ${selectedAsset === a.value && !customTicker ? 'active' : ''}`}
                  onClick={() => { setSelectedAsset(a.value); setCustomTicker('') }}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <div className="bt-custom-ticker-wrap">
              <Search size={14} className="bt-input-icon" />
              <input
                type="text"
                placeholder="Or custom ticker (e.g. SBIN.NS, TATAMOTORS.NS)..."
                value={customTicker}
                onChange={e => setCustomTicker(e.target.value)}
                className="bt-ticker-input"
              />
            </div>
          </div>

          {/* STRATEGY SELECTOR */}
          <div className="bt-control-col">
            <label className="bt-label">Strategy / Scanner Rule</label>
            <select
              value={selectedStrategy}
              onChange={e => setSelectedStrategy(e.target.value)}
              className="bt-select-input"
            >
              {strategies.map(s => (
                <option key={s.key} value={s.key}>
                  {s.name} ({s.direction.toUpperCase()})
                </option>
              ))}
            </select>
            <div className="bt-strat-desc">
              <Info size={12} style={{ flexShrink: 0, marginTop: 2, color: 'var(--color-primary)' }} />
              <span>{currentStratInfo.description || 'App scanner technical rule.'}</span>
            </div>
          </div>

          {/* PERIOD & PARAMS */}
          <div className="bt-control-col bt-params-col">
            <label className="bt-label">Period & Capital</label>
            <div className="bt-period-row">
              {PERIOD_OPTIONS.map(p => (
                <button
                  key={p.value}
                  className={`bt-period-btn ${period === p.value ? 'active' : ''}`}
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="bt-subparams-row">
              <div className="bt-subparam">
                <span>Capital (₹)</span>
                <input
                  type="number"
                  value={initialCapital}
                  onChange={e => setInitialCapital(e.target.value)}
                  className="bt-num-input"
                />
              </div>
              <div className="bt-subparam">
                <span>Friction (%)</span>
                <input
                  type="number"
                  step="0.01"
                  value={feesPct}
                  onChange={e => setFeesPct(e.target.value)}
                  className="bt-num-input"
                  title="Brokerage + Slippage"
                />
              </div>
            </div>
          </div>

          {/* RUN CTA BUTTON */}
          <div className="bt-cta-col">
            <button
              className={`bt-run-btn ${loading ? 'loading' : ''}`}
              onClick={() => handleRunBacktest()}
              disabled={loading}
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="spin-icon" /> Simulating...
                </>
              ) : (
                <>
                  <Play size={16} fill="currentColor" /> Run Backtest
                </>
              )}
            </button>
            {results?.tearsheet_filename && (
              <button
                className="bt-tearsheet-btn"
                onClick={() => setTearsheetModalOpen(true)}
              >
                <FileText size={14} /> View QuantStats Tearsheet
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bt-error-banner">
          <XCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* ── MAIN CONTENT TABS ────────────────────────────────────────── */}
      {results && (
        <div className="bt-results-body">
          {/* TAB 1: PERFORMANCE DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="bt-tab-content">
              {/* EXECUTIVE KPI STAT CARDS */}
              <div className="bt-kpi-grid">
                <div className="bt-kpi-card">
                  <div className="bt-kpi-header">
                    <span className="bt-kpi-label">Total Return</span>
                    <Percent size={14} className="bt-kpi-icon" />
                  </div>
                  <div className={`bt-kpi-val ${results.metrics['Total Return (%)'] >= 0 ? 'pos' : 'neg'}`}>
                    {results.metrics['Total Return (%)'] >= 0 ? '+' : ''}{results.metrics['Total Return (%)']}%
                  </div>
                  <div className="bt-kpi-sub">
                    CAGR: <strong>{results.metrics['CAGR (%)']}% / yr</strong>
                  </div>
                </div>

                <div className="bt-kpi-card highlight-card">
                  <div className="bt-kpi-header">
                    <span className="bt-kpi-label">Sharpe Ratio</span>
                    <Award size={14} className="bt-kpi-icon" />
                  </div>
                  <div className="bt-kpi-val highlight-val">
                    {results.metrics['Sharpe Ratio']}
                  </div>
                  <div className="bt-kpi-sub">
                    Sortino: <strong>{results.metrics['Sortino Ratio']}</strong> • Calmar: <strong>{results.metrics['Calmar Ratio']}</strong>
                  </div>
                </div>

                <div className="bt-kpi-card">
                  <div className="bt-kpi-header">
                    <span className="bt-kpi-label">Max Drawdown</span>
                    <Shield size={14} className="bt-kpi-icon" />
                  </div>
                  <div className="bt-kpi-val neg">
                    {results.metrics['Max Drawdown (%)']}%
                  </div>
                  <div className="bt-kpi-sub">
                    Peak-to-valley risk depth
                  </div>
                </div>

                <div className="bt-kpi-card">
                  <div className="bt-kpi-header">
                    <span className="bt-kpi-label">Win Rate & Trades</span>
                    <CheckCircle2 size={14} className="bt-kpi-icon" />
                  </div>
                  <div className="bt-kpi-val pos">
                    {results.metrics['Win Rate (%)']}%
                  </div>
                  <div className="bt-kpi-sub">
                    <strong>{results.metrics['Total Trades']}</strong> total trades executed
                  </div>
                </div>

                <div className="bt-kpi-card">
                  <div className="bt-kpi-header">
                    <span className="bt-kpi-label">Profit Factor & Alpha</span>
                    <TrendingUp size={14} className="bt-kpi-icon" />
                  </div>
                  <div className="bt-kpi-val">
                    {results.metrics['Profit Factor']}
                  </div>
                  <div className="bt-kpi-sub">
                    Alpha: <strong>{results.metrics['Alpha (%)']}%</strong> • Beta: <strong>{results.metrics['Beta']}</strong>
                  </div>
                </div>
              </div>

              {/* EQUITY & BENCHMARK DUAL CHART */}
              {chartData && (
                <div className="bt-chart-card">
                  <div className="bt-chart-header">
                    <div className="bt-chart-title-group">
                      <h3 className="bt-chart-title">
                        Portfolio Equity vs Nifty 50 Benchmark Growth
                      </h3>
                      <span className="bt-chart-sub">
                        Initial Capital: ₹{Number(results.initial_capital).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="bt-chart-legend">
                      <span className="legend-item strategy">
                        <span className="dot strategy-dot"></span> Strategy Portfolio
                      </span>
                      <span className="legend-item benchmark">
                        <span className="dot benchmark-dot"></span> Nifty 50 Benchmark
                      </span>
                    </div>
                  </div>

                  {/* SVG EQUITY CURVE */}
                  <div className="bt-svg-container">
                    <svg
                      viewBox={`0 0 ${chartData.width} ${chartData.height}`}
                      className="bt-svg-chart"
                      preserveAspectRatio="none"
                      onMouseMove={e => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const xRatio = (e.clientX - rect.left) / rect.width
                        const idx = Math.min(
                          Math.max(0, Math.floor(xRatio * chartData.raw.length)),
                          chartData.raw.length - 1
                        )
                        setHoveredPoint(chartData.raw[idx])
                      }}
                      onMouseLeave={() => setHoveredPoint(null)}
                    >
                      {/* Grid Lines */}
                      <line x1="0" y1="60" x2={chartData.width} y2="60" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                      <line x1="0" y1="120" x2={chartData.width} y2="120" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                      <line x1="0" y1="180" x2={chartData.width} y2="180" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />

                      {/* Benchmark Line */}
                      <polyline
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth="1.8"
                        strokeDasharray="3 3"
                        opacity="0.85"
                        points={chartData.ptsBenchmark}
                      />

                      {/* Strategy Line */}
                      <polyline
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2.5"
                        points={chartData.ptsStrategy}
                      />
                    </svg>

                    {/* Chart Tooltip */}
                    {hoveredPoint && (
                      <div className="bt-chart-tooltip">
                        <div className="tooltip-date">{hoveredPoint.date}</div>
                        <div className="tooltip-row">
                          <span>Portfolio:</span>
                          <strong style={{ color: '#38bdf8' }}>₹{hoveredPoint.equity.toLocaleString('en-IN')}</strong>
                        </div>
                        <div className="tooltip-row">
                          <span>Nifty 50:</span>
                          <strong style={{ color: '#94a3b8' }}>₹{hoveredPoint.benchmark.toLocaleString('en-IN')}</strong>
                        </div>
                        <div className="tooltip-row">
                          <span>Drawdown:</span>
                          <strong style={{ color: '#f87171' }}>{hoveredPoint.drawdown}%</strong>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* UNDERWATER DRAWDOWN SUBCHART */}
                  <div className="bt-dd-section">
                    <div className="bt-dd-header">
                      <span>Underwater Drawdown Profile</span>
                      <span className="neg">Max DD: {results.metrics['Max Drawdown (%)']}%</span>
                    </div>
                    <svg viewBox={`0 0 ${chartData.width} ${chartData.ddHeight}`} className="bt-svg-dd" preserveAspectRatio="none">
                      <polygon
                        points={`0,0 ${chartData.ptsDd} ${chartData.width},0`}
                        fill="rgba(239, 68, 68, 0.25)"
                        stroke="#ef4444"
                        strokeWidth="1"
                      />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MONTHLY RETURNS HEATMAP */}
          {activeTab === 'heatmap' && (
            <div className="bt-tab-content">
              <div className="bt-heatmap-card">
                <div className="bt-heatmap-header">
                  <h3>Monthly & Annual Returns Matrix (%)</h3>
                  <p>Compounded percentage returns by month and year.</p>
                </div>
                <div className="bt-heatmap-table-wrap">
                  <table className="bt-heatmap-table">
                    <thead>
                      <tr>
                        <th>Year</th>
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => (
                          <th key={m}>{m}</th>
                        ))}
                        <th className="year-col">Full Year</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.monthly_heatmap && Object.keys(results.monthly_heatmap).sort((a, b) => b - a).map(yr => {
                        const row = results.monthly_heatmap[yr] || {}
                        return (
                          <tr key={yr}>
                            <td className="yr-cell">{yr}</td>
                            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => {
                              const val = row[m]
                              let colorClass = 'neutral'
                              if (val > 5) colorClass = 'heat-pos-high'
                              else if (val > 0) colorClass = 'heat-pos'
                              else if (val < -5) colorClass = 'heat-neg-high'
                              else if (val < 0) colorClass = 'heat-neg'

                              return (
                                <td key={m} className={`heat-cell ${colorClass}`}>
                                  {val != null ? `${val > 0 ? '+' : ''}${val.toFixed(1)}%` : '—'}
                                </td>
                              )
                            })}
                            <td className={`year-cell ${row.Year >= 0 ? 'pos' : 'neg'}`}>
                              {row.Year != null ? `${row.Year > 0 ? '+' : ''}${row.Year.toFixed(2)}%` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DETAILED TRADE LOG */}
          {activeTab === 'trades' && (
            <div className="bt-tab-content">
              <div className="bt-trades-card">
                <div className="bt-trades-header">
                  <h3>Execution Trade Log ({results.trade_log?.length || 0} Trades)</h3>
                  <span>Vectorized trade entries and exits with slippage and commission friction.</span>
                </div>
                <div className="bt-trades-table-wrap">
                  <table className="bt-trades-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Type</th>
                        <th>Entry Date</th>
                        <th>Entry Price</th>
                        <th>Exit Date</th>
                        <th>Exit Price</th>
                        <th>Duration</th>
                        <th>PnL (₹)</th>
                        <th>Return %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.trade_log && results.trade_log.map((t, idx) => (
                        <tr key={idx} className={t.won ? 'trade-won' : 'trade-lost'}>
                          <td>{idx + 1}</td>
                          <td>
                            <span className="bt-badge-type">{t.direction}</span>
                          </td>
                          <td>{t.entry_date}</td>
                          <td>₹{t.entry_price.toLocaleString('en-IN')}</td>
                          <td>{t.exit_date}</td>
                          <td>₹{t.exit_price.toLocaleString('en-IN')}</td>
                          <td>{t.duration_days} days</td>
                          <td className={t.pnl >= 0 ? 'pos' : 'neg'}>
                            {t.pnl >= 0 ? '+' : ''}₹{t.pnl.toLocaleString('en-IN')}
                          </td>
                          <td className={`ret-cell ${t.return_pct >= 0 ? 'pos' : 'neg'}`}>
                            {t.return_pct >= 0 ? '+' : ''}{t.return_pct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: STRATEGY LEADERBOARD */}
          {activeTab === 'leaderboard' && (
            <div className="bt-tab-content">
              <div className="bt-leaderboard-card">
                <div className="bt-trades-header">
                  <div>
                    <h3>Multi-Strategy Comparative Leaderboard</h3>
                    <span>Precomputed ranking of all application screener strategies across NSE Assets.</span>
                  </div>
                </div>
                <div className="bt-trades-table-wrap">
                  <table className="bt-trades-table bt-leaderboard-table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Strategy</th>
                        <th>Total Return</th>
                        <th>CAGR</th>
                        <th>Sharpe</th>
                        <th>Sortino</th>
                        <th>Max DD</th>
                        <th>Win Rate</th>
                        <th>Trades</th>
                        <th>Profit Factor</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((row, idx) => (
                        <tr key={idx}>
                          <td><strong>{row.Ticker}</strong></td>
                          <td>{row.Strategy}</td>
                          <td className={Number(row['Total Return (%)']) >= 0 ? 'pos' : 'neg'}>
                            {Number(row['Total Return (%)']) >= 0 ? '+' : ''}{row['Total Return (%)']}%
                          </td>
                          <td>{row['CAGR (%)']}%</td>
                          <td><strong>{row.Sharpe}</strong></td>
                          <td>{row.Sortino}</td>
                          <td className="neg">{row['Max DD (%)']}%</td>
                          <td>{row['Win Rate (%)']}%</td>
                          <td>{row.Trades}</td>
                          <td>{row['Profit Factor']}</td>
                          <td>
                            <button
                              className="bt-run-row-btn"
                              onClick={() => {
                                const stratMatch = strategies.find(s => s.name === row.Strategy)
                                const tickerSym = QUICK_ASSETS.find(a => a.value.includes(row.Ticker))?.value || `${row.Ticker}.NS`
                                if (stratMatch) {
                                  setSelectedStrategy(stratMatch.key)
                                  setSelectedAsset(tickerSym)
                                  handleRunBacktest(tickerSym, stratMatch.key)
                                }
                              }}
                            >
                              Run Now
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── QUANTSTATS TEARSHEET MODAL ─────────────────────────────────── */}
      {tearsheetModalOpen && results?.tearsheet_filename && (
        <div className="bt-modal-overlay" onClick={() => setTearsheetModalOpen(false)}>
          <div className="bt-modal-container" onClick={e => e.stopPropagation()}>
            <div className="bt-modal-header">
              <div className="bt-modal-title">
                <FileText size={18} color="#38bdf8" />
                <span>QuantStats Performance Tearsheet: {results.strategy_name} ({results.ticker})</span>
              </div>
              <div className="bt-modal-actions">
                <a
                  href={api.getTearsheetUrl(results.tearsheet_filename)}
                  target="_blank"
                  rel="noreferrer"
                  className="bt-modal-ext-btn"
                >
                  <ExternalLink size={14} /> Open in New Tab
                </a>
                <button className="bt-modal-close" onClick={() => setTearsheetModalOpen(false)}>
                  ✕
                </button>
              </div>
            </div>
            <div className="bt-modal-iframe-wrap">
              <iframe
                src={api.getTearsheetUrl(results.tearsheet_filename)}
                title="QuantStats Tearsheet"
                className="bt-tearsheet-iframe"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
