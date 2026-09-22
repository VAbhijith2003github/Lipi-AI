import React, { useState, useEffect, useCallback } from 'react';
import { IconMinimize } from './components/Icons';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { SegmentedNav } from './components/SegmentedNav';
import { HomePage } from './pages/HomePage';
import { SettingsView } from './pages/SettingsView';
import { PdfViewer } from './pages/PdfViewer';
import { AuthPage } from './pages/AuthPage';
import { getToken, fetchDocuments, fetchUsage, uploadDocument, deleteDocument, logout } from './api';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getToken());
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [activeView, setActiveView] = useState('documents');
  const [recentDocs, setRecentDocs] = useState([]);
  const [openDoc, setOpenDoc] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('lipi_theme') !== 'light');
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [docLoadError, setDocLoadError] = useState(null);
  const [usage, setUsage] = useState(null);

  // ── Load documents from backend on auth ──────────────────────
  const loadDocuments = useCallback(async () => {
    setDocLoadError(null);
    try {
      const docs = await fetchDocuments();
      setRecentDocs(docs.map(d => ({
        id: d.document_id,
        name: d.filename,
        size: d.chunk_count ? `${d.chunk_count} chunks` : '—',
        date: d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
        cloudUrl: d.cloud_url,
      })));
    } catch (e) {
      console.error('[Lipi] Failed to load documents:', e);
      setDocLoadError(e.message || 'Could not load documents from the backend.');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadDocuments();
  }, [isAuthenticated, loadDocuments]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    fetchUsage().then((data) => {
      if (!cancelled) setUsage(data);
    }).catch((error) => console.error('[Lipi] Failed to load usage:', error));
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // ── handlers ──────────────────────────────────────────────
  const handleToggleFullScreen = () => setIsFullScreen((prev) => !prev);

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape') setIsFullScreen(false); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleTheme = () => setIsDarkMode((prev) => !prev);

  useEffect(() => {
    localStorage.setItem('lipi_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);
  const handleToggleLeftSidebar = () => setShowLeftSidebar((prev) => !prev);
  const handleToggleRightSidebar = () => setShowRightSidebar((prev) => !prev);

  const handleGoHome = () => {
    setOpenDoc(null);
    setActiveTabId(null);
    setActiveView('documents');
  };

  const openInViewer = (doc) => {
    setOpenDoc(doc);
    setActiveTabId(doc.id);
    if (!tabs.some((t) => t.id === doc.id)) {
      setTabs((prev) => [...prev, doc]);
    }
  };

  const cacheDocumentFile = useCallback((documentId, fileObject) => {
    const updateDocument = (doc) => doc.id === documentId ? { ...doc, fileObject } : doc;
    setRecentDocs((docs) => docs.map(updateDocument));
    setTabs((docs) => docs.map(updateDocument));
    setOpenDoc((doc) => doc?.id === documentId ? updateDocument(doc) : doc);
  }, []);

  const refreshUsage = useCallback(() => {
    fetchUsage().then(setUsage).catch((error) => console.error('[Lipi] Failed to refresh usage:', error));
  }, []);

  // Upload file to backend, get real document_id back
  const handleFileSelected = async (file) => {
    setIsUploading(true);
    try {
      const result = await uploadDocument(file);
      const newDoc = {
        id: result.document_id,
        name: result.filename,
        size: result.chunk_count ? `${result.chunk_count} chunks` : '—',
        date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        cloudUrl: result.cloud_url,
        fileObject: file,
      };
      setRecentDocs((prev) => [newDoc, ...prev.filter(d => d.id !== newDoc.id)]);
      refreshUsage();
      openInViewer(newDoc);
    } catch (e) {
      alert(`Upload failed: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleHeaderOpenDoc = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf';
    fileInput.onchange = (e) => {
      if (e.target.files?.length) handleFileSelected(e.target.files[0]);
    };
    fileInput.click();
  };

  // Tab operations
  const handleSelectTab = (tabId) => {
    const doc = tabs.find((t) => t.id === tabId);
    if (doc) openInViewer(doc);
  };

  const handleCloseTab = (tabId) => {
    const updated = tabs.filter((t) => t.id !== tabId);
    setTabs(updated);
    if (openDoc?.id === tabId) {
      if (updated.length > 0) {
        openInViewer(updated[updated.length - 1]);
      } else {
        setOpenDoc(null);
        setActiveTabId(null);
      }
    }
  };

  const handleDeleteDoc = async (docId) => {
    try {
      await deleteDocument(docId);
      setRecentDocs((prev) => prev.filter((d) => d.id !== docId));
      refreshUsage();
      if (openDoc?.id === docId) handleGoHome();
      setTabs((prev) => prev.filter((t) => t.id !== docId));
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  const handleLogout = () => {
    logout();
    setIsAuthenticated(false);
    setRecentDocs([]);
    setUsage(null);
    setTabs([]);
    setOpenDoc(null);
  };

  const isHomePage = !openDoc && activeView === 'documents';

  // ── Auth Gate ──────────────────────────────────────────────
  if (!isAuthenticated) {
    return <AuthPage onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className={`app-container ${isDarkMode ? '' : 'light-mode'} ${isFullScreen ? 'fullscreen-mode' : ''}`}>
      {isUploading && (
        <div className="upload-progress-overlay">
          <div className="upload-progress-card">
            <div className="upload-spinner" />
            <span>Processing document…</span>
          </div>
        </div>
      )}

      {isFullScreen && !openDoc && (
        <button
          className="fullscreen-exit-floating"
          onClick={handleToggleFullScreen}
          title="Exit Full Screen (Esc)"
        >
          <IconMinimize size={14} color="#ffffff" />
          <span>Exit Full Screen</span>
        </button>
      )}

      {!isFullScreen && (
        <Header
          onOpenDocument={handleHeaderOpenDoc}
          onToggleTheme={handleToggleTheme}
          isDarkMode={isDarkMode}
          onToggleLeftSidebar={handleToggleLeftSidebar}
          onToggleRightSidebar={handleToggleRightSidebar}
          onGoHome={handleGoHome}
          isLeftSidebarOpen={showLeftSidebar}
          isRightSidebarOpen={showRightSidebar}
          isHomePage={isHomePage}
          isFullScreen={isFullScreen}
          onToggleFullScreen={handleToggleFullScreen}
          onLogout={handleLogout}
        />
      )}
      {!isFullScreen && (
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onAddTab={handleHeaderOpenDoc}
        />
      )}

      {openDoc ? (
        <PdfViewer
          doc={openDoc}
          onClose={handleGoHome}
          isLeftSidebarOpen={showLeftSidebar}
          isRightSidebarOpen={showRightSidebar}
          onToggleRightSidebar={handleToggleRightSidebar}
          isFullScreen={isFullScreen}
          onToggleFullScreen={handleToggleFullScreen}
          onPdfLoaded={cacheDocumentFile}
          onUsageChanged={refreshUsage}
        />
      ) : (
        <main className="main-content">
          <SegmentedNav activeView={activeView} onChangeView={setActiveView} />

          {activeView === 'documents' ? (
            <HomePage
              recentDocs={recentDocs}
              onFileSelected={handleFileSelected}
              onOpenDoc={openInViewer}
              onDeleteDoc={handleDeleteDoc}
              docLoadError={docLoadError}
              onDismissError={() => setDocLoadError(null)}
            />
          ) : (
            <SettingsView isDarkMode={isDarkMode} onThemeChange={setIsDarkMode} usage={usage} />
          )}
        </main>
      )}
    </div>
  );
}

export default App;
