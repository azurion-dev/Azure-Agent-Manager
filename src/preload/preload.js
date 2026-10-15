const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('azure', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  platform: () => ipcRenderer.invoke('app:platform'),
  machineInfo: () => ipcRenderer.invoke('app:machine-info'),

  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

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
