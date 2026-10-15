const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, Notification } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const http = require('http');
const Store = require('electron-store');
const { v4: uuidv4 } = require('uuid');
const updater = require('./updater');

// Keep running in tray when the window is closed
let isQuitting = false;
let tray = null;



const store = new Store({
  name: 'azure-agent-settings',
  defaults: {
    theme: 'dark',
    ollamaUrl: 'http://127.0.0.1:11434',
    defaultModel: '',
    cloudApiKey: '',
    cloudProvider: 'openai',
    projects: [],
    chats: [],
    windowBounds: { width: 1280, height: 820 },
    // Pairing / agent server
    agentServerEnabled: false,
    agentServerPort: 7749,
    agentServerName: os.hostname() || 'Azure Agent',
    // Host policy for remote clients
    agentRequireTokens: true,       // if false, remote clients use this host for free
    agentMaxCostPerMsg: 50,         // max token cost charged per remote message (1–100)
    agentMaxResponseChars: 50000,   // soft limit passed to clients as info
    // Tokens (client side when using remote agent)
    tokens: 100,
    tokenCap: 100,
    lastTokenRegen: 0,
    // Connected remote agents
    pairedAgents: []
  }
});


let mainWindow = null;
let ollamaProcess = null;
let agentServer = null;
let currentAbortController = null;

// Machine power score (rough) → affects token regen rate when hosting
function machinePowerScore() {
  const cpus = os.cpus()?.length || 4;
  const memGB = Math.round((os.totalmem() || 8e9) / 1e9);
  // score 1–10 roughly
  return Math.min(10, Math.max(1, Math.round(cpus / 2 + memGB / 4)));
}

function tokenRegenRate() {
  // tokens per 5 minutes based on machine power when acting as host
  // weak PC: +5 / 5min, strong: +20 / 5min
  const power = machinePowerScore();
  return Math.round(5 + power * 1.5);
}

function regenClientTokens() {
  const now = Date.now();
  let tokens = store.get('tokens') ?? 100;
  const cap = store.get('tokenCap') ?? 100;
  let last = store.get('lastTokenRegen') || 0;
  if (!last) {
    store.set('lastTokenRegen', now);
    return tokens;
  }
  const elapsed = now - last;
  const interval = 5 * 60 * 1000; // 5 min
  if (elapsed >= interval) {
    const ticks = Math.floor(elapsed / interval);
    const rate = tokenRegenRate();
    tokens = Math.min(cap, tokens + ticks * rate);
    last = now - (elapsed % interval);
    store.set('tokens', tokens);
    store.set('lastTokenRegen', last);
  }
  return tokens;
}

function estimateTokenCost(text, responseLen = 0) {
  const base = 2;
  const input = Math.ceil((text || '').length / 200);
  const output = Math.ceil((responseLen || 0) / 40);
  return Math.max(1, Math.min(50, base + input + output));
}

// ─── Ollama helpers ───────────────────────────────────────────────
function getOllamaPath() {
  const platform = process.platform;
  if (platform === 'win32') {
    const local = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe');
    if (fs.existsSync(local)) return local;
    return 'ollama';
  }
  if (platform === 'darwin') {
    const p = '/usr/local/bin/ollama';
    if (fs.existsSync(p)) return p;
    const homebrew = '/opt/homebrew/bin/ollama';
    if (fs.existsSync(homebrew)) return homebrew;
    return 'ollama';
  }
  return 'ollama';
}

function isOllamaInstalled() {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where ollama' : 'which ollama';
    exec(cmd, { timeout: 3000 }, (err) => {
      if (!err) return resolve(true);
      const p = getOllamaPath();
      if (p !== 'ollama' && fs.existsSync(p)) return resolve(true);
      resolve(false);
    });
  });
}

async function isOllamaRunning(url) {
  const base = url || store.get('ollamaUrl') || 'http://127.0.0.1:11434';
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function startOllama() {
  if (await isOllamaRunning()) return true;
  const bin = getOllamaPath();
  try {
    ollamaProcess = spawn(bin, ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    ollamaProcess.unref();
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 700));
      if (await isOllamaRunning()) return true;
    }
  } catch (e) {
    console.error('Failed to start Ollama:', e.message);
  }
  return false;
}

function installOllamaWindows() {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      'irm https://ollama.com/install.ps1 | iex'
    ], { stdio: 'inherit', windowsHide: false });
    ps.on('close', (code) => code === 0 ? resolve(true) : reject(new Error(`Installer exit ${code}`)));
    ps.on('error', reject);
  });
}

// ─── Agent Server (pairing) ───────────────────────────────────────
function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

function startAgentServer() {
  if (agentServer) return { ok: true, already: true };
  const port = store.get('agentServerPort') || 7749;
  const name = store.get('agentServerName') || 'Azure Agent';

  agentServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Agent-Token');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${port}`);

    // Health / info
    if (url.pathname === '/agent/info' && req.method === 'GET') {
      const models = await listModelsLocal();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name,
        power: machinePowerScore(),
        regenRate: tokenRegenRate(),
        models: (models || []).map(m => m.name),
        version: '1.1',
        requireTokens: store.get('agentRequireTokens') !== false,
        maxCostPerMsg: store.get('agentMaxCostPerMsg') ?? 50,
        maxResponseChars: store.get('agentMaxResponseChars') ?? 50000
      }));
      return;
    }

    // Proxy chat to local Ollama (streaming)
    if (url.pathname === '/agent/chat' && req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          // Host policy: optional token requirement is informational for clients;
          // max response can be hinted via options.num_predict
          const opts = { ...(payload.options || {}) };
          const maxChars = store.get('agentMaxResponseChars') ?? 50000;
          if (maxChars > 0 && !opts.num_predict) {
            // ~4 chars per token rough upper bound
            opts.num_predict = Math.min(8192, Math.ceil(maxChars / 3));
          }
          const ollamaUrl = store.get('ollamaUrl') || 'http://127.0.0.1:11434';
          const upstream = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: payload.model,
              messages: payload.messages,
              stream: true,
              options: opts
            })
          });
          if (!upstream.ok) {
            res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: await upstream.text() }));
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson',
            'Transfer-Encoding': 'chunked'
          });
          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
          }
          res.end();
        } catch (e) {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          } else {
            res.end();
          }
        }
      });
      return;
    }


    // List models
    if (url.pathname === '/agent/models' && req.method === 'GET') {
      const models = await listModelsLocal();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: models || [] }));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  agentServer.listen(port, '0.0.0.0', () => {
    console.log(`Agent server listening on 0.0.0.0:${port}`);
  });
  agentServer.on('error', (e) => {
    console.error('Agent server error:', e.message);
    agentServer = null;
  });
  store.set('agentServerEnabled', true);
  return { ok: true, port, ips: getLocalIPs(), name, power: machinePowerScore() };
}

function stopAgentServer() {
  if (agentServer) {
    agentServer.close();
    agentServer = null;
  }
  store.set('agentServerEnabled', false);
  return { ok: true };
}

async function listModelsLocal() {
  const url = store.get('ollamaUrl') || 'http://127.0.0.1:11434';
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}

// ─── Window ───────────────────────────────────────────────────────
function resolveAppIcon() {
  const root = path.join(__dirname, '..', '..');
  const candidates = [
    path.join(root, 'assets', 'app.ico'),
    path.join(root, 'assets', 'app.png'),
    path.join(root, 'src', 'renderer', 'assets', 'app.png')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createWindow() {
  const bounds = store.get('windowBounds') || {};
  const icon = resolveAppIcon();
  mainWindow = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 820,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0e1014',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    },
    show: false
  });


  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  let resizeTimer;
  mainWindow.on('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!mainWindow) return;
      const b = mainWindow.getBounds();
      store.set('windowBounds', { width: b.width, height: b.height });
    }, 400);
  });

  // Close button → hide to tray (unless quitting)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (tray && process.platform === 'win32') {
        // optional: first-time balloon could go here
      }
    }
  });

  Menu.setApplicationMenu(null);
}

function getTrayIcon() {
  const iconPath = resolveAppIcon();
  if (iconPath) {
    let img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) {
      // Windows tray looks best around 16–32px
      if (process.platform === 'win32') {
        img = img.resize({ width: 16, height: 16 });
      } else if (process.platform === 'darwin') {
        img = img.resize({ width: 18, height: 18 });
      } else {
        img = img.resize({ width: 24, height: 24 });
      }
      return img;
    }
  }
  // fallback: simple green pixel
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFElEQVQ4T2Nk+M9Qz0BFwDAajzAaAwA0+gP9mQ3f9QAAAABJRU5ErkJggg=='
  );
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  tray = new Tray(getTrayIcon());
  tray.setToolTip('Azure Agent Manager');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Azure Agent Manager',
      icon: (() => {
        try {
          const p = resolveAppIcon();
          if (!p) return undefined;
          return nativeImage.createFromPath(p).resize({ width: 16, height: 16 });
        } catch { return undefined; }
      })(),
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open UI',
      click: () => showMainWindow()
    },
    {
      label: 'New chat',
      click: () => {
        showMainWindow();
        mainWindow?.webContents.send('tray:new-chat');
      }
    },
    { type: 'separator' },
    {
      label: 'Check for updates',
      click: () => {
        showMainWindow();
        mainWindow?.webContents.send('tray:check-update');
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => showMainWindow());
  tray.on('click', () => {
    // Windows: single click toggles
    if (process.platform === 'win32') {
      if (mainWindow?.isVisible()) mainWindow.hide();
      else showMainWindow();
    }
  });
}


// ─── IPC ──────────────────────────────────────────────────────────
ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:platform', () => process.platform);
ipcMain.handle('app:machine-info', () => ({
  hostname: os.hostname(),
  cpus: os.cpus()?.length || 0,
  memGB: Math.round(os.totalmem() / 1e9),
  power: machinePowerScore(),
  regenRate: tokenRegenRate(),
  ips: getLocalIPs()
}));

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
// X button → hide to tray (same as window close handler)
ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.hide();
});
ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);
ipcMain.handle('window:is-visible', () => !!(mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized()));

// Desktop notification (e.g. agent finished while UI hidden)
ipcMain.handle('notify', (_e, { title, body }) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({
    title: title || 'Azure Agent Manager',
    body: body || '',
    icon: resolveAppIcon() || undefined
  });
  n.on('click', () => showMainWindow());
  n.show();
  return true;
});


ipcMain.handle('ollama:is-installed', () => isOllamaInstalled());
ipcMain.handle('ollama:is-running', (_e, url) => isOllamaRunning(url));
ipcMain.handle('ollama:start', () => startOllama());
ipcMain.handle('ollama:install', async () => {
  if (process.platform !== 'win32') {
    shell.openExternal('https://ollama.com/download');
    return { ok: false, message: 'Please install Ollama from the website, then restart the app.' };
  }
  try {
    await installOllamaWindows();
    await new Promise(r => setTimeout(r, 2500));
    const running = await startOllama();
    return { ok: true, running };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

ipcMain.handle('ollama:list-models', async (_e, baseUrl) => {
  const url = baseUrl || store.get('ollamaUrl') || 'http://127.0.0.1:11434';
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('Failed to list models');
    const data = await res.json();
    return data.models || [];
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('ollama:pull', async (event, modelName) => {
  const url = store.get('ollamaUrl') || 'http://127.0.0.1:11434';
  try {
    const res = await fetch(`${url}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true })
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          mainWindow?.webContents.send('ollama:pull-progress', JSON.parse(line));
        } catch {}
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('ollama:delete-model', async (_e, modelName) => {
  const url = store.get('ollamaUrl') || 'http://127.0.0.1:11434';
  try {
    const res = await fetch(`${url}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName })
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Chat with abort support + remote agent support
ipcMain.handle('ollama:chat', async (event, payload) => {
  // Cancel any previous stream
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  const { model, messages, options = {}, agentUrl, chargeTokens, maxCostPerMsg } = payload;
  // agentUrl = remote paired agent base, e.g. http://192.168.1.10:7749
  const isRemote = !!(agentUrl && agentUrl.startsWith('http'));
  // chargeTokens defaults true for remote unless host says free
  const shouldCharge = isRemote && (chargeTokens !== false);
  let reserved = 0;

  if (shouldCharge) {
    const tokens = regenClientTokens();
    let cost = estimateTokenCost(
      messages.filter(m => m.role === 'user').slice(-1)[0]?.content || ''
    );
    const cap = Math.max(1, Math.min(100, Number(maxCostPerMsg) || 50));
    cost = Math.min(cost, cap);
    if (tokens < cost) {
      mainWindow?.webContents.send('ollama:chat-error', {
        error: `Not enough tokens (${tokens}/${cost}). Wait for regeneration.`
      });
      return { ok: false, error: 'insufficient_tokens', tokens, cost };
    }
    reserved = cost;
    store.set('tokens', tokens - cost);
    mainWindow?.webContents.send('tokens:update', { tokens: tokens - cost });
  }


  const chatUrl = isRemote
    ? `${agentUrl.replace(/\/$/, '')}/agent/chat`
    : `${store.get('ollamaUrl') || 'http://127.0.0.1:11434'}/api/chat`;

  try {
    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options
      }),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line);
          const content = j.message?.content || '';
          if (content) {
            fullContent += content;
            mainWindow?.webContents.send('ollama:chat-chunk', { content, done: !!j.done });
          }
          if (j.done) {
            mainWindow?.webContents.send('ollama:chat-done', { content: fullContent });
          }
        } catch {}
      }
    }

    // Adjust tokens by real response size (remote + charging only)
    if (shouldCharge && fullContent) {
      const cap = Math.max(1, Math.min(100, Number(maxCostPerMsg) || 50));
      let fullCost = estimateTokenCost(
        messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '',
        fullContent.length
      );
      fullCost = Math.min(fullCost, cap);
      const extra = Math.max(0, fullCost - reserved);
      if (extra) {
        const cur = store.get('tokens') ?? 0;
        store.set('tokens', Math.max(0, cur - extra));
        mainWindow?.webContents.send('tokens:update', { tokens: Math.max(0, cur - extra) });
      }
    }


    if (signal.aborted) {
      mainWindow?.webContents.send('ollama:chat-done', { content: fullContent, cancelled: true });
      return { ok: true, content: fullContent, cancelled: true };
    }
    return { ok: true, content: fullContent };
  } catch (e) {
    if (e.name === 'AbortError') {
      mainWindow?.webContents.send('ollama:chat-done', { content: '', cancelled: true });
      return { ok: true, cancelled: true };
    }
    mainWindow?.webContents.send('ollama:chat-error', { error: e.message });
    return { ok: false, error: e.message };
  } finally {
    currentAbortController = null;
  }
});

ipcMain.handle('ollama:cancel', () => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
    return { ok: true };
  }
  return { ok: false };
});

// Settings
ipcMain.handle('settings:get', (_e, key) => (key ? store.get(key) : store.store));
ipcMain.handle('settings:set', (_e, key, value) => { store.set(key, value); return true; });

// ─── Auto-update (GitHub Releases) ───────────────────────────────
ipcMain.handle('update:check', async () => {
  return updater.checkForUpdate(app.getVersion());
});
ipcMain.handle('update:download', async (event, { downloadUrl, assetName, body, latest }) => {
  try {
    if (body) updater.saveLastChangelog(store, body, latest);
    const result = await updater.downloadAndInstall(
      downloadUrl,
      assetName || 'AAM_WIN_amd64.exe',
      (progress) => {
        mainWindow?.webContents.send('update:progress', progress);
      }
    );
    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('update:get-post-update', () => {
  const info = updater.consumePostUpdateMarker(store);
  const notes = store.get('lastUpdateNotes') || null;
  return { info, notes };
});
ipcMain.handle('update:dismiss-notes', () => {
  store.delete('lastUpdateNotes');
  return true;
});
ipcMain.handle('update:skip-version', (_e, version) => {
  store.set('skippedVersion', version);
  return true;
});
ipcMain.handle('update:get-skipped', () => store.get('skippedVersion') || null);


// Tokens
ipcMain.handle('tokens:get', () => {
  const tokens = regenClientTokens();
  return {
    tokens,
    cap: store.get('tokenCap') ?? 100,
    regenRate: tokenRegenRate(),
    power: machinePowerScore()
  };
});
ipcMain.handle('tokens:set-cap', (_e, cap) => {
  store.set('tokenCap', Math.max(10, Math.min(10000, Number(cap) || 100)));
  return true;
});

// Agent server / pairing
ipcMain.handle('agent:start-server', () => startAgentServer());
ipcMain.handle('agent:stop-server', () => stopAgentServer());
ipcMain.handle('agent:server-status', () => ({
  enabled: !!agentServer,
  port: store.get('agentServerPort') || 7749,
  name: store.get('agentServerName'),
  ips: getLocalIPs(),
  power: machinePowerScore(),
  regenRate: tokenRegenRate(),
  requireTokens: store.get('agentRequireTokens') !== false,
  maxCostPerMsg: store.get('agentMaxCostPerMsg') ?? 50,
  maxResponseChars: store.get('agentMaxResponseChars') ?? 50000
}));


ipcMain.handle('agent:probe', async (_e, baseUrl) => {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/agent/info`, {
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) throw new Error('Not reachable');
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('agent:list-paired', () => store.get('pairedAgents') || []);
ipcMain.handle('agent:add-paired', (_e, agent) => {
  const list = store.get('pairedAgents') || [];
  const exists = list.find(a => a.url === agent.url);
  if (exists) {
    Object.assign(exists, agent);
  } else {
    list.push({ ...agent, id: uuidv4(), addedAt: Date.now() });
  }
  store.set('pairedAgents', list);
  return list;
});
ipcMain.handle('agent:remove-paired', (_e, id) => {
  let list = store.get('pairedAgents') || [];
  list = list.filter(a => a.id !== id);
  store.set('pairedAgents', list);
  return list;
});

// Projects
ipcMain.handle('project:create', async (_e, { name, folder }) => {
  const projects = store.get('projects') || [];
  const project = { id: uuidv4(), name, folder, createdAt: Date.now(), chats: [] };
  projects.push(project);
  store.set('projects', projects);
  return project;
});
ipcMain.handle('project:list', () => store.get('projects') || []);
ipcMain.handle('project:delete', (_e, id) => {
  store.set('projects', (store.get('projects') || []).filter(p => p.id !== id));
  return true;
});
ipcMain.handle('project:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// File system
ipcMain.handle('fs:list-dir', async (_e, dirPath) => {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true }).map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      path: path.join(dirPath, e.name)
    }));
  } catch (e) {
    return { error: e.message };
  }
});
ipcMain.handle('fs:read-file', async (_e, filePath) => {
  try {
    return { content: fs.readFileSync(filePath, 'utf-8') };
  } catch (e) {
    return { error: e.message };
  }
});
ipcMain.handle('fs:write-file', async (_e, filePath, content) => {
  try {
    const dir = path.dirname(filePath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fs:exists', (_e, p) => fs.existsSync(p));

// Chats
ipcMain.handle('chats:list', () => store.get('chats') || []);
ipcMain.handle('chats:save', (_e, chats) => { store.set('chats', chats); return true; });
ipcMain.handle('chats:get', (_e, id) => (store.get('chats') || []).find(c => c.id === id) || null);

// App lifecycle
app.whenReady().then(async () => {
  createWindow();
  createTray();
  // auto-restart agent server if it was enabled
  if (store.get('agentServerEnabled')) {
    try { startAgentServer(); } catch (e) { console.error(e); }
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showMainWindow();
  });
});

// Do not quit when window is hidden to tray
app.on('window-all-closed', (e) => {
  // keep process alive for tray
  if (process.platform === 'darwin') return;
  // prevent default quit — tray holds the app
});

app.on('before-quit', () => {
  isQuitting = true;
  stopAgentServer();
});

