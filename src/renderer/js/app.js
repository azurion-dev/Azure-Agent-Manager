/* Azure Agent Manager — Renderer (v1.1) */
(() => {
  'use strict';

  const state = {
    chats: [],
    currentChatId: null,
    projects: [],
    currentProjectId: null,
    models: [],
    streaming: false,
    theme: 'dark',
    activeAgentUrl: null,
    activeAgentName: null,
    paired: [],
    tokens: 100,
    tokenCap: 100,
    unsubChunk: null,
    unsubDone: null,
    unsubErr: null,
    lastBodyEl: null,
    streamBuffer: '',
    streamRaf: null
  };

  const POPULAR = [
    { name: 'llama3.2', desc: 'Meta Llama 3.2 — fast general model', size: '~2 GB' },
    { name: 'llama3.2:1b', desc: 'Tiny Llama 3.2 1B — ultra-fast', size: '~1.3 GB' },
    { name: 'qwen2.5:7b', desc: 'Qwen 2.5 7B — coding & reasoning', size: '~4.7 GB' },
    { name: 'qwen2.5-coder:7b', desc: 'Qwen 2.5 Coder — specialized code', size: '~4.7 GB' },
    { name: 'mistral', desc: 'Mistral 7B — strong open model', size: '~4.1 GB' },
    { name: 'phi3', desc: 'Microsoft Phi-3 — small & capable', size: '~2.3 GB' },
    { name: 'gemma2:9b', desc: 'Google Gemma 2 9B', size: '~5.4 GB' },
    { name: 'deepseek-coder-v2', desc: 'DeepSeek Coder V2', size: '~8.9 GB' },
    { name: 'llava', desc: 'LLaVA — vision + language', size: '~4.5 GB' },
    { name: 'nomic-embed-text', desc: 'Embeddings for RAG', size: '~274 MB' }
  ];

  // Brand colors + short label for model families (matched by substring in name)
  const MODEL_BRANDS = [
    { key: 'deepseek', label: 'DS', color: '#4D6BFE', title: 'DeepSeek' },
    { key: 'llama', label: 'LL', color: '#0866FF', title: 'Llama' },
    { key: 'qwen', label: 'QW', color: '#6A35FF', title: 'Qwen' },
    { key: 'mistral', label: 'MI', color: '#F54E42', title: 'Mistral' },
    { key: 'mixtral', label: 'MX', color: '#F54E42', title: 'Mixtral' },
    { key: 'phi', label: 'Φ', color: '#00A4EF', title: 'Phi' },
    { key: 'gemma', label: 'GE', color: '#4285F4', title: 'Gemma' },
    { key: 'llava', label: 'LV', color: '#10B981', title: 'LLaVA' },
    { key: 'nomic', label: 'NO', color: '#F59E0B', title: 'Nomic' },
    { key: 'codellama', label: 'CL', color: '#0866FF', title: 'Code Llama' },
    { key: 'starcoder', label: 'SC', color: '#FF6B35', title: 'StarCoder' },
    { key: 'yi', label: 'YI', color: '#111827', title: 'Yi' },
    { key: 'vicuna', label: 'VI', color: '#8B5CF6', title: 'Vicuna' },
    { key: 'dolphin', label: 'DO', color: '#06B6D4', title: 'Dolphin' },
    { key: 'tinyllama', label: 'TL', color: '#0866FF', title: 'TinyLlama' },
    { key: 'moondream', label: 'MD', color: '#EC4899', title: 'Moondream' },
    { key: 'minicpm', label: 'CP', color: '#F97316', title: 'MiniCPM' },
    { key: 'solar', label: 'SO', color: '#EAB308', title: 'Solar' },
    { key: 'wizard', label: 'WZ', color: '#7C3AED', title: 'Wizard' },
    { key: 'hermes', label: 'HE', color: '#0F766E', title: 'Hermes' },
    { key: 'gpt', label: 'GPT', color: '#10A37F', title: 'GPT' },
    { key: 'claude', label: 'CL', color: '#D97706', title: 'Claude' }
  ];

  function brandFor(modelName) {
    const n = (modelName || '').toLowerCase();
    for (const b of MODEL_BRANDS) {
      if (n.includes(b.key)) return b;
    }
    const clean = (modelName || '?').replace(/[^a-zA-Z0-9]/g, '');
    return {
      key: 'default',
      label: (clean.slice(0, 2) || '?').toUpperCase(),
      color: '#6366F1',
      title: modelName || 'Model'
    };
  }

  function modelIconHtml(modelName) {
    const b = brandFor(modelName);
    return `<span class="model-icon" style="background:${b.color}" title="${esc(b.title)}">${esc(b.label)}</span>`;
  }

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];


  function applyTheme(theme) {
    state.theme = theme;
    if (theme === 'system') {
      document.documentElement.dataset.theme =
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }

  $('#btn-min').onclick = () => window.azure.minimize();
  $('#btn-max').onclick = () => window.azure.maximize();
  $('#btn-close').onclick = () => window.azure.close();

  async function checkOllama() {
    const installed = await window.azure.isOllamaInstalled();
    if (!installed) {
      $('#ollama-modal').classList.remove('hidden');
      return false;
    }
    const running = await window.azure.isOllamaRunning();
    if (!running) await window.azure.startOllama();
    return true;
  }

  $('#ollama-cancel').onclick = () => window.azure.close();
  $('#ollama-install').onclick = async () => {
    const btn = $('#ollama-install');
    btn.querySelector('.btn-label').classList.add('hidden');
    btn.querySelector('.btn-spinner').classList.remove('hidden');
    btn.disabled = true;
    $('#ollama-hint').textContent = 'Downloading and installing Ollama…';
    const result = await window.azure.installOllama();
    if (result.ok) {
      $('#ollama-hint').textContent = 'Installed! Starting…';
      setTimeout(() => {
        $('#ollama-modal').classList.add('hidden');
        initApp();
      }, 1000);
    } else {
      $('#ollama-hint').textContent = result.message || 'Install failed.';
      btn.querySelector('.btn-label').classList.remove('hidden');
      btn.querySelector('.btn-spinner').classList.add('hidden');
      btn.disabled = false;
    }
  };

  function showView(name) {
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${name}`)?.classList.add('active');
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    if (name === 'library') refreshLibrary();
    if (name === 'settings') loadSettingsForm();
    if (name === 'agents') refreshAgentsView();
  }
  $$('.nav-btn').forEach(btn => { btn.onclick = () => showView(btn.dataset.view); });

  function genId() {
    return crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
  }

  function newChat() {
    const chat = {
      id: genId(), title: 'New chat', messages: [],
      createdAt: Date.now(), projectId: state.currentProjectId || null
    };
    state.chats.unshift(chat);
    state.currentChatId = chat.id;
    saveChats();
    renderChatList();
    renderMessages();
    showView('chat');
    $('#input').focus();
  }

  function selectChat(id) {
    if (state.streaming) return;
    state.currentChatId = id;
    renderChatList();
    renderMessages();
    showView('chat');
  }

  async function deleteChat(id) {
    state.chats = state.chats.filter(c => c.id !== id);
    if (state.currentChatId === id) state.currentChatId = state.chats[0]?.id || null;
    await saveChats();
    renderChatList();
    renderMessages();
  }

  async function saveChats() {
    clearTimeout(saveChats._t);
    saveChats._t = setTimeout(() => window.azure.saveChats(state.chats), state.streaming ? 900 : 120);
  }

  function currentChat() {
    return state.chats.find(c => c.id === state.currentChatId);
  }

  function renderChatList() {
    const list = $('#chat-list');
    const q = ($('#chat-search').value || '').toLowerCase();
    const filtered = state.chats.filter(c => !q || (c.title || '').toLowerCase().includes(q));
    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state">No chats yet</div>';
      return;
    }
    list.innerHTML = filtered.map(c => `
      <div class="chat-item ${c.id === state.currentChatId ? 'active' : ''}" data-id="${c.id}">
        <span>${esc(c.title || 'New chat')}</span>
        <button class="del-btn" data-del="${c.id}" title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>`).join('');
    list.querySelectorAll('.chat-item').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('.del-btn')) return;
        selectChat(el.dataset.id);
      };
    });
    list.querySelectorAll('.del-btn').forEach(el => {
      el.onclick = (e) => { e.stopPropagation(); deleteChat(el.dataset.del); };
    });
  }

  $('#chat-search').oninput = () => renderChatList();
  $('#btn-new-chat').onclick = () => { if (!state.streaming) newChat(); };

  function renderMessages() {
    const chat = currentChat();
    const container = $('#messages');
    const welcome = $('#welcome');
    state.lastBodyEl = null;

    if (!chat || !chat.messages.length) {
      container.innerHTML = '';
      if (welcome.parentNode !== container) container.appendChild(welcome);
      welcome.classList.remove('hidden');
      $('#session-pill').classList.add('hidden');
      return;
    }

    welcome.classList.add('hidden');
    if (welcome.parentNode === container) container.removeChild(welcome);
    $('#session-pill').classList.remove('hidden');
    $('#session-name').textContent = chat.title || 'Session';

    let html = '';
    for (const m of chat.messages) {
      if (m.role === 'user') {
        html += `<div class="msg user"><div class="bubble">${esc(m.content)}</div></div>`;
      } else {
        const cancelled = m.cancelled ? ' cancelled' : '';
        const body = m.pending
          ? '<div class="typing-dots"><span></span><span></span><span></span></div>'
          : (m.cancelled && !m.content ? '<em>Generation cancelled</em>' : md(m.content || ''));
        html += `<div class="msg ai${cancelled}"><div class="av">A</div><div class="col"><div class="body">${body}</div></div></div>`;
      }
    }
    container.innerHTML = html;
    const bodies = container.querySelectorAll('.msg.ai .body');
    if (bodies.length) state.lastBodyEl = bodies[bodies.length - 1];
    container.scrollTop = container.scrollHeight;
  }

  function appendStreamChunk(text) {
    state.streamBuffer += text;
    if (state.streamRaf) return;
    state.streamRaf = requestAnimationFrame(() => {
      state.streamRaf = null;
      const c = currentChat();
      if (!c) return;
      const last = c.messages[c.messages.length - 1];
      if (!last || last.role !== 'assistant') return;
      last.content = (last.content || '') + state.streamBuffer;
      state.streamBuffer = '';
      last.pending = false;
      if (state.lastBodyEl) {
        state.lastBodyEl.innerHTML = md(last.content);
        const container = $('#messages');
        if (container.scrollHeight - container.scrollTop - container.clientHeight < 140) {
          container.scrollTop = container.scrollHeight;
        }
      }
    });
  }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function md(text) {
    let html = esc(text);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/, '<ul>$1</ul>');
    html = html.split(/\n\n+/).map(p => {
      if (p.startsWith('<pre') || p.startsWith('<ul')) return p;
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');
    return html;
  }

  $$('.suggestion').forEach(btn => {
    btn.onclick = () => {
      $('#input').value = btn.dataset.prompt;
      autoResize();
      updateSendBtn();
      sendMessage();
    };
  });

  const inputEl = $('#input');
  function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
  }
  inputEl.addEventListener('input', () => { autoResize(); updateSendBtn(); });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!state.streaming) sendMessage();
    }
  });

  function updateSendBtn() {
    const hasText = inputEl.value.trim().length > 0;
    const hasModel = !!$('#model-select').value;
    $('#btn-send').disabled = !hasText || !hasModel || state.streaming;
    $('#btn-send').classList.toggle('hidden', state.streaming);
    $('#btn-cancel').classList.toggle('hidden', !state.streaming);
  }

  $('#btn-send').onclick = () => sendMessage();
  $('#btn-cancel').onclick = async () => { await window.azure.cancelChat(); };

  function setStreaming(on) {
    state.streaming = on;
    updateSendBtn();
    inputEl.disabled = on;
  }

  function cleanupStreamListeners() {
    if (state.unsubChunk) { state.unsubChunk(); state.unsubChunk = null; }
    if (state.unsubDone) { state.unsubDone(); state.unsubDone = null; }
    if (state.unsubErr) { state.unsubErr(); state.unsubErr = null; }
    if (state.streamRaf) { cancelAnimationFrame(state.streamRaf); state.streamRaf = null; }
    state.streamBuffer = '';
  }

  async function sendMessage() {
    const text = inputEl.value.trim();
    const model = $('#model-select').value;
    if (!text || !model || state.streaming) return;

    let chat = currentChat();
    if (!chat) { newChat(); chat = currentChat(); }
    if (!chat.messages.length) {
      chat.title = text.slice(0, 48) + (text.length > 48 ? '…' : '');
    }

    chat.messages.push({ role: 'user', content: text });
    chat.messages.push({ role: 'assistant', content: '', pending: true });
    inputEl.value = '';
    autoResize();
    setStreaming(true);
    renderMessages();
    renderChatList();
    saveChats();

    const msgsForApi = [];
    for (const m of chat.messages) {
      if (m.pending) break;
      if (m.role === 'assistant' && !m.content) continue;
      msgsForApi.push({ role: m.role, content: m.content });
    }

    let systemExtra = '';
    if (state.currentProjectId) {
      const proj = state.projects.find(p => p.id === state.currentProjectId);
      if (proj) {
        systemExtra = `\n\nYou are working inside project "${proj.name}" at "${proj.folder}". To edit a file, output:\n\`\`\`file-edit path="relative/path"\nfull new content\n\`\`\``;
      }
    }

    const messages = [
      { role: 'system', content: 'You are Azure Agent, a helpful AI assistant.' + systemExtra },
      ...msgsForApi
    ];

    cleanupStreamListeners();

    state.unsubChunk = window.azure.onChatChunk((data) => {
      if (data.content) appendStreamChunk(data.content);
    });

    state.unsubDone = window.azure.onChatDone(async (data) => {
      cleanupStreamListeners();
      const c = currentChat();
      if (c) {
        const last = c.messages[c.messages.length - 1];
        if (last && last.role === 'assistant') {
          if (data.cancelled) {
            last.cancelled = true;
            if (state.streamBuffer) last.content = (last.content || '') + state.streamBuffer;
            if (!last.content) last.content = '';
          } else {
            last.content = data.content || last.content || '';
          }
          last.pending = false;
        }
        if (!data.cancelled) parseAndApplyEdits(last?.content || '');
        await window.azure.saveChats(state.chats);
      }
      setStreaming(false);
      renderMessages();
      renderChatList();
    });

    state.unsubErr = window.azure.onChatError((data) => {
      cleanupStreamListeners();
      const c = currentChat();
      if (c) {
        const last = c.messages[c.messages.length - 1];
        if (last) {
          last.content = 'Error: ' + (data.error || 'Unknown error');
          last.pending = false;
        }
      }
      setStreaming(false);
      renderMessages();
    });

    const payload = { model, messages, options: { temperature: 0.7 } };
    if (state.activeAgentUrl) payload.agentUrl = state.activeAgentUrl;
    await window.azure.chat(payload);
  }

  async function parseAndApplyEdits(content) {
    const re = /```file-edit\s+path="([^"]+)"\n([\s\S]*?)```/g;
    let match;
    const edits = [];
    while ((match = re.exec(content)) !== null) {
      edits.push({ path: match[1], content: match[2] });
    }
    if (!edits.length) return;
    const results = [];
    for (const edit of edits) {
      let fullPath = edit.path;
      if (state.currentProjectId) {
        const proj = state.projects.find(p => p.id === state.currentProjectId);
        if (proj && !/^[A-Za-z]:/.test(edit.path) && !edit.path.startsWith('/')) {
          fullPath = proj.folder.replace(/\\/g, '/') + '/' + edit.path.replace(/^\.\//, '');
        }
      }
      const existing = await window.azure.readFile(fullPath);
      const oldContent = existing.content || '';
      const write = await window.azure.writeFile(fullPath, edit.content);
      if (write.ok) {
        const oldLines = oldContent.split('\n').length;
        const newLines = edit.content.split('\n').length;
        results.push({
          path: edit.path,
          type: existing.error ? 'add' : 'mod',
          added: Math.max(0, newLines - oldLines),
          removed: Math.max(0, oldLines - newLines)
        });
      }
    }
    if (results.length) showDiffPanel(results);
  }

  function showDiffPanel(edits) {
    $('#diff-list').innerHTML = edits.map(e => `
      <div class="diff-item">
        <span class="badge ${e.type}">${e.type === 'add' ? '+ added' : e.type === 'del' ? '− deleted' : '~ modified'}</span>
        <span class="path">${esc(e.path)}</span>
        <span class="stats">${e.added ? '+' + e.added : ''} ${e.removed ? '−' + e.removed : ''}</span>
      </div>`).join('');
    $('#diff-panel').classList.remove('hidden');
  }
  $('#diff-close').onclick = () => $('#diff-panel').classList.add('hidden');

  function setSelectedModel(name) {
    const sel = $('#model-select');
    if (sel) sel.value = name || '';
    const label = $('#model-picker-label');
    const icon = $('#model-picker-icon');
    if (!name) {
      if (label) label.textContent = 'Select model...';
      if (icon) icon.innerHTML = '';
      if (icon) icon.style.background = 'transparent';
    } else {
      const b = brandFor(name);
      if (label) label.textContent = name;
      if (icon) {
        icon.textContent = b.label;
        icon.style.background = b.color;
      }
    }
    updateSendBtn();
  }

  function renderModelDropdown() {
    const dd = $('#model-dropdown');
    if (!dd) return;
    const current = $('#model-select')?.value || '';
    if (!state.models.length) {
      dd.innerHTML = '<div class="empty-state" style="padding:12px">No models</div>';
      return;
    }
    dd.innerHTML = state.models.map(m => `
      <button type="button" class="model-dropdown-item ${m.name === current ? 'active' : ''}" data-model="${esc(m.name)}">
        ${modelIconHtml(m.name)}
        <span>${esc(m.name)}</span>
      </button>
    `).join('');
    dd.querySelectorAll('[data-model]').forEach(btn => {
      btn.onclick = () => {
        setSelectedModel(btn.dataset.model);
        dd.classList.add('hidden');
      };
    });
  }

  // Model picker open/close
  $('#model-picker-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = $('#model-dropdown');
    if (!dd) return;
    const open = dd.classList.contains('hidden');
    if (open) {
      renderModelDropdown();
      dd.classList.remove('hidden');
    } else {
      dd.classList.add('hidden');
    }
  });
  document.addEventListener('click', () => {
    $('#model-dropdown')?.classList.add('hidden');
  });
  $('#model-dropdown')?.addEventListener('click', (e) => e.stopPropagation());

  async function loadModels() {
    if (state.activeAgentUrl) {
      const info = await window.azure.probeAgent(state.activeAgentUrl);
      state.models = (info && info.models) ? info.models.map(n => ({ name: n })) : [];
    } else {
      const res = await window.azure.listModels();
      state.models = (res && !res.error) ? res : [];
    }
    const sel = $('#model-select');
    const defSel = $('#set-default-model');
    const prev = sel.value;
    sel.innerHTML = state.models.length
      ? state.models.map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('')
      : '<option value="">No models</option>';
    if (defSel) {
      defSel.innerHTML = state.models.map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('');
    }
    const saved = await window.azure.getSetting('defaultModel');
    let pick = '';
    if (prev && state.models.find(m => m.name === prev)) pick = prev;
    else if (saved && state.models.find(m => m.name === saved)) pick = saved;
    else if (state.models[0]) pick = state.models[0].name;
    setSelectedModel(pick);
    updateAgentIndicator();
  }

  function updateAgentIndicator() {
    if (state.activeAgentUrl) {
      $('#context-info').textContent = 'Remote: ' + (state.activeAgentName || state.activeAgentUrl);
      $('#agent-indicator').textContent = 'Tokens apply';
    } else {
      $('#context-info').textContent = 'Local agent';
      $('#agent-indicator').textContent = 'Free';
    }
  }

  function refreshLibrary() {
    const inst = $('#lib-installed');
    if (!state.models.length) {
      inst.innerHTML = '<div class="empty-state">No models installed. Use Popular or Pull.</div>';
    } else {
      inst.innerHTML = state.models.map(m => {
        const size = m.size ? formatBytes(m.size) : '';
        return `<div class="installed-item">
          ${modelIconHtml(m.name)}
          <div class="info"><div class="name">${esc(m.name)}</div><div class="size">${size}</div></div>
          <button class="btn btn-ghost" data-del-model="${esc(m.name)}">Delete</button>
        </div>`;
      }).join('');
      inst.querySelectorAll('[data-del-model]').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm('Delete "' + btn.dataset.delModel + '"?')) return;
          await window.azure.deleteModel(btn.dataset.delModel);
          await loadModels();
          refreshLibrary();
        };
      });
    }
    const grid = $('#popular-models');
    grid.innerHTML = POPULAR.map(m => {
      const installed = state.models.some(x => x.name === m.name || x.name.startsWith(m.name + ':'));
      return `<div class="model-card">
        <div class="model-card-head">
          ${modelIconHtml(m.name)}
          <h4>${esc(m.name)}</h4>
        </div>
        <p>${esc(m.desc)}</p>
        <div class="meta">${esc(m.size)}</div>
        <button class="btn ${installed ? 'btn-secondary' : 'btn-primary'}" data-pull="${esc(m.name)}" ${installed ? 'disabled' : ''}>
          ${installed ? 'Installed' : 'Download'}
        </button>
      </div>`;
    }).join('');
    grid.querySelectorAll('[data-pull]').forEach(btn => {
      btn.onclick = () => pullModel(btn.dataset.pull);
    });
  }


  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  $$('.lib-tab').forEach(tab => {
    tab.onclick = () => {
      $$('.lib-tab').forEach(t => t.classList.remove('active'));
      $$('.lib-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $('#lib-' + tab.dataset.tab)?.classList.add('active');
    };
  });

  async function pullModel(name) {
    showView('library');
    $$('.lib-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'pull'));
    $$('.lib-panel').forEach(p => p.classList.remove('active'));
    $('#lib-pull').classList.add('active');
    $('#pull-name').value = name;
    const prog = $('#pull-progress');
    prog.classList.remove('hidden');
    prog.innerHTML = '<div>Downloading <strong>' + esc(name) + '</strong>…</div><div class="progress-bar"><div style="width:0%"></div></div>';
    const unsub = window.azure.onPullProgress((data) => {
      const bar = prog.querySelector('.progress-bar > div');
      if (data.total && data.completed) {
        const pct = Math.round((data.completed / data.total) * 100);
        bar.style.width = pct + '%';
        prog.querySelector('div').innerHTML = esc(data.status || 'Downloading') + ' — ' + pct + '%';
      } else if (data.status) {
        prog.querySelector('div').textContent = data.status;
      }
    });
    const result = await window.azure.pullModel(name);
    unsub();
    if (result.ok) {
      prog.innerHTML = '<div style="color:var(--success)">✓ ' + esc(name) + ' installed</div>';
      await loadModels();
      refreshLibrary();
    } else {
      prog.innerHTML = '<div style="color:var(--danger)">Failed: ' + esc(result.error || 'error') + '</div>';
    }
  }
  $('#btn-pull').onclick = () => {
    const name = $('#pull-name').value.trim();
    if (name) pullModel(name);
  };

  function renderProjects() {
    const list = $('#project-list');
    if (!state.projects.length) { list.innerHTML = ''; return; }
    list.innerHTML = state.projects.map(p => `
      <div class="project-item ${p.id === state.currentProjectId ? 'active' : ''}" data-id="${p.id}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span>${esc(p.name)}</span>
        <button class="del-btn" data-del-proj="${p.id}" title="Remove">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>`).join('');
    list.querySelectorAll('.project-item').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('.del-btn')) return;
        state.currentProjectId = el.dataset.id;
        const proj = state.projects.find(p => p.id === el.dataset.id);
        $('#session-pill').classList.remove('hidden');
        $('#session-name').textContent = 'Project: ' + (proj?.name || '');
        renderProjects();
      };
    });
    list.querySelectorAll('[data-del-proj]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm('Remove this project? (files are not deleted)')) return;
        await window.azure.deleteProject(btn.dataset.delProj);
        if (state.currentProjectId === btn.dataset.delProj) state.currentProjectId = null;
        state.projects = await window.azure.listProjects();
        renderProjects();
      };
    });
  }

  $('#btn-new-project').onclick = () => {
    $('#project-name').value = '';
    $('#project-folder').value = '';
    $('#project-modal').classList.remove('hidden');
  };
  $('#project-cancel').onclick = () => $('#project-modal').classList.add('hidden');
  $('#project-browse').onclick = async () => {
    const folder = await window.azure.pickFolder();
    if (folder) $('#project-folder').value = folder;
  };
  $('#project-create').onclick = async () => {
    const name = $('#project-name').value.trim();
    const folder = $('#project-folder').value.trim();
    if (!name || !folder) return;
    const proj = await window.azure.createProject({ name, folder });
    state.projects = await window.azure.listProjects();
    state.currentProjectId = proj.id;
    $('#project-modal').classList.add('hidden');
    renderProjects();
    $('#session-pill').classList.remove('hidden');
    $('#session-name').textContent = 'Project: ' + name;
  };

  async function refreshTokens() {
    const t = await window.azure.getTokens();
    state.tokens = t.tokens;
    state.tokenCap = t.cap;
    $('#token-count').textContent = t.tokens;
    $('#token-big').textContent = t.tokens;
    $('#token-cap-label').textContent = t.cap;
    $('#token-cap-input').value = t.cap;
  }

  window.azure.onTokensUpdate((data) => {
    if (typeof data.tokens === 'number') {
      state.tokens = data.tokens;
      $('#token-count').textContent = data.tokens;
      $('#token-big').textContent = data.tokens;
    }
  });

  $('#btn-save-tokens').onclick = async () => {
    const cap = parseInt($('#token-cap-input').value, 10) || 100;
    await window.azure.setTokenCap(cap);
    await refreshTokens();
  };

  async function refreshAgentsView() {
    const status = await window.azure.agentServerStatus();
    const btn = $('#btn-toggle-server');
    const st = $('#server-status');
    const info = $('#server-info');
    if (status.enabled) {
      btn.textContent = 'Stop agent server';
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-secondary');
      st.textContent = 'Running';
      st.className = 'status-text ok';
      info.classList.remove('hidden');
      $('#srv-name').textContent = status.name || '—';
      $('#srv-port').textContent = status.port;
      $('#srv-ips').textContent = (status.ips || []).join(', ') || '—';
      $('#srv-power').textContent = status.power + ' / 10';
      $('#srv-regen').textContent = status.regenRate + ' tokens / 5 min';
    } else {
      btn.textContent = 'Start agent server';
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-secondary');
      st.textContent = 'Stopped';
      st.className = 'status-text';
      info.classList.add('hidden');
    }
    const name = await window.azure.getSetting('agentServerName');
    const port = await window.azure.getSetting('agentServerPort');
    if (name) $('#agent-name-input').value = name;
    if (port) $('#agent-port-input').value = port;
    state.paired = await window.azure.listPaired();
    renderPairedList();
    await refreshTokens();
  }

  function renderPairedList() {
    const list = $('#paired-list');
    if (!state.paired.length) {
      list.innerHTML = '<div class="empty-state">No paired agents yet</div>';
      return;
    }
    list.innerHTML = state.paired.map(a => {
      const active = state.activeAgentUrl === a.url;
      return `<div class="paired-item ${active ? 'active-agent' : ''}">
        <div class="info">
          <div class="name">${esc(a.name || 'Agent')}</div>
          <div class="url">${esc(a.url)}</div>
        </div>
        <button class="btn btn-secondary" data-use="${esc(a.id)}">${active ? 'Using' : 'Use'}</button>
        <button class="btn btn-ghost" data-rm="${esc(a.id)}">Remove</button>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-use]').forEach(btn => {
      btn.onclick = async () => {
        const agent = state.paired.find(a => a.id === btn.dataset.use);
        if (!agent) return;
        if (state.activeAgentUrl === agent.url) {
          state.activeAgentUrl = null;
          state.activeAgentName = null;
        } else {
          state.activeAgentUrl = agent.url;
          state.activeAgentName = agent.name;
        }
        await loadModels();
        renderPairedList();
        updateAgentIndicator();
      };
    });
    list.querySelectorAll('[data-rm]').forEach(btn => {
      btn.onclick = async () => {
        const agent = state.paired.find(a => a.id === btn.dataset.rm);
        if (agent && state.activeAgentUrl === agent.url) {
          state.activeAgentUrl = null;
          state.activeAgentName = null;
        }
        state.paired = await window.azure.removePaired(btn.dataset.rm);
        renderPairedList();
        await loadModels();
        updateAgentIndicator();
      };
    });
  }

  $('#btn-toggle-server').onclick = async () => {
    const status = await window.azure.agentServerStatus();
    if (status.enabled) {
      await window.azure.stopAgentServer();
    } else {
      const name = $('#agent-name-input').value.trim();
      const port = parseInt($('#agent-port-input').value, 10) || 7749;
      if (name) await window.azure.setSetting('agentServerName', name);
      await window.azure.setSetting('agentServerPort', port);
      await window.azure.startAgentServer();
    }
    await refreshAgentsView();
  };

  let probedAgent = null;
  $('#btn-open-pair').onclick = () => {
    $('#pair-url').value = '';
    $('#pair-probe-result').classList.add('hidden');
    $('#pair-add').disabled = true;
    probedAgent = null;
    $('#pair-modal').classList.remove('hidden');
  };
  $('#pair-cancel').onclick = () => $('#pair-modal').classList.add('hidden');
  $('#pair-probe').onclick = async () => {
    let url = $('#pair-url').value.trim();
    if (!url) return;
    if (!url.startsWith('http')) url = 'http://' + url;
    $('#pair-url').value = url;
    const res = await window.azure.probeAgent(url);
    const box = $('#pair-probe-result');
    box.classList.remove('hidden', 'ok', 'err');
    if (res.error) {
      box.classList.add('err');
      box.innerHTML = '<strong>Failed</strong><br>' + esc(res.error);
      $('#pair-add').disabled = true;
      probedAgent = null;
    } else {
      box.classList.add('ok');
      box.innerHTML = '<strong>' + esc(res.name || 'Agent') + '</strong><br>Power: ' +
        res.power + '/10 · Regen: ' + res.regenRate + ' tokens/5min<br>Models: ' +
        ((res.models || []).slice(0, 5).map(esc).join(', ') || 'none');
      probedAgent = { url, name: res.name, power: res.power, models: res.models };
      $('#pair-add').disabled = false;
    }
  };
  $('#pair-add').onclick = async () => {
    if (!probedAgent) return;
    state.paired = await window.azure.addPaired(probedAgent);
    $('#pair-modal').classList.add('hidden');
    renderPairedList();
  };

  async function loadSettingsForm() {
    const s = await window.azure.getAllSettings();
    $('#set-ollama-url').value = s.ollamaUrl || 'http://127.0.0.1:11434';
    $('#set-cloud-key').value = s.cloudApiKey || '';
    $('#set-cloud-provider').value = s.cloudProvider || 'openai';
    $('#set-theme').value = s.theme || 'dark';
    await loadModels();
    if (s.defaultModel) $('#set-default-model').value = s.defaultModel;
  }

  $('#btn-save-settings').onclick = async () => {
    await window.azure.setSetting('ollamaUrl', $('#set-ollama-url').value.trim());
    await window.azure.setSetting('defaultModel', $('#set-default-model').value);
    await window.azure.setSetting('cloudApiKey', $('#set-cloud-key').value.trim());
    await window.azure.setSetting('cloudProvider', $('#set-cloud-provider').value);
    await window.azure.setSetting('theme', $('#set-theme').value);
    applyTheme($('#set-theme').value);
    $('#ollama-status').textContent = 'Saved!';
    $('#ollama-status').className = 'status-text ok';
    await loadModels();
  };

  $('#btn-check-ollama').onclick = async () => {
    const status = $('#ollama-status');
    status.textContent = 'Checking…';
    status.className = 'status-text';
    const running = await window.azure.isOllamaRunning();
    if (running) {
      status.textContent = 'Connected ✓';
      status.className = 'status-text ok';
      await loadModels();
    } else {
      status.textContent = 'Not reachable';
      status.className = 'status-text err';
    }
  };

  async function initApp() {
    const settings = await window.azure.getAllSettings();
    applyTheme(settings.theme || 'dark');
    state.chats = (await window.azure.listChats()) || [];
    state.projects = (await window.azure.listProjects()) || [];
    state.paired = (await window.azure.listPaired()) || [];
    await loadModels();
    await refreshTokens();
    renderChatList();
    renderProjects();
    renderMessages();
    updateAgentIndicator();
    setInterval(() => {
      if (!state.streaming) { loadModels(); refreshTokens(); }
    }, 45000);
  }

  (async () => {
    const ok = await checkOllama();
    if (ok) await initApp();
  })();
})();
