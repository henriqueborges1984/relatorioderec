// Voice notes: recording, live browser transcription, spoken punctuation, AI transcription
import CONFIG from './config.js';

export const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

/* ---------- spoken punctuation ("vírgula", "ponto final"...) ---------- */
const PUNCT = [
  [/\s*\b(ponto de interroga[çc][ãa]o|interroga[çc][ãa]o)\b\s*/gi, '? '],
  [/\s*\b(ponto de exclama[çc][ãa]o|exclama[çc][ãa]o)\b\s*/gi, '! '],
  [/\s*\b(ponto e v[íi]rgula)\b\s*/gi, '; '],
  [/\s*\b(dois pontos)\b\s*/gi, ': '],
  [/\s*\b(retic[êe]ncias)\b\s*/gi, '… '],
  [/\s*\b(nova linha|pr[óo]xima linha|par[áa]grafo)\b\s*/gi, '\n'],
  [/\s*\babre aspas\b\s*/gi, ' “'],
  [/\s*\bfecha aspas\b\s*/gi, '” '],
  [/\s*\bv[íi]rgula\b\s*/gi, ', '],
  [/\s*\b(ponto final|ponto)\b(?!\s*(?:\d|um\b|dois\b|tr[êe]s\b|quatro\b|cinco\b|seis\b|sete\b|oito\b|nove\b|dez\b))\s*/gi, '. ']
];
export function spokenPunctuation(t) {
  if (!t) return t;
  let s = ' ' + t + ' ';
  for (const [re, rep] of PUNCT) s = s.replace(re, rep);
  s = s.replace(/ +([,.;:!?…])/g, '$1').replace(/([,.;:!?…])(?=[^\s\d”\n])/g, '$1 ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
  // capitalize after sentence end and at start
  s = s.replace(/(^|[.!?…]\s+|\n)([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase());
  return s;
}

/* ---------- references spoken in the note ---------- */
const NUMW = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, 'três': 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30 };
const numTok = t => { if (!t) return null; t = t.toLowerCase(); if (/^\d+$/.test(t)) return t; return t in NUMW ? String(NUMW[t]) : null; };
export function parseCenaRef(text) {
  const s = ' ' + text.toLowerCase().replace(/[,;:!?]/g, ' ') + ' ';
  const m = s.match(/\bcena\s+(?:n[úu]mero\s+)?(\d+(?:\.\d+)?|[a-zçãâéêíóôú]+)(?:\s*(?:ponto|\.|tra[çc]o|-)\s*(\d+|[a-zçãâéêíóôú]+))?/);
  if (!m) return null;
  let a = m[1], b = m[2];
  if (a.includes('.')) [a, b] = a.split('.');
  a = numTok(a); if (!a) return null;
  b = numTok(b);
  return b ? `${a}.${b}` : a;
}
export function parseVideoRef(text) {
  const m = (' ' + text.toLowerCase() + ' ').match(/\b(?:v[íi]deo|roteiro|vd)\s*(\d+|[a-zçãâéêíóôú]+)\b/);
  return m ? +(numTok(m[1]) || 0) || null : null;
}
export function parseArquivo(text) {
  const m = text.match(/\barquivo\s+(?:(?:é|e|do|da|de|o|a|nome|n[úu]mero|chama|se)\s+)*(.+)/i);
  if (!m) return null;
  const got = [];
  for (const t0 of m[1].split(/\s+/)) {
    const t = t0.replace(/[.,;:!?]+$/, '');
    if (/\d/.test(t) || /^[a-z]{1,2}$/i.test(t) || /^[A-Z0-9_\-]+$/.test(t)) { if (/^(e|o|a|é|de|do|da)$/i.test(t) && got.length) break; got.push(t); if (/[.,;]$/.test(t0)) break; }
    else break;
    if (got.length >= 6) break;
  }
  const v = got.join('').toUpperCase();
  return /\d/.test(v) && v.length >= 2 ? v : null;
}
export const saysValendo = t => /\b(valendo|vale o|aprovad[oa])\b/i.test(t);
export const saysRefazer = t => /\b(refazer|regravar|refaz)\b/i.test(t);
export const saysDialogo = t => /\b(mud(ei|amos|ou) o (di[áa]logo|texto)|di[áa]logo (mudou|alterado)|altera[çc][ãa]o (de|no) texto|texto alterado)\b/i.test(t);

/* ---------- recorder ---------- */
export class VoiceRecorder {
  constructor(onUpdate) { this.onUpdate = onUpdate; this.reset(); }
  reset() { Object.assign(this, { on: false, recog: null, mr: null, stream: null, chunks: [], mime: '', base: '', sess: '', interim: '', t0: 0, problems: new Set() }); }
  get liveText() { return [this.base, this.sess].filter(Boolean).join(' '); }
  async start({ keepAudio = true } = {}) {
    this.reset(); this.on = true; this.t0 = Date.now();
    if (keepAudio && navigator.mediaDevices?.getUserMedia && window.MediaRecorder) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
        this.mr = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
        this.mime = this.mr.mimeType || mime;
        this.mr.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
        this.mr.start(1000);
      } catch (e) { this.problems.add(e && e.name === 'NotAllowedError' ? 'mic-negado' : 'sem-audio'); }
    }
    if (!this.on) { this.stopTracks(); return false; }
    if (SR) this.startRecog(); else this.problems.add('sem-transcricao');
    if (!SR && !this.mr) { this.on = false; return false; }
    this.onUpdate?.();
    return true;
  }
  startRecog() {
    let r; try { r = new SR(); } catch { this.problems.add('sem-transcricao'); return; }
    r.lang = 'pt-BR'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = e => {
      let fin = '', int = '';
      for (let i = 0; i < e.results.length; i++) { const x = e.results[i]; const t = x[0].transcript.trim(); if (!t) continue; if (x.isFinal) fin += (fin ? ' ' : '') + t; else int += (int ? ' ' : '') + t; }
      this.sess = fin; this.interim = int; this.onUpdate?.();
    };
    r.onerror = e => {
      const er = e.error;
      if (er === 'not-allowed' || er === 'service-not-allowed') this.problems.add('transcricao-negada');
      else if (er === 'network') this.problems.add('offline');
      else if (er === 'audio-capture') this.problems.add('captura');
      else if (er === 'language-not-supported') this.problems.add('idioma');
      this.onUpdate?.();
    };
    r.onend = () => {
      this.base = [this.base, this.sess].filter(Boolean).join(' '); this.sess = '';
      if (this.recog === r && this.on && !['transcricao-negada', 'offline', 'idioma'].some(p => this.problems.has(p))) setTimeout(() => { if (this.on) this.startRecog(); }, 150);
      else if (this.recog === r) this.recog = null;
      if (this._end) { this._end(); this._end = null; }
    };
    this.recog = r;
    try { r.start(); } catch { /* already running */ }
  }
  stopTracks() { try { this.stream && this.stream.getTracks().forEach(t => t.stop()); } catch {} this.stream = null; }
  async stop() {
    if (!this.on) return null;
    this.on = false;
    const recogDone = new Promise(res => { if (this.recog) { this._end = res; try { this.recog.stop(); } catch { res(); } setTimeout(res, 1800); } else res(); });
    const audioDone = new Promise(res => { if (this.mr && this.mr.state !== 'inactive') { this.mr.onstop = res; try { this.mr.stop(); } catch { res(); } setTimeout(res, 2500); } else res(); });
    await Promise.all([recogDone, audioDone]);
    this.stopTracks();
    const text = spokenPunctuation([this.liveText, this.interim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim());
    const blob = this.chunks.length ? new Blob(this.chunks, { type: (this.mime || 'audio/webm').split(';')[0] }) : null;
    return { text, blob, mime: this.mime, durationMs: Date.now() - this.t0, problems: new Set(this.problems) };
  }
}
export const PROB = {
  'mic-negado': 'O navegador bloqueou o microfone. Libere o microfone nas permissões do site e tente de novo.',
  'sem-audio': 'Não foi possível gravar o áudio original; o texto continua sendo captado.',
  'sem-transcricao': 'Este navegador não mostra o texto ao vivo. O áudio está sendo gravado e será transcrito pela IA quando houver internet.',
  'transcricao-negada': 'O texto ao vivo foi bloqueado pelo navegador. O áudio continua sendo gravado.',
  'offline': 'Sem internet: o áudio está sendo gravado e será transcrito quando a conexão voltar.',
  'captura': 'Outro app está usando o microfone. Feche-o e tente de novo.',
  'idioma': 'O texto ao vivo em português não está disponível neste aparelho; o áudio continua sendo gravado.'
};

/* ---------- AI transcription (through the site's private function) ---------- */
export function aiConfigured() { return !!(CONFIG.transcribeEndpoint && getPasscode()); }
export function getPasscode() { try { return localStorage.getItem('rds-passcode') || ''; } catch { return ''; } }
export function setPasscode(v) { try { localStorage.setItem('rds-passcode', v || ''); } catch {} }
export async function transcribeBlob(blob, vocab = '') {
  const fd = new FormData();
  const ext = /mp4|m4a|aac/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
  fd.append('file', blob, `nota.${ext}`);
  fd.append('vocab', vocab.slice(0, 900));
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(CONFIG.transcribeEndpoint, { method: 'POST', body: fd, headers: { 'x-rds-key': getPasscode() }, signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `Erro ${r.status}`); e.status = r.status; throw e; }
    return String(j.text || '').trim();
  } finally { clearTimeout(to); }
}
