# Changelog

All notable changes to **Azure Agent Manager** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.3.0] — 2026-10-15

Long-term memory across chats, silent Ollama install with in-app progress, status icons, and single-instance lock.

### Added
- **Long-term memory** across chats (facts from past prompts injected into the system prompt)
- Memory stored **locally**, or **on the host per device** when using a remote agent
- **Clear memory** in Agents; host can **Clear mem** per connected device
- In-chat history kept (recent turns) so follow-ups like “add division” stay in context
- **Ollama install progress UI** (% bar + status) — no visible PowerShell window
- Silent Windows install via `OllamaSetup.exe` (`/VERYSILENT`), with install.ps1 fallback
- **Agent status icons** (database variants): idle, offline, limited, fast, active/generating
- Sidebar icons refreshed: **book** (library), **settings**, **triangle-alert** (Ollama modal)
- **Single-instance lock**: second launch focuses the existing window instead of opening another

### Fixed
- Ollama installer opening an empty PowerShell and appearing stuck
- Broken / incomplete sidebar and modal icons

### Changed
- Install flow runs fully in the background and reports progress to the renderer

---

## [1.2.0] — 2026-10-14

Host-authoritative tokens, connected-devices panel, richer Markdown, project file writes, tray polish, and UI zoom.


### Added
- **Host-side token balances** per client `deviceId` (stored on the host, not the client)
- Host API: `/agent/register`, `/agent/balance`; chat charges tokens only when the host requires them
- **Connected devices** panel (Agents): list devices, chat counts, last preview, grant **+10 / +50**, reset balance
- Host policy: require tokens on/off, max cost per message, max response size
- **Token warning** under the composer when the host balance is too low (blocks send)
- Live policy refresh before each remote send and when selecting a paired agent
- **UI zoom**: `Ctrl`/`Cmd` + `+` / `-` / `0`, and `Ctrl` + mouse wheel (persisted)
- Stronger project system prompt + multiple **file-edit** formats (`file-edit`, `lang:path`, etc.)
- `writeFile` creates parent directories; edited-files panel on successful writes
- Improved **Markdown** in chat (headings, lists, quotes, links, fenced code)
- Update modal release notes rendered as Markdown
- System tray: hide on close, context menu (Open UI, New chat, Check for updates, Quit), notification when a reply finishes while hidden
- Click active sidebar tab or title-bar brand to return to chat

### Fixed
- Remote still consuming local tokens after host disabled “Require tokens”
- Empty / black chat view after switching sessions (welcome node lost from DOM)
- Models answering with sample code instead of writing project files (prompt + parsers)

### Changed
- Client no longer deducts remote tokens locally; host is authoritative
- Token badge reflects host balance when a remote agent is active

---

## [1.0.0] — 2026-10-14


Initial public release of **Azure Agent Manager** — a fully local-first Electron desktop app for chatting with Ollama models, managing projects, pairing remote agents, and updating from GitHub Releases.

### Added

#### Core application
- Electron desktop shell (main / preload / renderer) with **frameless custom title bar**
- App branding: **Azure Agent Manager** (Azurion)
- App icons from `assets/app.png` and `assets/app.ico` (window, tray, installer, title bar, welcome screen)
- Dark theme by default; light and system theme options in Settings
- **Green accent palette** aligned with the official logo (replacing the earlier blue/purple palette)
- UI fully in **English**

#### Local AI (Ollama)
- Detect whether Ollama is installed on first launch
- Install prompt on Windows via `irm https://ollama.com/install.ps1 | iex`
- **Cancel** on the install dialog quits the app; **Install** runs the installer and continues
- On macOS/Linux, opens the official Ollama download page
- Auto-start Ollama (`ollama serve`) when installed but not running
- Streaming chat against the local Ollama HTTP API
- **Stop generation** control (cancel in-flight streams with `AbortController`)
- Model library: list installed models, browse popular models, pull by name, delete models
- Brand-colored model badges (DeepSeek, Llama, Qwen, Mistral, Phi, Gemma, LLaVA, and more)
- Custom model picker dropdown with icons (not a plain native `<select>`)

#### Chat experience
- Sidebar chat list with search
- Welcome screen with suggestion prompts
- Streaming replies with batched DOM updates (`requestAnimationFrame`) for smoother performance
- Debounced chat persistence while streaming
- Markdown-style rendering for assistant messages (code blocks, lists, bold, inline code)
- New chat, delete chat, and session pill in the title bar

#### Projects
- Create a project with a **name** and a **folder** on disk
- Active project injects context so the agent can read/write files in that folder
- File edits via fenced blocks:
  ````
  ```file-edit path="relative/or/absolute/path"
  ...full file content...
  ```
  ````
- **Edited files** panel showing added / modified paths and line stats

#### Agents & pairing (distributed compute)
- **Host this PC as an agent**: local HTTP agent server (default port `7749`)
- Share LAN IPs so other machines can connect
- Machine **power score** (CPU/RAM heuristic) and client token regen rate exposed on `/agent/info`
- **Pair remote agents** by URL (probe connection, list models, use for chat)
- Proxy streaming chat through the remote agent to its local Ollama instance

#### Tokens
- Token balance shown in the title bar badge
- Tokens are spent **only** when using a **remote** paired agent (local models stay free)
- Cost estimate from input size and response length
- Regeneration every **5 minutes**, rate scaled by host machine power
- Configurable token cap in the Agents view

#### Settings
- Ollama base URL and default model
- Connection check
- Optional cloud provider + API key storage (OpenAI-compatible fields for future wiring)
- Theme: dark / light / system

#### Auto-update (GitHub Releases)
- Checks [azurion-dev/Azure-Agent-Manager](https://github.com/azurion-dev/Azure-Agent-Manager) `releases/latest` on startup
- Version comparison with semver:
  - **Patch** (e.g. `1.0.0` → `1.0.1`): **Update later** + **Update now**
  - **Minor / major** (e.g. `1.0.0` → `1.1.0`): forced update (no “Update later”)
- Downloads release asset **`AAM_WIN_amd64.exe`**, launches the installer, then quits the current process
- Offline / network failure messaging when GitHub cannot be reached
- After a successful update, shows **“Azure Agent Manager was updated”** with scrollable release notes and **OK**
- Skipped patch versions remembered until a newer release appears
- Windows build artifact name: `AAM_WIN_amd64.exe` (NSIS installer via electron-builder)

#### System tray
- Closing the window **hides to the system tray** instead of quitting
- Tray icon uses the app logo at an appropriate size
- Context menu:
  - **Azure Agent Manager** (header with logo, non-selectable)
  - Open UI
  - New chat
  - Check for updates
  - Quit
- Double-click tray icon opens the UI; single-click toggles visibility on Windows
- **Desktop notification** when an agent finishes responding while the window is hidden (click opens the app)

#### Navigation
- Sidebar tabs: Model Library, Agents & Pairing, Settings
- Clicking the **active** tab again returns to the chat view
- Clicking the **title-bar brand / logo** returns to chat
- Selecting a chat or creating a new chat always shows the chat view

### Performance & reliability
- Stream rendering updates only the last assistant bubble (avoids full chat re-renders every token)
- Debounced save of chat history during generation
- Abort of previous streams when starting a new one or pressing Stop
- Block switching chats while a response is streaming
- Safer window resize persistence (debounced bounds write)

### Packaging
- `package.json` product name **Azure Agent Manager**, app id `com.azurion.agentmanager`
- electron-builder targets: Windows NSIS (`AAM_WIN_amd64.exe`), macOS DMG, Linux AppImage
- GitHub publish config pointed at `azurion-dev/Azure-Agent-Manager`
- Icons wired for installer, uninstaller, and shortcuts

### Project layout

```
bionic-ai/   (project root)
├── assets/
│   ├── app.png
│   └── app.ico
├── package.json
├── CHANGELOG.md
├── README.md
└── src/
    ├── main/
    │   ├── main.js      # Window, tray, Ollama, agent server, IPC
    │   └── updater.js   # GitHub Releases auto-update
    ├── preload/
    │   └── preload.js   # Secure bridge (`window.azure`)
    └── renderer/
        ├── index.html
        ├── css/styles.css
        └── js/app.js
```

### Known limitations
- Cloud API keys are stored in Settings; full OpenAI-compatible streaming chat is prepared for a follow-up release
- GitHub Releases must publish an asset named `AAM_WIN_amd64.exe` (or `AAM_WIN_x64.exe`) for auto-update to install on Windows
- File attach button in the input bar is reserved for a future version
- Agent server has no authentication yet — intended for trusted LAN use only

---

## Development history (pre-1.0.0, this chat)

Work completed from the first scaffold through the 1.0.0 feature set:

1. **Initial Electron scaffold** — chat UI inspired by AzureIA / modern agent UIs, Ollama install gate, projects, model library, no accounts/tokens
2. **Rename & rework** — Bionic AI → Azure Agent Manager; cancel generation; performance fixes; Agents pairing + token economy
3. **Branding** — custom logo integration; per-model family icons in library and picker
4. **Auto-update** — GitHub Releases check, force vs optional updates, installer download, post-update notes, green theme
5. **Tray & navigation** — system tray lifecycle, finish notifications, fix sidebar “stuck” views so users can always return to chat

---

[1.0.0]: https://github.com/azurion-dev/Azure-Agent-Manager/releases/tag/v1.0.0
