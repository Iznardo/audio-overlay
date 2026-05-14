import { dbInit, dbPutBlob, dbGetBlob, dbDeleteBlob, dbClear } from './db.js';
import { createChannel, MSG } from './channel.js';
import { analyzeAudioBlob } from './waveform.js';
import { getSettings, updateSettings, resetSettings, subscribe as subscribeSettings } from './settings.js';

const STORAGE_KEY = 'podcast-overlay:audios';
const PING_INTERVAL = 2000;
const PONG_TIMEOUT = 3500;

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const selectBtn = document.getElementById('select-files');
const listEl = document.getElementById('audio-list');
const emptyEl = document.getElementById('empty-state');
const countEl = document.getElementById('count');
const clearAllBtn = document.getElementById('clear-all');
const openOverlayBtn = document.getElementById('open-overlay');
const statusEl = document.getElementById('overlay-status');
const statusTextEl = statusEl.querySelector('.status-text');
const avatarInput = document.getElementById('avatar-input');
const itemTemplate = document.getElementById('item-template');

const activePlayer = document.getElementById('active-player');
const activeAvatar = document.getElementById('active-avatar');
const activeName = document.getElementById('active-name');
const activeCurrent = document.getElementById('active-current');
const activeTotal = document.getElementById('active-total');
const activeProgressTrack = document.getElementById('active-progress-track');
const activeProgressFill = document.getElementById('active-progress-fill');
const activePauseBtn = document.getElementById('active-pause');
const activeResumeBtn = document.getElementById('active-resume');
const activeStopBtn = document.getElementById('active-stop');

const channel = createChannel();

/** @type {{ id:string, name:string, audioBlobId:string, avatarBlobId:string|null, fileName:string, duration:number, order:number }[]} */
let audios = [];
let activeId = null;
let activeState = 'idle'; // idle | playing | paused
let activeDuration = 0;
let activeCurrentTime = 0;
let selectedId = null;
let avatarTargetId = null;
let lastPongAt = 0;
let pingTimer = null;

// ---------------- Persistence ----------------

function saveMeta() {
  const data = audios.map(a => ({
    id: a.id,
    name: a.name,
    audioBlobId: a.audioBlobId,
    avatarBlobId: a.avatarBlobId,
    fileName: a.fileName,
    duration: a.duration,
    amplitudes: a.amplitudes || null,
    order: a.order,
  }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('No se pudo guardar en localStorage', e);
  }
}

function loadMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch {
    return [];
  }
}

// ---------------- Helpers ----------------

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

async function getAudioDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    a.preload = 'metadata';
    a.src = url;
    a.addEventListener('loadedmetadata', () => {
      const d = a.duration;
      URL.revokeObjectURL(url);
      resolve(isFinite(d) ? d : 0);
    });
    a.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      resolve(0);
    });
  });
}

async function urlFromBlobId(id) {
  if (!id) return null;
  const blob = await dbGetBlob(id);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

// ---------------- Rendering ----------------

function updateCount() {
  countEl.textContent = String(audios.length);
  emptyEl.style.display = audios.length === 0 ? '' : 'none';
}

async function renderList() {
  listEl.innerHTML = '';
  for (const audio of audios) {
    const node = await renderItem(audio);
    listEl.appendChild(node);
  }
  updateCount();
  applySelectionHighlight();
}

async function renderItem(audio) {
  const frag = itemTemplate.content.cloneNode(true);
  const li = frag.querySelector('.item');
  li.dataset.id = audio.id;

  const avatarImg = li.querySelector('.item-avatar');
  const avatarBtn = li.querySelector('.avatar-btn');
  const nameInput = li.querySelector('.item-name');
  const fileNameEl = li.querySelector('.item-filename');
  const durEl = li.querySelector('.item-duration');
  const playBtn = li.querySelector('.btn--play');
  const pauseBtn = li.querySelector('.btn--pause');
  const stopBtn = li.querySelector('.btn--stop');
  const deleteBtn = li.querySelector('.btn--delete');

  // avatar
  let url = await urlFromBlobId(audio.avatarBlobId);
  avatarImg.src = url || 'assets/default-avatar.png';

  nameInput.value = audio.name || '';
  fileNameEl.textContent = audio.fileName;
  durEl.textContent = fmtTime(audio.duration);

  if (audio.id === activeId) {
    li.classList.add('is-active');
    if (activeState === 'playing') {
      playBtn.hidden = true;
      pauseBtn.hidden = false;
      stopBtn.hidden = false;
    } else if (activeState === 'paused') {
      playBtn.hidden = false;
      pauseBtn.hidden = true;
      stopBtn.hidden = false;
    }
  }

  // events
  nameInput.addEventListener('input', () => {
    audio.name = nameInput.value;
    saveMeta();
  });

  avatarBtn.addEventListener('click', () => {
    avatarTargetId = audio.id;
    avatarInput.click();
  });

  playBtn.addEventListener('click', () => {
    if (audio.id === activeId && activeState === 'paused') resumeActive();
    else playAudio(audio.id);
  });
  pauseBtn.addEventListener('click', () => pauseActive());
  stopBtn.addEventListener('click', () => stopActive());
  deleteBtn.addEventListener('click', () => deleteAudio(audio.id));

  li.addEventListener('click', (e) => {
    if (e.target.closest('input, button')) return;
    selectedId = audio.id;
    applySelectionHighlight();
  });

  // drag & drop reordering
  li.addEventListener('dragstart', (e) => {
    li.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', audio.id);
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('is-dragging');
    document.querySelectorAll('.item.is-drop-target').forEach(n => n.classList.remove('is-drop-target'));
  });
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    li.classList.add('is-drop-target');
  });
  li.addEventListener('dragleave', () => li.classList.remove('is-drop-target'));
  li.addEventListener('drop', (e) => {
    e.preventDefault();
    li.classList.remove('is-drop-target');
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === audio.id) return;
    reorder(draggedId, audio.id);
  });

  return li;
}

function applySelectionHighlight() {
  document.querySelectorAll('.item').forEach(n => {
    n.classList.toggle('is-selected', n.dataset.id === selectedId);
  });
}

function reorder(draggedId, targetId) {
  const fromIdx = audios.findIndex(a => a.id === draggedId);
  const toIdx = audios.findIndex(a => a.id === targetId);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = audios.splice(fromIdx, 1);
  audios.splice(toIdx, 0, moved);
  audios.forEach((a, i) => (a.order = i));
  saveMeta();
  renderList();
}

// ---------------- File handling ----------------

async function addFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(f.name));
  if (files.length === 0) {
    alert('Ningún archivo de audio válido detectado.');
    return;
  }
  for (const file of files) {
    try {
      const duration = await getAudioDuration(file);
      const id = uid();
      const audioBlobId = uid();
      await dbPutBlob(audioBlobId, file);
      const amplitudes = await analyzeAudioBlob(file);
      audios.push({
        id,
        name: '',
        audioBlobId,
        avatarBlobId: null,
        fileName: file.name,
        duration,
        amplitudes,
        order: audios.length,
      });
    } catch (err) {
      console.error('Error añadiendo archivo', file.name, err);
      alert(`No se pudo añadir "${file.name}": ${err.message}`);
    }
  }
  saveMeta();
  await renderList();
}

async function setAvatar(audioId, file) {
  const audio = audios.find(a => a.id === audioId);
  if (!audio) return;
  if (audio.avatarBlobId) await dbDeleteBlob(audio.avatarBlobId);
  const newId = uid();
  await dbPutBlob(newId, file);
  audio.avatarBlobId = newId;
  saveMeta();
  await renderList();
}

async function deleteAudio(id) {
  const audio = audios.find(a => a.id === id);
  if (!audio) return;
  if (activeId === id) await stopActive();
  await dbDeleteBlob(audio.audioBlobId);
  if (audio.avatarBlobId) await dbDeleteBlob(audio.avatarBlobId);
  audios = audios.filter(a => a.id !== id);
  audios.forEach((a, i) => (a.order = i));
  saveMeta();
  await renderList();
}

async function clearAll() {
  if (!audios.length) return;
  if (!confirm('¿Eliminar todos los audios cargados? Esta acción no se puede deshacer.')) return;
  await stopActive();
  await dbClear();
  audios = [];
  saveMeta();
  await renderList();
}

// ---------------- Playback control ----------------

async function playAudio(id) {
  const audio = audios.find(a => a.id === id);
  if (!audio) return;

  activeId = id;
  activeState = 'playing';
  activeDuration = audio.duration;
  activeCurrentTime = 0;

  channel.send(MSG.PLAY, {
    audioBlobId: audio.audioBlobId,
    avatarBlobId: audio.avatarBlobId,
    name: audio.name || 'Oyente',
    duration: audio.duration,
    amplitudes: audio.amplitudes || null,
  });

  await updateActivePlayerUI();
  await renderList();
}

async function pauseActive() {
  if (!activeId || activeState !== 'playing') return;
  activeState = 'paused';
  channel.send(MSG.PAUSE);
  updateActivePlayerControls();
  await renderList();
}

async function resumeActive() {
  if (!activeId || activeState !== 'paused') return;
  activeState = 'playing';
  channel.send(MSG.RESUME);
  updateActivePlayerControls();
  await renderList();
}

async function stopActive() {
  if (!activeId) return;
  channel.send(MSG.STOP);
  activeId = null;
  activeState = 'idle';
  activeDuration = 0;
  activeCurrentTime = 0;
  activePlayer.hidden = true;
  await renderList();
}

async function updateActivePlayerUI() {
  const audio = audios.find(a => a.id === activeId);
  if (!audio) {
    activePlayer.hidden = true;
    return;
  }
  activePlayer.hidden = false;
  activeName.textContent = audio.name || audio.fileName;
  activeTotal.textContent = fmtTime(audio.duration);
  activeCurrent.textContent = fmtTime(0);
  activeProgressFill.style.width = '0%';
  const url = await urlFromBlobId(audio.avatarBlobId);
  activeAvatar.src = url || 'assets/default-avatar.png';
  updateActivePlayerControls();
}

function updateActivePlayerControls() {
  if (activeState === 'playing') {
    activePauseBtn.hidden = false;
    activeResumeBtn.hidden = true;
  } else if (activeState === 'paused') {
    activePauseBtn.hidden = true;
    activeResumeBtn.hidden = false;
  }
}

function seekFromEvent(e) {
  if (!activeId || !activeDuration) return;
  const rect = activeProgressTrack.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const t = ratio * activeDuration;
  activeCurrentTime = t;
  activeProgressFill.style.width = (ratio * 100) + '%';
  activeCurrent.textContent = fmtTime(t);
  channel.send(MSG.SEEK, { time: t });
}

// ---------------- Overlay status (PING/PONG) ----------------

function setOverlayStatus(connected) {
  statusEl.classList.toggle('status--on', connected);
  statusEl.classList.toggle('status--off', !connected);
  statusTextEl.textContent = connected ? 'Overlay conectado' : 'Overlay no conectado';
}

function startPing() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = setInterval(() => {
    channel.send(MSG.PING);
    const connected = (Date.now() - lastPongAt) < PONG_TIMEOUT;
    setOverlayStatus(connected);
  }, PING_INTERVAL);
}

// ---------------- Channel listeners ----------------

channel.on(MSG.PONG, () => {
  const wasDisconnected = (Date.now() - lastPongAt) > PONG_TIMEOUT;
  lastPongAt = Date.now();
  setOverlayStatus(true);
  // Si el overlay acaba de conectarse, sincronizamos settings
  if (wasDisconnected) {
    channel.send(MSG.CONFIG_UPDATE, { settings: getSettings() });
  }
});

channel.on(MSG.PROGRESS, (payload) => {
  if (!activeId) return;
  const { currentTime, duration } = payload || {};
  activeCurrentTime = currentTime || 0;
  if (duration && duration > 0) activeDuration = duration;
  const pct = activeDuration > 0 ? (activeCurrentTime / activeDuration) * 100 : 0;
  activeProgressFill.style.width = pct + '%';
  activeCurrent.textContent = fmtTime(activeCurrentTime);
  if (activeDuration) activeTotal.textContent = fmtTime(activeDuration);
});

channel.on(MSG.ENDED, async () => {
  if (!activeId) return;
  activeId = null;
  activeState = 'idle';
  activePlayer.hidden = true;
  await renderList();
});

// ---------------- DOM events ----------------

dropZone.addEventListener('click', (e) => {
  if (e.target === selectBtn) return;
  fileInput.click();
});

dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

selectBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
  if (!e.target.files?.length) return;
  await addFiles(e.target.files);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach(ev => {
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('is-dragover');
  });
});

['dragleave', 'drop'].forEach(ev => {
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (ev === 'drop' || e.target === dropZone) dropZone.classList.remove('is-dragover');
  });
});

dropZone.addEventListener('drop', async (e) => {
  const files = e.dataTransfer?.files;
  if (files?.length) await addFiles(files);
});

// Prevent the browser from opening dropped files when missing the drop zone
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

avatarInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (file && avatarTargetId) await setAvatar(avatarTargetId, file);
  avatarTargetId = null;
  avatarInput.value = '';
});

clearAllBtn.addEventListener('click', clearAll);
openOverlayBtn.addEventListener('click', () => {
  window.open('overlay.html', '_blank', 'noopener');
});

activePauseBtn.addEventListener('click', pauseActive);
activeResumeBtn.addEventListener('click', resumeActive);
activeStopBtn.addEventListener('click', stopActive);

let seekingActive = false;
activeProgressTrack.addEventListener('pointerdown', (e) => {
  seekingActive = true;
  activeProgressTrack.setPointerCapture(e.pointerId);
  seekFromEvent(e);
});
activeProgressTrack.addEventListener('pointermove', (e) => {
  if (seekingActive) seekFromEvent(e);
});
activeProgressTrack.addEventListener('pointerup', (e) => {
  if (seekingActive) {
    seekFromEvent(e);
    seekingActive = false;
    activeProgressTrack.releasePointerCapture(e.pointerId);
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (activeState === 'playing') pauseActive();
    else if (activeState === 'paused') resumeActive();
    else if (selectedId) playAudio(selectedId);
    return;
  }

  if (e.key === 'Escape') {
    if (activeId) stopActive();
    return;
  }

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!audios.length) return;
    const idx = selectedId ? audios.findIndex(a => a.id === selectedId) : -1;
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    const next = idx === -1
      ? (dir > 0 ? 0 : audios.length - 1)
      : (idx + dir + audios.length) % audios.length;
    selectedId = audios[next].id;
    applySelectionHighlight();
    const li = listEl.querySelector(`.item[data-id="${selectedId}"]`);
    if (li) li.scrollIntoView({ block: 'nearest' });
    return;
  }

  if (e.key === 'Enter') {
    if (selectedId) playAudio(selectedId);
    return;
  }
});

// ---------------- Settings panel ----------------

const settingsPanel = document.getElementById('settings-panel');
const settingsBackdrop = document.getElementById('settings-backdrop');
const openSettingsBtn = document.getElementById('open-settings');
const closeSettingsBtn = document.getElementById('close-settings');
const resetSettingsBtn = document.getElementById('reset-settings');

function openSettings() {
  settingsPanel.classList.add('is-open');
  settingsPanel.setAttribute('aria-hidden', 'false');
  settingsBackdrop.hidden = false;
  requestAnimationFrame(() => settingsBackdrop.classList.add('is-visible'));
}

function closeSettings() {
  settingsPanel.classList.remove('is-open');
  settingsPanel.setAttribute('aria-hidden', 'true');
  settingsBackdrop.classList.remove('is-visible');
  setTimeout(() => { settingsBackdrop.hidden = true; }, 220);
}

function broadcastSettings() {
  channel.send(MSG.CONFIG_UPDATE, { settings: getSettings() });
}

function syncSettingsUI(settings) {
  // Segmented: size
  settingsPanel.querySelectorAll('[data-setting="size"] button').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.value === settings.size);
  });
  // Segmented: animation
  settingsPanel.querySelectorAll('[data-setting="animation"] button').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.value === settings.animation);
  });
  // Position grid
  settingsPanel.querySelectorAll('.position-grid button').forEach(btn => {
    const match = btn.dataset.h === settings.positionH && btn.dataset.v === settings.positionV;
    btn.classList.toggle('is-active', match);
  });
  // Colors
  for (const key of ['background', 'text', 'waveformFilled', 'avatarBorder']) {
    const input = settingsPanel.querySelector(`[data-color="${key}"]`);
    if (input) input.value = settings.colors[key] || '#000000';
  }
  // waveformEmpty viene en rgba — convertimos a hex aproximado para el picker
  const emptyInput = settingsPanel.querySelector('[data-color="waveformEmpty"]');
  if (emptyInput) emptyInput.value = extractHexFromRgba(settings.colors.waveformEmpty) || '#000000';
  // Opacity slider
  const rangeInput = settingsPanel.querySelector('[data-range="backgroundOpacity"]');
  const rangeOut = settingsPanel.querySelector('[data-output="backgroundOpacity"]');
  if (rangeInput) rangeInput.value = Math.round((settings.colors.backgroundOpacity ?? 0.8) * 100);
  if (rangeOut) rangeOut.textContent = Math.round((settings.colors.backgroundOpacity ?? 0.8) * 100) + '%';
}

function extractHexFromRgba(rgba) {
  if (!rgba) return null;
  if (rgba.startsWith('#')) return rgba;
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  const toHex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

function wireSettingsPanel() {
  openSettingsBtn.addEventListener('click', openSettings);
  closeSettingsBtn.addEventListener('click', closeSettings);
  settingsBackdrop.addEventListener('click', closeSettings);

  // Segmented (size + animation)
  settingsPanel.querySelectorAll('.settings-segmented').forEach(group => {
    const key = group.dataset.setting;
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        updateSettings({ [key]: btn.dataset.value });
        broadcastSettings();
      });
    });
  });

  // Position grid
  settingsPanel.querySelectorAll('.position-grid button').forEach(btn => {
    btn.addEventListener('click', () => {
      updateSettings({ positionH: btn.dataset.h, positionV: btn.dataset.v });
      broadcastSettings();
    });
  });

  // Color pickers
  settingsPanel.querySelectorAll('input[data-color]').forEach(input => {
    const key = input.dataset.color;
    input.addEventListener('input', () => {
      if (key === 'waveformEmpty') {
        // Mantenemos opacidad 0.25 al elegir desde el picker
        const m = input.value.replace('#', '');
        const r = parseInt(m.substring(0,2), 16);
        const g = parseInt(m.substring(2,4), 16);
        const b = parseInt(m.substring(4,6), 16);
        updateSettings({ colors: { waveformEmpty: `rgba(${r},${g},${b},0.25)` } });
      } else {
        updateSettings({ colors: { [key]: input.value } });
      }
      broadcastSettings();
    });
  });

  // Opacity slider
  const rangeInput = settingsPanel.querySelector('[data-range="backgroundOpacity"]');
  const rangeOut = settingsPanel.querySelector('[data-output="backgroundOpacity"]');
  if (rangeInput) {
    rangeInput.addEventListener('input', () => {
      const val = Number(rangeInput.value) / 100;
      rangeOut.textContent = rangeInput.value + '%';
      updateSettings({ colors: { backgroundOpacity: val } });
      broadcastSettings();
    });
  }

  // Reset
  resetSettingsBtn.addEventListener('click', () => {
    if (!confirm('¿Restablecer todos los ajustes a los valores por defecto?')) return;
    resetSettings();
    broadcastSettings();
  });

  // Mantener UI sincronizada con cualquier cambio (incluido reset)
  subscribeSettings(syncSettingsUI);

  // Estado inicial
  syncSettingsUI(getSettings());
}

// ---------------- Boot ----------------

(async function init() {
  await dbInit();
  const meta = loadMeta();
  // Drop entries whose audio blob is missing (e.g. DB cleared but localStorage stale)
  const valid = [];
  for (const m of meta) {
    const blob = await dbGetBlob(m.audioBlobId);
    if (blob) valid.push(m);
  }
  audios = valid;
  audios.forEach((a, i) => (a.order = i));
  saveMeta();
  await renderList();
  wireSettingsPanel();
  startPing();
  // Empuja settings al overlay por si está esperando
  broadcastSettings();
})();
