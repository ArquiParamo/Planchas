const config = window.PLANCHAS_CONFIG;
const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";

const state = {
  view: "presentacion",
  scale: 1,
  x: 0,
  y: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  startX: 0,
  startY: 0
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let pdfjsPromise;
const boardPdfEntries = new Map();
const boardRenderTasks = new Map();

function getBoardUrl(board, download = false) {
  const base = board.route || `${config.pdfReleaseBaseUrl}/${board.fileName}`;
  const separator = base.includes("?") ? "&" : "?";
  return download ? `${base}${separator}download=1` : base;
}

function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS_URL).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function applyPan() {
  const content = $("#presentationContent");
  if (!content) return;
  content.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
}

function contentBounds() {
  const viewport = $("#presentationViewport");
  const content = $("#presentationContent");
  if (!viewport || !content) return null;
  return {
    viewportWidth: viewport.clientWidth,
    viewportHeight: viewport.clientHeight,
    contentWidth: content.scrollWidth,
    contentHeight: content.scrollHeight
  };
}

function recenterPresentation() {
  const bounds = contentBounds();
  if (!bounds || !bounds.contentWidth || !bounds.contentHeight) return;
  const padding = 28;
  const scaleX = (bounds.viewportWidth - padding * 2) / bounds.contentWidth;
  const scaleY = (bounds.viewportHeight - padding * 2) / bounds.contentHeight;
  state.scale = Math.max(0.16, Math.min(1, scaleX, scaleY));
  state.x = Math.round((bounds.viewportWidth - bounds.contentWidth * state.scale) / 2);
  state.y = Math.round((bounds.viewportHeight - bounds.contentHeight * state.scale) / 2);
  applyPan();
}

function zoomAt(delta, originX, originY) {
  const viewport = $("#presentationViewport");
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const beforeScale = state.scale;
  const nextScale = Math.max(0.16, Math.min(2.8, state.scale * delta));
  if (nextScale === beforeScale) return;
  const x = originX - rect.left;
  const y = originY - rect.top;
  const contentX = (x - state.x) / beforeScale;
  const contentY = (y - state.y) / beforeScale;
  state.scale = nextScale;
  state.x = x - contentX * nextScale;
  state.y = y - contentY * nextScale;
  applyPan();
}

function renderBoardPanels() {
  const strip = $("#boardsStrip");
  strip.innerHTML = config.boards
    .map(
      (board) => `
        <article class="board-panel" data-board-panel="${board.id}">
          <header>
            <span>${board.title}</span>
            <a href="${getBoardUrl(board)}" target="_blank" rel="noreferrer" aria-label="Abrir ${board.title}">
              <i data-lucide="external-link" aria-hidden="true"></i>
            </a>
          </header>
          <div class="board-canvas-shell" data-board-shell="${board.id}">
            <p class="pdf-loader" data-board-loader="${board.id}">Cargando ${board.fileName}</p>
            <canvas data-board-canvas="${board.id}" aria-label="${board.title} renderizada desde PDF original"></canvas>
          </div>
        </article>
      `
    )
    .join("");
}

async function loadBoardPage(board) {
  const shell = document.querySelector(`[data-board-shell="${board.id}"]`);
  const loader = document.querySelector(`[data-board-loader="${board.id}"]`);
  try {
    const pdfjs = await getPdfJs();
    const pdf = await pdfjs.getDocument({ url: getBoardUrl(board), withCredentials: false }).promise;
    const page = await pdf.getPage(1);
    boardPdfEntries.set(board.id, { pdf, page });
    await renderBoardPage(board.id);
    loader?.classList.add("is-hidden");
    shell?.classList.add("is-loaded");
  } catch (error) {
    if (loader) loader.textContent = "No se pudo cargar esta plancha.";
    console.error(error);
  }
}

async function renderBoardPage(boardId) {
  const entry = boardPdfEntries.get(boardId);
  const shell = document.querySelector(`[data-board-shell="${boardId}"]`);
  const canvas = document.querySelector(`[data-board-canvas="${boardId}"]`);
  if (!entry || !shell || !canvas) return;

  const previous = boardRenderTasks.get(boardId);
  if (previous) previous.cancel();

  const pageViewport = entry.page.getViewport({ scale: 1 });
  const targetWidth = Math.max(260, shell.clientWidth - 18);
  const scale = targetWidth / pageViewport.width;
  const viewport = entry.page.getViewport({ scale });
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  const context = canvas.getContext("2d");

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

  const task = entry.page.render({ canvasContext: context, viewport });
  boardRenderTasks.set(boardId, task);
  await task.promise.catch((error) => {
    if (error?.name !== "RenderingCancelledException") throw error;
  });
  boardRenderTasks.delete(boardId);
}

async function renderAllBoardPages() {
  await Promise.all([...boardPdfEntries.keys()].map((boardId) => renderBoardPage(boardId)));
}

async function loadBoards() {
  renderBoardPanels();
  if (window.lucide) window.lucide.createIcons();
  await Promise.all(config.boards.map((board) => loadBoardPage(board)));
  requestAnimationFrame(recenterPresentation);
}

function renderCanva() {
  const presentation = config.presentation;
  $("#canvaExternal").href = presentation.canvaShareUrl;
  $("#canvaExternal").textContent = "Abrir Canva";
  const shell = $("#canvaFrameShell");
  const loader = $("#canvaLoader");
  shell.innerHTML = "";
  if (presentation.canvaEmbedAvailable && presentation.canvaEmbedUrl) {
    const iframe = document.createElement("iframe");
    iframe.src = presentation.canvaEmbedUrl;
    iframe.title = presentation.canvaTitle;
    iframe.loading = "lazy";
    iframe.allowFullscreen = true;
    iframe.allow = "fullscreen";
    shell.append(iframe);
    return;
  }
  const notice = document.createElement("div");
  notice.className = "canva-notice";
  notice.innerHTML = `
    <p class="eyebrow">Canva no embebido</p>
    <h3>${presentation.canvaTitle}</h3>
    <p>El enlace actual no entrega un visor público embebible. Se conserva el acceso externo a Canva sin usar una presentación local como reemplazo.</p>
  `;
  const link = document.createElement("a");
  link.className = "primary-link";
  link.href = presentation.canvaShareUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Abrir Canva";
  notice.append(link);
  shell.append(notice);
  if (loader) loader.remove();
}

function renderRenders() {
  $("#renderGrid").innerHTML = config.renders
    .map(
      (render, index) => `
        <button class="render-card" type="button" data-render="${index}">
          <img src="${render.src}" alt="${render.title}" loading="lazy" />
          <span>${render.title}</span>
        </button>
      `
    )
    .join("");
}

function setView(viewName) {
  state.view = viewName;
  $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === `view-${viewName}`));
  $$(".nav-button").forEach((button) => button.classList.toggle("is-active", button.dataset.view === viewName));
  $("#sourcePill").textContent = viewName === "renders" ? `${config.renders.length} renders` : "Presentación";
  if (viewName === "presentacion") requestAnimationFrame(recenterPresentation);
}

function startPan(event) {
  if (event.button !== 0) return;
  const viewport = $("#presentationViewport");
  state.isPanning = true;
  state.panStartX = event.clientX;
  state.panStartY = event.clientY;
  state.startX = state.x;
  state.startY = state.y;
  viewport.classList.add("is-panning");
  viewport.setPointerCapture(event.pointerId);
}

function movePan(event) {
  if (!state.isPanning) return;
  state.x = state.startX + event.clientX - state.panStartX;
  state.y = state.startY + event.clientY - state.panStartY;
  applyPan();
}

function endPan(event) {
  const viewport = $("#presentationViewport");
  state.isPanning = false;
  viewport.classList.remove("is-panning");
  if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
}

function bindEvents() {
  $$(".nav-button").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  $("#resetView").addEventListener("click", recenterPresentation);
  $("#fitBoard").addEventListener("click", recenterPresentation);
  $("#zoomIn").addEventListener("click", () => zoomAt(1.18, window.innerWidth / 2, window.innerHeight / 2));
  $("#zoomOut").addEventListener("click", () => zoomAt(1 / 1.18, window.innerWidth / 2, window.innerHeight / 2));

  const viewport = $("#presentationViewport");
  viewport.addEventListener("pointerdown", startPan);
  viewport.addEventListener("pointermove", movePan);
  viewport.addEventListener("pointerup", endPan);
  viewport.addEventListener("pointercancel", endPan);
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
  }, { passive: false });

  $("#renderGrid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-render]");
    if (!card) return;
    const render = config.renders[Number(card.dataset.render)];
    $("#renderPreview").src = render.src;
    $("#renderPreview").alt = render.title;
    $("#renderCaption").textContent = render.title;
    $("#renderDialog").showModal();
  });
  $("#closeRender").addEventListener("click", () => $("#renderDialog").close());
  $("#renderDialog").addEventListener("click", (event) => {
    if (event.target.id === "renderDialog") $("#renderDialog").close();
  });

  window.addEventListener("resize", async () => {
    await renderAllBoardPages();
    recenterPresentation();
  });
}

async function init() {
  renderCanva();
  renderRenders();
  bindEvents();
  await loadBoards();
  setView("presentacion");
  if (window.lucide) window.lucide.createIcons();
}

init();
