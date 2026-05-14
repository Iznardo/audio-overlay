const CHANNEL_NAME = 'podcast-overlay';

export const MSG = {
  PLAY: 'PLAY',
  STOP: 'STOP',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  SEEK: 'SEEK',
  PROGRESS: 'PROGRESS',
  ENDED: 'ENDED',
  PING: 'PING',
  PONG: 'PONG',
  CONFIG_UPDATE: 'CONFIG_UPDATE',
};

export function createChannel() {
  const bc = new BroadcastChannel(CHANNEL_NAME);
  const listeners = new Map();

  bc.onmessage = (ev) => {
    const { type, payload } = ev.data || {};
    const fns = listeners.get(type);
    if (fns) {
      for (const fn of fns) {
        try { fn(payload, ev.data); } catch (e) { console.error(e); }
      }
    }
    const anyFns = listeners.get('*');
    if (anyFns) {
      for (const fn of anyFns) {
        try { fn(ev.data); } catch (e) { console.error(e); }
      }
    }
  };

  return {
    send(type, payload) {
      bc.postMessage({ type, payload });
    },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    close() {
      bc.close();
    },
  };
}
