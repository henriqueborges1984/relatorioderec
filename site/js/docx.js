import { esc, uid, nowIso } from './util.js';
// Reads the agency .docx (header + CENA / IMAGEM / TEXTO table) with no external libraries

export const newPrep = () => ({ ambiente: '', intext: '', periodo: '', plano: '', tempo: '', elenco: '', necessidades: '' });
export const newUnit = (numero, extra = {}) => ({ id: uid(), numero: String(numero), status: 'pendente', stamps: [], arquivos: '', obs: '', notas: [], prep: newPrep(), diarias: [], ...extra });
export const newCena = numero => newUnit(numero, { imagem: '', texto: '', imagemTxt: '', textoTxt: '', complementos: [], subcenas: [] });
export const newVideo = () => ({ id: uid(), arquivo: '', cab: { codigo: '', cliente: '', titulo: '', data: '', duracao: '', cenas: '', versao: '' }, preambulo: [], cenas: [], notas: [], criadoEm: nowIso() });

async function readZip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('O arquivo não é um .docx válido.');
  const n = dv.getUint16(eocd + 10, true); let off = dv.getUint32(eocd + 16, true);
  const files = {}; const td = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
    const nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
    files[td.decode(u8.subarray(off + 46, off + 46 + nlen))] = { method, csize, lho };
    off += 46 + nlen + xlen + clen;
  }
  return {
    names: Object.keys(files),
    async text(name) {
      const f = files[name]; if (!f) return null;
      const start = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true);
      const data = u8.subarray(start, start + f.csize);
      let out;
      if (f.method === 0) out = data;
      else if (f.method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador é antigo demais para ler .docx. Atualize o Chrome ou o Safari.');
        const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        out = new Uint8Array(await new Response(s).arrayBuffer());
      } else throw new Error('Compressão não suportada no .docx.');
      return new TextDecoder('utf-8').decode(out);
    }
  };
}
const kids = (el, name) => [...el.children].filter(c => c.localName === name);
function runsOf(p) {
  const out = []; // {t, b, i}
  const walk = el => {
    for (const c of el.children) {
      const ln = c.localName;
      if (ln === 'del' || ln === 'moveFrom' || ln === 'pPr' || ln === 'rPr' || ln === 'commentRangeStart') continue;
      if (ln === 'r') {
        const rPr = kids(c, 'rPr')[0];
        const flag = n => { const e = rPr && kids(rPr, n)[0]; if (!e) return false; const v = e.getAttribute('w:val'); return !(v === '0' || v === 'false'); };
        const b = flag('b'), i = flag('i');
        for (const x of c.children) {
          if (x.localName === 't') out.push({ t: x.textContent, b, i });
          else if (x.localName === 'tab') out.push({ t: ' ', b, i });
          else if (x.localName === 'br' || x.localName === 'cr') out.push({ br: true });
        }
      } else walk(c);
    }
  };
  walk(p);
  return out;
}
function paraOut(p) {
  const runs = runsOf(p); let html = '', text = '';
  for (const r of runs) {
    if (r.br) { html += '<br>'; text += '\n'; continue; }
    let h = esc(r.t); if (r.i) h = `<i>${h}</i>`; if (r.b) h = `<b>${h}</b>`;
    html += h; text += r.t;
  }
  html = html.replace(/<\/b><b>/g, '').replace(/<\/i><i>/g, '').replace(/^(<br>)+|(<br>)+$/g, '');
  return { html, text: text.replace(/^\n+|\n+$/g, '') };
}
function cellOut(tc) {
  const ps = [];
  const collect = el => { for (const c of el.children) { if (c.localName === 'p') ps.push(paraOut(c)); else if (c.localName === 'sdt' || c.localName === 'sdtContent' || c.localName === 'customXml') collect(c); } };
  collect(tc);
  const keep = ps.filter(p => p.text.trim());
  return { html: keep.map(p => `<p>${p.html}</p>`).join(''), text: keep.map(p => p.text.trim()).join('\n') };
}
function rowCells(tr) {
  const out = [];
  const collect = el => { for (const c of el.children) { if (c.localName === 'tc') { const span = +(c.querySelector('gridSpan')?.getAttribute('w:val') || 1); const o = cellOut(c); out.push(o); for (let i = 1; i < span; i++) out.push({ html: '', text: '' }); } else if (c.localName === 'sdt' || c.localName === 'sdtContent' || c.localName === 'customXml') collect(c); } };
  collect(tr);
  return out;
}
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

function parseCab(lines, filename) {
  const cab = { codigo:'', cliente:'', titulo:'', data:'', duracao:'', cenas:'', versao:'' };
  const all = lines.join(' | ');
  let m;
  if ((m = all.match(/Data:\s*([0-9]{1,2}\s*\/\s*[0-9]{1,2}\s*\/\s*[0-9]{2,4})/i))) cab.data = m[1].replace(/\s/g, '');
  if ((m = all.match(/Dura[çc][ãa]o:\s*([^|]+)/i))) cab.duracao = m[1].trim();
  if ((m = all.match(/Cenas:\s*(\d+)/i))) cab.cenas = m[1];
  if ((m = all.match(/(?:^|\|)\s*(V\s*\d+)\s*(?=\||$)/i))) cab.versao = m[1].replace(/\s/g, '').toUpperCase();
  const tl = lines.find(l => l.trim() && !/Data:|Dura[çc][ãa]o:|Cenas:/i.test(l)) || '';
  let rest = tl.trim();
  const bar = tl.indexOf('|');
  if (bar > -1) { cab.codigo = tl.slice(0, bar).trim(); rest = tl.slice(bar + 1).trim(); }
  const seg = rest.split(/\s+[-–—]\s+/);
  if (seg.length > 1) { cab.cliente = seg[0].trim(); cab.titulo = seg.slice(1).join(' - ').trim(); } else cab.titulo = rest;
  const base = (filename || '').replace(/^.*[\\/]/, '');
  if (!cab.codigo && (m = base.match(/^(\d+_\d+)/))) cab.codigo = m[1];
  if (!cab.versao && (m = base.match(/_(V\d+)\.docx$/i))) cab.versao = m[1].toUpperCase();
  if (!cab.titulo) cab.titulo = base.replace(/\.docx$/i, '').replace(/_/g, ' ');
  return cab;
}

export async function parseDocx(file) {
  const zip = await readZip(await file.arrayBuffer());
  const xml = await zip.text('word/document.xml');
  if (!xml) throw new Error('Não encontrei o conteúdo do documento dentro do .docx.');
  const dp = new DOMParser();
  const doc = dp.parseFromString(xml, 'application/xml');
  const body = [...doc.documentElement.children].find(c => c.localName === 'body');
  if (!body) throw new Error('Documento sem corpo de texto.');

  // header lines: from word/header*.xml (prefer the one with "Data:")
  let headLines = [];
  const heads = zip.names.filter(n => /^word\/header\d*\.xml$/.test(n));
  let best = [];
  for (const h of heads) {
    const hx = dp.parseFromString(await zip.text(h), 'application/xml');
    const lines = [...hx.getElementsByTagNameNS('*', 'p')].map(p => paraOut(p).text.trim()).filter(Boolean);
    const score = (lines.join(' ').match(/Data:|Dura|Cenas:/gi) || []).length * 100 + lines.join(' ').length;
    const bestScore = (best.join(' ').match(/Data:|Dura|Cenas:/gi) || []).length * 100 + best.join(' ').length;
    if (score > bestScore) best = lines;
  }
  headLines = best;
  // paragraphs before the first table (fallback header)
  const pre = [];
  for (const c of body.children) { if (c.localName === 'tbl') break; if (c.localName === 'p') { const t = paraOut(c).text.trim(); if (t) pre.push(t); } }
  if (!headLines.length) headLines = pre.slice(0, 4);

  const r = newVideo();
  r.arquivo = file.name;
  r.cab = parseCab(headLines, file.name);

  const tables = [...body.children].filter(c => c.localName === 'tbl');
  if (!tables.length) throw new Error('Não encontrei a tabela de cenas (CENA / IMAGEM / TEXTO) neste roteiro.');
  let rows = [];
  for (const t of tables) rows = rows.concat(kids(t, 'tr').map(rowCells));

  let ci = 0, ii = 1, ti = 2, start = 0;
  const hIdx = rows.findIndex(cells => cells.some(c => /^CENAS?$/.test(norm(c.text))) || (cells.some(c => /IMAGEM|VIDEO/.test(norm(c.text))) && cells.some(c => /TEXTO|AUDIO|LOCUCAO/.test(norm(c.text)))));
  if (hIdx > -1) {
    const h = rows[hIdx].map(c => norm(c.text));
    const f = re => h.findIndex(x => re.test(x));
    const c1 = f(/^CENAS?$/), i1 = f(/IMAGEM|VIDEO/), t1 = f(/TEXTO|AUDIO|LOCUCAO/);
    ci = c1; ii = i1 > -1 ? i1 : 1; ti = t1 > -1 ? t1 : 2; start = hIdx + 1;
  } else if ((rows[0] || []).length < 3) { ci = -1; ii = 0; ti = 1; }

  let seq = 0;
  for (let k = start; k < rows.length; k++) {
    const cells = rows[k];
    const img = cells[ii] || { html:'', text:'' }, txt = cells[ti] || { html:'', text:'' };
    let num = ci > -1 ? (cells[ci]?.text || '').replace(/\s+/g, ' ').trim() : '';
    if (ci === -1 && (img.text || txt.text)) num = String(++seq);
    if (!img.text && !txt.text && !num) continue;
    if (num) {
      const c = newCena(num.replace(/^cena\s*/i, ''));
      c.imagem = img.html; c.texto = txt.html;
      c.imagemTxt = img.text; c.textoTxt = txt.text;
      r.cenas.push(c);
    } else {
      const last = r.cenas[r.cenas.length - 1];
      const blk = { imagem: img.html, texto: txt.html, imagemTxt: img.text, textoTxt: txt.text };
      if (last) last.complementos.push(blk); else r.preambulo.push(blk);
    }
  }
  if (!r.cenas.length) throw new Error('A tabela foi encontrada, mas nenhuma cena numerada foi lida.');
  if (!r.cab.cenas) r.cab.cenas = String(r.cenas.length);
  return r;
}
export function excerpt(c) {
  const src = (c.textoTxt || '') + '\n' + (c.complementos || []).map(x => x.textoTxt).join('\n');
  const lines = src.split('\n').map(s => s.trim()).filter(s => s && !/^[A-ZÀ-Ú0-9 ()\-–]+:$/.test(s));
  return lines[0] || (c.imagemTxt || '').split('\n').find(Boolean) || '';
}


// First guess for the preparation fields, read from the script text (the user reviews it)
export function suggestPrep(c) {
  const img = (c.imagemTxt || '') + '\n' + (c.complementos || []).map(x => x.imagemTxt).join('\n');
  const txt = (c.textoTxt || '') + '\n' + (c.complementos || []).map(x => x.textoTxt).join('\n');
  const low = img.toLowerCase();
  const p = c.prep || (c.prep = {});
  const planos = [['plano geral', 'Plano geral'], ['plano aberto', 'Plano aberto'], ['plano americano', 'Plano americano'], ['plano médio', 'Plano médio'], ['plano medio', 'Plano médio'], ['plano próximo', 'Plano próximo'], ['plano proximo', 'Plano próximo'], ['primeiro plano', 'Primeiro plano'], ['close', 'Close'], ['detalhe', 'Detalhe'], ['plongée', 'Plongée'], ['drone', 'Drone']];
  let first = null, at = Infinity;
  for (const [k, v] of planos) { const i = low.indexOf(k); if (i > -1 && i < at) { at = i; first = v; } }
  const falado = /[A-ZÀ-Ú ()]+:\s*$/m.test(txt) || txt.replace(/\s/g, '').length > 40;
  const soPos = !falado && /(lettering|anima[çc][ãa]o|logo|vinheta|arte|meme|trecho do filme|tela de transi)/i.test(img);
  if (!p.plano) p.plano = first || (soPos ? 'Lettering / arte' : '');
  if (!p.ambiente && /est[úu]dio/i.test(img)) p.ambiente = 'Estúdio';
  if (!p.elenco) { const m = txt.match(/^([A-ZÀ-Ú][A-ZÀ-Ú ]{2,30})(?:\s*\([^)]*\))?:/m); if (m) p.elenco = m[1].trim().replace(/\b\w/g, ch => ch).toLowerCase().replace(/^./, ch => ch.toUpperCase()); }
  if (soPos) { p.pos = true; if (!p.tempo) p.tempo = '0'; }
  return p;
}
