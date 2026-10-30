// Photos and videos: resize, thumbnails, in-app 720p video recorder
const loadImg = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
function canvasJpeg(src, sw, sh, max, q) {
  const r = Math.min(1, max / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * r)), h = Math.max(1, Math.round(sh * r));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(src, 0, 0, w, h);
  return { cv, w, h, toBlob: () => new Promise(res => cv.toBlob(b => res(b), 'image/jpeg', q)), dataUrl: () => cv.toDataURL('image/jpeg', q) };
}
// returns {blob, thumb, tw, th, w, h}
export async function processPhoto(file) {
  let bmp = null, w, h;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = bmp.width; h = bmp.height; }
  catch { const url = URL.createObjectURL(file); try { bmp = await loadImg(url); w = bmp.naturalWidth; h = bmp.naturalHeight; } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); } }
  const big = canvasJpeg(bmp, w, h, 2200, 0.86);
  const th = canvasJpeg(bmp, w, h, 360, 0.72);
  return { blob: await big.toBlob(), thumb: th.dataUrl(), tw: th.w, th: th.h, w: big.w, h: big.h };
}
export async function videoPoster(fileOrBlob) {
  const url = URL.createObjectURL(fileOrBlob);
  try {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(res, 4000); });
    try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); await new Promise(res => { v.onseeked = res; setTimeout(res, 1500); }); } catch {}
    if (!v.videoWidth) return { thumb: '', tw: 0, th: 0, dur: v.duration || 0 };
    const t = canvasJpeg(v, v.videoWidth, v.videoHeight, 360, 0.7);
    return { thumb: t.dataUrl(), tw: t.w, th: t.h, dur: isFinite(v.duration) ? v.duration : 0 };
  } catch { return { thumb: '', tw: 0, th: 0, dur: 0 }; }
  finally { setTimeout(() => URL.revokeObjectURL(url), 3000); }
}
export class VideoRecorder {
  async open(videoEl) {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: true });
    videoEl.srcObject = this.stream; videoEl.muted = true; await videoEl.play().catch(() => {});
    this.el = videoEl;
  }
  start() {
    const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
    this.chunks = []; this.mime = mime; this.t0 = Date.now();
    this.mr = new MediaRecorder(this.stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 96_000 });
    this.mime = this.mr.mimeType || mime || 'video/webm';
    this.mr.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.mr.start(1000);
  }
  get size() { return (this.chunks || []).reduce((a, b) => a + b.size, 0); }
  stop() {
    return new Promise(res => {
      if (!this.mr || this.mr.state === 'inactive') return res(null);
      this.mr.onstop = () => res(new Blob(this.chunks, { type: this.mime.split(';')[0] }));
      this.mr.stop();
    });
  }
  close() { try { this.stream?.getTracks().forEach(t => t.stop()); } catch {} if (this.el) this.el.srcObject = null; this.stream = null; }
}
export const extFor = mime => /jpeg|jpg/.test(mime) ? 'jpg' : /png/.test(mime) ? 'png' : /heic/.test(mime) ? 'heic' : /mp4/.test(mime) ? 'mp4' : /quicktime|mov/.test(mime) ? 'mov' : /webm/.test(mime) ? 'webm' : /ogg/.test(mime) ? 'ogg' : /m4a|aac/.test(mime) ? 'm4a' : 'bin';
