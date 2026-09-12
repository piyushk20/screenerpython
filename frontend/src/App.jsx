import { useState, useEffect, useRef, useCallback, Component } from 'react'
import './index.css'
import { api } from './api'
import { useToast, ToastStack } from './useToast.jsx'
import { HeaderTicker } from './components/HeaderTicker.jsx'
import { ScannerPanel } from './components/ScannerPanel.jsx'
import { ChartPanel } from './components/ChartPanel.jsx'
import { BacktestLab } from './components/BacktestLab.jsx'
import {
  BarChart2, ScanSearch, PlusCircle, Play, Trash2, Edit3,
  RefreshCw, TrendingUp, TrendingDown, Activity, Clock,
  ChevronUp, ChevronDown, ArrowLeft, Wifi, AlertCircle, Zap,
  Star, Download, History, BookOpen, Filter, X, Eye
} from 'lucide-react'


// ============================================================
// CONSTANTS
// ============================================================
const OPERATORS = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '==', label: '==' },
  { value: 'crosses_above', label: '~crosses above' },
  { value: 'crosses_below', label: '~crosses below' },
]

const TIMEFRAMES = ['5m', '15m', '30m', '1H', '4H', '1D', '1WK', '1MO']

const UNIVERSES = [
  { value: 'nse500',   label: '🌐 NSE 500',            cap: 500, desc: 'Top 500 NSE stocks' },
  { value: 'fno',      label: '⚡ F&O Stocks',          cap: 200, desc: 'NSE Derivatives eligible' },
  { value: 'largecap', label: '🐘 Large Cap (>₹20k Cr)', cap: 500, desc: 'Market cap > ₹20,000 Cr' },
  { value: 'midcap',   label: '🐂 Mid Cap',             cap: 500, desc: '₹4,000 – ₹20,000 Cr' },
  { value: 'smallcap', label: '🐆 Small Cap',           cap: 500, desc: '₹800 – ₹4,000 Cr' },
  { value: 'microcap', label: '🔬 Micro Cap',           cap: 500, desc: 'Market cap < ₹800 Cr' },
  { value: 'nifty50',  label: '🏆 Nifty 50',           cap: 50,  desc: 'Top 50 blue-chip stocks' },
  { value: 'nifty100', label: '💎 Nifty 100',          cap: 100, desc: 'Top 100 by market cap' },
  { value: 'nifty200', label: '📊 Nifty 200',          cap: 200, desc: 'Top 200 by market cap' },
]

// Map universe value → exact stock count cap (mirrors backend UNIVERSE_CAPS)
const UNIVERSE_LIMIT = Object.fromEntries(UNIVERSES.map(u => [u.value, u.cap]))

const SECTORS = [
  'All Sectors', 'Technology', 'Banking', 'Financial Services', 'Pharmaceuticals',
  'Automobile', 'FMCG', 'Oil & Gas', 'Metals & Mining', 'Infrastructure',
  'Healthcare', 'Real Estate', 'Telecom', 'Power & Energy', 'Chemicals',
  'IT Services', 'Cement', 'Consumer Goods', 'Insurance', 'Capital Goods',
]

// ============================================================
// ERROR BOUNDARY
// ============================================================
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(err) { return { hasError: true, error: err } }
  componentDidCatch(err, info) { console.error('[ErrorBoundary]', err, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          margin: 20, padding: 24, borderRadius: 12,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
          color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: 13
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>⚠️ Component Error</div>
          <div style={{ opacity: 0.8 }}>{this.state.error?.message || 'An unexpected error occurred.'}</div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 12, padding: '6px 14px', borderRadius: 6, background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', cursor: 'pointer', fontWeight: 600 }}
          >Retry</button>
        </div>
      )
    }
    return this.props.children
  }
}


const DEFAULT_INDICATORS = {
  RSI:            { label: 'RSI',             params: [{ name: 'length', default: 14, type: 'int' }] },
  EMA:            { label: 'EMA',             params: [{ name: 'length', default: 20, type: 'int' }] },
  SMA:            { label: 'SMA',             params: [{ name: 'length', default: 50, type: 'int' }] },
  MACD:           { label: 'MACD',            params: [{ name: 'fast', default: 12, type: 'int' }, { name: 'slow', default: 26, type: 'int' }, { name: 'signal', default: 9, type: 'int' }] },
  ADX:            { label: 'ADX',             params: [{ name: 'length', default: 14, type: 'int' }] },
  Supertrend:     { label: 'Supertrend',      params: [{ name: 'length', default: 10, type: 'int' }, { name: 'multiplier', default: 3.0, type: 'float' }] },
  BBands:         { label: 'Bollinger Bands', params: [{ name: 'length', default: 20, type: 'int' }, { name: 'std', default: 2.0, type: 'float' }] },
  VWAP:           { label: 'VWAP',            params: [] },
  ATR:            { label: 'ATR',             params: [{ name: 'length', default: 14, type: 'int' }] },
  Volume:         { label: 'Volume',          params: [] },
  '52w_High':     { label: '52-Week High',    params: [] },
  '52w_Low':      { label: '52-Week Low',     params: [] },
  Perf_1W:        { label: '1-Week Perf %',   params: [] },
  Perf_1M:        { label: '1-Month Perf %',  params: [] },
  Perf_3M:        { label: '3-Month Perf %',  params: [] },
  Perf_1Y:        { label: '1-Year Perf %',   params: [] },
  PE_Ratio:       { label: 'P/E Ratio (TTM)', params: [] },
  PB_Ratio:       { label: 'P/B Ratio (MRQ)', params: [] },
  Dividend_Yield: { label: 'Dividend Yield %',params: [] },
}

function newRule() {
  return {
    id: Math.random().toString(36).slice(2),
    indicator: 'RSI',
    params: { length: 14 },
    operator: '>',
    value_type: 'number',
    value: 60,
  }
}

// ============================================================
// HELPER: format timestamp
// ============================================================
function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Asia/Kolkata',
  }) + ' IST'
}

function fmtPrice(n) {
  if (n == null || isNaN(n)) return '—'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ============================================================
// LIVE BADGE
// ============================================================
function LiveBadge({ source }) {
  const isLive = source?.toLowerCase().includes('tradingview')
  return (
    <span className={`badge ${isLive ? 'badge-success' : 'badge-warning'}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {isLive ? <Zap size={10} /> : <Clock size={10} />}
      {isLive ? 'Live • TradingView' : 'Delayed • yfinance'}
    </span>
  )
}

// ============================================================
// TOP BAR
// ============================================================
function TopBar({ lastSync, onToggleSidebar }) {
  return (
    <header className="topbar">
      <button
        onClick={onToggleSidebar}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--color-text)',
          cursor: 'pointer',
          marginRight: 12,
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        className="mobile-only"
        title="Toggle Sidebar"
      >
        <Eye size={20} />
      </button>
      <div className="topbar-brand">
        <div className="brand-icon">📈</div>
        <span>StockScanner<span style={{ color: 'var(--color-primary)' }}>.NSE</span></span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LiveBadge source="TradingView Screener (live)" />
        {lastSync && (
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
            Synced: {fmtTime(lastSync)}
          </span>
        )}
        <div className="delay-banner">
          <AlertCircle size={12} />
          Chart data delayed 15-20 min (yfinance)
        </div>
      </div>
    </header>
  )
}

// ============================================================
// SIDEBAR
// ============================================================
// Detect scanner category from name prefix
function getScannerCategory(name) {
  const n = name.toLowerCase()
  if (n.startsWith('bullish')) return 'bullish'
  if (n.startsWith('bearish')) return 'bearish'
  if (n.startsWith('momentum')) return 'momentum'
  return 'custom'
}
const CATEGORY_META = {
  bullish:  { label: '🟢 Bullish',  style: { color: '#22c55e', background: 'rgba(34,197,94,0.12)',  border: '1px solid rgba(34,197,94,0.35)' } },
  bearish:  { label: '🔴 Bearish',  style: { color: '#ef4444', background: 'rgba(239,68,68,0.12)',   border: '1px solid rgba(239,68,68,0.35)' } },
  momentum: { label: '⚡ Momentum', style: { color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' } },
  custom:   { label: '⚙️ Custom',   style: { color: '#a78bfa', background: 'rgba(167,139,250,0.12)',border: '1px solid rgba(167,139,250,0.35)' } },
}

function ScannerBadge({ name }) {
  const cat = getScannerCategory(name)
  const meta = CATEGORY_META[cat]
  const label = name.replace(/^(Bullish|Bearish|Momentum):\s*/i, '')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{
        display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 6px',
        borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase',
        alignSelf: 'flex-start', ...meta.style
      }}>{meta.label.replace(/^[^ ]+ /,'').toUpperCase()}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.3 }}>{label}</span>
    </div>
  )
}

function Sidebar({ scanners, activeScannerId, onSelectScanner, onNewScanner, onDeleteScanner, onRunScanner, loading, onClose }) {
  // Group scanners by category order
  const CATEGORY_ORDER = ['bullish', 'bearish', 'momentum', 'custom']
  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = scanners.filter(s => getScannerCategory(s.name) === cat)
    return acc
  }, {})

  return (
    <aside className="sidebar">
      <div className="mobile-only" style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 0' }}>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>
      </div>
      <div className="sidebar-section">
        <div className="sidebar-section-title">Actions</div>
        <button className="sidebar-btn" onClick={onNewScanner}>
          <PlusCircle size={15} className="icon" /> New Scanner
        </button>
      </div>

      <div className="sidebar-section" style={{ flex: 1, overflowY: 'auto' }}>
        <div className="sidebar-section-title">Scanners ({scanners.length})</div>
        {scanners.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--color-text-dim)', padding: '8px 0' }}>
            No scanners yet. Create one!
          </p>
        )}
        {CATEGORY_ORDER.map(cat => grouped[cat].length > 0 && (
          <div key={cat} style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: CATEGORY_META[cat].style.color, paddingBottom: 4,
              borderBottom: `1px solid ${CATEGORY_META[cat].style.color}33`, marginBottom: 4
            }}>
              {CATEGORY_META[cat].label} ({grouped[cat].length})
            </div>
            {grouped[cat].map(s => (
              <div
                key={s.id}
                className={`scanner-list-item ${s.id === activeScannerId ? 'active' : ''}`}
                onClick={() => onSelectScanner(s)}
              >
                <div className="scanner-list-item-info">
                  <ScannerBadge name={s.name} />
                  <div className="scanner-list-item-tf" style={{ marginTop: 3 }}>
                    {s.timeframe} · {s.rules.length} rule{s.rules.length !== 1 ? 's' : ''} · {s.universe || 'nse500'}
                  </div>
                </div>
                <div className="scanner-list-item-actions">
                  <button
                    className="btn btn-ghost btn-icon"
                    title="Run scanner"
                    onClick={e => { e.stopPropagation(); onRunScanner(s.id) }}
                  >
                    <Play size={13} />
                  </button>
                  <button
                    className="btn btn-ghost btn-icon"
                    style={{ color: 'var(--color-danger)' }}
                    title="Delete scanner"
                    onClick={e => { e.stopPropagation(); onDeleteScanner(s.id) }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  )
}

// ============================================================
// RULE ROW COMPONENT
// ============================================================
function RuleRow({ rule, index, onChange, onRemove }) {
  const indMeta = DEFAULT_INDICATORS[rule.indicator] || {}
  const params  = indMeta.params || []

  function updateParam(name, val) {
    const updated = { ...rule, params: { ...rule.params, [name]: val } }
    onChange(updated)
  }

  return (
    <div className="rule-row">
      {/* Indicator selector */}
      <select
        className="form-select"
        value={rule.indicator}
        onChange={e => {
          const ind     = e.target.value
          const meta    = DEFAULT_INDICATORS[ind]
          const defaults = Object.fromEntries((meta?.params || []).map(p => [p.name, p.default]))
          onChange({ ...rule, indicator: ind, params: defaults, value: 60 })
        }}
      >
        {Object.entries(DEFAULT_INDICATORS).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
      </select>

      {/* Params */}
      <div className="rule-param-group" style={{ flexWrap: 'wrap' }}>
        {params.map(p => {
          const currentVal = rule.params[p.name] ?? p.default
          const stepVal = p.type === 'float' ? 0.1 : 1
          return (
            <span key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <label style={{ marginRight: 4 }}>{p.name}</label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: '2px 6px', fontSize: 12, minWidth: 22, height: 26, lineHeight: '18px' }}
                onClick={() => updateParam(p.name, p.type === 'float' ? Math.max(0.1, Math.round((currentVal - stepVal) * 10) / 10) : Math.max(1, currentVal - 1))}
              >
                -
              </button>
              <input
                type="number"
                style={{ width: 55, textAlign: 'center', padding: '4px 2px' }}
                value={currentVal}
                step={stepVal}
                min={p.type === 'float' ? 0.1 : 1}
                onChange={e => updateParam(p.name, p.type === 'float' ? parseFloat(e.target.value) || 0.1 : parseInt(e.target.value, 10) || 1)}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: '2px 6px', fontSize: 12, minWidth: 22, height: 26, lineHeight: '18px' }}
                onClick={() => updateParam(p.name, p.type === 'float' ? Math.round((currentVal + stepVal) * 10) / 10 : currentVal + 1)}
              >
                +
              </button>
            </span>
          )
        })}
      </div>

      {/* Operator */}
      <select
        className="form-select"
        style={{ width: 140 }}
        value={rule.operator}
        onChange={e => onChange({ ...rule, operator: e.target.value })}
      >
        {OPERATORS.map(op => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>

      {/* Value type toggle */}
      <select
        className="form-select"
        style={{ width: 100 }}
        value={rule.value_type}
        onChange={e => onChange({ ...rule, value_type: e.target.value, value: e.target.value === 'number' ? 60 : { indicator: 'SMA', params: { length: 50 } } })}
      >
        <option value="number">Number</option>
        <option value="indicator">Indicator</option>
      </select>

      {/* Value */}
      {rule.value_type === 'number' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 8px', fontSize: 12, minWidth: 26, height: 32, lineHeight: '22px' }}
            onClick={() => onChange({ ...rule, value: Math.round(((parseFloat(rule.value) || 0) - 1) * 100) / 100 })}
          >
            -
          </button>
          <input
            type="number"
            style={{ width: 75, padding: '6px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-3)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'center' }}
            value={rule.value}
            onChange={e => onChange({ ...rule, value: parseFloat(e.target.value) || 0 })}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 8px', fontSize: 12, minWidth: 26, height: 32, lineHeight: '22px' }}
            onClick={() => onChange({ ...rule, value: Math.round(((parseFloat(rule.value) || 0) + 1) * 100) / 100 })}
          >
            +
          </button>
        </div>
      ) : (
        <select
          className="form-select"
          style={{ width: 120 }}
          value={typeof rule.value === 'object' ? rule.value.indicator : 'SMA'}
          onChange={e => {
            const ind  = e.target.value
            const meta = DEFAULT_INDICATORS[ind]
            const def  = Object.fromEntries((meta?.params || []).map(p => [p.name, p.default]))
            onChange({ ...rule, value: { indicator: ind, params: def } })
          }}
        >
          {Object.entries(DEFAULT_INDICATORS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      )}

      <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => onRemove(rule.id)}>
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ============================================================
// SCANNER BUILDER
// ============================================================
function ScannerBuilder({ scanner, onSaved, onRan, toast, onSelectSymbol }) {
  const isEdit = !!scanner?.id
  const [name, setName]           = useState(scanner?.name || '')
  const [timeframe, setTimeframe] = useState(scanner?.timeframe || '1D')
  const [universe, setUniverse]   = useState(scanner?.universe || 'nse500')
  const [rules, setRules]         = useState(
    scanner?.rules?.map(r => ({ ...r, id: r.id || Math.random().toString(36).slice(2) }))
    || [newRule()]
  )
  const [saving, setSaving]     = useState(false)
  const [running, setRunning]   = useState(false)
  const [results, setResults]   = useState(null)
  const [history, setHistory]   = useState([])

  // Sync when scanner prop changes
  useEffect(() => {
    setName(scanner?.name || '')
    setTimeframe(scanner?.timeframe || '1D')
    setUniverse(scanner?.universe || 'nse500')
    setRules(scanner?.rules?.map(r => ({ ...r, id: r.id || Math.random().toString(36).slice(2) })) || [newRule()])
    setResults(null)
    loadHistory()
  }, [scanner?.id])

  async function loadHistory() {
    if (!scanner?.id) { setHistory([]); return }
    try {
      const res = await api.getScannerHistory(scanner.id)
      setHistory(res.history || [])
    } catch (e) {
      console.error('History load failed', e)
    }
  }

  function addRule() { setRules(prev => [...prev, newRule()]) }
  function removeRule(id) { setRules(prev => prev.filter(r => r.id !== id)) }
  function updateRule(updated) { setRules(prev => prev.map(r => r.id === updated.id ? updated : r)) }

  function buildPayload() {
    return {
      name, timeframe, universe,
      rules: rules.map(({ id, ...rest }) => rest),  // strip client-side id
    }
  }

  async function handleSave() {
    if (!name.trim()) { toast('Please enter a scanner name.', 'error'); return }
    if (rules.length === 0) { toast('Add at least one rule.', 'error'); return }
    setSaving(true)
    try {
      const payload = buildPayload()
      const saved = isEdit
        ? await api.updateScanner(scanner.id, payload)
        : await api.createScanner(payload)
      toast(`Scanner "${saved.name}" saved!`, 'success')
      onSaved(saved)
      return saved
    } catch (e) {
      toast(`Save failed: ${e.message}`, 'error')
    } finally { setSaving(false) }
  }

  async function handleSaveAndRun() {
    if (!name.trim()) { toast('Please enter a scanner name.', 'error'); return }
    if (rules.length === 0) { toast('Add at least one rule.', 'error'); return }
    setSaving(true)
    setRunning(true)
    try {
      const payload = buildPayload()
      const saved = isEdit
        ? await api.updateScanner(scanner.id, payload)
        : await api.createScanner(payload)
      toast(`Scanner "${saved.name}" saved!`, 'success')
      onSaved(saved)
      
      // Run scanner
      const r = await api.runScanner(saved.id, timeframe, universe)
      setResults(r)
      toast(`Scan complete — ${r.match_count} matches`, 'success')
      onRan?.(r)
      // Reload history
      const histRes = await api.getScannerHistory(saved.id)
      setHistory(histRes.history || [])
    } catch (e) {
      toast(`Save & Run failed: ${e.message}`, 'error')
    } finally {
      setSaving(false)
      setRunning(false)
    }
  }

  async function handleRun() {
    if (!scanner?.id) {
      toast('Save the scanner first before running.', 'info')
      return
    }
    setRunning(true)
    setResults(null)
    try {
      const r = await api.runScanner(scanner.id, timeframe, universe)
      setResults(r)
      toast(`Scan complete — ${r.match_count} matches`, 'success')
      onRan?.(r)
      loadHistory()
    } catch (e) {
      toast(`Scan failed: ${e.message}`, 'error')
    } finally { setRunning(false) }
  }

  async function handleLoadPastRun(runId) {
    setRunning(true)
    setResults(null)
    try {
      const res = await api.getScanRunResults(runId)
      setResults(res)
      toast(`Loaded historical scan run results from ${fmtTime(res.ran_at)}`, 'success')
      onRan?.(res)
    } catch (e) {
      toast(`Failed to load historical scan run: ${e.message}`, 'error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div className="card-header" style={{ padding: '16px 0 14px' }}>
        <div className="card-title" style={{ fontSize: 18, gap: 10 }}>
          <ScanSearch size={20} style={{ color: 'var(--color-primary)' }} />
          {isEdit ? `Edit: ${scanner.name}` : 'New Scanner'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" /> : <Edit3 size={14} />}
            {isEdit ? 'Update' : 'Save Scanner'}
          </button>
          <button className="btn btn-primary" onClick={handleSaveAndRun} disabled={saving || running}>
            {saving || running ? <span className="spinner" /> : <Zap size={14} />}
            Save & Run
          </button>
          {isEdit && (
            <button className="btn btn-success" onClick={handleRun} disabled={running}>
              {running ? <span className="spinner" /> : <Play size={14} />}
              Run Live
            </button>
          )}
        </div>
      </div>


      {/* Config */}
      <div className="card">
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 20 }}>
          <div className="form-group">
            <label className="form-label">Scanner Name</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. RSI Oversold + Volume Spike" />
          </div>
          <div className="form-group">
            <label className="form-label">Stock Universe</label>
            <select className="form-select" value={universe} onChange={e => setUniverse(e.target.value)}>
              {UNIVERSES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Timeframe</label>
            <select className="form-select" value={timeframe} onChange={e => setTimeframe(e.target.value)}>
              {TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Rules */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Activity size={15} /> Conditions (ALL must match)</div>
          <button className="btn btn-secondary btn-sm" onClick={addRule}><PlusCircle size={13} /> Add Rule</button>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.length === 0 && (
            <div className="empty-state" style={{ padding: 20 }}>
              <ScanSearch size={28} className="icon" />
              <span>No rules yet. Click "Add Rule" to start.</span>
            </div>
          )}
          {rules.map((r, i) => (
            <RuleRow key={r.id} rule={r} index={i} onChange={updateRule} onRemove={removeRule} />
          ))}
        </div>
      </div>

      {/* Live data note */}
      <div style={{ background: 'var(--color-success-dim)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 12, color: 'var(--color-success)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Zap size={14} />
        <span>
          <strong>Live data:</strong> Scanners run against TradingView Screener's near real-time indicator values.
          Supertrend uses yfinance OHLCV fallback. Charts show yfinance delayed OHLCV (15-20 min).
        </span>
      </div>

      {/* Results */}
      {results && <ScanResults results={results} onSelectSymbol={onSelectSymbol} />}

      {/* History Panel */}
      {scanner?.id && history.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="card-header">
            <div className="card-title" style={{ gap: 6 }}>
              <History size={15} style={{ color: 'var(--color-primary)' }} />
              Scan History & Past Runs ({history.length})
            </div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map(run => (
              <div
                key={run.id}
                onClick={() => handleLoadPastRun(run.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(30,41,59,0.3)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                className="past-run-item"
              >
                <div>
                  <span style={{ color: 'var(--color-text-dim)' }}>Run at:</span> <strong style={{ color: '#fff', marginLeft: 4 }}>{fmtTime(run.ran_at)}</strong>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--color-success)' }}>
                  {run.match_count} matches
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
                  Top Matches: {run.top_matches?.map(m => m.symbol.replace('.NS','')).join(', ') || 'None'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// SCAN RESULTS TABLE
// ============================================================
function ScanResults({ results, onSelectSymbol }) {
  const [sortCol, setSortCol]   = useState('last_close')
  const [sortDir, setSortDir]   = useState(-1)  // -1 = desc

  const matches = results?.matches || []

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d * -1)
    else { setSortCol(col); setSortDir(-1) }
  }

  const sorted = [...matches].sort((a, b) => {
    const av = a[sortCol] ?? a.metric_values?.[sortCol] ?? 0
    const bv = b[sortCol] ?? b.metric_values?.[sortCol] ?? 0
    return sortDir * (bv - av)
  })

  function SortIcon({ col }) {
    if (sortCol !== col) return null
    return sortDir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  if (!matches.length) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="empty-state">
            <ScanSearch size={32} className="icon" />
            <span>No matches found for this scanner.</span>
            <span className="text-sm text-muted">Try adjusting the conditions.</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <BarChart2 size={15} />
          Results — {matches.length} match{matches.length !== 1 ? 'es' : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LiveBadge source={results.data_source} />
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
            {fmtTime(results.ran_at)}
          </span>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th onClick={() => toggleSort('last_close')}>Price <SortIcon col="last_close" /></th>
              <th onClick={() => toggleSort('change_pct')}>Change% <SortIcon col="change_pct" /></th>
              <th>Sector</th>
              <th>Source</th>
              <th>Data As Of</th>
              <th>Chart</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(m => {
              const chg = m.change_pct
              const cleanSym = m.symbol?.replace('.NS', '').replace('.BO', '')
              return (
                <tr key={m.symbol} onClick={() => onSelectSymbol?.(m)} style={{ cursor: 'pointer' }}>
                  <td>

                    <div className="sym-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="sym-ticker">{cleanSym}</span>
                        {m.vcp_score && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.35)' }}>
                            VCP {m.vcp_score} 🎯
                          </span>
                        )}
                      </div>
                      <span className="sym-name" title={m.name}>{m.name}</span>
                      {m.contraction_summary && (
                        <span style={{ fontSize: 10, color: 'var(--color-accent)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                          {m.contraction_summary}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="mono">{fmtPrice(m.last_close || m.price)}</td>
                  <td className={chg >= 0 ? 'bull' : 'bear'} style={{ fontWeight: 700 }}>
                    {chg != null ? `${chg >= 0 ? '+' : ''}${Number(chg).toFixed(2)}%` : '—'}
                  </td>
                  <td className="muted">{m.sector || '—'}</td>
                  <td><LiveBadge source={m.data_source || 'TradingView Screener'} /></td>
                  <td className="muted" style={{ fontSize: 11 }}>{m.data_as_of ? m.data_as_of.slice(0, 10) : '—'}</td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onSelectSymbol?.(m)}
                    >
                      <BarChart2 size={11} /> Chart
                    </button>
                  </td>
                </tr>
              )
            })}

          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// CHART VIEW using lightweight-charts
// ============================================================
function ChartView({ symbol, name, onBack, timeframe = '1D', stockObj = {} }) {
  const mainRef  = useRef(null)
  const rsiRef   = useRef(null)
  const macdRef  = useRef(null)
  const chartsRef = useRef({})
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [activeInds, setActiveInds] = useState(['EMA_20', 'EMA_50', 'BBands'])
  const [chartTf, setChartTf]   = useState(timeframe)   // ← internal timeframe state

  useEffect(() => {
    setLoading(true)
    setData(null)
    api.getOHLCV(symbol, chartTf).then(d => {
      setData(d)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [symbol, chartTf])

  useEffect(() => {
    if (!data || loading || !mainRef.current) return

    // Cleanup
    Object.values(chartsRef.current).forEach(c => { try { c.remove() } catch {} })
    chartsRef.current = {}

    import('lightweight-charts').then((lc) => {
      const { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries } = lc
      const CHART_OPTS = {
        layout: { background: { type: ColorType.Solid, color: '#111827' }, textColor: '#94a3b8' },
        grid: { vertLines: { color: '#1a2235' }, horzLines: { color: '#1a2235' } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: '#1a2235' },
        timeScale: { borderColor: '#1a2235', timeVisible: true },
        localization: {
          locale: 'en-IN',
          timeFormatter: (tick) => {
            if (typeof tick === 'number') {
              const d = new Date(tick * 1000);
              return d.toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false,
                timeZone: 'Asia/Kolkata'
              }) + ' IST';
            }
            return tick;
          }
        }
      }

      const addCandles = (chart, opts) =>
        typeof chart.addCandlestickSeries === 'function'
          ? chart.addCandlestickSeries(opts)
          : chart.addSeries(CandlestickSeries, opts)

      const addLine = (chart, opts) =>
        typeof chart.addLineSeries === 'function'
          ? chart.addLineSeries(opts)
          : chart.addSeries(LineSeries, opts)

      const addHist = (chart, opts) =>
        typeof chart.addHistogramSeries === 'function'
          ? chart.addHistogramSeries(opts)
          : chart.addSeries(HistogramSeries, opts)

      // Main candlestick chart
      const mainChart = createChart(mainRef.current, { ...CHART_OPTS, height: 420 })
      chartsRef.current.main = mainChart

      const parseTime = (t) => {
        if (t == null) return t
        const num = Number(t)
        if (!isNaN(num) && num > 100000000) return num
        return String(t).slice(0, 10)
      }

      const candleSeries = addCandles(mainChart, {
        upColor: '#10b981', downColor: '#ef4444',
        borderUpColor: '#10b981', borderDownColor: '#ef4444',
        wickUpColor: '#10b981', wickDownColor: '#ef4444',
      })

      const candles = (data.candles || []).map(c => ({
        time: parseTime(c.timestamp),
        open: c.open, high: c.high, low: c.low, close: c.close,
      })).filter(c => c.time != null)
      if (candles.length) candleSeries.setData(candles)

      // Add Volume histogram to the bottom of the main candlestick chart
      const volumeSeries = addHist(mainChart, {
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '', // Overlay on the main candlestick pane
      })
      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8, // Push to the bottom 20% of the chart
          bottom: 0,
        },
      })
      const volumeData = (data.candles || []).map(c => ({
        time: parseTime(c.timestamp),
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)',
      })).filter(c => c.time != null)
      if (volumeData.length) volumeSeries.setData(volumeData)

      // Overlay indicators on main chart
      const inds = data.indicators || {}

      // EMA 20
      if (activeInds.includes('EMA_20') && Array.isArray(inds.EMA_20)) {
        const ema20 = addLine(mainChart, { color: '#3b82f6', lineWidth: 1.5, priceLineVisible: false })
        ema20.setData(inds.EMA_20.map(p => ({ time: parseTime(p.timestamp), value: p.value })).filter(p => p.time != null))
      }
      // EMA 50
      if (activeInds.includes('EMA_50') && Array.isArray(inds.EMA_50)) {
        const ema50 = addLine(mainChart, { color: '#f59e0b', lineWidth: 1.5, priceLineVisible: false })
        ema50.setData(inds.EMA_50.map(p => ({ time: parseTime(p.timestamp), value: p.value })).filter(p => p.time != null))
      }
      // SMA 150
      if (activeInds.includes('SMA_150') && Array.isArray(inds.SMA_150)) {
        const sma150 = addLine(mainChart, { color: '#06b6d4', lineWidth: 1.5, priceLineVisible: false })
        sma150.setData(inds.SMA_150.map(p => ({ time: parseTime(p.timestamp), value: p.value })).filter(p => p.time != null))
      }
      // SMA 200
      if (activeInds.includes('SMA_200') && Array.isArray(inds.SMA_200)) {
        const sma200 = addLine(mainChart, { color: '#a855f7', lineWidth: 1, lineStyle: 2, priceLineVisible: false })
        sma200.setData(inds.SMA_200.map(p => ({ time: parseTime(p.timestamp), value: p.value })).filter(p => p.time != null))
      }

      // Bollinger Bands
      if (activeInds.includes('BBands') && inds.BBands && typeof inds.BBands === 'object') {
        const bbData = inds.BBands
        for (const [key, col, width] of [['BB_upper', '#64748b', 1], ['BB_lower', '#64748b', 1], ['BB_middle', '#94a3b8', 1]]) {
          if (Array.isArray(bbData[col])) {
            const s = addLine(mainChart, { color: key === 'BB_middle' ? '#94a3b8' : '#475569', lineWidth: width, lineStyle: 2, priceLineVisible: false })
            s.setData(bbData[col].map(p => ({ time: parseTime(p.timestamp), value: p.value })).filter(p => p.time != null))
          }
        }
      }

      mainChart.timeScale().fitContent()

      // RSI sub-pane
      if (activeInds.includes('RSI') && rsiRef.current) {
        const rsiChart = createChart(rsiRef.current, { ...CHART_OPTS, height: 140 })
        chartsRef.current.rsi = rsiChart
        if (Array.isArray(inds.RSI)) {
          const rsiSeries = addLine(rsiChart, { color: '#6366f1', lineWidth: 1.5, priceLineVisible: false })
          const rsiData = inds.RSI.map(p => ({ time: parseTime(p.timestamp), value: p.value })).filter(p => p.time != null)
          rsiSeries.setData(rsiData)
          // Overbought/oversold lines
          addLine(rsiChart, { color: '#ef4444', lineWidth: 1, lineStyle: 2, priceLineVisible: false })
            .setData(rsiData.map(p => ({ time: p.time, value: 70 })))
          addLine(rsiChart, { color: '#10b981', lineWidth: 1, lineStyle: 2, priceLineVisible: false })
            .setData(rsiData.map(p => ({ time: p.time, value: 30 })))
        }
        rsiChart.timeScale().fitContent()
      }

      // MACD sub-pane
      if (activeInds.includes('MACD') && macdRef.current) {
        const macdChart = createChart(macdRef.current, { ...CHART_OPTS, height: 120 })
        chartsRef.current.macd = macdChart
        if (inds.MACD && typeof inds.MACD === 'object') {
          const macdData = inds.MACD
          if (Array.isArray(macdData.MACD)) {
            const ms = addLine(macdChart, { color: '#3b82f6', lineWidth: 1.5, priceLineVisible: false })
            ms.setData(macdData.MACD.map(p => ({ time: parseTime(p.timestamp), value: p.value })).filter(p => p.time != null))
          }
          if (Array.isArray(macdData.MACD_signal)) {
            const sig = addLine(macdChart, { color: '#f59e0b', lineWidth: 1.5, priceLineVisible: false })
            sig.setData(macdData.MACD_signal.map(p => ({ time: parseTime(p.timestamp), value: p.value })).filter(p => p.time != null))
          }
          if (Array.isArray(macdData.MACD_diff)) {
            const hist = addHist(macdChart, {
              color: '#10b981',
              priceLineVisible: false,
            })
            hist.setData(macdData.MACD_diff.map(p => ({
              time: parseTime(p.timestamp),
              value: p.value,
              color: p.value >= 0 ? '#10b981' : '#ef4444',
            })).filter(p => p.time != null))
          }
        }
        macdChart.timeScale().fitContent()
      }


      // Sync timescales
      const allCharts = Object.values(chartsRef.current)
      allCharts.forEach(chart => {
        chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
          allCharts.forEach(other => {
            if (other !== chart) other.timeScale().setVisibleLogicalRange(range)
          })
        })
      })
    })

    return () => {
      Object.values(chartsRef.current).forEach(c => { try { c.remove() } catch {} })
      chartsRef.current = {}
    }
  }, [data, loading, activeInds])

  const indTabs = [
    { key: 'EMA_20',   label: 'EMA 20' },
    { key: 'EMA_50',   label: 'EMA 50' },
    { key: 'SMA_150',  label: 'SMA 150' },
    { key: 'SMA_200',  label: 'SMA 200' },
    { key: 'BBands',   label: 'BB Bands' },
    { key: 'RSI',      label: 'RSI' },
    { key: 'MACD',     label: 'MACD' },
  ]


  const lastCandle = data?.candles?.[data.candles.length - 1]
  const prevCandle = data?.candles?.[data.candles.length - 2]
  const priceChange = lastCandle && prevCandle ? lastCandle.close - prevCandle.close : 0

  const cleanSym = symbol?.replace('.NS', '').replace('.BO', '') || 'RELIANCE'
  const tvUrl = `https://in.tradingview.com/chart/?symbol=NSE:${cleanSym}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={14} /> Back to Results
        </button>
        <a
          href={tvUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-sm"
          style={{ gap: 6 }}
        >
          <Zap size={12} style={{ color: 'var(--color-primary)' }} /> Open on TradingView ↗
        </a>
      </div>

      <div className="card">
        <div className="chart-header">
          <div>
            <div className="chart-sym-block">
              <div className="chart-sym-ticker">{cleanSym}</div>
              <div className="chart-sym-name">{name}</div>
            </div>
          </div>
          <div className="chart-price-block">
            {lastCandle && (
              <>
                <div className="chart-price" style={{ color: priceChange >= 0 ? 'var(--color-bull)' : 'var(--color-bear)' }}>
                  {fmtPrice(lastCandle.close)}
                  <span style={{ fontSize: 14, marginLeft: 8 }}>
                    {priceChange >= 0 ? '+' : ''}{fmtPrice(Math.abs(priceChange))}
                  </span>
                </div>
                <div className="chart-data-note">
                  ⚡ Timeframe: <strong>{chartTf}</strong> · Data as of {lastCandle.timestamp}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Fundamentals Strip */}
        <div style={{
          display: 'flex', gap: 16, padding: '10px 18px',
          borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap',
          background: 'rgba(30,41,59,0.2)', fontSize: 12
        }}>
          <div>
            <span style={{ color: 'var(--color-text-dim)' }}>Sector:</span> <strong style={{ color: '#fff', marginLeft: 4 }}>{stockObj.sector || 'N/A'}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-dim)' }}>Market Cap:</span> <strong style={{ color: '#fff', marginLeft: 4 }}>{stockObj.market_cap != null ? '₹' + (Number(stockObj.market_cap) / 1e7).toFixed(0) + ' Cr' : 'N/A'}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-dim)' }}>Volume:</span> <strong style={{ color: '#fff', marginLeft: 4 }}>{stockObj.volume != null ? Number(stockObj.volume).toLocaleString('en-IN') : 'N/A'}</strong>
          </div>
          {stockObj.rsi != null && (
            <div>
              <span style={{ color: 'var(--color-text-dim)' }}>RSI (14):</span> <strong style={{ color: '#fff', marginLeft: 4 }}>{Number(stockObj.rsi).toFixed(1)}</strong>
            </div>
          )}
        </div>

        {/* Timeframe switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 18px', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)', marginRight: 6, fontWeight: 600 }}>TIMEFRAME</span>
          {['5m','15m','30m','1H','4H','1D','1WK','1MO'].map(tf => (
            <button
              key={tf}
              onClick={() => setChartTf(tf)}
              style={{
                padding: '3px 10px', fontSize: 11, fontWeight: 600,
                borderRadius: 5, border: '1px solid',
                cursor: 'pointer', transition: 'all 0.15s',
                borderColor: chartTf === tf ? 'var(--color-primary)' : 'var(--color-border)',
                background: chartTf === tf ? 'var(--color-primary-dim)' : 'transparent',
                color: chartTf === tf ? 'var(--color-primary)' : 'var(--color-text-dim)',
              }}
            >{tf}</button>
          ))}
        </div>

        {/* Indicator toggle tabs */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="indicator-tabs">
            {indTabs.map(t => (
              <button
                key={t.key}
                className={`ind-tab ${activeInds.includes(t.key) ? 'active' : ''}`}
                onClick={() => setActiveInds(prev =>
                  prev.includes(t.key) ? prev.filter(x => x !== t.key) : [...prev, t.key]
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', minHeight: 420 }}>
          {loading && (
            <div className="loading-state" style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(15,23,42,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="spinner spinner-lg" style={{ marginRight: 8 }} /> Loading candlestick chart for {cleanSym} ({chartTf})...
            </div>
          )}

          {!loading && (!data || !data.candles || data.candles.length === 0) && (
            <div style={{ padding: 48, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <AlertCircle size={32} style={{ color: 'var(--color-warning)' }} />
              <div style={{ fontSize: 16, fontWeight: 700 }}>No OHLCV history returned for {cleanSym}</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-dim)', maxWidth: 460 }}>
                Historical price bars for this timeframe ({chartTf}) are currently unreachable. Click below to view live TradingView charts.
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={() => setChartTf(chartTf)}>
                  <RefreshCw size={12} /> Retry Fetch
                </button>
                <a href={tvUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                  <Zap size={12} /> Open TradingView Live Chart ↗
                </a>
              </div>
            </div>
          )}

          <div id="chart-container" ref={mainRef} style={{ display: data?.candles?.length ? 'block' : 'none' }} />
          {activeInds.includes('RSI') && data?.candles?.length && (
            <div style={{ borderTop: '1px solid var(--color-border)', padding: '6px 12px 0', fontSize: 11, color: 'var(--color-text-dim)' }}>RSI (14)</div>
          )}
          <div id="rsi-chart-container" ref={rsiRef} style={{ display: activeInds.includes('RSI') && data?.candles?.length ? 'block' : 'none' }} />
          {activeInds.includes('MACD') && data?.candles?.length && (
            <div style={{ borderTop: '1px solid var(--color-border)', padding: '6px 12px 0', fontSize: 11, color: 'var(--color-text-dim)' }}>MACD (12,26,9)</div>
          )}
          <div id="macd-chart-container" ref={macdRef} style={{ display: activeInds.includes('MACD') && data?.candles?.length ? 'block' : 'none' }} />
        </div>
      </div>
    </div>
  )
}


// ============================================================
// DASHBOARD (Live market snapshot)
// ============================================================
function Dashboard({ toast }) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [timeframe, setTF]      = useState('1D')
  const [universe, setUniverse] = useState('nse500')
  const [searchQuery, setSearch] = useState('')
  const [sortCol, setSortCol]   = useState('market_cap')
  const [sortDir, setSortDir]   = useState(-1)
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [pkOptions, setPkOptions]   = useState(null)   // null = loading
  const [selectedPk, setSelectedPk] = useState('pk_vcp')
  const [pkResults, setPkResults]   = useState(null)
  const [pkLoading, setPkLoading]   = useState(false)
  const [sectorFilter, setSectorFilter] = useState('All Sectors')
  const [watchlistItems, setWatchlistItems] = useState(new Set()) // set of starred symbols
  const [watchlistId, setWatchlistId] = useState(null)
  const [showWatchlist, setShowWatchlist] = useState(false)
  const [watchlistData, setWatchlistData] = useState([])

  // Initialize watchlist on mount
  useEffect(() => {
    async function initWatchlist() {
      try {
        const res = await api.listWatchlists()
        if (res.watchlists && res.watchlists.length > 0) {
          const wl = res.watchlists[0] // use first watchlist
          setWatchlistId(wl.id)
          // Load items
          const itemsRes = await api.getWatchlistItems(wl.id)
          const set = new Set((itemsRes.items || []).map(i => i.symbol))
          setWatchlistItems(set)
          setWatchlistData(itemsRes.items || [])
        } else {
          // create a default one
          const newWl = await api.createWatchlist('My Watchlist')
          setWatchlistId(newWl.id)
        }
      } catch (e) {
        console.error('Watchlist init failed', e)
      }
    }
    initWatchlist()
  }, [])

  async function toggleWatchlist(symbol, name, sector) {
    if (!watchlistId) return
    const isStarred = watchlistItems.has(symbol)
    try {
      if (isStarred) {
        await api.removeFromWatchlist(watchlistId, symbol)
        const next = new Set(watchlistItems)
        next.delete(symbol)
        setWatchlistItems(next)
        setWatchlistData(prev => prev.filter(i => i.symbol !== symbol))
        toast(`Removed ${symbol} from Watchlist`, 'success')
      } else {
        await api.addToWatchlist(watchlistId, symbol, name, sector)
        const next = new Set(watchlistItems)
        next.add(symbol)
        setWatchlistItems(next)
        setWatchlistData(prev => [{ symbol, name, sector, added_at: new Date().toISOString() }, ...prev])
        toast(`Added ${symbol} to Watchlist`, 'success')
      }
    } catch (e) {
      toast('Watchlist update failed: ' + e.message, 'error')
    }
  }

  async function loadSnapshot() {
    setLoading(true)
    try {
      // Use the exact cap for each universe — Nifty 50 → 50, Nifty 100 → 100, etc.
      const limit = UNIVERSE_LIMIT[universe] ?? 500
      const data = await api.getLiveSnapshot(timeframe, limit, universe)
      setSnapshot(data)
    } catch (e) {
      toast('Failed to fetch live snapshot: ' + e.message, 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { loadSnapshot() }, [timeframe, universe])

  useEffect(() => {
    api.getPkscreenerOptions()
      .then(res => setPkOptions(res.options || []))
      .catch(() => setPkOptions([]))
  }, [])

  async function handleRunPkScan() {
    setPkLoading(true)
    try {
      const res = await api.runPkscreenerScan(selectedPk, universe, 200)
      setPkResults(res)
      const count = res.match_count || res.pkscreener_matches?.length || res.vcp_matches?.length || 0
      toast(`PKScreener scan complete — ${count} matches found`, 'success')
    } catch (e) {
      toast('PKScreener scan failed: ' + e.message, 'error')
    } finally {
      setPkLoading(false)
    }
  }

  function exportToCSV() {
    if (!sorted.length) return
    const headers = ['Symbol', 'Company Name', 'Sector', 'Price', 'Change %', 'RSI', 'Volume']
    const rows = sorted.map(s => {
      const rawSym = s.tv_ticker && s.tv_ticker.includes(':') ? s.tv_ticker.split(':')[1] : (s.symbol || s.tv_ticker || '')
      return [
        rawSym,
        s.name || s.description || '',
        s.sector || '',
        s.price ?? s.last_close ?? '',
        s.change_pct ?? s.Change_Pct ?? '',
        s.rsi ?? s.RSI ?? '',
        s.volume ?? s.Volume ?? '',
      ]
    })
    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `stockscanner_${showWatchlist ? 'watchlist' : universe}_${timeframe}_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (selectedSymbol) {
    const sym = selectedSymbol.yf_symbol || selectedSymbol.symbol || (selectedSymbol.tv_ticker?.includes(':') ? selectedSymbol.tv_ticker.split(':')[1] + '.NS' : 'RELIANCE.NS')
    return (
      <ErrorBoundary>
        <ChartView
          symbol={sym}
          name={selectedSymbol.name}
          timeframe={timeframe}
          onBack={() => setSelectedSymbol(null)}
          stockObj={selectedSymbol}
        />
      </ErrorBoundary>
    )
  }

  const rawStocks = showWatchlist
    ? watchlistData.map(w => {
        const live = (snapshot?.stocks || []).find(s => {
          const s1 = (s.symbol || s.tv_ticker || '').replace('.NS','').replace('.BO','').toUpperCase()
          const s2 = w.symbol.replace('.NS','').replace('.BO','').toUpperCase()
          return s1 === s2
        })
        return live ? { ...live, ...w } : { symbol: w.symbol, name: w.name, sector: w.sector, close: w.last_close, RSI: null, Volume: null }
      })
    : pkResults
      ? (pkResults.pkscreener_matches || pkResults.vcp_matches || []).map(p => {
          const live = (snapshot?.stocks || []).find(s => {
            const s1 = (s.symbol || s.tv_ticker || '').replace('.NS','').replace('.BO','').toUpperCase()
            const s2 = p.symbol.replace('.NS','').replace('.BO','').toUpperCase()
            return s1 === s2
          })
          return live ? { ...live, ...p } : { ...p, close: p.last_close }
        })
      : (snapshot?.stocks || [])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d * -1)
    else { setSortCol(col); setSortDir(-1) }
  }

  const filtered = rawStocks.filter(s => {
    // Sector filter
    if (sectorFilter !== 'All Sectors') {
      const sec = (s.sector || '').toLowerCase()
      if (!sec.includes(sectorFilter.toLowerCase())) return false
    }

    // Search query filter
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const sym = (s.symbol || s.tv_ticker || '').toLowerCase()
    const name = (s.name || s.description || '').toLowerCase()
    const sector = (s.sector || '').toLowerCase()
    return sym.includes(q) || name.includes(q) || sector.includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    let av = parseFloat(a[sortCol]) || 0
    let bv = parseFloat(b[sortCol]) || 0
    // Handle price column compatibility
    if (sortCol === 'price') {
      av = parseFloat(a.price ?? a.last_close) || 0
      bv = parseFloat(b.price ?? b.last_close) || 0
    }
    return sortDir * (bv - av)
  })

  function SortIcon({ col }) {
    if (sortCol !== col) return null
    return sortDir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  function getRsiBadge(rsi) {
    if (rsi == null) return <span style={{ color: 'var(--color-text-dim)' }}>—</span>
    const val = Number(rsi)
    let bg = 'rgba(100,116,139,0.12)', color = '#94a3b8', border = 'rgba(100,116,139,0.25)'
    if (val >= 70) { bg = 'rgba(239,68,68,0.15)'; color = '#f43f5e'; border = 'rgba(239,68,68,0.35)' }
    else if (val >= 55) { bg = 'rgba(34,197,94,0.15)'; color = '#22c55e'; border = 'rgba(34,197,94,0.35)' }
    else if (val <= 30) { bg = 'rgba(59,130,246,0.15)'; color = '#60a5fa'; border = 'rgba(59,130,246,0.35)' }
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
        background: bg, color: color, border: `1px solid ${border}`,
        fontFamily: 'var(--font-mono)'
      }}>
        {val.toFixed(1)}
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Top Header Controls */}
      <div className="card-header" style={{ padding: '0 0 14px', flexWrap: 'wrap', gap: 12 }}>
        <div className="card-title" style={{ fontSize: 18, letterSpacing: '-0.3px' }}>
          <Activity size={20} style={{ color: 'var(--color-primary)' }} /> Live Market Screener
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Watchlist Toggle */}
          <button
            className="btn btn-secondary btn-sm"
            style={{
              height: 34,
              background: showWatchlist ? 'rgba(245,158,11,0.15)' : '',
              borderColor: showWatchlist ? '#f59e0b' : '',
              color: showWatchlist ? '#f59e0b' : ''
            }}
            onClick={() => setShowWatchlist(prev => !prev)}
          >
            <Star size={13} fill={showWatchlist ? '#f59e0b' : 'none'} className="icon" />
            {showWatchlist ? 'Showing Watchlist' : 'Watchlist'}
          </button>

          {/* Sector Filter */}
          <select
            className="form-select"
            style={{ width: 140, height: 34, fontSize: 12 }}
            value={sectorFilter}
            onChange={e => setSectorFilter(e.target.value)}
          >
            {SECTORS.map(sec => <option key={sec} value={sec}>{sec}</option>)}
          </select>

          {/* Export CSV */}
          <button
            className="btn btn-secondary btn-sm"
            style={{ height: 34 }}
            onClick={exportToCSV}
            disabled={sorted.length === 0}
          >
            <Download size={13} className="icon" /> Export CSV
          </button>

          {/* Real-time search */}
          <div style={{ position: 'relative', width: 200 }}>
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: 30, fontSize: 12, height: 34 }}
              placeholder="Search symbol..."
              value={searchQuery}
              onChange={e => setSearch(e.target.value)}
            />
            <ScanSearch size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--color-text-dim)' }} />
          </div>

          <select className="form-select" style={{ width: 85, height: 34, fontSize: 12 }} value={timeframe} onChange={e => setTF(e.target.value)}>
            {TIMEFRAMES.map(tf => <option key={tf}>{tf}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" style={{ height: 34 }} onClick={loadSnapshot} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* PKScreener Preset Bar */}
      <div style={{
        background: 'var(--color-surface)', padding: '10px 16px', borderRadius: 10,
        border: '1px solid rgba(59,130,246,0.3)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={16} style={{ color: '#60a5fa' }} />
          <span style={{ fontWeight: 700, fontSize: 12.5, color: '#f8fafc' }}>PKScreener Presets:</span>
        </div>
        <select
          className="form-select"
          style={{ minWidth: 320, height: 34, fontSize: 12, background: '#0b0f19', color: '#60a5fa', borderColor: '#3b82f6', fontWeight: 600 }}
          value={selectedPk}
          onChange={e => setSelectedPk(e.target.value)}
        >
          {pkOptions === null ? (
            <option>Loading strategies...</option>
          ) : (
            [
              'Buy & Reversal Signals',
              'Sell & Bearish Signals',
              'Volume & Momentum Surge',
              'Chart & Range Compression Patterns',
              'Trend & Moving Average Signals',
              'Fundamental & Institutional Insights'
            ].map(cat => {
              const items = pkOptions.filter(o => o.category === cat)
              if (!items.length) return null
              return (
                <optgroup key={cat} label={`--- ${cat.toUpperCase()} ---`}>
                  {items.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </optgroup>
              )
            })
          )}
        </select>

        <button
          className="btn btn-primary"
          style={{ height: 34, padding: '0 16px', fontSize: 12, fontWeight: 700 }}
          onClick={handleRunPkScan}
          disabled={pkLoading}
        >
          <Zap size={13} className={pkLoading ? 'spin' : ''} /> Run PKScreener Scan ⚡
        </button>
        {pkResults && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>
              ✓ {pkResults.match_count || pkResults.pkscreener_matches?.length || 0} Matches ({pkResults.universe?.toUpperCase()})
            </span>
            <button
              className="btn btn-secondary btn-sm"
              style={{ height: 26, fontSize: 11, padding: '0 8px' }}
              onClick={() => setPkResults(null)}
            >
              Clear Filter ✕
            </button>
          </div>
        )}
      </div>

      {/* Universe Pill Tabs */}
      {!showWatchlist && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 6, borderBottom: '1px solid var(--color-border)', scrollbarWidth: 'none' }}>
          {UNIVERSES.map(u => (
            <button
              key={u.value}
              onClick={() => setUniverse(u.value)}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                borderRadius: 8, border: '1px solid',
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
                borderColor: universe === u.value ? '#3b82f6' : 'var(--color-border)',
                background: universe === u.value ? 'rgba(59,130,246,0.18)' : 'var(--color-surface)',
                color: universe === u.value ? '#60a5fa' : 'var(--color-text-muted)',
              }}
            >
              {u.label}
            </button>
          ))}
        </div>
      )}

      {/* Institutional Stats Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div className="card" style={{ padding: '12px 16px', background: 'rgba(15,23,42,0.6)', borderColor: 'rgba(59,130,246,0.2)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Scanned Universe</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
            {showWatchlist ? 'Watchlist' : (UNIVERSES.find(u => u.value === universe)?.label.replace(/^[^ ]+ /, '') || universe.toUpperCase())}
          </div>
          <div style={{ fontSize: 11, color: '#60a5fa', marginTop: 2 }}>
            {showWatchlist ? `${watchlistData.length} Saved` : `${snapshot?.count ?? rawStocks.length} Live Candidates`}
            {!showWatchlist && snapshot?.count != null && ` of ${UNIVERSE_LIMIT[universe] ?? snapshot.count}`}
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', background: 'rgba(15,23,42,0.6)', borderColor: 'rgba(16,185,129,0.2)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bullish Gainers</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
            {sorted.filter(s => (s.change_pct ?? s.Change_Pct ?? 0) > 0).length}
          </div>
          <div style={{ fontSize: 11, color: '#34d399', marginTop: 2 }}>
            {Math.round((sorted.filter(s => (s.change_pct ?? s.Change_Pct ?? 0) > 0).length / (sorted.length || 1)) * 100)}% Positive Ratio
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', background: 'rgba(15,23,42,0.6)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bearish Decliners</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f43f5e', marginTop: 4 }}>
            {sorted.filter(s => (s.change_pct ?? s.Change_Pct ?? 0) < 0).length}
          </div>
          <div style={{ fontSize: 11, color: '#f43f5e', marginTop: 2 }}>
            {Math.round((sorted.filter(s => (s.change_pct ?? s.Change_Pct ?? 0) < 0).length / (sorted.length || 1)) * 100)}% Bearish Ratio
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', background: 'rgba(15,23,42,0.6)', borderColor: 'rgba(99,102,241,0.2)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Average Market RSI</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#818cf8', marginTop: 4 }}>
            {sorted.length ? (sorted.reduce((acc, s) => acc + (parseFloat(s.rsi) || 50), 0) / sorted.length).toFixed(1) : '50.0'}
          </div>
          <div style={{ fontSize: 11, color: '#a5b4fc', marginTop: 2 }}>
            {(sorted.reduce((acc, s) => acc + (parseFloat(s.rsi) || 50), 0) / (sorted.length || 1)) >= 50 ? 'Bullish Regime' : 'Bearish Regime'}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="card">
        {loading ? (
          <div className="loading-state" style={{ padding: 40, textAlign: 'center' }}>
            <span className="spinner spinner-lg" style={{ marginRight: 10 }} />
            {timeframe.includes('m') ? 'Fetching intraday TV indicators (may take 8-12s)...' : 'Loading live market snapshot...'}
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 13 }}>
            No stocks matched your filters or watchlist is empty.
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', minWidth: 780 }}>
              <thead>
                <tr>
                  <th style={{ width: '4%', textAlign: 'center' }}>⭐</th>
                  <th style={{ width: '25%' }}>Stock / Company</th>
                  <th onClick={() => toggleSort('price')} style={{ cursor: 'pointer', textAlign: 'right', width: '12%' }}>Price <SortIcon col="price" /></th>
                  <th onClick={() => toggleSort('change_pct')} style={{ cursor: 'pointer', textAlign: 'right', width: '11%' }}>Change% <SortIcon col="change_pct" /></th>
                  <th onClick={() => toggleSort('rsi')} style={{ cursor: 'pointer', textAlign: 'center', width: '10%' }}>RSI (14) <SortIcon col="rsi" /></th>
                  <th onClick={() => toggleSort('macd')} style={{ cursor: 'pointer', textAlign: 'right', width: '10%' }}>MACD <SortIcon col="macd" /></th>
                  <th onClick={() => toggleSort('volume')} style={{ cursor: 'pointer', textAlign: 'right', width: '11%' }}>Volume <SortIcon col="volume" /></th>
                  <th onClick={() => toggleSort('market_cap')} style={{ cursor: 'pointer', textAlign: 'right', width: '12%' }}>Market Cap <SortIcon col="market_cap" /></th>
                  <th style={{ textAlign: 'center', width: '9%' }}>Chart</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => {
                  const chg = parseFloat(s.change_pct) || 0
                  const rawSym = s.tv_ticker && s.tv_ticker.includes(':') ? s.tv_ticker.split(':')[1] : (s.symbol || s.tv_ticker || '—').replace('.NS', '').replace('.BO', '')
                  const yfSym = s.yf_symbol || (rawSym !== '—' ? `${rawSym}.NS` : null)
                  return (
                    <tr key={i} onClick={() => setSelectedSymbol({ ...s, symbol: yfSym, yf_symbol: yfSym })} style={{ cursor: 'pointer' }}>
                      <td style={{ textAlign: 'center' }} onClick={e => { e.stopPropagation(); toggleWatchlist(rawSym, s.name || s.description, s.sector) }}>
                        <Star size={14} fill={watchlistItems.has(rawSym) ? '#f59e0b' : 'none'} color={watchlistItems.has(rawSym) ? '#f59e0b' : 'var(--color-text-dim)'} />
                      </td>
                      <td>
                        <div className="sym-cell">
                          <span className="sym-ticker">{rawSym}</span>
                          <span className="sym-name" title={s.name || s.description}>{s.name || s.description}</span>
                          {s.sector && <span style={{ fontSize: 9, textTransform: 'uppercase', color: '#38bdf8', marginTop: 2, display: 'inline-block' }}>{s.sector}</span>}
                        </div>
                      </td>
                      <td className="mono" style={{ fontWeight: 600, textAlign: 'right' }}>{fmtPrice(s.price || s.last_close || s.close)}</td>
                      <td className={chg >= 0 ? 'bull' : 'bear'} style={{ fontWeight: 700, textAlign: 'right' }}>
                        {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                      </td>
                      <td style={{ textAlign: 'center' }}>{getRsiBadge(s.rsi)}</td>
                      <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{s.macd != null ? Number(s.macd).toFixed(2) : '—'}</td>
                      <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{s.volume != null ? Number(s.volume).toLocaleString('en-IN') : '—'}</td>
                      <td className="mono" style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'right' }}>
                        {s.market_cap != null ? '₹' + (Number(s.market_cap) / 1e7).toFixed(0) + ' Cr' : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedSymbol({ ...s, symbol: yfSym, yf_symbol: yfSym })}>
                          <BarChart2 size={11} /> Chart
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )

}


// ============================================================
// ROOT APP
// ============================================================
export default function App() {
  const { toasts, toast }           = useToast()
  const [scanners, setScanners]     = useState([])
  const [activeScanner, setActive]  = useState(null)
  const [view, setView]             = useState('dashboard') // 'dashboard' | 'builder' | 'chart'
  const [chartSymbol, setChartSymbol] = useState(null)
  const [scanResults, setScanResults] = useState(null)
  const [lastSync, setLastSync]     = useState(null)
  const [syncing, setSyncing]       = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => { loadScanners() }, [])

  async function loadScanners() {
    try {
      const r = await api.listScanners()
      setScanners(r.scanners || [])
    } catch (e) {
      toast('Failed to load scanners', 'error')
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await api.syncSymbols()
      setLastSync(new Date().toISOString())
      toast('Symbol sync started (fetching live from TradingView Screener)', 'info')
    } catch (e) {
      toast('Sync failed: ' + e.message, 'error')
    } finally { setSyncing(false) }
  }

  function handleSelectScanner(s) {
    setActive(s)
    setView('builder')
    setScanResults(null)
    setSidebarOpen(false)
  }

  function handleNewScanner() {
    setActive(null)
    setView('builder')
    setScanResults(null)
    setSidebarOpen(false)
  }

  async function handleDeleteScanner(id) {
    try {
      await api.deleteScanner(id)
      setScanners(prev => prev.filter(s => s.id !== id))
      if (activeScanner?.id === id) { setActive(null); setView('dashboard') }
      toast('Scanner deleted', 'success')
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error')
    }
  }

  async function handleRunScanner(id) {
    const s = scanners.find(x => x.id === id)
    if (s) handleSelectScanner(s)
    try {
      const r = await api.runScanner(id)
      setScanResults(r)
      setView('builder')
      toast(`Scan done — ${r.match_count} matches`, 'success')
    } catch (e) {
      toast('Scan failed: ' + e.message, 'error')
    }
  }

  function handleSaved(s) {
    setScanners(prev => {
      const idx = prev.findIndex(x => x.id === s.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = s; return next }
      return [...prev, s]
    })
    setActive(s)
  }

  function handleSelectChartSymbol(m) {
    setChartSymbol(m)
    setView('chart')
  }

  return (
    <ErrorBoundary>
      <DextDashboard toast={toast} />
      <ToastStack toasts={toasts} />
    </ErrorBoundary>
  )
}

function DextDashboard({ toast }) {
  const [indices, setIndices] = useState([
    { symbol: 'NIFTY 50', ltp: 24333.30, change: -62.55, change_pct: -0.26 },
    { symbol: 'BANKNIFTY', ltp: 57505.35, change: -129.90, change_pct: -0.23 },
    { symbol: 'SENSEX', ltp: 79648.90, change: -210.40, change_pct: -0.26 },
    { symbol: 'NIFTY IT', ltp: 42150.20, change: 185.30, change_pct: 0.44 },
    { symbol: 'NIFTY MIDCAP', ltp: 58210.80, change: 112.60, change_pct: 0.19 },
  ])
  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState('movers')
  const [customScanners, setCustomScanners] = useState([])
  const [selectedScannerId, setSelectedScannerId] = useState(null)
  const [pkOptions, setPkOptions] = useState([])          // all 32 PKScreener scans
  const [selectedPkOptionId, setSelectedPkOptionId] = useState(null)
  const [selectedMoverType, setSelectedMoverType] = useState(null)  // null | 'gainers' | 'losers'
  const [universe, setUniverse] = useState('fno')
  const [timeframe, setTimeframe] = useState('1D')
  const [searchQuery, setSearchQuery] = useState('')
  const [stocks, setStocks] = useState([])
  const [activeSymbol, setActiveSymbol] = useState('APOLLOHOSP')
  const [loading, setLoading] = useState(false)
  const [layoutMode, setLayoutMode] = useState('split')
  const [status, setStatus] = useState('LIVE')
  const [activeView, setActiveView] = useState('screener') // 'screener' | 'backtest'

  useEffect(() => {
    api.getMarketIndices()
      .then(res => { if (res.indices) setIndices(res.indices) })
      .catch(() => {})

    api.getScannerCategories()
      .then(res => { if (res.categories) setCategories(res.categories) })
      .catch(() => {})

    api.listScanners()
      .then(res => {
        if (res.scanners) {
          setCustomScanners(res.scanners)
          if (res.scanners.length > 0) setSelectedScannerId(res.scanners[0].id)
        }
      })
      .catch(() => {})

    // Load all 32 PKScreener scan options
    api.getPkscreenerOptions()
      .then(res => {
        if (res.options && res.options.length > 0) {
          setPkOptions(res.options)
          setSelectedPkOptionId(res.options[0].id)
        }
      })
      .catch(() => {})
  }, [])

  const refreshScanner = useCallback(() => {
    setLoading(true)
    api.runGenericScanner(activeCategory, selectedScannerId, universe, timeframe, 100, selectedPkOptionId, selectedMoverType)
      .then(res => {
        if (res.stocks) {
          setStocks(res.stocks)
          if (res.stocks.length > 0 && !res.stocks.some(s => s.symbol === activeSymbol)) {
            setActiveSymbol(res.stocks[0].symbol)
          }
        }
      })
      .catch(err => {
        if (toast) toast('Failed to run scanner: ' + err.message, 'error')
      })
      .finally(() => setLoading(false))
  }, [activeCategory, selectedScannerId, selectedPkOptionId, selectedMoverType, universe, timeframe, activeSymbol, toast])

  // Auto-run on universe/timeframe change only; category/scanner changes are user-triggered
  useEffect(() => {
    if (stocks.length > 0) refreshScanner()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universe, timeframe])

  const selectedStockMeta = stocks.find(s => s.symbol === activeSymbol) || { symbol: activeSymbol, ltp: 0, change_pct: 0 }

  return (
    <div className="dext-dashboard-container">
      <HeaderTicker
        indices={indices}
        status={status}
        layoutMode={layoutMode}
        onChangeLayout={setLayoutMode}
        onRefresh={refreshScanner}
        loading={loading}
        activeView={activeView}
        onChangeView={setActiveView}
      />
      
      {activeView === 'backtest' ? (
        <BacktestLab />
      ) : (
        <div className={`dext-main-workspace ${layoutMode}`}>
          <ScannerPanel
            categories={categories}
            activeCategory={activeCategory}
            onSelectCategory={setActiveCategory}
            customScanners={customScanners}
            selectedScannerId={selectedScannerId}
            onSelectScannerId={setSelectedScannerId}
            pkOptions={pkOptions}
            selectedPkOptionId={selectedPkOptionId}
            onSelectPkOptionId={setSelectedPkOptionId}
            selectedMoverType={selectedMoverType}
            onSelectMoverType={setSelectedMoverType}
            universe={universe}
            onSelectUniverse={setUniverse}
            timeframe={timeframe}
            onSelectTimeframe={setTimeframe}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            stocks={stocks}
            activeSymbol={activeSymbol}
            onSelectSymbol={setActiveSymbol}
            loading={loading}
            onRunScanner={refreshScanner}
          />
          <ChartPanel
            symbol={activeSymbol}
            stockMeta={selectedStockMeta}
          />
        </div>
      )}
    </div>
  )
}

