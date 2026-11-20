const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

let mainWindow = null;

// Config file path in user data directory
function getConfigPath() {
  return path.join(app.getPath('userData'), 'server-config.json');
}

function getSavedServerUrl() {
  try {
    const cfgPath = getConfigPath();
    if (fs.existsSync(cfgPath)) {
      const data = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (data && data.serverUrl) return data.serverUrl;
    }
  } catch (err) {
    console.error('[A2Z Desktop] Error reading server config:', err);
  }
  return process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
}

function saveServerUrl(url) {
  try {
    const cfgPath = getConfigPath();
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify({ serverUrl: url.trim(), updatedAt: new Date().toISOString() }, null, 2));
    return true;
  } catch (err) {
    console.error('[A2Z Desktop] Error saving server config:', err);
    return false;
  }
}

// Determine icon path
function getIconPath() {
  const icoPath = path.join(__dirname, 'assets', 'icon.ico');
  if (fs.existsSync(icoPath)) return icoPath;
  const pngPath = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(pngPath)) return pngPath;
  const defaultPng = path.join(__dirname, '..', 'client', 'public', 'wholesale-billing-icon.png');
  if (fs.existsSync(defaultPng)) return defaultPng;
  return undefined;
}

function pollServer(url, timeoutMs = 25000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      try {
        http.get(url, (res) => {
          if (res.statusCode && res.statusCode < 500) {
            resolve(true);
          } else {
            retry();
          }
        }).on('error', () => {
          retry();
        });
      } catch {
        retry();
      }
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        resolve(false);
      } else {
        setTimeout(check, 500);
      }
    };
    check();
  });
}

function getFallbackHtml(currentUrl, errorMsg) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>A2Z - Server Connection</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 36px 32px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; color: #ffffff; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px; }
    .label { display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 8px; }
    .input {
      width: 100%;
      padding: 12px 14px;
      background: #0f172a;
      border: 1px solid #475569;
      border-radius: 8px;
      color: #ffffff;
      font-size: 14px;
      margin-bottom: 20px;
      outline: none;
    }
    .input:focus { border-color: #6366f1; }
    .actions { display: flex; gap: 12px; }
    .btn-primary {
      flex: 1;
      padding: 12px;
      background: #4f46e5;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn-primary:hover { background: #4338ca; }
    .btn-secondary {
      padding: 12px 18px;
      background: #334155;
      color: #cbd5e1;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-secondary:hover { background: #475569; }
    .tip { margin-top: 20px; font-size: 12px; color: #64748b; line-height: 1.4; border-top: 1px solid #334155; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Connection Offline</div>
    <h1>Connecting to A2Z Server</h1>
    <p>Could not reach the server at <strong>${currentUrl}</strong>. If your server is hosted in the cloud or on another store PC, enter the server URL below.</p>
    
    <label class="label">Server Address (URL):</label>
    <input id="serverUrl" class="input" type="text" value="${currentUrl}" placeholder="http://localhost:3001 or https://your-server.com" />
    
    <div class="actions">
      <button class="btn-primary" onclick="reconnect()">Save & Connect</button>
      <button class="btn-secondary" onclick="window.location.reload()">Retry</button>
    </div>

    <div class="tip">
      💡 Tip: For local testing, ensure the development server is running via <code>npm run dev</code>. For counter PCs, enter the store manager's IP address (e.g., <code>http://192.168.1.100:3001</code>).
    </div>
  </div>

  <script>
    async function reconnect() {
      const url = document.getElementById('serverUrl').value.trim();
      if (!url) return alert('Please enter a server URL');
      if (window.electronAPI && window.electronAPI.saveServerUrl) {
        await window.electronAPI.saveServerUrl(url);
      }
      window.location.href = url;
    }
  </script>
</body>
</html>`;
}

async function createWindow() {
  const icon = getIconPath();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'A2Z',
    icon: icon,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  const isDev = process.env.ELECTRON_DEV === 'true' || !app.isPackaged;
  const targetUrl = getSavedServerUrl();

  // Handle connection errors gracefully
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    // Error code -3 is aborted (e.g. redirected or user cancelled), do not show error page for it
    if (errorCode === -3) return;
    console.warn(`[A2Z Desktop] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
    if (mainWindow) {
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getFallbackHtml(validatedURL || targetUrl, errorDescription))}`);
    }
  });

  if (isDev) {
    console.log(`[A2Z Desktop] Checking connection to dev server at ${targetUrl}...`);
    const ready = await pollServer(targetUrl, 25000);
    if (mainWindow) {
      console.log(`[A2Z Desktop] Loading ${targetUrl}`);
      mainWindow.loadURL(targetUrl);
    }
  } else {
    console.log(`[A2Z Desktop] Loading target URL: ${targetUrl}`);
    mainWindow.loadURL(targetUrl);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-server-url', () => getSavedServerUrl());

ipcMain.handle('save-server-url', (event, url) => saveServerUrl(url));

ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  return mainWindow.webContents.getPrintersAsync();
});

ipcMain.handle('print-receipt', async (event, options = {}) => {
  if (!mainWindow) return { success: false, error: 'No active window' };
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent: options.silent !== false,
        printBackground: true,
        deviceName: options.deviceName || '',
        margins: { marginType: 'none' },
      },
      (success, failureReason) => {
        if (!success) {
          resolve({ success: false, error: failureReason });
        } else {
          resolve({ success: true });
        }
      }
    );
  });
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});
