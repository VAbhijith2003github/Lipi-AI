import { useState } from 'react';

/**
 * StartupGuide — 4-step first-run onboarding modal.
 *
 * Props:
 *   ollamaAvailable      : boolean — whether Ollama is running
 *   ollamaModelsPresent  : boolean — whether required Ollama models are pulled
 *   initialMode          : 'ollama' | 'gemini'
 *   initialApiKey        : string
 *   onFinish({ mode, apiKey }) : called when the user completes or skips the guide
 */
export function StartupGuide({
  ollamaAvailable,
  ollamaModelsPresent,
  initialMode,
  initialApiKey,
  onFinish,
}) {
  const [step, setStep] = useState(0);
  const [selectedMode, setSelectedMode] = useState(initialMode || (ollamaAvailable ? 'ollama' : 'gemini'));
  const [apiKeyInput, setApiKeyInput] = useState(initialApiKey || '');
  const [showKey, setShowKey] = useState(false);

  const TOTAL_STEPS = 4;

  const goNext = () => setStep(s => Math.min(s + 1, TOTAL_STEPS - 1));
  const goBack = () => setStep(s => Math.max(s - 1, 0));

  const handleFinish = () => {
    onFinish({ mode: selectedMode, apiKey: apiKeyInput });
  };

  const openExternal = (url) => {
    window.electron?.openExternalUrl?.(url).catch(console.error);
  };

  const steps = [
    /* ── Step 0: Welcome ─────────────────────────────────────────── */
    <div className="sg-step" key="welcome">
      <div className="sg-icon-ring">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      </div>
      <h2 className="sg-title">Welcome to Lipi AI</h2>
      <p className="sg-subtitle">
        Your intelligent PDF reading companion. Chat with any document, get instant summaries, 
        and extract insights — powered by local AI or Google Gemini.
      </p>
      <div className="sg-feature-grid">
        <div className="sg-feature">
          <span className="sg-feature-icon">🔒</span>
          <span>100% Private — your files stay on your machine</span>
        </div>
        <div className="sg-feature">
          <span className="sg-feature-icon">⚡</span>
          <span>Instant vector search across entire documents</span>
        </div>
        <div className="sg-feature">
          <span className="sg-feature-icon">🤖</span>
          <span>Local AI (Ollama) or Cloud AI (Gemini) — your choice</span>
        </div>
        <div className="sg-feature">
          <span className="sg-feature-icon">📑</span>
          <span>Open multiple PDFs in tabs simultaneously</span>
        </div>
      </div>
    </div>,

    /* ── Step 1: Mode Selection ───────────────────────────────────── */
    <div className="sg-step" key="mode">
      <div className="sg-icon-ring">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
        </svg>
      </div>
      <h2 className="sg-title">Choose Your AI Mode</h2>
      <p className="sg-subtitle">Select how Lipi AI processes your documents. You can change this any time in Settings.</p>
      <div className="sg-mode-cards">
        <button
          className={`sg-mode-card ${selectedMode === 'ollama' ? 'sg-mode-active' : ''} ${!ollamaAvailable ? 'sg-mode-unavailable' : ''}`}
          onClick={() => ollamaAvailable && setSelectedMode('ollama')}
          disabled={!ollamaAvailable}
        >
          <div className="sg-mode-header">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <span className="sg-mode-name">Local (Ollama)</span>
            {!ollamaAvailable && <span className="sg-mode-badge sg-badge-unavailable">Not Running</span>}
            {ollamaAvailable && !ollamaModelsPresent && <span className="sg-mode-badge sg-badge-warn">Models Missing</span>}
            {ollamaAvailable && ollamaModelsPresent && <span className="sg-mode-badge sg-badge-ok">Ready</span>}
          </div>
          <p className="sg-mode-desc">Fully private. AI runs on your machine — no internet required after setup. Best for sensitive documents.</p>
          <div className="sg-mode-pills">
            <span>🔒 Offline</span>
            <span>🚀 Fast</span>
            <span>🖥 Requires Ollama</span>
          </div>
        </button>

        <button
          className={`sg-mode-card ${selectedMode === 'gemini' ? 'sg-mode-active' : ''}`}
          onClick={() => setSelectedMode('gemini')}
        >
          <div className="sg-mode-header">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
            </svg>
            <span className="sg-mode-name">Cloud (Gemini)</span>
            <span className="sg-mode-badge sg-badge-cloud">Cloud</span>
          </div>
          <p className="sg-mode-desc">Powered by Google Gemini 3.6 Flash. Higher accuracy, longer context. Requires a free API key.</p>
          <div className="sg-mode-pills">
            <span>☁ Cloud AI</span>
            <span>🎯 High Accuracy</span>
            <span>🔑 API Key Needed</span>
          </div>
        </button>
      </div>
    </div>,

    /* ── Step 2: Configuration ───────────────────────────────────── */
    <div className="sg-step" key="config">
      {selectedMode === 'gemini' ? (
        <>
          <div className="sg-icon-ring sg-icon-ring--gemini">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h2 className="sg-title">Configure Gemini API Key</h2>
          <p className="sg-subtitle">
            Get a free API key from{' '}
            <button className="sg-link-btn" onClick={() => openExternal('https://aistudio.google.com/app/apikey')}>
              Google AI Studio ↗
            </button>
            {' '}— free with generous limits.
          </p>
          <div className="sg-input-group">
            <label className="sg-input-label">Gemini API Key</label>
            <div className="sg-input-row">
              <input
                type={showKey ? 'text' : 'password'}
                className="sg-input"
                placeholder="AIzaSy..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="sg-eye-btn"
                onClick={() => setShowKey(v => !v)}
                title={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            <span className="sg-input-hint">Stored locally in your browser — never sent anywhere except Google APIs.</span>
          </div>
          {apiKeyInput && (
            <div className="sg-status-ok">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              API key configured
            </div>
          )}
        </>
      ) : (
        <>
          <div className="sg-icon-ring sg-icon-ring--ollama">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <h2 className="sg-title">Ollama Status</h2>
          {ollamaAvailable ? (
            <>
              <div className="sg-status-ok">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Ollama is running
              </div>
              {ollamaModelsPresent ? (
                <div className="sg-status-ok" style={{ marginTop: '8px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Required models are present — fully ready!
                </div>
              ) : (
                <div className="sg-ollama-instructions">
                  <div className="sg-status-warn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    Required models not yet downloaded
                  </div>
                  <p className="sg-subtitle" style={{ marginTop: '12px' }}>Run in your terminal to pull the required models:</p>
                  <div className="sg-code-block"><code>ollama pull gemma2:2b</code></div>
                  <div className="sg-code-block"><code>ollama pull nomic-embed-text</code></div>
                </div>
              )}
            </>
          ) : (
            <div className="sg-ollama-instructions">
              <div className="sg-status-warn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Ollama is not running
              </div>
              <div className="sg-step-list">
                <div className="sg-step-item">
                  <span className="sg-step-num">1</span>
                  <span>Download from <button className="sg-link-btn" onClick={() => openExternal('https://ollama.com')}>ollama.com ↗</button></span>
                </div>
                <div className="sg-step-item">
                  <span className="sg-step-num">2</span>
                  <span>Install and launch Ollama</span>
                </div>
                <div className="sg-step-item">
                  <span className="sg-step-num">3</span>
                  <span>Run: <code className="sg-inline-code">ollama pull gemma2:2b</code></span>
                </div>
                <div className="sg-step-item">
                  <span className="sg-step-num">4</span>
                  <span>Run: <code className="sg-inline-code">ollama pull nomic-embed-text</code></span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>,

    /* ── Step 3: Ready ───────────────────────────────────────────── */
    <div className="sg-step" key="ready">
      <div className="sg-icon-ring sg-icon-ring--success">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h2 className="sg-title">You're All Set!</h2>
      <p className="sg-subtitle">Lipi AI is configured and ready. Here's how to get started:</p>
      <div className="sg-tips">
        <div className="sg-tip">
          <span className="sg-tip-num">1</span>
          <div>
            <strong>Open a Document</strong>
            <p>Click "Open Document" in the top bar or drag a PDF into the app.</p>
          </div>
        </div>
        <div className="sg-tip">
          <span className="sg-tip-num">2</span>
          <div>
            <strong>Wait for Ingestion</strong>
            <p>The AI will index your document — this takes a few seconds.</p>
          </div>
        </div>
        <div className="sg-tip">
          <span className="sg-tip-num">3</span>
          <div>
            <strong>Start Chatting</strong>
            <p>Ask any question about the document in the AI Copilot panel on the right.</p>
          </div>
        </div>
        <div className="sg-tip">
          <span className="sg-tip-num">4</span>
          <div>
            <strong>Use Quick Actions</strong>
            <p>Hit Explain, Summarize, Analyze, or Find Key Terms for instant insights.</p>
          </div>
        </div>
      </div>
      <div className="sg-mode-summary">
        <span>Active Mode:</span>
        <span className={`sg-mode-pill ${selectedMode === 'gemini' ? 'sg-mode-pill--gemini' : 'sg-mode-pill--ollama'}`}>
          {selectedMode === 'gemini' ? '☁ Google Gemini' : '🖥 Local (Ollama)'}
        </span>
      </div>
    </div>,
  ];

  const stepLabels = ['Welcome', 'AI Mode', 'Setup', 'Ready'];

  return (
    <div className="sg-overlay">
      <div className="sg-modal">
        {/* Header */}
        <div className="sg-header">
          <div className="sg-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>Lipi AI — Setup Guide</span>
          </div>
          <button className="sg-skip-btn" onClick={handleFinish}>
            Skip
          </button>
        </div>

        {/* Progress Steps */}
        <div className="sg-progress">
          {stepLabels.map((label, i) => (
            <div key={i} className={`sg-progress-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <div className="sg-progress-dot">
                {i < step ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className="sg-progress-label">{label}</span>
              {i < TOTAL_STEPS - 1 && <div className={`sg-progress-line ${i < step ? 'done' : ''}`} />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="sg-content">
          {steps[step]}
        </div>

        {/* Footer Navigation */}
        <div className="sg-footer">
          <button
            className="sg-btn sg-btn-ghost"
            onClick={goBack}
            disabled={step === 0}
          >
            ← Back
          </button>
          <div className="sg-dots">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} className={`sg-dot ${i === step ? 'active' : ''}`} />
            ))}
          </div>
          {step < TOTAL_STEPS - 1 ? (
            <button className="sg-btn sg-btn-primary" onClick={goNext}>
              Next →
            </button>
          ) : (
            <button className="sg-btn sg-btn-finish" onClick={handleFinish}>
              Get Started 🚀
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
