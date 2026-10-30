// Local storage on the device: IndexedDB (projects, binary blobs, small meta values)
const DB_NAME = 'relatorio-de-set-v2';
let dbp = null;
const mem = { projetos: new Map(), blobs: new Map(), meta: new Map() };

function open() {
  if (dbp) return dbp;
  dbp = new Promise(res => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('projetos', { keyPath: 'id' });
        d.createObjectStore('blobs');
        d.createObjectStore('meta');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null); r.onblocked = () => res(null);
    } catch { res(null); }
  });
  return dbp;
}
function run(name, mode, op, memOp) {
  return open().then(d => {
    if (!d) return memOp(mem[name]);
    return new Promise((res, rej) => {
      let out;
      try {
        const t = d.transaction(name, mode);
        const req = op(t.objectStore(name));
        if (req) req.onsuccess = () => { out = req.result; };
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      } catch (e) { rej(e); }
    });
  });
}
export const store = {
  available: () => open().then(d => !!d),
  allProjects: () => run('projetos', 'readonly', s => s.getAll(), m => [...m.values()]),
  putProject: p => run('projetos', 'readwrite', s => s.put(p), m => { m.set(p.id, p); }),
  delProject: id => run('projetos', 'readwrite', s => s.delete(id), m => { m.delete(id); }),
  putBlob: (id, b) => run('blobs', 'readwrite', s => s.put(b, id), m => { m.set(id, b); }),
  getBlob: id => run('blobs', 'readonly', s => s.get(id), m => m.get(id)).then(v => v || null),
  delBlob: id => run('blobs', 'readwrite', s => s.delete(id), m => { m.delete(id); }),
  getMeta: k => run('meta', 'readonly', s => s.get(k), m => m.get(k)),
  setMeta: (k, v) => run('meta', 'readwrite', s => s.put(v, k), m => { m.set(k, v); })
};

// One-time import of data created by the first version (diárias with roteiros)
export async function migrateV1(newProject, newDiaria) {
  try {
    if (await store.getMeta('migratedV1')) return [];
    const old = await new Promise(res => {
      try {
        const r = indexedDB.open('relatorio-de-set');
        r.onupgradeneeded = () => { r.transaction.abort(); res(null); };
        r.onsuccess = () => res(r.result); r.onerror = () => res(null);
      } catch { res(null); }
    });
    await store.setMeta('migratedV1', true);
    if (!old || !old.objectStoreNames.contains('diarias')) return [];
    const get = (name, fn) => new Promise(res => { try { const t = old.transaction(name, 'readonly'); const rq = fn(t.objectStore(name)); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); } catch { res(null); } });
    const diarias = await get('diarias', s => s.getAll()) || [];
    const out = [];
    for (const d of diarias) {
      const p = newProject();
      p.nome = d.titulo || 'Projeto importado'; p.produtora = d.produtora || '';
      const di = newDiaria(); di.data = d.data; di.local = d.local || ''; di.obs = d.obs || '';
      p.diarias.push(di);
      for (const r of d.roteiros || []) {
        r.notas = (r.notas || []).map(n => ({ ...n, diariaId: di.id, transcricao: n.texto ? 'navegador' : 'pendente' }));
        for (const c of r.cenas) {
          for (const u of [c, ...(c.subcenas || [])]) {
            u.notas = (u.notas || []).map(n => ({ ...n, diariaId: di.id, transcricao: n.texto ? 'navegador' : 'pendente' }));
            u.prep = u.prep || {}; u.diarias = [di.id];
            for (const n of u.notas) if (n.audioId) { const b = await get('audios', s => s.get(n.audioId)); if (b) await store.putBlob(n.audioId, b); }
          }
        }
        p.videos.push(r);
      }
      for (const n of p.videos.flatMap(v => v.notas)) if (n.audioId) { const b = await get('audios', s => s.get(n.audioId)); if (b) await store.putBlob(n.audioId, b); }
      out.push(p);
    }
    return out;
  } catch { return []; }
}
