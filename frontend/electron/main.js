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

const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');

// Check if we're running in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
let backendProcess = null;

function isTrustedRenderer(event) {
  const url = event.senderFrame?.url || '';
  return url.startsWith('file:') || (isDev && url.startsWith('http://localhost:5173'));
}

function getPdfPathFromArgs() {
  const args = process.argv;
  const startIndex = isDev ? 2 : 1;
  for (let i = startIndex; i < args.length; i++) {
    const arg = args[i];
    if (arg && arg.toLowerCase().endsWith('.pdf')) {
      try {
        if (fs.existsSync(arg)) {
          return path.resolve(arg);
        }
      } catch (_) {}
    }
  }
  return null;
}

// ---- IPC Handlers ----
ipcMain.handle('get-open-file-arg', () => {
  return getPdfPathFromArgs();
});

ipcMain.handle('read-pdf-file', async (event, filePath) => {
  if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer.');
  const approvedPath = getPdfPathFromArgs();
  if (!approvedPath || path.resolve(filePath) !== approvedPath) throw new Error('File was not approved at launch.');
  try {
    const buffer = fs.readFileSync(filePath);
    return {
      filename: path.basename(filePath),
      data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), // ArrayBuffer
      size: buffer.length
    };
  } catch (err) {
    console.error('[Electron] Error reading PDF file:', err);
    throw err;
  }
});

ipcMain.handle('open-external-url', async (event, url) => {
  if (!isTrustedRenderer(event) || typeof url !== 'string') throw new Error('Invalid URL request.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['ollama.com', 'aistudio.google.com'].includes(parsed.hostname)) throw new Error('URL is not allowlisted.');
  await shell.openExternal(parsed.toString());
});


let ollamaStartAttempted = false;

function startOllama() {
  if (process.platform !== 'win32' || ollamaStartAttempted) return;
  ollamaStartAttempted = true;

  // Check if Ollama is running first (ping port 11434)
  const http = require('http');
  const req = http.request({
    host: '127.0.0.1',
    port: 11434,
    path: '/api/tags',
    method: 'GET',
    timeout: 1000
  }, (res) => {
    console.log('[Electron] Ollama service detected.');
  });

  req.on('error', () => {
    console.log('[Electron] Ollama service not running. Attempting silent startup...');

    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
    const cliPath = path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
    const trayPath = path.join(localAppData, 'Programs', 'Ollama', 'ollama app.exe');

    try {
      if (fs.existsSync(cliPath)) {
        console.log('[Electron] Spawning local Ollama daemon silently from:', cliPath);
        const child = spawn(cliPath, ['serve'], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        });
        child.unref();
      } else if (fs.existsSync(trayPath)) {
        console.log('[Electron] Spawning local Ollama tray app silently from:', trayPath);
        const child = spawn(trayPath, [], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        });
        child.unref();
      } else {
        const child = spawn('ollama', ['serve'], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        });
        child.on('error', () => {});
        child.unref();
      }
    } catch (e) {
      console.warn('[Electron] Could not auto-start Ollama:', e.message);
    }
  });

  req.on('timeout', () => {
    req.destroy();
  });
  req.end();
}


function startBackend() {
  if (isDev) return;

  // Search for the packaged backend executable in extraResources
  const possiblePaths = [
    path.join(process.resourcesPath, 'lipi-backend', 'lipi-backend.exe'),
    path.join(process.resourcesPath, 'backend', 'lipi-backend', 'lipi-backend.exe'),
    path.join(process.resourcesPath, 'backend', 'lipi-backend.exe'),
    path.join(__dirname, '..', '..', 'backend', 'dist', 'lipi-backend', 'lipi-backend.exe')
  ];

  let backendExe = null;
  const fs = require('fs');
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      backendExe = p;
      break;
    }
  }

  if (backendExe) {
    console.log('[Electron] Launching backend executable:', backendExe);
    try {
      backendProcess = spawn(backendExe, [], {
        cwd: path.dirname(backendExe),
        windowsHide: true,
        stdio: 'ignore',
        detached: false
      });

      backendProcess.on('error', (err) => {
        console.error('[Electron] Failed to start backend process:', err);
      });

      backendProcess.on('exit', (code, signal) => {
        console.log(`[Electron] Backend process exited with code ${code}, signal ${signal}`);
        backendProcess = null;
      });
    } catch (err) {
      console.error('[Electron] Error spawning backend:', err);
    }
  } else {
    console.warn('[Electron] Packaged backend executable not found in resources.');
  }
}

function stopBackend() {
  if (backendProcess && backendProcess.pid) {
    console.log('[Electron] Terminating backend process PID:', backendProcess.pid);
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${backendProcess.pid} /T /F`, () => {});
    } else {
      backendProcess.kill('SIGTERM');
    }
    backendProcess = null;
  }
}

function createWindow() {
  // Disable default menu bar (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);

  // ---- Create the browser window ----
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Lipi AI — Smart Document Assistant',
    icon: path.join(__dirname, '..', 'icon.png'),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#e53935',
      symbolColor: '#ffffff',
      height: 52
    },
    webPreferences: {
      // preload.js acts as a secure bridge between Main and Renderer processes
      preload: path.join(__dirname, 'preload.js'),
      // Security: disable direct Node.js access from the renderer
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:') && !(isDev && url.startsWith('http://localhost:5173'))) event.preventDefault();
  });

  // ---- Load the React app ----
  if (isDev) {
    // In development, load from the Vite dev server
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // In production, load the built HTML file
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ---- App Lifecycle ----
app.whenReady().then(() => {
  startOllama();
  startBackend();
  createWindow();
});

// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('will-quit', () => {
  stopBackend();
});

// On macOS, re-create the window when the dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
