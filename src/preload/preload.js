const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('azure', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  platform: () => ipcRenderer.invoke('app:platform'),
  machineInfo: () => ipcRenderer.invoke('app:machine-info'),

  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  isWindowVisible: () => ipcRenderer.invoke('window:is-visible'),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  onTrayNewChat: (cb) => {
    const h = () => cb();
    ipcRenderer.on('tray:new-chat', h);
    return () => ipcRenderer.removeListener('tray:new-chat', h);
  },
  onTrayCheckUpdate: (cb) => {
    const h = () => cb();
    ipcRenderer.on('tray:check-update', h);
    return () => ipcRenderer.removeListener('tray:check-update', h);
  },

  // Auto-update

  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: (payload) => ipcRenderer.invoke('update:download', payload),
  getPostUpdate: () => ipcRenderer.invoke('update:get-post-update'),
  dismissUpdateNotes: () => ipcRenderer.invoke('update:dismiss-notes'),
  skipVersion: (v) => ipcRenderer.invoke('update:skip-version', v),
  getSkippedVersion: () => ipcRenderer.invoke('update:get-skipped'),
  onUpdateProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('update:progress', h);
    return () => ipcRenderer.removeListener('update:progress', h);
  },


  isOllamaInstalled: () => ipcRenderer.invoke('ollama:is-installed'),
  isOllamaRunning: (url) => ipcRenderer.invoke('ollama:is-running', url),
  startOllama: () => ipcRenderer.invoke('ollama:start'),
  installOllama: () => ipcRenderer.invoke('ollama:install'),
  listModels: (url) => ipcRenderer.invoke('ollama:list-models', url),
  pullModel: (name) => ipcRenderer.invoke('ollama:pull', name),
  deleteModel: (name) => ipcRenderer.invoke('ollama:delete-model', name),
  chat: (payload) => ipcRenderer.invoke('ollama:chat', payload),
  cancelChat: () => ipcRenderer.invoke('ollama:cancel'),

  onPullProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('ollama:pull-progress', h);
    return () => ipcRenderer.removeListener('ollama:pull-progress', h);
  },
  onInstallProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('ollama:install-progress', h);
    return () => ipcRenderer.removeListener('ollama:install-progress', h);
  },
  onChatChunk: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('ollama:chat-chunk', h);
    return () => ipcRenderer.removeListener('ollama:chat-chunk', h);
  },

  onChatDone: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('ollama:chat-done', h);
    return () => ipcRenderer.removeListener('ollama:chat-done', h);
  },
  onChatError: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('ollama:chat-error', h);
    return () => ipcRenderer.removeListener('ollama:chat-error', h);
  },
  onTokensUpdate: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('tokens:update', h);
    return () => ipcRenderer.removeListener('tokens:update', h);
  },

  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('settings:get'),

  getTokens: () => ipcRenderer.invoke('tokens:get'),
  setTokenCap: (cap) => ipcRenderer.invoke('tokens:set-cap', cap),

  startAgentServer: () => ipcRenderer.invoke('agent:start-server'),
  stopAgentServer: () => ipcRenderer.invoke('agent:stop-server'),
  agentServerStatus: () => ipcRenderer.invoke('agent:server-status'),
  probeAgent: (url) => ipcRenderer.invoke('agent:probe', url),
  listPaired: () => ipcRenderer.invoke('agent:list-paired'),
  addPaired: (agent) => ipcRenderer.invoke('agent:add-paired', agent),
  removePaired: (id) => ipcRenderer.invoke('agent:remove-paired', id),
  listAgentClients: () => ipcRenderer.invoke('agent:list-clients'),
  grantClientTokens: (deviceId, amount) => ipcRenderer.invoke('agent:grant-tokens', { deviceId, amount }),
  setClientTokens: (deviceId, tokens) => ipcRenderer.invoke('agent:set-client-tokens', { deviceId, tokens }),
  clearClientMemory: (deviceId) => ipcRenderer.invoke('agent:clear-client-memory', deviceId),
  remoteBalance: (url) => ipcRenderer.invoke('agent:remote-balance', url),
  remoteMemory: (baseUrl, action, fact) => ipcRenderer.invoke('agent:remote-memory', { baseUrl, action, fact }),
  getDeviceId: () => ipcRenderer.invoke('device:get-id'),
  getDeviceName: () => ipcRenderer.invoke('device:get-name'),
  setDeviceName: (name) => ipcRenderer.invoke('device:set-name', name),
  listMemory: () => ipcRenderer.invoke('memory:list'),
  clearMemory: () => ipcRenderer.invoke('memory:clear'),
  addMemory: (fact) => ipcRenderer.invoke('memory:add', fact),
  setMemory: (list) => ipcRenderer.invoke('memory:set', list),

  createProject: (data) => ipcRenderer.invoke('project:create', data),

  listProjects: () => ipcRenderer.invoke('project:list'),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  pickFolder: () => ipcRenderer.invoke('project:pick-folder'),

  listDir: (dir) => ipcRenderer.invoke('fs:list-dir', dir),
  readFile: (p) => ipcRenderer.invoke('fs:read-file', p),
  writeFile: (p, c) => ipcRenderer.invoke('fs:write-file', p, c),
  exists: (p) => ipcRenderer.invoke('fs:exists', p),

  listChats: () => ipcRenderer.invoke('chats:list'),
  saveChats: (chats) => ipcRenderer.invoke('chats:save', chats),
  getChat: (id) => ipcRenderer.invoke('chats:get', id)
});
