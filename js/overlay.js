import { dbInit, dbGetBlob } from './db.js';
import { createChannel, MSG } from './channel.js';
import { createWaveform } from './waveform.js';
import { getSettings, hexToRgba } from './settings.js';

const positionEl     = document.getElementById('overlay-position');
const overlayEl      = document.getElementById('overlay');
const audioEl        = document.getElementById('audio');
const avatarEl       = document.getElementById('avatar');
const nameEl         = document.getElementById('name');
const canvasEl       = document.getElementById('waveform');
const timeCurrentEl  = document.getElementById('time-current');
const timeTotalEl    = document.getElementById('time-total');
const debugEl        = document.getElementById('debug');
const enableAudioBtn = document.getElementById('enable-audio');

const debugMode = new URLSearchParams(location.search).has('debug');
if (debugMode) debugEl.hidden = false;

const channel = createChannel();

// Waveform renderer (estilo barras / WhatsApp)
const waveform = createWaveform(canvasEl);
waveform.setProgressGetter(() => {
  const dur = audioEl.duration;
  if (!dur || !isFinite(dur) || dur === 0) return 0;
  return audioEl.currentTime / dur;
});

let progressTimer   = null;
let currentAudioUrl = null;
let currentAvatarUrl = null;
let exitTimeout     = null;

// ── Settings ─────────────────────────────────────────────────────────

const SIZE_CLASSES   = ['size-large', 'size-small'];
const POS_H_CLASSES  = ['pos-h-left', 'pos-h-center', 'pos-h-right'];
const POS_V_CLASSES  = ['pos-v-top', 'pos-v-bottom'];
const ANIM_CLASSES   = ['anim-from-top', 'anim-from-bottom', 'anim-from-left', 'anim-from-right'];

function applySettings(settings) {
  if (!settings) return;

  // Clases del wrapper
  positionEl.classList.remove(...SIZE_CLASSES, ...POS_H_CLASSES, ...POS_V_CLASSES);
  positionEl.classList.add(`size-${settings.size}`);
  positionEl.classList.add(`pos-h-${settings.positionH}`);
  positionEl.classList.add(`pos-v-${settings.positionV}`);

  // Animación: si cambia mientras NO está visible, aplicar de inmediato.
  // Si está visible, esperamos al siguiente ciclo de play.
  if (!overlayEl.classList.contains('show')) {
    overlayEl.classList.remove(...ANIM_CLASSES);
    overlayEl.classList.add(`anim-${settings.animation}`);
  } else {
    // Cuando termine este ciclo, aplicar para el próximo
    overlayEl.dataset.pendingAnim = `anim-${settings.animation}`;
  }

  // Variables CSS
  const c = settings.colors || {};
  document.documentElement.style.setProperty(
    '--card-bg', hexToRgba(c.background, c.backgroundOpacity)
  );
  document.documentElement.style.setProperty('--text', c.text || '#000000');
  document.documentElement.style.setProperty('--avatar-border', c.avatarBorder || '#000000');

  // Colores del canvas
  waveform.setColors({
    filled: c.waveformFilled || '#000000',
    empty:  c.waveformEmpty  || 'rgba(0,0,0,0.25)',
  });
}

function applyPendingAnim() {
  const pending = overlayEl.dataset.pendingAnim;
  if (pending) {
    overlayEl.classList.remove(...ANIM_CLASSES);
    overlayEl.classList.add(pending);
    delete overlayEl.dataset.pendingAnim;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function setDebug(text) {
  if (debugMode) debugEl.textContent = text;
}

function revokeUrls() {
  if (currentAudioUrl)  { URL.revokeObjectURL(currentAudioUrl);  currentAudioUrl  = null; }
  if (currentAvatarUrl) { URL.revokeObjectURL(currentAvatarUrl); currentAvatarUrl = null; }
}

function clearProgressTimer() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
}

function startProgressTimer() {
  clearProgressTimer();
  progressTimer = setInterval(() => {
    const cur = audioEl.currentTime;
    const dur = audioEl.duration || 0;
    timeCurrentEl.textContent = fmtTime(cur);
    timeTotalEl.textContent   = fmtTime(dur);
    channel.send(MSG.PROGRESS, { currentTime: cur, duration: dur });
  }, 100);
}

function showOverlay() {
  if (exitTimeout) { clearTimeout(exitTimeout); exitTimeout = null; }
  overlayEl.classList.remove('hide');
  overlayEl.classList.remove('show');
  void overlayEl.offsetWidth; // reflow para reiniciar animación
  overlayEl.classList.add('show');
  overlayEl.setAttribute('aria-hidden', 'false');
}

function hideOverlay() {
  return new Promise((resolve) => {
    overlayEl.classList.remove('show');
    overlayEl.classList.add('hide');
    overlayEl.setAttribute('aria-hidden', 'true');
    if (exitTimeout) clearTimeout(exitTimeout);
    exitTimeout = setTimeout(() => {
      overlayEl.classList.remove('hide');
      applyPendingAnim();
      resolve();
    }, 420);
  });
}

// ── Playback ─────────────────────────────────────────────────────────

async function tryStartPlayback(name) {
  try {
    await audioEl.play();
    enableAudioBtn.hidden = true;
    startProgressTimer();
    waveform.start();
    setDebug(`Reproduciendo: ${name || ''}`);
  } catch (err) {
    console.warn('[overlay] Reproducción bloqueada por autoplay.', err);
    setDebug('Haz clic en el overlay para activar audio');
    enableAudioBtn.hidden = false;
  }
}

async function handlePlay(payload) {
  const { audioBlobId, avatarBlobId, name, amplitudes: payloadAmplitudes } = payload || {};
  if (!audioBlobId) return;

  if (!audioEl.paused) audioEl.pause();
  clearProgressTimer();
  waveform.stop();
  revokeUrls();

  try {
    // 1. Obtener blob de audio
    const audioBlob = await dbGetBlob(audioBlobId);
    if (!audioBlob) {
      console.warn('[overlay] Audio no encontrado en IndexedDB:', audioBlobId);
      setDebug('Audio no encontrado en IndexedDB');
      return;
    }

    // 2. Amplitudes pre-generadas en el panel (sin delay)
    if (payloadAmplitudes?.length) {
      waveform.setAmplitudes(payloadAmplitudes);
    }

    // 3. Preparar reproducción
    currentAudioUrl = URL.createObjectURL(audioBlob);
    audioEl.src = currentAudioUrl;

    // 4. Avatar
    if (avatarBlobId) {
      const avatarBlob = await dbGetBlob(avatarBlobId);
      if (avatarBlob) {
        currentAvatarUrl = URL.createObjectURL(avatarBlob);
        avatarEl.src = currentAvatarUrl;
      } else {
        avatarEl.src = 'assets/default-avatar.png';
      }
    } else {
      avatarEl.src = 'assets/default-avatar.png';
    }

    nameEl.textContent = name || 'Oyente';

    // 5. Mostrar overlay y reproducir
    showOverlay();
    await tryStartPlayback(name);

  } catch (err) {
    console.error('[overlay] Error en handlePlay', err);
    setDebug('Error: ' + err.message);
  }
}

async function handleStop() {
  audioEl.pause();
  audioEl.currentTime = 0;
  clearProgressTimer();
  waveform.stop();
  channel.send(MSG.ENDED);
  await hideOverlay();
  revokeUrls();
  setDebug('Esperando audio...');
}

function handlePause() {
  audioEl.pause();
  waveform.pause();
}

async function handleResume() {
  try {
    await audioEl.play();
    waveform.start();
    enableAudioBtn.hidden = true;
  } catch (e) {
    console.warn('[overlay] Resume bloqueado', e);
    enableAudioBtn.hidden = false;
  }
}

function handleSeek(payload) {
  const t = payload?.time;
  if (typeof t === 'number' && isFinite(t)) {
    audioEl.currentTime = Math.max(0, t);
  }
}

// ── Eventos del audio ────────────────────────────────────────────────

audioEl.addEventListener('ended', async () => {
  clearProgressTimer();
  waveform.stop();
  channel.send(MSG.ENDED);
  await hideOverlay();
  revokeUrls();
  setDebug('Esperando audio...');
});

audioEl.addEventListener('loadedmetadata', () => {
  timeTotalEl.textContent = fmtTime(audioEl.duration);
});

// ── Canal ────────────────────────────────────────────────────────────

channel.on(MSG.PLAY,          handlePlay);
channel.on(MSG.STOP,          handleStop);
channel.on(MSG.PAUSE,         handlePause);
channel.on(MSG.RESUME,        handleResume);
channel.on(MSG.SEEK,          handleSeek);
channel.on(MSG.PING,          () => channel.send(MSG.PONG));
channel.on(MSG.CONFIG_UPDATE, (payload) => applySettings(payload?.settings));

enableAudioBtn.addEventListener('click', async () => {
  await tryStartPlayback(nameEl.textContent);
});

// ── Init ─────────────────────────────────────────────────────────────

(async () => {
  await dbInit();
  applySettings(getSettings());
  setDebug('Esperando audio...');
  channel.send(MSG.PONG);
})();
