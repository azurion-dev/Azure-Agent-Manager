# Azure Agent Manager

Local-first AI desktop app (Electron + Ollama) by **Azurion**.

Green UI · projects · remote agent pairing · tokens · auto-update from GitHub Releases.

## Repository

https://github.com/azurion-dev/Azure-Agent-Manager

## Run (dev)

```bash
npm install
npm start
```

## Build Windows installer

```bash
npm run dist:win
```

Output: `dist/AAM_WIN_amd64.exe` — attach this file to a GitHub Release.

### Releases

1. Bump `"version"` in `package.json`
2. `npm run dist:win`
3. GitHub Release tag e.g. `v1.0.1` + attach `AAM_WIN_amd64.exe`
4. Write release notes (shown in-app)

### Update rules

| Change | Example | Update later |
|--------|---------|--------------|
| Patch | 1.0.0 → 1.0.1 | Yes |
| Minor/major | 1.0.0 → 1.1.0 | No (forced) |

Update now downloads the installer, launches it, quits the app. Next open shows the “was updated” dialog with notes.

## Icons

`assets/app.png` and `assets/app.ico`

## License

MIT
