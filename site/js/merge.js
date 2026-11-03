// Three-way merge of project data (base = last state both devices agreed on).
// Objects merge field by field; lists of items with "id" merge item by item; on a real conflict this device wins.
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const J = x => JSON.stringify(x);
const eq = (a, b) => a === b || J(a) === J(b);
const idList = a => Array.isArray(a) && a.every(x => isObj(x) && x.id);
export function merge3(base, local, remote) {
  if (eq(local, remote)) return local;
  if (base === undefined) return local === undefined ? remote : local;
  if (eq(local, base)) return remote;
  if (eq(remote, base)) return local;
  if (isObj(local) && isObj(remote)) {
    const out = {}; const b0 = isObj(base) ? base : {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const b = k in b0 ? b0[k] : undefined;
      if (k in local && k in remote) out[k] = merge3(b, local[k], remote[k]);
      else if (k in local) { if (b !== undefined && eq(local[k], b)) continue; out[k] = local[k]; }
      else { if (b !== undefined && eq(remote[k], b)) continue; out[k] = remote[k]; }
    }
    return out;
  }
  if (Array.isArray(local) && Array.isArray(remote)) {
    const b = Array.isArray(base) ? base : [];
    if (idList(local) && idList(remote) && idList(b)) {
      const B = new Map(b.map(x => [x.id, x])), L = new Map(local.map(x => [x.id, x])), R = new Map(remote.map(x => [x.id, x]));
      const localReordered = !eq(local.map(x => x.id).filter(id => B.has(id)), b.map(x => x.id).filter(id => L.has(id)));
      const first = localReordered ? local : remote, second = localReordered ? remote : local;
      const ids = first.map(x => x.id); for (const x of second) if (!ids.includes(x.id)) ids.splice(Math.min(ids.length, second.indexOf(x)), 0, x.id);
      const out = [];
      for (const id of ids) {
        const bb = B.get(id), l = L.get(id), r = R.get(id);
        if (l && r) out.push(merge3(bb, l, r));
        else if (l) { if (bb && eq(l, bb)) continue; out.push(l); }
        else if (r) { if (bb && eq(r, bb)) continue; out.push(r); }
      }
      return out;
    }
    const removed = new Set([...b.filter(x => !local.some(y => eq(x, y))), ...b.filter(x => !remote.some(y => eq(x, y)))].map(J));
    const out = []; for (const x of [...local, ...remote]) { const k = J(x); if (!removed.has(k) && !out.some(y => J(y) === k)) out.push(x); }
    return out;
  }
  return local;
}
// fields that change on every save or belong to one device only
export function comparable(p) { const c = JSON.parse(JSON.stringify(p)); delete c.atualizadoEm; if (c.drive) { delete c.drive.syncedAt; } return J(c); }
