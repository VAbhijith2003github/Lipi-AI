import { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const API_BASE = 'http://localhost:8000/api';



function PdfThumbnail({ pdfDoc, pageNum, isActive, onClick }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!pdfDoc) return;
    let renderTask = null;

    const renderThumb = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        // Render at a small scale for thumbnail preview
        const viewport = page.getViewport({ scale: 0.15 });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Thumbnail render error:', err);
        }
      }
    };

    renderThumb();

    return () => {
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, pageNum]);

  return (
    <div 
      className={`thumbnail-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="thumb-box-canvas">
        <canvas ref={canvasRef} />
      </div>
      <div className="thumb-label">Page {pageNum}</div>
    </div>
  );
}

function App() {
  const [pdfFile, setPdfFile] = useState(null); // Filename in backend or local file info
  const [pdfDoc, setPdfDoc] = useState(null); // PDFjs Document object
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [thumbnails, setThumbnails] = useState([]);
  
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isIngested, setIsIngested] = useState(false);
  const [toast, setToast] = useState(null);

  const canvasRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const [copilotWidth, setCopilotWidth] = useState(300);
  const [isFileDropdownOpen, setIsFileDropdownOpen] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(true);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.dropdown-container')) {
        setIsFileDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);
  const isResizingRef = useRef(false);

  const handleMouseMove = (e) => {
    if (!isResizingRef.current) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth > 220 && newWidth < 600) {
      setCopilotWidth(newWidth);
    }
  };

  const stopResizing = () => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };

  const startResizing = (e) => {
    isResizingRef.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResizing);
    };
  }, []);

  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-hide toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const [zoomFactor, setZoomFactor] = useState(1.5);

  // Render main page on Canvas
  useEffect(() => {
    if (!pdfDoc) return;

    let renderTask = null;
    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: zoomFactor });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err);
        }
      }
    };

    renderPage();

    return () => {
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, currentPage, zoomFactor]);

  // Generate Thumbnails when pdfDoc changes
  useEffect(() => {
    if (!pdfDoc) {
      setThumbnails([]);
      return;
    }

    const generateThumbnails = async () => {
      const thumbs = [];
      const total = Math.min(pdfDoc.numPages, 100); // safety cap
      for (let i = 1; i <= total; i++) {
        thumbs.push(i);
      }
      setThumbnails(thumbs);
    };

    generateThumbnails();
  }, [pdfDoc]);

  // Auto-Ingest on PDF load
  const triggerIngestion = async (fileObj, isLocalPath = false) => {
    setIsLoading(true);
    setIsIngested(false);
    showToast("Starting PDF Ingestion for AI Copilot...", "info");

    try {
      let response;
      if (isLocalPath) {
        response = await fetch(`${API_BASE}/upload-path`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_path: fileObj }),
        });
      } else {
        const formData = new FormData();
        formData.append('file', fileObj);
        response = await fetch(`${API_BASE}/upload`, {
          method: 'POST',
          body: formData,
        });
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Ingestion failed');
      }

      const data = await response.json();
      setIsIngested(true);
      showToast(`PDF Ingested! (${data.chunks_created} vectors ready)`);
      
      // Initial greeting message from AI
      setMessages([
        { role: 'assistant', content: `👋 I have analyzed **${data.filename}**. How can I help you today? You can select a quick action like "Summarize" or ask me anything!` }
      ]);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Open PDF action handler
  const handleOpenPdf = async () => {
    try {
      fileInputRef.current?.click();
    } catch (err) {
      showToast("Error loading PDF: " + err.message, "error");
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const fileReader = new FileReader();
      fileReader.onload = async function () {
        const typedarray = new Uint8Array(this.result);
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const doc = await loadingTask.promise;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setPdfFile(file.name);

        triggerIngestion(file, false);
      };
      fileReader.readAsArrayBuffer(file);
    } catch (err) {
      showToast("Error parsing PDF: " + err.message, "error");
    }
  };

  const handleSendMessage = async (customMessage = null) => {
    const messageText = customMessage || inputValue.trim();
    if (!messageText || isLoading) return;

    const userMessage = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    if (!customMessage) setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          chat_history: messages.map(m => [m.role, m.content]),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Chat failed');
      }

      const data = await response.json();
      const assistantMessage = { role: 'assistant', content: data.response };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const runQuickAction = (action) => {
    if (!isIngested) {
      showToast("Please wait for PDF ingestion to complete.", "error");
      return;
    }
    const prompts = {
      explain: "Please explain the key contents and themes of this document.",
      summarize: "Provide a detailed summary of the main points of this document.",
      analyze: "Analyze the core arguments, structure, and quality of information in this document.",
      find: "What are the most important terms, data points, or concepts discussed here?",
      compare: "Summarize the major contrasts, comparisons, or different perspectives presented in the text."
    };
    handleSendMessage(prompts[action]);
  };

  return (
    <div className="app-container">
      {/* Hidden file input for browser fallback */}
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept="application/pdf"
        onChange={handleFileChange}
      />

      {/* ---- TOP MENU BAR ---- */}
      <header className="top-menu">
        <div className="menu-group">
          <div className="dropdown-container">
            <button className="menu-btn" onClick={() => setIsFileDropdownOpen(!isFileDropdownOpen)}>File ▾</button>
            {isFileDropdownOpen && (
              <div className="dropdown-menu">
                <button className="dropdown-item" onClick={() => {
                  handleOpenPdf();
                  setIsFileDropdownOpen(false);
                }}>
                  📂 Open New Document
                </button>
              </div>
            )}
          </div>
          <button className={`menu-btn ${isCopilotOpen ? 'active-toggle' : ''}`} onClick={() => setIsCopilotOpen(!isCopilotOpen)} title="Toggle AI Copilot" style={{ padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3.5" />
              <path d="M9 3v18" />
              {isCopilotOpen ? (
                <path d="M16 15l-3-3 3-3" />
              ) : (
                <path d="M13 9l3 3-3 3" />
              )}
            </svg>
          </button>
          <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>|</span>
          <button className="menu-btn" onClick={() => setZoomFactor(prev => Math.max(0.5, prev - 0.25))} title="Zoom Out">Zoom -</button>
          <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{Math.round(zoomFactor * 100)}%</span>
          <button className="menu-btn" onClick={() => setZoomFactor(prev => Math.min(3.0, prev + 0.25))} title="Zoom In">Zoom +</button>
        </div>
        <div className="menu-title">
          {pdfFile ? `📄 ${pdfFile} — Page ${currentPage} of ${numPages}` : "PDF AI Copilot"}
        </div>
        <div className="menu-group">
          <div className="search-bar">Search</div>
          <button className="settings-btn">⚙️</button>
        </div>
      </header>

      {/* ---- THREE PANEL LAYOUT ---- */}
      <div className="workspace">
        {/* PANEL 1: Page Thumbnails */}
        <aside className="thumbnail-panel">
          <div className="panel-title">Pages</div>
          <div className="thumbnail-list">
            {thumbnails.map((pageNum) => (
              <PdfThumbnail
                key={pageNum}
                pdfDoc={pdfDoc}
                pageNum={pageNum}
                isActive={currentPage === pageNum}
                onClick={() => setCurrentPage(pageNum)}
              />
            ))}
          </div>
        </aside>

        {/* PANEL 2: PDF Document Canvas */}
        <main className="pdf-panel">
          {pdfDoc ? (
            <div className="pdf-canvas-container">
              <canvas ref={canvasRef} />
            </div>
          ) : (
            <div className="empty-viewer" onClick={handleOpenPdf}>
              <div className="empty-icon">📁</div>
              <h2>Open a PDF Document to Start</h2>
              <p>Click here or select File from the top menu to open a local study document.</p>
            </div>
          )}
        </main>

        {/* CONDITIONAL COPILOT PANEL */}
        {isCopilotOpen && (
          <>
            {/* RESIZE HANDLE */}
            <div className="resize-handle" onMouseDown={startResizing} />

            {/* PANEL 3: AI Copilot Chat */}
            <aside className="copilot-panel" style={{ width: `${copilotWidth}px` }}>
              <div className="panel-title">AI Copilot</div>
              
              {/* Quick-action chips */}
              <div className="quick-actions">
                <button className="chip" onClick={() => runQuickAction('explain')} disabled={!isIngested}>Explain</button>
                <button className="chip" onClick={() => runQuickAction('summarize')} disabled={!isIngested}>Summarize</button>
                <button className="chip" onClick={() => runQuickAction('analyze')} disabled={!isIngested}>Analyze</button>
                <button className="chip" onClick={() => runQuickAction('find')} disabled={!isIngested}>Find</button>
                <button className="chip" onClick={() => runQuickAction('compare')} disabled={!isIngested}>Compare</button>
              </div>

              <hr className="divider" />

              {/* Chat Messages */}
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div className="copilot-welcome">
                    <span className="welcome-emoji">🤖</span>
                    <p>Welcome to Copilot. Open a document to begin automatic ingestion. Once ready, ask me questions about it!</p>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div key={i} className={`message ${msg.role}`}>
                      <div className="message-content">
                        {msg.role === 'assistant' ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isLoading && (
                  <div className="message assistant">
                    <div className="typing-indicator">
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Panel */}
              <div className="copilot-input-area">
                <div className="chat-input-wrapper">
                  <input
                    type="text"
                    placeholder={isIngested ? "Ask copilot anything..." : "Awaiting document..."}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendMessage();
                    }}
                    disabled={!isIngested || isLoading}
                  />
                  <button 
                    className="send-btn" 
                    onClick={() => handleSendMessage()}
                    disabled={!isIngested || !inputValue.trim() || isLoading}
                  >
                    ➔
                  </button>
                </div>
              </div>
            </aside>
          </>
        )}
      </div>

      {/* ---- TOAST NOTIFICATIONS ---- */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'error' ? '❌' : 'ℹ️'} {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;
