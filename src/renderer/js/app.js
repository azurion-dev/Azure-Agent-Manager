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
    $('#ollama-cancel').disabled = true;
    $('#ollama-progress-area')?.classList.remove('hidden');
    $('#ollama-hint').textContent = 'Installing in the background (no PowerShell window)…';
    $('#ollama-bar').style.width = '2%';
    $('#ollama-pct').textContent = '2%';
    $('#ollama-progress-label').textContent = 'Starting…';

    const unsub = window.azure.onInstallProgress?.((d) => {
      const pct = typeof d.percent === 'number' ? d.percent : 0;
      if ($('#ollama-bar')) $('#ollama-bar').style.width = pct + '%';
      if ($('#ollama-pct')) $('#ollama-pct').textContent = pct + '%';
      if ($('#ollama-progress-label')) $('#ollama-progress-label').textContent = d.label || 'Installing…';
    });

    const result = await window.azure.installOllama();
    try { unsub?.(); } catch {}

    if (result.ok) {
      if ($('#ollama-bar')) $('#ollama-bar').style.width = '100%';
      if ($('#ollama-pct')) $('#ollama-pct').textContent = '100%';
      $('#ollama-hint').textContent = 'Installed! Starting Ollama…';
      setTimeout(async () => {
        $('#ollama-modal').classList.add('hidden');
        await window.azure.startOllama();
        initApp();
      }, 800);
    } else {
      $('#ollama-hint').textContent = result.message || 'Install failed. Check your internet and try again.';
      btn.querySelector('.btn-label').classList.remove('hidden');
      btn.querySelector('.btn-spinner').classList.add('hidden');
      btn.disabled = false;
      $('#ollama-cancel').disabled = false;
    }
  };


  let currentView = 'chat';

  function showView(name) {
    // Clicking the same sidebar tab again returns to chat
    if (name && name === currentView && name !== 'chat') {
      name = 'chat';
    }
    currentView = name || 'chat';
    $$('.view').forEach(v => v.classList.remove('active'));
    const el = $(`#view-${currentView}`);
    if (el) {
      el.classList.add('active');
    } else {
      currentView = 'chat';
      $('#view-chat')?.classList.add('active');
    }
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === currentView));
    if (currentView === 'library') refreshLibrary();
    if (currentView === 'settings') loadSettingsForm();
    if (currentView === 'agents') refreshAgentsView();
  }

  $$('.nav-btn').forEach(btn => {
    btn.onclick = () => showView(btn.dataset.view);
  });

  // Brand / logo → always back to chat
  document.querySelector('.titlebar-brand')?.addEventListener('click', () => showView('chat'));
  // New chat already calls showView('chat') inside newChat()


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

  // Keep welcome node alive so empty chats never go blank
  let welcomeEl = $('#welcome');
  if (welcomeEl && !welcomeEl._cloned) {
    // stash a permanent clone template
    state._welcomeHtml = welcomeEl.outerHTML;
  }

  function ensureWelcome(container) {
    let welcome = container.querySelector('#welcome');
    if (!welcome) {
      if (state._welcomeHtml) {
        container.insertAdjacentHTML('afterbegin', state._welcomeHtml);
        welcome = container.querySelector('#welcome');
        // re-bind suggestion clicks
        welcome?.querySelectorAll('.suggestion').forEach(btn => {
          btn.onclick = () => {
            $('#input').value = btn.dataset.prompt;
            autoResize();
            updateSendBtn();
            sendMessage();
          };
        });
      }
    }
    return welcome;
  }

  function renderMessages() {
    const chat = currentChat();
    const container = $('#messages');
    if (!container) return;
    state.lastBodyEl = null;

    // Always stay on chat view when rendering messages
    if (currentView !== 'chat') showView('chat');

    if (!chat || !chat.messages.length) {
      container.innerHTML = '';
      const welcome = ensureWelcome(container);
      if (welcome) welcome.classList.remove('hidden');
      $('#session-pill')?.classList.add('hidden');
      return;
    }

    const welcome = container.querySelector('#welcome');
    if (welcome) welcome.classList.add('hidden');

    $('#session-pill')?.classList.remove('hidden');
    if ($('#session-name')) $('#session-name').textContent = chat.title || 'Session';

    let html = '';
    for (const m of chat.messages) {
      if (m.role === 'user') {
        html += `<div class="msg user"><div class="bubble">${esc(m.content)}</div></div>`;
      } else {
        const cancelled = m.cancelled ? ' cancelled' : '';
        const body = m.pending
          ? '<div class="typing-dots"><span></span><span></span><span></span></div>'
          : (m.cancelled && !m.content ? '<em>Generation cancelled</em>' : md(m.content || ''));
        html += `<div class="msg ai${cancelled}"><div class="av">A</div><div class="col"><div class="body markdown-body">${body}</div></div></div>`;
      }
    }
    // Preserve welcome node if present
    const keepWelcome = container.querySelector('#welcome');
    container.innerHTML = (keepWelcome ? keepWelcome.outerHTML : '') + html;
    const w2 = container.querySelector('#welcome');
    if (w2) w2.classList.add('hidden');
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
    if (!text) return '';
    // Extract fenced code blocks first so inner markdown is not processed
    const blocks = [];
    let src = String(text).replace(/\r\n/g, '\n');
    src = src.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const i = blocks.length;
      const l = (lang || '').trim().split(/[:\s]/)[0];
      blocks.push(`<pre class="md-pre"><code class="lang-${esc(l)}">${esc(code.replace(/\n$/, ''))}</code></pre>`);
      return `\n\n%%CODEBLOCK_${i}%%\n\n`;
    });

    // Escape remaining text
    let html = esc(src);

    // Headings
    html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // HR
    html = html.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/(<\/blockquote>)\n(<blockquote>)/g, '\n');

    // Ordered / unordered lists (simple)
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="ol">$1</li>');
    html = html.replace(/^[-*+]\s+(.+)$/gm, '<li class="ul">$1</li>');
    // Wrap consecutive li
    html = html.replace(/(<li class="ol">[\s\S]*?<\/li>)(?:\n<li class="ol">[\s\S]*?<\/li>)*/g, (m) =>
      '<ol>' + m.replace(/ class="ol"/g, '') + '</ol>');
    html = html.replace(/(<li class="ul">[\s\S]*?<\/li>)(?:\n<li class="ul">[\s\S]*?<\/li>)*/g, (m) =>
      '<ul>' + m.replace(/ class="ul"/g, '') + '</ul>');

    // Inline
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Paragraphs
    html = html.split(/\n\n+/).map(p => {
      const t = p.trim();
      if (!t) return '';
      if (/^%(?:%CODEBLOCK_\d+%%)/.test(t)) return t;
      if (/^<(h[1-6]|ul|ol|pre|blockquote|hr|div)/i.test(t)) return t;
      return `<p>${t.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    // Restore code blocks
    html = html.replace(/%%CODEBLOCK_(\d+)%%/g, (_, i) => blocks[Number(i)] || '');
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

  function setTokenWarn(msg) {
    const el = $('#token-warn');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  function updateSendBtn() {
    const hasText = inputEl.value.trim().length > 0;
    const hasModel = !!$('#model-select').value;
    const blocked = !!state.tokenBlocked;
    $('#btn-send').disabled = !hasText || !hasModel || state.streaming || blocked;
    $('#btn-send').classList.toggle('hidden', state.streaming);
    $('#btn-cancel').classList.toggle('hidden', !state.streaming);
  }


  $('#btn-send').onclick = () => sendMessage();
  $('#btn-cancel').onclick = async () => { await window.azure.cancelChat(); };

  function setStreaming(on) {
    state.streaming = on;
    updateSendBtn();
    inputEl.disabled = on;
    updateAgentIndicator();
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
    if (!text || !model || state.streaming || state.tokenBlocked) return;

    // Live policy + balance from host before sending
    if (state.activeAgentUrl) {
      try {
        const bal = await window.azure.remoteBalance(state.activeAgentUrl);
        if (!bal.error) {
          const agent = state.paired.find(a => a.url === state.activeAgentUrl);
          if (agent) {
            agent.requireTokens = bal.requireTokens !== false;
            agent.maxCostPerMsg = bal.maxCostPerMsg ?? agent.maxCostPerMsg;
          }
          if (typeof bal.tokens === 'number') {
            state.tokens = bal.tokens;
            $('#token-count').textContent = bal.tokens;
          }
          if (bal.requireTokens !== false) {
            const est = Math.max(1, Math.min(bal.maxCostPerMsg || 50, Math.ceil(text.length / 400)));
            if ((bal.tokens ?? 0) < est) {
              state.tokenBlocked = true;
              setTokenWarn(`Not enough tokens on the host (${bal.tokens}/${est}). Ask the host to grant more.`);
              updateSendBtn();
              return;
            }
          } else {
            state.tokenBlocked = false;
            setTokenWarn(null);
          }
        }
      } catch {}
    } else {
      state.tokenBlocked = false;
      setTokenWarn(null);
    }

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
    // Keep recent turns if history is very long (memory still carries older context)
    const MAX_TURNS = 48;
    const trimmedMsgs = msgsForApi.length > MAX_TURNS ? msgsForApi.slice(-MAX_TURNS) : msgsForApi;

    // Long-term memory (local or host when remote)
    let memoryFacts = await loadMemoryFacts();
    const memoryBlock = formatMemoryBlock(memoryFacts);

    let systemExtra = '';
    if (state.currentProjectId) {
      const proj = state.projects.find(p => p.id === state.currentProjectId);
      if (proj) {
        systemExtra = `

You are working inside the project "${proj.name}".
Project root folder (absolute): ${proj.folder}

When the user asks you to create, write, edit, or save a file you MUST apply the change by outputting ONE OR MORE of these blocks (not just example code):

\`\`\`file-edit path="relative/path/from/project/root"
full file contents here
\`\`\`

Rules:
- Always use the file-edit fence so the app can write the file to disk.
- path is relative to the project root unless absolute.
- Put the complete file content inside the block.
- You may still explain briefly in Markdown outside the block.
- Prefer real working code over placeholders.`;
      }
    }

    const messages = [
      {
        role: 'system',
        content:
          'You are Azure Agent, a helpful AI assistant. Prefer clear Markdown in replies (headings, lists, fenced code).\n' +
          'Use the conversation history in this chat AND the long-term memory below to stay consistent across sessions. ' +
          'If the user refers to earlier work (code, files, decisions), continue from that context instead of starting over.' +
          systemExtra +
          memoryBlock
      },
      ...trimmedMsgs
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
        // Update long-term memory from this exchange
        if (!data.cancelled) {
          const userMsg = [...(c?.messages || [])].reverse().find(m => m.role === 'user');
          await rememberExchange(userMsg?.content || '', last?.content || '', c?.id);
        }
      }
      setStreaming(false);
      renderMessages();
      renderChatList();
      // If UI is in tray / hidden, notify when the agent finishes
      if (!data.cancelled) {
        try {
          const visible = await window.azure.isWindowVisible();
          if (!visible) {
            const preview = (data.content || '').replace(/\s+/g, ' ').slice(0, 120);
            await window.azure.notify(
              'Azure Agent Manager',
              preview ? ('Agent finished: ' + preview + (preview.length >= 120 ? '…' : '')) : 'Your agent finished responding.'
            );
          }
        } catch {}
      }
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
      if (data.insufficient || /not enough tokens/i.test(data.error || '')) {
        state.tokenBlocked = true;
        setTokenWarn(data.error || 'Not enough tokens on the host. Ask the host to grant more.');
        updateSendBtn();
      }
    });



    const payload = { model, messages, options: { temperature: 0.7 } };
    if (state.activeAgentUrl) payload.agentUrl = state.activeAgentUrl;
    await window.azure.chat(payload);
  }



  async function parseAndApplyEdits(content) {
    if (!content) return;
    const edits = [];

    // ```file-edit path="..."
    const re1 = /```file-edit\s+path=["']([^"']+)["']\s*\n([\s\S]*?)```/gi;
    let match;
    while ((match = re1.exec(content)) !== null) {
      edits.push({ path: match[1].trim(), content: match[2].replace(/\n$/, '') });
    }

    // ```file path=... or ```write path=...
    const re2 = /```(?:file|write|create)(?:\s+path=["']?([^\s"'`]+)["']?)?\s*\n([\s\S]*?)```/gi;
    while ((match = re2.exec(content)) !== null) {
      if (match[1]) edits.push({ path: match[1].trim(), content: match[2].replace(/\n$/, '') });
    }

    // ```python:app.py or ```js:src/index.js
    const re3 = /```([a-zA-Z0-9_+-]+):([^\s\n]+)\s*\n([\s\S]*?)```/g;
    while ((match = re3.exec(content)) !== null) {
      edits.push({ path: match[2].trim(), content: match[3].replace(/\n$/, '') });
    }

    // <!-- file: path --> ... ```
    const re4 = /<!--\s*file:\s*([^\s>]+)\s*-->\s*```[^\n]*\n([\s\S]*?)```/gi;
    while ((match = re4.exec(content)) !== null) {
      edits.push({ path: match[1].trim(), content: match[2].replace(/\n$/, '') });
    }

    // Dedupe by path (last wins)
    const byPath = new Map();
    for (const e of edits) {
      if (e.path && e.content != null) byPath.set(e.path.replace(/\\/g, '/'), e.content);
    }
    if (!byPath.size) return;

    const proj = state.currentProjectId
      ? state.projects.find(p => p.id === state.currentProjectId)
      : null;

    const results = [];
    for (const [relPath, fileContent] of byPath) {
      let fullPath = relPath;
      const isAbs = /^[A-Za-z]:[\\/]/.test(relPath) || relPath.startsWith('/');
      if (!isAbs) {
        if (!proj) continue; // relative paths need an active project
        const root = proj.folder.replace(/[/\\]+$/, '');
        fullPath = root + '\\' + relPath.replace(/\//g, '\\').replace(/^\.\\/, '');
      }
      // Prefer native separators for Windows
      if (fullPath.includes('/') && !fullPath.startsWith('/')) {
        fullPath = fullPath.replace(/\//g, '\\');
      }

      const existing = await window.azure.readFile(fullPath);
      const oldContent = existing.content || '';
      const write = await window.azure.writeFile(fullPath, fileContent);
      if (write.ok) {
        const oldLines = oldContent ? oldContent.split('\n').length : 0;
        const newLines = fileContent.split('\n').length;
        results.push({
          path: relPath,
          type: existing.error ? 'add' : 'mod',
          added: Math.max(0, newLines - oldLines),
          removed: Math.max(0, oldLines - newLines)
        });
      } else {
        console.error('write failed', fullPath, write.error);
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

  // Remote/agent status icons (database variants)
  const AGENT_ICONS = {
    idle: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>',
    offline: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 17 5 5"/><path d="M19.323 13.744A9 3 0 0 0 21 12"/><path d="M21 13.127V5"/><path d="m22 17-5 5"/><path d="M3 12A9 3 0 0 0 13.563 14.954"/><path d="M3 5V19A9 3 0 0 0 13 21.981"/><ellipse cx="12" cy="5" rx="9" ry="3"/></svg>',
    limited: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15V5"/><path d="M22 19h-6"/><path d="M3 12A9 3 0 0 0 21 12"/><path d="M3 5V19A9 3 0 0 0 13.318 21.968"/><ellipse cx="12" cy="5" rx="9" ry="3"/></svg>',
    fast: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 22v-6"/><path d="M21 12.536V5"/><path d="m22 19-3-3-3 3"/><path d="M3 12A9 3 0 0 0 14.457 14.886"/><path d="M3 5V19A9 3 0 0 0 13.318 21.968"/><ellipse cx="12" cy="5" rx="9" ry="3"/></svg>',
    active: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 15 21.84"/><path d="M21 5V8"/><path d="M21 12L18 17H22L19 22"/><path d="M3 12A9 3 0 0 0 14.59 14.87"/></svg>'
  };

  function setAgentNavIcon(kind) {
    const el = $('#nav-agents-icon');
    if (!el) return;
    el.innerHTML = AGENT_ICONS[kind] || AGENT_ICONS.idle;
    el.dataset.status = kind;
    el.title = ({
      idle: 'Agent idle',
      offline: 'Remote offline',
      limited: 'High load / limited',
      fast: 'Low load / ready',
      active: 'Generating…'
    })[kind] || '';
  }

  function updateAgentIndicator() {
    if (state.activeAgentUrl) {
      $('#context-info').textContent = 'Remote: ' + (state.activeAgentName || state.activeAgentUrl);
      const agent = state.paired.find(a => a.url === state.activeAgentUrl);
      $('#agent-indicator').textContent = agent?.requireTokens === false ? 'Free remote' : 'Tokens apply';
      if (state.streaming) setAgentNavIcon('active');
      else if (state.tokenBlocked) setAgentNavIcon('limited');
      else if (agent?.requireTokens === false) setAgentNavIcon('fast');
      else setAgentNavIcon('idle');
    } else {
      $('#context-info').textContent = 'Local agent';
      $('#agent-indicator').textContent = 'Free';
      setAgentNavIcon(state.streaming ? 'active' : 'idle');
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

  async function loadMemoryFacts() {
    if (state.activeAgentUrl) {
      const res = await window.azure.remoteMemory(state.activeAgentUrl, 'list');
      if (!res.error && Array.isArray(res.memory)) return res.memory;
    }
    return (await window.azure.listMemory()) || [];
  }

  function formatMemoryBlock(facts) {
    if (!facts?.length) return '';
    const lines = facts.slice(0, 30).map(f => `- ${f.text}`).join('\n');
    return `\n\n## Long-term memory (from earlier chats — treat as true context)\n${lines}\n`;
  }

  function summarizeForMemory(userText, assistantText) {
    const u = String(userText || '').replace(/\s+/g, ' ').trim();
    if (u.length < 8) return null;
    // Prefer user intent; light assist from first line of reply
    let fact = u.slice(0, 220);
    if (/```/.test(assistantText || '') || /\b(function|class|def |import |const |let )/i.test(assistantText || '')) {
      fact = `User is working on code: ${fact}`;
    } else if (/\b(file|project|folder|app\.py|create|edit)\b/i.test(u)) {
      fact = `User project/task: ${fact}`;
    } else {
      fact = `User said: ${fact}`;
    }
    return fact;
  }

  async function rememberExchange(userText, assistantText, chatId) {
    const text = summarizeForMemory(userText, assistantText);
    if (!text) return;
    const fact = { text, chatId: chatId || null, at: Date.now() };
    if (state.activeAgentUrl) {
      await window.azure.remoteMemory(state.activeAgentUrl, 'add', fact);
    } else {
      await window.azure.addMemory(fact);
    }
    await renderMemoryPanel();
  }

  async function clearAllMemory() {
    if (state.activeAgentUrl) {
      await window.azure.remoteMemory(state.activeAgentUrl, 'clear');
    } else {
      await window.azure.clearMemory();
    }
    await renderMemoryPanel();
  }

  async function renderMemoryPanel() {
    const box = $('#memory-list');
    if (!box) return;
    const facts = await loadMemoryFacts();
    $('#memory-count') && ($('#memory-count').textContent = String(facts.length));
    if (!facts.length) {
      box.innerHTML = '<div class="empty-state">No memory yet — it fills in as you chat.</div>';
      return;
    }
    box.innerHTML = facts.map(f =>
      `<div class="memory-item">${esc(f.text)}</div>`
    ).join('');
  }

  $('#btn-clear-memory')?.addEventListener('click', async () => {
    if (!confirm('Clear long-term memory? The AI will forget prior chats context.')) return;
    await clearAllMemory();
  });

  async function refreshTokens() {
    // Prefer host balance when using a remote agent
    if (state.activeAgentUrl) {

      const bal = await window.azure.remoteBalance(state.activeAgentUrl);
      if (!bal.error && typeof bal.tokens === 'number') {
        state.tokens = bal.tokens;
        $('#token-count').textContent = bal.tokens;
        $('#token-big').textContent = bal.tokens;
        if (bal.requireTokens === false) {
          state.tokenBlocked = false;
          setTokenWarn(null);
        }
        return;
      }
    }
    const t = await window.azure.getTokens();
    state.tokens = t.tokens;
    state.tokenCap = t.cap;
    $('#token-count').textContent = t.tokens;
    if ($('#token-big')) $('#token-big').textContent = t.tokens;
    if ($('#token-cap-label')) $('#token-cap-label').textContent = t.cap;
    if ($('#token-cap-input')) $('#token-cap-input').value = t.cap;
  }

  async function renderHostClients() {
    const list = $('#host-clients-list');
    if (!list) return;
    const clients = await window.azure.listAgentClients();
    if (!clients.length) {
      list.innerHTML = '<div class="empty-state">No devices connected yet</div>';
      return;
    }
    list.innerHTML = clients.map(c => {
      const ago = c.lastSeen ? Math.round((Date.now() - c.lastSeen) / 60000) : '?';
      return `<div class="host-client-row" data-id="${esc(c.id)}">
        <div class="hci-main">
          <div class="hci-name">${esc(c.name || 'Device')}</div>
          <div class="hci-meta">${esc(c.id.slice(0, 8))}… · ${c.chatCount || 0} chats · last ${ago}m ago</div>
          <div class="hci-preview">${esc(c.lastPreview || '')}</div>
        </div>
        <div class="hci-tokens">
          <strong>${c.tokens ?? 0}</strong>
          <span class="hci-mem">${(c.memory && c.memory.length) || 0} mem</span>
          <button class="btn btn-secondary btn-sm" data-grant="10">+10</button>
          <button class="btn btn-secondary btn-sm" data-grant="50">+50</button>
          <button class="btn btn-ghost btn-sm" data-set="0">Reset tok</button>
          <button class="btn btn-ghost btn-sm" data-clearmem="1">Clear mem</button>
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-grant]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.closest('.host-client-row')?.dataset.id;
        await window.azure.grantClientTokens(id, parseInt(btn.dataset.grant, 10));
        await renderHostClients();
      };
    });
    list.querySelectorAll('[data-set]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.closest('.host-client-row')?.dataset.id;
        await window.azure.setClientTokens(id, 0);
        await renderHostClients();
      };
    });
    list.querySelectorAll('[data-clearmem]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.closest('.host-client-row')?.dataset.id;
        if (!confirm('Clear this device\'s long-term memory on the host?')) return;
        await window.azure.clearClientMemory(id);
        await renderHostClients();
      };
    });
  }

  $('#btn-refresh-clients')?.addEventListener('click', () => renderHostClients());


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
    const reqTok = await window.azure.getSetting('agentRequireTokens');
    const maxCost = await window.azure.getSetting('agentMaxCostPerMsg');
    const maxChars = await window.azure.getSetting('agentMaxResponseChars');
    if ($('#agent-require-tokens')) $('#agent-require-tokens').checked = reqTok !== false;
    if ($('#agent-max-cost') && maxCost != null) $('#agent-max-cost').value = maxCost;
    if ($('#agent-max-chars') && maxChars != null) $('#agent-max-chars').value = maxChars;
    state.paired = await window.azure.listPaired();
    renderPairedList();
    await renderHostClients();
    await refreshTokens();
    await renderMemoryPanel();
  }



  $('#btn-save-host-policy')?.addEventListener('click', async () => {
    const name = $('#agent-name-input')?.value.trim();
    const port = parseInt($('#agent-port-input')?.value, 10) || 7749;
    if (name) await window.azure.setSetting('agentServerName', name);
    await window.azure.setSetting('agentServerPort', port);
    await window.azure.setSetting('agentRequireTokens', !!$('#agent-require-tokens')?.checked);
    await window.azure.setSetting('agentMaxCostPerMsg', Math.max(1, Math.min(100, parseInt($('#agent-max-cost')?.value, 10) || 50)));
    await window.azure.setSetting('agentMaxResponseChars', Math.max(1000, parseInt($('#agent-max-chars')?.value, 10) || 50000));
    const st = $('#server-status');
    if (st) {
      const prev = st.textContent;
      st.textContent = 'Policy saved';
      st.className = 'status-text ok';
      setTimeout(() => { st.textContent = prev; }, 1500);
    }
  });

  function renderPairedList() {
    const list = $('#paired-list');
    if (!state.paired.length) {
      list.innerHTML = '<div class="empty-state">No paired agents yet</div>';
      return;
    }
    list.innerHTML = state.paired.map(a => {
      const active = state.activeAgentUrl === a.url;
      const tok = a.requireTokens === false ? 'Free' : ('Tokens · max ' + (a.maxCostPerMsg || 50) + '/msg');
      return `<div class="paired-item ${active ? 'active-agent' : ''}">
        <div class="info">
          <div class="name">${esc(a.name || 'Agent')}</div>
          <div class="url">${esc(a.url)} · ${esc(tok)}</div>
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
          state.tokenBlocked = false;
          setTokenWarn(null);
        } else {
          state.activeAgentUrl = agent.url;
          state.activeAgentName = agent.name;
          // Refresh live host policy + balance
          const bal = await window.azure.remoteBalance(agent.url);
          if (!bal.error) {
            agent.requireTokens = bal.requireTokens !== false;
            agent.maxCostPerMsg = bal.maxCostPerMsg ?? 50;
            if (typeof bal.tokens === 'number') {
              state.tokens = bal.tokens;
              $('#token-count').textContent = bal.tokens;
            }
            if (bal.requireTokens === false) {
              state.tokenBlocked = false;
              setTokenWarn(null);
            }
          }
        }
        await loadModels();
        renderPairedList();
        updateAgentIndicator();
        updateSendBtn();
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
      await window.azure.setSetting('agentRequireTokens', !!$('#agent-require-tokens')?.checked);
      await window.azure.setSetting('agentMaxCostPerMsg', Math.max(1, Math.min(100, parseInt($('#agent-max-cost')?.value, 10) || 50)));
      await window.azure.setSetting('agentMaxResponseChars', Math.max(1000, parseInt($('#agent-max-chars')?.value, 10) || 50000));
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
      probedAgent = {
        url,
        name: res.name,
        power: res.power,
        models: res.models,
        requireTokens: res.requireTokens !== false,
        maxCostPerMsg: res.maxCostPerMsg ?? 50,
        regenRate: res.regenRate
      };
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

  // ─── Auto-update UI ───────────────────────────────────────────
  let pendingUpdate = null;
  let updateBusy = false;

  async function showPostUpdateIfNeeded() {
    const res = await window.azure.getPostUpdate();
    const notes = res?.notes;
    const info = res?.info;
    if (!notes && !info) return false;
    const notesEl = $('#updated-notes');
    const line = $('#updated-version-line');
    if (notes?.body) {
      notesEl.textContent = notes.body;
      notesEl.classList.remove('hidden');
    } else {
      notesEl.textContent = 'Thanks for updating. Enjoy the latest improvements.';
    }
    if (info?.previousVersion && info?.currentVersion) {
      line.textContent = `Updated from ${info.previousVersion} to ${info.currentVersion}.`;
    } else if (notes?.version) {
      line.textContent = `You are now on version ${notes.version}.`;
    } else {
      line.textContent = 'You are now on the latest version.';
    }
    $('#updated-modal').classList.remove('hidden');
    return true;
  }

  $('#updated-ok')?.addEventListener('click', async () => {
    await window.azure.dismissUpdateNotes();
    $('#updated-modal').classList.add('hidden');
  });

  function showUpdateModal(data) {
    pendingUpdate = data;
    $('#upd-from').textContent = data.current || '?';
    $('#upd-to').textContent = data.latest || '?';
    const notes = data.body || 'No release notes provided.';
    const notesEl = $('#upd-notes');
    if (notesEl) notesEl.innerHTML = `<div class="markdown-body">${md(notes)}</div>`;

    $('#upd-download-area').classList.add('hidden');
    $('#upd-hint').textContent = data.assetName
      ? `Installer: ${data.assetName}`
      : 'Installer package will be downloaded from GitHub Releases.';
    $('#upd-offline').classList.add('hidden');
    // Patch-only → allow "Update later"; minor/major force update
    const later = $('#upd-later');
    if (data.force) {
      later.classList.add('hidden');
    } else {
      later.classList.remove('hidden');
    }
    $('#upd-actions').classList.remove('hidden');
    $('#upd-now').disabled = false;
    $('#update-modal').classList.remove('hidden');
  }

  function showOfflineUpdateHint() {
    $('#upd-from').textContent = '?';
    $('#upd-to').textContent = '?';
    $('#upd-notes').textContent = 'Could not reach GitHub to check for updates.';
    $('#upd-offline').classList.remove('hidden');
    $('#upd-later').classList.remove('hidden');
    $('#upd-later').textContent = 'OK';
    $('#upd-now').classList.add('hidden');
    $('#upd-actions').classList.remove('hidden');
    $('#update-modal').classList.remove('hidden');
  }

  $('#upd-later')?.addEventListener('click', async () => {
    if (pendingUpdate?.latest && !pendingUpdate.force) {
      await window.azure.skipVersion(pendingUpdate.latest);
    }
    $('#update-modal').classList.add('hidden');
    $('#upd-now').classList.remove('hidden');
    $('#upd-later').textContent = 'Update later';
    pendingUpdate = null;
  });

  $('#upd-now')?.addEventListener('click', async () => {
    if (!pendingUpdate || updateBusy) return;
    if (!pendingUpdate.downloadUrl) {
      $('#upd-hint').textContent = 'No downloadable installer found on this release. Open the GitHub release page instead.';
      if (pendingUpdate.htmlUrl) {
        // cannot open from renderer easily — user sees message
      }
      return;
    }
    updateBusy = true;
    $('#upd-actions').classList.add('hidden');
    $('#upd-download-area').classList.remove('hidden');
    $('#upd-progress-label').textContent = 'Downloading installer…';
    $('#upd-bar').style.width = '0%';

    const unsub = window.azure.onUpdateProgress((p) => {
      const pct = p.percent || 0;
      $('#upd-bar').style.width = pct + '%';
      const mb = p.total ? (p.received / 1048576).toFixed(1) + ' / ' + (p.total / 1048576).toFixed(1) + ' MB' : '';
      $('#upd-progress-label').textContent = `Downloading… ${pct}% ${mb}`;
    });

    const result = await window.azure.downloadUpdate({
      downloadUrl: pendingUpdate.downloadUrl,
      assetName: pendingUpdate.assetName || 'AAM_WIN_amd64.exe',
      body: pendingUpdate.body,
      latest: pendingUpdate.latest
    });
    unsub();
    if (!result.ok) {
      updateBusy = false;
      $('#upd-actions').classList.remove('hidden');
      $('#upd-hint').textContent = 'Download failed: ' + (result.error || 'unknown error');
      $('#upd-progress-label').textContent = 'Failed';
    } else {
      $('#upd-progress-label').textContent = 'Starting installer… The app will close.';
      $('#upd-bar').style.width = '100%';
    }
  });

  async function runUpdateCheck() {
    // Show post-update notes first (after a successful install)
    const showedNotes = await showPostUpdateIfNeeded();
    if (showedNotes) return;

    const skipped = await window.azure.getSkippedVersion();
    const result = await window.azure.checkUpdate();
    if (!result.ok) {
      if (result.offline) {
        // silent if offline on routine check — only show if user expects it
        // optional subtle: skip
      }
      return;
    }
    if (!result.updateAvailable) return;
    if (skipped && skipped === result.latest && !result.force) return;
    showUpdateModal(result);
  }

  // UI zoom: Ctrl + / - / 0 and Ctrl + mouse wheel
  let uiZoom = parseFloat(localStorage.getItem('aam-ui-zoom') || '1') || 1;
  function applyZoom(z) {
    uiZoom = Math.max(0.75, Math.min(1.5, z));
    document.documentElement.style.zoom = String(uiZoom);
    localStorage.setItem('aam-ui-zoom', String(uiZoom));
  }
  applyZoom(uiZoom);
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); applyZoom(uiZoom + 0.05); }
    if (e.key === '-') { e.preventDefault(); applyZoom(uiZoom - 0.05); }
    if (e.key === '0') { e.preventDefault(); applyZoom(1); }
  });
  window.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    applyZoom(uiZoom + (e.deltaY < 0 ? 0.05 : -0.05));
  }, { passive: false });

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
    await renderMemoryPanel();
    // check updates after UI is ready
    setTimeout(() => { runUpdateCheck(); }, 1200);
    setInterval(() => {
      if (!state.streaming) { loadModels(); refreshTokens(); }
    }, 45000);

    // Tray menu actions
    window.azure.onTrayNewChat?.(() => {
      showView('chat');
      if (!state.streaming) newChat();
    });
    window.azure.onTrayCheckUpdate?.(() => {
      runUpdateCheck();
    });
  }



  (async () => {
    const ok = await checkOllama();
    if (ok) await initApp();
    else {
      // still allow post-update dialog even if ollama missing
      await showPostUpdateIfNeeded();
    }
  })();
})();

