# Azure Agent Manager

Local-first AI desktop app (Electron + Ollama) with projects, remote agent pairing, and tokens.

## v1.1

- Renamed to **Azure Agent Manager**
- **Cancel generation** while streaming
- Smoother streaming (batched DOM updates, debounced saves)
- **Agents & Pairing**: host this PC or connect to another by IP
- **Tokens**: used only for remote agents; regen every 5 min by host power
- Updated icons (library / network / gear)
- Token badge in the title bar

## Run

```bash
npm install
npm start
```

## Pairing

1. Host: Agents → Start agent server → share IP (e.g. http://192.168.1.20:7749)
2. Client: Pair agent → Test → Pair → Use
3. Remote chats spend tokens; local is free

## License

MIT
