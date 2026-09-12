import React, { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts'
import { api } from '../api'
import { Eye, EyeOff, Layers, RefreshCw, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2 } from 'lucide-react'

const CHART_TIMEFRAMES = [
  { label: '1m', value: '1m' },
  { label: '3m', value: '3m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1h', value: '1H' },
  { label: '4h', value: '4H' },
  { label: 'D', value: '1D' },
  { label: 'W', value: '1WK' },
  { label: 'M', value: '1MO' }
]

export function ChartPanel({ symbol, stockMeta, onOpenOptionChain, onOpenTradingDesk }) {
  const chartContainerRef = useRef(null)
  const rsiContainerRef = useRef(null)
  const macdContainerRef = useRef(null)

  const chartRef = useRef(null)
  const rsiChartRef = useRef(null)
  const macdChartRef = useRef(null)

  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const ema20SeriesRef = useRef(null)
  const ema50SeriesRef = useRef(null)

  const rsiSeriesRef = useRef(null)
  const rsi70Ref = useRef(null)
  const rsi30Ref = useRef(null)

  const macdSeriesRef = useRef(null)
  const macdSignalSeriesRef = useRef(null)
  const macdHistSeriesRef = useRef(null)

  const [timeframe, setTimeframe] = useState('1D')
  const [loading, setLoading] = useState(false)
  const [candles, setCandles] = useState([])
  const [indicators, setIndicators] = useState({})
  const [showLevels, setShowLevels] = useState(true)
  const [chartHeight, setChartHeight] = useState(420)
  const [overlays, setOverlays] = useState({
    ema20: true,
    ema50: true,
    rsi: true,
    macd: true,
  })
  const [adrMetrics, setAdrMetrics] = useState(null)
  const [showAdrDetails, setShowAdrDetails] = useState(false)

  // Chart Navigation Helpers
  const handlePanLeft = () => {
    if (!chartRef.current) return
    const range = chartRef.current.timeScale().getVisibleLogicalRange()
    if (range) {
      const shift = Math.max(1, Math.round((range.to - range.from) * 0.25))
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: range.from - shift,
        to: range.to - shift,
      })
    }
  }

  const handlePanRight = () => {
    if (!chartRef.current) return
    const range = chartRef.current.timeScale().getVisibleLogicalRange()
    if (range) {
      const shift = Math.max(1, Math.round((range.to - range.from) * 0.25))
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: range.from + shift,
        to: range.to + shift,
      })
    }
  }

  const handleZoomIn = () => {
    if (!chartRef.current) return
    const range = chartRef.current.timeScale().getVisibleLogicalRange()
    if (range) {
      const delta = Math.max(1, Math.round((range.to - range.from) * 0.15))
      if (range.to - range.from - 2 * delta > 3) {
        chartRef.current.timeScale().setVisibleLogicalRange({
          from: range.from + delta,
          to: range.to - delta,
        })
      }
    }
  }

  const handleZoomOut = () => {
    if (!chartRef.current) return
    const range = chartRef.current.timeScale().getVisibleLogicalRange()
    if (range) {
      const delta = Math.max(1, Math.round((range.to - range.from) * 0.15))
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: range.from - delta,
        to: range.to + delta,
      })
    }
  }

  const handleResetZoom = () => {
    if (!chartRef.current) return
    chartRef.current.timeScale().fitContent()
  }

  const handleIncreaseHeight = () => {
    setChartHeight(h => Math.min(h + 80, 800))
  }

  const handleDecreaseHeight = () => {
    setChartHeight(h => Math.max(h - 80, 260))
  }


  // Create Main Price Chart
  useEffect(() => {
    if (!chartContainerRef.current) return

    const container = chartContainerRef.current
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 400,
      layout: {
        background: { color: '#0e1117' },
        textColor: '#9ea9b7',
        fontFamily: 'Inter, -apple-system, monospace',
      },
      grid: {
        vertLines: { color: '#1c222d' },
        horzLines: { color: '#1c222d' },
      },
      crosshair: {
        mode: 1, // Normal
        vertLine: { color: '#3a4454', labelBackgroundColor: '#1e2634' },
        horzLine: { color: '#3a4454', labelBackgroundColor: '#1e2634' },
      },
      rightPriceScale: {
        borderColor: '#232a36',
        scaleMargins: { top: 0.08, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#232a36',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    // Add Candlestick Series (v5 API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#f23645',
      borderUpColor: '#089981',
      borderDownColor: '#f23645',
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
    })

    // Add Volume Histogram Series (v5 API)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Overlay on main chart with margins
    })

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    })

    // Add EMA 20 Line Series (v5 API)
    const ema20Series = chart.addSeries(LineSeries, {
      color: '#2962ff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'EMA 20',
    })

    // Add EMA 50 Line Series (v5 API)
    const ema50Series = chart.addSeries(LineSeries, {
      color: '#ff9800',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'EMA 50',
    })

    // Synchronize time scales across main chart and sub-charts
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) {
        if (rsiChartRef.current) rsiChartRef.current.timeScale().setVisibleLogicalRange(range)
        if (macdChartRef.current) macdChartRef.current.timeScale().setVisibleLogicalRange(range)
      }
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries
    ema20SeriesRef.current = ema20Series
    ema50SeriesRef.current = ema50Series

    const handleResize = () => {
      if (container && chartRef.current) {
        chartRef.current.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        })
      }
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [])

  // Create RSI Sub-Chart
  useEffect(() => {
    if (!overlays.rsi || !rsiContainerRef.current) return

    const container = rsiContainerRef.current
    const rsiChart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 120,
      layout: {
        background: { color: '#0e1117' },
        textColor: '#9ea9b7',
        fontFamily: 'Inter, -apple-system, monospace',
      },
      grid: {
        vertLines: { color: '#1c222d' },
        horzLines: { color: '#1c222d' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: {
        borderColor: '#232a36',
        minimumWidth: 75,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#232a36',
        visible: false,
      },
    })

    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: '#ab47bc',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'RSI',
    })

    const line70 = rsiChart.addSeries(LineSeries, {
      color: 'rgba(242, 54, 69, 0.4)',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const line30 = rsiChart.addSeries(LineSeries, {
      color: 'rgba(8, 153, 129, 0.4)',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      priceLineVisible: false,
      lastValueVisible: false,
    })

    // Sync sub-chart visible range back to main chart on user scroll/pan inside sub-pane
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && chartRef.current) {
        chartRef.current.timeScale().setVisibleLogicalRange(range)
      }
    })

    rsiChartRef.current = rsiChart
    rsiSeriesRef.current = rsiSeries
    rsi70Ref.current = line70
    rsi30Ref.current = line30

    // Populate data immediately if available
    if (indicators && indicators.RSI) {
      const formattedRSI = prepareLineData(indicators.RSI)
      rsiSeries.setData(formattedRSI)
      if (formattedRSI.length > 0) {
        line70.setData(formattedRSI.map(item => ({ time: item.time, value: 70 })))
        line30.setData(formattedRSI.map(item => ({ time: item.time, value: 30 })))
      }
    }
    if (chartRef.current) {
      const range = chartRef.current.timeScale().getVisibleLogicalRange()
      if (range) rsiChart.timeScale().setVisibleLogicalRange(range)
    }

    const handleResize = () => {
      if (container && rsiChartRef.current) {
        rsiChartRef.current.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        })
      }
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      rsiChart.remove()
      rsiChartRef.current = null
    }
  }, [overlays.rsi])

  // Create MACD Sub-Chart
  useEffect(() => {
    if (!overlays.macd || !macdContainerRef.current) return

    const container = macdContainerRef.current
    const macdChart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 130,
      layout: {
        background: { color: '#0e1117' },
        textColor: '#9ea9b7',
        fontFamily: 'Inter, -apple-system, monospace',
      },
      grid: {
        vertLines: { color: '#1c222d' },
        horzLines: { color: '#1c222d' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: {
        borderColor: '#232a36',
        minimumWidth: 75,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#232a36',
        visible: true,
        timeVisible: true,
        secondsVisible: false,
      },
    })

    const macdSeries = macdChart.addSeries(LineSeries, {
      color: '#2962ff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'MACD',
    })

    const signalSeries = macdChart.addSeries(LineSeries, {
      color: '#ff6d00',
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'Signal',
    })

    const histSeries = macdChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'right',
    })

    // Sync sub-chart visible range back to main chart
    macdChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && chartRef.current) {
        chartRef.current.timeScale().setVisibleLogicalRange(range)
      }
    })

    macdChartRef.current = macdChart
    macdSeriesRef.current = macdSeries
    macdSignalSeriesRef.current = signalSeries
    macdHistSeriesRef.current = histSeries

    // Populate data immediately if available
    if (indicators && indicators.MACD) {
      const macdData = indicators.MACD
      if (macdData.MACD) macdSeries.setData(prepareLineData(macdData.MACD))
      if (macdData.MACD_signal) signalSeries.setData(prepareLineData(macdData.MACD_signal))
      if (macdData.MACD_diff) {
        const formattedHist = prepareLineData(macdData.MACD_diff).map(item => ({
          time: item.time,
          value: item.value,
          color: item.value >= 0 ? 'rgba(8, 153, 129, 0.65)' : 'rgba(242, 54, 69, 0.65)',
        }))
        histSeries.setData(formattedHist)
      }
    }
    if (chartRef.current) {
      const range = chartRef.current.timeScale().getVisibleLogicalRange()
      if (range) macdChart.timeScale().setVisibleLogicalRange(range)
    }

    const handleResize = () => {
      if (container && macdChartRef.current) {
        macdChartRef.current.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        })
      }
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      macdChart.remove()
      macdChartRef.current = null
    }
  }, [overlays.macd])

  // Helper to format indicator data into strictly ordered line series data
  const prepareLineData = (rawList) => {
    if (!Array.isArray(rawList)) return []
    const map = new Map()
    for (const item of rawList) {
      const t = item.timestamp ?? item.time
      const v = Number(item.value)
      if (t !== undefined && t !== null && !isNaN(v)) {
        map.set(t, v)
      }
    }
    const result = Array.from(map.entries()).map(([time, value]) => ({ time, value }))
    result.sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0))
    return result
  }

  // Update Indicator Overlay & Sub-chart Series when indicators or overlays toggle state changes
  useEffect(() => {
    if (!indicators) return

    // ── EMA 20 & EMA 50 ──
    if (ema20SeriesRef.current) {
      const formatted = prepareLineData(indicators.EMA_20)
      ema20SeriesRef.current.setData(overlays.ema20 ? formatted : [])
    }
    if (ema50SeriesRef.current) {
      const formatted = prepareLineData(indicators.EMA_50)
      ema50SeriesRef.current.setData(overlays.ema50 ? formatted : [])
    }

    // ── RSI 14 Sub-chart ──
    if (overlays.rsi && rsiSeriesRef.current) {
      const formattedRSI = prepareLineData(indicators.RSI || [])
      rsiSeriesRef.current.setData(formattedRSI)
      if (formattedRSI.length > 0) {
        const l70 = formattedRSI.map(item => ({ time: item.time, value: 70 }))
        const l30 = formattedRSI.map(item => ({ time: item.time, value: 30 }))
        if (rsi70Ref.current) rsi70Ref.current.setData(l70)
        if (rsi30Ref.current) rsi30Ref.current.setData(l30)
      }
      if (chartRef.current && rsiChartRef.current) {
        const range = chartRef.current.timeScale().getVisibleLogicalRange()
        if (range) rsiChartRef.current.timeScale().setVisibleLogicalRange(range)
      }
    }

    // ── MACD Sub-chart ──
    if (overlays.macd) {
      const macdData = indicators.MACD || {}
      const mLine = prepareLineData(macdData.MACD || [])
      const sLine = prepareLineData(macdData.MACD_signal || [])
      const hLine = prepareLineData(macdData.MACD_diff || []).map(item => ({
        time: item.time,
        value: item.value,
        color: item.value >= 0 ? 'rgba(8, 153, 129, 0.65)' : 'rgba(242, 54, 69, 0.65)',
      }))

      if (macdSeriesRef.current) macdSeriesRef.current.setData(mLine)
      if (macdSignalSeriesRef.current) macdSignalSeriesRef.current.setData(sLine)
      if (macdHistSeriesRef.current) macdHistSeriesRef.current.setData(hLine)

      if (chartRef.current && macdChartRef.current) {
        const range = chartRef.current.timeScale().getVisibleLogicalRange()
        if (range) macdChartRef.current.timeScale().setVisibleLogicalRange(range)
      }
    }
  }, [indicators, overlays])

  // Fetch OHLCV data on symbol/timeframe change
  useEffect(() => {
    if (!symbol) return

    let isMounted = true
    setLoading(true)

    api.getOHLCV(symbol, timeframe)
      .then((data) => {
        if (!isMounted) return
        if (data.candles && data.candles.length > 0) {
          setCandles(data.candles)
          setIndicators(data.indicators || {})

          // Set ADR metrics from response or fallback to standalone endpoint
          if (data.adr_metrics && Object.keys(data.adr_metrics).length > 0) {
            setAdrMetrics(data.adr_metrics)
          } else {
            api.getAdrMetrics(symbol).then(m => { if (isMounted) setAdrMetrics(m) }).catch(() => {})
          }

          // Populate candles
          const formattedCandles = data.candles.map(c => ({
            time: c.timestamp || c.time,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
          }))

          const formattedVolume = data.candles.map(c => ({
            time: c.timestamp || c.time,
            value: Number(c.volume || 0),
            color: Number(c.close) >= Number(c.open) ? 'rgba(8, 153, 129, 0.4)' : 'rgba(242, 54, 69, 0.4)',
          }))

          if (candleSeriesRef.current) {
            candleSeriesRef.current.setData(formattedCandles)
          }

          if (volumeSeriesRef.current) {
            volumeSeriesRef.current.setData(formattedVolume)
          }

          if (chartRef.current) {
            chartRef.current.timeScale().fitContent()
            const range = chartRef.current.timeScale().getVisibleLogicalRange()
            if (range) {
              if (rsiChartRef.current) rsiChartRef.current.timeScale().setVisibleLogicalRange(range)
              if (macdChartRef.current) macdChartRef.current.timeScale().setVisibleLogicalRange(range)
            }
          }

        }
      })
      .catch((err) => {
        console.error('[ChartPanel] Failed to fetch chart OHLCV:', err)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => { isMounted = false }
  }, [symbol, timeframe])

  const toggleOverlay = (key) => {
    setOverlays(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const ltp = stockMeta?.ltp || 0
  const chg = stockMeta?.change_pct || 0
  const isPos = chg >= 0

  return (
    <div className="dext-chart-panel">
      {/* Chart Top Header & Toolbar (2-Row Responsive Layout) */}
      <div className="chart-header-bar">
        {/* Row 1: Symbol Info & Timeframe Selector */}
        <div className="chart-header-row-1">
          <div className="chart-symbol-info">
            <span className="chart-sym">{symbol || 'SELECT SYMBOL'}</span>
            {stockMeta?.name && <span className="chart-name">{stockMeta.name}</span>}
            {ltp > 0 && (
              <div className="chart-price-tag">
                <span className="chart-ltp font-mono">₹{ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                <span className={`chart-chg ${isPos ? 'bullish' : 'bearish'}`}>
                  {isPos ? '+' : ''}{chg.toFixed(2)}%
                </span>
              </div>
            )}
          </div>

          <div className="chart-tf-toolbar">
            {CHART_TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                className={`tf-btn ${timeframe === tf.value ? 'active' : ''}`}
                onClick={() => setTimeframe(tf.value)}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }}>
            <button
              className="tf-btn"
              style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)', background: 'rgba(56, 189, 248, 0.1)', fontWeight: 600 }}
              onClick={() => onOpenOptionChain && onOpenOptionChain(symbol)}
              title="Open Real-time Option Chain & Greeks Ladder"
            >
              ⚡ Chain
            </button>
            <button
              className="tf-btn"
              style={{ color: '#4ade80', borderColor: 'rgba(34, 197, 94, 0.3)', background: 'rgba(34, 197, 94, 0.1)', fontWeight: 600 }}
              onClick={() => onOpenTradingDesk && onOpenTradingDesk({ symbol, ltp: stockMeta?.ltp || 0 })}
              title="Quick Trade in Paper or Live Desk"
            >
              💼 Trade
            </button>
          </div>
        </div>

        {/* Row 2: Indicator Toggles & Nav Controls */}
        <div className="chart-header-row-2">
          <div className="chart-indicator-toggles">
            <button
              className={`ind-toggle-btn ${overlays.ema20 ? 'active' : ''}`}
              onClick={() => toggleOverlay('ema20')}
            >
              EMA 20
            </button>
            <button
              className={`ind-toggle-btn ${overlays.ema50 ? 'active' : ''}`}
              onClick={() => toggleOverlay('ema50')}
            >
              EMA 50
            </button>
            <button
              className={`ind-toggle-btn ${overlays.rsi ? 'active' : ''}`}
              onClick={() => toggleOverlay('rsi')}
            >
              RSI (14)
            </button>
            <button
              className={`ind-toggle-btn ${overlays.macd ? 'active' : ''}`}
              onClick={() => toggleOverlay('macd')}
            >
              MACD
            </button>
            <button
              className={`ind-toggle-btn ${showLevels ? 'active' : ''}`}
              onClick={() => setShowLevels(!showLevels)}
              title="Toggle Strike & Max Pain Levels"
            >
              {showLevels ? <Eye size={12} /> : <EyeOff size={12} />}
              <span>Levels</span>
            </button>
          </div>

          <div className="chart-nav-controls">
            <button className="tf-btn" onClick={handlePanLeft} title="Move Left (◀ Shift Chart Left)">
              <ChevronLeft size={13} />
            </button>
            <button className="tf-btn" onClick={handlePanRight} title="Move Right (▶ Shift Chart Right)">
              <ChevronRight size={13} />
            </button>
            <button className="tf-btn" onClick={handleZoomIn} title="Zoom In (Expand Bars)">
              <ZoomIn size={13} />
            </button>
            <button className="tf-btn" onClick={handleZoomOut} title="Zoom Out (Contract Bars)">
              <ZoomOut size={13} />
            </button>
            <button className="tf-btn" onClick={handleResetZoom} title="Reset View / Fit Content">
              <RotateCcw size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Indian Market ADR & Intraday Extension Gauge Toolbar ── */}
      {adrMetrics && (
        <div className="adr-extension-bar">
          <div className="adr-stat-item">
            <span className="adr-stat-label">LOD Run</span>
            <span className={`adr-stat-val font-mono ${adrMetrics.pct_from_lod > 5 ? 'text-bearish' : adrMetrics.pct_from_lod > 2.5 ? 'text-amber' : 'text-bullish'}`}>
              +{adrMetrics.pct_from_lod}%
            </span>
            <span className="adr-stat-sub">from ₹{adrMetrics.lod} LOD</span>
          </div>

          <div className="adr-stat-divider" />

          <div className="adr-stat-item">
            <span className="adr-stat-label">14D ADR</span>
            <span className="adr-stat-val font-mono text-cyan">₹{adrMetrics.adr_14}</span>
            <span className="adr-stat-sub">{adrMetrics.adr_pct}% ADR</span>
          </div>

          <div className="adr-stat-divider" />

          <div className="adr-stat-item adr-meter-stat">
            <div className="adr-stat-meter-header">
              <span className="adr-stat-label">ADR % from LOD</span>
              <span className={`adr-pct-badge font-mono ${adrMetrics.status}`}>
                {adrMetrics.adr_pct_from_lod}%
              </span>
            </div>
            <div className="adr-meter-track" title={`${adrMetrics.adr_pct_from_lod}% of 14-day ADR consumed`}>
              <div
                className={`adr-meter-fill ${adrMetrics.status}`}
                style={{ width: `${Math.min(adrMetrics.adr_pct_from_lod, 100)}%` }}
              />
            </div>
          </div>

          <div className="adr-stat-divider" />

          <div className="adr-stat-item">
            <span className="adr-stat-label">Previous Day Range</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="adr-stat-val font-mono">₹{adrMetrics.prev_range}</span>
              {adrMetrics.prev_range_lt_adr ? (
                <span className="badge-tight" title={`Yesterday's range (₹${adrMetrics.prev_range}) < 14D ADR (₹${adrMetrics.adr_14}) — Volatility Contraction`}>
                  ✓ Tight &lt; ADR
                </span>
              ) : (
                <span className="badge-wide" title={`Yesterday's range (₹${adrMetrics.prev_range}) >= 14D ADR (₹${adrMetrics.adr_14}) — Wide Day`}>
                  ⚠ Wide ≥ ADR
                </span>
              )}
            </div>
            <span className="adr-stat-sub">{adrMetrics.prev_range_pct_of_adr}% of ADR</span>
          </div>

          <div className="adr-stat-divider" />

          <div className="adr-stat-item adr-insight-col">
            <button
              className="adr-insight-toggle-btn"
              onClick={() => setShowAdrDetails(v => !v)}
              title="Click to toggle Indian Market Risk Interpretation"
            >
              <span className={`adr-status-pill ${adrMetrics.status}`}>{adrMetrics.status_label}</span>
              <span className="adr-info-icon">ℹ️</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Expandable Actionable Indian Market Context Panel ── */}
      {adrMetrics && showAdrDetails && (
        <div className={`adr-insight-callout ${adrMetrics.status}`}>
          <div className="adr-callout-header">
            <span className="adr-callout-title">🇮🇳 Indian Market Context & Risk Assessment:</span>
            <button className="adr-callout-close" onClick={() => setShowAdrDetails(false)}>✕</button>
          </div>
          <p className="adr-callout-text">{adrMetrics.actionable_insight}</p>
          <div className="adr-callout-footer">
            <span>• Circuit Bands: Mid/small-caps have 5%/10%/20% price limits that cap extreme expansion.</span>
            <span>• Rule of Thumb: Entries after &gt;70% ADR consumption carry poor rupee R:R to LOD stops.</span>
          </div>
        </div>
      )}

      {/* Floating Level Markers */}
      {showLevels && stockMeta?.support && (
        <div className="floating-levels-banner">
          <span className="level-badge resistance">Resistance strike: ₹{stockMeta.resistance}</span>
          <span className="level-badge max-pain">Max Pain: ₹{stockMeta.max_pain}</span>
          <span className="level-badge support">Support strike: ₹{stockMeta.support}</span>
        </div>
      )}

      {/* Chart Canvas & Sub-Panes (Flex Proportional Allocation) */}
      <div className="chart-canvas-wrapper" style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', overflow: 'hidden' }}>
        {/* Main Price & Volume Chart (Fills remaining height) */}
        <div style={{ flex: 1, minHeight: '160px', position: 'relative', width: '100%' }}>
          {loading && (
            <div className="chart-loader">
              <RefreshCw size={24} className="spin" />
              <span>Loading {symbol} OHLCV...</span>
            </div>
          )}
          <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
        </div>

        {/* RSI Sub-chart Pane */}
        {overlays.rsi && (
          <div style={{ height: '105px', minHeight: '90px', width: '100%', flexShrink: 0, position: 'relative', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ position: 'absolute', top: 3, left: 8, zIndex: 10, fontSize: 10.5, fontWeight: 600, color: '#ab47bc', pointerEvents: 'none' }}>
              RSI (14)
            </div>
            <div ref={rsiContainerRef} style={{ width: '100%', height: '100%' }} />
          </div>
        )}

        {/* MACD Sub-chart Pane */}
        {overlays.macd && (
          <div style={{ height: '115px', minHeight: '100px', width: '100%', flexShrink: 0, position: 'relative', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ position: 'absolute', top: 3, left: 8, zIndex: 10, fontSize: 10.5, fontWeight: 600, color: '#2962ff', pointerEvents: 'none' }}>
              MACD (12, 26, 9)
            </div>
            <div ref={macdContainerRef} style={{ width: '100%', height: '100%' }} />
          </div>
        )}
      </div>
    </div>
  )
}

