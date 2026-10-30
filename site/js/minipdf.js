// Minimal PDF writer (standard fonts, JPEG images, links) — works offline, no libraries
const AFM = { H: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 761, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500], HB: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 761, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556], HO: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 761, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500] };
const CP = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
export function toCodes(str) {
  const out = [];
  for (const ch of String(str ?? '')) {
    const c = ch.codePointAt(0);
    if ((c >= 32 && c < 127) || (c >= 160 && c <= 255)) out.push(c);
    else if (CP[ch]) out.push(CP[ch]);
    else if (c === 9) out.push(32);
    else if (c >= 0x300 && c < 0x370) continue;
    else { const b = ch.normalize('NFD').codePointAt(0); out.push(b >= 32 && b < 127 ? b : 63); }
  }
  return out;
}
const FONTS = { H: 'Helvetica', HB: 'Helvetica-Bold', HO: 'Helvetica-Oblique', C: 'Courier', CB: 'Courier-Bold' };
export function textW(str, f, size) {
  const codes = toCodes(str);
  if (f === 'C' || f === 'CB') return codes.length * 600 * size / 1000;
  const t = AFM[f] || AFM.H; let w = 0; for (const c of codes) w += (t[c - 32] || 500); return w * size / 1000;
}
export function wrapText(str, f, size, maxW) {
  const out = [];
  for (const para of String(str ?? '').split('\n')) {
    const words = para.split(/(\s+)/).filter(x => x !== '');
    let line = '';
    for (const w of words) {
      const test = line + w;
      if (textW(test.trimEnd(), f, size) <= maxW) { line = test; continue; }
      if (line.trim()) out.push(line.trimEnd());
      line = /^\s+$/.test(w) ? '' : w;
      while (textW(line, f, size) > maxW && line.length > 1) { let k = line.length - 1; while (k > 1 && textW(line.slice(0, k), f, size) > maxW) k--; out.push(line.slice(0, k)); line = line.slice(k); }
    }
    out.push(line.trimEnd());
  }
  return out;
}
const n2 = v => (Math.round(v * 100) / 100).toString();
export class MiniPdf {
  constructor() { this.W = 595.28; this.H = 841.89; this.pages = []; this.images = []; this.addPage(); }
  addPage() { this.cur = { ops: [], links: [], imgs: new Set() }; this.pages.push(this.cur); }
  col(c) { return c.map(v => n2(v / 255)).join(' '); }
  text(x, y, str, o = {}) {
    const f = o.font || 'H', size = o.size || 10; let tx = x;
    if (o.align === 'right') tx = x - textW(str, f, size); else if (o.align === 'center') tx = x - textW(str, f, size) / 2;
    const hex = toCodes(str).map(c => c.toString(16).padStart(2, '0')).join('');
    this.cur.ops.push(`BT /${f} ${size} Tf ${this.col(o.color || [0, 0, 0])} rg ${n2(tx)} ${n2(this.H - y)} Td <${hex}> Tj ET`);
    if (o.link) this.link(tx, y - size, textW(str, f, size), size * 1.25, o.link);
  }
  line(x1, y1, x2, y2, w = 0.5, c = [0, 0, 0]) { this.cur.ops.push(`${this.col(c)} RG ${w} w ${n2(x1)} ${n2(this.H - y1)} m ${n2(x2)} ${n2(this.H - y2)} l S`); }
  rect(x, y, w, h, c) { this.cur.ops.push(`${this.col(c)} rg ${n2(x)} ${n2(this.H - y - h)} ${n2(w)} ${n2(h)} re f`); }
  strokeRect(x, y, w, h, lw, c) { this.cur.ops.push(`${this.col(c)} RG ${lw} w ${n2(x)} ${n2(this.H - y - h)} ${n2(w)} ${n2(h)} re S`); }
  circle(cx, cy, r, c) { const k = 0.5523 * r, Y = this.H - cy; this.cur.ops.push(`${this.col(c)} rg ${n2(cx + r)} ${n2(Y)} m ${n2(cx + r)} ${n2(Y + k)} ${n2(cx + k)} ${n2(Y + r)} ${n2(cx)} ${n2(Y + r)} c ${n2(cx - k)} ${n2(Y + r)} ${n2(cx - r)} ${n2(Y + k)} ${n2(cx - r)} ${n2(Y)} c ${n2(cx - r)} ${n2(Y - k)} ${n2(cx - k)} ${n2(Y - r)} ${n2(cx)} ${n2(Y - r)} c ${n2(cx + k)} ${n2(Y - r)} ${n2(cx + r)} ${n2(Y - k)} ${n2(cx + r)} ${n2(Y)} c f`); }
  link(x, y, w, h, url) { this.cur.links.push({ x, y, w, h, url }); }
  // jpeg: Uint8Array of a baseline JPEG; iw/ih its pixel size
  image(jpeg, iw, ih, x, y, w, h) {
    let idx = this.images.findIndex(im => im.jpeg === jpeg);
    if (idx < 0) { this.images.push({ jpeg, iw, ih }); idx = this.images.length - 1; }
    this.cur.imgs.add(idx);
    this.cur.ops.push(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(this.H - y - h)} cm /Im${idx} Do Q`);
  }
  output(title) {
    const objs = []; const add = s => { objs.push(s); return objs.length; };
    const catalog = add(''), pagesId = add('');
    const fontIds = {}; for (const [k, name] of Object.entries(FONTS)) fontIds[k] = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`);
    const fontRes = Object.entries(fontIds).map(([k, id]) => `/${k} ${id} 0 R`).join(' ');
    const imgIds = this.images.map(im => {
      let bin = ''; const CH = 0x8000; for (let i = 0; i < im.jpeg.length; i += CH) bin += String.fromCharCode.apply(null, im.jpeg.subarray(i, i + CH));
      return add(`<< /Type /XObject /Subtype /Image /Width ${im.iw} /Height ${im.ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n${bin}\nendstream`);
    });
    const kids = [];
    for (const p of this.pages) {
      const content = p.ops.join('\n');
      const cId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      const annots = p.links.map(l => add(`<< /Type /Annot /Subtype /Link /Rect [${n2(l.x)} ${n2(this.H - l.y - l.h)} ${n2(l.x + l.w)} ${n2(this.H - l.y)}] /Border [0 0 0] /A << /S /URI /URI (${String(l.url).replace(/[()\\]/g, m => '\\' + m).replace(/[^\x20-\x7e]/g, '')}) >> >>`));
      const xo = [...p.imgs].map(i => `/Im${i} ${imgIds[i]} 0 R`).join(' ');
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << ${fontRes} >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${cId} 0 R${annots.length ? ` /Annots [${annots.map(a => a + ' 0 R').join(' ')}]` : ''} >>`));
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(i => i + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    const infoHex = 'FEFF' + [...String(title || '')].map(ch => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('');
    const info = add(`<< /Title <${infoHex}> /Producer (Relatorio de Set) >>`);
    let out = '%PDF-1.4\n%âãÏÓ\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return new Blob([bytes], { type: 'application/pdf' });
  }
}
export function dataUrlToBytes(u) { const b = atob(String(u).split(',')[1] || ''); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
