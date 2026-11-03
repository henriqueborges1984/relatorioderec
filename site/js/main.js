import { $, $$, uid, esc, cleanHtml, nowIso, clone, hhmm, todayYmd, fmtDate, weekday, mmss, slug, durTxt, fmtBytes, ymdOf, IC, STATUS, STATUS_L, STAMPS, FUNCOES, TIPOS_DIARIA, TIPO_L, EVENTOS, EVENTO_L, PLANOS, ORIENTACOES, RESOLUCOES, FPS, EQUIP_CATS, camLetter, toast } from './util.js';
import { store, migrateV1 } from './store.js';
import { parseDocx, excerpt, newUnit, newCena, newVideo, newFicha, suggestPrep } from './docx.js';
import { newProject, newDiaria, projName, videoName, videoCode, videoColor, units, findUnit, findVideo, findDiaria, hasMarks, unitExcerpt, counts, planTimes, diariaLabel, unitsDoneIn, sameT, unitMin, allNotes, planoText, ensureDay, dayVideos, dayInfo, camCount, arquivosText, formatoOf, allPessoasFuncoes } from './model.js';
import { VoiceRecorder, SR, PROB, parseCenaRef, parseVideoRef, parseArquivo, saysValendo, saysRefazer, saysDialogo, aiConfigured, transcribeBlob, getPasscode, setPasscode, spokenPunctuation } from './voice.js';
import { processPhoto, videoPoster, VideoRecorder, extFor } from './media.js';
import * as drive from './drive.js';
import { callSheetHtml, diariaReportHtml, projectReportHtml, callSheetPdf, diariaReportPdf, projectReportPdf, diariaText, mapsUrl, videoReportHtml, videoReportPdf, fmtFormato } from './reports.js';
import CONFIG from './config.js';
import { merge3, comparable } from './merge.js';

/* ============================== state ============================== */
const S = {
  projetos: [], view: 'inicio', pId: null, vId: null, dId: null,
  ptab: 'videos', dtab: null, filter: 'todas', kits: [], editScript: null,
  active: null, openScript: new Set(), openPrep: new Set(), openStamps: new Set(), confirm: null,
  sync: { busy: false, msg: '' }, dirty: new Set(), renderPending: false, hideEmpty: false, repKind: 'relatorio'
};
const P = () => S.projetos.find(p => p.id === S.pId) || null;
const V = () => { const p = P(); return p ? findVideo(p, S.vId) : null; };
const Dd = () => { const p = P(); return p ? findDiaria(p, S.dId) : null; };
const prefs = (() => { let o = { audio: true }; try { Object.assign(o, JSON.parse(localStorage.getItem('rds-prefs') || '{}')); } catch {} return { get: k => o[k], set: (k, v) => { o[k] = v; try { localStorage.setItem('rds-prefs', JSON.stringify(o)); } catch {} } }; })();

const DEVICE = (() => { try { let d = localStorage.getItem('rds-device'); if (!d) { d = uid(); localStorage.setItem('rds-device', d); } return d; } catch { return 'dev'; } })();
const timers = new Map();
function save(p, now) {
  p.atualizadoEm = nowIso();
  clearTimeout(timers.get(p.id));
  S.dirty.add(p.id);
  const go = () => { timers.delete(p.id); store.putProject(clone(p)).catch(e => toast('Não foi possível salvar no aparelho: ' + (e?.message || e))); scheduleAutoSync(); };
  if (now) go(); else timers.set(p.id, setTimeout(go, 400));
}
function flushAll() { for (const [id, t] of timers) { clearTimeout(t); const p = S.projetos.find(x => x.id === id); if (p) store.putProject(clone(p)).catch(() => {}); } timers.clear(); }
addEventListener('pagehide', flushAll);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });

// day that receives marks made now: the open day plan, otherwise the recording date of the video (today if not set)
function currentDiariaId(p = P(), vId = null) {
  if (!p) return null;
  if (S.view === 'diaria' && S.dId) return S.dId;
  const v = findVideo(p, vId || S.vId) || (p.videos.length === 1 ? p.videos[0] : null);
  return ensureDay(p, v?.ficha?.data || todayYmd()).id;
}
function touch(u, p = P(), vId = null) { const id = currentDiariaId(p, vId); if (id && !u.diarias.includes(id)) u.diarias.push(id); }

/* ============================== routing ============================== */
function go(h) { if (location.hash.slice(1) !== h) location.hash = h; else route(); }
function route() {
  const h = location.hash.slice(1); let m;
  S.confirm = null;
  if ((m = h.match(/^p-([a-z0-9]+)$/i)) && S.projetos.some(p => p.id === m[1])) { S.pId = m[1]; S.view = 'projeto'; }
  else if ((m = h.match(/^v-([a-z0-9]+)-([a-z0-9]+)$/i)) && S.projetos.some(p => p.id === m[1] && p.videos.some(v => v.id === m[2]))) { if (S.vId !== m[2]) { S.active = null; S.fichaOpen = false; S.editScript = null; } S.pId = m[1]; S.vId = m[2]; S.view = 'video'; }
  else if ((m = h.match(/^d-([a-z0-9]+)-([a-z0-9]+)$/i)) && S.projetos.some(p => p.id === m[1] && p.diarias.some(d => d.id === m[2]))) {
    if (S.dId !== m[2]) { S.active = null; S.dtab = null; }
    S.pId = m[1]; S.dId = m[2]; S.view = 'diaria';
    if (!S.dtab) { const d = Dd(); S.dtab = d.plano.length ? 'set' : 'plano'; }
  }
  else if ((m = h.match(/^r-([a-z0-9]+)$/i)) && S.projetos.some(p => p.id === m[1])) { S.pId = m[1]; S.view = 'relprojeto'; }
  else if ((m = h.match(/^rv-([a-z0-9]+)-([a-z0-9]+)$/i)) && S.projetos.some(p => p.id === m[1] && p.videos.some(v => v.id === m[2]))) { S.pId = m[1]; S.vId = m[2]; S.view = 'relvideo'; }
  else if (h === 'config') S.view = 'config';
  else S.view = 'inicio';
  render(); window.scrollTo(0, 0);
}
addEventListener('hashchange', route);

/* ============================== top bar ============================== */
function pendingCount(p) {
  if (!p) return 0;
  let n = 0;
  for (const nt of allNotes(p)) if (nt.audioId && !nt.driveId && (!nt.dev || nt.dev === DEVICE)) n++;
  for (const m of p.midias) if (!m.driveId && m.blobId && (!m.dev || m.dev === DEVICE)) n++;
  if (S.dirty.has(p.id)) n++;
  return n;
}
function syncChip() {
  if (!drive.driveConfigured()) return '';
  const p = P();
  if (S.sync.busy) return `<button class="sync busy" data-act="sync" title="${esc(S.sync.msg)}"><span class="d"></span>Enviando…</button>`;
  if (!drive.driveConnected()) return `<button class="sync" data-act="sync">${IC.drive}<span>Conectar Drive</span></button>`;
  const n = p ? pendingCount(p) : 0;
  return `<button class="sync ${n ? 'pend' : 'ok'}" data-act="sync"><span class="d"></span>${n ? `Sincronizar · ${n}` : 'Drive em dia'}</button>`;
}
function setTop(crumb, acts = '') {
  $('#crumb').textContent = crumb || '';
  $('#topacts').innerHTML = (S.view !== 'inicio' && S.view !== 'config' ? syncChip() : '') + acts;
}

/* ============================== render ============================== */
const app = () => $('#app');
function render() {
  if (S.view === 'projeto') renderProject();
  else if (S.view === 'video') renderVideo();
  else if (S.view === 'diaria') renderDiaria();
  else if (S.view === 'relprojeto') renderProjectReport();
  else if (S.view === 'relvideo') renderVideoReport();
  else if (S.view === 'config') renderConfig();
  else renderHome();
  renderDock();
}

function progressBar(v) {
  const c = counts(v); const t = Math.max(1, c.total);
  return `<div class="prog" title="${c.valendo} valendo de ${c.total}"><i class="p-ok" style="width:${c.valendo / t * 100}%"></i><i class="p-info" style="width:${c.gravada / t * 100}%"></i><i class="p-warn" style="width:${c.refazer / t * 100}%"></i></div>`;
}

/* ---------- home ---------- */
function renderHome() {
  setTop('', `<button class="btn sm ghost" data-act="go" data-h="config" aria-label="Configurações">${IC.gear}</button>`);
  const list = [...S.projetos].sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''));
  app().innerHTML = `<section class="stack">
    <div class="hero"><div><div class="eyebrow">Relatório de Set</div><h1>Projetos</h1></div>
    <div class="row">${drive.driveConfigured() ? `<button class="btn" data-act="drive-open">${IC.drive}Abrir do Drive</button>` : ''}<button class="btn primary" data-act="new-project">${IC.plus}Novo projeto</button></div></div>
    ${list.length ? `<div class="card-list">${list.map(p => {
      const ds = [...p.diarias].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
      const tot = p.videos.reduce((a, v) => a + counts(v).total, 0), val = p.videos.reduce((a, v) => a + counts(v).valendo, 0);
      return `<button class="pcard" data-act="go" data-h="p-${p.id}"><span class="eyebrow">${esc(p.produtora || 'Produtora não informada')}</span><span class="t">${esc(p.nome || 'Projeto sem nome')}</span>
        <span class="s"><span>${p.videos.length} vídeo${p.videos.length === 1 ? '' : 's'}</span><span>${p.diarias.length} diária${p.diarias.length === 1 ? '' : 's'}</span>${ds[0] ? `<span>Última: ${esc(fmtDate(ds[0].data))}</span>` : ''}<span class="mono">${val}/${tot} valendo</span></span></button>`;
    }).join('')}</div>` : `<div class="empty"><strong>Nenhum projeto ainda</strong>Crie um projeto com o nome da produtora e do trabalho. Dentro dele você sobe os roteiros dos vídeos e organiza as diárias.</div>`}
  </section>`;
}

/* ---------- project ---------- */
function renderProject() {
  const p = P(); if (!p) return go('inicio');
  setTop(projName(p));
  if (!['videos', 'equipe', 'relatorios'].includes(S.ptab)) S.ptab = 'videos';
  const tabs = [['videos', 'Vídeos', IC.film], ['equipe', 'Equipe', IC.people], ['relatorios', 'Relatório', IC.report]];
  const groups = dateGroups(p);
  let body = '';
  if (S.ptab === 'equipe') {
    body = `<div class="muted" style="font-size:13.5px">Cadastro de quem trabalha no projeto. Em cada vídeo, na ficha de gravação, você escolhe quem estava e a função.</div>
    <div class="stack">${p.pessoas.map(pe => `<div class="eqrow" data-pe="${pe.id}"><input class="inp" data-pe-f="nome" value="${esc(pe.nome)}" placeholder="Nome" aria-label="Nome">${funcaoSelect(p, pe.funcao, 'data-pe-f="funcao"', 'fn')}<button class="iconbtn" data-act="del-pessoa" aria-label="Remover">${IC.trash}</button></div>`).join('')}</div>
    <div class="row"><button class="btn" data-act="add-pessoa">${IC.plus}Pessoa</button></div>
    ${eqSummary(p)}`;
  } else if (S.ptab === 'relatorios') {
    body = `<button class="pcard" data-act="go" data-h="r-${p.id}"><span class="eyebrow">Todos os vídeos</span><span class="t">Relatório do projeto</span><span class="s">Status de todas as cenas, arquivos aprovados, notas, equipe e mídias</span></button>
    ${groups.filter(g => g.data).map(g => { const d = p.diarias.find(x => x.data === g.data); return `<div class="pcard" style="cursor:default"><span class="eyebrow">Gravação · ${esc(weekday(g.data))} ${esc(fmtDate(g.data))}</span><span class="s">${g.videos.map(v => esc(videoCode(p, v))).join(' · ')}</span>
      <div class="row"><button class="btn sm" data-act="open-day" data-date="${g.data}" data-k="ordem">${IC.calendar}Ordem do dia</button><button class="btn sm" data-act="open-day" data-date="${g.data}" data-k="relatorio">${IC.report}Relatório do dia</button></div></div>`; }).join('')}
    ${p.videos.length ? `<div class="eyebrow" style="margin-top:6px">Por vídeo</div><div class="card-list">${p.videos.map(v => `<button class="pcard vcard" data-act="go" data-h="rv-${p.id}-${v.id}" style="--vc:${videoColor(p, v)}"><span class="vbar"></span><span style="min-width:0"><span class="eyebrow"><span class="vtag">${esc(videoCode(p, v))}</span>Relatório do vídeo</span><br><b>${esc(videoName(v))}</b></span><span class="s">${esc(v.ficha?.data ? fmtDate(v.ficha.data) : '')}</span></button>`).join('')}</div>` : ''}
    ${p.drive?.folderLink ? `<a class="btn" href="${esc(p.drive.folderLink)}" target="_blank" rel="noopener">${IC.drive}Abrir pasta do projeto no Drive</a>` : ''}`;
  } else {
    body = `<div class="row"><span class="spacer"></span><button class="btn" data-act="add-video-manual">${IC.plus}Vídeo sem arquivo</button><button class="btn primary" data-act="add-docx">${IC.upload}Roteiro .docx</button></div>
    ${p.videos.length ? groups.map(g => `<section class="stack" style="gap:8px">
      <div class="row"><div class="eyebrow">${g.data ? `Gravação · ${esc(weekday(g.data))} ${esc(fmtDate(g.data))}${g.data === todayYmd() ? ' · HOJE' : ''}` : 'Sem data de gravação'}</div><span class="spacer"></span>${g.data ? `<button class="btn sm" data-act="open-day" data-date="${g.data}" data-k="plano">${IC.calendar}Plano do dia</button>` : ''}</div>
      <div class="card-list">${g.videos.map(v => { const c = counts(v); return `<button class="pcard vcard" data-act="go" data-h="v-${p.id}-${v.id}" style="--vc:${videoColor(p, v)}"><span class="vbar"></span>
      <span style="min-width:0;display:flex;flex-direction:column;gap:5px"><span class="eyebrow"><span class="vtag">${esc(videoCode(p, v))}</span>${esc(v.cab.versao || '')}${v.cab.duracao ? ' · ' + esc(v.cab.duracao) : ''}${v.ficha?.local ? ' · ' + esc(v.ficha.local) : ''}</span><span class="t" style="font-size:18px">${esc(videoName(v))}</span>${progressBar(v)}</span>
      <span class="s mono">${c.valendo}/${c.total}</span></button>`; }).join('')}</div></section>`).join('')
      : `<div class="empty"><strong>Nenhum vídeo ainda</strong>Envie os roteiros .docx da agência. Pode enviar vários de uma vez.</div>`}`;
  }
  const f = p.formato || {};
  app().innerHTML = `<section class="stack">
    <div><div class="eyebrow">${esc(p.produtora || 'Projeto')}</div><h1>${esc(p.nome || 'Projeto sem nome')}</h1>${p.formato ? `<div class="kvline" style="margin-top:4px"><span>Formato <b>${esc(fmtFormato(p.formato))}</b></span></div>` : ''}</div>
    <details class="fold" ${!p.nome ? 'open' : ''}><summary>Dados do projeto</summary><div class="panel" style="margin-top:10px"><div class="grid">
      <div class="field"><label for="pj-nome">Nome do projeto</label><input class="inp" id="pj-nome" data-pj="nome" value="${esc(p.nome)}" placeholder="Ex.: Honda – Treinamento Líderes"></div>
      <div class="field"><label for="pj-produtora">Produtora</label><input class="inp" id="pj-produtora" data-pj="produtora" value="${esc(p.produtora)}" placeholder="Ex.: Mooverama"></div>
      <div class="field"><label for="pj-agencia">Agência / cliente</label><input class="inp" id="pj-agencia" data-pj="agencia" value="${esc(p.agencia)}"></div>
      ${formatoFields(f, 'pjf', 'data-pjf')}
      <div class="field wide"><label for="pj-obs">Observações</label><textarea class="inp" id="pj-obs" data-pj="obs" rows="2">${esc(p.obs)}</textarea></div></div>
      <div class="row" style="margin-top:12px">${p.drive?.folderLink ? `<a class="btn sm" href="${esc(p.drive.folderLink)}" target="_blank" rel="noopener">${IC.drive}Pasta no Drive</a>` : ''}<button class="btn sm" data-act="export-backup">${IC.down}Backup do projeto</button><span class="spacer"></span>${S.confirm === 'del-project' ? `<div class="confirm">Excluir o projeto deste aparelho? (o Drive não é apagado) <button class="btn sm danger" data-act="del-project-yes">Excluir</button><button class="btn sm" data-act="confirm-no">Cancelar</button></div>` : `<button class="btn sm danger" data-act="ask" data-c="del-project">${IC.trash}Excluir projeto</button>`}</div>
    </div></details>
    <div class="seg" role="tablist">${tabs.map(([k, l, ic]) => `<button role="tab" aria-selected="${S.ptab === k}" data-act="ptab" data-v="${k}">${ic}${l}</button>`).join('')}</div>
    ${body}
  </section>`;
}
function dateGroups(p) {
  const m = new Map();
  for (const v of p.videos) { const k = v.ficha?.data || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(v); }
  return [...m.entries()].map(([data, videos]) => ({ data, videos })).sort((a, b) => !a.data ? 1 : !b.data ? -1 : b.data.localeCompare(a.data));
}
function formatoFields(f, idp, attr) {
  const o = f.orient || 'H';
  const opts = RESOLUCOES[o] || [];
  const custom = f.res && !opts.includes(f.res);
  return `<div class="field"><label for="${idp}-o">Orientação</label><select class="inp" id="${idp}-o" ${attr}="orient">${ORIENTACOES.map(([k, l]) => `<option value="${k}" ${o === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label for="${idp}-r">Resolução (px)</label><select class="inp" id="${idp}-r" ${attr}="res">${opts.map(r => `<option value="${r}" ${f.res === r ? 'selected' : ''}>${r.replace('x', ' × ')}</option>`).join('')}<option value="__outra" ${custom ? 'selected' : ''}>Outra…</option></select>${custom || f._custom ? `<input class="inp mono" style="margin-top:6px" ${attr}="resCustom" value="${esc(custom ? f.res : '')}" placeholder="largura x altura, ex.: 1440x1800" aria-label="Resolução personalizada">` : ''}</div>
    <div class="field"><label for="${idp}-f">Quadros por segundo</label><select class="inp" id="${idp}-f" ${attr}="fps"><option value="">—</option>${FPS.map(x => `<option ${f.fps === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`;
}
function eqSummary(p) {
  const rows = allPessoasFuncoes(p).map(r => `<tr><td><b>${esc(r.pessoa.nome)}</b></td><td>${esc([...r.funcoes].join(', ') || '—')}</td><td>${esc([...new Set(r.videos.map(v => videoCode(p, v)))].join(', '))}</td><td class="mono">${esc(r.dias.map(d => fmtDate(d).slice(0, 5)).join(', '))}</td></tr>`);
  return rows.length ? `<div class="rtab"><table><thead><tr><th>Nome</th><th>Funções</th><th>Vídeos</th><th>Datas</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '';
}
function funcaoSelect(p, val, attrs, cls = '') {
  const all = FUNCOES.flatMap(g => g[1]);
  const extras = [...new Set([...(p.funcoesExtras || []), ...(val && !all.includes(val) ? [val] : [])])];
  return `<select class="inp ${cls}" ${attrs} aria-label="Função"><option value="">Função…</option>${FUNCOES.map(([g, fs]) => `<optgroup label="${esc(g)}">${fs.map(f => `<option ${f === val ? 'selected' : ''}>${esc(f)}</option>`).join('')}</optgroup>`).join('')}${extras.length ? `<optgroup label="Suas funções">${extras.map(f => `<option ${f === val ? 'selected' : ''}>${esc(f)}</option>`).join('')}</optgroup>` : ''}<option value="__outra">Outra (digitar)…</option></select>`;
}

/* ---------- video ---------- */
function renderVideo() {
  const p = P(), v = V(); if (!p || !v) return go(p ? 'p-' + p.id : 'inicio');
  setTop(`${videoCode(p, v)} · ${projName(p)}`, `<button class="btn sm" data-act="go" data-h="rv-${p.id}-${v.id}">${IC.report}<span>Relatório</span></button><button class="btn sm" data-act="go" data-h="p-${p.id}">${IC.back}<span>Projeto</span></button>`);
  const cb = v.cab;
  const list = v.cenas.filter(c => sceneFilter(c));
  app().innerHTML = `<section class="stack">
    <div class="panel stack" style="--vc:${videoColor(p, v)};border-left:6px solid var(--vc)">
      <div class="cab"><span class="code">${esc(cb.codigo || videoCode(p, v))}</span><h2 style="flex:1;min-width:200px">${esc(videoName(v))}</h2></div>
      <div class="cab meta"><span>Data do roteiro: <b>${esc(cb.data || '—')}</b></span><span>Duração: <b>${esc(cb.duracao || '—')}</b></span><span>Cenas: <b>${esc(cb.cenas || v.cenas.length)}</b></span><span>Versão: <b>${esc(cb.versao || '—')}</b></span>${formatoOf(p, v) ? `<span>Formato: <b>${esc(fmtFormato(formatoOf(p, v)))}</b></span>` : ''}</div>
      <details class="fold"><summary>Editar cabeçalho</summary><div class="grid" style="margin-top:10px">
        ${[['codigo', 'Código do job'], ['cliente', 'Cliente'], ['titulo', 'Título'], ['data', 'Data do roteiro'], ['duracao', 'Duração'], ['cenas', 'Nº de cenas'], ['versao', 'Versão']].map(([k, l]) => `<div class="field ${k === 'titulo' ? 'wide' : ''}"><label for="cb-${k}">${l}</label><input class="inp" id="cb-${k}" data-cab="${k}" value="${esc(cb[k])}"></div>`).join('')}
        <div class="field wide muted" style="font-size:12.5px">Arquivo: ${esc(v.arquivo || 'criado manualmente')}</div></div>
        <div class="row" style="margin-top:10px">${S.confirm === 'del-video' ? `<div class="confirm">Remover este vídeo e todas as marcações dele? <button class="btn sm danger" data-act="del-video-yes">Remover</button><button class="btn sm" data-act="confirm-no">Cancelar</button></div>` : `<button class="btn sm danger" data-act="ask" data-c="del-video">${IC.trash}Remover vídeo</button>`}</div>
      </details>
    </div>
    ${fichaPanel(p, v)}
    <div class="row"><div class="filters" role="group">${[['todas', 'Todas'], ['abertas', 'Em aberto'], ['marcadas', 'Com marcações']].map(([k, l]) => `<button class="chipbtn" aria-pressed="${S.filter === k}" data-act="filter" data-v="${k}">${l}</button>`).join('')}</div><span class="spacer"></span><button class="btn sm" data-act="add-cena">${IC.plus}Cena extra</button></div>
    <datalist id="ambientes">${[...new Set(p.videos.flatMap(x => units(x).map(u => u.prep?.ambiente).filter(Boolean)))].map(a => `<option value="${esc(a)}">`).join('')}</datalist>
    <div class="stack">${list.map(c => unitCard(p, { v: v.id, c: c.id, s: null }, { subs: true })).join('') || '<div class="empty">Nenhuma cena neste filtro.</div>'}</div>
    <div class="panel stack"><div class="row"><h3>Notas gerais do vídeo</h3><span class="spacer"></span><button class="btn sm" data-act="rec-general" data-v="${v.id}">${IC.mic}Gravar</button></div>${notesList(v.notas, { v: v.id, c: null, s: null }) || '<div class="muted" style="font-size:13.5px">Notas sem cena específica aparecem aqui.</div>'}</div>
  </section>`;
}
// Recording sheet of a video: date, place, team, equipment, format
function fichaPanel(p, v) {
  const f = v.ficha; const geo = f.geo ? `<span class="mono" style="font-size:12.5px">${f.geo.lat.toFixed(5)}, ${f.geo.lng.toFixed(5)}</span> <a href="${esc(mapsUrl(f))}" target="_blank" rel="noopener">Ver no mapa</a>` : '';
  const empty = !f.data && !f.local && !f.equipe.length;
  const resumo = [f.data && fmtDate(f.data), TIPO_L[f.tipo], f.local, f.equipe.length && `${f.equipe.length} na equipe`, f.equipamentos.length && `${f.equipamentos.length} equipamento${f.equipamentos.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
  const others = p.videos.filter(x => x !== v);
  return `<details class="fold panel" id="ficha" ${empty || S.fichaOpen ? 'open' : ''}><summary style="font-size:15px;color:var(--ink)">Ficha de gravação${resumo ? ` <span class="muted" style="font-weight:400;font-size:13px">· ${esc(resumo)}</span>` : ''}</summary>
    <div class="stack" style="margin-top:12px">
    <div class="grid">
      <div class="field"><label for="fi-data">Data da gravação</label><input class="inp" type="date" id="fi-data" data-fi="data" value="${esc(f.data)}"></div>
      <div class="field"><label for="fi-tipo">Tipo</label><select class="inp" id="fi-tipo" data-fi="tipo">${TIPOS_DIARIA.map(([k, l]) => `<option value="${k}" ${f.tipo === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="fi-local">Local</label><input class="inp" id="fi-local" data-fi="local" value="${esc(f.local)}" placeholder="Ex.: Estúdio Mooverama"></div>
      <div class="field wide"><label for="fi-end">Endereço</label><input class="inp" id="fi-end" data-fi="endereco" value="${esc(f.endereco)}" placeholder="Rua, número, cidade"></div>
      <div class="field wide"><div class="row"><button class="btn sm" data-act="geo">${IC.pin}${f.geo ? 'Atualizar localização' : 'Usar minha localização'}</button>${geo}${f.geo ? `<button class="iconbtn" data-act="geo-clear" aria-label="Remover localização">${IC.x}</button>` : ''}</div></div>
    </div>
    <div class="stack" style="gap:8px"><div class="row"><h3>Equipe</h3><span class="spacer"></span>${others.some(x => x.ficha.equipe.length) ? `<button class="btn sm" data-act="eq-copy">Copiar de outro vídeo</button>` : ''}</div>
      <datalist id="pessoas">${p.pessoas.map(pe => `<option value="${esc(pe.nome)}">`).join('')}</datalist>
      ${f.equipe.map(e => { const pe = p.pessoas.find(x => x.id === e.pessoaId); return `<div class="eqrow" data-eq="${e.id}"><input class="inp" list="pessoas" data-eq-f="nome" value="${esc(pe?.nome || '')}" placeholder="Nome" aria-label="Nome">${funcaoSelect(p, e.funcao, 'data-eq-f="funcao"', 'fn')}<button class="iconbtn" data-act="eq-del" aria-label="Remover">${IC.trash}</button></div>`; }).join('')}
      <div class="row"><button class="btn sm" data-act="eq-add">${IC.plus}Pessoa</button>${p.pessoas.filter(pe => pe.nome && !f.equipe.some(e => e.pessoaId === pe.id)).slice(0, 12).map(pe => `<button class="chipbtn" data-act="eq-quick" data-pe="${pe.id}">+ ${esc(pe.nome)}</button>`).join('')}</div>
    </div>
    <div class="stack" style="gap:8px"><div class="row"><h3>Set de equipamentos</h3><span class="spacer"></span>${S.kits.length ? `<select class="inp" id="kitLoad" style="width:auto;min-height:34px;font-size:13px" aria-label="Carregar kit"><option value="">Carregar kit…</option>${S.kits.map(k => `<option value="${k.id}">${esc(k.nome)} (${k.itens.length})</option>`).join('')}</select>` : ''}</div>
      ${f.equipamentos.map(e => `<div class="eqrow" data-eqp="${e.id}" style="grid-template-columns:minmax(0,.8fr) minmax(0,1.4fr) 64px auto"><select class="inp" data-eqp-f="cat" aria-label="Categoria">${EQUIP_CATS.map(c => `<option ${e.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select><input class="inp" data-eqp-f="item" value="${esc(e.item)}" placeholder="Ex.: Sony FX6" aria-label="Equipamento"><input class="inp mono" type="number" min="1" data-eqp-f="qtd" value="${esc(e.qtd || 1)}" aria-label="Quantidade"><button class="iconbtn" data-act="eqp-del" aria-label="Remover">${IC.trash}</button></div>`).join('')}
      <div class="row"><button class="btn sm" data-act="eqp-add">${IC.plus}Equipamento</button>${f.equipamentos.length ? (S.confirm === 'kit-save' ? `<input class="inp" id="kitName" style="width:200px;min-height:34px" placeholder="Nome do kit"><button class="btn sm primary" data-act="kit-save-ok">Salvar kit</button><button class="btn sm" data-act="confirm-no">Cancelar</button>` : `<button class="btn sm ghost" data-act="ask" data-c="kit-save">Salvar como kit</button>`) : ''}</div>
    </div>
    <div class="stack" style="gap:8px"><label class="row" style="gap:8px;font-size:14px"><input type="checkbox" id="fiFmtOwn" ${f.formato ? 'checked' : ''}> Formato diferente do projeto${!f.formato && p.formato ? ` <span class="muted">(projeto: ${esc(fmtFormato(p.formato))})</span>` : ''}</label>
      ${f.formato ? `<div class="grid">${formatoFields(f.formato, 'vff', 'data-vff')}</div>` : ''}</div>
    <div class="field setnote-field"><label for="fi-obs">Observações escritas no set</label><textarea class="inp" id="fi-obs" data-fi="obs" rows="2" placeholder="Ex.: gravamos com duas câmeras; CAM A em plano americano…">${esc(f.obs)}</textarea></div>
    ${others.length ? `<div class="row">${S.confirm === 'ficha-all' ? `<div class="confirm">Copiar data, local, equipe e equipamentos para os outros ${others.length} vídeo${others.length > 1 ? 's' : ''} do projeto? <button class="btn sm danger" data-act="ficha-all-yes">Aplicar</button><button class="btn sm" data-act="confirm-no">Cancelar</button></div>` : `<button class="btn" data-act="ask" data-c="ficha-all">Aplicar a todos os vídeos do projeto</button>`}</div>` : ''}
    </div></details>`;
}
function sceneFilter(c) {
  if (S.filter === 'abertas') return [c, ...c.subcenas].some(u => ['pendente', 'refazer', 'gravada'].includes(u.status));
  if (S.filter === 'marcadas') return [c, ...c.subcenas].some(hasMarks);
  return true;
}
function prepFields(u, idp, applyBtn = true) {
  const pr = u.prep || (u.prep = {});
  const opt = (arr, val) => arr.map(([k, l]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${l}</option>`).join('');
  return `<div class="prep">
    <div class="field"><label for="${idp}-amb">Ambiente / set</label><input class="inp" id="${idp}-amb" list="ambientes" data-prep="ambiente" value="${esc(pr.ambiente)}" placeholder="Ex.: Estúdio – fundo infinito"></div>
    <div class="field"><label for="${idp}-ie">INT / EXT</label><select class="inp" id="${idp}-ie" data-prep="intext">${opt([['', '—'], ['INT', 'Interna'], ['EXT', 'Externa']], pr.intext)}</select></div>
    <div class="field"><label for="${idp}-dn">Período</label><select class="inp" id="${idp}-dn" data-prep="periodo">${opt([['', '—'], ['DIA', 'Dia'], ['NOITE', 'Noite']], pr.periodo)}</select></div>
    <div class="field"><label for="${idp}-cm">Câmeras</label><select class="inp" id="${idp}-cm" data-prep="cameras">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${camCount(u) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    ${camCount(u) > 1 ? Array.from({ length: camCount(u) }, (_, i) => { const L = camLetter(i); const val = pr.planoCam?.[L] ?? (i === 0 ? pr.plano : '') ?? ''; return `<div class="field"><label for="${idp}-pl${L}">Plano · Câm ${L}</label><select class="inp" id="${idp}-pl${L}" data-prepcam="${L}"><option value="">—</option>${PLANOS.map(x => `<option ${val === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}${val && !PLANOS.includes(val) ? `<option selected>${esc(val)}</option>` : ''}</select></div>`; }).join('')
      : `<div class="field"><label for="${idp}-pl">Plano</label><select class="inp" id="${idp}-pl" data-prep="plano"><option value="">—</option>${PLANOS.map(x => `<option ${pr.plano === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}${pr.plano && !PLANOS.includes(pr.plano) ? `<option selected>${esc(pr.plano)}</option>` : ''}</select></div>`}
    <div class="field"><label for="${idp}-tm">Tempo (min)</label><input class="inp mono" id="${idp}-tm" type="number" min="0" step="5" inputmode="numeric" data-prep="tempo" value="${esc(pr.tempo)}" placeholder="20"></div>
    <div class="field"><label for="${idp}-el">Elenco</label><input class="inp" id="${idp}-el" data-prep="elenco" value="${esc(pr.elenco)}" placeholder="Apresentador…"></div>
    <div class="field"><label for="${idp}-ne">Necessidades</label><input class="inp" id="${idp}-ne" data-prep="necessidades" value="${esc(pr.necessidades)}" placeholder="Objetos, figurino…"></div>
    ${applyBtn ? `<div class="wide row"><button class="btn sm ghost" data-act="prep-all">Aplicar a todas…</button>${pr.pos ? `<span class="muted" style="font-size:12px">Parece ser só pós-produção (lettering, arte). Tempo de set sugerido: 0 min.</span>` : ''}</div>` : ''}
  </div>`;
}
function scriptBlock(c) {
  if (S.editScript === c.id) {
    return `<div class="stack" style="gap:8px;border:1.5px solid var(--focus);border-radius:8px;padding:10px">
      <div class="field"><label for="se-img-${c.id}">IMAGEM</label><textarea class="inp" id="se-img-${c.id}" rows="4">${esc(c.imagemTxt || '')}</textarea></div>
      <div class="field"><label for="se-txt-${c.id}">TEXTO</label><textarea class="inp" id="se-txt-${c.id}" rows="6">${esc(c.textoTxt || '')}</textarea></div>
      ${(c.complementos || []).map((x, i) => `<div class="muted" style="font-size:11.5px;letter-spacing:.08em;border-top:1px dashed var(--line);padding-top:8px">CONTINUAÇÃO ${i + 1} DA CENA</div>
      <div class="field"><label for="se-img-${c.id}-${i}">IMAGEM</label><textarea class="inp" id="se-img-${c.id}-${i}" rows="3">${esc(x.imagemTxt || '')}</textarea></div>
      <div class="field"><label for="se-txt-${c.id}-${i}">TEXTO</label><textarea class="inp" id="se-txt-${c.id}-${i}" rows="4">${esc(x.textoTxt || '')}</textarea></div>`).join('')}
      <div class="row">${c.original ? `<button class="btn sm ghost" data-act="script-restore">Voltar ao original da agência</button>` : ''}<span class="spacer"></span><button class="btn sm" data-act="script-cancel">Cancelar</button><button class="btn sm primary" data-act="script-save">Salvar texto</button></div></div>`;
  }
  const cmp = (c.complementos || []).map(x => `<div class="cmp"><div class="img">${cleanHtml(x.imagem) || '<span class="muted">—</span>'}</div><div>${cleanHtml(x.texto) || '<span class="muted">—</span>'}</div></div>`).join('');
  return `<div class="script"><div class="img"><div class="hd row" style="gap:6px">IMAGEM<span class="spacer"></span><button class="iconbtn" data-act="script-edit" aria-label="Editar texto do roteiro" title="Editar texto do roteiro">${IC.edit}</button></div>${cleanHtml(c.imagem) || '<span class="muted">—</span>'}</div><div><div class="hd">TEXTO${c.original ? ' <span class="badge pend">alterado no set</span>' : ''}</div>${cleanHtml(c.texto) || '<span class="muted">—</span>'}</div>${cmp}</div>`;
}
const textToHtml = t => String(t || '').split(/\n{2,}/).map(par => par.trim()).filter(Boolean).map(par => `<p>${esc(par).replace(/\n/g, '<br>')}</p>`).join('');
function nextSubNum(c) { const used = c.subcenas.map(s => parseInt(s.numero.split('.').pop(), 10) || 0); return `${c.numero}.${(used.length ? Math.max(...used) : 0) + 1}`; }

/* ---------- unit card ---------- */
function unitCard(p, t, o = {}) {
  const v = findVideo(p, t.v); const c = v && v.cenas.find(x => x.id === t.c); const u = findUnit(p, t);
  if (!u) return '';
  const isSub = !!t.s;
  const act = S.active && sameT(S.active, t);
  const key = `${t.v}|${t.c}|${t.s || ''}`;
  const exc = isSub ? (u.descricao || '') : excerpt(c);
  const stOpen = S.openStamps.has(key);
  const meds = p.midias.filter(m => sameT(m, t));
  const nCam = camCount(u);
  const subs = !isSub && o.subs ? c.subcenas.map(s => unitCard(p, { v: t.v, c: t.c, s: s.id }, { nested: true, multi: o.multi })).join('') : '';
  const arq = nCam > 1
    ? `<div class="field"><label>Arquivo(s) aprovado(s) por câmera</label><div class="stack" style="gap:6px">${Array.from({ length: nCam }, (_, i) => { const L = camLetter(i); const val = u.arquivosCam?.[L] ?? (i === 0 ? u.arquivos : '') ?? ''; return `<div class="row" style="gap:6px;flex-wrap:nowrap"><span class="mono" style="min-width:52px;font-size:12.5px">Câm ${L}</span><input class="inp mono" data-ucam="${L}" value="${esc(val)}" placeholder="${L}001_C012" aria-label="Arquivo câmera ${L}"></div>`; }).join('')}</div></div>`
    : `<div class="field"><label for="ua-${u.id}">Arquivo(s) aprovado(s)</label><textarea class="inp mono" rows="1" id="ua-${u.id}" data-u="arquivos" placeholder="A001_C012">${esc(u.arquivos)}</textarea></div>`;
  return `<article class="${o.nested ? 'sub' : 'scene'} st-${u.status} ${act ? 'scene active' : ''}" data-v="${t.v}" data-c="${t.c}" data-s="${t.s || ''}">
    <div class="sh">
      <button class="slate" data-act="select" aria-label="Selecionar cena ${esc(u.numero)} para gravar">${o.multi ? `<small style="color:${videoColor(p, v)};opacity:1;filter:brightness(1.6)">${esc(videoCode(p, v))}</small>` : (isSub ? '' : '<small>CENA</small>')}${esc(u.numero)}</button>
      <div class="mid">${o.time ? `<div class="mono muted" style="font-size:12.5px">${o.time}</div>` : ''}${exc ? `<div class="excerpt">${esc(exc)}</div>` : ''}
        <div class="status" role="group" aria-label="Status">${STATUS.map(s => `<button class="st k-${s.k}" aria-pressed="${u.status === s.k}" data-act="status" data-val="${s.k}">${s.l}</button>`).join('')}</div>
        <div class="stamps ${stOpen ? '' : 'compact'}">${STAMPS.map(s => `<button class="stamp t-${s.k}" aria-pressed="${u.stamps.includes(s.k)}" data-act="stamp" data-val="${s.k}">${s.l}</button>`).join('')}<button class="more" data-act="stamps-open">${u.stamps.length ? '+ carimbo' : '+ Carimbos'}</button></div>
      </div>
      <button class="micbtn" data-act="rec" aria-label="Gravar nota na cena ${esc(u.numero)}">${IC.mic}</button>
    </div>
    <div class="sb">
      <div class="two">${arq}
        <div class="field ednote-field"><label for="uo-${u.id}">Observações para o editor</label><textarea class="inp" rows="1" id="uo-${u.id}" data-u="obs" placeholder="Ex.: usar o take 3 até 0:42, depois o take 5">${esc(u.obs)}</textarea></div>
      </div>
      ${isSub ? `<div class="field"><label for="ud-${u.id}">O que é esta subcena</label><input class="inp" id="ud-${u.id}" data-u="descricao" value="${esc(u.descricao || '')}" placeholder="Ex.: plano fechado do lettering"></div>` : ''}
      ${notesList(u.notas, t)}
      ${meds.length ? `<div class="thumbs">${meds.map(m => thumbBtn(m)).join('')}</div>` : ''}
      <div class="row">
        <button class="btn sm" data-act="media" aria-label="Adicionar foto ou vídeo">${IC.cam}Foto/vídeo</button>
        <span class="spacer"></span>
        ${!isSub ? `<button class="btn sm" data-act="add-sub">${IC.plus}Subcena ${esc(nextSubNum(c))}</button>` : ''}
        ${isSub || c.manual ? (S.confirm === 'del-' + key ? `<div class="confirm">Excluir ${esc(u.numero)}? <button class="btn sm danger" data-act="del-unit-yes">Excluir</button><button class="btn sm" data-act="confirm-no">Não</button></div>` : `<button class="iconbtn" data-act="ask" data-c="del-${key}" aria-label="Excluir">${IC.trash}</button>`) : ''}
      </div>
      ${prepFields(u, 'up-' + u.id)}
      ${!isSub ? scriptBlock(c) : ''}
    </div>
    ${subs ? `<div class="subs">${subs}</div>` : ''}
  </article>`;
}
const thumbBtn = m => `<button class="thumb" data-act="media-view" data-m="${m.id}" aria-label="${m.tipo === 'video' ? 'Vídeo' : 'Foto'}">${m.thumb ? `<img src="${m.thumb}" alt="">` : ''}${m.tipo === 'video' ? '<span class="b">VÍDEO</span>' : ''}${drive.driveConfigured() ? `<span class="up ${m.driveId ? 'ok' : ''}"></span>` : ''}</button>`;
function notesList(notas, t) {
  if (!notas.length) return '';
  return `<div class="notes">${notas.map(n => `<div class="note" data-n="${n.id}" data-nv="${t.v || ''}" data-nc="${t.c || ''}" data-ns="${t.s || ''}">
    <time>${hhmm(n.criadaEm)}</time>
    <div class="tx ${n.texto ? '' : 'pending'}">${n.texto ? esc(n.texto) : (n.transcricao === 'processando' ? 'Transcrevendo…' : 'Áudio aguardando transcrição.')}${n.transcricao === 'ia' ? ' <span class="badge ia">IA</span>' : n.transcricao === 'pendente' || n.transcricao === 'navegador' && aiConfigured() ? ' <span class="badge pend">rascunho</span>' : ''}</div>
    <div class="na">${n.audioId ? `<button class="iconbtn" data-act="play" data-a="${n.audioId}" aria-label="Ouvir">${IC.play}</button>` : ''}<button class="iconbtn" data-act="note-edit" aria-label="Editar nota">${IC.edit}</button></div>
  </div>`).join('')}</div>`;
}

/* ---------- day (plan of all videos recorded on the same date) ---------- */
function renderDiaria() {
  const p = P(), d = Dd(); if (!p || !d) return go(p ? 'p-' + p.id : 'inicio');
  setTop(`Plano do dia · ${fmtDate(d.data)}`, `<button class="btn sm" data-act="go" data-h="p-${p.id}">${IC.back}<span>Projeto</span></button>`);
  if (!['plano', 'set', 'relatorio'].includes(S.dtab)) S.dtab = 'plano';
  const tabs = [['plano', 'Plano'], ['set', 'Set'], ['relatorio', 'Relatório do dia']];
  let body = '';
  if (S.dtab === 'plano') body = diariaPlano(p, d);
  else if (S.dtab === 'relatorio') body = diariaRelatorio(p, d);
  else body = diariaSet(p, d);
  const info = dayInfo(p, d);
  app().innerHTML = `<section class="stack">
    <div><div class="eyebrow">${esc(projName(p))}</div><h1>Plano do dia · ${esc(weekday(d.data))} ${esc(fmtDate(d.data))}</h1>
    <div class="kvline" style="margin-top:6px">${info.tipos.length ? `<span><b>${esc(info.tipos.map(k => TIPO_L[k]).join(' / '))}</b></span>` : ''}${info.local ? `<span>${esc(info.local)}</span>` : ''}<span>Chegada <b>${esc(d.call || '—')}</b></span>${d.plano.length ? `<span>Término previsto <b>${planTimes(p, d).end}</b></span>` : ''}<span>${info.videos.length} vídeo${info.videos.length === 1 ? '' : 's'} nesta data</span>${info.equipe.length ? `<span>${info.equipe.length} na equipe</span>` : ''}</div></div>
    <div class="seg" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${S.dtab === k}" data-act="dtab" data-v="${k}">${l}</button>`).join('')}</div>
    ${body}
  </section>`;
}
function diariaPlano(p, d) {
  const pt = planTimes(p, d);
  const nC = d.plano.filter(i => i.k === 'cena').length;
  if (!p.videos.length) return `<div class="empty"><strong>Sem vídeos no projeto</strong>Envie os roteiros na aba Vídeos do projeto para montar o plano.</div>`;
  return `<div class="panel stack"><div class="row"><div class="field" style="max-width:150px"><label for="dd-call">Chegada (call)</label><input class="inp mono" type="time" id="dd-call" data-dd="call" value="${esc(d.call)}"></div></div><div class="plan-sum"><span>${nC} cena${nC === 1 ? '' : 's'}</span><span>Total <b>${durTxt(pt.total)}</b></span><span>Término previsto <b>${pt.end}</b></span></div>
    <div class="row"><button class="btn primary" data-act="plan-add">${IC.plus}Cenas</button><button class="btn" data-act="plan-ev">${IC.plus}Evento</button><button class="btn" data-act="plan-group" ${nC < 2 ? 'disabled' : ''}>Agrupar por ambiente</button><span class="spacer"></span><button class="btn" data-act="pdf-ordem">${IC.down}Ordem do dia (PDF)</button></div></div>
    ${d.plano.length ? `<div class="strips" id="strips">${d.plano.map((it, i) => stripHtml(p, d, it, pt.items[i], i)).join('')}</div>
      <div class="muted" style="font-size:13px">Arraste pela alça <span style="display:inline-block;vertical-align:middle;width:16px">${IC.grip}</span> para reordenar. Toque na cena para editar ambiente, plano e tempo.</div>` : `<div class="empty"><strong>Plano vazio</strong>Toque em <b>+ Cenas</b> para escolher as cenas de um ou mais vídeos que serão gravadas neste dia.</div>`}`;
}
function stripHtml(p, d, it, tm, i) {
  if (it.k === 'ev') return `<div class="strip ev" data-i="${i}"><button class="grip" aria-label="Arrastar">${IC.grip}</button><span class="tm">${tm.start}</span><span class="num">${esc(EVENTO_L[it.tipo] ? '' : '')}</span>
    <div class="info"><input class="inp" style="min-height:34px" data-ev="titulo" value="${esc(it.titulo || EVENTO_L[it.tipo])}" aria-label="Evento"></div>
    <div class="acts"><input class="mins" type="number" min="0" step="5" data-ev="min" value="${esc(it.min)}" aria-label="Minutos"><button class="iconbtn" data-act="plan-del" aria-label="Remover">${IC.x}</button></div></div>`;
  const v = findVideo(p, it.v); const u = findUnit(p, it);
  if (!u) return `<div class="strip" data-i="${i}"><button class="grip">${IC.grip}</button><span class="tm">${tm.start}</span><span class="num">?</span><div class="info"><span class="l2">Cena removida</span></div><div class="acts"><button class="iconbtn" data-act="plan-del">${IC.x}</button></div></div>`;
  const pr = u.prep || {};
  const stc = { pendente: 'var(--off)', gravada: 'var(--info)', valendo: 'var(--ok)', refazer: 'var(--warn)', fora: 'var(--off)' }[u.status];
  return `<div class="strip" data-i="${i}" style="--vc:${videoColor(p, v)}"><button class="grip" aria-label="Arrastar">${IC.grip}</button><span class="tm">${tm.start}</span>
    <button class="num" data-act="plan-edit" style="border:0;background:none;cursor:pointer;text-align:left;padding:0"><span class="vtag" style="font-size:9.5px">${esc(videoCode(p, v))}</span><br>${esc(u.numero)}</button>
    <button class="info" data-act="plan-edit" style="border:0;background:none;cursor:pointer;text-align:left;padding:0"><span class="l1">${esc(pr.ambiente || 'Ambiente não definido')}${pr.intext || pr.periodo ? ' · ' + esc([pr.intext, pr.periodo].filter(Boolean).join(' ')) : ''}</span><span class="l2"><span class="st-dot" style="background:${stc}"></span>${esc([planoText(u), unitExcerpt(p, it)].filter(Boolean).join(' · '))}</span></button>
    <div class="acts"><span class="mono muted" style="font-size:12px">${durTxt(tm.dur)}</span><button class="iconbtn" data-act="plan-del" aria-label="Tirar do plano">${IC.x}</button></div></div>`;
}
function diariaSet(p, d) {
  const pt = planTimes(p, d);
  const planned = d.plano.map((it, i) => ({ it, tm: pt.items[i] }));
  const extra = unitsDoneIn(p, d).filter(t => !d.plano.some(i => i.k === 'cena' && sameT(i, t)) && !(t.s && d.plano.some(i => i.k === 'cena' && i.v === t.v && i.c === t.c && !i.s)));
  const multi = new Set(d.plano.filter(i => i.k === 'cena').map(i => i.v)).size > 1 || p.videos.length > 1;
  const cards = planned.map(({ it, tm }) => it.k === 'ev'
    ? `<div class="strip ev" style="grid-template-columns:auto 1fr auto"><span class="tm">${tm.start}</span><b>${esc(it.titulo || EVENTO_L[it.tipo])}</b><span class="mono muted" style="font-size:12px">${durTxt(tm.dur)}</span></div>`
    : unitCard(p, it, { subs: !it.s, multi, time: `${tm.start} · ${durTxt(tm.dur)}` })).join('');
  return `${d.plano.length ? '' : `<div class="banner">Esta diária ainda não tem plano de filmagem. Você pode gravar mesmo assim: use <b>+ Cena fora do plano</b> ou monte o plano na aba Plano.</div>`}
    <div class="stack">${cards}</div>
    ${extra.length ? `<div class="eyebrow" style="margin-top:8px">Gravado fora do plano</div><div class="stack">${extra.map(t => unitCard(p, t, { multi })).join('')}</div>` : ''}
    <div class="row"><button class="btn" data-act="plan-add" data-extra="1">${IC.plus}Cena fora do plano</button><button class="btn" data-act="media" data-general="1">${IC.cam}Foto/vídeo da diária</button></div>
    ${(() => { const meds = p.midias.filter(m => m.diariaId === d.id && !m.c); return meds.length ? `<div class="thumbs">${meds.map(thumbBtn).join('')}</div>` : ''; })()}`;
}
function diariaRelatorio(p, d) {
  const media = m => m.thumb ? `<a ${m.driveLink ? `href="${esc(m.driveLink)}" target="_blank" rel="noopener"` : `href="#" data-act="media-view" data-m="${m.id}"`}><img src="${m.thumb}" alt="">${m.tipo === 'video' ? 'Vídeo' : 'Foto'} ${hhmm(m.criadaEm)}${m.legenda ? ' · ' + esc(m.legenda) : ''}</a>` : '';
  const audio = n => n.audioId ? ` <button class="btn sm ghost" data-act="play" data-a="${n.audioId}">${IC.play}ouvir</button>` : '';
  return `<div class="seg" role="tablist"><button role="tab" aria-selected="${S.repKind === 'relatorio'}" data-act="repkind" data-v="relatorio">Relatório da diária</button><button role="tab" aria-selected="${S.repKind === 'ordem'}" data-act="repkind" data-v="ordem">Ordem do dia</button></div>
    <div class="row"><button class="btn primary" data-act="${S.repKind === 'ordem' ? 'pdf-ordem' : 'pdf-rel'}">${IC.down}Baixar PDF</button>${navigator.canShare ? `<button class="btn" data-act="${S.repKind === 'ordem' ? 'share-ordem' : 'share-rel'}">${IC.share}Enviar PDF</button>` : ''}${S.repKind === 'relatorio' ? `<button class="btn" data-act="copy-text">Copiar texto</button>` : ''}${drive.driveConfigured() ? `<button class="btn" data-act="sync">${IC.drive}Salvar no Drive</button>` : ''}</div>
    ${S.repKind === 'ordem' ? callSheetHtml(p, d) : diariaReportHtml(p, d, { media, audio })}`;
}

/* ---------- project report ---------- */
function renderProjectReport() {
  const p = P(); if (!p) return go('inicio');
  setTop('Relatório do projeto', `<button class="btn sm" data-act="go" data-h="p-${p.id}">${IC.back}<span>Projeto</span></button>`);
  const media = m => m.thumb ? `<a ${m.driveLink ? `href="${esc(m.driveLink)}" target="_blank" rel="noopener"` : `href="#" data-act="media-view" data-m="${m.id}"`}><img src="${m.thumb}" alt="">${fmtDate(ymdOf(m.criadaEm)).slice(0, 5)} ${hhmm(m.criadaEm)}</a>` : '';
  app().innerHTML = `<section class="stack">
    <div class="row"><button class="btn primary" data-act="pdf-proj">${IC.down}Baixar PDF</button>${navigator.canShare ? `<button class="btn" data-act="share-proj">${IC.share}Enviar PDF</button>` : ''}${drive.driveConfigured() ? `<button class="btn" data-act="sync">${IC.drive}Salvar no Drive</button>` : ''}</div>
    <label class="row" style="gap:8px;font-size:14px"><input type="checkbox" id="hideEmpty" ${S.hideEmpty ? 'checked' : ''}> Ocultar cenas sem marcação</label>
    ${projectReportHtml(p, { hideEmpty: S.hideEmpty, media, audio: n => n.audioId ? ` <button class="btn sm ghost" data-act="play" data-a="${n.audioId}">${IC.play}ouvir</button>` : '' })}
  </section>`;
}

/* ---------- video report ---------- */
function renderVideoReport() {
  const p = P(), v = V(); if (!p || !v) return go(p ? 'p-' + p.id : 'inicio');
  setTop(`Relatório · ${videoCode(p, v)}`, `<button class="btn sm" data-act="go" data-h="v-${p.id}-${v.id}">${IC.back}<span>Vídeo</span></button>`);
  const media = m => m.thumb ? `<a ${m.driveLink ? `href="${esc(m.driveLink)}" target="_blank" rel="noopener"` : `href="#" data-act="media-view" data-m="${m.id}"`}><img src="${m.thumb}" alt="">${hhmm(m.criadaEm)}${m.legenda ? ' · ' + esc(m.legenda) : ''}</a>` : '';
  app().innerHTML = `<section class="stack">
    <div class="row"><button class="btn primary" data-act="pdf-video">${IC.down}Baixar PDF</button>${navigator.canShare ? `<button class="btn" data-act="share-video">${IC.share}Enviar PDF</button>` : ''}${drive.driveConfigured() ? `<button class="btn" data-act="sync">${IC.drive}Salvar no Drive</button>` : ''}</div>
    <label class="row" style="gap:8px;font-size:14px"><input type="checkbox" id="hideEmpty" ${S.hideEmpty ? 'checked' : ''}> Ocultar cenas sem marcação</label>
    ${videoReportHtml(p, v, { hideEmpty: S.hideEmpty, media, audio: n => n.audioId ? ` <button class="btn sm ghost" data-act="play" data-a="${n.audioId}">${IC.play}ouvir</button>` : '' })}
  </section>`;
}
/* ---------- settings ---------- */
function renderConfig() {
  setTop('Configurações', `<button class="btn sm" data-act="go" data-h="">${IC.back}<span>Projetos</span></button>`);
  app().innerHTML = `<section class="stack"><h1>Configurações</h1>
    <div class="panel stack"><h3>Transcrição com pontuação (IA)</h3>
      <div class="muted" style="font-size:13.5px">Cada nota de voz é enviada para a OpenAI pelo próprio site e volta com vírgulas, pontos e interrogações. Digite o código de acesso definido no Netlify (variável RDS_PASSCODE).</div>
      <div class="row"><input class="inp" id="passcode" type="password" autocomplete="off" value="${esc(getPasscode())}" placeholder="Código de acesso" style="max-width:260px"><button class="btn" data-act="pass-save">Salvar e testar</button></div>
      <div id="passMsg" class="muted" style="font-size:13.5px">${aiConfigured() ? 'Código salvo neste aparelho.' : 'Sem código: o app usa só o texto do navegador e a pontuação falada ("vírgula", "ponto", "interrogação").'}</div>
    </div>
    <div class="panel stack"><h3>Google Drive</h3>
      ${drive.driveConfigured() ? `<div class="muted" style="font-size:13.5px">Os projetos, PDFs, áudios, fotos e vídeos são enviados para a pasta “${esc(CONFIG.driveRootName)}” no seu Drive. O app só enxerga os arquivos que ele mesmo criou.</div>
      <div class="row">${drive.driveConnected() ? `<span class="badge ia">Conectado</span><button class="btn sm" data-act="drive-off">Desconectar</button>` : `<button class="btn" data-act="drive-on">${IC.drive}Conectar ao Google Drive</button>`}<button class="btn" data-act="drive-open">Abrir projeto do Drive</button></div>`
      : `<div class="muted" style="font-size:13.5px">O Drive ainda não foi configurado neste site. Falta o ID do Google Cloud no arquivo js/config.js (veja o guia de instalação).</div>`}
    </div>
    <div class="panel stack"><h3>Gravação</h3>
      <label class="row" style="gap:10px"><input type="checkbox" id="prefAudio" ${prefs.get('audio') ? 'checked' : ''}> Guardar o áudio original das notas (necessário para a transcrição por IA)</label>
      <div class="muted" style="font-size:13px">Palavras que viram pontuação: vírgula, ponto, ponto final, dois pontos, ponto e vírgula, interrogação, exclamação, reticências, nova linha, abre aspas, fecha aspas.</div>
    </div>
    <div class="panel stack"><h3>Armazenamento neste aparelho</h3><div class="muted" style="font-size:13.5px" id="storeInfo">Calculando…</div>
      <div class="row"><button class="btn" data-act="free-space">Liberar espaço (mídias já enviadas ao Drive)</button><button class="btn" data-act="import-backup">${IC.upload}Importar backup</button></div></div>
    <div class="muted" style="font-size:12px">Relatório de Set · versão 2.2</div>
  </section>`;
  if (navigator.storage?.estimate) navigator.storage.estimate().then(e => { const el = $('#storeInfo'); if (el) el.textContent = `Usando ${fmtBytes(e.usage || 0)} de ${fmtBytes(e.quota || 0)} disponíveis no navegador.`; }).catch(() => {});
}

/* ---------- dock ---------- */
function renderDock() {
  const dock = $('#dock');
  const p = P();
  const show = (S.view === 'diaria' && S.dtab === 'set') || S.view === 'video';
  if (!show || !p) { dock.hidden = true; document.body.classList.remove('has-dock'); return; }
  dock.hidden = false; document.body.classList.add('has-dock');
  const u = S.active ? findUnit(p, S.active) : null; const v = u ? findVideo(p, S.active.v) : null;
  dock.innerHTML = `<div class="wrap"><div class="tgt"><b>${u ? `${esc(videoCode(p, v))} · Cena ${esc(u.numero)}` : 'Nota rápida'}</b><span>${u ? 'Toque no número de outra cena para trocar' : 'Diga “cena 5…” e a nota vai para a cena certa'}</span></div>
  <button class="btn sm" data-act="media" data-dock="1" aria-label="Foto ou vídeo">${IC.cam}</button>
  <button class="bigrec" data-act="rec-dock" aria-label="Gravar nota de voz"><i></i></button></div>`;
}

/* ============================== sheets ============================== */
const sheet = { open(html, onClose) { this.onClose = onClose; document.body.style.overflow = 'hidden'; $('#sheetRoot').innerHTML = `<div class="scrim" data-scrim="1"><div class="sheet" role="dialog">${html}</div></div>`; }, close() { const f = this.onClose; this.onClose = null; $('#sheetRoot').innerHTML = ''; document.body.style.overflow = ''; f && f(); if (S.renderPending) setTimeout(renderSoon, 50); }, get isOpen() { return !!$('#sheetRoot').innerHTML; } };

function targetOptions(p, sel, scopeVideo) {
  const d = S.view === 'diaria' ? Dd() : null;
  const vids = scopeVideo ? [findVideo(p, scopeVideo)] : p.videos;
  const o = [];
  const opt = (t, label) => `<option value="${t.v}|${t.c || ''}|${t.s || ''}" ${sel && sameT(sel, t) || (sel && !sel.c && !t.c && sel.v === t.v) ? 'selected' : ''}>${label}</option>`;
  if (d && d.plano.some(i => i.k === 'cena')) {
    o.push('<optgroup label="Plano do dia">');
    for (const it of d.plano.filter(i => i.k === 'cena')) { const u = findUnit(p, it); if (u) o.push(opt(it, `${videoCode(p, findVideo(p, it.v))} · Cena ${esc(u.numero)}`)); }
    o.push('</optgroup>');
  }
  for (const v of vids) {
    o.push(`<optgroup label="${esc(videoCode(p, v))} — ${esc(videoName(v)).slice(0, 40)}">`);
    o.push(opt({ v: v.id, c: null, s: null }, `${esc(videoCode(p, v))} · Notas gerais`));
    for (const c of v.cenas) { o.push(opt({ v: v.id, c: c.id, s: null }, `${esc(videoCode(p, v))} · Cena ${esc(c.numero)}`)); for (const s of c.subcenas) o.push(opt({ v: v.id, c: c.id, s: s.id }, `${esc(videoCode(p, v))} · Cena ${esc(s.numero)}`)); }
    o.push('</optgroup>');
  }
  return o.join('');
}
const parseTargetVal = val => { const [v, c, s] = String(val || '').split('|'); return v ? { v, c: c || null, s: s || null } : null; };

/* ---------- voice recording ---------- */
const rec = new VoiceRecorder(() => updateLive());
let recState = null; // {phase, target, manual, t0, tick, noteRef, problems}
async function startRecording(target, manual) {
  const p = P(); if (!p || !p.videos.length) { toast('Adicione um vídeo ao projeto antes de gravar notas.'); return; }
  if (!target) target = S.active || (S.view === 'video' ? { v: S.vId, c: null, s: null } : null);
  recState = { phase: 'rec', target, manual: !!manual, t0: Date.now(), problems: new Set() };
  renderRecSheet();
  const ok = await rec.start({ keepAudio: prefs.get('audio') || aiConfigured() });
  if (!ok) { recState.phase = 'erro'; recState.problems = rec.problems; renderRecSheet(); return; }
  clearInterval(recState.tick); recState.tick = setInterval(updateLive, 500);
}
function renderRecSheet() {
  const p = P(); if (!recState || !p) return;
  const probs = [...(rec.on ? rec.problems : recState.problems)].map(k => `<div class="warnbox">${esc(PROB[k] || k)}</div>`).join('');
  if (recState.phase === 'rec' || recState.phase === 'salvando') {
    sheet.open(`<div class="row"><div class="recind ${recState.phase === 'salvando' ? 'off' : ''}"><span class="led"></span><span id="recTime">${recState.phase === 'salvando' ? 'SALVANDO' : 'REC ' + mmss(Date.now() - recState.t0)}</span></div><span class="spacer"></span><span class="muted" style="font-size:12.5px">${aiConfigured() ? 'Pontuação pela IA ao salvar' : 'Fale a pontuação: “vírgula”, “ponto”'}</span></div>
      <div class="field"><label for="recTarget">Vincular a</label><select class="inp" id="recTarget">${targetOptions(p, recState.target, S.view === 'video' ? S.vId : null)}</select>
      <span class="muted" style="font-size:12.5px">Se você disser “cena 5” ou “cena 3 ponto 2”${p.videos.length > 1 ? ' (e “vídeo 2”, se for outro vídeo)' : ''}, a nota vai para essa cena.</span></div>
      <div class="live" id="live" aria-live="polite"></div><div id="probs">${probs}</div>
      <div class="row"><button class="btn" data-act="rec-cancel">Descartar</button><span class="spacer"></span><button class="btn rec" data-act="rec-stop" ${recState.phase === 'salvando' ? 'disabled' : ''}><svg class="ico" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/></svg>Parar e salvar</button></div>`);
    updateLive(); return;
  }
  if (recState.phase === 'erro') { sheet.open(`<h3>Não foi possível gravar</h3>${probs || '<div class="warnbox">Este navegador não permite gravar áudio.</div>'}<div class="row"><span class="spacer"></span><button class="btn primary" data-act="sheet-close">Fechar</button></div>`); return; }
  if (recState.phase === 'revisao') renderReview();
}
function updateLive() {
  const el = $('#live'); if (el) { const t = rec.liveText; el.innerHTML = (t ? esc(spokenPunctuation(t)) + ' ' : '') + (rec.interim ? `<span class="int">${esc(rec.interim)}</span>` : '') || `<span class="int">${SR ? 'Fale agora… ex.: “Editor, cena 5, último take valendo, arquivo A001 C012.”' : 'Gravando áudio…'}</span>`; el.scrollTop = el.scrollHeight; }
  const tm = $('#recTime'); if (tm && recState?.phase === 'rec') tm.textContent = 'REC ' + mmss(Date.now() - recState.t0);
  const pb = $('#probs'); if (pb) { const h = [...rec.problems].map(k => `<div class="warnbox">${esc(PROB[k] || k)}</div>`).join(''); if (pb.innerHTML !== h) pb.innerHTML = h; }
}
function resolveSpoken(p, text, fallback) {
  const ref = parseCenaRef(text); if (!ref) return null;
  const vi = parseVideoRef(text);
  const v = vi && p.videos[vi - 1] ? p.videos[vi - 1] : findVideo(p, fallback?.v) || (S.view === 'video' ? V() : p.videos.length === 1 ? p.videos[0] : null);
  if (!v) return { msg: `A nota cita a cena ${ref}, mas não sei de qual vídeo. Escolha em “Vincular a”.` };
  const [a, b] = ref.split('.');
  const c = v.cenas.find(x => x.numero === a) || v.cenas.find(x => x.numero.replace(/\D/g, '') === a);
  if (!c) return { msg: `A cena ${ref} não existe em ${videoCode(p, v)}.` };
  if (!b) return { t: { v: v.id, c: c.id, s: null }, msg: `Nota salva em ${videoCode(p, v)} · cena ${c.numero}, citada no áudio.` };
  const full = `${c.numero}.${b}`;
  let s = c.subcenas.find(x => x.numero === full), created = false;
  if (!s) { s = newUnit(full, { descricao: '' }); s.stamps = ['adicionada']; s.prep = { ...c.prep, tempo: '' }; c.subcenas.push(s); c.subcenas.sort((x, y) => parseFloat(x.numero.split('.').pop()) - parseFloat(y.numero.split('.').pop())); created = true; }
  return { t: { v: v.id, c: c.id, s: s.id }, msg: created ? `Cena ${full} criada e nota salva nela.` : `Nota salva na cena ${full}, citada no áudio.` };
}
const noteHost = (p, t) => { if (!t) return null; if (!t.c) return findVideo(p, t.v); return findUnit(p, t); };
async function stopRecording(cancel) {
  if (!recState) return;
  clearInterval(recState.tick);
  recState.phase = 'salvando'; renderRecSheet();
  const res = await rec.stop();
  if (cancel || !res) { recState = null; sheet.close(); return; }
  const p = P(); if (!p) { sheet.close(); return; }
  if (!res.text && !res.blob) { recState = null; sheet.close(); toast('Nada foi captado. Tente de novo mais perto do microfone.'); return; }
  let audioId = null;
  if (res.blob) { audioId = 'a_' + uid(); try { await store.putBlob(audioId, res.blob); } catch { audioId = null; toast('O áudio não pôde ser guardado; o texto foi mantido.'); } }
  let tgt = recState.target, msg = '';
  if (res.text && !recState.manual) { const r = resolveSpoken(p, res.text, tgt); if (r) { msg = r.msg; if (r.t) tgt = r.t; } }
  if (!tgt) tgt = { v: p.videos[0].id, c: null, s: null };
  const note = { id: uid(), criadaEm: new Date(recState.t0).toISOString(), diariaId: currentDiariaId(p, tgt.v), duracaoMs: res.durationMs, texto: res.text, rascunho: res.text, audioId, mime: res.mime || '', transcricao: res.text ? 'navegador' : 'pendente', dev: DEVICE };
  const host = noteHost(p, tgt); host.notas.push(note);
  if (tgt.c) { if (host.status === 'pendente') host.status = 'gravada'; touch(host, p, tgt.v); S.active = tgt; }
  save(p, true);
  recState = { phase: 'revisao', noteRef: { t: tgt, n: note.id }, problems: res.problems, edited: false };
  render(); renderRecSheet();
  if (msg) toast(msg, 4200);
  if (audioId && aiConfigured() && navigator.onLine) aiTranscribeNote(p, note, true);
}
function findNote(p, ref) { const host = noteHost(p, ref.t); return host ? { host, note: host.notas.find(n => n.id === ref.n) } : {}; }
function renderReview() {
  const p = P(); const { host, note } = findNote(p, recState.noteRef); if (!note) { sheet.close(); return; }
  const t = recState.noteRef.t; const unit = t.c ? host : null; const v = findVideo(p, t.v);
  const sug = [];
  const txt = note.texto || '';
  const arq = txt && parseArquivo(txt);
  if (unit && arq && !(unit.arquivos || '').includes(arq)) sug.push(`<button data-act="sug" data-k="arq" data-val="${esc(arq)}">Arquivo aprovado: <b class="mono">${esc(arq)}</b></button>`);
  if (unit && saysValendo(txt) && unit.status !== 'valendo') sug.push(`<button data-act="sug" data-k="st" data-val="valendo">Marcar como Valendo</button>`);
  if (unit && saysRefazer(txt) && unit.status !== 'refazer') sug.push(`<button data-act="sug" data-k="st" data-val="refazer">Marcar como Refazer</button>`);
  if (unit && saysDialogo(txt) && !unit.stamps.includes('dialogo')) sug.push(`<button data-act="sug" data-k="stamp" data-val="dialogo">Carimbar Diálogo alterado</button>`);
  const status = note.transcricao === 'processando' ? '<div class="infobox">Transcrevendo com IA… o texto abaixo é o rascunho do navegador.</div>' : note.transcricao === 'erro' ? `<div class="warnbox">A transcrição por IA falhou${note.erro ? ': ' + esc(note.erro) : ''}. Ela será tentada de novo quando houver internet.</div>` : note.transcricao === 'ia' ? '<div class="muted" style="font-size:12.5px">Texto transcrito pela IA.</div>' : '';
  sheet.open(`<div class="row"><h3>${unit ? `${esc(videoCode(p, v))} · Cena ${esc(unit.numero)}` : `${esc(videoCode(p, v))} · Notas gerais`}</h3><span class="spacer"></span><span class="muted mono" style="font-size:12px">${hhmm(note.criadaEm)} · ${mmss(note.duracaoMs || 0)}</span></div>
    <div class="field"><label for="revTarget">Vincular a</label><select class="inp" id="revTarget">${targetOptions(p, t)}</select></div>
    ${status}
    <div class="field"><label for="revText">Texto da nota (edite se precisar)</label><textarea class="inp" id="revText" rows="5" placeholder="Sem texto ainda. Escreva aqui ou aguarde a transcrição.">${esc(note.texto)}</textarea></div>
    ${note.audioId ? `<div><button class="btn sm" data-act="play" data-a="${note.audioId}">${IC.play}Ouvir áudio</button>${aiConfigured() && note.transcricao !== 'processando' ? ` <button class="btn sm ghost" data-act="retranscribe">Transcrever de novo</button>` : ''}</div>` : ''}
    ${sug.length ? `<div class="field"><label>Sugestões a partir do que você falou</label><div class="sugg">${sug.join('')}</div></div>` : ''}
    ${[...(recState.problems || [])].filter(k => !['offline', 'sem-transcricao'].includes(k) || !aiConfigured()).map(k => `<div class="warnbox">${esc(PROB[k] || k)}</div>`).join('')}
    <div class="row"><button class="btn danger" data-act="rev-del">${IC.trash}Excluir</button><span class="spacer"></span><button class="btn" data-act="rev-again">${IC.mic}Gravar outra</button><button class="btn primary" data-act="rev-ok">Pronto</button></div>`, () => { recState = null; });
  const ta = $('#revText'); if (ta) ta.addEventListener('input', () => { recState && (recState.edited = true); }, { once: true });
}
function commitReview() {
  const p = P(); if (!recState?.noteRef) return null;
  const { host, note } = findNote(p, recState.noteRef); if (!note) return null;
  const ta = $('#revText');
  if (ta && ta.value.trim() !== (note.texto || '').trim()) { note.texto = ta.value.trim(); note.transcricao = 'manual'; }
  const sel = parseTargetVal($('#revTarget')?.value);
  if (sel && !sameT(sel, recState.noteRef.t) && !(!sel.c && !recState.noteRef.t.c && sel.v === recState.noteRef.t.v)) {
    host.notas.splice(host.notas.indexOf(note), 1);
    const nh = noteHost(p, sel); nh.notas.push(note); nh.notas.sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
    if (sel.c) { if (nh.status === 'pendente') nh.status = 'gravada'; touch(nh, p, sel.v); S.active = sel; }
    recState.noteRef.t = sel;
  }
  save(p);
  return recState.noteRef.t;
}
function vocabFor(p) {
  const codes = p.videos.map(v => videoCode(p, v)).join(', ');
  const nomes = p.pessoas.map(x => x.nome).filter(Boolean).slice(0, 20).join(', ');
  return `Notas faladas no set de filmagem, em português do Brasil, para o editor. Projeto: ${projName(p)}. Vídeos: ${codes}. Termos comuns: cena, subcena, take, plano, arquivo, editor, valendo, refazer, diálogo, lettering, apresentador, câmera A, câmera B. Nomes de arquivo como A001_C012. ${nomes ? 'Equipe: ' + nomes + '.' : ''}`;
}
const aiRunning = new Set();
async function aiTranscribeNote(p, note, fromReview) {
  if (aiRunning.has(note.id)) return;
  const blob = await store.getBlob(note.audioId); if (!blob) return;
  aiRunning.add(note.id);
  const prev = note.transcricao; note.transcricao = 'processando';
  if (fromReview && recState?.phase === 'revisao') renderReview();
  try {
    const text = spokenPunctuation(await transcribeBlob(blob, vocabFor(p)));
    if (text) {
      const userEdited = fromReview && recState?.edited && recState.noteRef?.n === note.id;
      note.rascunho = note.rascunho || note.texto;
      if (!userEdited && prev !== 'manual') note.texto = text; else note.textoIA = text;
      note.transcricao = userEdited ? 'manual' : 'ia';
      if (!note.rascunho && !userEdited) {
        // nothing was captured live: try to route the note by what the AI heard
        const tgt = recState?.noteRef?.n === note.id ? recState.noteRef.t : null;
        if (tgt && !tgt.c) { const r = resolveSpoken(p, text, tgt); if (r?.t) { const h = noteHost(p, tgt); h.notas.splice(h.notas.indexOf(note), 1); const nh = noteHost(p, r.t); nh.notas.push(note); if (nh.status === 'pendente') nh.status = 'gravada'; touch(nh, p, r.t.v); recState.noteRef.t = r.t; toast(r.msg); } }
      }
    } else note.transcricao = prev === 'pendente' ? 'pendente' : 'navegador';
    delete note.erro;
  } catch (e) {
    note.transcricao = 'erro'; note.erro = e.status === 401 ? 'código de acesso incorreto (veja Configurações)' : (e.name === 'AbortError' ? 'tempo esgotado' : e.message);
  }
  aiRunning.delete(note.id);
  save(p);
  if (recState?.phase === 'revisao' && recState.noteRef?.n === note.id) { const ta = $('#revText'); if (!(recState.edited && ta)) renderReview(); }
  if (!sheet.isOpen) render();
}
async function processAiQueue() {
  if (!aiConfigured() || !navigator.onLine) return;
  for (const p of S.projetos) for (const n of allNotes(p)) if (n.audioId && ['pendente', 'navegador', 'erro'].includes(n.transcricao) && !aiRunning.has(n.id) && !(n.transcricao === 'erro' && /código/.test(n.erro || ''))) await aiTranscribeNote(p, n, false);
}
addEventListener('online', () => { processAiQueue(); scheduleAutoSync(1500); });

/* ---------- media ---------- */
let mediaTarget = null, camRec = null;
function openMediaSheet(t) {
  mediaTarget = t;
  const p = P(); const u = t && t.c ? findUnit(p, t) : null; const v = t && findVideo(p, t.v);
  sheet.open(`<h3>${u ? `Foto ou vídeo · ${esc(videoCode(p, v))} cena ${esc(u.numero)}` : 'Foto ou vídeo da diária'}</h3>
    <div class="evbtns"><button class="btn" data-act="cap-photo">${IC.cam}Tirar foto</button><button class="btn" data-act="cap-video">${IC.video}Gravar vídeo (720p)</button><button class="btn" data-act="cap-gallery">${IC.upload}Escolher da galeria</button></div>
    <div class="muted" style="font-size:12.5px">Vídeos gravados aqui ficam em 720p, uns 15 MB por minuto. Vídeos da galeria entram no tamanho original.</div>
    <div class="row"><span class="spacer"></span><button class="btn" data-act="sheet-close">Cancelar</button></div>`);
}
async function addMediaFiles(files) {
  const p = P(); if (!p) return;
  const t = mediaTarget || {}; let last = null;
  for (const f of files) {
    try {
      const isVid = /^video\//.test(f.type) || /\.(mp4|mov|webm|m4v)$/i.test(f.name);
      let rec;
      if (isVid) { const pv = await videoPoster(f); rec = { blob: f, thumb: pv.thumb, tw: pv.tw, th: pv.th, dur: pv.dur }; }
      else rec = await processPhoto(f);
      last = await saveMedia(p, t, isVid ? 'video' : 'foto', rec.blob, rec);
      if (isVid && f.size > 150 * 1048576) toast(`Vídeo grande (${fmtBytes(f.size)}): o envio ao Drive pode demorar no 4G.`, 5000);
    } catch (e) { toast('Não foi possível adicionar: ' + (e?.message || e)); }
  }
  if (last) openMediaViewer(last.id, true); else sheet.close();
}
async function saveMedia(p, t, tipo, blob, info) {
  const id = uid(), blobId = 'm_' + id;
  await store.putBlob(blobId, blob);
  const m = { id, tipo, mime: blob.type || (tipo === 'foto' ? 'image/jpeg' : 'video/webm'), criadaEm: nowIso(), legenda: '', v: t.v || null, c: t.c || null, s: t.s || null, diariaId: currentDiariaId(p, t.v), blobId, thumb: info.thumb || '', tw: info.tw || 0, th: info.th || 0, size: blob.size, dur: info.dur || 0, dev: DEVICE };
  p.midias.push(m);
  if (t.c) { const u = findUnit(p, t); if (u) touch(u, p, t.v); }
  save(p, true); render();
  return m;
}
async function openVideoCam() {
  sheet.open(`<div class="camwrap"><video id="camv" playsinline muted></video><div class="recind off" id="camind"><span class="led"></span><span id="camtime">PRONTO</span></div></div>
    <div class="row"><span class="muted mono" id="camsize" style="font-size:12.5px"></span><span class="spacer"></span><button class="btn" data-act="cam-cancel">Cancelar</button><button class="btn rec" data-act="cam-toggle" id="camBtn">${IC.video}Gravar</button></div>`, () => { camRec?.close(); camRec = null; });
  camRec = new VideoRecorder();
  try { await camRec.open($('#camv')); }
  catch (e) { sheet.close(); toast(e?.name === 'NotAllowedError' ? 'O navegador bloqueou a câmera. Libere a câmera nas permissões do site.' : 'Não foi possível abrir a câmera.'); }
}
let camTick = null;
async function camToggle() {
  if (!camRec) return;
  const btn = $('#camBtn');
  if (!camRec.mr || camRec.mr.state === 'inactive') {
    camRec.start(); $('#camind').classList.remove('off'); btn.innerHTML = 'Parar e salvar';
    camTick = setInterval(() => { const tt = $('#camtime'); if (tt) tt.textContent = 'REC ' + mmss(Date.now() - camRec.t0); const sz = $('#camsize'); if (sz) sz.textContent = fmtBytes(camRec.size); }, 500);
    return;
  }
  clearInterval(camTick); btn.disabled = true; btn.textContent = 'Salvando…';
  const blob = await camRec.stop(); const dur = (Date.now() - camRec.t0) / 1000;
  const pv = blob ? await videoPoster(blob) : {};
  const r = camRec; camRec = null; r.close();
  if (blob) { const m = await saveMedia(P(), mediaTarget || {}, 'video', blob, { ...pv, dur }); openMediaViewer(m.id, true); } else sheet.close();
}
const blobUrls = new Map();
async function blobUrl(id) { if (blobUrls.has(id)) return blobUrls.get(id); const b = await store.getBlob(id); if (!b) return null; const u = URL.createObjectURL(b); blobUrls.set(id, u); return u; }
async function openMediaViewer(mid, fresh) {
  const p = P(); const m = p?.midias.find(x => x.id === mid); if (!m) return;
  const url = m.blobId ? await blobUrl(m.blobId) : null;
  const u = m.c ? findUnit(p, m) : null; const v = findVideo(p, m.v);
  const src = url ? (m.tipo === 'video' ? `<video src="${url}" controls playsinline></video>` : `<img src="${url}" alt="">`) : (m.thumb ? `<img src="${m.thumb}" alt="">` : '');
  sheet.open(`<div class="row"><h3>${m.tipo === 'video' ? 'Vídeo' : 'Foto'}${u ? ` · ${esc(videoCode(p, v))} cena ${esc(u.numero)}` : ''}</h3><span class="spacer"></span><span class="muted mono" style="font-size:12px">${hhmm(m.criadaEm)} · ${fmtBytes(m.size || 0)}</span></div>
    <div class="viewer">${src}</div>
    ${!url && m.driveLink ? `<a class="btn" href="${esc(m.driveLink)}" target="_blank" rel="noopener">${IC.drive}Abrir no Drive</a>` : ''}
    <div class="field"><label for="mLeg">Legenda</label><input class="inp" id="mLeg" value="${esc(m.legenda)}" placeholder="Ex.: reflexo na janela, cuidado na edição"></div>
    ${m.driveLink ? `<div class="muted" style="font-size:12.5px">Enviado ao Drive. <a href="${esc(m.driveLink)}" target="_blank" rel="noopener">Abrir no Drive</a></div>` : (drive.driveConfigured() ? '<div class="muted" style="font-size:12.5px">Ainda não enviado ao Drive.</div>' : '')}
    <div class="row">${S.confirm === 'del-media' ? `<div class="confirm">Excluir esta mídia? <button class="btn sm danger" data-act="media-del-yes" data-m="${m.id}">Excluir</button><button class="btn sm" data-act="media-del-no" data-m="${m.id}">Não</button></div>` : `<button class="btn danger" data-act="media-del" data-m="${m.id}">${IC.trash}Excluir</button>`}<span class="spacer"></span>${fresh ? `<button class="btn" data-act="media-more">${IC.cam}Outra</button>` : ''}<button class="btn primary" data-act="media-ok" data-m="${m.id}">Pronto</button></div>`);
}

/* ---------- plan: picker, events, prep editor, drag ---------- */
function openPicker(extra) {
  const p = P(), d = Dd(); if (!p || !d) return;
  const inPlan = t => d.plano.some(i => i.k === 'cena' && sameT(i, t));
  const hideDone = S.pickHide !== false;
  sheet.open(`<div class="row"><h3>${extra ? 'Cena fora do plano' : 'Adicionar cenas ao plano'}</h3><span class="spacer"></span><label class="row" style="gap:6px;font-size:13px"><input type="checkbox" id="pickHide" ${hideDone ? 'checked' : ''}> Ocultar valendo</label></div>
    <div class="picklist" id="picklist">${[...dayVideos(p, d), ...p.videos.filter(x => !dayVideos(p, d).includes(x))].map(v => `<div class="vh"><span class="vtag" style="--vc:${videoColor(p, v)}">${esc(videoCode(p, v))}</span>${esc(videoName(v))}</div>${v.cenas.flatMap(c => [{ u: c, t: { v: v.id, c: c.id, s: null } }, ...c.subcenas.map(s => ({ u: s, t: { v: v.id, c: c.id, s: s.id } }))]).filter(x => !hideDone || x.u.status !== 'valendo').map(x => { const dis = inPlan(x.t); return `<label class="${dis ? 'dis' : ''}"><input type="checkbox" value="${x.t.v}|${x.t.c}|${x.t.s || ''}" ${dis ? 'disabled checked' : ''}><span class="pn">${esc(x.u.numero)}</span><span class="pd">${esc([x.u.prep?.ambiente, x.u.prep?.plano, x.t.s ? x.u.descricao : excerpt(v.cenas.find(c => c.id === x.t.c))].filter(Boolean).join(' · '))}${x.u.status !== 'pendente' ? ` · ${STATUS_L[x.u.status]}` : ''}</span></label>`; }).join('')}`).join('')}</div>
    <div class="row"><button class="btn sm" data-act="pick-all">Marcar todas visíveis</button><span class="spacer"></span><button class="btn" data-act="sheet-close">Cancelar</button><button class="btn primary" data-act="pick-ok">Adicionar</button></div>`);
}
function openEventPicker() {
  sheet.open(`<h3>Adicionar evento ao plano</h3><div class="evbtns">${EVENTOS.map(([k, l, m]) => `<button class="btn" data-act="ev-add" data-val="${k}">${esc(l)} <span class="muted mono" style="font-size:12px">${m}′</span></button>`).join('')}</div><div class="row"><span class="spacer"></span><button class="btn" data-act="sheet-close">Cancelar</button></div>`);
}
function openPrepEditor(i) {
  const p = P(), d = Dd(); const it = d.plano[i]; const u = findUnit(p, it); if (!u) return;
  const v = findVideo(p, it.v);
  sheet.open(`<div class="row"><h3><span class="vtag" style="--vc:${videoColor(p, v)}">${esc(videoCode(p, v))}</span>Cena ${esc(u.numero)}</h3><span class="spacer"></span></div>
    <div class="excerpt" style="-webkit-line-clamp:4">${esc(unitExcerpt(p, it))}</div>
    <datalist id="ambientes">${[...new Set(p.videos.flatMap(x => units(x).map(y => y.prep?.ambiente).filter(Boolean)))].map(a => `<option value="${esc(a)}">`).join('')}</datalist>
    <div data-v="${it.v}" data-c="${it.c}" data-s="${it.s || ''}">${prepFields(u, 'pe-' + u.id)}</div>
    <div class="row"><span class="spacer"></span><button class="btn primary" data-act="sheet-close">Pronto</button></div>`, () => render());
}
function groupByAmbiente(p, d) {
  const evPos = d.plano.map((it, i) => it.k === 'ev' ? i : -1).filter(i => i > -1);
  const scenes = d.plano.filter(it => it.k === 'cena');
  const key = it => { const u = findUnit(p, it); return (u?.prep?.ambiente || '').trim().toLowerCase() || '~sem ambiente'; };
  const order = []; for (const s of scenes) { const k = key(s); if (!order.includes(k)) order.push(k); }
  const sub = it => { const u = findUnit(p, it); return `${u?.prep?.periodo === 'NOITE' ? 1 : 0}${u?.prep?.intext === 'EXT' ? 1 : 0}`; };
  const sorted = [...scenes].sort((a, b) => order.indexOf(key(a)) - order.indexOf(key(b)) || sub(a).localeCompare(sub(b)));
  const out = []; let si = 0;
  for (let i = 0; i < d.plano.length; i++) out.push(evPos.includes(i) ? d.plano[i] : sorted[si++]);
  d.plano = out;
}
// pointer-based drag to reorder plan strips
let drag = null;
document.addEventListener('pointerdown', e => {
  const g = e.target.closest('.strip .grip'); if (!g) return;
  const el = g.closest('.strip'); const list = $('#strips'); if (!list) return;
  e.preventDefault();
  const items = $$('.strip', list);
  drag = { el, list, from: +el.dataset.i, startY: e.clientY, rects: items.map(x => x.getBoundingClientRect()), items, to: +el.dataset.i };
  el.classList.add('dragging'); g.setPointerCapture?.(e.pointerId);
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const dy = e.clientY - drag.startY; drag.el.style.transform = `translateY(${dy}px)`;
  const r0 = drag.rects[drag.from]; const mid = r0.top + r0.height / 2 + dy;
  let to = drag.from;
  drag.rects.forEach((r, i) => { const m = r.top + r.height / 2; if (i < drag.from && mid < m) to = Math.min(to, i); if (i > drag.from && mid > m) to = Math.max(to, i); });
  drag.to = to;
  const h = r0.height + 6;
  drag.items.forEach((x, i) => { if (x === drag.el) return; let sh = 0; if (drag.from < to && i > drag.from && i <= to) sh = -h; if (drag.from > to && i >= to && i < drag.from) sh = h; x.style.transform = sh ? `translateY(${sh}px)` : ''; x.style.transition = 'transform .12s'; });
  if (e.clientY < 70) scrollBy(0, -12); else if (e.clientY > innerHeight - 90) scrollBy(0, 12);
});
const endDrag = () => {
  if (!drag) return; const { from, to } = drag; drag = null;
  const p = P(), d = Dd(); if (d && from !== to) { const [it] = d.plano.splice(from, 1); d.plano.splice(to, 0, it); save(p); }
  render();
};
document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag);

/* ============================== Drive sync ============================== */
let autoT = null;
let fullT = null;
function scheduleAutoSync(ms = 3000) {
  clearTimeout(autoT); if (!drive.driveConnected() || !navigator.onLine) return;
  autoT = setTimeout(() => { const p = P(); if (p && !S.sync.busy && drive.driveConnected()) syncData(p); }, ms);
  clearTimeout(fullT); fullT = setTimeout(() => { const p = P(); if (p && !S.sync.busy && drive.driveConnected() && pendingCount(p) > (S.dirty.has(p.id) ? 1 : 0)) syncProject(p, false); }, 90000);
}
/* ---------- live data sync between devices (project JSON on Drive, merged 3-way) ---------- */
let dataBusy = false;
function applyInPlace(p, m) { for (const k of Object.keys(p)) if (!(k in m)) delete p[k]; Object.assign(p, m); }
function renderSoon() {
  const ae = document.activeElement;
  const typing = ae && ae.closest && (ae.closest('#app') || ae.closest('#sheetRoot')) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
  if (typing || sheet.isOpen || recState || drag) { S.renderPending = true; return; }
  S.renderPending = false; render();
}
document.addEventListener('focusout', () => setTimeout(() => { if (S.renderPending) renderSoon(); }, 300));
async function syncData(p, interactive = false) {
  if (!p || dataBusy || !drive.driveConfigured() || !navigator.onLine) return false;
  if (!drive.driveConnected()) { if (!interactive) return false; try { await drive.connect(true); } catch (e) { toast(e.message); return false; } }
  if (!p.drive?.folderId || !p.drive?.files?.dados) { if (!S.sync.busy) syncProject(p, interactive); return false; }
  dataBusy = true; let changed = false;
  try {
    const before = comparable(p);
    const meta = await drive.fileMeta(p.drive.files.dados);
    if (meta.trashed) throw Object.assign(new Error('gone'), { code: 'notfound' });
    const ver = await store.getMeta('ver:' + p.id);
    let base = await store.getMeta('base:' + p.id);
    let remoteState = base;
    if (String(meta.version) !== String(ver)) {
      const remote = (await drive.downloadJson(p.drive.files.dados))?.projeto;
      if (remote?.id === p.id) {
        normalizeProject(remote); remoteState = remote;
        const merged = merge3(base ? normalizeProject(base) : undefined, JSON.parse(JSON.stringify(p)), remote);
        applyInPlace(p, merged); normalizeProject(p);
        changed = comparable(p) !== before;
      }
    }
    let version = meta.version;
    if (!remoteState || comparable(p) !== comparable(remoteState)) {
      p.drive.syncedAt = nowIso();
      const data = new Blob([JSON.stringify({ formato: 'relatorio-de-set', versao: 3, projeto: p })], { type: 'application/json' });
      const r = await drive.upload({ name: `${projName(p)} – dados do app.json`, blob: data, parentId: p.drive.folderId, fileId: p.drive.files.dados, appProperties: { rds: 'projeto', pid: p.id } });
      p.drive.files.dados = r.id; version = r.version ?? (await drive.fileMeta(r.id)).version;
    }
    await store.setMeta('base:' + p.id, JSON.parse(JSON.stringify(p)));
    await store.setMeta('ver:' + p.id, String(version));
    await store.putProject(clone(p));
    S.dirty.delete(p.id);
    if (changed) { renderSoon(); toast('Atualizado com alterações de outro aparelho.', 2500); } else setTopChip();
    return true;
  } catch (e) {
    if (e.code === 'notfound' && p.drive?.files) { p.drive.files.dados = null; }
    else if (e.code !== 'auth') console.warn('sync', e);
    setTopChip(); return false;
  } finally { dataBusy = false; }
}
setInterval(() => { const p = P(); if (p && document.visibilityState === 'visible' && navigator.onLine && drive.driveConnected() && !S.sync.busy) syncData(p); }, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { const p = P(); if (p && drive.driveConnected()) syncData(p); } });
const noteFileName = (p, v, u, n) => `${slug(videoCode(p, v))}_${u ? 'cena-' + u.numero : 'geral'}_${ymdOf(n.criadaEm)}_${hhmm(n.criadaEm).replace(':', 'h')}.${extFor(n.mime || 'audio/webm')}`;
async function syncProject(p, interactive = true) {
  if (!p || S.sync.busy) return;
  if (!drive.driveConfigured()) { toast('O Google Drive ainda não foi configurado neste site.'); return; }
  if (!navigator.onLine) { toast('Sem internet. Os arquivos ficam no aparelho e vão para o Drive quando a conexão voltar.'); return; }
  try { if (!drive.driveConnected()) { if (!interactive) return; await drive.connect(true); } }
  catch (e) { toast(e.message || String(e), 5000); return; }
  S.sync.busy = true; setTopChip();
  const step = msg => { S.sync.msg = msg; setTopChip(); };
  let errors = 0;
  try {
    step('Preparando pastas…');
    const rootId = await store.getMeta('driveRoot');
    const root = await drive.ensureFolder(CONFIG.driveRootName, 'root', rootId); await store.setMeta('driveRoot', root.id);
    p.drive ||= {}; p.drive.files ||= {}; p.drive.sub ||= {};
    const pf = await drive.ensureFolder(projName(p), root.id, p.drive.folderId);
    p.drive.folderId = pf.id; p.drive.folderLink = drive.folderUrl(pf.id);
    for (const [k, name] of [['midias', 'Fotos e vídeos'], ['audios', 'Áudios das notas'], ['relatorios', 'Relatórios']]) { const f = await drive.ensureFolder(name, pf.id, p.drive.sub[k]); p.drive.sub[k] = f.id; }
    save(p, true);
    // audio notes
    for (const v of p.videos) for (const host of [v, ...units(v)]) for (const n of host.notas) {
      if (!n.audioId || n.driveId) continue;
      const b = await store.getBlob(n.audioId); if (!b) continue;
      step(`Enviando áudio ${hhmm(n.criadaEm)}…`);
      try { const r = await drive.upload({ name: noteFileName(p, v, host === v ? null : host, n), blob: b, parentId: p.drive.sub.audios }); n.driveId = r.id; n.driveLink = r.webViewLink; save(p); } catch (e) { errors++; if (e.code === 'auth') throw e; }
    }
    // photos and videos
    for (const m of p.midias) {
      if (m.driveId) continue;
      const b = m.blobId ? await store.getBlob(m.blobId) : null; if (!b) continue;
      const v = findVideo(p, m.v); const u = m.c ? findUnit(p, m) : null;
      const name = `${v ? slug(videoCode(p, v)) + '_' : ''}${u ? 'cena-' + u.numero + '_' : 'diaria_'}${ymdOf(m.criadaEm)}_${hhmm(m.criadaEm).replace(':', 'h')}_${m.id.slice(-4)}.${extFor(m.mime)}`;
      try { await drive.upload({ name, blob: b, parentId: p.drive.sub.midias, onProgress: f => step(`Enviando ${m.tipo} ${Math.round(f * 100)}%…`) }).then(r => { m.driveId = r.id; m.driveLink = r.webViewLink; }); save(p); } catch (e) { errors++; if (e.code === 'auth') throw e; }
    }
    // PDFs (same file each time: Drive keeps the history of versions)
    step('Atualizando relatórios…');
    const putPdf = async (key, name, blob) => { const r = await drive.upload({ name, blob, parentId: p.drive.sub.relatorios, fileId: p.drive.files[key] }); p.drive.files[key] = r.id; };
    await putPdf('projeto', `Relatório do projeto – ${projName(p)}.pdf`, projectReportPdf(p));
    for (const d of p.diarias) {
      const base = `${d.data} ${diariaLabel(p, d)}`;
      if (d.plano.length) await putPdf('od-' + d.id, `${base} – Ordem do dia.pdf`, callSheetPdf(p, d));
      if (d.plano.length || unitsDoneIn(p, d).length) await putPdf('rel-' + d.id, `${base} – Relatório.pdf`, diariaReportPdf(p, d));
    }
    // project data (to open on another device)
    step('Salvando dados do projeto…');
    if (!p.drive.files.dados) {
      p.drive.syncedAt = nowIso();
      const data = new Blob([JSON.stringify({ formato: 'relatorio-de-set', versao: 3, projeto: p })], { type: 'application/json' });
      const r = await drive.upload({ name: `${projName(p)} – dados do app.json`, blob: data, parentId: p.drive.folderId, appProperties: { rds: 'projeto', pid: p.id } });
      p.drive.files.dados = r.id;
      await store.setMeta('base:' + p.id, JSON.parse(JSON.stringify(p))); await store.setMeta('ver:' + p.id, String(r.version ?? ''));
      S.dirty.delete(p.id); await store.putProject(clone(p));
    } else { while (dataBusy) await new Promise(r => setTimeout(r, 200)); await syncData(p); }
    toast(errors ? `Drive atualizado, mas ${errors} arquivo(s) falharam. Tente de novo.` : 'Projeto salvo no Google Drive.');
  } catch (e) {
    toast(e.message || String(e), 5000);
  }
  S.sync.busy = false; S.sync.msg = ''; render();
}
function setTopChip() { const acts = $('#topacts'); if (!acts) return; const old = acts.querySelector('.sync'); const tmp = document.createElement('div'); tmp.innerHTML = syncChip(); const nu = tmp.firstElementChild; if (old && nu) old.replaceWith(nu); else if (nu && S.view !== 'inicio' && S.view !== 'config') acts.prepend(nu); }
async function openFromDrive() {
  try { if (!drive.driveConnected()) await drive.connect(true); } catch (e) { toast(e.message); return; }
  sheet.open('<h3>Projetos no Drive</h3><div class="muted">Carregando…</div>');
  try {
    const files = await drive.listProjects();
    sheet.open(`<h3>Projetos no Drive</h3>${files.length ? `<div class="card-list">${files.map(f => `<button class="pcard" data-act="drive-load" data-id="${esc(f.id)}"><span class="t" style="font-size:17px">${esc(f.name.replace(/ – dados do app\.json$/, ''))}</span><span class="s">Atualizado em ${esc(new Date(f.modifiedTime).toLocaleString('pt-BR'))}</span></button>`).join('')}</div>` : '<div class="empty">Nenhum projeto salvo pelo app no seu Drive ainda.</div>'}<div class="row"><span class="spacer"></span><button class="btn" data-act="sheet-close">Fechar</button></div>`);
  } catch (e) { sheet.close(); toast(e.message); }
}
async function loadFromDrive(id) {
  try {
    const j = await drive.downloadJson(id);
    const rp = j?.projeto; if (!rp?.id || !Array.isArray(rp.videos)) throw new Error('Arquivo de projeto inválido.');
    normalizeProject(rp);
    const local = S.projetos.find(x => x.id === rp.id);
    if (local) { sheet.close(); go('p-' + rp.id); await syncData(local, true); toast('Projeto atualizado com a versão do Drive.'); return; }
    rp.drive = { ...(rp.drive || {}), files: { ...(rp.drive?.files || {}), dados: id } };
    S.projetos.push(rp);
    const meta = await drive.fileMeta(id).catch(() => ({}));
    await store.setMeta('base:' + rp.id, JSON.parse(JSON.stringify(rp))); await store.setMeta('ver:' + rp.id, String(meta.version ?? ''));
    await store.putProject(clone(rp)); sheet.close(); toast('Projeto aberto do Drive. A partir de agora ele se atualiza sozinho entre os aparelhos.'); go('p-' + rp.id);
  } catch (e) { toast(e.message || String(e)); }
}

/* ============================== events ============================== */
function tFromEl(el) { const h = el.closest('[data-c]'); if (!h) return null; return { v: h.dataset.v, c: h.dataset.c, s: h.dataset.s || null }; }
const fileInput = (accept, capture, multiple, onFiles) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; if (capture) i.setAttribute('capture', capture); i.multiple = !!multiple; i.className = 'vis-hidden'; i.onchange = () => { const fs = [...i.files]; i.remove(); if (fs.length) onFiles(fs); }; document.body.appendChild(i); i.click(); };
async function savePdf(name, blob, share) {
  if (share && navigator.canShare) { const f = new File([blob], name, { type: 'application/pdf' }); if (navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: name }); } catch {} return; } }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function playAudio(btn, id) {
  const holder = btn.closest('.note') || btn.closest('li') || btn.parentElement;
  const ex = holder.querySelector('audio'); if (ex) { ex.play().catch(() => {}); return; }
  const url = await blobUrl(id);
  if (!url) { const n = S.projetos.flatMap(allNotes).find(x => x.audioId === id); if (n?.driveLink) window.open(n.driveLink, '_blank', 'noopener'); else toast('Áudio não encontrado neste aparelho.'); return; }
  const a = document.createElement('audio'); a.controls = true; a.src = url; holder.appendChild(a); a.play().catch(() => {});
}

document.addEventListener('click', async e => {
  if (e.target.matches?.('[data-scrim]') && !recState?.phase?.match(/rec|salvando/) && !camRec) { if (recState?.phase === 'revisao') commitReview(); sheet.close(); render(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act; const p = P(); const d = Dd();
  if (b.tagName === 'A' && b.getAttribute('href') === '#') e.preventDefault();
  switch (act) {
    case 'go': go(b.dataset.h); break;
    case 'new-project': { const np = newProject(); S.projetos.push(np); save(np, true); S.ptab = 'videos'; go('p-' + np.id); break; }
    case 'ptab': S.ptab = b.dataset.v; render(); break;
    case 'dtab': S.dtab = b.dataset.v; S.confirm = null; render(); break;

    case 'repkind': S.repKind = b.dataset.v; render(); break;
    case 'filter': S.filter = b.dataset.v; render(); break;
    case 'ask': S.confirm = b.dataset.c; render(); break;
    case 'confirm-no': S.confirm = null; render(); break;
    case 'del-project-yes': { S.projetos = S.projetos.filter(x => x.id !== p.id); await store.delProject(p.id); go(''); toast('Projeto excluído deste aparelho.'); break; }
    case 'del-video-yes': { p.videos = p.videos.filter(x => x.id !== S.vId); for (const dd of p.diarias) dd.plano = dd.plano.filter(i => i.k !== 'cena' || i.v !== S.vId); save(p, true); go('p-' + p.id); break; }

    case 'add-docx': fileInput('.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', null, true, fs => importDocx(fs)); break;
    case 'add-video-manual': { const v = newVideo(); prefillFicha(p, v); v.cab.titulo = 'Vídeo ' + (p.videos.length + 1); for (let i = 1; i <= 5; i++) { const c = newCena(i); c.manual = true; v.cenas.push(c); } v.cab.cenas = '5'; p.videos.push(v); save(p, true); go(`v-${p.id}-${v.id}`); toast('Vídeo criado com 5 cenas. Ajuste o cabeçalho e adicione cenas se precisar.'); break; }
    case 'add-cena': { const v = V(); const max = Math.max(0, ...v.cenas.map(c => parseInt(c.numero, 10) || 0)); const c = newCena(max + 1); c.manual = true; c.stamps = ['adicionada']; v.cenas.push(c); save(p); render(); toast(`Cena ${c.numero} adicionada.`); break; }

    case 'add-pessoa': p.pessoas.push({ id: uid(), nome: '', funcao: '' }); save(p); render(); $$('[data-pe-f="nome"]').pop()?.focus(); break;
    case 'del-pessoa': { const id = b.closest('[data-pe]').dataset.pe; p.pessoas = p.pessoas.filter(x => x.id !== id); for (const v of p.videos) v.ficha.equipe = v.ficha.equipe.filter(e2 => e2.pessoaId !== id); save(p); render(); break; }
    case 'eq-add': V().ficha.equipe.push({ id: uid(), pessoaId: null, funcao: '' }); S.fichaOpen = true; save(p); render(); $$('[data-eq-f="nome"]').pop()?.focus(); break;
    case 'eq-quick': { const pe = p.pessoas.find(x => x.id === b.dataset.pe); V().ficha.equipe.push({ id: uid(), pessoaId: pe.id, funcao: pe.funcao || '' }); S.fichaOpen = true; save(p); render(); break; }
    case 'eq-del': { const id = b.closest('[data-eq]').dataset.eq; const f = V().ficha; f.equipe = f.equipe.filter(x => x.id !== id); S.fichaOpen = true; save(p); render(); break; }
    case 'eq-copy': { const v = V(); const src = [...p.videos].filter(x => x !== v && x.ficha.equipe.length).sort((a, b2) => (b2.ficha.data || '').localeCompare(a.ficha.data || ''))[0]; if (src) { for (const e2 of src.ficha.equipe) if (!v.ficha.equipe.some(x => x.pessoaId === e2.pessoaId)) v.ficha.equipe.push({ id: uid(), pessoaId: e2.pessoaId, funcao: e2.funcao }); S.fichaOpen = true; save(p); render(); toast(`Equipe copiada de ${videoCode(p, src)}.`); } break; }
    case 'eqp-add': { V().ficha.equipamentos.push({ id: uid(), cat: 'Câmera', item: '', qtd: 1 }); S.fichaOpen = true; save(p); render(); $$('[data-eqp-f="item"]').pop()?.focus(); break; }
    case 'eqp-del': { const id = b.closest('[data-eqp]').dataset.eqp; const f = V().ficha; f.equipamentos = f.equipamentos.filter(x => x.id !== id); S.fichaOpen = true; save(p); render(); break; }
    case 'kit-save-ok': { const nome = ($('#kitName')?.value || '').trim() || 'Kit ' + (S.kits.length + 1); const itens = V().ficha.equipamentos.filter(e2 => e2.item.trim()).map(({ cat, item, qtd }) => ({ cat, item, qtd })); S.kits.push({ id: uid(), nome, itens }); await store.setMeta('kits', S.kits); S.confirm = null; S.fichaOpen = true; render(); toast(`Kit “${nome}” salvo neste aparelho.`); break; }
    case 'ficha-all-yes': { const src = V().ficha; for (const x of p.videos) { if (x === V()) continue; Object.assign(x.ficha, { data: src.data, tipo: src.tipo, local: src.local, endereco: src.endereco, geo: src.geo ? { ...src.geo } : null, equipe: src.equipe.map(e2 => ({ ...e2, id: uid() })), equipamentos: src.equipamentos.map(e2 => ({ ...e2, id: uid() })), formato: src.formato ? { ...src.formato } : null }); } if (src.data) ensureDay(p, src.data); S.confirm = null; save(p, true); render(); toast(`Ficha aplicada a ${p.videos.length - 1} vídeo(s).`); break; }
    case 'prep-all': openPrepAll(tFromEl(b)); break;
    case 'prep-all-ok': applyPrepAll(); break;
    case 'script-edit': { S.editScript = tFromEl(b).c; render(); setTimeout(() => $(`#se-txt-${S.editScript}`)?.focus(), 50); break; }
    case 'script-cancel': S.editScript = null; render(); break;
    case 'script-save': case 'script-restore': {
      const t = tFromEl(b); const c = findUnit(p, { v: t.v, c: t.c });
      const snap = () => ({ imagem: c.imagem, texto: c.texto, imagemTxt: c.imagemTxt || '', textoTxt: c.textoTxt || '', complementos: (c.complementos || []).map(x => ({ ...x })) });
      const sameAsOriginal = () => { const o = c.original; return o && o.imagemTxt === c.imagemTxt && o.textoTxt === c.textoTxt && JSON.stringify((o.complementos || c.complementos).map(x => [x.imagemTxt || '', x.textoTxt || ''])) === JSON.stringify(c.complementos.map(x => [x.imagemTxt || '', x.textoTxt || ''])); };
      if (act === 'script-restore') { if (c.original) { Object.assign(c, { imagem: c.original.imagem, texto: c.original.texto, imagemTxt: c.original.imagemTxt, textoTxt: c.original.textoTxt }); if (c.original.complementos) c.complementos = c.original.complementos.map(x => ({ ...x })); delete c.original; c.stamps = c.stamps.filter(k => k !== 'dialogo'); } }
      else {
        const val = id => ($(`#${id}`)?.value ?? '').replace(/\s+$/g, '');
        const edits = [{ o: c, img: val(`se-img-${c.id}`), txt: val(`se-txt-${c.id}`) }, ...(c.complementos || []).map((x, i) => ({ o: x, img: val(`se-img-${c.id}-${i}`), txt: val(`se-txt-${c.id}-${i}`) }))];
        if (edits.some(e => e.img !== (e.o.imagemTxt || '') || e.txt !== (e.o.textoTxt || ''))) {
          if (!c.original) c.original = { ...snap(), em: nowIso() };
          else if (!c.original.complementos) c.original.complementos = (c.complementos || []).map(x => ({ ...x }));
          for (const e of edits) { if (e.img !== (e.o.imagemTxt || '')) { e.o.imagemTxt = e.img; e.o.imagem = textToHtml(e.img); } if (e.txt !== (e.o.textoTxt || '')) { e.o.textoTxt = e.txt; e.o.texto = textToHtml(e.txt); } }
          if (sameAsOriginal()) { delete c.original; c.stamps = c.stamps.filter(k => k !== 'dialogo'); }
          else { if (!c.stamps.includes('dialogo')) c.stamps.push('dialogo'); touch(c, p, t.v); }
        }
      }
      S.editScript = null; save(p); render(); toast(act === 'script-restore' ? 'Texto original restaurado.' : 'Texto do roteiro atualizado. O original fica guardado no relatório.'); break;
    }
    case 'pdf-video': case 'share-video': { const v = V(); await savePdf(`${videoCode(p, v)} – Relatório – ${slug(projName(p))}.pdf`, videoReportPdf(p, v, { hideEmpty: S.hideEmpty }), act === 'share-video'); break; }
    case 'geo': {
      if (!navigator.geolocation) { toast('Este navegador não informa a localização.'); break; }
      b.disabled = true; b.textContent = 'Localizando…';
      navigator.geolocation.getCurrentPosition(pos => { S.fichaOpen = true; V().ficha.geo = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, em: nowIso() }; save(p); render(); toast('Localização registrada.'); },
        err => { toast(err.code === 1 ? 'A localização foi bloqueada. Libere nas permissões do site.' : 'Não foi possível obter a localização.'); render(); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
      break;
    }
    case 'geo-clear': V().ficha.geo = null; save(p); render(); break;
    case 'select': { S.active = tFromEl(b); render(); break; }
    case 'rec': { const t = tFromEl(b); S.active = t; renderDock(); $$('.scene.active,.sub.active').forEach(el => el.classList.remove('active')); b.closest('[data-c]').classList.add('active'); startRecording(t, true); break; }
    case 'rec-dock': startRecording(null, false); break;
    case 'rec-general': startRecording({ v: b.dataset.v, c: null, s: null }, true); break;
    case 'rec-stop': stopRecording(false); break;
    case 'rec-cancel': stopRecording(true); break;
    case 'sheet-close': if (recState?.phase === 'revisao') commitReview(); sheet.close(); render(); break;
    case 'status': { const t = tFromEl(b); const u = findUnit(p, t); u.status = b.dataset.val; touch(u, p, t.v); save(p); render(); break; }
    case 'stamp': { const t = tFromEl(b); const u = findUnit(p, t); const k = b.dataset.val; u.stamps = u.stamps.includes(k) ? u.stamps.filter(s => s !== k) : [...u.stamps, k]; touch(u, p, t.v); save(p); render(); break; }
    case 'stamps-open': { const t = tFromEl(b); const key = `${t.v}|${t.c}|${t.s || ''}`; S.openStamps.has(key) ? S.openStamps.delete(key) : S.openStamps.add(key); render(); break; }

    case 'script': { const t = tFromEl(b); S.openScript.has(t.c) ? S.openScript.delete(t.c) : S.openScript.add(t.c); render(); break; }
    case 'add-sub': { const t = tFromEl(b); const c = findUnit(p, { v: t.v, c: t.c }); const s = newUnit(nextSubNum(c), { descricao: '' }); s.stamps = ['adicionada']; s.prep = { ...c.prep, tempo: '' }; c.subcenas.push(s); S.active = { v: t.v, c: t.c, s: s.id }; save(p); render(); toast(`Subcena ${s.numero} criada.`); break; }
    case 'del-unit-yes': { const t = tFromEl(b); const v = findVideo(p, t.v); if (t.s) { const c = v.cenas.find(x => x.id === t.c); c.subcenas = c.subcenas.filter(s => s.id !== t.s); } else v.cenas = v.cenas.filter(c => c.id !== t.c); for (const dd of p.diarias) dd.plano = dd.plano.filter(i => i.k !== 'cena' || !(i.v === t.v && i.c === t.c && (!t.s || i.s === t.s))); if (S.active && sameT(S.active, t)) S.active = null; S.confirm = null; save(p); render(); break; }
    case 'play': playAudio(b, b.dataset.a); break;
    case 'note-edit': { const n = b.closest('.note'); recState = { phase: 'revisao', noteRef: { t: { v: n.dataset.nv, c: n.dataset.nc || null, s: n.dataset.ns || null }, n: n.dataset.n }, problems: new Set() }; renderReview(); break; }
    case 'rev-ok': commitReview(); sheet.close(); render(); break;
    case 'rev-again': { const t = commitReview(); sheet.close(); render(); startRecording(t && t.c ? t : null, !!(t && t.c)); break; }
    case 'rev-del': { const { host, note } = findNote(p, recState.noteRef); if (note) { if (note.audioId) store.delBlob(note.audioId); host.notas.splice(host.notas.indexOf(note), 1); save(p); } sheet.close(); render(); toast('Nota excluída.'); break; }
    case 'retranscribe': { const { note } = findNote(p, recState.noteRef); if (note) { note.transcricao = 'navegador'; aiTranscribeNote(p, note, true); } break; }
    case 'sug': { const u = findUnit(p, recState.noteRef.t); if (!u) break; const k = b.dataset.k, val = b.dataset.val; if (k === 'arq') { if (camCount(u) > 1) { u.arquivosCam ||= {}; const n = camCount(u); let L = null; for (let i = 0; i < n; i++) { const c0 = camLetter(i); if (!(u.arquivosCam[c0] ?? (i === 0 ? u.arquivos : '')).trim()) { L = c0; break; } } L ||= 'A'; u.arquivosCam[L] = [(u.arquivosCam[L] || '').trim(), val].filter(Boolean).join(', '); } else u.arquivos = [u.arquivos.trim(), val].filter(Boolean).join('\n'); } if (k === 'st') u.status = val; if (k === 'stamp' && !u.stamps.includes(val)) u.stamps.push(val); touch(u, p, recState.noteRef.t.v); b.disabled = true; b.textContent = 'Feito'; save(p); break; }
    case 'media': { const t = b.dataset.general ? { v: null, c: null, s: null } : b.dataset.dock ? (S.active || {}) : tFromEl(b); openMediaSheet(t); break; }
    case 'cap-photo': fileInput('image/*', 'environment', false, fs => addMediaFiles(fs)); break;
    case 'cap-gallery': fileInput('image/*,video/*', null, true, fs => addMediaFiles(fs)); break;
    case 'cap-video': if (navigator.mediaDevices?.getUserMedia && window.MediaRecorder) openVideoCam(); else fileInput('video/*', 'environment', false, fs => addMediaFiles(fs)); break;
    case 'cam-toggle': camToggle(); break;
    case 'cam-cancel': clearInterval(camTick); sheet.close(); break;
    case 'media-view': S.confirm = null; openMediaViewer(b.dataset.m); break;
    case 'media-ok': { const m = p.midias.find(x => x.id === b.dataset.m); if (m) { m.legenda = $('#mLeg')?.value.trim() || ''; save(p); } sheet.close(); render(); break; }
    case 'media-more': { const m = p.midias.find(x => x.id === $('[data-act="media-ok"]')?.dataset.m); if (m) { m.legenda = $('#mLeg')?.value.trim() || ''; save(p); } openMediaSheet(mediaTarget); break; }
    case 'media-del': S.confirm = 'del-media'; openMediaViewer(b.dataset.m); break;
    case 'media-del-no': S.confirm = null; openMediaViewer(b.dataset.m); break;
    case 'media-del-yes': { const m = p.midias.find(x => x.id === b.dataset.m); if (m) { if (m.blobId) store.delBlob(m.blobId); p.midias = p.midias.filter(x => x !== m); save(p); } S.confirm = null; sheet.close(); render(); toast(m?.driveId ? 'Mídia excluída do app. A cópia no Drive continua lá.' : 'Mídia excluída.'); break; }
    case 'plan-add': openPicker(!!b.dataset.extra); break;
    case 'pick-all': $$('#picklist input:not(:disabled)').forEach(x => { x.checked = true; }); break;
    case 'pick-ok': { const sel = $$('#picklist input:checked:not(:disabled)').map(x => parseTargetVal(x.value)); for (const t of sel) d.plano.push({ id: uid(), k: 'cena', v: t.v, c: t.c, s: t.s }); save(p); sheet.close(); render(); if (sel.length) toast(`${sel.length} cena${sel.length > 1 ? 's adicionadas' : ' adicionada'} ao plano.`); break; }
    case 'plan-ev': openEventPicker(); break;
    case 'ev-add': { const [k, l, m] = EVENTOS.find(x => x[0] === b.dataset.val); d.plano.push({ id: uid(), k: 'ev', tipo: k, titulo: l, min: m }); save(p); sheet.close(); render(); break; }
    case 'plan-del': { const i = +b.closest('.strip').dataset.i; d.plano.splice(i, 1); save(p); render(); break; }
    case 'plan-edit': openPrepEditor(+b.closest('.strip').dataset.i); break;
    case 'plan-group': groupByAmbiente(p, d); save(p); render(); toast('Cenas agrupadas por ambiente. Os eventos ficaram nas mesmas posições.'); break;
    case 'pdf-ordem': case 'share-ordem': await savePdf(`${d.data} ${diariaLabel(p, d)} – Ordem do dia – ${slug(projName(p))}.pdf`, callSheetPdf(p, d), act === 'share-ordem'); break;
    case 'pdf-rel': case 'share-rel': await savePdf(`${d.data} ${diariaLabel(p, d)} – Relatório – ${slug(projName(p))}.pdf`, diariaReportPdf(p, d), act === 'share-rel'); break;
    case 'pdf-proj': case 'share-proj': await savePdf(`Relatório do projeto – ${slug(projName(p))}.pdf`, projectReportPdf(p, { hideEmpty: S.hideEmpty }), act === 'share-proj'); break;
    case 'copy-text': { const txt = diariaText(p, d); try { await navigator.clipboard.writeText(txt); toast('Texto do relatório copiado.'); } catch { toast('Não foi possível copiar neste navegador.'); } break; }
    case 'open-day': { const d0 = ensureDay(p, b.dataset.date); const k = b.dataset.k; S.dtab = k === 'plano' ? 'plano' : 'relatorio'; S.repKind = k === 'ordem' ? 'ordem' : 'relatorio'; S.dId = d0.id; save(p, true); go(`d-${p.id}-${d0.id}`); break; }
    case 'sync': syncProject(p, true); break;
    case 'drive-on': try { await drive.connect(true); toast('Google Drive conectado.'); } catch (err) { toast(err.message); } render(); break;
    case 'drive-off': drive.disconnect(); render(); break;
    case 'drive-open': openFromDrive(); break;
    case 'drive-load': loadFromDrive(b.dataset.id); break;
    case 'pass-save': {
      setPasscode($('#passcode').value.trim()); const msg = $('#passMsg');
      if (!getPasscode()) { msg.textContent = 'Código removido. A IA não será usada.'; break; }
      msg.textContent = 'Testando…';
      try { const r = await fetch(CONFIG.transcribeEndpoint, { method: 'POST', headers: { 'x-rds-key': getPasscode() }, body: new FormData() }); const j = await r.json().catch(() => ({})); msg.textContent = r.status === 401 ? 'Código incorreto. Confira o valor de RDS_PASSCODE no Netlify.' : r.status === 400 ? 'Código correto. A transcrição por IA está ativa neste aparelho.' : r.status === 500 && /OPENAI/.test(j.error || '') ? 'Código correto, mas falta a chave da OpenAI no Netlify (OPENAI_API_KEY).' : `Resposta inesperada (${r.status}). ${j.error || ''}`; if (r.status === 400) processAiQueue(); }
      catch { msg.textContent = 'Não foi possível testar agora (sem internet ou site sem a função). O código ficou salvo.'; }
      break;
    }
    case 'free-space': {
      let n = 0, bytes = 0;
      for (const pp of S.projetos) { for (const m of pp.midias) if (m.driveId && m.blobId) { const bl = await store.getBlob(m.blobId); if (bl) { bytes += bl.size; await store.delBlob(m.blobId); } m.blobId = null; n++; } save(pp, true); }
      toast(n ? `${n} mídia(s) removidas do aparelho (${fmtBytes(bytes)}). Elas continuam no Drive.` : 'Nenhuma mídia já enviada ao Drive para remover.'); render(); break;
    }
    case 'export-backup': await exportBackup(p); break;
    case 'import-backup': fileInput('.json,application/json', null, false, fs => importBackup(fs[0])); break;
  }
});
document.addEventListener('input', e => {
  const el = e.target; const p = P(); if (!p) return;
  if (el.dataset.pj) { p[el.dataset.pj] = el.value; save(p); if (el.dataset.pj === 'nome' || el.dataset.pj === 'produtora') $('#crumb').textContent = projName(p); return; }
  if (el.dataset.cab) { V().cab[el.dataset.cab] = el.value; save(p); return; }
  if (el.dataset.dd) { const d = Dd(); d[el.dataset.dd] = el.value; save(p); return; }
  if (el.dataset.fi) { V().ficha[el.dataset.fi] = el.value; save(p); return; }
  if (el.dataset.eqpF) { const f = V().ficha; const row = f.equipamentos.find(x => x.id === el.closest('[data-eqp]').dataset.eqp); row[el.dataset.eqpF] = el.dataset.eqpF === 'qtd' ? Math.max(1, +el.value || 1) : el.value; save(p); return; }
  if (el.dataset.ucam) { const t = tFromEl(el); const u = findUnit(p, t); u.arquivosCam ||= {}; if (!('A' in u.arquivosCam) && u.arquivos) u.arquivosCam.A = u.arquivos; u.arquivosCam[el.dataset.ucam] = el.value; if (el.value.trim()) touch(u, p, t.v); save(p); return; }
  if (el.dataset.pjf === 'resCustom' || el.dataset.vff === 'resCustom') { const f = el.dataset.pjf ? p.formato : V().ficha.formato; f.res = el.value.replace(/\s/g, '').replace(/[×X]/g, 'x'); save(p); return; }
  if (el.dataset.peF === 'nome') { const pe = p.pessoas.find(x => x.id === el.closest('[data-pe]').dataset.pe); pe.nome = el.value; save(p); return; }
  if (el.dataset.eqF === 'nome') {
    const v = V(); const row = v.ficha.equipe.find(x => x.id === el.closest('[data-eq]').dataset.eq);
    const name = el.value.trim(); let pe = p.pessoas.find(x => x.nome.trim().toLowerCase() === name.toLowerCase() && name);
    const cur = p.pessoas.find(x => x.id === row.pessoaId);
    if (pe && pe !== cur) { row.pessoaId = pe.id; if (!row.funcao && pe.funcao) { row.funcao = pe.funcao; const sel = el.closest('[data-eq]').querySelector('select'); if (sel) sel.value = pe.funcao; } }
    else if (cur && !p.videos.some(x => x !== v && x.ficha.equipe.some(y => y.pessoaId === cur.id))) cur.nome = el.value;
    else if (name) { pe = { id: uid(), nome: el.value, funcao: row.funcao || '' }; p.pessoas.push(pe); row.pessoaId = pe.id; }
    save(p); return;
  }
  if (el.dataset.ev) { const d = Dd(); const i = +el.closest('.strip').dataset.i; d.plano[i][el.dataset.ev] = el.dataset.ev === 'min' ? Math.max(0, +el.value || 0) : el.value; save(p); return; }
  if (el.dataset.prepcam) { const t = tFromEl(el); const u = findUnit(p, t); u.prep ||= {}; u.prep.planoCam ||= {}; if (!('A' in u.prep.planoCam) && u.prep.plano) u.prep.planoCam.A = u.prep.plano; u.prep.planoCam[el.dataset.prepcam] = el.value; if (el.dataset.prepcam === 'A') u.prep.plano = el.value; save(p); return; }
  if (el.dataset.prep) { const t = tFromEl(el); const u = findUnit(p, t); u.prep ||= {}; u.prep[el.dataset.prep] = el.value; if (el.dataset.prep === 'tempo') delete u.prep.pos; save(p); return; }
  if (el.dataset.u) { const t = tFromEl(el); const u = findUnit(p, t); if (u) { u[el.dataset.u] = el.value; if (el.dataset.u === 'arquivos' && el.value.trim()) touch(u, p, t.v); save(p); } autoGrow(el); }
});
document.addEventListener('change', e => {
  const el = e.target; const p = P();
  if (el.id === 'prefAudio') { prefs.set('audio', el.checked); return; }
  if (el.id === 'hideEmpty') { S.hideEmpty = el.checked; render(); return; }
  if (el.id === 'pickHide') { S.pickHide = el.checked; openPicker(); return; }
  if (el.id === 'recTarget' && recState) { recState.target = parseTargetVal(el.value); recState.manual = true; return; }
  if (el.tagName === 'SELECT' && (el.dataset.peF === 'funcao' || el.dataset.eqF === 'funcao')) {
    let val = el.value;
    if (val === '__outra') {
      const wrap = el.parentElement; const inp = document.createElement('input'); inp.className = 'inp fn'; inp.placeholder = 'Digite a função e toque fora'; inp.setAttribute('aria-label', 'Nova função');
      el.replaceWith(inp); inp.focus();
      inp.addEventListener('change', () => { const f = inp.value.trim(); if (f) { if (!p.funcoesExtras.includes(f) && !FUNCOES.some(g => g[1].includes(f))) p.funcoesExtras.push(f); applyFuncao(p, wrap, f); } render(); });
      return;
    }
    applyFuncao(p, el.closest('[data-pe],[data-eq]'), val); return;
  }
  if (el.dataset.fi === 'data') { const v = V(); if (v.ficha.data) ensureDay(p, v.ficha.data); save(p); S.fichaOpen = true; render(); return; }
  if (el.dataset.fi === 'tipo') { S.fichaOpen = true; render(); return; }
  if (el.dataset.prep === 'cameras') { render(); return; }
  if (el.id === 'kitLoad' && el.value) { const k = S.kits.find(x => x.id === el.value); const f = V().ficha; for (const it of k.itens) if (!f.equipamentos.some(e2 => e2.item === it.item)) f.equipamentos.push({ id: uid(), ...it }); S.fichaOpen = true; save(p); render(); toast(`Kit “${k.nome}” carregado.`); return; }
  if (el.id === 'fiFmtOwn') { const f = V().ficha; f.formato = el.checked ? { ...(p.formato || { orient: 'H', res: '1920x1080', fps: '' }) } : null; S.fichaOpen = true; save(p); render(); return; }
  if (el.dataset.pjf || el.dataset.vff) {
    const key = el.dataset.pjf || el.dataset.vff; if (key === 'resCustom') return;
    const f = el.dataset.pjf ? (p.formato ||= { orient: 'H', res: '1920x1080', fps: '' }) : V().ficha.formato;
    if (key === 'res' && el.value === '__outra') { f._custom = true; f.res = ''; }
    else { f[key] = el.value; if (key === 'res') delete f._custom; if (key === 'orient') { f.res = (RESOLUCOES[el.value] || [])[0] || ''; delete f._custom; } }
    if (!el.dataset.pjf) S.fichaOpen = true;
    save(p); render(); return;
  }
});
function applyFuncao(p, row, val) {
  if (row.dataset.pe) { const pe = p.pessoas.find(x => x.id === row.dataset.pe); pe.funcao = val; }
  else { const r = V().ficha.equipe.find(x => x.id === row.dataset.eq); r.funcao = val; const pe = p.pessoas.find(x => x.id === r.pessoaId); if (pe && !pe.funcao) pe.funcao = val; }
  save(p);
}
function autoGrow(el) { if (el.tagName !== 'TEXTAREA') return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 320) + 'px'; }
document.addEventListener('focusin', e => { if (e.target.tagName === 'TEXTAREA') autoGrow(e.target); });

// a new video starts with the recording sheet of the most recent video (same day, team and set is the usual case)
function prefillFicha(p, v) {
  const src = [...p.videos].filter(x => x.ficha?.data || x.ficha?.equipe?.length).sort((a, b) => (b.ficha.data || '').localeCompare(a.ficha.data || ''))[0];
  if (!src) return;
  const f = src.ficha;
  v.ficha = { ...newFicha(), data: f.data, tipo: f.tipo, local: f.local, endereco: f.endereco, geo: f.geo ? { ...f.geo } : null, equipe: f.equipe.map(e => ({ ...e, id: uid() })), equipamentos: f.equipamentos.map(e => ({ ...e, id: uid() })), formato: f.formato ? { ...f.formato } : null };
}
/* ---------- prep: apply to all ---------- */
const PREP_KEYS = [['ambiente', 'Ambiente'], ['intext', 'INT/EXT'], ['periodo', 'Período'], ['plano', 'Plano'], ['cameras', 'Câmeras'], ['elenco', 'Elenco'], ['necessidades', 'Necessidades']];
let prepSrc = null;
function openPrepAll(t) {
  const p = P(); const u = findUnit(p, t); if (!u) return; prepSrc = t;
  const pr = u.prep || {};
  sheet.open(`<h3>Aplicar a preparação da cena ${esc(u.numero)}</h3>
    <div class="field"><label>Campos a copiar</label><div class="stack" style="gap:4px">${PREP_KEYS.map(([k, l]) => `<label class="row" style="gap:8px"><input type="checkbox" name="pk" value="${k}" ${pr[k] ? 'checked' : ''}> ${l}: <b>${esc(k === 'cameras' ? String(camCount(u)) : k === 'plano' ? (planoText(u) || '—') : (pr[k] || '—'))}</b></label>`).join('')}</div><span class="muted" style="font-size:12.5px">O tempo de cada cena não é copiado.</span></div>
    <div class="field"><label>Aplicar em</label><label class="row" style="gap:8px"><input type="radio" name="pscope" value="video" checked> Todas as cenas deste vídeo</label>${p.videos.length > 1 ? `<label class="row" style="gap:8px"><input type="radio" name="pscope" value="projeto"> Todas as cenas de todos os vídeos do projeto</label>` : ''}</div>
    <div class="field"><label>Como</label><label class="row" style="gap:8px"><input type="radio" name="pmode" value="vazios" checked> Só preencher campos vazios</label><label class="row" style="gap:8px"><input type="radio" name="pmode" value="todos"> Substituir o que já estiver preenchido</label></div>
    <div class="row"><span class="spacer"></span><button class="btn" data-act="sheet-close">Cancelar</button><button class="btn primary" data-act="prep-all-ok">Aplicar</button></div>`);
}
function applyPrepAll() {
  const p = P(); const src = findUnit(p, prepSrc); if (!src) return sheet.close();
  const keys = $$('input[name="pk"]:checked').map(x => x.value);
  const scope = ($('input[name="pscope"]:checked') || {}).value || 'video';
  const all = ($('input[name="pmode"]:checked') || {}).value === 'todos';
  const vids = scope === 'projeto' ? p.videos : [findVideo(p, prepSrc.v)];
  let n = 0;
  for (const v of vids) for (const u of units(v)) {
    if (u === src) continue; u.prep ||= {}; let ch = false;
    for (const k of keys) { const val = k === 'cameras' ? String(camCount(src)) : (src.prep[k] || ''); if (!val) continue; if (all || !u.prep[k] || (k === 'cameras' && !u.prep.cameras)) { if (u.prep[k] !== val) { u.prep[k] = val; ch = true; } } }
    if (keys.includes('plano') && src.prep.planoCam && (all || !u.prep.planoCam)) { if (JSON.stringify(u.prep.planoCam) !== JSON.stringify(src.prep.planoCam)) { u.prep.planoCam = { ...src.prep.planoCam }; ch = true; } }
    if (ch) n++;
  }
  save(p, true); sheet.close(); render(); toast(n ? `Preparação aplicada em ${n} cena${n > 1 ? 's' : ''}.` : 'Nenhuma cena precisou ser alterada.');
}
/* ---------- docx import ---------- */
async function importDocx(files) {
  const p = P(); if (!p) return;
  let last = null;
  for (const f of files) {
    try {
      if (!/\.docx$/i.test(f.name)) throw new Error('Envie o roteiro em .docx (Word).');
      const v = await parseDocx(f);
      for (const c of v.cenas) { c.prep = c.prep || {}; c.diarias = c.diarias || []; suggestPrep(c); }
      prefillFicha(p, v); p.videos.push(v); last = v;
      if (!p.agencia && v.cab.cliente) p.agencia = v.cab.cliente;
      toast(`${v.cab.codigo || f.name}: ${v.cenas.length} cenas importadas.`);
    } catch (err) { toast(`${f.name}: ${err.message || err}`, 6000); }
  }
  save(p, true);
  if (last && files.length === 1) go(`v-${p.id}-${last.id}`); else render();
}

/* ---------- backup (without Drive) ---------- */
const b64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(blob); });
async function exportBackup(p) {
  const blobs = {};
  for (const n of allNotes(p)) if (n.audioId) { const b = await store.getBlob(n.audioId); if (b) blobs[n.audioId] = { type: b.type, data: await b64(b) }; }
  for (const m of p.midias) if (m.blobId && m.size < 40 * 1048576) { const b = await store.getBlob(m.blobId); if (b) blobs[m.blobId] = { type: b.type, data: await b64(b) }; }
  await savePdf(`backup-${slug(projName(p))}-${todayYmd()}.json`, new Blob([JSON.stringify({ formato: 'relatorio-de-set', versao: 2, projeto: p, blobs })], { type: 'application/json' }), true);
}
async function importBackup(file) {
  try {
    const j = JSON.parse(await file.text());
    if (j?.formato !== 'relatorio-de-set' || !j.projeto?.id) throw new Error('Este arquivo não é um backup do Relatório de Set.');
    for (const [id, b] of Object.entries(j.blobs || {})) { if (!/^[am]_[a-z0-9]+$/i.test(id)) continue; const bin = Uint8Array.from(atob(b.data), ch => ch.charCodeAt(0)); await store.putBlob(id, new Blob([bin], { type: String(b.type || '') })); }
    const rp = normalizeProject(j.projeto);
    const i = S.projetos.findIndex(x => x.id === rp.id); if (i > -1) S.projetos[i] = rp; else S.projetos.push(rp);
    await store.putProject(clone(rp)); toast('Projeto importado.'); go('p-' + rp.id);
  } catch (e) { toast(e.message || String(e), 5000); }
}
function normalizeProject(p) {
  p.videos ||= []; p.diarias ||= []; p.pessoas ||= []; p.funcoesExtras ||= []; p.midias ||= []; p.drive ||= {};
  for (const v of p.videos) { v.notas ||= []; v.preambulo ||= []; for (const c of v.cenas) { c.subcenas ||= []; c.complementos ||= []; for (const u of [c, ...c.subcenas]) { u.stamps ||= []; u.notas ||= []; u.prep ||= {}; u.diarias ||= []; } } }
  for (const d of p.diarias) { d.equipe ||= []; d.plano ||= []; }
  if ((p.v || 2) < 3) {
    // v2 -> v3: place, team and date move from the diária to each video's recording sheet
    for (const v of p.videos) {
      const used = p.diarias.filter(d => d.plano.some(i => i.k === 'cena' && i.v === v.id) || units(v).some(u => u.diarias.includes(d.id))).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
      const d = used[0] || (p.diarias.length === 1 ? p.diarias[0] : null);
      v.ficha = { ...newFicha(), ...(d ? { data: d.data, tipo: d.tipo || 'estudio', local: d.local || '', endereco: d.endereco || '', geo: d.geo || null, equipe: (d.equipe || []).map(e => ({ ...e, id: uid() })), obs: d.obs || '' } : {}) };
    }
    p.formato ||= null; p.v = 3;
  }
  for (const v of p.videos) { v.ficha ||= newFicha(); v.ficha.equipe ||= []; v.ficha.equipamentos ||= []; }
  return p;
}
/* ============================== boot ============================== */
(async function boot() {
  try { navigator.storage?.persist?.().catch(() => {}); } catch {}
  try { S.projetos = (await store.allProjects()).map(normalizeProject); } catch { S.projetos = []; }
  try { S.kits = (await store.getMeta('kits')) || []; } catch { S.kits = []; }
  const migrated = await migrateV1(newProject, newDiaria);
  if (migrated.length) { for (const p of migrated) { normalizeProject(p); S.projetos.push(p); await store.putProject(clone(p)); } toast(`${migrated.length} diária(s) da versão anterior viraram projetos.`); }
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  setTimeout(processAiQueue, 2500);
  if (drive.driveConfigured() && drive.wasConnectedBefore() && navigator.onLine) {
    // reconnect silently when Google allows it; otherwise the chip asks for a tap
    drive.connect(false).then(() => { setTopChip(); scheduleAutoSync(5000); }).catch(() => {});
  }
})();
