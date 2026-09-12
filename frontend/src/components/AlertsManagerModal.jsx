import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function AlertsManagerModal({ onClose, activeSymbol }) {
  const [tab, setTab] = useState('alerts'); // 'alerts', 'settings', 'logs'
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState({
    telegram_bot_token: '',
    telegram_chat_id: '',
    discord_webhook_url: '',
    execution_mode: 'PAPER',
    dhan_client_id: '',
    dhan_access_token: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Form State
  const [formName, setFormName] = useState('');
  const [formSymbol, setFormSymbol] = useState(activeSymbol || 'RELIANCE');
  const [formType, setFormType] = useState('PRICE_CROSS');
  const [formOperator, setFormOperator] = useState('>=');
  const [formTargetPrice, setFormTargetPrice] = useState('');
  const [formChannels, setFormChannels] = useState(['BROWSER', 'TELEGRAM']);

  useEffect(() => {
    loadData();
  }, [tab]);

  async function loadData() {
    setLoading(true);
    try {
      if (tab === 'alerts') {
        const res = await api.getAlerts();
        setAlerts(res.alerts || []);
      } else if (tab === 'logs') {
        const res = await api.getAlertLogs(50);
        setLogs(res.logs || []);
      } else if (tab === 'settings') {
        const res = await api.getBrokerSettings();
        setSettings(res || {});
      }
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAlert(e) {
    e.preventDefault();
    try {
      const condition = {};
      if (formType === 'PRICE_CROSS') {
        condition.operator = formOperator;
        condition.target_price = parseFloat(formTargetPrice) || 0;
      } else if (formType === 'ADR_CLIMAX') {
        condition.adr_pct_threshold = 70.0;
      }

      await api.createAlert({
        name: formName || `${formSymbol} ${formType}`,
        alert_type: formType,
        symbol: formSymbol,
        condition,
        channels: formChannels
      });

      setMessage('✅ Alert created successfully!');
      setFormName('');
      setFormTargetPrice('');
      loadData();
    } catch (err) {
      setMessage(`❌ Failed to create alert: ${err.message}`);
    }
  }

  async function handleToggle(id, currentStatus) {
    try {
      await api.toggleAlert(id, !currentStatus);
      loadData();
    } catch (err) {
      setMessage(`Failed to toggle alert: ${err.message}`);
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteAlert(id);
      loadData();
    } catch (err) {
      setMessage(`Failed to delete alert: ${err.message}`);
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    try {
      await api.updateBrokerSettings(settings);
      setMessage('✅ Settings saved successfully!');
    } catch (err) {
      setMessage(`❌ Failed to save settings: ${err.message}`);
    }
  }

  async function requestBrowserPermission() {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setMessage('🔔 Browser notifications enabled!');
        new Notification('NSE Screener', { body: 'Browser notifications configured successfully!' });
      } else {
        setMessage('⚠️ Browser notification permission denied.');
      }
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card alerts-modal" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🔔</span>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
              Real-Time Alerts, Webhooks & Notifications
            </h2>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        {/* Navigation Tabs */}
        <div className="modal-tabs">
          <button className={`modal-tab-btn ${tab === 'alerts' ? 'active' : ''}`} onClick={() => setTab('alerts')}>
            Active Triggers ({alerts.length})
          </button>
          <button className={`modal-tab-btn ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
            Telegram & Discord Webhooks
          </button>
          <button className={`modal-tab-btn ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>
            Trigger Logs
          </button>
        </div>

        {message && (
          <div className="modal-alert-banner">
            {message}
          </div>
        )}

        {/* Tab 1: Active Alerts & Creator */}
        {tab === 'alerts' && (
          <div className="modal-body-scroll">
            {/* Create Alert Form */}
            <form className="alert-create-form" onSubmit={handleCreateAlert}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-primary)' }}>
                ➕ Create Instant Market Alert
              </h3>
              <div className="form-grid-3">
                <div>
                  <label className="field-label">Alert Name</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="e.g. Reliance Breakout"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="field-label">Symbol</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="RELIANCE"
                    value={formSymbol}
                    onChange={e => setFormSymbol(e.target.value.toUpperCase())}
                    required
                  />
                </div>

                <div>
                  <label className="field-label">Alert Condition</label>
                  <select
                    className="modal-select"
                    value={formType}
                    onChange={e => setFormType(e.target.value)}
                  >
                    <option value="PRICE_CROSS">Price Cross (LTP &gt; Target)</option>
                    <option value="ADR_CLIMAX">ADR Over-Extension (&gt;70% Used)</option>
                    <option value="EARLY_ADR_EXPANSION">Early ADR Expansion (Tight Prior + &lt;40%)</option>
                  </select>
                </div>
              </div>

              {formType === 'PRICE_CROSS' && (
                <div className="form-grid-2" style={{ marginTop: '10px' }}>
                  <div>
                    <label className="field-label">Operator</label>
                    <select
                      className="modal-select"
                      value={formOperator}
                      onChange={e => setFormOperator(e.target.value)}
                    >
                      <option value=">=">Price Crosses Above (&gt;=)</option>
                      <option value="<=">Price Crosses Below (&lt;=)</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Target Price (₹)</label>
                    <input
                      type="number"
                      step="0.05"
                      className="modal-input"
                      placeholder="e.g. 3050.00"
                      value={formTargetPrice}
                      onChange={e => setFormTargetPrice(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="checkbox"
                      checked={formChannels.includes('BROWSER')}
                      onChange={e => {
                        if (e.target.checked) setFormChannels([...formChannels, 'BROWSER']);
                        else setFormChannels(formChannels.filter(c => c !== 'BROWSER'));
                      }}
                    />
                    🖥️ Browser Push
                  </label>
                  <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="checkbox"
                      checked={formChannels.includes('TELEGRAM')}
                      onChange={e => {
                        if (e.target.checked) setFormChannels([...formChannels, 'TELEGRAM']);
                        else setFormChannels(formChannels.filter(c => c !== 'TELEGRAM'));
                      }}
                    />
                    ✈️ Telegram
                  </label>
                  <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="checkbox"
                      checked={formChannels.includes('DISCORD')}
                      onChange={e => {
                        if (e.target.checked) setFormChannels([...formChannels, 'DISCORD']);
                        else setFormChannels(formChannels.filter(c => c !== 'DISCORD'));
                      }}
                    />
                    💬 Discord
                  </label>
                </div>

                <button type="submit" className="btn-save-alert">
                  Set Live Alert
                </button>
              </div>
            </form>

            {/* Existing Alerts Table */}
            <h3 style={{ margin: '20px 0 10px 0', fontSize: '14px', color: 'var(--text-primary)' }}>
              Configured Active Triggers
            </h3>

            {alerts.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No active alerts created yet. Use the form above to add your first alert!
              </div>
            ) : (
              <table className="alerts-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Channels</th>
                    <th>Status</th>
                    <th>Last Triggered</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map(a => (
                    <tr key={a.id}>
                      <td><strong style={{ color: 'var(--accent-primary)' }}>{a.symbol}</strong></td>
                      <td>{a.name}</td>
                      <td><span className="badge-alert-type">{a.alert_type}</span></td>
                      <td>{a.channels}</td>
                      <td>
                        <span className={`badge-status ${a.is_active ? 'active' : 'paused'}`}>
                          {a.is_active ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {a.last_triggered ? new Date(a.last_triggered).toLocaleTimeString() : 'Never'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn-icon-toggle"
                            onClick={() => handleToggle(a.id, a.is_active)}
                            title={a.is_active ? 'Pause Alert' : 'Activate Alert'}
                          >
                            {a.is_active ? '⏸️' : '▶️'}
                          </button>
                          <button
                            className="btn-icon-delete"
                            onClick={() => handleDelete(a.id)}
                            title="Delete Alert"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Webhook Settings */}
        {tab === 'settings' && (
          <form className="modal-body-scroll" onSubmit={handleSaveSettings}>
            <div className="settings-section">
              <h3>✈️ Telegram Bot Configuration</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                Receive instant trade alerts directly in your Telegram channel or personal chat via @BotFather.
              </p>
              <div className="form-grid-2">
                <div>
                  <label className="field-label">Bot Token</label>
                  <input
                    type="password"
                    className="modal-input"
                    placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                    value={settings.telegram_bot_token || ''}
                    onChange={e => setSettings({ ...settings, telegram_bot_token: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Chat ID</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="-1001234567890 or user ID"
                    value={settings.telegram_chat_id || ''}
                    onChange={e => setSettings({ ...settings, telegram_chat_id: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="settings-section" style={{ marginTop: '16px' }}>
              <h3>💬 Discord Webhook Configuration</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                Post rich embed scanner and ADR climax alerts to your Discord channel.
              </p>
              <div>
                <label className="field-label">Discord Webhook URL</label>
                <input
                  type="password"
                  className="modal-input"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={settings.discord_webhook_url || ''}
                  onChange={e => setSettings({ ...settings, discord_webhook_url: e.target.value })}
                />
              </div>
            </div>

            <div className="settings-section" style={{ marginTop: '16px' }}>
              <h3>🔔 Browser Push Notifications</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                Native OS popup notifications when the screener terminal is running in background.
              </p>
              <button type="button" className="btn-browser-perm" onClick={requestBrowserPermission}>
                Enable Desktop Notifications
              </button>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-save-alert">
                Save Webhook Settings
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Trigger Logs */}
        {tab === 'logs' && (
          <div className="modal-body-scroll">
            <table className="alerts-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>Channel</th>
                  <th>Message</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No alert dispatch logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  logs.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {new Date(l.triggered_at).toLocaleTimeString()}
                      </td>
                      <td><strong>{l.symbol}</strong></td>
                      <td><span className="badge-alert-type">{l.channel}</span></td>
                      <td style={{ fontSize: '12px' }}>{l.message}</td>
                      <td>
                        <span className={`badge-status ${l.status === 'SENT' ? 'active' : 'paused'}`}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
