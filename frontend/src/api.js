// api.js — All API calls to the FastAPI backend
const BASE = '/api';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Health
  health:           () => request('/health'),

  // Symbols
  listSymbols:      (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/symbols${q ? '?' + q : ''}`);
  },
  syncSymbols:      () => request('/symbols/sync', { method: 'POST' }),

  // Live snapshot
  getLiveSnapshot:  (timeframe = '1D', limit = 200, universe = 'nse500') =>
    request(`/live?timeframe=${timeframe}&limit=${limit}&universe=${universe}`),

  // OHLCV
  getOHLCV:         (symbol, timeframe = '1D', forceRefresh = false) =>
    request(`/ohlcv/${encodeURIComponent(symbol)}?timeframe=${timeframe}&force_refresh=${forceRefresh}`),

  // Indian ADR & LOD Range Extension
  getAdrMetrics:    (symbol) =>
    request(`/adr/${encodeURIComponent(symbol)}`),

  // Scanners
  listScanners:     () => request('/scanners'),
  createScanner:    (body) => request('/scanners', { method: 'POST', body: JSON.stringify(body) }),
  updateScanner:    (id, body) => request(`/scanners/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteScanner:    (id) => request(`/scanners/${id}`, { method: 'DELETE' }),
  runScanner:       (id, timeframe = null, universe = null) => {
    let url = `/scanners/${id}/run`;
    const params = [];
    if (timeframe) params.push(`timeframe=${timeframe}`);
    if (universe) params.push(`universe=${universe}`);
    if (params.length) url += `?${params.join('&')}`;
    return request(url, { method: 'POST' });
  },
  getScanResults:   (id) => request(`/scanners/${id}/results`),
  getScannerHistory: (id, limit = 10) => request(`/scanners/${id}/history?limit=${limit}`),
  getScanRunResults: (runId) => request(`/scan-runs/${runId}/results`),

  // VCP Screener
  getVcpScan:       (universe = 'fno', limit = 100) =>
    request(`/vcp/scan?universe=${universe}&limit=${limit}`),

  // PKScreener
  getPkscreenerOptions: () => request('/pkscreener/options'),
  runPkscreenerScan:    (optionId = 'pk_vcp', universe = 'fno', limit = 100) =>
    request(`/pkscreener/scan?option_id=${encodeURIComponent(optionId)}&universe=${universe}&limit=${limit}`),

  // Indicator metadata
  listIndicators:   () => request('/indicators'),

  // Watchlists
  listWatchlists:      () => request('/watchlists'),
  createWatchlist:     (name) => request('/watchlists', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteWatchlist:     (id) => request(`/watchlists/${id}`, { method: 'DELETE' }),
  getWatchlistItems:   (id) => request(`/watchlists/${id}/items`),
  addToWatchlist:      (watchlistId, symbol, name, sector) =>
    request(`/watchlists/${watchlistId}/items`, {
      method: 'POST',
      body: JSON.stringify({ symbol, name, sector }),
    }),
  // Market Indices Ticker
  getMarketIndices:    () => request('/market/indices'),

  // Generic Multi-Scanner Framework
  getScannerCategories:    () => request('/scanners/categories'),
  getPkscreenerOptions:    () => request('/scanners/pkscreener/options'),
  runGenericScanner:       (categoryId = 'movers', scannerId = null, universe = 'nse500', timeframe = '1D', limit = 100, pkOptionId = null, moverType = null) => {
    let url = `/scanners/run_generic?category_id=${categoryId}&universe=${universe}&timeframe=${timeframe}&limit=${limit}`;
    if (scannerId)  url += `&scanner_id=${scannerId}`;
    if (pkOptionId) url += `&pk_option_id=${encodeURIComponent(pkOptionId)}`;
    if (moverType)  url += `&mover_type=${moverType}`;
    return request(url);
  },

  // Backtest & Quant Lab
  getBacktestStrategies:   () => request('/backtest/strategies'),
  runBacktest:             (body) => request('/backtest/run', { method: 'POST', body: JSON.stringify(body) }),
  getBacktestLeaderboard:  () => request('/backtest/leaderboard'),
  getTearsheetUrl:         (filename) => `/api/backtest/tearsheet/${encodeURIComponent(filename)}`,
};

