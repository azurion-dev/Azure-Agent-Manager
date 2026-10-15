/**
 * GitHub Releases auto-updater for Azure Agent Manager
 * Repo: https://github.com/azurion-dev/Azure-Agent-Manager
 * Expected Windows asset: AAM_WIN_amd64.exe (also accepts AAM_WIN_x64.exe)
 */
const { app, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');

const GITHUB_OWNER = 'azurion-dev';
const GITHUB_REPO = 'Azure-Agent-Manager';
const RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const ASSET_NAMES = ['AAM_WIN_amd64.exe', 'AAM_WIN_x64.exe', 'AAM_WIN_x64.msi'];

function parseSemver(v) {
  const clean = String(v || '0.0.0').replace(/^v/i, '').split('-')[0];
  const parts = clean.split('.').map(n => parseInt(n, 10) || 0);
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0, raw: clean };
}

function compareSemver(a, b) {
  const A = parseSemver(a);
  const B = parseSemver(b);
  if (A.major !== B.major) return A.major - B.major;
  if (A.minor !== B.minor) return A.minor - B.minor;
  return A.patch - B.patch;
}

/** true if update changes major or minor (force — no "Update later") */
function isForceUpdate(current, latest) {
  const c = parseSemver(current);
  const l = parseSemver(latest);
  return l.major > c.major || (l.major === c.major && l.minor > c.minor);
}

function fetchJson(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Azure-Agent-Manager-Updater',
        'Accept': 'application/vnd.github+json'
      },
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJson(res.headers.location, timeoutMs).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API HTTP ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Network timeout')); });
  });
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const doGet = (u, redirects = 0) => {
      if (redirects > 8) return reject(new Error('Too many redirects'));
      const lib = u.startsWith('https') ? https : http;
      const req = lib.get(u, {
        headers: { 'User-Agent': 'Azure-Agent-Manager-Updater' },
        timeout: 60000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doGet(res.headers.location, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        const file = fs.createWriteStream(dest);
        res.on('data', chunk => {
          received += chunk.length;
          if (onProgress && total) {
            onProgress({ received, total, percent: Math.round((received / total) * 100) });
          }
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
        file.on('error', (err) => {
          try { fs.unlinkSync(dest); } catch {}
          reject(err);
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
    };
    doGet(url);
  });
}

async function checkForUpdate(currentVersion) {
  try {
    const release = await fetchJson(RELEASES_API);
    const latestTag = (release.tag_name || release.name || '').replace(/^v/i, '');
    if (!latestTag) {
      return { ok: true, updateAvailable: false };
    }
    const cmp = compareSemver(currentVersion, latestTag);
    if (cmp >= 0) {
      return { ok: true, updateAvailable: false, current: currentVersion, latest: latestTag };
    }

    const assets = release.assets || [];
    let asset = null;
    for (const name of ASSET_NAMES) {
      asset = assets.find(a => a.name.toLowerCase() === name.toLowerCase());
      if (asset) break;
    }
    // fallback: any .exe
    if (!asset) {
      asset = assets.find(a => /\.exe$/i.test(a.name));
    }

    return {
      ok: true,
      updateAvailable: true,
      current: currentVersion,
      latest: latestTag,
      force: isForceUpdate(currentVersion, latestTag),
      name: release.name || latestTag,
      body: release.body || '',
      publishedAt: release.published_at,
      assetName: asset?.name || null,
      downloadUrl: asset?.browser_download_url || null,
      htmlUrl: release.html_url
    };
  } catch (e) {
    const offline = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|Network|timeout|getaddrinfo/i.test(e.message);
    return {
      ok: false,
      offline: offline || e.message === 'Network timeout',
      error: e.message
    };
  }
}

function getUpdateDir() {
  const dir = path.join(app.getPath('userData'), 'updates');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function downloadAndInstall(downloadUrl, assetName, onProgress) {
  const dir = getUpdateDir();
  const dest = path.join(dir, assetName || 'AAM_WIN_amd64.exe');
  // clear old installers
  try {
    for (const f of fs.readdirSync(dir)) {
      if (/\.exe$/i.test(f)) {
        try { fs.unlinkSync(path.join(dir, f)); } catch {}
      }
    }
  } catch {}

  await downloadFile(downloadUrl, dest, onProgress);

  // mark that we're updating — next launch shows "updated" dialog
  const marker = path.join(app.getPath('userData'), 'pending-update.json');
  fs.writeFileSync(marker, JSON.stringify({
    fromVersion: app.getVersion(),
    installer: dest,
    startedAt: Date.now()
  }), 'utf-8');

  // Launch installer and quit
  if (process.platform === 'win32') {
    spawn(dest, [], {
      detached: true,
      stdio: 'ignore',
      shell: true
    }).unref();
  } else {
    // non-windows: open file / folder
    shell.openPath(dest);
  }

  setTimeout(() => {
    app.quit();
  }, 800);

  return { ok: true, path: dest };
}

function consumePostUpdateMarker(store) {
  const marker = path.join(app.getPath('userData'), 'pending-update.json');
  const doneFlag = path.join(app.getPath('userData'), 'just-updated.json');
  try {
    if (fs.existsSync(marker)) {
      // installer ran; convert to just-updated for UI
      const data = JSON.parse(fs.readFileSync(marker, 'utf-8'));
      fs.writeFileSync(doneFlag, JSON.stringify({
        previousVersion: data.fromVersion,
        currentVersion: app.getVersion(),
        at: Date.now()
      }), 'utf-8');
      try { fs.unlinkSync(marker); } catch {}
    }
  } catch {}

  try {
    if (fs.existsSync(doneFlag)) {
      const info = JSON.parse(fs.readFileSync(doneFlag, 'utf-8'));
      // only show if version actually changed OR we have a stored changelog
      try { fs.unlinkSync(doneFlag); } catch {}
      return info;
    }
  } catch {}
  return null;
}

function saveLastChangelog(store, body, version) {
  if (store) {
    store.set('lastUpdateNotes', { body: body || '', version: version || '', at: Date.now() });
  }
}

module.exports = {
  checkForUpdate,
  downloadAndInstall,
  consumePostUpdateMarker,
  saveLastChangelog,
  parseSemver,
  compareSemver,
  isForceUpdate,
  GITHUB_OWNER,
  GITHUB_REPO
};
