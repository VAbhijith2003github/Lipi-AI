/**
 * electron/main.js — Electron Main Process
 *
 * PURPOSE:
 * This is the entry point for Electron. When you launch the desktop app,
 * this file runs FIRST. It:
 *
 *   1. Creates a native desktop window (BrowserWindow).
 *   2. Loads the React app into that window.
 *      - During development: loads from the Vite dev server (http://localhost:5173)
 *      - In production: loads the built HTML file from disk
 *   3. Sets up IPC (Inter-Process Communication) handlers so React can
 *      trigger native desktop features like file pickers.
 *
 * ELECTRON ARCHITECTURE:
 *   Electron has TWO processes:
 *     - Main Process (this file): Has full access to the OS (file system,
 *       native dialogs, etc.). Think of it as the "backend" of the desktop app.
 *     - Renderer Process (React): Runs in a browser-like sandbox. It can
 *       only talk to the Main Process through IPC for security reasons.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');

// Check if we're running in development mode
// In dev mode, Vite serves the React app on localhost:5173
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  // ---- Create the browser window ----
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'WikiBuddy — Smart Study Companion',
    webPreferences: {
      // preload.js acts as a secure bridge between Main and Renderer processes
      preload: path.join(__dirname, 'preload.js'),
      // Security: disable direct Node.js access from the renderer
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // ---- Load the React app ----
  if (isDev) {
    // In development, load from the Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools automatically during development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built HTML file
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ---- App Lifecycle ----
// Electron fires 'ready' when it has finished initialising.
app.whenReady().then(createWindow);

// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On macOS, re-create the window when the dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
