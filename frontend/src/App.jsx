import { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const API_BASE = 'http://localhost:8000/api';

import { getTruncatedTitle } from './utils/helpers.js';
import { getFriendlyErrorMessage } from './utils/errorHandling.js';
import { PdfThumbnail } from './components/PdfThumbnail.jsx';
import { PdfPageRender } from './components/PdfPageRender.jsx';

function App() {
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('gemini-api-key') || '');
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputValue, setPageInputValue] = useState('1');
  const [thumbnails, setThumbnails] = useState([]);

  // View state: 'home' or 'reader'
  const [currentView, setCurrentView] = useState('home');
  const [homeTab, setHomeTab] = useState('documents'); // 'documents' | 'settings'

  // Recently accessed files (persisted in localStorage)
  const [recentFiles, setRecentFiles] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('lipi-ai-recent') || localStorage.getItem('wikibuddy-recent') || '[]');
    } catch { return []; }
  });

  // File currently being shared (triggers share modal)
  const [sharingFile, setSharingFile] = useState(null);

  // Theme state: default light mode as requested in screenshot, toggleable
  const [theme, setTheme] = useState(() => localStorage.getItem('app-theme') || 'light');

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isIngested, setIsIngested] = useState(false);
  const [toast, setToast] = useState(null);

  // Search by Keyword States
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef(null);

  const viewportRef = useRef(null);
  const pagesListRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);

  const [copilotWidth, setCopilotWidth] = useState(320);
  const [isPagesSidebarOpen, setIsPagesSidebarOpen] = useState(true);
  const [isFileDropdownOpen, setIsFileDropdownOpen] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(true);
  const [modelMode, setModelMode] = useState('ollama'); // 'ollama' | 'gemini'
  const [extractorMode, setExtractorMode] = useState(() => localStorage.getItem('extractor-mode') || 'pymupdf');
  const textareaRef = useRef(null);

  // Auto-resize textarea height as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 160)}px`;
      
      const isSingleLineOrEmpty = !inputValue || (!inputValue.includes('\n') && scrollHeight < 36);
      if (isSingleLineOrEmpty) {
        textareaRef.current.style.overflowY = 'hidden';
      } else {
        textareaRef.current.style.overflowY = 'auto';
      }
    }
  }, [inputValue]);

  // App initialization & backend healthcheck connection
  useEffect(() => {
    let active = true;
    const checkBackend = async () => {
      try {
        const res = await fetch('http://localhost:8000/');
        if (res.ok && active) {
          setTimeout(() => {
            if (active) setIsAppLoading(false);
          }, 800);
          return;
        }
      } catch (e) {
        // Backend not ready yet
      }
      
      if (active) {
        setTimeout(checkBackend, 400); // Poll every 400ms
      }
    };

    checkBackend();

    return () => {
      active = false;
    };
  }, []);
  
  // Dynamic scale states
  const [zoomFactor, setZoomFactor] = useState(1.0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [calculatedScale, setCalculatedScale] = useState(1.0);

  const isResizingRef = useRef(false);

  // Multi-document states
  const [openDocuments, setOpenDocuments] = useState([]);
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const isSwitchingTabRef = useRef(false);

  // Synchronize the openDocuments list with the active document's local states
  useEffect(() => {
    if (!activeDocumentId || isSwitchingTabRef.current) return;
    setOpenDocuments(prev => prev.map(doc => {
      if (doc.id === activeDocumentId) {
        return {
          ...doc,
          pdfFile,
          pdfDoc,
          numPages,
          currentPage,
          messages,
          isIngested,
          isLoading,
          zoomFactor,
          searchQuery,
          searchResults,
          searchMatchIndex,
        };
      }
      return doc;
    }));
  }, [
    activeDocumentId,
    pdfFile,
    pdfDoc,
    numPages,
    currentPage,
    messages,
    isIngested,
    isLoading,
    zoomFactor,
    searchQuery,
    searchResults,
    searchMatchIndex,
  ]);

  const switchToDocument = (docId) => {
    const targetDoc = openDocuments.find(d => d.id === docId);
    if (!targetDoc) return;

    isSwitchingTabRef.current = true;
    
    setPdfFile(targetDoc.pdfFile);
    setPdfDoc(targetDoc.pdfDoc);
    setNumPages(targetDoc.numPages);
    setCurrentPage(targetDoc.currentPage);
    setPageInputValue(targetDoc.currentPage.toString());
    setMessages(targetDoc.messages || []);
    setIsIngested(targetDoc.isIngested || false);
    setIsLoading(targetDoc.isLoading || false);
    setZoomFactor(targetDoc.zoomFactor || 1.0);
    setSearchQuery(targetDoc.searchQuery || '');
    setSearchResults(targetDoc.searchResults || []);
    setSearchMatchIndex(targetDoc.searchMatchIndex || 0);
    setActiveDocumentId(docId);

    setTimeout(() => {
      isSwitchingTabRef.current = false;
    }, 50);
  };

  const closeDocument = (docId) => {
    const index = openDocuments.findIndex(d => d.id === docId);
    if (index === -1) return;

    const updatedDocs = openDocuments.filter(d => d.id !== docId);
    setOpenDocuments(updatedDocs);

    if (activeDocumentId === docId) {
      if (updatedDocs.length > 0) {
        const nextActiveIndex = Math.min(index, updatedDocs.length - 1);
        const nextDocId = updatedDocs[nextActiveIndex].id;
        const targetDoc = updatedDocs[nextActiveIndex];
        
        isSwitchingTabRef.current = true;
        setPdfFile(targetDoc.pdfFile);
        setPdfDoc(targetDoc.pdfDoc);
        setNumPages(targetDoc.numPages);
        setCurrentPage(targetDoc.currentPage);
        setPageInputValue(targetDoc.currentPage.toString());
        setMessages(targetDoc.messages || []);
        setIsIngested(targetDoc.isIngested || false);
        setIsLoading(targetDoc.isLoading || false);
        setZoomFactor(targetDoc.zoomFactor || 1.0);
        setSearchQuery(targetDoc.searchQuery || '');
        setSearchResults(targetDoc.searchResults || []);
        setSearchMatchIndex(targetDoc.searchMatchIndex || 0);
        setActiveDocumentId(nextDocId);
        
        setTimeout(() => {
          isSwitchingTabRef.current = false;
        }, 50);
      } else {
        setActiveDocumentId(null);
        setPdfFile(null);
        setPdfDoc(null);
        setNumPages(0);
        setCurrentPage(1);
        setMessages([]);
        setIsIngested(false);
        setIsLoading(false);
        setCurrentView('home');
      }
    }
  };

  // Synchronize theme attribute on body/documentElement
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleClearAllData = async () => {
    if (!window.confirm("Are you sure you want to clear all app data? This will permanently delete all uploaded documents, embeddings, and chat history.")) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/clear-data`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to clear data on the server.');
      }
      
      // Reset frontend states
      setOpenDocuments([]);
      setActiveDocumentId(null);
      setPdfFile(null);
      setPdfDoc(null);
      setNumPages(0);
      setCurrentPage(1);
      setMessages([]);
      setIsIngested(false);
      setIsLoading(false);
      setRecentFiles([]);
      localStorage.removeItem('lipi-ai-recent');
      localStorage.removeItem('wikibuddy-recent');
      
      showToast("All application data has been successfully cleared.", "success");
    } catch (err) {
      showToast(`Error clearing data: ${err.message}`, "error");
    }
  };

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.dropdown-container')) {
        setIsFileDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleMouseMove = (e) => {
    if (!isResizingRef.current) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth > 240 && newWidth < 600) {
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

  const startResizing = () => {
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

  // Ctrl+F Keyboard Shortcut for Keyword Search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isSearchOpen]);

  // Smooth, non-jittery ResizeObserver with 60ms debounce for scaling
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    let timer;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.contentRect) {
          clearTimeout(timer);
          timer = setTimeout(() => {
            setContainerWidth(entry.contentRect.width);
          }, 60);
        }
      }
    });

    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [isPagesSidebarOpen, isCopilotOpen]);

  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Sync page input value with currentPage state
  useEffect(() => {
    setPageInputValue(currentPage.toString());
  }, [currentPage]);

  // Smoothly center active thumbnail in left sidebar as user scrolls through pages
  useEffect(() => {
    if (!currentPage || !pagesListRef.current) return;
    const thumbElement = document.getElementById(`thumb-page-${currentPage}`);
    const container = pagesListRef.current;
    if (thumbElement && container) {
      const containerRect = container.getBoundingClientRect();
      const thumbRect = thumbElement.getBoundingClientRect();
      const relativeTop = thumbRect.top - containerRect.top;
      
      const targetScrollTop = container.scrollTop + relativeTop - (containerRect.height / 2) + (thumbRect.height / 2);
      
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
    }
  }, [currentPage]);

  // Callback when a page scrolls into view during manual user scrolling
  const handlePageVisible = useCallback((pageNum) => {
    if (isProgrammaticScrollRef.current) return;
    setCurrentPage(pageNum);
  }, []);

  // Scroll main viewport to a specific page on click or page input
  const jumpToPage = (pageNum) => {
    if (pageNum < 1 || pageNum > numPages) return;
    
    isProgrammaticScrollRef.current = true;
    setCurrentPage(pageNum);

    const pageElement = document.getElementById(`pdf-page-${pageNum}`);
    const viewport = viewportRef.current;

    if (pageElement && viewport) {
      const viewportRect = viewport.getBoundingClientRect();
      const pageRect = pageElement.getBoundingClientRect();
      const relativeTop = pageRect.top - viewportRect.top;
      const targetScrollTop = viewport.scrollTop + relativeTop - 12;

      viewport.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });

      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 700);
    } else {
      isProgrammaticScrollRef.current = false;
    }
  };

  // Perform Keyword Search across PDF pages counting every word occurrence
  const performSearch = async (query) => {
    if (!pdfDoc || !query.trim()) {
      setSearchResults([]);
      setSearchMatchIndex(0);
      return;
    }

    setIsSearching(true);
    const searchLower = query.toLowerCase().trim();
    const matches = [];

    try {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        
        for (const item of textContent.items) {
          if (!item.str) continue;
          const itemStrLower = item.str.toLowerCase();
          let startIndex = 0;
          while (true) {
            const matchIndex = itemStrLower.indexOf(searchLower, startIndex);
            if (matchIndex === -1) break;

            matches.push({
              page: i,
              matchNumber: matches.length + 1
            });

            startIndex = matchIndex + searchLower.length;
          }
        }
      }

      setSearchResults(matches);
      if (matches.length > 0) {
        setSearchMatchIndex(0);
        jumpToPage(matches[0].page);
        showToast(`Found ${matches.length} match(es) for "${query}"`, "info");
      } else {
        setSearchMatchIndex(0);
        showToast(`No matches found for "${query}"`, "info");
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleNextMatch = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (searchMatchIndex + 1) % searchResults.length;
    setSearchMatchIndex(nextIdx);
    jumpToPage(searchResults[nextIdx].page);
  };

  const handlePrevMatch = () => {
    if (searchResults.length === 0) return;
    const prevIdx = (searchMatchIndex - 1 + searchResults.length) % searchResults.length;
    setSearchMatchIndex(prevIdx);
    jumpToPage(searchResults[prevIdx].page);
  };

  // Auto-hide toast notification
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  // Generate Thumbnails list when pdfDoc changes
  useEffect(() => {
    if (!pdfDoc) {
      setThumbnails([]);
      return;
    }

    const generateThumbnails = async () => {
      const thumbs = [];
      const total = Math.min(pdfDoc.numPages, 100);
      for (let i = 1; i <= total; i++) {
        thumbs.push(i);
      }
      setThumbnails(thumbs);
    };

    generateThumbnails();
  }, [pdfDoc]);

  // Auto-Ingest on PDF load
  const triggerIngestion = async (fileObj, isLocalPath = false, docId) => {
    const updateDoc = (fields) => {
      setOpenDocuments(prev => prev.map(doc => {
        if (doc.id === docId) {
          return { ...doc, ...fields };
        }
        return doc;
      }));
      setActiveDocumentId(currentActiveId => {
        if (currentActiveId === docId) {
          if (fields.messages !== undefined) setMessages(fields.messages);
          if (fields.isIngested !== undefined) setIsIngested(fields.isIngested);
          if (fields.isLoading !== undefined) setIsLoading(fields.isLoading);
        }
        return currentActiveId;
      });
    };

    updateDoc({
      isLoading: true,
      isIngested: false,
      messages: [
        { 
          role: 'assistant', 
          content: `**Ingesting document for AI Copilot...**\n\n*Parsing layout structure and extracting vector embeddings...*`, 
          isIngesting: true 
        }
      ]
    });

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
        formData.append('extractor', extractorMode);
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
      updateDoc({
        isLoading: false,
        isIngested: true,
        messages: [
          { 
            role: 'assistant', 
            content: `**Ingestion Complete!** (${data.chunks_created} vectors ready)\n\nI have analyzed **${getTruncatedTitle(data.filename, 28)}**. Ask me questions or use quick options below to get started!`,
            isIngesting: false
          }
        ]
      });
    } catch (err) {
      updateDoc({
        isLoading: false,
        isIngested: false,
        messages: [
          { 
            role: 'assistant', 
            content: getFriendlyErrorMessage(err, 'ingest'),
            isIngesting: false,
            isError: true
          }
        ]
      });
    }
  };

  const handleOpenPdf = () => {
    fileInputRef.current?.click();
  };

  // Save a file entry to localStorage recent list
  const saveRecentFile = (filename, size) => {
    setRecentFiles(prev => {
      const filtered = prev.filter(f => f.filename !== filename);
      const updated = [{ filename, size, timestamp: Date.now() }, ...filtered].slice(0, 12);
      localStorage.setItem('lipi-ai-recent', JSON.stringify(updated));
      return updated;
    });
  };

  // Open a recently accessed file from the backend uploads folder
  const openRecentFile = async (entry) => {
    try {
      const docId = entry.filename;
      const existing = openDocuments.find(d => d.id === docId);
      if (existing) {
        switchToDocument(docId);
        setCurrentView('reader');
        return;
      }

      const res = await fetch(`${API_BASE}/pdf/${encodeURIComponent(entry.filename)}`);
      if (!res.ok) throw new Error('File not found on server');
      const blob = await res.blob();
      const file = new File([blob], entry.filename, { type: 'application/pdf' });

      const arrayBuffer = await blob.arrayBuffer();
      const typedarray = new Uint8Array(arrayBuffer);
      const loadingTask = pdfjsLib.getDocument({ data: typedarray });
      const doc = await loadingTask.promise;

      const newDoc = {
        id: docId,
        filename: entry.filename,
        pdfDoc: doc,
        numPages: doc.numPages,
        currentPage: 1,
        messages: [],
        isIngested: false,
        isLoading: false,
        zoomFactor: 1.0,
        searchQuery: '',
        searchResults: [],
        searchMatchIndex: 0,
      };

      setOpenDocuments(prev => [...prev, newDoc]);
      setActiveDocumentId(docId);

      setPdfFile(newDoc.filename);
      setPdfDoc(newDoc.pdfDoc);
      setNumPages(newDoc.numPages);
      setCurrentPage(newDoc.currentPage);
      setPageInputValue('1');
      setMessages(newDoc.messages);
      setIsIngested(newDoc.isIngested);
      setIsLoading(newDoc.isLoading);
      setZoomFactor(newDoc.zoomFactor);
      setSearchQuery(newDoc.searchQuery);
      setSearchResults(newDoc.searchResults);
      setSearchMatchIndex(newDoc.searchMatchIndex);

      setCurrentView('reader');
      triggerIngestion(file, false, docId);
    } catch (err) {
      showToast(`Could not open file: ${err.message}`, 'error');
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

        const docId = file.name;
        const existing = openDocuments.find(d => d.id === docId);
        if (existing) {
          switchToDocument(docId);
          setCurrentView('reader');
          return;
        }

        const newDoc = {
          id: docId,
          filename: file.name,
          pdfDoc: doc,
          numPages: doc.numPages,
          currentPage: 1,
          messages: [],
          isIngested: false,
          isLoading: false,
          zoomFactor: 1.0,
          searchQuery: '',
          searchResults: [],
          searchMatchIndex: 0,
        };

        setOpenDocuments(prev => [...prev, newDoc]);
        setActiveDocumentId(docId);

        setPdfFile(newDoc.filename);
        setPdfDoc(newDoc.pdfDoc);
        setNumPages(newDoc.numPages);
        setCurrentPage(newDoc.currentPage);
        setPageInputValue('1');
        setMessages(newDoc.messages);
        setIsIngested(newDoc.isIngested);
        setIsLoading(newDoc.isLoading);
        setZoomFactor(newDoc.zoomFactor);
        setSearchQuery(newDoc.searchQuery);
        setSearchResults(newDoc.searchResults);
        setSearchMatchIndex(newDoc.searchMatchIndex);

        setCurrentView('reader');
        saveRecentFile(file.name, file.size);
        triggerIngestion(file, false, docId);
      };
      fileReader.readAsArrayBuffer(file);
    } catch (err) {
      console.error("Error loading PDF:", err);
    }
  };

  const handleSendMessage = async (customMessage = null) => {
    const messageText = customMessage || inputValue.trim();
    if (!messageText || isLoading) return;

    setMessages(prev => {
      // If the last message was a user message with the same content, don't duplicate it
      if (prev.length > 0 && prev[prev.length - 1].role === 'user' && prev[prev.length - 1].content === messageText) {
        return prev;
      }
      return [...prev, { role: 'user', content: messageText }];
    });

    if (!customMessage) setInputValue('');
    setIsLoading(true);

    try {
      // Filter out error messages from history when passing to backend
      const validHistory = messages.filter(m => !m.isIngesting && !m.isError).map(m => [m.role, m.content]);

      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          chat_history: validHistory,
          filename: pdfFile,
          mode: modelMode,
          api_key: geminiApiKey || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Chat request failed');
      }

      const data = await response.json();
      const assistantMessage = { role: 'assistant', content: data.response };
      
      // Clean up previous error message if present at the end before adding the successful one
      setMessages(prev => {
        const clean = prev.filter(m => !m.isError);
        return [...clean, assistantMessage];
      });
    } catch (err) {
      console.error("Chat error:", err);
      
      const errorMessage = { 
        role: 'assistant', 
        content: getFriendlyErrorMessage(err, 'chat'),
        isError: true,
        rawError: err.message,
        retryMessage: messageText
      };
      
      setMessages(prev => {
        // Remove previous error messages at the end to avoid clutter
        const clean = prev.filter(m => !m.isError);
        return [...clean, errorMessage];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runQuickAction = (action) => {
    if (!isIngested) {
      showToast("Please wait for document ingestion to finish.", "error");
      return;
    }
    const prompts = {
      explain: "Explain the key concepts and overview of this document.",
      summarize: "Provide a clear, detailed summary of the main points.",
      analyze: "Analyze the core findings, methodology, and conclusions.",
      find: "Highlight key terms, definitions, and data points."
    };
    handleSendMessage(prompts[action]);
  };

  const handlePageInputChange = (e) => {
    setPageInputValue(e.target.value);
  };

  const handlePageInputSubmit = (e) => {
    if (e.key === 'Enter') {
      const p = parseInt(pageInputValue, 10);
      if (!isNaN(p) && p >= 1 && p <= numPages) {
        jumpToPage(p);
      } else {
        setPageInputValue(currentPage.toString());
      }
    }
  };

  return (
    <div className="app-container">
      {isAppLoading && (
        <div className="glass-loader-overlay" style={{ position: 'fixed', zIndex: 9999 }}>
          <div className="glass-loader-card">
            <div className="circular-spinner"></div>
            <h3>Launching Lipi AI...</h3>
            <p>Connecting to local FastAPI server and initializing workspace</p>
          </div>
        </div>
      )}
      {/* Hidden file input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept="application/pdf"
        onChange={handleFileChange}
      />

      {/* ---- TOP HEADER BAR ---- */}
      <header className="top-header">
        {/* Top Left: Hamburger menu + Document title + Keyword Search Toggle */}
        <div className="header-left">
          <button 
            className="menu-toggle-btn" 
            onClick={() => setIsPagesSidebarOpen(!isPagesSidebarOpen)}
            title="Toggle Pages Navigation"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          
          {currentView === 'home' ? (
            <span className="doc-title" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', paddingLeft: '8px' }}>
              Lipi AI
            </span>
          ) : !isSearchOpen ? (
            <div className="dropdown-container">
              <div className="doc-title-container">
                <span className="doc-title" title={pdfFile || "Northstar Annual Review 2025.pdf"} onClick={() => setIsFileDropdownOpen(!isFileDropdownOpen)} style={{ cursor: 'pointer' }}>
                  {getTruncatedTitle(pdfFile || "Northstar Annual Review 2025.pdf", 24)}
                </span>
                <button 
                  className="header-icon-btn"
                  onClick={() => setIsSearchOpen(true)}
                  title="Search by Keyword (Ctrl+F)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </button>
              </div>
              {isFileDropdownOpen && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={() => { handleOpenPdf(); setIsFileDropdownOpen(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> Open New PDF Document
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="header-search-bar">
              <input 
                ref={searchInputRef}
                type="text" 
                className="search-input"
                placeholder="Search keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (searchResults.length > 0) handleNextMatch();
                    else performSearch(searchQuery);
                  }
                }}
              />
              <button className="search-action-btn" onClick={() => performSearch(searchQuery)} title="Search">
                {isSearching ? "..." : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                )}
              </button>
              {searchResults.length > 0 && (
                <div className="search-nav-controls">
                  <span className="search-count-badge" title={`Match ${searchMatchIndex + 1} of ${searchResults.length} (Page ${searchResults[searchMatchIndex]?.page})`}>
                    {searchMatchIndex + 1}/{searchResults.length}
                  </span>
                  <button className="search-nav-btn" onClick={handlePrevMatch} title="Previous Match">⟨</button>
                  <button className="search-nav-btn" onClick={handleNextMatch} title="Next Match">⟩</button>
                </div>
              )}
              <button className="search-close-btn" onClick={() => { setIsSearchOpen(false); setSearchResults([]); setSearchQuery(''); }} title="Close Search">
                ✕
              </button>
            </div>
          )}
        </div>
 
        {/* Top Center: Page Number Indicator (< 1 / 3 >) */}
        <div className="header-center">
          {currentView === 'reader' && (
            <div className="page-indicator-pill">
              <button 
                className="page-nav-btn" 
                onClick={() => jumpToPage(currentPage - 1)}
                disabled={currentPage <= 1 || !pdfDoc}
                title="Previous Page"
              >
                ⟨
              </button>
              <div className="page-number-display">
                <input 
                  type="text" 
                  className="page-input"
                  value={pageInputValue}
                  onChange={handlePageInputChange}
                  onKeyDown={handlePageInputSubmit}
                  disabled={!pdfDoc}
                />
                <span className="page-total">/ {numPages || 1}</span>
              </div>
              <button 
                className="page-nav-btn" 
                onClick={() => jumpToPage(currentPage + 1)}
                disabled={currentPage >= numPages || !pdfDoc}
                title="Next Page"
              >
                ⟩
              </button>
            </div>
          )}
        </div>

        {/* Top Right: Zoom controls, Theme toggle, Action Button */}
        <div className="header-right">
          {currentView === 'reader' && (
            <div className="zoom-controls">
              <button className="zoom-btn" onClick={() => setZoomFactor(prev => Math.max(0.4, prev - 0.1))} title="Zoom Out">-</button>
              <span className="zoom-text" onClick={() => setZoomFactor(1.0)} title="Reset to Fit Width" style={{ cursor: 'pointer' }}>
                {Math.round(calculatedScale * 100)}%
              </span>
              <button className="zoom-btn" onClick={() => setZoomFactor(prev => Math.min(2.5, prev + 0.1))} title="Zoom In">+</button>
            </div>
          )}

          <button 
            className="theme-toggle-btn" 
            onClick={toggleTheme}
            title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            {theme === 'light' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            )}
          </button>

          <button className="primary-btn" onClick={handleOpenPdf}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Open Document
          </button>

          <button 
            className={`header-icon-btn ${isCopilotOpen ? 'active' : ''}`}
            onClick={() => setIsCopilotOpen(!isCopilotOpen)}
            title="Toggle AI Copilot Sidebar"
            style={{ color: isCopilotOpen ? 'var(--accent-red)' : 'var(--text-secondary)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>

          {/* Home button */}
          <button
            className={`header-icon-btn ${currentView === 'home' ? 'active' : ''}`}
            onClick={() => setCurrentView('home')}
            title="Home — Recently Accessed Files"
            style={{ color: currentView === 'home' ? 'var(--accent-red)' : 'var(--text-secondary)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </button>
        </div>
      </header>

      {/* ---- TABS BAR ---- */}
      {openDocuments.length > 0 && (
        <div className="tabs-bar">
          <div className="tabs-container">
            {openDocuments.map((doc) => (
              <div 
                key={doc.id} 
                className={`tab-item ${currentView !== 'home' && doc.id === activeDocumentId ? 'active' : ''}`}
                onClick={() => {
                  switchToDocument(doc.id);
                  setCurrentView('reader');
                }}
              >
                <span className="tab-title" title={doc.filename}>
                  {getTruncatedTitle(doc.filename, 20)}
                </span>
                {doc.isLoading && (
                  <span className="tab-loading-spinner" />
                )}
                <button 
                  className="tab-close-btn" 
                  onClick={(e) => {
                    e.stopPropagation();
                    closeDocument(doc.id);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button className="tabs-add-btn" onClick={handleOpenPdf} title="Open another document">
            +
          </button>
        </div>
      )}

      {/* ---- HOME VIEW ---- */}
      {currentView === 'home' && (
        <div className="home-view">
          {/* Home Tab Switcher */}
          <div className="home-tabs">
            <button 
              className={`home-tab-btn ${homeTab === 'documents' ? 'active' : ''}`}
              onClick={() => setHomeTab('documents')}
            >
              Documents
            </button>
            <button 
              className={`home-tab-btn ${homeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setHomeTab('settings')}
            >
              Settings
            </button>
          </div>

          {homeTab === 'documents' && (
            <>
              {/* Upload Drop Zone */}
              <div className="home-upload-zone" onClick={handleOpenPdf}>
                <div className="home-upload-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="12" y1="18" x2="12" y2="12"></line>
                    <line x1="9" y1="15" x2="15" y2="15"></line>
                  </svg>
                </div>
                <p className="home-upload-title">Open a PDF Document</p>
                <p className="home-upload-hint">Click to browse or drag and drop your PDF here</p>
              </div>

              {/* Recent Files Grid */}
              {recentFiles.length > 0 && (
                <div className="home-recent-section">
                  <h2 className="home-section-title">Recently Accessed</h2>
                  <div className="home-recent-grid">
                    {recentFiles.map((entry, idx) => (
                      <div key={idx} className="recent-file-card">
                        <div className="recent-file-icon">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                          </svg>
                        </div>
                        <div className="recent-file-info" onClick={() => openRecentFile(entry)}>
                          <span className="recent-file-name" title={entry.filename}>{entry.filename}</span>
                          <span className="recent-file-meta">
                            {entry.size ? `${(entry.size / 1024).toFixed(0)} KB · ` : ''}
                            {new Date(entry.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <div className="recent-file-actions">
                          <button className="recent-open-btn" onClick={() => openRecentFile(entry)} title="Open document">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                              <polyline points="15 3 21 3 21 9"></polyline>
                              <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                          </button>
                          <button className="recent-share-btn" onClick={() => setSharingFile(entry)} title="Share document">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="18" cy="5" r="3"></circle>
                              <circle cx="6" cy="12" r="3"></circle>
                              <circle cx="18" cy="19" r="3"></circle>
                              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {homeTab === 'settings' && (
            <div className="home-settings-panel">
              <h2 className="home-section-title">Settings</h2>
              <div className="settings-container">
                <div className="settings-card">
                  <div className="settings-card-header">
                    <h3>Workspace Preferences</h3>
                    <p className="settings-card-desc">Configure application settings and backend parameters.</p>
                  </div>
                  
                  <div className="settings-group">
                    <label className="settings-label">Gemini API Key</label>
                    <input 
                      type="password" 
                      value={geminiApiKey} 
                      onChange={(e) => {
                        setGeminiApiKey(e.target.value);
                        localStorage.setItem('gemini-api-key', e.target.value);
                      }} 
                      placeholder="Enter Google AI Studio API Key..." 
                      className="settings-input" 
                    />
                    <span className="settings-hint">Configured locally (falls back to backend .env if empty)</span>
                  </div>

                  <div className="settings-group">
                    <label className="settings-label">Default LLM Provider</label>
                    <select 
                      value={modelMode} 
                      onChange={(e) => setModelMode(e.target.value)} 
                      className="settings-select"
                    >
                      <option value="ollama">Ollama (Offline Local)</option>
                      <option value="gemini">Google Gemini (Cloud)</option>
                    </select>
                  </div>

                  <div className="settings-group">
                    <label className="settings-label">PDF Extraction Engine</label>
                    <select 
                      value={extractorMode} 
                      onChange={(e) => {
                        setExtractorMode(e.target.value);
                        localStorage.setItem('extractor-mode', e.target.value);
                      }} 
                      className="settings-select"
                    >
                      <option value="pymupdf">PyMuPDF (Fast & Lightweight)</option>
                      <option value="docling">Docling (High Accuracy, Slower)</option>
                    </select>
                  </div>

                  <div className="settings-group">
                    <label className="settings-label">Local Ollama Model</label>
                    <select disabled className="settings-select">
                      <option>llama3.2:1b</option>
                    </select>
                  </div>

                  <div className="settings-group">
                    <label className="settings-label">Default Theme</label>
                    <select 
                      value={theme} 
                      onChange={(e) => setTheme(e.target.value)} 
                      className="settings-select"
                    >
                      <option value="light">Light Mode</option>
                      <option value="dark">Dark Mode</option>
                    </select>
                  </div>

                  <div className="settings-group" style={{ marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                    <label className="settings-label" style={{ color: 'var(--accent-red)' }}>Danger Zone</label>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.5' }}>
                      Delete all cached vector embeddings and uploaded document files from the application. This action is permanent and cannot be undone.
                    </p>
                    <button 
                      onClick={handleClearAllData} 
                      className="primary-btn" 
                      style={{ 
                        background: 'var(--accent-red)', 
                        borderColor: 'var(--accent-red)',
                        width: 'fit-content',
                        padding: '10px 18px',
                        fontWeight: '600'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'var(--accent-red-hover)';
                        e.currentTarget.style.borderColor = 'var(--accent-red-hover)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'var(--accent-red)';
                        e.currentTarget.style.borderColor = 'var(--accent-red)';
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                      Clear All App Data
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- MAIN WORKSPACE PANEL (Reader) ---- */}
      {currentView === 'reader' && (
      <div className="workspace">
        {/* PANEL 1: Pages Sidebar Panel (Split with Pages on Top, Reserved Tools Space on Bottom) */}
        {isPagesSidebarOpen && (
          <aside className="pages-panel">
            <div className="pages-section">
              <div className="pages-header">
                <span>PAGES</span>
                <span className="pages-count-badge">{numPages || 0}</span>
              </div>
              <div className="pages-list" ref={pagesListRef}>
                {thumbnails.length === 0 ? (
                  <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                    No pages loaded
                  </div>
                ) : (
                  thumbnails.map((pageNum) => (
                    <div
                      key={pageNum}
                      id={`thumb-page-${pageNum}`}
                      className={`page-card ${currentPage === pageNum ? 'active' : ''}`}
                      onClick={() => jumpToPage(pageNum)}
                    >
                      <PdfThumbnail pdfDoc={pdfDoc} pageNum={pageNum} />
                      <div className="page-card-info">
                        <div className="page-card-title">{String(pageNum).padStart(2, '0')} Page</div>
                        <div className="page-card-subtitle">Page {pageNum} of {numPages}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* AI Model Mode Toggle */}
            <div className="sidebar-tools-section">
              <div className="tools-header">
                <span>AI MODEL</span>
              </div>
              <div className="model-mode-toggle">
                <button
                  id="mode-btn-ollama"
                  className={`mode-btn ${modelMode === 'ollama' ? 'active' : ''}`}
                  onClick={() => setModelMode('ollama')}
                  title="Use local Ollama model (offline, private)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/>
                    <line x1="8" y1="21" x2="16" y2="21"/>
                    <line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                  Local
                </button>
                <button
                  id="mode-btn-gemini"
                  className={`mode-btn ${modelMode === 'gemini' ? 'active' : ''}`}
                  onClick={() => setModelMode('gemini')}
                  title="Use Google Gemini API (cloud, more accurate)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                  </svg>
                  Gemini
                </button>
              </div>
              <div className="model-mode-status">
                {modelMode === 'ollama' ? (
                  <span className="mode-status-text">Offline · {'{'}llama3.2:1b{'}'}</span>
                ) : (
                  <span className="mode-status-text mode-status-gemini">Cloud · gemini-3.6-flash</span>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* PANEL 2: Continuous Scroll PDF Viewport Panel */}
        <main className="viewport-panel" ref={viewportRef}>
          {pdfDoc ? (
            thumbnails.map((pageNum) => (
              <PdfPageRender
                key={pageNum}
                pdfDoc={pdfDoc}
                pageNum={pageNum}
                zoomFactor={zoomFactor}
                containerWidth={containerWidth}
                onPageVisible={handlePageVisible}
                setCalculatedScale={setCalculatedScale}
                searchQuery={searchQuery}
              />
            ))
          ) : (
            <div className="empty-state-card" onClick={handleOpenPdf}>
              <div className="empty-state-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </div>
              <h2>Open a PDF Document</h2>
              <p>Click anywhere here or hit "Open Document" in the top bar to get started with your smart reader.</p>
            </div>
          )}
        </main>

        {/* PANEL 3: AI Copilot Panel (Right) */}
        {isCopilotOpen && (
          <>
            <div className="resize-handle" onMouseDown={startResizing} />
            <aside className="copilot-panel" style={{ width: `${copilotWidth}px` }}>
              <div className="copilot-header">
                <span>AI Copilot</span>
              </div>

              {/* Quick action chips */}
              <div className="quick-actions">
                <button className="action-chip" onClick={() => runQuickAction('explain')} disabled={!isIngested}>Explain</button>
                <button className="action-chip" onClick={() => runQuickAction('summarize')} disabled={!isIngested}>Summarize</button>
                <button className="action-chip" onClick={() => runQuickAction('analyze')} disabled={!isIngested}>Analyze</button>
                <button className="action-chip" onClick={() => runQuickAction('find')} disabled={!isIngested}>Find Key Terms</button>
              </div>

              {/* Chat Messages */}
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div className="copilot-empty-state">
                    <p>Open a document to enable intelligent vector search and AI assistance.</p>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div key={i} className={`message ${msg.role} ${msg.isError ? 'error-message' : ''}`}>
                      <div className={`message-content ${msg.isIngesting ? 'ingest-flashing-text' : ''}`}>
                        {msg.role === 'assistant' ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{msg.content}</ReactMarkdown>
                        ) : (
                          msg.content
                        )}
                      </div>
                      {msg.role === 'assistant' && !msg.isIngesting && (
                        <div className="message-actions">
                          {!msg.isError && (
                            <button 
                              className="msg-action-btn copy-btn" 
                              onClick={() => navigator.clipboard.writeText(msg.content).then(() => {
                                if (typeof showToast === 'function') {
                                  showToast("Copied to clipboard!", "success");
                                }
                              })}
                              title="Copy to clipboard"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                              </svg>
                            </button>
                          )}
                          {msg.isError && (
                            <button 
                              className="msg-action-btn retry-btn" 
                              onClick={() => handleSendMessage(msg.retryMessage)}
                              title="Retry request"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: 'middle' }}>
                                <polyline points="23 4 23 10 17 10"></polyline>
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                              </svg>
                              Retry
                            </button>
                          )}
                        </div>
                      )}
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

              {/* Chat Input */}
              <div className="copilot-input-container">
                <div className="chat-input-box">
                  <textarea
                    ref={textareaRef}
                    placeholder={isIngested ? "Ask AI Copilot..." : "Awaiting document..."}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    disabled={!isIngested || isLoading}
                    rows={1}
                  />
                  <button 
                    className="send-icon-btn" 
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
      )}

      {/* ---- SHARE MODAL ---- */}
      {sharingFile && (
        <div className="share-overlay" onClick={() => setSharingFile(null)}>
          <div className="share-modal" onClick={e => e.stopPropagation()}>
            <div className="share-modal-header">
              <span className="share-modal-title">Share Document</span>
              <button className="share-modal-close" onClick={() => setSharingFile(null)}>✕</button>
            </div>
            <div className="share-modal-filename">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <span title={sharingFile.filename}>{sharingFile.filename}</span>
            </div>
            <p className="share-modal-hint">Choose how you'd like to share this document:</p>
            <div className="share-options">
              {/* Email */}
              <button
                className="share-option-btn share-email"
                onClick={() => {
                  const subject = encodeURIComponent(`Check out this document: ${sharingFile.filename}`);
                  const body = encodeURIComponent(`Hi,\n\nI wanted to share this document with you: "${sharingFile.filename}".\n\nYou can download it here: ${API_BASE}/pdf/${encodeURIComponent(sharingFile.filename)}\n\nShared via Lipi AI`);
                  window.open(`mailto:?subject=${subject}&body=${body}`);
                }}
              >
                <div className="share-option-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                </div>
                <div className="share-option-text">
                  <span className="share-option-label">Email</span>
                  <span className="share-option-desc">Open your default mail client</span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft:'auto',flexShrink:0,opacity:0.5}}>
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>

              {/* WhatsApp */}
              <button
                className="share-option-btn share-whatsapp"
                onClick={() => {
                  const text = encodeURIComponent(`📄 *${sharingFile.filename}*\n\nI'm sharing this document with you via Lipi AI.\n🔗 Download: ${API_BASE}/pdf/${encodeURIComponent(sharingFile.filename)}`);
                  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
                }}
              >
                <div className="share-option-icon share-option-icon--wa">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div className="share-option-text">
                  <span className="share-option-label">WhatsApp</span>
                  <span className="share-option-desc">Send via WhatsApp Web</span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft:'auto',flexShrink:0,opacity:0.5}}>
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
