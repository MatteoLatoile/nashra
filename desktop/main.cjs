'use strict';

const path = require('node:path');
const { app, BrowserWindow, Menu, dialog, shell, session } = require('electron');
const { validateAppUrl, externalHttpUrl } = require('./url-policy.cjs');
const shipped = require('./runtime-config.json');

const localDevOverride = !app.isPackaged && process.env.NASHRA_DESKTOP_DEV_URL;
const mode = localDevOverride ? 'development' : shipped.mode;
const startUrl = validateAppUrl(localDevOverride || shipped.url, mode);
const trustedOrigin = new URL(startUrl).origin;
let mainWindow = null;
let showingOffline = false;
let quitting = false;

app.setAppUserModelId(mode === 'local-test' ? 'com.nashra.desktop.localtest' : 'com.nashra.desktop');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const requester = details.requestingUrl || webContents.getURL();
      let origin;
      try { origin = new URL(requester).origin; } catch { origin = ''; }
      callback(origin === trustedOrigin && permission === 'notifications');
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
      let origin;
      try { origin = new URL(requestingOrigin).origin; } catch { origin = ''; }
      return origin === trustedOrigin && permission === 'notifications';
    });

    mainWindow = new BrowserWindow({
      title: 'Nashra',
      width: 1360,
      height: 860,
      minWidth: 860,
      minHeight: 600,
      backgroundColor: '#0d0d10',
      autoHideMenuBar: true,
      icon: path.join(__dirname, 'assets', 'logo.png'),
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        allowRunningInsecureContent: false,
        devTools: !app.isPackaged
      }
    });

    mainWindow.once('ready-to-show', () => mainWindow?.show());
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

    function isSameOrigin(rawUrl) {
      try { return new URL(rawUrl).origin === trustedOrigin; } catch { return false; }
    }

    async function openInBrowser(rawUrl) {
      // Only well-formed HTTPS links are allowed to escape the desktop app.
      const link = externalHttpUrl(rawUrl);
      if (!link || new URL(link).protocol !== 'https:') return;
      try { await shell.openExternal(link); } catch { /* OS may not have a default browser */ }
    }

    // Restrict navigation to Nashra's own origin; payment/third-party URLs open in the system browser.
    mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
      if (isSameOrigin(targetUrl)) return;
      event.preventDefault();
      void openInBrowser(targetUrl);
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isSameOrigin(url)) {
        void mainWindow?.loadURL(url);
      } else {
        void openInBrowser(url);
      }
      return { action: 'deny' };
    });

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, _description, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3 || showingOffline || !isSameOrigin(validatedURL)) return;
      showingOffline = true;
      void mainWindow?.loadFile(path.join(__dirname, 'offline.html'));
    });

    mainWindow.webContents.on('did-finish-load', () => {
      const current = mainWindow?.webContents.getURL();
      if (current && isSameOrigin(current)) showingOffline = false;
    });

    function retry() {
      if (!mainWindow) return;
      showingOffline = false;
      void mainWindow.loadURL(startUrl);
    }

    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: 'Nashra',
        submenu: [
          { label: 'Ouvrir Nashra', click: retry },
          { label: 'Ouvrir dans le navigateur', click: () => void openInBrowser(startUrl) },
          { type: 'separator' },
          { label: 'Quitter', accelerator: 'Alt+F4', click: () => app.quit() }
        ]
      },
      {
        label: 'Navigation',
        submenu: [
          { label: 'Retour', accelerator: 'Alt+Left', click: () => mainWindow?.webContents.navigationHistory.canGoBack() && mainWindow.webContents.navigationHistory.goBack() },
          { label: 'Avancer', accelerator: 'Alt+Right', click: () => mainWindow?.webContents.navigationHistory.canGoForward() && mainWindow.webContents.navigationHistory.goForward() },
          { label: 'Réessayer / Actualiser', accelerator: 'Ctrl+R', click: retry }
        ]
      },
      {
        label: 'Aide',
        submenu: [
          { label: 'À propos', click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: 'À propos de Nashra', message: `Nashra Desktop ${app.getVersion()}`, detail: 'Application installable pour accéder au SaaS Nashra. Nécessite une connexion Internet et le serveur Nashra.' }) }
        ]
      }
    ]));

    retry();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length && !quitting) {
      app.relaunch();
      app.exit(0);
    }
  });
}
