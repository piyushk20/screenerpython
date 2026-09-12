import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function TradingDeskModal({ onClose, tradePreFill }) {
  const [balance, setBalance] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('positions'); // 'positions', 'orders', 'settings'
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  // Order Form State
  const [symbol, setSymbol] = useState(tradePreFill?.symbol || 'RELIANCE');
  const [side, setSide] = useState(tradePreFill?.side || 'BUY');
  const [orderType, setOrderType] = useState('MARKET');
  const [quantity, setQuantity] = useState(tradePreFill?.lotSize || 10);
  const [price, setPrice] = useState(tradePreFill?.ltp || '');

  // Broker Credentials
  const [brokerSettings, setBrokerSettings] = useState({
    execution_mode: 'PAPER',
    dhan_client_id: '',
    dhan_access_token: '',
  });

  useEffect(() => {
    loadDeskData();
  }, []);

  async function loadDeskData() {
    setLoading(true);
    try {
      const [balRes, posRes, ordRes, setRes] = await Promise.all([
        api.getBrokerBalance().catch(() => null),
        api.getBrokerPositions().catch(() => ({ positions: [] })),
        api.getBrokerOrders().catch(() => ({ orders: [] })),
        api.getBrokerSettings().catch(() => null)
      ]);
      setBalance(balRes);
      setPositions(posRes?.positions || []);
      setOrders(ordRes?.orders || []);
      if (setRes) {
        setBrokerSettings(setRes);
      }
    } catch (err) {
      setActionMsg(`Failed to load desk: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleOrderSubmit(e) {
    e.preventDefault();
    setActionMsg('Sending order to execution engine...');
    try {
      const res = await api.placeBrokerOrder({
        symbol: symbol.toUpperCase(),
        side: side.toUpperCase(),
        order_type: orderType,
        quantity: parseInt(quantity, 10) || 1,
        price: parseFloat(price) || 0.0
      });
      if (res.status === 'FILLED' || res.status === 'SUCCESS') {
        setActionMsg(`✅ ${res.message || 'Order executed successfully!'}`);
        loadDeskData();
      } else {
        setActionMsg(`❌ Order rejected: ${res.error || res.message}`);
      }
    } catch (err) {
      setActionMsg(`❌ Execution failed: ${err.message}`);
    }
  }

  async function handleSquareOffAll() {
    if (!window.confirm('Are you sure you want to square off ALL open positions?')) return;
    try {
      const res = await api.squareOffAll();
      setActionMsg(`✅ Squared off ${res.closed?.length || 0} positions.`);
      loadDeskData();
    } catch (err) {
      setActionMsg(`❌ Square off error: ${err.message}`);
    }
  }

  async function handleSaveBrokerSettings(e) {
    e.preventDefault();
    try {
      await api.updateBrokerSettings(brokerSettings);
      setActionMsg('✅ Broker settings updated.');
      loadDeskData();
    } catch (err) {
      setActionMsg(`❌ Failed: ${err.message}`);
    }
  }

  const isLive = brokerSettings.execution_mode === 'DHAN';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card trading-desk-modal" onClick={e => e.stopPropagation()}>
        {/* Desk Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>💼</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                Trading Desk & Execution Terminal
              </h2>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Active Mode:{' '}
                <span className={`badge-mode ${isLive ? 'mode-live' : 'mode-paper'}`}>
                  {isLive ? '🔴 DHAN LIVE' : '🟢 PAPER TRADING (SIMULATED)'}
                </span>
              </div>
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        {/* Balance & Margin Cards */}
        {balance && (
          <div className="desk-balance-grid">
            <div className="desk-stat-card">
              <span className="stat-label">Available Cash</span>
              <span className="stat-value" style={{ color: 'var(--text-primary)' }}>
                ₹{balance.available_cash?.toLocaleString()}
              </span>
            </div>
            <div className="desk-stat-card">
              <span className="stat-label">Utilized Margin</span>
              <span className="stat-value text-warning">
                ₹{balance.margin_used?.toLocaleString() || 0}
              </span>
            </div>
            <div className="desk-stat-card">
              <span className="stat-label">Unrealized MTM</span>
              <span className={`stat-value ${balance.unrealized_pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                {balance.unrealized_pnl >= 0 ? '+' : ''}₹{balance.unrealized_pnl?.toLocaleString() || 0}
              </span>
            </div>
            <div className="desk-stat-card">
              <span className="stat-label">Realized P&L</span>
              <span className={`stat-value ${balance.realized_pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                {balance.realized_pnl >= 0 ? '+' : ''}₹{balance.realized_pnl?.toLocaleString() || 0}
              </span>
            </div>
          </div>
        )}

        {actionMsg && (
          <div className="modal-alert-banner">
            {actionMsg}
          </div>
        )}

        {/* Order Entry Form */}
        <form className="desk-order-panel" onSubmit={handleOrderSubmit}>
          <div className="order-form-row">
            <div>
              <label className="field-label">Symbol</label>
              <input
                type="text"
                className="modal-input"
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                required
              />
            </div>

            <div>
              <label className="field-label">Side</label>
              <div className="side-toggle-group">
                <button
                  type="button"
                  className={`btn-side ${side === 'BUY' ? 'active-buy' : ''}`}
                  onClick={() => setSide('BUY')}
                >
                  BUY
                </button>
                <button
                  type="button"
                  className={`btn-side ${side === 'SELL' ? 'active-sell' : ''}`}
                  onClick={() => setSide('SELL')}
                >
                  SELL
                </button>
              </div>
            </div>

            <div>
              <label className="field-label">Order Type</label>
              <select
                className="modal-select"
                value={orderType}
                onChange={e => setOrderType(e.target.value)}
              >
                <option value="MARKET">MARKET</option>
                <option value="LIMIT">LIMIT</option>
                <option value="SL">STOP LOSS (SL)</option>
              </select>
            </div>

            <div>
              <label className="field-label">Quantity</label>
              <input
                type="number"
                min="1"
                className="modal-input"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="field-label">Price (₹)</label>
              <input
                type="number"
                step="0.05"
                className="modal-input"
                placeholder={orderType === 'MARKET' ? 'Market Price' : '0.00'}
                value={price}
                onChange={e => setPrice(e.target.value)}
                disabled={orderType === 'MARKET'}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="submit"
                className={`btn-submit-order ${side === 'BUY' ? 'btn-order-buy' : 'btn-order-sell'}`}
              >
                {side} {symbol}
              </button>
            </div>
          </div>
        </form>

        {/* Tab Navigation */}
        <div className="modal-tabs" style={{ marginTop: '16px' }}>
          <button
            className={`modal-tab-btn ${activeTab === 'positions' ? 'active' : ''}`}
            onClick={() => setActiveTab('positions')}
          >
            Open Positions ({positions.length})
          </button>
          <button
            className={`modal-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            Order Book ({orders.length})
          </button>
          <button
            className={`modal-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Broker Config (Dhan HQ)
          </button>

          {positions.length > 0 && (
            <button className="btn-square-off-all" onClick={handleSquareOffAll} style={{ marginLeft: 'auto' }}>
              ⚠️ Square Off All
            </button>
          )}
        </div>

        {/* Tab 1: Positions */}
        {activeTab === 'positions' && (
          <div className="modal-body-scroll">
            {positions.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No open positions. Place an order above to begin trading.
              </div>
            ) : (
              <table className="alerts-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Net Qty</th>
                    <th>Avg Price</th>
                    <th>LTP</th>
                    <th>Unrealized P&L</th>
                    <th>Return %</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(p => (
                    <tr key={p.symbol}>
                      <td><strong style={{ color: 'var(--accent-primary)' }}>{p.symbol}</strong></td>
                      <td className={p.quantity >= 0 ? 'text-success' : 'text-danger'}>
                        {p.quantity > 0 ? `+${p.quantity}` : p.quantity}
                      </td>
                      <td>₹{p.avg_price}</td>
                      <td>₹{p.current_price}</td>
                      <td className={p.unrealized_pnl >= 0 ? 'text-success' : 'text-danger'} style={{ fontWeight: 600 }}>
                        {p.unrealized_pnl >= 0 ? '+' : ''}₹{p.unrealized_pnl}
                      </td>
                      <td className={p.pnl_pct >= 0 ? 'text-success' : 'text-danger'}>
                        {p.pnl_pct >= 0 ? '+' : ''}{p.pnl_pct}%
                      </td>
                      <td>
                        <button
                          className="btn-mini-trade sell"
                          onClick={() => {
                            const closeSide = p.quantity > 0 ? 'SELL' : 'BUY';
                            api.placeBrokerOrder({
                              symbol: p.symbol,
                              side: closeSide,
                              order_type: 'MARKET',
                              quantity: Math.abs(p.quantity),
                              price: p.current_price
                            }).then(() => loadDeskData());
                          }}
                        >
                          Exit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Orders */}
        {activeTab === 'orders' && (
          <div className="modal-body-scroll">
            <table className="alerts-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No executed orders found.
                    </td>
                  </tr>
                ) : (
                  orders.map(o => (
                    <tr key={o.order_id}>
                      <td style={{ fontSize: '12px', fontFamily: 'monospace' }}>{o.order_id}</td>
                      <td style={{ fontSize: '12px' }}>{new Date(o.created_at).toLocaleTimeString()}</td>
                      <td><strong>{o.symbol}</strong></td>
                      <td>
                        <span className={`badge-status ${o.side === 'BUY' ? 'active' : 'paused'}`}>
                          {o.side}
                        </span>
                      </td>
                      <td>{o.order_type}</td>
                      <td>{o.quantity}</td>
                      <td>₹{o.price}</td>
                      <td>
                        <span className="badge-alert-type">{o.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Broker Config */}
        {activeTab === 'settings' && (
          <form className="modal-body-scroll" onSubmit={handleSaveBrokerSettings}>
            <div className="settings-section">
              <h3>⚙️ Execution Mode</h3>
              <div style={{ display: 'flex', gap: '16px', margin: '12px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="radio"
                    name="execution_mode"
                    value="PAPER"
                    checked={brokerSettings.execution_mode === 'PAPER'}
                    onChange={e => setBrokerSettings({ ...brokerSettings, execution_mode: e.target.value })}
                  />
                  🟢 Paper Trading (Zero Risk Sandbox)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="radio"
                    name="execution_mode"
                    value="DHAN"
                    checked={brokerSettings.execution_mode === 'DHAN'}
                    onChange={e => setBrokerSettings({ ...brokerSettings, execution_mode: e.target.value })}
                  />
                  🔴 Dhan HQ Live API (Real Money)
                </label>
              </div>
            </div>

            <div className="settings-section" style={{ marginTop: '16px' }}>
              <h3>⚡ Dhan HQ Open API v2 Credentials</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Obtain your Client ID and Access Token from Dhan Web Portal &gt; DhanHQ APIs.
              </p>
              <div className="form-grid-2">
                <div>
                  <label className="field-label">Dhan Client ID</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="1000000000"
                    value={brokerSettings.dhan_client_id || ''}
                    onChange={e => setBrokerSettings({ ...brokerSettings, dhan_client_id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Dhan Access Token</label>
                  <input
                    type="password"
                    className="modal-input"
                    placeholder="eyJhbGciOi..."
                    value={brokerSettings.dhan_access_token || ''}
                    onChange={e => setBrokerSettings({ ...brokerSettings, dhan_access_token: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-save-alert">
                Save Execution Settings
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
