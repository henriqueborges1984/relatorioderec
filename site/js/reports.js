// Reports: on-screen HTML and PDF (call sheet, diária report, project report)
import { esc, fmtDate, weekday, hhmm, ymdOf, durTxt, STATUS_L, STAMP_L, TIPO_L, EVENTO_L, FUNCOES, ORIENTACOES } from './util.js';
import { MiniPdf, wrapText, textW, dataUrlToBytes } from './minipdf.js';
import { projName, videoName, videoCode, videoColor, findUnit, findVideo, hasMarks, unitExcerpt, planTimes, diariaLabel, unitsDoneIn, sameT, units, counts, allPessoasFuncoes, dayInfo, arquivosText, formatoOf, camCount, planoText } from './model.js';

const ORDER = FUNCOES.flatMap(g => g[1]);
const roleRank = f => { const i = ORDER.indexOf(f); return i < 0 ? 999 : i; };
export const mapsUrl = d => d.geo ? `https://www.google.com/maps?q=${d.geo.lat},${d.geo.lng}` : (d.endereco || d.local) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([d.endereco, d.local].filter(Boolean).join(', '))}` : '';
export const equipeSorted = (p, d) => d.equipe.map(e => ({ ...e, pessoa: p.pessoas.find(x => x.id === e.pessoaId) })).filter(e => e.pessoa && e.pessoa.nome).sort((a, b) => roleRank(a.funcao) - roleRank(b.funcao) || a.pessoa.nome.localeCompare(b.pessoa.nome));
const notesOf = (u, dId) => dId ? u.notas.filter(n => !n.diariaId || n.diariaId === dId) : u.notas;
export const fmtFormato = f => f ? [((ORIENTACOES.find(o => o[0] === f.orient) || [])[1]), f.res && f.res.replace('x', ' × ') + ' px', f.fps && f.fps + ' fps'].filter(Boolean).join(' · ') : '';
const cenaOf = (p, t) => { const v = findVideo(p, t.v); return v ? v.cenas.find(c => c.id === t.c) : null; };
// script text changed on set (only on the main scene, not on subcenas)
function scriptChange(p, t) {
  if (t.s) return null; const c = cenaOf(p, t); if (!c || !c.original) return null;
  const out = [];
  const all = (o, k) => [o[k + 'Txt'] || '', ...((o === c.original ? (o.complementos || c.complementos) : c.complementos) || []).map(x => x[k + 'Txt'] || '')].filter(x => x.trim()).join('\n\n');
  const tN = all(c, 'texto'), tO = all(c.original, 'texto'), iN = all(c, 'imagem'), iO = all(c.original, 'imagem');
  if (tN !== tO) out.push({ k: 'TEXTO', novo: tN, orig: tO });
  if (iN !== iO) out.push({ k: 'IMAGEM', novo: iN, orig: iO });
  return out.length ? out : null;
}
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const tLabel = (p, t) => { const v = findVideo(p, t.v); const u = findUnit(p, t); return { v, u, code: v ? videoCode(p, v) : '?', num: u ? u.numero : '?' }; };


// Plan rows of a diária, with the subcenas recorded that day placed right under their scene
function planRows(p, d) {
  const pt = planTimes(p, d); const rows = [];
  d.plano.forEach((it, i) => {
    if (it.k !== 'cena') return; const u = findUnit(p, it); if (!u) return;
    rows.push({ t: it, start: pt.items[i].start });
    if (!it.s) for (const s of u.subcenas || []) { const ts = { v: it.v, c: it.c, s: s.id }; if ((s.diarias || []).includes(d.id) && !d.plano.some(x => x.k === 'cena' && sameT(x, ts))) rows.push({ t: ts, start: '↳', sub: true }); }
  });
  const covered = t => rows.some(r => sameT(r.t, t));
  const done = unitsDoneIn(p, d).filter(t => !covered(t));
  const touched = t => { const u = findUnit(p, t); return (u.diarias || []).includes(d.id) || (!t.s && (u.subcenas || []).some(s => (s.diarias || []).includes(d.id))); };
  const planned = rows.filter(r => !r.sub);
  const nao = planned.filter(r => !touched(r.t));
  return { rows, done, planned, nao };
}

/* ------------------------------ HTML ------------------------------ */
const pill = s => `<span class="pill k-${s}">${STATUS_L[s]}</span>`;
const stampsHtml = u => u.stamps.map(k => `<span class="mini-stamp t-${k}">${esc(STAMP_L[k])}</span>`).join('');
const noteLi = (n, o) => `<li><time>${n.diariaId && o.showDate ? esc(fmtDate(ymdOf(n.criadaEm)).slice(0, 5)) + ' ' : ''}${hhmm(n.criadaEm)}</time>${n.texto ? esc(n.texto) : '<i>(áudio sem transcrição)</i>'}${o.audio ? o.audio(n) : ''}</li>`;
function unitRow(p, t, o, extraFirst = '') {
  const { v, u, code } = tLabel(p, t); if (!u) return '';
  const notes = notesOf(u, o.dId).map(n => noteLi(n, o)).join('');
  const meds = (p.midias || []).filter(m => sameT(m, t) && (!o.dId || m.diariaId === o.dId));
  return `<tr class="${t.s ? 'rsub' : ''} ${hasMarks(u) ? '' : 'dim'}">${extraFirst}<td class="n"><span class="vtag" style="--vc:${videoColor(p, v)}">${esc(code)}</span>${esc(u.numero)}</td>
    <td>${pill(u.status)}<div>${stampsHtml(u)}</div></td>
    <td class="mono" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(arquivosText(u)) || '<span class="muted">—</span>'}${camCount(u) > 1 ? `<div class="muted" style="font-family:var(--f-body);font-size:11.5px">${camCount(u)} câmeras</div>` : ''}</td>
    <td>${t.s && u.descricao ? `<div class="muted">${esc(u.descricao)}</div>` : ''}${(scriptChange(p, t) || []).map(ch => `<div class="chg"><b>${ch.k} alterado no set:</b> <span style="white-space:pre-wrap">${esc(ch.novo)}</span><div class="muted"><s style="white-space:pre-wrap">${esc(ch.orig)}</s></div></div>`).join('')}${u.obs ? `<div style="white-space:pre-wrap">${esc(u.obs)}</div>` : ''}${notes ? `<ul class="rn">${notes}</ul>` : ''}${meds.length ? `<div class="rthumbs">${meds.map(m => o.media ? o.media(m) : '').join('')}</div>` : ''}${!u.obs && !notes && !meds.length && !(t.s && u.descricao) && !scriptChange(p, t) ? '<span class="muted">—</span>' : ''}</td></tr>`;
}
function headHtml(p, d, title) {
  const info = dayInfo(p, d); const eq = equipeSorted(p, info); const pt = planTimes(p, d); const mu = mapsUrl(info);
  return `<header class="rep-h"><div class="eyebrow">${esc(title)} · ${esc(weekday(d.data))} ${esc(fmtDate(d.data))}</div>
    <h1>${esc(projName(p))}</h1>
    <div class="kv"><span><b>Tipo:</b> ${esc(info.tipos.map(k => TIPO_L[k]).join(' / ') || '—')}</span>${info.local ? `<span><b>Local:</b> ${esc(info.local)}</span>` : ''}${info.endereco ? `<span><b>Endereço:</b> ${esc(info.endereco)}</span>` : ''}${mu ? `<span><a href="${esc(mu)}" target="_blank" rel="noopener">Abrir no mapa</a></span>` : ''}<span><b>Chegada:</b> ${esc(d.call || '—')}</span>${d.plano.length ? `<span><b>Término previsto:</b> ${pt.end}</span>` : ''}${p.formato ? `<span><b>Formato:</b> ${esc(fmtFormato(p.formato))}</span>` : ''}</div>
    ${info.obs ? `<div style="white-space:pre-wrap;font-size:14px">${esc(info.obs)}</div>` : ''}
    ${eq.length ? `<div class="eqgrid">${eq.map(e => `<div><span class="muted">${esc(e.funcao || '—')}</span><b>${esc(e.pessoa.nome)}</b></div>`).join('')}</div>` : ''}
    ${info.equipamentos.length ? `<div class="kv" style="font-size:13px"><b>Equipamentos:</b> ${esc(info.equipamentos.map(e => `${e.qtd > 1 ? e.qtd + '× ' : ''}${e.item}`).join(', '))}</div>` : ''}
  </header>`;
}
export function callSheetHtml(p, d) {
  const pt = planTimes(p, d);
  const rows = d.plano.map((it, i) => {
    const tm = pt.items[i];
    if (it.k === 'ev') return `<tr class="evrow"><td class="mono">${tm.start}</td><td colspan="4"><b>${esc(it.titulo || EVENTO_L[it.tipo])}</b></td><td class="mono">${durTxt(tm.dur)}</td></tr>`;
    const { v, u, code } = tLabel(p, it); if (!u) return '';
    const pr = u.prep || {};
    return `<tr><td class="mono">${tm.start}</td><td class="n"><span class="vtag" style="--vc:${videoColor(p, v)}">${esc(code)}</span>${esc(u.numero)}</td>
      <td>${esc(pr.ambiente || '—')}<div class="muted">${esc([pr.intext, pr.periodo].filter(Boolean).join(' · '))}</div></td><td>${esc(planoText(u) || '—')}${camCount(u) > 1 ? `<div class="muted">${camCount(u)} câmeras</div>` : ''}</td>
      <td>${esc(unitExcerpt(p, it))}${pr.elenco ? `<div class="muted">Elenco: ${esc(pr.elenco)}</div>` : ''}${pr.necessidades ? `<div class="muted">Precisa: ${esc(pr.necessidades)}</div>` : ''}</td><td class="mono">${durTxt(tm.dur)}</td></tr>`;
  }).join('');
  const vids = [...new Set(d.plano.filter(i => i.k === 'cena').map(i => i.v))].map(id => findVideo(p, id)).filter(Boolean);
  return `<article class="rep">${headHtml(p, d, 'Ordem do dia')}
    ${vids.length ? `<div class="vlegend">${vids.map(v => `<span><span class="vtag" style="--vc:${videoColor(p, v)}">${esc(videoCode(p, v))}</span>${esc(videoName(v))}</span>`).join('')}</div>` : ''}
    <div class="rtab"><table class="cs"><thead><tr><th>Hora</th><th>Cena</th><th>Ambiente</th><th>Plano</th><th>Descrição</th><th>Tempo</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">Nenhuma cena no plano.</td></tr>'}</tbody></table></div>
  </article>`;
}
export function diariaReportHtml(p, d, o = {}) {
  o = { ...o, dId: d.id };
  const { rows, done, planned, nao } = planRows(p, d);
  const gen = p.videos.flatMap(v => v.notas.filter(n => n.diariaId === d.id).map(n => ({ v, n })));
  const meds = (p.midias || []).filter(m => m.diariaId === d.id && !m.c);
  return `<article class="rep">${headHtml(p, d, 'Relatório de gravação')}
    <section class="rep-r"><div class="rh"><h2>Plano × realizado</h2><span class="spacer"></span><span class="mono" style="font-size:12.5px">${planned.length - nao.length}/${planned.length} do plano gravadas${done.length ? ` · ${done.length} fora do plano` : ''}</span></div>
    <div class="rtab"><table><thead><tr><th>Previsto</th><th>Cena</th><th>Status</th><th>Arquivo aprovado</th><th>Observações, notas e mídias</th></tr></thead><tbody>
      ${rows.map(r => unitRow(p, r.t, o, `<td class="mono">${r.start}</td>`)).join('') || '<tr><td colspan="5" class="muted">Sem plano de filmagem nesta diária.</td></tr>'}
      ${done.length ? `<tr class="sep"><td colspan="5">Gravado fora do plano</td></tr>${done.map(t => unitRow(p, t, o, '<td class="mono">—</td>')).join('')}` : ''}
    </tbody></table></div>
    ${nao.length ? `<div class="warnbox">Ficaram sem gravação nesta diária: ${nao.map(x => { const l = tLabel(p, x.t); return esc(l.code + ' cena ' + l.num); }).join(', ')}.</div>` : ''}
    </section>
    ${gen.length ? `<section class="rep-r"><div class="eyebrow">Notas gerais</div><ul class="rn">${gen.map(({ v, n }) => `<li><b>${esc(videoCode(p, v))}</b> ${noteLi(n, o).slice(4)}`).join('')}</ul></section>` : ''}
    ${meds.length ? `<section class="rep-r"><div class="eyebrow">Fotos e vídeos da diária</div><div class="rthumbs">${meds.map(m => o.media ? o.media(m) : '').join('')}</div></section>` : ''}
  </article>`;
}
export function projectReportHtml(p, o = {}) {
  o = { ...o, showDate: true };
  const eq = allPessoasFuncoes(p);
  const ds = [...p.diarias].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  return `<article class="rep"><header class="rep-h"><div class="eyebrow">Relatório do projeto</div><h1>${esc(projName(p))}</h1>
    <div class="kv">${p.agencia ? `<span><b>Agência/cliente:</b> ${esc(p.agencia)}</span>` : ''}<span><b>Vídeos:</b> ${p.videos.length}</span><span><b>Diárias:</b> ${p.diarias.length}</span>${p.drive?.folderLink ? `<span><a href="${esc(p.drive.folderLink)}" target="_blank" rel="noopener">Pasta no Drive</a></span>` : ''}</div>
    ${p.formato ? `<div class="kv"><span><b>Formato:</b> ${esc(fmtFormato(p.formato))}</span></div>` : ''}
    ${p.obs ? `<div style="white-space:pre-wrap;font-size:14px">${esc(p.obs)}</div>` : ''}</header>
    ${p.videos.map(v => { const c = counts(v); return `<section class="rep-r"><div class="rh"><span class="vtag" style="--vc:${videoColor(p, v)}">${esc(videoCode(p, v))}</span><h2>${esc(videoName(v))}</h2><span class="muted" style="font-size:13px">${esc([v.cab.versao, v.cab.duracao && 'Duração ' + v.cab.duracao, v.ficha?.data && 'Gravado em ' + fmtDate(v.ficha.data), v.ficha?.local].filter(Boolean).join(' · '))}</span><span class="spacer"></span><span class="mono" style="font-size:12.5px">${c.valendo}/${c.total} valendo</span></div>
      <div class="rtab"><table><thead><tr><th>Cena</th><th>Status</th><th>Arquivo aprovado</th><th>Observações, notas e mídias</th></tr></thead><tbody>
      ${v.cenas.flatMap(cn => [{ v: v.id, c: cn.id, s: null }, ...cn.subcenas.map(s => ({ v: v.id, c: cn.id, s: s.id }))]).filter(t => !o.hideEmpty || hasMarks(findUnit(p, t))).map(t => unitRow(p, t, o)).join('')}
      </tbody></table></div>
      ${v.notas.length ? `<div><div class="eyebrow">Notas gerais</div><ul class="rn">${v.notas.map(n => noteLi(n, o)).join('')}</ul></div>` : ''}</section>`; }).join('')}
    ${eq.length ? `<section class="rep-r"><div class="rh"><h2>Equipe</h2></div><div class="rtab"><table><thead><tr><th>Nome</th><th>Função</th><th>Datas</th></tr></thead><tbody>${eq.map(r => `<tr><td><b>${esc(r.pessoa.nome)}</b></td><td>${esc([...r.funcoes].join(', ') || '—')}</td><td class="mono">${esc(r.dias.map(d => fmtDate(d).slice(0, 5)).join(', '))}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  </article>`;
}

/* ------------------------------ PDF ------------------------------ */
const INK = [21, 23, 26], MUTE = [93, 99, 106], LINE = [214, 217, 210], RED = [211, 36, 44];
const ST = { pendente: [110, 116, 122], gravada: [45, 95, 168], valendo: [28, 122, 74], refazer: [163, 95, 0], fora: [128, 134, 140] };
const SC = { dialogo: [122, 62, 177], adicionada: [15, 124, 134], atencao: [181, 55, 45], pickup: [163, 95, 0], som: [45, 95, 168], alternativa: [28, 122, 74] };

class Doc {
  constructor(footer) { this.P = new MiniPdf(); this.M = 36; this.W = this.P.W; this.BOTTOM = this.P.H - 46; this.y = this.M; this.footer = footer; this.onPage = null; }
  page() { this.P.addPage(); this.y = this.M; if (this.onPage) this.onPage(); }
  need(h) { if (this.y + h > this.BOTTOM) { this.page(); return true; } return false; }
  para(str, f, size, color, lh, x = this.M, maxW = this.W - 2 * this.M, link) { for (const l of wrapText(str, f, size, maxW)) { this.need(lh); this.P.text(x, this.y + size, l, { font: f, size, color, link }); this.y += lh; } }
  eyebrow(str) { this.P.circle(this.M + 4, this.y + 4.5, 4, RED); this.P.text(this.M + 13, this.y + 8, str, { font: 'HB', size: 8.5, color: MUTE }); this.y += 18; }
  rule(w = 1.4) { this.P.line(this.M, this.y, this.W - this.M, this.y, w, INK); }
  section(title, right) { this.need(40); this.y += 6; this.P.text(this.M, this.y + 12, title, { font: 'HB', size: 13, color: INK }); if (right) this.P.text(this.W - this.M, this.y + 12, right, { font: 'C', size: 8.5, color: MUTE, align: 'right' }); this.y += 20; }
  // cols: [{t, w}], rows: [{cells:[[{t,f,s,c,x,dot,link}]], span?:{text,f,c}, fill?}]
  table(cols, rows) {
    const M = this.M, PAD = 4.5, LH = 11;
    const xs = []; { let x = M; for (const c of cols) { xs.push(x); x += c.w; } }
    const header = () => { cols.forEach((c, i) => this.P.text(xs[i] + PAD, this.y + 7, c.t, { font: 'HB', size: 6.6, color: MUTE })); this.y += 10.5; this.P.line(M, this.y, this.W - M, this.y, 0.8, INK); this.y += 1.5; };
    this.need(40); header();
    const prev = this.onPage; this.onPage = () => { if (prev) prev(); header(); };
    for (const r of rows) {
      if (r.span) {
        this.need(LH + 2 * PAD);
        if (r.fill) this.P.rect(M, this.y, this.W - 2 * M, LH + 2 * PAD - 2, r.fill);
        this.P.text(xs[0] + PAD, this.y + PAD + 8, r.lead || '', { font: 'C', size: 8.2, color: MUTE });
        this.P.text(xs[1] + PAD, this.y + PAD + 8, r.span, { font: r.f || 'HB', size: 8.6, color: r.c || INK });
        if (r.tail) this.P.text(this.W - M - PAD, this.y + PAD + 8, r.tail, { font: 'C', size: 8.2, color: MUTE, align: 'right' });
        this.y += LH + 2 * PAD - 2; this.P.line(M, this.y, this.W - M, this.y, 0.4, LINE); this.y += 1; continue;
      }
      const cells = r.cells.map((items, ci) => items.flatMap(it => it.raw ? [it] : wrapText(it.t, it.f || 'H', it.s || 8.4, cols[ci].w - 2 * PAD - (it.x || 0)).map((t, k) => ({ ...it, t, dot: it.dot && k === 0 }))));
      const n = Math.max(1, ...cells.map(c => c.length));
      this.need(Math.min(n, 3) * LH + 2 * PAD);
      this.y += PAD;
      for (let i = 0; i < n; i++) {
        if (this.y + LH > this.BOTTOM) { this.page(); this.y += 2; }
        cells.forEach((cl, ci) => {
          const it = cl[i]; if (!it) return;
          if (it.tag) { const tw = textW(it.tag, 'HB', 6.6) + 6; this.P.rect(xs[ci] + PAD, this.y + 0.5, tw, 9, it.tagColor); this.P.text(xs[ci] + PAD + 3, this.y + 7.4, it.tag, { font: 'HB', size: 6.6, color: [255, 255, 255] }); this.P.text(xs[ci] + PAD + tw + 4, this.y + 8.6, it.t, { font: it.f || 'HB', size: it.s || 10, color: it.c || INK }); return; }
          if (it.dot) this.P.circle(xs[ci] + PAD + 2.2, this.y + 5.4, 1.3, MUTE);
          this.P.text(xs[ci] + PAD + (it.x || 0), this.y + 8.4, it.t, { font: it.f || 'H', size: it.s || 8.4, color: it.c || INK, link: it.link });
        });
        this.y += LH;
      }
      this.y += PAD - 2; this.P.line(M, this.y, this.W - M, this.y, 0.4, LINE); this.y += 1;
    }
    this.onPage = prev;
  }
  thumbs(items) { // [{thumb, w, h, cap, link}]
    const M = this.M, gap = 10, cw = (this.W - 2 * M - 3 * gap) / 4, ch = cw * 0.75;
    let col = 0;
    for (const it of items) {
      if (col === 0) this.need(ch + 34);
      const x = M + col * (cw + gap), y = this.y;
      try {
        const bytes = dataUrlToBytes(it.thumb);
        const r = Math.min(cw / it.w, ch / it.h); const w = it.w * r, h = it.h * r;
        this.P.rect(x, y, cw, ch, [238, 240, 236]);
        this.P.image(bytes, it.w, it.h, x + (cw - w) / 2, y + (ch - h) / 2, w, h);
      } catch { this.P.rect(x, y, cw, ch, [238, 240, 236]); }
      if (it.badge) { this.P.rect(x + 4, y + 4, textW(it.badge, 'HB', 6.5) + 6, 9, INK); this.P.text(x + 7, y + 10.8, it.badge, { font: 'HB', size: 6.5, color: [255, 255, 255] }); }
      const lines = wrapText(it.cap || '', 'H', 7, cw).slice(0, 3);
      lines.forEach((l, i) => this.P.text(x, y + ch + 9 + i * 8.5, l, { size: 7, color: MUTE }));
      if (it.link) this.P.link(x, y, cw, ch, it.link);
      col++;
      if (col === 4) { col = 0; this.y += ch + 36; }
    }
    if (col) this.y += ch + 36;
  }
  finish(title) {
    const total = this.P.pages.length;
    this.P.pages.forEach((pg, i) => { this.P.cur = pg; this.P.line(this.M, this.P.H - 32, this.W - this.M, this.P.H - 32, 0.4, LINE); this.P.text(this.M, this.P.H - 21, this.footer, { size: 7.2, color: MUTE }); this.P.text(this.W - this.M, this.P.H - 21, `${i + 1}/${total}`, { size: 7.2, color: MUTE, align: 'right' }); });
    return this.P.output(title);
  }
}
function pdfHeader(D, p, d, title) {
  D.eyebrow(`${title.toUpperCase()}  ·  ${weekday(d.data).toUpperCase()} ${fmtDate(d.data)}`);
  D.para(projName(p), 'HB', 19, INK, 22);
  D.y += 2;
  const info = dayInfo(p, d); const pt = planTimes(p, d);
  pdfInfoBlock(D, p, info, [`Chegada: ${d.call || '—'}`, d.plano.length && `Término previsto: ${pt.end}`], p.formato);
  D.y += 8; D.rule(); D.y += 10;
}
// location, team and equipment block (used by day and video reports)
function pdfInfoBlock(D, p, info, extra = [], formato) {
  const mu = mapsUrl(info);
  D.para([`Tipo: ${(info.tipos || [info.tipo]).map(k => TIPO_L[k]).filter(Boolean).join(' / ') || '—'}`, info.local && 'Local: ' + info.local, info.endereco && 'Endereço: ' + info.endereco, ...extra, formato && 'Formato: ' + fmtFormato(formato)].filter(Boolean).join('   ·   '), 'H', 9.3, MUTE, 12.5);
  if (mu) D.para('Abrir local no mapa', 'H', 8.5, [45, 95, 168], 12, D.M, 200, mu);
  if (info.obs) { D.y += 2; D.para(info.obs, 'H', 9.3, INK, 12.5); }
  const eq = equipeSorted(p, info);
  if (eq.length) {
    D.y += 6; D.P.text(D.M, D.y + 7, 'EQUIPE', { font: 'HB', size: 6.8, color: MUTE }); D.y += 12;
    const colW = (D.W - 2 * D.M) / 3; let i = 0; const rowsN = Math.ceil(eq.length / 3);
    D.need(rowsN * 21);
    const y0 = D.y;
    eq.forEach((e, k) => { const col = Math.floor(k / rowsN), row = k % rowsN; const x = D.M + col * colW, y = y0 + row * 21; D.P.text(x, y + 7, e.funcao || '—', { size: 6.8, color: MUTE }); D.P.text(x, y + 16.5, e.pessoa.nome, { font: 'HB', size: 8.6, color: INK }); i++; });
    D.y = y0 + rowsN * 21;
  }
  if (info.equipamentos?.length) { D.y += 6; D.P.text(D.M, D.y + 7, 'EQUIPAMENTOS', { font: 'HB', size: 6.8, color: MUTE }); D.y += 11; D.para(info.equipamentos.map(e => `${e.qtd > 1 ? e.qtd + '× ' : ''}${e.item}${e.cat ? ' (' + e.cat + ')' : ''}`).join('  ·  '), 'H', 8.6, INK, 11.5); }
}
const unitPdfCells = (p, t, dId, withDate) => {
  const { v, u, code } = tLabel(p, t);
  const st = [{ t: STATUS_L[u.status], f: 'HB', c: ST[u.status] }, ...u.stamps.map(k => ({ t: STAMP_L[k].toUpperCase(), f: 'HB', s: 6.8, c: SC[k] }))];
  const at = arquivosText(u);
  const arq = at ? at.split('\n').map(l => ({ t: l, f: 'C', s: 8 })) : [{ t: '—', c: MUTE }];
  if (camCount(u) > 1) arq.push({ t: `${camCount(u)} câmeras`, s: 7, c: MUTE });
  const notes = [];
  if (t.s && u.descricao) notes.push({ t: u.descricao, f: 'HO', c: MUTE });
  for (const ch of scriptChange(p, t) || []) { notes.push({ t: `${ch.k} alterado no set: ${ch.novo}`, f: 'HB', s: 8, c: [122, 62, 177] }); notes.push({ t: `Original: ${ch.orig}`, f: 'HO', s: 7.6, c: MUTE }); }
  if ((u.obs || '').trim()) notes.push({ t: u.obs.trim() });
  for (const n of notesOf(u, dId)) notes.push({ t: `${withDate ? fmtDate(ymdOf(n.criadaEm)).slice(0, 5) + ' ' : ''}${hhmm(n.criadaEm)}  ${n.texto || '(áudio sem transcrição)'}`, f: n.texto ? 'H' : 'HO', x: 7, dot: true });
  const meds = (p.midias || []).filter(m => sameT(m, t) && (!dId || m.diariaId === dId));
  if (meds.length) notes.push({ t: `${meds.length} ${meds.length > 1 ? 'mídias' : 'mídia'} (ver fotos e vídeos)`, f: 'HO', c: MUTE });
  return { v, u, code, st, arq, notes: notes.length ? notes : [{ t: '—', c: MUTE }] };
};
const mediaThumbs = (p, list) => list.filter(m => m.thumb).map(m => { const l = m.c ? tLabel(p, m) : null; const v = findVideo(p, m.v); return { thumb: m.thumb, w: m.tw || 320, h: m.th || 240, badge: m.tipo === 'video' ? 'VÍDEO' : '', cap: [l ? `${l.code} cena ${l.num}` : (v ? videoCode(p, v) : 'Diária'), hhmm(m.criadaEm), m.legenda].filter(Boolean).join(' · '), link: m.driveLink || '' }; });

export function callSheetPdf(p, d) {
  const D = new Doc(`${projName(p)} · Ordem do dia · ${fmtDate(d.data)}`);
  pdfHeader(D, p, d, 'Ordem do dia');
  const pt = planTimes(p, d);
  const vids = [...new Set(d.plano.filter(i => i.k === 'cena').map(i => i.v))].map(id => findVideo(p, id)).filter(Boolean);
  for (const v of vids) { D.need(12); const tw = textW(videoCode(p, v), 'HB', 6.6) + 6; D.P.rect(D.M, D.y + 1, tw, 9, hexRgb(videoColor(p, v))); D.P.text(D.M + 3, D.y + 7.9, videoCode(p, v), { font: 'HB', size: 6.6, color: [255, 255, 255] }); D.P.text(D.M + tw + 5, D.y + 8.6, videoName(v), { size: 8.4, color: INK }); D.y += 12.5; }
  D.y += 6;
  const W = D.W - 2 * D.M;
  const cols = [{ t: 'HORA', w: 40 }, { t: 'CENA', w: 74 }, { t: 'AMBIENTE', w: 92 }, { t: 'PLANO', w: 70 }, { t: 'DESCRIÇÃO', w: W - 40 - 74 - 92 - 70 - 44 }, { t: 'TEMPO', w: 44 }];
  const rows = d.plano.map((it, i) => {
    const tm = pt.items[i];
    if (it.k === 'ev') return { span: (it.titulo || EVENTO_L[it.tipo]).toUpperCase(), lead: tm.start, tail: durTxt(tm.dur), fill: [238, 240, 236] };
    const { v, u, code } = tLabel(p, it); if (!u) return null; const pr = u.prep || {};
    return { cells: [[{ t: tm.start, f: 'C', s: 8.6 }], [{ t: u.numero, tag: code, tagColor: hexRgb(videoColor(p, v)), raw: true }], [{ t: pr.ambiente || '—' }, ...([pr.intext, pr.periodo].filter(Boolean).length ? [{ t: [pr.intext, pr.periodo].filter(Boolean).join(' · '), c: MUTE, s: 7.6 }] : [])], [{ t: planoText(u, '\n') || '—' }, ...(camCount(u) > 1 ? [{ t: camCount(u) + ' câmeras', c: MUTE, s: 7.6 }] : [])], [{ t: unitExcerpt(p, it) || '—' }, ...(pr.elenco ? [{ t: 'Elenco: ' + pr.elenco, c: MUTE, s: 7.6 }] : []), ...(pr.necessidades ? [{ t: 'Precisa: ' + pr.necessidades, c: MUTE, s: 7.6 }] : [])], [{ t: durTxt(tm.dur), f: 'C', s: 8.2 }]] };
  }).filter(Boolean);
  if (rows.length) D.table(cols, rows); else D.para('Nenhuma cena no plano.', 'HO', 9, MUTE, 12);
  D.y += 8; D.para(`Total previsto: ${durTxt(pt.total)} · término às ${pt.end}`, 'HB', 9, INK, 12);
  return D.finish(`Ordem do dia ${fmtDate(d.data)} – ${projName(p)}`);
}
export function diariaReportPdf(p, d) {
  const D = new Doc(`${projName(p)} · Relatório · ${fmtDate(d.data)}`);
  pdfHeader(D, p, d, 'Relatório de gravação');
  const { rows: prs, done, planned, nao } = planRows(p, d);
  D.section('Plano × realizado', `${planned.length - nao.length}/${planned.length} do plano gravadas${done.length ? ' · ' + done.length + ' fora do plano' : ''}`);
  const W = D.W - 2 * D.M;
  const cols = [{ t: 'PREVISTO', w: 44 }, { t: 'CENA', w: 70 }, { t: 'STATUS', w: 78 }, { t: 'ARQUIVO APROVADO', w: 100 }, { t: 'OBSERVAÇÕES E NOTAS', w: W - 44 - 70 - 78 - 100 }];
  const row = (t, lead) => { const c = unitPdfCells(p, t, d.id); return { cells: [[{ t: lead === '↳' ? '' : lead, f: 'C', s: 8.4 }], [{ t: c.u.numero, tag: c.code, tagColor: hexRgb(videoColor(p, c.v)), raw: true }], c.st, c.arq, c.notes] }; };
  const rows = prs.map(r => row(r.t, r.start));
  if (done.length) { rows.push({ span: 'GRAVADO FORA DO PLANO', fill: [238, 240, 236] }); done.forEach(t => rows.push(row(t, '—'))); }
  if (rows.length) D.table(cols, rows); else D.para('Sem plano de filmagem nesta diária.', 'HO', 9, MUTE, 12);
  if (nao.length) { D.y += 6; D.para('Ficaram sem gravação: ' + nao.map(x => { const l = tLabel(p, x.t); return `${l.code} cena ${l.num}`; }).join(', '), 'HB', 8.8, [163, 95, 0], 12); }
  const gen = p.videos.flatMap(v => v.notas.filter(n => n.diariaId === d.id).map(n => ({ v, n })));
  if (gen.length) { D.section('Notas gerais'); for (const { v, n } of gen) D.para(`•  ${videoCode(p, v)} · ${hhmm(n.criadaEm)}  ${n.texto || '(áudio sem transcrição)'}`, 'H', 8.6, INK, 11.5); }
  const meds = mediaThumbs(p, (p.midias || []).filter(m => m.diariaId === d.id));
  if (meds.length) { D.section('Fotos e vídeos', `${meds.length} ${meds.length === 1 ? 'item' : 'itens'}`); D.thumbs(meds); }
  return D.finish(`Relatório ${fmtDate(d.data)} – ${projName(p)}`);
}
export function projectReportPdf(p, o = {}) {
  const D = new Doc(`${projName(p)} · Relatório do projeto`);
  D.eyebrow('RELATÓRIO DO PROJETO');
  D.para(projName(p), 'HB', 19, INK, 22);
  D.para([p.agencia && 'Agência/cliente: ' + p.agencia, `Vídeos: ${p.videos.length}`, `Diárias: ${p.diarias.length}`, `Gerado em ${new Date().toLocaleString('pt-BR')}`].filter(Boolean).join('   ·   '), 'H', 9.3, MUTE, 12.5);
  if (p.drive?.folderLink) D.para('Pasta do projeto no Google Drive', 'H', 8.5, [45, 95, 168], 12, D.M, 200, p.drive.folderLink);
  if (p.formato) D.para('Formato: ' + fmtFormato(p.formato), 'H', 8.6, INK, 11.5);
  if (p.obs) { D.y += 3; D.para(p.obs, 'H', 9, INK, 12); }
  D.y += 8; D.rule(); D.y += 8;
  const W = D.W - 2 * D.M;
  const cols = [{ t: 'CENA', w: 70 }, { t: 'STATUS', w: 80 }, { t: 'ARQUIVO APROVADO', w: 104 }, { t: 'OBSERVAÇÕES E NOTAS', w: W - 70 - 80 - 104 }];
  for (const v of p.videos) {
    const c = counts(v);
    D.need(80); D.y += 4;
    D.P.text(D.M, D.y + 8, [videoCode(p, v), v.cab.versao, v.cab.duracao && 'Duração ' + v.cab.duracao, v.ficha?.data && 'Gravado em ' + fmtDate(v.ficha.data)].filter(Boolean).join('  ·  '), { font: 'C', size: 8.4, color: MUTE });
    D.P.text(D.W - D.M, D.y + 8, `${c.valendo}/${c.total} valendo`, { font: 'C', size: 8.4, color: MUTE, align: 'right' });
    D.y += 13; D.para(videoName(v), 'HB', 13, INK, 16); D.y += 2;
    const rows = v.cenas.flatMap(cn => [{ v: v.id, c: cn.id, s: null }, ...cn.subcenas.map(s => ({ v: v.id, c: cn.id, s: s.id }))]).filter(t => !o.hideEmpty || hasMarks(findUnit(p, t))).map(t => { const x = unitPdfCells(p, t, null, true); return { cells: [[{ t: (t.s ? '  ' : '') + x.u.numero, f: 'HB', s: t.s ? 9.5 : 11.5, c: hasMarks(x.u) ? INK : MUTE }], x.st, x.arq, x.notes] }; });
    D.table(cols, rows);
    if (v.notas.length) { D.y += 4; D.para('NOTAS GERAIS', 'HB', 6.8, MUTE, 10); for (const n of v.notas) D.para(`•  ${fmtDate(ymdOf(n.criadaEm)).slice(0, 5)} ${hhmm(n.criadaEm)}  ${n.texto || '(áudio sem transcrição)'}`, 'H', 8.4, INK, 11); }
    D.y += 14;
  }
  const eq = allPessoasFuncoes(p);
  if (eq.length) { D.section('Equipe'); D.table([{ t: 'NOME', w: 170 }, { t: 'FUNÇÃO', w: 200 }, { t: 'DATAS', w: W - 370 }], eq.map(r => ({ cells: [[{ t: r.pessoa.nome, f: 'HB' }], [{ t: [...r.funcoes].join(', ') || '—' }], [{ t: r.dias.map(d => fmtDate(d).slice(0, 5)).join(', ') || '—', f: 'C', s: 8 }]] }))); }
  const meds = mediaThumbs(p, p.midias || []);
  if (meds.length) { D.section('Fotos e vídeos', `${meds.length} ${meds.length === 1 ? 'item' : 'itens'}`); D.thumbs(meds); }
  return D.finish(`Relatório do projeto – ${projName(p)}`);
}

/* ------------------------------ video report ------------------------------ */
const videoInfo = v => ({ ...v.ficha, tipos: [v.ficha?.tipo].filter(Boolean), equipe: v.ficha?.equipe || [], equipamentos: v.ficha?.equipamentos || [] });
const videoTargets = v => v.cenas.flatMap(cn => [{ v: v.id, c: cn.id, s: null }, ...cn.subcenas.map(s => ({ v: v.id, c: cn.id, s: s.id }))]);
export function videoReportHtml(p, v, o = {}) {
  o = { ...o, showDate: false };
  const info = videoInfo(v); const eq = equipeSorted(p, info); const mu = mapsUrl(info); const c = counts(v);
  const meds = (p.midias || []).filter(m => m.v === v.id && !m.c);
  return `<article class="rep"><header class="rep-h"><div class="eyebrow">Relatório do vídeo${v.ficha?.data ? ` · ${esc(weekday(v.ficha.data))} ${esc(fmtDate(v.ficha.data))}` : ''}</div>
    <h1><span class="vtag" style="--vc:${videoColor(p, v)};font-size:14px">${esc(videoCode(p, v))}</span>${esc(videoName(v))}</h1>
    <div class="kv"><span><b>Projeto:</b> ${esc(projName(p))}</span>${v.cab.versao ? `<span><b>Versão:</b> ${esc(v.cab.versao)}</span>` : ''}${v.cab.duracao ? `<span><b>Duração:</b> ${esc(v.cab.duracao)}</span>` : ''}<span><b>Tipo:</b> ${esc(TIPO_L[info.tipo] || '—')}</span>${info.local ? `<span><b>Local:</b> ${esc(info.local)}</span>` : ''}${info.endereco ? `<span><b>Endereço:</b> ${esc(info.endereco)}</span>` : ''}${mu ? `<span><a href="${esc(mu)}" target="_blank" rel="noopener">Abrir no mapa</a></span>` : ''}${formatoOf(p, v) ? `<span><b>Formato:</b> ${esc(fmtFormato(formatoOf(p, v)))}</span>` : ''}<span class="mono">${c.valendo}/${c.total} valendo</span></div>
    ${info.obs ? `<div style="white-space:pre-wrap;font-size:14px">${esc(info.obs)}</div>` : ''}
    ${eq.length ? `<div class="eqgrid">${eq.map(e => `<div><span class="muted">${esc(e.funcao || '—')}</span><b>${esc(e.pessoa.nome)}</b></div>`).join('')}</div>` : ''}
    ${info.equipamentos.length ? `<div class="kv" style="font-size:13px"><b>Equipamentos:</b> ${esc(info.equipamentos.map(e => `${e.qtd > 1 ? e.qtd + '× ' : ''}${e.item}`).join(', '))}</div>` : ''}
  </header>
  <section class="rep-r"><div class="rtab"><table><thead><tr><th>Cena</th><th>Status</th><th>Arquivo aprovado</th><th>Observações, notas e mídias</th></tr></thead><tbody>
    ${videoTargets(v).filter(t => !o.hideEmpty || hasMarks(findUnit(p, t))).map(t => unitRow(p, t, o)).join('')}
  </tbody></table></div>
  ${v.notas.length ? `<div><div class="eyebrow">Notas gerais</div><ul class="rn">${v.notas.map(n => noteLi(n, o)).join('')}</ul></div>` : ''}
  ${meds.length ? `<div><div class="eyebrow">Fotos e vídeos do vídeo</div><div class="rthumbs">${meds.map(m => o.media ? o.media(m) : '').join('')}</div></div>` : ''}
  </section></article>`;
}
export function videoReportPdf(p, v, o = {}) {
  const D = new Doc(`${projName(p)} · ${videoCode(p, v)} · Relatório do vídeo`);
  D.eyebrow(`RELATÓRIO DO VÍDEO${v.ficha?.data ? `  ·  ${weekday(v.ficha.data).toUpperCase()} ${fmtDate(v.ficha.data)}` : ''}`);
  D.para(videoName(v), 'HB', 17, INK, 20);
  D.para([projName(p), videoCode(p, v), v.cab.versao, v.cab.duracao && 'Duração ' + v.cab.duracao].filter(Boolean).join('   ·   '), 'H', 9.3, MUTE, 12.5);
  pdfInfoBlock(D, p, videoInfo(v), [], formatoOf(p, v));
  D.y += 8; D.rule(); D.y += 10;
  const c = counts(v);
  D.section('Cenas', `${c.valendo}/${c.total} valendo`);
  const W = D.W - 2 * D.M;
  const cols = [{ t: 'CENA', w: 56 }, { t: 'STATUS', w: 84 }, { t: 'ARQUIVO APROVADO', w: 110 }, { t: 'OBSERVAÇÕES E NOTAS', w: W - 56 - 84 - 110 }];
  D.table(cols, videoTargets(v).filter(t => !o.hideEmpty || hasMarks(findUnit(p, t))).map(t => { const x = unitPdfCells(p, t, null, false); return { cells: [[{ t: (t.s ? '  ' : '') + x.u.numero, f: 'HB', s: t.s ? 9.5 : 11.5, c: hasMarks(x.u) ? INK : MUTE }], x.st, x.arq, x.notes] }; }));
  if (v.notas.length) { D.section('Notas gerais'); for (const n of v.notas) D.para(`•  ${hhmm(n.criadaEm)}  ${n.texto || '(áudio sem transcrição)'}`, 'H', 8.6, INK, 11.5); }
  const meds = mediaThumbs(p, (p.midias || []).filter(m => m.v === v.id));
  if (meds.length) { D.section('Fotos e vídeos', `${meds.length} ${meds.length === 1 ? 'item' : 'itens'}`); D.thumbs(meds); }
  return D.finish(`Relatório ${videoCode(p, v)} – ${projName(p)}`);
}

/* ------------------------------ text ------------------------------ */
export function diariaText(p, d) {
  const info = dayInfo(p, d);
  const L = [`RELATÓRIO DE GRAVAÇÃO — ${fmtDate(d.data)}`, projName(p), `${info.tipos.map(k => TIPO_L[k]).join(' / ')}${info.local ? ' · ' + info.local : ''}`];
  const eq = equipeSorted(p, info); if (eq.length) L.push('', 'Equipe: ' + eq.map(e => `${e.pessoa.nome} (${e.funcao || '—'})`).join(', '));
  if (info.obs) L.push('', info.obs);
  const pr = planRows(p, d); const ts = [...pr.rows.map(r => r.t), ...pr.done];
  for (const t of ts) {
    const { u, code } = tLabel(p, t); if (!u) continue;
    L.push('', `${code} · CENA ${u.numero} — ${STATUS_L[u.status].toUpperCase()}${u.stamps.length ? ' [' + u.stamps.map(k => STAMP_L[k]).join(', ') + ']' : ''}`);
    if (arquivosText(u)) L.push('  Arquivo: ' + arquivosText(u, ', '));
    if ((u.obs || '').trim()) L.push('  Obs.: ' + u.obs.trim());
    for (const n of notesOf(u, d.id)) L.push(`  • ${hhmm(n.criadaEm)} ${n.texto || '(áudio sem transcrição)'}`);
  }
  return L.join('\n');
}
