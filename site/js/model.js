import { uid, nowIso, todayYmd, hhmmToMin, minToHHMM, DEFAULT_SCENE_MIN, VIDEO_COLORS } from './util.js';
import { excerpt } from './docx.js';

export const newProject = () => ({ v: 2, id: uid(), nome: '', produtora: '', agencia: '', obs: '', videos: [], diarias: [], pessoas: [], funcoesExtras: [], midias: [], drive: {}, criadoEm: nowIso(), atualizadoEm: nowIso() });
export const newDiaria = () => ({ id: uid(), data: todayYmd(), tipo: 'estudio', local: '', endereco: '', geo: null, call: '08:00', equipe: [], plano: [], obs: '', criadoEm: nowIso() });

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
export const hasMarks = u => u.status !== 'pendente' || (u.arquivos || '').trim() || (u.obs || '').trim() || u.notas.length || u.stamps.length;
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
  for (const d of p.diarias) for (const e of d.equipe) {
    const pe = p.pessoas.find(x => x.id === e.pessoaId); if (!pe) continue;
    const r = m.get(pe.id) || { pessoa: pe, funcoes: new Set(), dias: [] };
    if (e.funcao) r.funcoes.add(e.funcao); r.dias.push(d); m.set(pe.id, r);
  }
  return [...m.values()].sort((a, b) => a.pessoa.nome.localeCompare(b.pessoa.nome));
};
export function allNotes(p) { const out = []; for (const v of p.videos) { out.push(...v.notas); for (const u of units(v)) out.push(...u.notas); } return out; }
