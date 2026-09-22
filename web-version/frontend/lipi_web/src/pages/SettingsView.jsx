import React from 'react';

const formatBytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(bytes ? 1 : 0)} MB`;

export const SettingsView = ({ isDarkMode, onThemeChange, usage }) => (
  <div className="settings-container">
    <div className="settings-card">
      <h2 className="settings-title">Lipi AI Preferences</h2>
      <div className="setting-group">
        <label className="setting-label">Appearance Mode</label>
        <div className="radio-options">
          <label className="radio-label">
            <input
              type="radio"
              name="theme"
              checked={isDarkMode}
              onChange={() => onThemeChange(true)}
            />
            <span>Dark Theme</span>
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="theme"
              checked={!isDarkMode}
              onChange={() => onThemeChange(false)}
            />
            <span>Light Theme</span>
          </label>
        </div>
      </div>
      <div className="setting-group usage-group">
        <label className="setting-label">Account Usage</label>
        {usage ? (
          <div className="usage-grid">
            <div className="usage-item">
              <span>Cloud storage</span>
              <strong>{formatBytes(usage.storage_bytes_used)} / {formatBytes(usage.storage_bytes_limit)}</strong>
            </div>
            <div className="usage-item">
              <span>AI requests this month</span>
              <strong>{usage.api_calls_used} / {usage.api_calls_limit}</strong>
            </div>
          </div>
        ) : <span className="usage-loading">Loading account usage…</span>}
      </div>
    </div>
  </div>
);
