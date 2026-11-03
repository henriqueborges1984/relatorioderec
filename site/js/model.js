import { uid, nowIso, todayYmd, hhmmToMin, minToHHMM, DEFAULT_SCENE_MIN, VIDEO_COLORS, camLetter } from './util.js';
import { excerpt } from './docx.js';

export const newProject = () => ({ v: 3, formato: { orient: 'H', res: '1920x1080', fps: '' }, id: uid(), nome: '', produtora: '', agencia: '', obs: '', videos: [], diarias: [], pessoas: [], funcoesExtras: [], midias: [], drive: {}, criadoEm: nowIso(), atualizadoEm: nowIso() });
export const newDiaria = (data = todayYmd()) => ({ id: uid(), data, tipo: 'estudio', local: '', endereco: '', geo: null, call: '08:00', equipe: [], plano: [], obs: '', criadoEm: nowIso() });
// A "day" groups the videos recorded on the same date (plan, call sheet, day report)
export function ensureDay(p, ymd) {
  ymd = ymd || todayYmd();
  let d = p.diarias.find(x => x.data === ymd);
  if (!d) { d = newDiaria(ymd); p.diarias.push(d); }
  return d;
}
export const dayVideos = (p, d) => p.videos.filter(v => v.ficha?.data === d.data);
export function dayInfo(p, d) {
  const vs = dayVideos(p, d);
  const uniq = arr => [...new Set(arr.filter(Boolean))];
  const equipe = []; for (const v of vs) for (const e of v.ficha.equipe || []) if (!equipe.some(x => x.pessoaId === e.pessoaId && x.funcao === e.funcao)) equipe.push(e);
  const equipamentos = []; for (const v of vs) for (const e of v.ficha.equipamentos || []) if (!equipamentos.some(x => x.cat === e.cat && x.item === e.item)) equipamentos.push(e);
  const geoV = vs.find(v => v.ficha.geo);
  return { tipos: uniq(vs.map(v => v.ficha.tipo)), tipo: vs[0]?.ficha.tipo || '', local: uniq(vs.map(v => v.ficha.local)).join(' / '), endereco: uniq(vs.map(v => v.ficha.endereco)).join(' / '), geo: geoV ? geoV.ficha.geo : null, equipe, equipamentos, videos: vs, obs: uniq(vs.map(v => v.ficha.obs)).join('\n') };
}
export const formatoOf = (p, v) => (v && v.ficha?.formato) || p.formato || null;
export const camCount = u => Math.max(1, parseInt(u?.prep?.cameras, 10) || 1);
// shot size per camera ("A: Plano médio · B: Close") when the scene uses more than one camera
export function planoText(u, sep = ' · ') {
  const pr = u?.prep || {}; const n = camCount(u);
  if (n <= 1 || !pr.planoCam) return pr.plano || '';
  const out = []; for (let i = 0; i < n; i++) { const L = camLetter(i); const v = pr.planoCam[L] || (i === 0 ? pr.plano : ''); if (v) out.push(`${L}: ${v}`); }
  return out.join(sep);
}
// approved files as text (per camera when the scene uses more than one)
export function arquivosText(u, sep = '\n') {
  const n = camCount(u);
  if (n <= 1) return (u.arquivos || '').trim().split('\n').map(s => s.trim()).filter(Boolean).join(sep);
  const out = [];
  for (let i = 0; i < n; i++) { const L = camLetter(i); const val = (u.arquivosCam?.[L] || (i === 0 ? u.arquivos : '') || '').trim(); if (val) out.push(`Câm ${L}: ${val.replace(/\n+/g, ', ')}`); }
  return out.join(sep);
}

export const projName = p => [p.produtora, p.nome].filter(Boolean).join(' – ') || 'Projeto sem nome';
export const videoName = v => [v.cab.cliente, v.cab.titulo].filter(Boolean).join(' — ') || v.arquivo || 'Vídeo sem título';
export const videoCode = (p, v) => v.cab.codigo || ('V' + (p.videos.indexOf(v) + 1));
export const videoColor = (p, v) => VIDEO_COLORS[Math.max(0, p.videos.indexOf(v)) % VIDEO_COLORS.length];
export const units = v => v.cenas.flatMap(c => [c, ...c.subcenas]);
export function findCena(p, vId, cId) { const v = p.videos.find(x => x.id === vId); return v ? v.cenas.find(c => c.id === cId) || null : null; }
export function findUnit(p, t) {
  if (!t) return null;
  const v = p.videos.find(x => x.id === t.v); if (!v) return null;
  const c = v.cenas.find(x => x.id === t.c); if (!c) return null;
  return t.s ? c.subcenas.find(x => x.id === t.s) || null : c;
}
export const findVideo = (p, id) => p.videos.find(v => v.id === id) || null;
export const findDiaria = (p, id) => p.diarias.find(d => d.id === id) || null;
// editor notes, one cell each (older data kept a single text in u.obs)
export const edNotes = u => [...(u.edNotes || []), ...((u.obs || '').trim() ? [{ id: 'obs', texto: u.obs, criadaEm: '' }] : [])].filter(e => (e.texto || '').trim());
export const hasMarks = u => u.status !== 'pendente' || arquivosText(u) || edNotes(u).length || u.notas.length || u.stamps.length || !!u.original;
export const unitExcerpt = (p, t) => { const v = findVideo(p, t.v); const c = v && v.cenas.find(x => x.id === t.c); if (!c) return ''; if (t.s) { const s = c.subcenas.find(x => x.id === t.s); return (s && s.descricao) || excerpt(c); } return excerpt(c); };
export function counts(v) {
  const all = units(v).filter(u => u.status !== 'fora');
  const k = s => all.filter(u => u.status === s).length;
  return { total: all.length, valendo: k('valendo'), gravada: k('gravada'), refazer: k('refazer') };
}
export const unitMin = u => { const t = parseFloat(String(u?.prep?.tempo ?? '').replace(',', '.')); return isFinite(t) ? t : (u?.prep?.pos ? 0 : DEFAULT_SCENE_MIN); };
// Planned start time of each item of a diária plan
export function planTimes(p, d) {
  let t = hhmmToMin(d.call) ?? 480; const out = [];
  for (const it of d.plano) {
    const dur = it.k === 'ev' ? (+it.min || 0) : unitMin(findUnit(p, it));
    out.push({ start: minToHHMM(t), dur }); t += dur;
  }
  return { items: out, end: minToHHMM(t), total: t - (hhmmToMin(d.call) ?? 480) };
}
export const diariaIndex = (p, d) => [...p.diarias].sort((a, b) => (a.data || '').localeCompare(b.data || '')).indexOf(d) + 1;
export const diariaLabel = (p, d) => `Diária ${diariaIndex(p, d)}`;
// Units touched (marked, noted, filmed) during a diária
export function unitsDoneIn(p, d) {
  const out = [];
  for (const v of p.videos) for (const c of v.cenas) for (const u of [c, ...c.subcenas]) if ((u.diarias || []).includes(d.id)) out.push({ v: v.id, c: c.id, s: u === c ? null : u.id });
  return out;
}
export const sameT = (a, b) => a && b && a.v === b.v && a.c === b.c && (a.s || null) === (b.s || null);
export const allPessoasFuncoes = p => {
  const m = new Map();
  for (const v of p.videos) for (const e of v.ficha?.equipe || []) {
    const pe = p.pessoas.find(x => x.id === e.pessoaId); if (!pe || !pe.nome) continue;
    const r = m.get(pe.id) || { pessoa: pe, funcoes: new Set(), dias: [], videos: [] };
    if (e.funcao) r.funcoes.add(e.funcao); if (v.ficha.data && !r.dias.includes(v.ficha.data)) r.dias.push(v.ficha.data); r.videos.push(v); m.set(pe.id, r);
  }
  for (const r of m.values()) r.dias.sort();
  return [...m.values()].sort((a, b) => a.pessoa.nome.localeCompare(b.pessoa.nome));
};
export function allNotes(p) { const out = []; for (const v of p.videos) { out.push(...v.notas); for (const u of units(v)) out.push(...u.notas); } return out; }
