// Google Drive: sign-in (Google Identity Services) and file operations.
// Scope drive.file: the app only sees the files and folders it created itself.
import CONFIG from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
let gisP = null, tokenClient = null, token = null, tokenExp = 0, pending = null;

export const driveConfigured = () => !!CONFIG.googleClientId;
export const driveConnected = () => !!token && Date.now() < tokenExp - 60000;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisP) return gisP;
  gisP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => res(); s.onerror = () => { gisP = null; rej(new Error('Não foi possível carregar o login do Google. Verifique a internet.')); };
    document.head.appendChild(s);
  });
  return gisP;
}
// Must be called from a tap/click the first time (Google opens a popup)
export async function connect(interactive = true) {
  if (!driveConfigured()) throw new Error('O Google Drive ainda não foi configurado neste site.');
  if (driveConnected()) return token;
  await loadGis();
  if (!tokenClient) tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.googleClientId, scope: SCOPE,
    callback: r => { const p = pending; pending = null; if (r.error) p?.rej(new Error(r.error_description || r.error)); else { token = r.access_token; tokenExp = Date.now() + (r.expires_in || 3600) * 1000; try { localStorage.setItem('rds-drive-ok', '1'); } catch {} p?.res(token); } },
    error_callback: e => { const p = pending; pending = null; p?.rej(new Error(e?.type === 'popup_closed' ? 'Login do Google cancelado.' : 'O login do Google não abriu. Libere pop-ups para este site.')); }
  });
  return new Promise((res, rej) => { pending = { res, rej }; tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' }); });
}
export const wasConnectedBefore = () => { try { return localStorage.getItem('rds-drive-ok') === '1'; } catch { return false; } };
export function disconnect() { if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {}); token = null; tokenExp = 0; try { localStorage.removeItem('rds-drive-ok'); } catch {} }

async function call(url, opts = {}, raw = false) {
  if (!driveConnected()) throw Object.assign(new Error('Conecte o Google Drive.'), { code: 'auth' });
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token } });
  if (r.status === 401) { token = null; throw Object.assign(new Error('A sessão do Google expirou. Toque em Sincronizar de novo.'), { code: 'auth' }); }
  if (r.status === 404) throw Object.assign(new Error('Arquivo não encontrado no Drive.'), { code: 'notfound' });
  if (!r.ok) { let m = ''; try { m = (await r.json()).error?.message || ''; } catch {} throw new Error(`Drive: ${m || r.status}`); }
  return raw ? r : r.json();
}
const q = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
export async function ensureFolder(name, parentId, knownId) {
  if (knownId) { try { const f = await call(`${API}/files/${knownId}?fields=id,trashed,webViewLink`); if (!f.trashed) return f; } catch (e) { if (e.code !== 'notfound') throw e; } }
  const found = await call(`${API}/files?q=${encodeURIComponent(`name='${q(name)}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`)}&fields=files(id,webViewLink)&pageSize=1`);
  if (found.files?.length) return found.files[0];
  return call(`${API}/files?fields=id,webViewLink`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }) });
}
export async function renameFile(id, name) { return call(`${API}/files/${id}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); }
// Creates or updates (same id = Drive keeps version history) a file
export async function upload({ name, blob, parentId, fileId, appProperties, onProgress }) {
  const mime = blob.type || 'application/octet-stream';
  const meta = fileId ? { name } : { name, parents: [parentId], ...(appProperties ? { appProperties } : {}) };
  const fields = 'fields=id,webViewLink';
  if (fileId) {
    try { return await resumable(`${UP}/files/${fileId}?uploadType=resumable&${fields}`, 'PATCH', meta, blob, mime, onProgress); }
    catch (e) { if (e.code !== 'notfound') throw e; return upload({ name, blob, parentId, appProperties, onProgress }); }
  }
  return resumable(`${UP}/files?uploadType=resumable&${fields}`, 'POST', meta, blob, mime, onProgress);
}
async function resumable(url, method, meta, blob, mime, onProgress) {
  const init = await call(url, { method, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(blob.size) }, body: JSON.stringify(meta) }, true);
  const loc = init.headers.get('Location'); if (!loc) throw new Error('Drive: envio não iniciado.');
  let off = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(loc, { method: 'PUT', headers: off ? { 'Content-Range': `bytes ${off}-${blob.size - 1}/${blob.size}` } : {}, body: off ? blob.slice(off) : blob });
      if (r.ok) { onProgress?.(1); return r.json(); }
      if (r.status >= 500 && attempt < 3) throw new Error('retry');
      let m = ''; try { m = (await r.json()).error?.message || ''; } catch {}
      throw Object.assign(new Error('Drive: ' + (m || r.status)), { fatal: true });
    } catch (e) {
      if (e.fatal || attempt >= 3) throw e.fatal ? e : new Error('A conexão caiu durante o envio. Toque em Sincronizar de novo.');
      await new Promise(res => setTimeout(res, 2000 * (attempt + 1)));
      // ask Drive how much arrived, then continue from there
      try { const st = await fetch(loc, { method: 'PUT', headers: { 'Content-Range': `bytes */${blob.size}` } }); if (st.ok) return st.json(); const rg = st.headers.get('Range'); off = rg ? +rg.split('-')[1] + 1 : 0; } catch { off = 0; }
    }
  }
}
export async function listProjects() {
  const r = await call(`${API}/files?q=${encodeURIComponent("appProperties has { key='rds' and value='projeto' } and trashed=false")}&fields=files(id,name,modifiedTime,appProperties)&orderBy=modifiedTime desc&pageSize=100`);
  return r.files || [];
}
export async function downloadJson(id) { const r = await call(`${API}/files/${id}?alt=media`, {}, true); return r.json(); }
export const folderUrl = id => `https://drive.google.com/drive/folders/${id}`;
