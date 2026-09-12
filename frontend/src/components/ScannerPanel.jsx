import React, { useState, useMemo } from 'react'
import { Search, Play, RefreshCw, ChevronDown, Zap, Filter, TrendingUp, Activity, RotateCcw, BarChart2, ChevronUp, ChevronsUpDown, Compass } from 'lucide-react'

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <ChevronsUpDown size={11} style={{ opacity: 0.35, marginLeft: 3, flexShrink: 0 }} />
  return sortDir === 'desc'
    ? <ChevronDown size={11} style={{ color: '#2962ff', marginLeft: 3, flexShrink: 0 }} />
    : <ChevronUp   size={11} style={{ color: '#2962ff', marginLeft: 3, flexShrink: 0 }} />
}

const UNIVERSES = [
  { id: 'fno',      label: 'F&O',       emoji: '⚡' },
  { id: 'nse500',   label: 'NSE 500',   emoji: '🌐' },
  { id: 'largecap', label: 'Large Cap', emoji: '🐘' },
  { id: 'midcap',   label: 'Mid Cap',   emoji: '🐂' },
  { id: 'smallcap', label: 'Small Cap', emoji: '🐆' },
]

const TIMEFRAMES = ['5m', '15m', '30m', '1H', '4H', '1D', '1WK']

const CATEGORY_ICONS = {
  movers:    { icon: Zap,         color: '#ffb800' },
  custom:    { icon: Filter,      color: '#2962ff' },
  pkscreener:{ icon: TrendingUp,  color: '#089981' },
  vcp:       { icon: Activity,    color: '#a855f7' },
  rrg:       { icon: RotateCcw,   color: '#06b6d4' },
  options:   { icon: BarChart2,   color: '#f23645' },
  adr_expansion: { icon: Compass, color: '#10b981' },
}

function formatVolume(vol) {
  if (!vol) return '-'
  if (vol >= 10000000) return `${(vol / 10000000).toFixed(2)} Cr`
  if (vol >= 100000)   return `${(vol / 100000).toFixed(2)} L`
  if (vol >= 1000)     return `${(vol / 1000).toFixed(1)} K`
  return vol.toString()
}

export function ScannerPanel({
  categories,
  activeCategory,
  onSelectCategory,
  customScanners,
  selectedScannerId,
  onSelectScannerId,
  pkOptions,
  selectedPkOptionId,
  onSelectPkOptionId,
  selectedMoverType,
  onSelectMoverType,
  universe,
  onSelectUniverse,
  timeframe,
  onSelectTimeframe,
  searchQuery,
  onSearchChange,
  stocks,
  activeSymbol,
  onSelectSymbol,
  loading,
  onRunScanner,
}) {
  const [scannerDropdownOpen, setScannerDropdownOpen] = useState(false)
  const [sortKey, setSortKey] = useState(null)   // 'ltp' | 'change_pct' | 'volume' | 'rsi'
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'

  function handleSort(col) {
    if (sortKey === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(col)
      setSortDir('desc')
    }
  }

  // Build a flat list of all scanner options for the dropdown
  // Group PKScreener options by their category
  const pkByCategory = useMemo(() => {
    const groups = {}
    ;(pkOptions || []).forEach(opt => {
      const cat = opt.category || 'Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(opt)
    })
    return groups
  }, [pkOptions])

  // Currently selected scanner label
  const currentLabel = useMemo(() => {
    if (activeCategory === 'movers') {
      if (selectedMoverType === 'gainers') return '🟢 Top Gainers'
      if (selectedMoverType === 'losers')  return '🔴 Top Losers'
      return '⚡ Live Movers (All)'
    }
    if (activeCategory === 'pkscreener' && selectedPkOptionId && pkOptions?.length > 0) {
      const found = pkOptions.find(o => o.id === selectedPkOptionId)
      return found ? `📈 ${found.name}` : '📈 PKScreener'
    }
    if (activeCategory === 'custom' && selectedScannerId && customScanners.length > 0) {
      const found = customScanners.find(c => c.id === selectedScannerId)
      return found ? `🔧 ${found.name}` : '🔧 Custom Scanner'
    }
    const MAP = {
      vcp:     '🔺 VCP Patterns — Minervini Contraction',
      rrg:     '🔄 RRG Rotation — Relative Strength',
      options: '⚖️ Options & Key Levels',
      adr_expansion: '🎯 ADR Expansion — LOD Runs & Volatility',
    }
    return MAP[activeCategory] || '— Select Scanner —'
  }, [activeCategory, selectedMoverType, selectedScannerId, selectedPkOptionId, pkOptions, customScanners])

  function handleSelectOption(opt) {
    onSelectCategory(opt.category_id)
    // Reset mover type each time unless this is a movers selection
    if (opt.category_id !== 'movers') {
      onSelectMoverType(null)
    }
    if (opt.mover_type !== undefined) {
      onSelectMoverType(opt.mover_type)
    }
    if (opt.category_id === 'custom' && opt.scanner_id != null) {
      onSelectScannerId(opt.scanner_id)
    }
    if (opt.category_id === 'pkscreener' && opt.pk_id != null) {
      onSelectPkOptionId(opt.pk_id)
    }
    setScannerDropdownOpen(false)
  }

  const filteredStocks = useMemo(() => {
    let rows = stocks.filter(s => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (
        (s.symbol && s.symbol.toLowerCase().includes(q)) ||
        (s.name   && s.name.toLowerCase().includes(q))   ||
        (s.signal && s.signal.toLowerCase().includes(q))
      )
    })
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortKey] ?? (sortKey === 'change_pct' ? 0 : -Infinity)
        const bv = b[sortKey] ?? (sortKey === 'change_pct' ? 0 : -Infinity)
        return sortDir === 'desc' ? bv - av : av - bv
      })
    }
    return rows
  }, [stocks, searchQuery, sortKey, sortDir])

  const activeIcon = CATEGORY_ICONS[activeCategory] || CATEGORY_ICONS.movers
  const ActiveIconComp = activeIcon.icon

  return (
    <div className="dext-scanner-panel">

      {/* ── Scanner Selector Row ── */}
      <div className="scanner-selector-bar">
        <div className="scanner-selector-label">Scanner</div>

        <div className="scanner-dropdown-wrapper">
          <button
            className={`scanner-dropdown-btn ${scannerDropdownOpen ? 'open' : ''}`}
            onClick={() => setScannerDropdownOpen(v => !v)}
          >
            <ActiveIconComp size={14} style={{ color: activeIcon.color, flexShrink: 0 }} />
            <span className="scanner-dropdown-current">{currentLabel}</span>
            <ChevronDown size={13} className={`dropdown-chevron ${scannerDropdownOpen ? 'rotated' : ''}`} />
          </button>

          {scannerDropdownOpen && (
            <div className="scanner-dropdown-list">

              {/* ── Live Movers Group ── */}
              <div className="dropdown-group-header">⚡ Live Movers</div>
              {[
                { category_id: 'movers', mover_type: null,      label: '⚡ All Movers (by Vol)',   color: '#ffb800' },
                { category_id: 'movers', mover_type: 'gainers', label: '🟢 Top Gainers',           color: '#089981' },
                { category_id: 'movers', mover_type: 'losers',  label: '🔴 Top Losers',            color: '#f23645' },
              ].map((opt, i) => {
                const isSel = activeCategory === 'movers' && selectedMoverType === opt.mover_type
                return (
                  <button key={i} className={`scanner-option-row ${isSel ? 'selected' : ''}`}
                    onClick={() => handleSelectOption(opt)}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                    <span>{opt.label}</span>
                    {isSel && <span className="option-check">✓</span>}
                  </button>
                )
              })}

              {/* ── PKScreener Group ── */}
              {Object.entries(pkByCategory).map(([catName, opts]) => (
                <div key={catName}>
                  <div className="dropdown-group-header">📈 {catName}</div>
                  {opts.map(opt => {
                    const isSel = activeCategory === 'pkscreener' && selectedPkOptionId === opt.id
                    return (
                      <button key={opt.id}
                        className={`scanner-option-row ${isSel ? 'selected' : ''}`}
                        onClick={() => handleSelectOption({ category_id: 'pkscreener', pk_id: opt.id })}>
                        <TrendingUp size={12} style={{ color: '#089981', flexShrink: 0 }} />
                        <span>{opt.name}</span>
                        {isSel && <span className="option-check">✓</span>}
                      </button>
                    )
                  })}
                </div>
              ))}

              {/* ── Custom Rule Scanners ── */}
              {customScanners.length > 0 && (
                <div>
                  <div className="dropdown-group-header">🔧 Custom Rule Scanners</div>
                  {customScanners.map(cs => {
                    const isSel = activeCategory === 'custom' && selectedScannerId === cs.id
                    return (
                      <button key={cs.id}
                        className={`scanner-option-row ${isSel ? 'selected' : ''}`}
                        onClick={() => handleSelectOption({ category_id: 'custom', scanner_id: cs.id })}>
                        <Filter size={12} style={{ color: '#2962ff', flexShrink: 0 }} />
                        <span>{cs.name}</span>
                        {isSel && <span className="option-check">✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* ── Other Built-ins ── */}
              <div className="dropdown-group-header">📊 Pattern & Volatility</div>
              {[
                { category_id: 'adr_expansion', label: '🎯 ADR Expansion — LOD Runs', icon: Compass,   color: '#10b981' },
                { category_id: 'vcp',     label: '🔺 VCP — Minervini Contraction',  icon: Activity,   color: '#a855f7' },
                { category_id: 'rrg',     label: '🔄 RRG Rotation — Rel. Strength', icon: RotateCcw,  color: '#06b6d4' },
                { category_id: 'options', label: '⚖️ Options & Key Levels',          icon: BarChart2,  color: '#f23645' },
              ].map((opt, i) => {
                const IconComp = opt.icon
                const isSel = activeCategory === opt.category_id
                return (
                  <button key={i} className={`scanner-option-row ${isSel ? 'selected' : ''}`}
                    onClick={() => handleSelectOption(opt)}>
                    <IconComp size={12} style={{ color: opt.color, flexShrink: 0 }} />
                    <span>{opt.label}</span>
                    {isSel && <span className="option-check">✓</span>}
                  </button>
                )
              })}

            </div>
          )}
        </div>

        <button
          className={`run-scanner-btn ${loading ? 'running' : ''}`}
          onClick={onRunScanner}
          disabled={loading}
          title="Run selected scanner"
        >
          {loading
            ? <><RefreshCw size={13} className="spin" /> Running...</>
            : <><Play size={13} /> Run Scanner</>
          }
        </button>
      </div>

      {/* ── Universe + Timeframe + Search ── */}
      <div className="scanner-filter-bar">
        <div className="universe-pills">
          {UNIVERSES.map(u => (
            <button
              key={u.id}
              className={`universe-pill ${universe === u.id ? 'active' : ''}`}
              onClick={() => onSelectUniverse(u.id)}
            >
              {u.emoji} {u.label}
            </button>
          ))}
        </div>

        <div className="search-tf-group">
          <div className="search-input-wrapper">
            <Search size={12} className="search-icon" />
            <input
              type="text"
              placeholder="Search symbol..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="dext-input"
            />
          </div>

          <select
            value={timeframe}
            onChange={e => onSelectTimeframe(e.target.value)}
            className="dext-select tf-select"
          >
            {TIMEFRAMES.map(tf => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Results Count Banner ── */}
      {!loading && stocks.length > 0 && (
        <div className="results-banner">
          <span className="results-count-badge">{filteredStocks.length}</span>
          <span>stocks matched · <span className="text-muted">{currentLabel}</span></span>
        </div>
      )}

      {/* ── Stock Table ── */}
      <div className="table-responsive">
        <table className="dext-table">
          <thead>
            <tr>
              <th className="th-num">#</th>
              <th>Symbol</th>
              <th className="th-sortable text-right" onClick={() => handleSort('ltp')}>
                <span>LTP (₹)</span><SortIcon col="ltp" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className="th-sortable text-right" onClick={() => handleSort('change_pct')}>
                <span>Chg %</span><SortIcon col="change_pct" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className="th-sortable text-right" onClick={() => handleSort('pct_from_lod')} title="% Change from Low of Day (LOD)">
                <span>% From Low</span><SortIcon col="pct_from_lod" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className="th-sortable text-right" onClick={() => handleSort('adr_pct_from_lod')} title="% of 14-day Average Daily Range consumed from LOD">
                <span>ADR Used</span><SortIcon col="adr_pct_from_lod" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className="th-sortable text-right" onClick={() => handleSort('volume')}>
                <span>Volume</span><SortIcon col="volume" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th>Signal</th>
              <th className="th-sortable text-right" onClick={() => handleSort('rsi')}>
                <span>RSI</span><SortIcon col="rsi" sortKey={sortKey} sortDir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: '40px 0', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <RefreshCw size={22} style={{ color: '#2962ff', animation: 'spin 1s linear infinite' }} />
                    <span style={{ color: '#8b949e', fontSize: 12 }}>Running scanner, fetching live data...</span>
                  </div>
                </td>
              </tr>
            ) : filteredStocks.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '40px 0', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 28 }}>📭</span>
                    <span style={{ color: '#8b949e', fontSize: 12 }}>
                      {stocks.length === 0
                        ? 'Press "Run Scanner" to fetch results'
                        : 'No stocks match your search criteria'}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (() => {
              // ── Group rows by signal category ──
              const GROUP_ORDER = ['ADR Expansion', 'Bullish', 'Gainers', 'Bearish', 'Losers', 'Momentum', 'Custom', 'Pattern', 'Other']
              const GROUP_META = {
                'ADR Expansion': { label: '🎯 ADR Range Expansion', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
                'Bullish':  { label: '🟢 Bullish',          color: '#089981', bg: 'rgba(8,153,129,0.08)'  },
                'Gainers':  { label: '🟢 Top Gainers',       color: '#089981', bg: 'rgba(8,153,129,0.08)'  },
                'Bearish':  { label: '🔴 Bearish',           color: '#f23645', bg: 'rgba(242,54,69,0.08)'  },
                'Losers':   { label: '🔴 Top Losers',        color: '#f23645', bg: 'rgba(242,54,69,0.08)'  },
                'Momentum': { label: '⚡ Momentum',          color: '#ffb800', bg: 'rgba(255,184,0,0.08)'  },
                'Custom':   { label: '🔧 Custom Rule Match', color: '#2962ff', bg: 'rgba(41,98,255,0.08)'  },
                'Pattern':  { label: '🔺 Pattern / VCP',     color: '#a855f7', bg: 'rgba(168,85,247,0.08)' },
                'Other':    { label: '📊 Other',             color: '#8b949e', bg: 'rgba(139,148,158,0.06)'},
              }

              function getGroup(sig) {
                if (!sig) return 'Other'
                const s = sig.toLowerCase()
                if (s.includes('adr') || s.includes('expansion') || s.includes('lod')) return 'ADR Expansion'
                if (s.includes('▲') || s.includes('top gainer') || s.includes('gainers')) return 'Gainers'
                if (s.includes('▼') || s.includes('top loser')  || s.includes('losers'))  return 'Losers'
                if (s.includes('bullish') || s.includes('golden cross') || s.includes('breakout') || s.includes('bounce')) return 'Bullish'
                if (s.includes('bearish') || s.includes('death cross') || s.includes('breakdown') || s.includes('overbought')) return 'Bearish'
                if (s.includes('momentum') || s.includes('surge') || s.includes('volume') || s.includes('rrg') || s.includes('quadrant')) return 'Momentum'
                if (s.includes('rule match') || s.includes('custom') || s.includes('scanner')) return 'Custom'
                if (s.includes('vcp') || s.includes('pattern') || s.includes('contraction') || s.includes('inside bar')) return 'Pattern'
                return 'Other'
              }

              const groups = {}
              filteredStocks.forEach((stock, idx) => {
                const g = getGroup(stock.signal)
                if (!groups[g]) groups[g] = []
                groups[g].push({ stock, idx })
              })

              let counter = 0
              return GROUP_ORDER.filter(g => groups[g]?.length > 0).flatMap(g => {
                const meta = GROUP_META[g]
                const rows = groups[g]
                return [
                  // ── Section divider row ──
                  <tr key={`grp-${g}`} className="signal-group-row">
                    <td colSpan={9} style={{ background: meta.bg, borderLeft: `3px solid ${meta.color}`, padding: '6px 12px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: meta.color, fontWeight: 700, fontSize: 11, letterSpacing: '0.4px' }}>{meta.label}</span>
                        <span style={{ color: '#64748b', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 4 }}>
                          {rows.length} stock{rows.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </td>
                  </tr>,

                  // ── Stocks in this group ──
                  ...rows.map(({ stock }) => {
                    counter++
                    const isSelected = activeSymbol === stock.symbol
                    const isPos = stock.change_pct >= 0
                    return (
                      <tr
                        key={stock.symbol}
                        className={`dext-row ${isSelected ? 'selected' : ''}`}
                        onClick={() => onSelectSymbol(stock.symbol)}
                      >
                        <td className="row-num">{counter}</td>
                        <td className="symbol-cell">
                          <div className="sym-wrapper">
                            <span className="sym-name">{stock.symbol}</span>
                            <span className="sym-desc">{stock.name}</span>
                          </div>
                        </td>
                        <td className="text-right font-mono ltp-cell">
                          {stock.ltp > 0
                            ? stock.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })
                            : '-'}
                        </td>
                        <td className="text-right font-mono">
                          <span className={`chg-badge ${isPos ? 'bullish' : 'bearish'}`}>
                            {isPos ? '+' : ''}{(stock.change_pct || 0).toFixed(2)}%
                          </span>
                        </td>
                        <td className="text-right font-mono" style={{ fontSize: 11 }}>
                          {stock.pct_from_lod != null && stock.pct_from_lod > 0 ? (
                            <span style={{ color: stock.pct_from_lod > 5 ? '#f23645' : stock.pct_from_lod > 2.5 ? '#ffb800' : '#089981', fontWeight: 600 }}>
                              +{stock.pct_from_lod.toFixed(2)}%
                            </span>
                          ) : (
                            <span style={{ color: '#64748b' }}>-</span>
                          )}
                        </td>
                        <td className="text-right font-mono" style={{ fontSize: 11 }}>
                          {stock.adr_pct_from_lod != null && stock.adr_pct_from_lod > 0 ? (
                            <span className={`adr-used-pill ${stock.adr_pct_from_lod > 70 ? 'pill-extended' : stock.adr_pct_from_lod >= 40 ? 'pill-active' : 'pill-early'}`}
                              title={`${stock.adr_pct_from_lod}% of 14D ADR (${stock.adr_14 ? '₹' + stock.adr_14 : ''}) used from LOD`}>
                              {stock.adr_pct_from_lod.toFixed(0)}%
                            </span>
                          ) : (
                            <span style={{ color: '#64748b' }}>-</span>
                          )}
                        </td>
                        <td className="text-right font-mono vol-cell">
                          {formatVolume(stock.volume)}
                        </td>
                        <td>
                          <span className="signal-pill">{stock.signal || 'Live'}</span>
                        </td>
                        <td className="text-right font-mono rsi-cell">
                          <span className={`rsi-badge ${stock.rsi >= 60 ? 'rsi-high' : stock.rsi <= 40 ? 'rsi-low' : ''}`}>
                            {stock.rsi ? stock.rsi.toFixed(1) : '-'}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                ]
              })
            })()
}
          </tbody>
        </table>
      </div>

      <div className="panel-footer">
        <span>
          {loading ? 'Loading...' : `${filteredStocks.length} of ${stocks.length} stocks`}
        </span>
        <span className="text-muted font-mono">{timeframe} · {universe.toUpperCase()}</span>
      </div>
    </div>
  )
}
