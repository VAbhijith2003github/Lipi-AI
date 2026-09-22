import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createAnnotation, createChatSession, deleteAnnotation, exportAnnotations, fetchAnnotations, fetchChatSessions, fetchDocumentFile, fetchDocumentVersions, fetchSessionMessages, querySession, updateAnnotation } from '../api';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up the worker for PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = process.env.REACT_APP_PDF_WORKER_URL;

// ─── Toolbar icons ─────────────────────────────────────────────
const IcSearch = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>);
const IcZoomIn = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>);
const IcZoomOut = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>);
const IcFitWidth = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="7" y1="12" x2="17" y2="12"/><polyline points="11 8 7 12 11 16"/><polyline points="13 8 17 12 13 16"/></svg>);
const IcHighlight = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>);
const IcEraser = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H7L3 16C2 15 2 13 3 12L13 2C14 1 16 1 17 2L21 6C22 7 22 9 21 10L12 19"/><path d="M18 11L11 4"/></svg>);
const IcUndo = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>);
const IcAnnotate = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>);
const IcDownload = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>);
const IcPrint = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>);
const IcChevronLeft = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>);
const IcChevronRight = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>);
const IcSend = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>);
const IcSparkle = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L9.09 9.09 2 12l7.09 2.91L12 22l2.91-7.09L22 12l-7.09-2.91L12 2z"/></svg>);
const IcCopy = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>);
const IcClose = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>);
const IcMaximize = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>);
const IcMinimize = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>);

// ─── AI Chat messages ──────────────────────────────────────────
/** Returns a fresh welcome message array for a document with no prior history. */
const makeWelcomeMessages = () => [
  {
    id: `welcome_${Date.now()}`,
    role: 'assistant',
    text: "Hello! I've loaded your document. Ask me anything about it.",
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  },
];

/** Convert a backend ChatMessageResponse into the frontend message shape. */
const toFrontendMsg = (m) => ({
  id: m.id,
  role: m.role === 'model' ? 'assistant' : m.role,
  text: m.content,
  time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
});

const SUGGESTED_PROMPTS = [
  'Summarise this document',
  'What are the key points?',
  'Extract the main entities',
];

const renderInlineMarkdown = (text, key) => text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (
  part.startsWith('**') && part.endsWith('**')
    ? <strong key={`${key}-bold-${index}`}>{part.slice(2, -2)}</strong>
    : part
));

const renderMarkdown = (text) => {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const nodes = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const Tag = `h${heading[1].length + 2}`;
      nodes.push(<Tag className="chat-markdown-heading" key={`heading-${index}`}>{renderInlineMarkdown(heading[2], index)}</Tag>);
      index += 1;
      continue;
    }

    const isBullet = /^[-*]\s+/.test(line);
    const isNumbered = /^\d+\.\s+/.test(line);
    if (isBullet || isNumbered) {
      const ListTag = isNumbered ? 'ol' : 'ul';
      const expression = isNumbered ? /^\d+\.\s+(.+)$/ : /^[-*]\s+(.+)$/;
      const items = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(expression);
        if (!match) break;
        items.push(<li key={`item-${index}`}>{renderInlineMarkdown(match[1], index)}</li>);
        index += 1;
      }
      nodes.push(<ListTag className="chat-markdown-list" key={`list-${index}`}>{items}</ListTag>);
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+|^[-*]\s+|^\d+\.\s+/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    nodes.push(<p className="chat-markdown-paragraph" key={`paragraph-${index}`}>{renderInlineMarkdown(paragraph.join(' '), index)}</p>);
  }
  return nodes;
};

// ─── Low-res, lazy-rendered thumbnail item ─────────────────────
const ThumbnailItem = ({ pageNumber, totalPages, isActive, onClick }) => {
  const [inView, setInView] = useState(pageNumber <= 8);
  const itemRef = useRef(null);

  useEffect(() => {
    const el = itemRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
        }
      },
      { rootMargin: '250px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={itemRef}
      className={`page-thumbnail-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <div 
        className="thumbnail-card" 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          overflow: 'hidden', 
          padding: 0,
          backgroundColor: '#ffffff'
        }}
      >
        {inView ? (
          <Page 
            pageNumber={pageNumber} 
            renderTextLayer={false} 
            renderAnnotationLayer={false} 
            width={56}
            loading={
              <div style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>
                {pageNumber}
              </div>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', backgroundColor: '#f8f9fa' }}>
            <span style={{ fontSize: '11px', color: '#9aa0a6', fontWeight: 600 }}>{pageNumber}</span>
          </div>
        )}
      </div>
      <div className="thumbnail-meta">
        <span className="thumb-page-num">
          {String(pageNumber).padStart(2, '0')} Page
        </span>
        <span className="thumb-page-desc">
          Page {pageNumber} of {totalPages}
        </span>
      </div>
    </div>
  );
};

// ─── Main PDF page with viewport pre-loading ───────────────────
const MainPdfPage = ({ pageNumber, zoom, highlights, activeToolbarTool, handleRemoveHighlight }) => {
  const [inView, setInView] = useState(pageNumber <= 3);
  const pageRef = useRef(null);

  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
        }
      },
      { rootMargin: '800px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pageHighlights = highlights.filter(h => h.page === pageNumber && h.rects);
  const estimatedHeight = Math.round(750 * (zoom / 100));

  return (
    <div
      ref={pageRef}
      id={`pdf-page-${pageNumber}`}
      className="pdf-page-container"
      style={{ position: 'relative', minHeight: inView ? 'auto' : `${estimatedHeight}px` }}
    >
      {inView ? (
        <div className="pdf-page-overlay-wrapper">
          <Page 
            pageNumber={pageNumber} 
            renderTextLayer={true}
            renderAnnotationLayer={true}
            scale={zoom / 100}
            className="pdf-page-actual"
            loading={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: `${estimatedHeight}px`, color: '#888' }}>
                Loading Page {pageNumber}...
              </div>
            }
          />
          {pageHighlights.map(h => (
            <React.Fragment key={`hl_${h.id}`}>
              {h.rects.map((r, rIdx) => (
                <div
                  key={`hl_rect_${h.id}_${rIdx}`}
                  className={`pdf-highlight-mark ${activeToolbarTool === 'eraser' ? 'eraser-hover' : ''}`}
                  title={activeToolbarTool === 'eraser' ? 'Click to erase highlight' : `${h.note ? `Note: ${h.note}\n` : ''}Highlighted: "${h.selected_text}"`}
                  onClick={(e) => {
                    if (activeToolbarTool === 'eraser') {
                      e.stopPropagation();
                      handleRemoveHighlight(h.id);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    left: `${r.left * 100}%`,
                    top: `${r.top * 100}%`,
                    width: `${r.width * 100}%`,
                    height: `${r.height * 100}%`,
                    backgroundColor: `${h.color}73`,
                    borderBottom: `2px solid ${h.color}`,
                    borderRadius: '2px',
                    pointerEvents: 'auto',
                    cursor: activeToolbarTool === 'eraser' ? 'pointer' : 'default',
                    zIndex: 15
                  }}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: `${estimatedHeight}px`, color: '#666', fontSize: '13px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
          Page {pageNumber}
        </div>
      )}
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────
export const PdfViewer = ({ 
  doc, 
  onClose, 
  isLeftSidebarOpen = true, 
  isRightSidebarOpen = true,
  onToggleRightSidebar,
  isFullScreen = false,
  onToggleFullScreen,
  onPdfLoaded,
  onUsageChanged,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(null);
  const [zoom, setZoom] = useState(150);
  const [activeToolbarTool, setActiveToolbarTool] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(300);
  const [remotePdfUrl, setRemotePdfUrl] = useState(null);
  const [pdfLoadError, setPdfLoadError] = useState(null);
  const [versions, setVersions] = useState([]);
  const [activeVersionId, setActiveVersionId] = useState('');
  
  // Interactive tool states & history for Undo
  const [pageInputVal, setPageInputVal] = useState('1');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [highlights, setHighlights] = useState([]);
  const [highlightColor, setHighlightColor] = useState('#ffea00');
  const [noteModal, setNoteModal] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');

  const handleRemoveHighlight = useCallback(async (id) => {
    try {
      await deleteAnnotation(doc.id, id);
      setHighlights((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      alert(`Could not delete annotation: ${error.message}`);
    }
  }, [doc.id]);

  const handleUndo = useCallback(() => {
    const last = highlights[highlights.length - 1];
    if (last) handleRemoveHighlight(last.id);
  }, [highlights, handleRemoveHighlight]);

  const handleClearHighlights = async () => {
    try {
      await Promise.all(highlights.map((item) => deleteAnnotation(doc.id, item.id)));
      setHighlights([]);
    } catch (error) {
      alert(`Could not clear annotations: ${error.message}`);
    }
  };

  const closeNoteModal = () => {
    setNoteModal(null);
    setNoteDraft('');
  };

  const handleEditNote = (annotation) => {
    setNoteDraft(annotation.note || '');
    setNoteModal({ type: 'edit', annotation });
  };

  const handleNoteSubmit = async () => {
    if (!noteModal) return;
    try {
      const note = noteDraft.trim() || null;
      if (noteModal.type === 'edit') {
        const updated = await updateAnnotation(doc.id, noteModal.annotation.id, { note });
        setHighlights((items) => items.map((item) => item.id === updated.id ? updated : item));
      } else {
        const created = await Promise.all(noteModal.annotations.map(({ page, rects }) => createAnnotation(doc.id, {
          page,
          rects,
          selected_text: noteModal.selectedText,
          color: noteModal.color,
          note,
        })));
        setHighlights((items) => [...items, ...created]);
      }
      closeNoteModal();
    } catch (error) {
      alert(`Could not save note: ${error.message}`);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo]);
  
  const chatEndRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const containerRef = useRef(null);
  const isScrollingProgrammatically = useRef(false);
  const pdfDocumentRef = useRef(null);
  const pageTextCacheRef = useRef(new Map());
  const searchRequestRef = useRef(0);
  
  const totalPages = numPages || 1;
  const pdfSource = activeVersionId ? remotePdfUrl : (doc.fileObject || remotePdfUrl);

  const handleChatResizeStart = (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = chatPanelWidth;
    const resize = (moveEvent) => {
      const width = Math.min(520, Math.max(300, startWidth + startX - moveEvent.clientX));
      setChatPanelWidth(width);
    };
    const stop = () => {
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', stop);
  };

  useEffect(() => {
    setPageInputVal(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    if (doc.fileObject && !activeVersionId) {
      setRemotePdfUrl(null);
      setPdfLoadError(null);
      return undefined;
    }

    let objectUrl;
    let cancelled = false;
    setRemotePdfUrl(null);
    setPdfLoadError(null);
    fetchDocumentFile(doc.id, activeVersionId || undefined)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setRemotePdfUrl(objectUrl);
        if (!activeVersionId) onPdfLoaded?.(doc.id, blob);
      })
      .catch((error) => {
        if (!cancelled) setPdfLoadError(error.message);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id, doc.fileObject, activeVersionId, onPdfLoaded]);

  // ── Reset chat and load session whenever the open document changes ──────────
  useEffect(() => {
    let cancelled = false; // race-condition guard: discard responses for previous doc

    const loadSession = async () => {
      // 1. Immediately clear stale state so the previous doc's messages aren't visible.
      setMessages([]);
      setSessionId(null);
      setChatInput('');
      setChatLoading(true);
      setHighlights([]);
      closeNoteModal();
      setActiveVersionId('');
      setNumPages(null);
      setCurrentPage(1);
      setSearchQuery('');
      setSearchResults([]);
      setCurrentMatchIdx(0);
      pdfDocumentRef.current = null;
      pageTextCacheRef.current = new Map();

      try {
        // 2. Find the most-recent session for this document.
        const sessions = await fetchChatSessions(doc.id);
        if (cancelled) return;

        if (sessions && sessions.length > 0) {
          // 3a. Session exists — load its messages.
          const latestSession = sessions[0]; // already ordered newest-first from backend
          const history = await fetchSessionMessages(latestSession.id);
          if (cancelled) return;

          setSessionId(latestSession.id);
          if (history && history.length > 0) {
            setMessages(history.map(toFrontendMsg));
          } else {
            setMessages(makeWelcomeMessages());
          }
        } else {
          // 3b. No session yet — show welcome message; session created lazily on first send.
          setMessages(makeWelcomeMessages());
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[Lipi] Failed to load chat session:', err);
        // On error, show welcome rather than leaving the chat blank or stale.
        setMessages(makeWelcomeMessages());
      } finally {
        if (!cancelled) setChatLoading(false);
      }
    };

    loadSession();

    return () => {
      cancelled = true; // cleanup: prevent stale response from overwriting new doc state
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  useEffect(() => {
    fetchDocumentVersions(doc.id).then(setVersions).catch((error) => console.error('[Lipi] Failed to load versions:', error));
  }, [doc.id]);

  useEffect(() => {
    let cancelled = false;
    fetchAnnotations(doc.id)
      .then((items) => { if (!cancelled) setHighlights(items); })
      .catch((error) => { if (!cancelled) console.error('[Lipi] Failed to load annotations:', error); });
    return () => { cancelled = true; };
  }, [doc.id]);

  const onDocumentLoadSuccess = (pdf) => {
    pdfDocumentRef.current = pdf;
    pageTextCacheRef.current = new Map();
    setNumPages(pdf.numPages);
    setCurrentPage(1);
  };

  const scrollToPage = (pageNumber) => {
    const page = Math.min(totalPages, Math.max(1, pageNumber));
    setCurrentPage(page);
    setPageInputVal(String(page));
    isScrollingProgrammatically.current = true;
    const pageEl = document.getElementById(`pdf-page-${page}`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => {
      isScrollingProgrammatically.current = false;
    }, 800);
  };

  const handlePageInputChange = (e) => {
    setPageInputVal(e.target.value);
  };

  const handlePageInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      const parsed = parseInt(pageInputVal, 10);
      if (!isNaN(parsed)) {
        scrollToPage(parsed);
      } else {
        setPageInputVal(String(currentPage));
      }
    }
  };

  const handlePageInputBlur = () => {
    const parsed = parseInt(pageInputVal, 10);
    if (!isNaN(parsed)) {
      scrollToPage(parsed);
    } else {
      setPageInputVal(String(currentPage));
    }
  };

  const handleScroll = () => {
    if (isScrollingProgrammatically.current || !containerRef.current) return;
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const pageElements = container.querySelectorAll('.pdf-page-container');

    for (let i = 0; i < pageElements.length; i++) {
      const el = pageElements[i];
      const rect = el.getBoundingClientRect();
      if (rect.top <= containerRect.top + containerRect.height * 0.4 && rect.bottom >= containerRect.top + 100) {
        const pageNum = i + 1;
        setCurrentPage((prev) => (prev !== pageNum ? pageNum : prev));
        break;
      }
    }
  };

  // Search logic
  const handleSearchChange = async (query) => {
    setSearchQuery(query);
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const requestId = ++searchRequestRef.current;
    if (!normalizedQuery) {
      setSearchResults([]);
      setCurrentMatchIdx(0);
      setIsSearching(false);
      return;
    }

    const pdf = pdfDocumentRef.current;
    if (!pdf) return;
    setIsSearching(true);
    try {
      const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
        const pageNumber = index + 1;
        let text = pageTextCacheRef.current.get(pageNumber);
        if (text === undefined) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          text = content.items.map((item) => item.str).join(' ');
          pageTextCacheRef.current.set(pageNumber, text);
        }
        const matchIndex = text.toLocaleLowerCase().indexOf(normalizedQuery);
        if (matchIndex < 0) return null;
        const start = Math.max(0, matchIndex - 45);
        const end = Math.min(text.length, matchIndex + normalizedQuery.length + 70);
        return { page: pageNumber, text: `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}` };
      }));
      if (requestId !== searchRequestRef.current) return;
      const matches = pages.filter(Boolean);
      setSearchResults(matches);
      setCurrentMatchIdx(0);
      if (matches.length > 0) scrollToPage(matches[0].page);
    } catch (error) {
      if (requestId === searchRequestRef.current) {
        console.error('[Lipi] Search failed:', error);
        setSearchResults([]);
      }
    } finally {
      if (requestId === searchRequestRef.current) setIsSearching(false);
    }
  };

  const handleNextMatch = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % searchResults.length;
    setCurrentMatchIdx(nextIdx);
    scrollToPage(searchResults[nextIdx].page);
  };

  const handlePrevMatch = () => {
    if (searchResults.length === 0) return;
    const prevIdx = (currentMatchIdx - 1 + searchResults.length) % searchResults.length;
    setCurrentMatchIdx(prevIdx);
    scrollToPage(searchResults[prevIdx].page);
  };

  // Text Highlight logic
  const handleTextSelection = async () => {
    if (!['highlight', 'note'].includes(activeToolbarTool)) return;
    if (activeVersionId) {
      alert('Switch to the original document to edit annotations.');
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selectedText = selection.toString().trim();
    if (!selectedText) return;
    try {
      const range = selection.getRangeAt(0);
      const clientRects = Array.from(range.getClientRects());
      
      if (clientRects.length === 0) return;

      const annotationsByPage = new Map();
      clientRects.filter((rect) => rect.width > 0 && rect.height > 0).forEach((rect) => {
        const element = document.elementFromPoint(rect.left + 1, rect.top + 1);
        const pageElement = element?.closest('.react-pdf__Page');
        const pageContainer = pageElement?.closest('.pdf-page-container');
        if (!pageElement || !pageContainer) return;

        const page = Number(pageContainer.id.replace('pdf-page-', ''));
        const pageRect = pageElement.getBoundingClientRect();
        const normalizedRect = {
          left: (rect.left - pageRect.left) / pageRect.width,
          top: (rect.top - pageRect.top) / pageRect.height,
          width: rect.width / pageRect.width,
          height: rect.height / pageRect.height,
        };
        annotationsByPage.set(page, [...(annotationsByPage.get(page) || []), normalizedRect]);
      });

      selection.removeAllRanges();
      const annotations = [...annotationsByPage.entries()].map(([page, rects]) => ({ page, rects }));
      if (annotations.length === 0) return;

      if (activeToolbarTool === 'note') {
        setNoteDraft('');
        setNoteModal({ type: 'create', annotations, selectedText, color: highlightColor });
        return;
      }

      const created = await Promise.all(annotations.map(({ page, rects }) => createAnnotation(doc.id, {
        page,
        rects,
        selected_text: selectedText,
        color: highlightColor,
        note: null,
      })));
      setHighlights((items) => [...items, ...created]);
    } catch (err) {
      console.error('Selection error:', err);
    }
  };

  const exportCanvasesAsPdf = (canvases) => {
    const encoder = new TextEncoder();
    const chunks = [];
    let curOffset = 0;
    const objectOffsets = {};

    const appendBytes = (bytes) => {
      chunks.push(bytes);
      curOffset += bytes.length;
    };

    const appendString = (str) => {
      appendBytes(encoder.encode(str));
    };

    const startObject = (objId) => {
      objectOffsets[objId] = curOffset;
      appendString(`${objId} 0 obj\n`);
    };

    const numPages = canvases.length;
    const pageImages = canvases.map(canvas => {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const base64 = dataUrl.split(',')[1];
      const binaryStr = atob(base64);
      const imgBytes = new Uint8Array(binaryStr.length);
      for (let b = 0; b < binaryStr.length; b++) {
        imgBytes[b] = binaryStr.charCodeAt(b);
      }
      return {
        width: canvas.width,
        height: canvas.height,
        bytes: imgBytes
      };
    });

    const pageRefs = Array.from({ length: numPages }, (_, i) => `${3 + i * 3} 0 R`).join(' ');

    // 1. PDF Header
    appendString('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');

    // 2. Catalog (Obj 1)
    startObject(1);
    appendString('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // 3. Pages (Obj 2)
    startObject(2);
    appendString(`<< /Type /Pages /Kids [${pageRefs}] /Count ${numPages} >>\nendobj\n`);

    // 4. Each Page, Image, and Content Stream
    for (let i = 0; i < numPages; i++) {
      const img = pageImages[i];
      const pageObjId = 3 + i * 3;
      const imgObjId = pageObjId + 1;
      const contentObjId = pageObjId + 2;

      const ptW = Math.round(img.width * 0.75);
      const ptH = Math.round(img.height * 0.75);

      // Page Object
      startObject(pageObjId);
      appendString(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptW} ${ptH}] /Resources << /XObject << /Im${i} ${imgObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`);

      // Image Object
      startObject(imgObjId);
      appendString(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
      appendBytes(img.bytes);
      appendString('\nendstream\nendobj\n');

      // Content Stream Object
      const streamContent = `q ${ptW} 0 0 ${ptH} 0 0 cm /Im${i} Do Q\n`;
      const streamBytes = encoder.encode(streamContent);
      startObject(contentObjId);
      appendString(`<< /Length ${streamBytes.length} >>\nstream\n`);
      appendBytes(streamBytes);
      appendString('endstream\nendobj\n');
    }

    // 5. XRef Table
    const totalObjects = 2 + numPages * 3;
    const xrefStart = curOffset;

    let xrefStr = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \r\n`;
    for (let objId = 1; objId <= totalObjects; objId++) {
      const off = String(objectOffsets[objId]).padStart(10, '0');
      xrefStr += `${off} 00000 n \r\n`;
    }
    xrefStr += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    appendString(xrefStr);

    return new Blob(chunks, { type: 'application/pdf' });
  };

  const downloadPdf = (blob, filename) => {
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  const createHighlightedPdf = () => {
    const container = containerRef.current;
    const pageContainers = container ? container.querySelectorAll('.pdf-page-container') : [];

    if (pageContainers.length > 0) {
      const exportCanvases = [];
      pageContainers.forEach((pageEl, i) => {
        const origCanvas = pageEl.querySelector('canvas');
        const exportCanvas = document.createElement('canvas');

        if (origCanvas) {
          exportCanvas.width = origCanvas.width;
          exportCanvas.height = origCanvas.height;
          const ctx = exportCanvas.getContext('2d');
          ctx.drawImage(origCanvas, 0, 0);

          const pageHighlights = highlights.filter(h => h.page === (i + 1));
          ctx.fillStyle = 'rgba(255, 235, 59, 0.45)';
          ctx.strokeStyle = '#ffcc00';
          ctx.lineWidth = 2;

          pageHighlights.forEach(h => {
            if (h.rects) {
              h.rects.forEach(r => {
                const x = r.left * origCanvas.width;
                const y = r.top * origCanvas.height;
                const w = r.width * origCanvas.width;
                const hHeight = r.height * origCanvas.height;
                ctx.fillRect(x, y, w, hHeight);
                ctx.strokeRect(x, y, w, hHeight);
              });
            }
          });
        } else {
          exportCanvas.width = 800;
          exportCanvas.height = 1000;
          const ctx = exportCanvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 800, 1000);
          ctx.fillStyle = '#111111';
          ctx.font = '24px Poppins, sans-serif';
          ctx.fillText(`Lipi AI Document - Page ${i + 1}`, 50, 60);

          const pageHighlights = highlights.filter(h => h.page === (i + 1));
          ctx.fillStyle = 'rgba(255, 235, 59, 0.45)';
          pageHighlights.forEach(h => {
            if (h.rects) {
              h.rects.forEach(r => {
                ctx.fillRect(r.left * exportCanvas.width, r.top * exportCanvas.height, r.width * exportCanvas.width, r.height * exportCanvas.height);
              });
            }
          });
        }
        exportCanvases.push(exportCanvas);
      });

      return exportCanvasesAsPdf(exportCanvases);
    }
    return null;
  };

  // Download logic: Exports a single PDF document with all baked highlights
  const handleDownload = () => {
    if (highlights.length === 0) {
      const activeVersion = versions.find((version) => version.id === activeVersionId);
      const file = doc.fileObject && !activeVersionId
        ? Promise.resolve(doc.fileObject)
        : fetchDocumentFile(doc.id, activeVersionId || undefined);
      file.then((pdf) => downloadPdf(pdf, activeVersion?.filename || doc.name)).catch((error) => alert(`Download failed: ${error.message}`));
      return;
    }
    const pdf = createHighlightedPdf();
    if (pdf) downloadPdf(pdf, doc.name.replace(/\.pdf$/i, '') + '_highlighted.pdf');
  };

  const handleSave = async () => {
    if (highlights.length === 0) {
      alert('Add a highlight before saving the highlighted PDF to cloud.');
      return;
    }
    setIsSaving(true);
    try {
      const version = await exportAnnotations(doc.id);
      setVersions((items) => [version, ...items]);
      setActiveVersionId(version.id);
      onUsageChanged?.();
      alert('Annotated PDF exported as a new cloud version.');
    } catch (error) {
      alert(`Save failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Print logic
  const handlePrint = async () => {
    try {
      const file = doc.fileObject && !activeVersionId
        ? doc.fileObject
        : await fetchDocumentFile(doc.id, activeVersionId || undefined);
      const fileUrl = URL.createObjectURL(file);
      const printWin = window.open(fileUrl, '_blank');
      if (printWin) {
        printWin.focus();
        setTimeout(() => printWin.print(), 600);
      } else {
        window.print();
      }
    } catch (error) {
      alert(`Print failed: ${error.message}`);
    }
  };

  const scrollChatBottom = () => {
    setTimeout(() => {
      if (chatMessagesRef.current) {
        chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
      }
    }, 80);
  };

  const handleSend = async (text) => {
    const query = text || chatInput.trim();
    if (!query || chatLoading) return; // block sends while session is loading
    setChatInput('');

    const currentDocId = doc.id; // capture at send-time
    const userMsg = { id: Date.now(), role: 'user', text: query, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);
    scrollChatBottom();

    try {
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const sessionData = await createChatSession(currentDocId);
        currentSessionId = sessionData.id; // backend returns 'id'
        setSessionId(currentSessionId);
      }

      const queryData = await querySession(currentSessionId, query);
      
      const aiMsg = { 
        id: Date.now() + 1, 
        role: 'assistant', 
        text: queryData.answer, 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      };
      
      setMessages((prev) => [...prev, aiMsg]);
      onUsageChanged?.();
    } catch (error) {
      console.error('[Lipi] Chat error:', error);
      const errMsg = { 
        id: Date.now() + 1, 
        role: 'error', 
        text: error.message || 'Unknown error occurred.', 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
      scrollChatBottom();
    }
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="viewer-root">
      {/* ── Viewer Toolbar ── */}
      <div className="viewer-toolbar">
        <div className="toolbar-left">
          <div className="toolbar-file-info">
            <span className="toolbar-filename">{doc.name.length > 40 ? doc.name.slice(0, 38) + '…' : doc.name}</span>
            <span className="toolbar-filemeta">{doc.size}</span>
            {versions.length > 0 && (
              <select className="document-version-select" value={activeVersionId} onChange={(event) => setActiveVersionId(event.target.value)}>
                <option value="">Original</option>
                {versions.map((version) => <option key={version.id} value={version.id}>{version.filename}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="toolbar-center">
          {/* Page nav */}
          <button 
            className="tb-btn" 
            onClick={() => scrollToPage(currentPage - 1)} 
            disabled={currentPage === 1} 
            title="Previous Page"
          >
            <IcChevronLeft />
          </button>
          <div className="page-input-group">
            <input
              className="page-num-input"
              type="text"
              value={pageInputVal}
              onChange={handlePageInputChange}
              onKeyDown={handlePageInputKeyDown}
              onBlur={handlePageInputBlur}
              title="Jump to page"
            />
            <span className="page-separator">/ {totalPages}</span>
          </div>
          <button 
            className="tb-btn" 
            onClick={() => scrollToPage(currentPage + 1)} 
            disabled={currentPage === totalPages} 
            title="Next Page"
          >
            <IcChevronRight />
          </button>

          <div className="tb-divider" />

          {/* Zoom */}
          <button 
            className="tb-btn" 
            onClick={() => setZoom(z => Math.max(50, z - 10))} 
            title="Zoom Out"
          >
            <IcZoomOut />
          </button>
          <span className="zoom-label">{zoom}%</span>
          <button 
            className="tb-btn" 
            onClick={() => setZoom(z => Math.min(250, z + 10))} 
            title="Zoom In"
          >
            <IcZoomIn />
          </button>
          <button 
            className={`tb-btn ${zoom === 100 ? 'active' : ''}`} 
            onClick={() => setZoom(z => z === 100 ? 150 : 100)} 
            title="Toggle Fit Width (100% / 150%)"
          >
            <IcFitWidth />
          </button>

          <div className="tb-divider" />

          {/* Tools */}
          <button 
            className={`tb-btn ${activeToolbarTool === 'search' ? 'active' : ''}`} 
            onClick={() => setActiveToolbarTool(t => t === 'search' ? null : 'search')} 
            title="Search in Document"
          >
            <IcSearch />
          </button>
          <button 
            className={`tb-btn ${activeToolbarTool === 'highlight' ? 'active' : ''}`} 
            onClick={() => setActiveToolbarTool(t => t === 'highlight' ? null : 'highlight')} 
            title="Highlight Tool (Select text to highlight)"
          >
            <IcHighlight />
          </button>
          <input
            className="highlight-color-input"
            type="color"
            value={highlightColor}
            onChange={(event) => setHighlightColor(event.target.value)}
            title="Highlight color"
            aria-label="Highlight color"
          />
          <button 
            className={`tb-btn ${activeToolbarTool === 'eraser' ? 'active' : ''}`} 
            onClick={() => setActiveToolbarTool(t => t === 'eraser' ? null : 'eraser')} 
            title="Eraser Tool (Click highlight mark to erase)"
          >
            <IcEraser />
          </button>
          <button 
            className="tb-btn" 
            onClick={handleUndo} 
            disabled={highlights.length === 0} 
            title="Undo (Ctrl+Z)"
          >
            <IcUndo />
          </button>
          <button
            className={`tb-btn ${activeToolbarTool === 'note' ? 'active' : ''}`}
            onClick={() => setActiveToolbarTool((tool) => tool === 'note' ? null : 'note')}
            title="Select text and add a note"
          >
            <IcAnnotate />
          </button>
        </div>

        <div className="toolbar-right">
          <button 
            className={`tb-btn ${isFullScreen ? 'active' : ''}`} 
            onClick={onToggleFullScreen} 
            title={isFullScreen ? "Exit Full Screen (Show Top Bar)" : "Toggle Full Screen (Hide Top Bar)"}
          >
            {isFullScreen ? <IcMinimize /> : <IcMaximize />}
          </button>
          <button className="tb-btn" onClick={handleSave} disabled={isSaving} title="Export annotated PDF version">
            {isSaving ? '…' : 'Export'}
          </button>
          <button className="tb-btn" onClick={handleDownload} title="Download PDF"><IcDownload /></button>
          <button className="tb-btn" onClick={handlePrint} title="Print Document"><IcPrint /></button>
          <button className="tb-btn close-viewer-btn" onClick={onClose} title="Close Viewer"><IcClose /></button>
        </div>
      </div>

      {/* ── Search Bar (when active) ── */}
      {activeToolbarTool === 'search' && (
        <div className="search-bar-strip">
          <IcSearch />
          <input 
            className="search-strip-input" 
            placeholder="Search in document…" 
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            autoFocus 
          />
          <span className="search-hint">
            {isSearching
              ? 'Searching…'
              : searchResults.length > 0 
              ? `${currentMatchIdx + 1} of ${searchResults.length} matches` 
              : searchQuery ? 'No matches' : 'Type to search'}
          </span>
          {searchResults.length > 0 && (
            <div className="search-nav-btns" style={{ display: 'flex', gap: '4px' }}>
              <button className="tb-btn" onClick={handlePrevMatch} title="Previous Match"><IcChevronLeft /></button>
              <button className="tb-btn" onClick={handleNextMatch} title="Next Match"><IcChevronRight /></button>
            </div>
          )}
          <button className="tb-btn" onClick={() => { setActiveToolbarTool(null); setSearchQuery(''); setSearchResults([]); }}><IcClose /></button>
        </div>
      )}

      {/* ── Annotation Note Modal ── */}

      {/* ── Main viewer body ── */}
      {noteModal && (
        <div className="annotation-note-overlay" onMouseDown={closeNoteModal}>
          <form
            className="annotation-note-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="annotation-note-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              handleNoteSubmit();
            }}
          >
            <div className="annotation-note-header">
              <div>
                <span className="annotation-note-kicker">ANNOTATION</span>
                <h2 id="annotation-note-title">{noteModal.type === 'edit' ? 'Edit note' : 'Add a note'}</h2>
              </div>
              <button type="button" className="annotation-note-close" onClick={closeNoteModal} aria-label="Close note dialog">
                <IcClose />
              </button>
            </div>
            {noteModal.type === 'create' && (
              <p className="annotation-note-selection">{noteModal.selectedText}</p>
            )}
            <label className="annotation-note-label" htmlFor="annotation-note-input">Your note <span>optional</span></label>
            <textarea
              id="annotation-note-input"
              className="annotation-note-input"
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Add context, a reminder, or a question…"
              autoFocus
              rows={5}
            />
            <div className="annotation-note-footer">
              <button type="button" className="annotation-note-cancel" onClick={closeNoteModal}>Cancel</button>
              <button type="submit" className="annotation-note-save">Save note</button>
            </div>
          </form>
        </div>
      )}

      <div className="viewer-body">
        
        {/* ── Left: Pages Thumbnails Panel ── */}
        {isLeftSidebarOpen && (
          <div className="pages-thumbnail-panel">
            <div className="pages-header">
              <span>PAGES</span>
              <span className="pages-count">{totalPages}</span>
            </div>
            {pdfSource ? (
              <Document file={pdfSource} loading="" error="">
                <div className="pages-list">
                  {Array.from(new Array(totalPages), (_, index) => (
                    <ThumbnailItem 
                      key={`thumb_${index}`} 
                      pageNumber={index + 1}
                      totalPages={totalPages}
                      isActive={currentPage === index + 1}
                      onClick={() => scrollToPage(index + 1)}
                    />
                  ))}
                </div>
              </Document>
            ) : <div className="pages-list pdf-loading">{pdfLoadError || 'Loading PDF...'}</div>}
            <div className="annotations-list">
              <div className="annotations-list-header">ANNOTATIONS <span>{highlights.length}</span></div>
              {highlights.map((annotation) => (
                <div className="annotation-list-item" key={annotation.id}>
                  <button className="annotation-list-main" onClick={() => scrollToPage(annotation.page)}>
                    <i style={{ backgroundColor: annotation.color }} />
                    <span>Page {annotation.page}: {annotation.selected_text}</span>
                  </button>
                  <div className="annotation-list-actions">
                    <button onClick={() => handleEditNote(annotation)} title="Edit note">Note</button>
                    <button onClick={() => handleRemoveHighlight(annotation.id)} title="Delete annotation">×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Centre: PDF Page Renderer with Continuous Scroll ── */}
        <div 
          className={`pdf-canvas-area ${['highlight', 'note'].includes(activeToolbarTool) ? 'highlight-active-cursor' : ''}`} 
          ref={containerRef} 
          onScroll={handleScroll}
          onMouseUp={handleTextSelection}
        >
          {pdfSource ? (
            <Document
              file={pdfSource}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<div className="pdf-loading">Loading PDF...</div>}
              error={<div className="pdf-error">Failed to load PDF file.</div>}
            >
              {Array.from(new Array(totalPages), (_, index) => (
                <MainPdfPage
                  key={`page_${index + 1}`}
                  pageNumber={index + 1}
                  zoom={zoom}
                  highlights={activeVersionId ? [] : highlights}
                  activeToolbarTool={activeToolbarTool}
                  handleRemoveHighlight={handleRemoveHighlight}
                />
              ))}
            </Document>
          ) : <div className="pdf-loading">{pdfLoadError || 'Loading PDF...'}</div>}

          {/* Highlight overlay hint */}
          {activeToolbarTool === 'highlight' && (
            <div className="highlight-mode-overlay" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ffea00' }} />
                Highlight Tool active — select text to highlight ({highlights.length} active)
              </span>
              {highlights.length > 0 && (
                <button 
                  onClick={handleClearHighlights}
                  style={{ 
                    background: 'rgba(0,0,0,0.2)', 
                    color: '#333', 
                    border: '1px solid rgba(0,0,0,0.3)', 
                    padding: '3px 10px', 
                    borderRadius: '12px', 
                    cursor: 'pointer', 
                    fontSize: '11px',
                    fontWeight: 600
                  }}
                >
                  Clear All
                </button>
              )}
            </div>
          )}

          {/* Eraser overlay hint */}
          {activeToolbarTool === 'eraser' && (
            <div className="highlight-mode-overlay" style={{ display: 'flex', alignItems: 'center', gap: '14px', backgroundColor: 'rgba(255, 59, 48, 0.95)', color: '#fff' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IcEraser /> Eraser Mode Active — Click any yellow highlight on the document to erase it ({highlights.length} active)
              </span>
              {highlights.length > 0 && (
                <button 
                  onClick={handleClearHighlights}
                  style={{ 
                    background: 'rgba(255,255,255,0.25)', 
                    color: '#fff', 
                    border: 'none', 
                    padding: '3px 10px', 
                    borderRadius: '12px', 
                    cursor: 'pointer', 
                    fontSize: '11px',
                    fontWeight: 600
                  }}
                >
                  Erase All
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Right: collapsible AI Chat panel ── */}
        {isRightSidebarOpen && (
          <div className="side-panel right-panel" style={{ width: `${chatPanelWidth}px` }}>
            <div
              className="chat-resize-handle"
              role="separator"
              aria-label="Resize chat panel"
              aria-orientation="vertical"
              onPointerDown={handleChatResizeStart}
            />
            <div className="panel-inner chat-panel-inner">
              <div className="panel-header ai-header">
                <IcSparkle /><span>Lipi AI</span>
                <span className="ai-badge">Beta</span>
              </div>

              <div className="chat-messages" ref={chatMessagesRef}>
                {chatLoading ? (
                  <div className="chat-msg assistant">
                    <div className="ai-avatar"><IcSparkle /></div>
                    <div className="msg-bubble typing-bubble">
                      <span className="dot"></span><span className="dot"></span><span className="dot"></span>
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={`chat-msg ${msg.role}`}>
                      {(msg.role === 'assistant' || msg.role === 'error') && (
                        <div className={`ai-avatar ${msg.role === 'error' ? 'error-avatar' : ''}`}>
                          {msg.role === 'error'
                            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            : <IcSparkle />}
                        </div>
                      )}
                      <div className="msg-bubble-wrap">
                        <div className="msg-bubble">{renderMarkdown(msg.text)}</div>
                        <div className="msg-meta">
                          <span className="msg-time">{msg.time}</span>
                          {msg.role === 'assistant' && (
                            <div className="msg-actions">
                              <button className="msg-action-btn" title="Copy" onClick={() => handleCopy(msg.id, msg.text)}>
                                {copiedId === msg.id ? '\u2713' : <IcCopy />}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {isTyping && (
                  <div className="chat-msg assistant">
                    <div className="ai-avatar"><IcSparkle /></div>
                    <div className="msg-bubble typing-bubble">
                      <span className="dot"></span><span className="dot"></span><span className="dot"></span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Suggested prompts — only when loaded and no real conversation yet */}
              {!chatLoading && messages.length <= 1 && (
                <div className="suggested-prompts">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button key={p} className="suggest-chip" onClick={() => handleSend(p)}>{p}</button>
                  ))}
                </div>
              )}

              {/* Chat Input */}
              <div className="chat-input-bar">
                <textarea
                  className="chat-textarea"
                  placeholder="Ask anything about this document…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  rows={2}
                />
                <button
                  className={`chat-send-btn ${chatInput.trim() ? 'enabled' : ''}`}
                  onClick={() => handleSend()}
                  disabled={!chatInput.trim()}
                  aria-label="Send message"
                >
                  <IcSend />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Right: side panel rail toggle icon (Stays visible to toggle/unhide) ── */}
        <div className="side-icon-rail right-rail">
          <button
            className={`rail-btn ${isRightSidebarOpen ? 'active' : ''}`}
            onClick={onToggleRightSidebar}
            title="Toggle AI Chat Panel"
          >
            <IcSparkle />
          </button>
        </div>

      </div>
    </div>
  );
};
