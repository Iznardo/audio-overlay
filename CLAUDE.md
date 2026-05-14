# Podcast Audio Overlay para OBS

## Contexto del proyecto

Aplicación web local (sin backend, sin servidor) para reproducir audios enviados por oyentes durante un podcast en directo, mostrando un overlay animado en OBS Studio.

El flujo es:
1. El streamer recibe audios por Twitter/DMs.
2. Los carga en un **panel de control** privado.
3. Configura nombre y foto de perfil para cada audio.
4. Durante el directo, le da play al audio que toca.
5. Aparece un **overlay tipo lower-third** en OBS con animación de entrada, foto, nombre, waveform reactiva al audio real, y barra de progreso.
6. Al terminar (o al pulsar stop), el overlay desaparece con animación de salida.

## Visión a largo plazo: extensión open source para OBS

El objetivo es publicar esto como **paquete browser-source open source** que cualquier streamer pueda usar (no como plugin nativo C++ de OBS, que sería un proyecto distinto). El modelo es similar al de StreamElements/Streamlabs: el usuario añade una Browser Source apuntando a `overlay.html` (local o hosteado en GitHub Pages), y opcionalmente abre `control.html` como Custom Browser Dock dentro de OBS.

Para que sea utilizable por terceros la app debe permitir personalización sin tocar código: tamaño, posición, dirección de animación y todos los colores se controlan desde un panel de ajustes dentro del control.

## Arquitectura

Dos páginas HTML independientes que se comunican vía `BroadcastChannel` API:

- **`control.html`** → Panel privado del streamer. Se abre en una pestaña normal del navegador. **No se captura en OBS.**
- **`overlay.html`** → Lo que se captura en OBS como **Browser Source**. Fondo transparente. Solo es visible cuando hay un audio reproduciéndose.

Comunicación entre ambos mediante `BroadcastChannel('podcast-overlay')` con mensajes tipo:
```js
{ type: 'PLAY', payload: { audioBlobId, avatarBlobId, name, duration, amplitudes } }
{ type: 'STOP' }
{ type: 'PAUSE' }
{ type: 'RESUME' }
{ type: 'SEEK', payload: { time } }
{ type: 'PROGRESS', payload: { currentTime, duration } } // overlay → control
{ type: 'ENDED' }                                        // overlay → control
{ type: 'PING' }                                         // control → overlay
{ type: 'PONG' }                                         // overlay → control
{ type: 'CONFIG_UPDATE', payload: { settings } }         // control → overlay
```

**Importante:** Los archivos de audio se cargan en el navegador con `URL.createObjectURL(file)` para que ambas páginas puedan acceder sin servidor. Como `BroadcastChannel` no transfiere `Blob` directamente entre pestañas de forma fiable, usaremos `IndexedDB` para almacenar los Blobs de audio y avatares, y enviaremos solo el `id` del audio por el canal. El overlay leerá el Blob de IndexedDB cuando reciba el mensaje PLAY.

## Stack técnico

- **HTML + CSS + JavaScript vanilla**. Sin frameworks, sin build step, sin npm.
- **Web Audio API** (`AudioContext` + `AnalyserNode`) para la waveform reactiva.
- **Canvas 2D** para dibujar la waveform.
- **IndexedDB** para persistir audios y avatares (vía wrapper sencillo en `js/db.js`).
- **localStorage** para persistir metadatos ligeros (lista de audios, nombres, orden).
- **BroadcastChannel API** para comunicación entre pestañas.
- Todo debe funcionar abriendo los HTML directamente con `file://` o servidos con un server estático simple (sin dependencias externas).

## Estructura de archivos

```
/
├── CLAUDE.md
├── README.md
├── control.html
├── overlay.html
├── css/
│   ├── control.css
│   └── overlay.css
├── js/
│   ├── db.js              # Wrapper de IndexedDB
│   ├── channel.js         # Wrapper de BroadcastChannel
│   ├── settings.js        # Gestión de configuración (persistencia + broadcast)
│   ├── control.js         # Lógica del panel
│   ├── overlay.js         # Lógica del overlay
│   └── waveform.js        # Renderizado de waveform en canvas
└── assets/
    ├── default-avatar.png # Avatar por defecto si el usuario no sube foto
    └── logo.png           # Logo del proyecto (cabecera del control)
```

## Especificación del panel de control (`control.html`)

### UI

- **Header**: Logo (`assets/logo.png`) + indicador de estado del overlay (conectado/desconectado) + botón **Ajustes** (icono engranaje, abre panel lateral de configuración) + botón "Abrir overlay" (abre `overlay.html` en nueva pestaña).
- **Zona de drop**: Drag & drop grande arriba donde arrastras múltiples archivos de audio a la vez. También botón "Seleccionar archivos" como fallback. Acepta `audio/*` (mp3, wav, ogg, m4a, etc.).
- **Lista de audios cargados**: Cada item muestra:
  - Foto de perfil (clickable para cambiar; abre selector de imagen)
  - Input editable con el nombre del oyente (placeholder: "Nombre del oyente")
  - Nombre del archivo (pequeño, gris)
  - Duración del audio (mm:ss)
  - Botón ▶ **Play** (grande, destacado)
  - Botón ⏸ **Pause** (solo visible cuando este audio está reproduciéndose)
  - Botón ⏹ **Stop** (solo visible cuando este audio está reproduciéndose)
  - Botón 🗑 **Eliminar**
  - Drag handle para reordenar items
- **Reproductor activo** (panel fijo abajo): Cuando hay un audio reproduciéndose, muestra nombre, barra de progreso, tiempo actual/total, controles globales (pause/resume/stop, seek arrastrando la barra).
- **Botón "Limpiar todo"** con confirmación.
- **Panel de ajustes** (slide-in lateral desde la derecha): controla todos los aspectos visuales del overlay (ver sección "Sistema de configuración" más abajo). Cualquier cambio se aplica al overlay en vivo vía BroadcastChannel.

### Comportamiento

- Al arrastrar archivos, crear entradas en IndexedDB y en el estado en memoria. Generar `id` único (crypto.randomUUID()).
- Al subir avatar, guardar el Blob en IndexedDB con su propio `id`.
- Persistir en `localStorage` la lista de audios con `{ id, name, audioBlobId, avatarBlobId, fileName, duration, order }`.
- Al recargar la página, restaurar la lista desde localStorage + IndexedDB.
- **Solo un audio puede reproducirse a la vez.** Si le das play a otro mientras hay uno activo, parar el actual y reproducir el nuevo (con animación de salida + entrada en el overlay).
- **Atajos de teclado**:
  - `Espacio` → pause/resume del audio activo
  - `Esc` → stop del audio activo
  - `↑` / `↓` → navegar entre audios de la lista
  - `Enter` → play del audio seleccionado

### Estilo

- Diseño limpio, oscuro (fondo `#1a1a1a`, texto `#fff`, acentos en `#6366f1` o similar).
- Tipografía sans-serif del sistema.
- Layout responsive básico, pensado para pantalla de ordenador.

## Especificación del overlay (`overlay.html`)

### UI

**Posición**: Lower-third. Ocupa la franja inferior de la pantalla, ~25-30% de la altura, ancho completo (o con márgenes laterales de ~5%).

**Composición visual** (de izquierda a derecha):
1. Foto de perfil circular (~120px de diámetro), con borde sutil y sombra.
2. Bloque central con:
   - Nombre del oyente (tipografía grande, ~32px, bold)
   - Línea de onda clásica (waveform) reactiva al audio. Anchura flexible, ~50% del overlay.
   - Barra de progreso fina debajo de la waveform, con tiempo actual y total a los lados (mm:ss).

**Fondo**: Rectángulo redondeado con fondo semi-transparente y un toque de blur (`backdrop-filter: blur(20px)`) si el navegador lo soporta. Color base `rgba(20, 20, 30, 0.85)`. Borde sutil en gradiente.

**Página body**: `background: transparent;` para que OBS pueda hacer chroma key innecesario; con Browser Source en OBS el fondo transparente funciona out of the box.

### Animaciones

- **Entrada**: Slide desde abajo + fade-in. Duración ~600ms, easing `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot ligero tipo "spring"). El overlay parte de `translateY(120%)` y va a `translateY(0)`.
- **Reproduciendo**:
  - Waveform reactiva en tiempo real con `AnalyserNode.getByteTimeDomainData()`. **Línea de onda clásica**: trazar una polilínea suavizada en el canvas que represente la forma de onda del audio en ese instante. Color del trazo en gradiente (de `#6366f1` a `#ec4899`), grosor ~3px, con un ligero glow (`shadow-blur`).
  - Barra de progreso que avanza linealmente con `currentTime / duration`.
  - Tiempo actual actualizado cada 100ms.
- **Salida**: Slide hacia abajo + fade-out, duración ~400ms, easing `ease-in`. Una vez termina, el overlay queda `display: none`.

### Comportamiento

- Al cargar `overlay.html`, conectarse al BroadcastChannel y quedar en estado idle (invisible).
- Al recibir `PLAY`:
  1. Leer Blob del audio y avatar desde IndexedDB.
  2. Crear `<audio>` element, conectarlo al AudioContext con un MediaElementSource → AnalyserNode → destination.
  3. Actualizar nombre y foto.
  4. Ejecutar animación de entrada.
  5. Empezar reproducción.
  6. Empezar loop de renderizado de waveform con `requestAnimationFrame`.
  7. Emitir `PROGRESS` periódicamente.
- Al recibir `PAUSE`/`RESUME`: pausar/reanudar el audio. La waveform se congela durante pause.
- Al recibir `STOP` o al evento `ended` del audio: ejecutar animación de salida, parar todo, emitir `ENDED`.
- Al recibir `SEEK`: actualizar `audio.currentTime`.

### Estilo

- Tipografía sans-serif moderna (system-ui, -apple-system, "Segoe UI", Roboto).
- Colores principales: blanco/gris claro para texto, gradiente índigo→rosa para acentos.
- Sombras y blur sutiles para sensación premium.

## Sistema de configuración

Toda la personalización del overlay vive en un único objeto `settings` que se persiste en `localStorage` (clave: `reportados:settings`) y se broadcastea al overlay vía `BroadcastChannel` en cada cambio.

### Defaults

```js
const DEFAULT_SETTINGS = {
  size: 'large',                  // 'large' | 'small'
  positionH: 'center',            // 'left' | 'center' | 'right'
  positionV: 'bottom',            // 'top' | 'bottom'
  animation: 'from-bottom',       // 'from-top' | 'from-bottom' | 'from-left' | 'from-right'
  colors: {
    background: '#b2020b',        // color base del banner
    backgroundOpacity: 0.80,      // 0..1
    text: '#000000',              // nombre + tiempos
    waveformFilled: '#000000',    // barras ya reproducidas
    waveformEmpty: 'rgba(0,0,0,0.25)', // barras pendientes
    avatarBorder: '#000000',      // marco circular del avatar
  },
};
```

### Módulo `js/settings.js`

API pública:
- `getSettings()` → devuelve el objeto completo (clonado).
- `updateSettings(patch)` → merge profundo, persiste y emite `CONFIG_UPDATE`.
- `resetSettings()` → vuelve a `DEFAULT_SETTINGS`.
- `subscribe(fn)` → registra callback que se invoca cuando cambian (usado por el overlay).

### Mapeo settings → CSS / Canvas

**En el overlay**, al recibir `CONFIG_UPDATE` (o al cargar):
1. Actualizar clases del wrapper `.overlay-position`:
   - Tamaño: `.size-large` / `.size-small`
   - Posición: `.pos-h-{left|center|right}` y `.pos-v-{top|bottom}`
   - Animación: `.anim-{from-top|from-bottom|from-left|from-right}`
2. Actualizar variables CSS en `:root` del overlay:
   - `--card-bg` → `rgba(...)` compuesto desde `background` + `backgroundOpacity`
   - `--text` → `colors.text`
   - `--avatar-border` → `colors.avatarBorder`
3. Llamar a `waveform.setColors({ filled, unfilled })` para que el canvas use los nuevos colores.

### Tamaños

- **Large** (defecto): `width: 90%`, `avatar: 120px`, `name: 32px`, `waveform-height: 56px`.
- **Small**: `width: 45%`, `avatar: 80px`, `name: 22px`, `waveform-height: 40px`.

### Posicionamiento (sin romper animaciones)

Se introduce un wrapper de posicionamiento separado del elemento que anima:

```html
<div class="overlay-position pos-h-center pos-v-bottom">
  <div class="overlay anim-from-bottom">
    <div class="card">...</div>
  </div>
</div>
```

El wrapper `.overlay-position` controla `top/bottom/left/right` y centrado (sin transforms). El `.overlay` interno se encarga solo de los `transform` de las animaciones (translateY/translateX), sin conflictos.

### Animaciones

Cada dirección tiene su par de keyframes `slide-in-{dir}` y `slide-out-{dir}`. Easing/duración compartidos:
- entrada: 600ms `cubic-bezier(0.34, 1.56, 0.64, 1)`
- salida: 400ms `ease-in`

## Detalles técnicos importantes

### Web Audio + reactividad
```js
const audioCtx = new AudioContext();
const source = audioCtx.createMediaElementSource(audioEl);
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 2048;
source.connect(analyser);
analyser.connect(audioCtx.destination);

const dataArray = new Uint8Array(analyser.fftSize);

function draw() {
  analyser.getByteTimeDomainData(dataArray);
  // dibujar polilínea en canvas con dataArray
  requestAnimationFrame(draw);
}
```

### IndexedDB wrapper mínimo (`js/db.js`)
Implementar funciones:
- `dbInit()` → abre la DB con un object store `blobs` (key: id, value: Blob)
- `dbPutBlob(id, blob)` → guarda
- `dbGetBlob(id)` → recupera Blob, devolver `URL.createObjectURL(blob)` para usar como src
- `dbDeleteBlob(id)` → elimina

### Reordenar lista
Usar drag & drop nativo de HTML5 con `draggable="true"` y eventos `dragstart`/`dragover`/`drop`. No usar librerías externas.

### Edge cases a manejar
- Archivo que no es audio válido → mostrar error y no añadir a la lista.
- AudioContext suspendido (Chrome lo suspende hasta interacción) → resumir con `audioCtx.resume()` en el primer play.
- IndexedDB lleno → mostrar error claro.
- Overlay abierto sin panel → mostrar mensaje "Esperando audio..." invisible (debug mode con `?debug=1` en URL para verlo).
- Panel sin overlay abierto → indicador rojo "Overlay no conectado". Detectar respondiendo a un `PING` que mande el panel cada 2s y que el overlay responde con `PONG`.

## README.md

Generar también un `README.md` con:
- Qué es el proyecto.
- Cómo arrancarlo (abrir `control.html` en Chrome, abrir `overlay.html` en otra pestaña).
- Cómo configurarlo en OBS:
  1. Añadir fuente → Browser Source
  2. URL: ruta local a `overlay.html` (o `http://localhost:8000/overlay.html` si se sirve con `python -m http.server`)
  3. Ancho 1920, alto 1080
  4. Marcar "Refrescar navegador cuando la escena se active"
- Atajos de teclado.
- Troubleshooting (audio no se oye → click en la página primero por la política de autoplay de Chrome).

## Criterios de aceptación

- [ ] Puedo arrastrar 5 audios de golpe y aparecen todos en la lista.
- [ ] Puedo cambiar el nombre y foto de cada audio.
- [ ] Si cierro y reabro `control.html`, los audios siguen ahí.
- [ ] Le doy play a un audio y aparece el overlay con animación de slide desde abajo.
- [ ] La línea de onda reacciona al audio que está sonando.
- [ ] La barra de progreso avanza correctamente.
- [ ] Si le doy stop o termina el audio, el overlay desaparece con animación.
- [ ] Si le doy play a otro audio mientras hay uno activo, el overlay hace transición limpia.
- [ ] OBS captura el overlay con fondo transparente sin chroma key.
- [ ] Los atajos de teclado funcionan.

## Estilo de código

- JavaScript moderno (ES2022+, módulos con `<script type="module">`).
- Funciones pequeñas y nombres descriptivos.
- Sin dependencias externas (ni jQuery, ni nada).
- Comentarios breves solo cuando aporten valor.
- CSS con variables (`:root { --color-accent: ... }`) para fácil customización.

## Empieza por

1. Crear la estructura de carpetas.
2. Implementar `js/db.js` y `js/channel.js` primero (la base).
3. Luego `overlay.html` + `overlay.js` + `waveform.js` (la parte visible).
4. Después `control.html` + `control.js`.
5. Probar el flujo completo.
6. Generar `README.md`.

## Roadmap open source

El proyecto se va a publicar como herramienta para la comunidad. Fases:

### Fase 1 — Producto listo (en curso)
- [x] Funcionalidad core (play, overlay, animaciones, waveform whatsapp-style).
- [ ] Sistema de configuración (`js/settings.js`, panel lateral, mensaje `CONFIG_UPDATE`).
- [ ] i18n básico (es/en) con un objeto plano de strings.
- [ ] Cleanup de `console.log` y código muerto.
- [ ] Manejo robusto de errores (archivo corrupto, IndexedDB llena, etc.).

### Fase 2 — Release open source
- [ ] `LICENSE` MIT.
- [ ] `README.md` con screenshots, GIFs, badges, guía de instalación en OBS.
- [ ] `CHANGELOG.md` + tags semánticos.
- [ ] `CONTRIBUTING.md`.
- [ ] GitHub Pages activado para servir `overlay.html` y `control.html` desde una URL pública.
- [ ] GitHub Releases con ZIPs descargables.
- [ ] Post en foro `obsproject.com` sección Resources.

### Fase 3 — Comunidad
- [ ] Export/import de presets de configuración (JSON descargable).
- [ ] Galería de themes pre-hechos seleccionables desde el panel.
- [ ] Atajos de teclado configurables.

### Restricciones que no debemos romper
- **Mismo origen para BroadcastChannel**: control.html y overlay.html deben servirse desde la misma URL (o ambos `file://` desde la misma carpeta).
- **Sin build step**: el proyecto debe seguir siendo HTML/CSS/JS plano, sin npm, sin transpiladores.
- **Sin backend**: todo client-side.
- **Compatibilidad CEF**: el overlay debe verse igual en Chrome y en el CEF embebido de OBS.
