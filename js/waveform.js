const NUM_BARS = 60;

// Analiza el blob de audio completo y devuelve un array de amplitudes [0-1]
export async function analyzeAudioBlob(blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const tempCtx = new AudioContext();
    const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
    await tempCtx.close();

    const data = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(data.length / NUM_BARS);
    const amplitudes = new Array(NUM_BARS);

    for (let i = 0; i < NUM_BARS; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, data.length);
      let rms = 0;
      for (let j = start; j < end; j++) rms += data[j] * data[j];
      amplitudes[i] = Math.sqrt(rms / (end - start));
    }

    const max = Math.max(...amplitudes, 0.001);
    return amplitudes.map(a => a / max);
  } catch (e) {
    console.warn('[waveform] analyzeAudioBlob falló', e);
    // Fallback: forma de onda plana
    return new Array(NUM_BARS).fill(0.5);
  }
}

// Renderer de waveform estilo WhatsApp: barras estáticas con fill de progreso
export function createWaveform(canvas) {
  const ctx = canvas.getContext('2d');
  let amplitudes = null;
  let rafId = null;
  let running = false;
  let getProgress = () => 0;
  let dpr = window.devicePixelRatio || 1;
  let colorFilled = '#000000';
  let colorEmpty  = 'rgba(0,0,0,0.25)';

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width * dpr);
    const h = Math.floor(rect.height * dpr);
    if (w > 0 && h > 0) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  const ro = new ResizeObserver(() => { resize(); draw(); });
  ro.observe(canvas);
  resize();

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bars = amplitudes || buildIdleBars();
    const num = bars.length;
    const slotW = w / num;
    const barW = Math.max(2 * dpr, slotW * 0.55);
    const progress = getProgress();

    for (let i = 0; i < num; i++) {
      const x = i * slotW + (slotW - barW) / 2;
      const barH = Math.max(3 * dpr, bars[i] * h * 0.88);
      const y = (h - barH) / 2;
      const r = Math.min(barW / 2, 3 * dpr);

      ctx.fillStyle = (i / num) < progress ? colorFilled : colorEmpty;

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, barW, barH, r);
      } else {
        ctx.rect(x, y, barW, barH);
      }
      ctx.fill();
    }
  }

  function buildIdleBars() {
    return Array.from({ length: NUM_BARS }, (_, i) =>
      0.08 + 0.07 * Math.abs(Math.sin(i * 0.55))
    );
  }

  function loop() {
    if (!running) return;
    draw();
    rafId = requestAnimationFrame(loop);
  }

  return {
    setAmplitudes(data) {
      amplitudes = data;
      draw();
    },
    setProgressGetter(fn) {
      getProgress = fn;
    },
    setColors({ filled, empty } = {}) {
      if (filled) colorFilled = filled;
      if (empty)  colorEmpty  = empty;
      draw();
    },
    start() {
      if (running) return;
      running = true;
      loop();
    },
    stop() {
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      amplitudes = null; // vuelve al estado idle
      draw();
    },
    pause() {
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    },
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    destroy() {
      this.stop();
      ro.disconnect();
    },
  };
}
