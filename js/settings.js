// Gestión central de la configuración del overlay.
// Persiste en localStorage y emite eventos cuando cambia.

const STORAGE_KEY = 'reportados:settings';

export const DEFAULT_SETTINGS = Object.freeze({
  size:      'large',          // 'large' | 'small'
  positionH: 'center',         // 'left' | 'center' | 'right'
  positionV: 'bottom',         // 'top' | 'bottom'
  animation: 'from-bottom',    // 'from-top' | 'from-bottom' | 'from-left' | 'from-right'
  colors: {
    background:        '#b2020b',
    backgroundOpacity: 0.80,
    text:              '#000000',
    waveformFilled:    '#000000',
    waveformEmpty:     'rgba(0,0,0,0.25)',
    avatarBorder:      '#000000',
  },
});

const subscribers = new Set();
let current = loadFromStorage();

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function deepMerge(target, patch) {
  const out = { ...target };
  for (const key of Object.keys(patch)) {
    const val = patch[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = deepMerge(target[key] || {}, val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    // merge con defaults para tolerar settings antiguos sin nuevas keys
    return deepMerge(clone(DEFAULT_SETTINGS), parsed);
  } catch (err) {
    console.warn('[settings] Error cargando, uso defaults', err);
    return clone(DEFAULT_SETTINGS);
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.warn('[settings] Error guardando', err);
  }
}

function notify() {
  const snapshot = clone(current);
  for (const fn of subscribers) {
    try { fn(snapshot); } catch (e) { console.error(e); }
  }
}

// ── API pública ──────────────────────────────────────────────────────

export function getSettings() {
  return clone(current);
}

export function updateSettings(patch) {
  current = deepMerge(current, patch);
  persist();
  notify();
  return clone(current);
}

export function resetSettings() {
  current = clone(DEFAULT_SETTINGS);
  persist();
  notify();
  return clone(current);
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// Helper para componer rgba desde hex + opacidad
export function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
