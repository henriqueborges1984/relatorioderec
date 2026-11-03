// Shared helpers and constants
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cleanHtml = s => esc(s).replace(/&lt;(\/?)(p|b|i|br)&gt;/g, '<$1$2>').replace(/&amp;(quot|amp|lt|gt|#39|apos|nbsp);/g, '&$1;');
export const nowIso = () => new Date().toISOString();
export const clone = o => JSON.parse(JSON.stringify(o));
export const hhmm = iso => { try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
export const todayYmd = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
export const ymdOf = iso => { const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
export const fmtDate = ymd => { if (!ymd) return ''; const [y, m, d] = ymd.split('-'); return d ? `${d}/${m}/${y}` : ymd; };
export const weekday = ymd => { try { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''); } catch { return ''; } };
export const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
export const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'arquivo';
export const minToHHMM = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
export const hhmmToMin = s => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
export const durTxt = min => { min = Math.round(min || 0); const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`; };
export const fmtBytes = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

export const IC = {
  mic: '<svg class="ico" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  plus: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  doc: '<svg class="ico" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  play: '<svg class="ico" viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
  edit: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  trash: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  down: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 4v12M6 10l6 6 6-6M5 20h14"/></svg>',
  share: '<svg class="ico" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  upload: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 20V8M6 14l6-6 6 6M5 4h14"/></svg>',
  report: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/></svg>',
  back: '<svg class="ico" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  cam: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="4"/></svg>',
  video: '<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>',
  pin: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  drive: '<svg class="ico" viewBox="0 0 24 24"><path d="M8 3h8l6 10-4 7H6l-4-7z"/><path d="M8 3l6 10M16 3l-6 10M2 13h20"/></svg>',
  grip: '<svg class="ico" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/></svg>',
  people: '<svg class="ico" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 4 6"/></svg>',
  calendar: '<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  film: '<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  x: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  up: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  dn: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  gear: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  sync: '<svg class="ico" viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4M4 13a8 8 0 0 0 14.9 3.9M20 20v-4h-4"/></svg>'
};

export const STATUS = [
  { k: 'pendente', l: 'Pendente' }, { k: 'gravada', l: 'Gravada' }, { k: 'valendo', l: 'Valendo' },
  { k: 'refazer', l: 'Refazer' }, { k: 'fora', l: 'Não gravar' }
];
export const STATUS_L = Object.fromEntries(STATUS.map(s => [s.k, s.l]));
export const STAMPS = [
  { k: 'dialogo', l: 'Diálogo alterado' }, { k: 'adicionada', l: 'Cena adicionada' }, { k: 'atencao', l: 'Atenção edição' },
  { k: 'pickup', l: 'Pickup' }, { k: 'som', l: 'Som / wild' }, { k: 'alternativa', l: 'Versão alternativa' }
];
export const STAMP_L = Object.fromEntries(STAMPS.map(s => [s.k, s.l]));

export const FUNCOES = [
  ['Direção e produção', ['Direção', 'Assistente de direção', 'Produção executiva', 'Direção de produção', 'Produtor(a)', 'Assistente de produção']],
  ['Câmera', ['Diretor(a) de fotografia', 'Cinegrafista / Operador(a) de câmera', '1º assistente de câmera (foquista)', '2º assistente de câmera', 'Logger / DIT']],
  ['Luz e maquinaria', ['Gaffer / Chefe de elétrica', 'Eletricista', 'Maquinista']],
  ['Som', ['Técnico(a) de som direto', 'Microfonista']],
  ['Arte', ['Direção de arte', 'Assistente de arte', 'Produção de objetos', 'Figurino', 'Maquiagem e cabelo']],
  ['Apoio', ['Continuísta', 'Still / Making of', 'Assistente geral', 'Motorista']],
  ['Elenco e cliente', ['Apresentador(a) / Elenco', 'Cliente', 'Agência']]
];
export const TIPOS_DIARIA = [['estudio', 'Estúdio'], ['interna', 'Interna'], ['externa', 'Externa']];
export const TIPO_L = Object.fromEntries(TIPOS_DIARIA);
export const EVENTOS = [
  ['almoco', 'Almoço', 60], ['deslocamento', 'Deslocamento', 30], ['cenario', 'Troca de cenário', 30],
  ['figurino', 'Troca de figurino / maquiagem', 20], ['luz', 'Montagem de luz', 30], ['pausa', 'Pausa', 15], ['outro', 'Outro', 15]
];
export const EVENTO_L = Object.fromEntries(EVENTOS.map(e => [e[0], e[1]]));
export const PLANOS = ['Plano geral', 'Plano aberto', 'Plano americano', 'Plano médio', 'Plano próximo', 'Primeiro plano', 'Close', 'Detalhe', 'Plongée', 'Contra-plongée', 'Câmera na mão', 'Drone', 'Lettering / arte', 'Inserto / arquivo'];
export const VIDEO_COLORS = ['#2D5FA8', '#B5372D', '#1C7A4A', '#7A3EB1', '#A35F00', '#0F7C86', '#B0306E', '#4F6D1F', '#6B4E2E', '#3B4BA8'];
export const DEFAULT_SCENE_MIN = 20;
export const ORIENTACOES = [['H', 'Horizontal 16:9'], ['V', 'Vertical 9:16'], ['Q', 'Quadrado 1:1'], ['R', 'Retrato 4:5']];
export const RESOLUCOES = { H: ['1920x1080', '3840x2160', '1280x720', '2560x1440'], V: ['1080x1920', '2160x3840', '720x1280'], Q: ['1080x1080', '2160x2160'], R: ['1080x1350', '2160x2700'] };
export const FPS = ['23,976', '24', '25', '29,97', '30', '50', '59,94', '60'];
export const EQUIP_CATS = ['Câmera', 'Lente', 'Luz', 'Áudio', 'Maquinaria', 'Monitoração', 'Acessório', 'Outro'];
export const camLetter = i => String.fromCharCode(65 + i);

export function toast(msg, ms = 3200) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}
