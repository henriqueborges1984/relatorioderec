// Receives an audio note from the app and returns the text with punctuation.
// The OpenAI key stays here, on Netlify (environment variable OPENAI_API_KEY), never in the app.
// RDS_PASSCODE: access code typed once in the app settings, so strangers can't use your credit.
const MAX_BYTES = 5.5 * 1024 * 1024;

export default async (req) => {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const pass = process.env.RDS_PASSCODE || '';
  if (!pass || req.headers.get('x-rds-key') !== pass) return json(401, { error: 'Código de acesso inválido.' });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json(500, { error: 'OPENAI_API_KEY não configurada no Netlify.' });
  let form;
  try { form = await req.formData(); } catch { return json(400, { error: 'Envio inválido.' }); }
  const file = form.get('file');
  if (!file || typeof file === 'string' || !file.size) return json(400, { error: 'Nenhum áudio recebido.' });
  if (file.size > MAX_BYTES) return json(413, { error: 'Áudio grande demais (máx. ~5 MB, cerca de 5 minutos).' });
  const vocab = String(form.get('vocab') || '').slice(0, 900);
  const out = new FormData();
  out.append('file', file, file.name || 'nota.webm');
  out.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
  out.append('language', 'pt');
  out.append('response_format', 'json');
  out.append('prompt', `${vocab} Transcreva com pontuação correta em português (vírgulas, pontos, interrogação e exclamação conforme a entonação). Se a pessoa falar a pontuação ("vírgula", "ponto"), escreva o sinal.`.trim());
  try {
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: out });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json(r.status === 401 ? 502 : r.status, { error: j?.error?.message || `OpenAI respondeu ${r.status}` });
    return json(200, { text: j.text || '' });
  } catch (e) {
    return json(502, { error: 'Falha ao falar com a OpenAI: ' + (e?.message || e) });
  }
};
