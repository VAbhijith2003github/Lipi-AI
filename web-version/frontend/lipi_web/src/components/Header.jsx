import React from 'react';
import { IconMenu, IconSun, IconMoon, IconUpload, IconSidebar, IconHome, IconMaximize, IconMinimize } from './Icons';

export const Header = ({ 
  onOpenDocument, 
  onToggleTheme, 
  isDarkMode = true, 
  onToggleLeftSidebar,
  onToggleRightSidebar, 
  onGoHome, 
  isLeftSidebarOpen = true,
  isRightSidebarOpen = true,
  isHomePage = true,
  isFullScreen = false,
  onToggleFullScreen,
  onLogout
}) => {
  return (
    <header className="header-bar">
      <div className="header-left">
        {!isHomePage && (
          <button 
            className={`icon-btn menu-btn ${isLeftSidebarOpen ? 'active' : ''}`} 
            onClick={onToggleLeftSidebar}
            aria-label="Toggle left sidebar"
            title="Toggle Left Sidebar (Page Thumbnails)"
          >
            <IconMenu size={20} color={isDarkMode ? "#e0e4ec" : "#2d3748"} />
          </button>
        )}
        <div 
          className="app-brand" 
          onClick={onGoHome} 
          style={{ cursor: 'pointer' }} 
          title="Go to Home"
        >
          <span className="brand-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" strokeWidth="3" strokeLinecap="round">
              <path d="M4 4h16v16H4z" />
              <path d="M4 12h16" />
            </svg>
          </span>
          <h1 className="brand-title">Lipi AI</h1>
        </div>
      </div>

      <div className="header-right">
        {/* Theme toggle (always visible) */}
        <button 
          className="header-action-icon" 
          onClick={onToggleTheme}
          title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          aria-label="Toggle Theme"
        >
          {isDarkMode ? (
            <IconSun size={18} color="#9aa0ac" />
          ) : (
            <IconMoon size={18} color="#4a5568" />
          )}
        </button>

        {/* Logout button (always visible when onLogout provided) */}
        {onLogout && (
          <button
            className="header-action-icon"
            onClick={onLogout}
            title="Sign Out"
            aria-label="Sign Out"
            style={{ color: '#9aa0ac', fontSize: '12px', fontWeight: 600 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        )}

        {!isHomePage && (
          <>
            <button 
              className="open-doc-btn" 
              onClick={onOpenDocument}
              title="Upload PDF Document"
            >
              <IconUpload size={16} color="#ffffff" />
              <span>Open Document</span>
            </button>

            <button 
              className={`header-action-icon ${isRightSidebarOpen ? 'active' : ''}`} 
              onClick={onToggleRightSidebar}
              title="Toggle Right Sidebar / Side Panel" 
              aria-label="Toggle Right Sidebar"
            >
              <IconSidebar size={18} color={isDarkMode ? "#9aa0ac" : "#4a5568"} />
            </button>

            <button 
              className="header-action-icon" 
              onClick={onGoHome}
              title="Go to Home" 
              aria-label="Go Home"
            >
              <IconHome size={18} color={isDarkMode ? "#9aa0ac" : "#4a5568"} />
            </button>

            <button 
              className="header-action-icon" 
              onClick={onToggleFullScreen}
              title={isFullScreen ? "Exit Full Screen" : "Full Screen (Hide Top Bar)"} 
              aria-label="Toggle Full Screen"
            >
              {isFullScreen ? (
                <IconMinimize size={18} color={isDarkMode ? "#9aa0ac" : "#4a5568"} />
              ) : (
                <IconMaximize size={18} color={isDarkMode ? "#9aa0ac" : "#4a5568"} />
              )}
            </button>
          </>
        )}
      </div>
    </header>
  );
};
