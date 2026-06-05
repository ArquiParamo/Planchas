const config = window.PLANCHAS_CONFIG;
const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";

const state = {
  view: "planchas",
  boardId: config.boards[0].id,
  presentationMode: "pdf",
  slide: 1,
  zoom: "fit",
  zoomScale: 1
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let pdfjsPromise;
let activePdf;
let activePage;
let activeRenderTask;
let renderToken = 0;
let presentationPdf;
let presentationRenderTask;
let inlinePresentationRenderTask;
let presentationPageCount = 0;
let presentationToken = 0;
let boardsLoadStarted = false;
const boardPdfEntries = new Map();
const boardRenderTasks = new Map();

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function getBoardUrl(board, download = false) {
  const base = board.route || `${config.pdfReleaseBaseUrl}/${board.fileName}`;
  const separator = base.includes("?") ? "&" : "?";
  return download ? `${base}${separator}download=1` : base;
}

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS_URL).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function renderBoardList() {
  const boardList = $("#boardList");
  boardList.innerHTML = config.boards
    .map(
      (board) => `
        <button class="board-card" type="button" data-board="${board.id}">
          <span>
            <strong>${board.title}</strong>
            <small>${board.fileName} - ${formatBytes(board.sizeBytes)}</small>
          </span>
          <small>PDF</small>
        </button>
      `
    )
    .join("");
}

function renderBoardPanels() {
  const strip = $("#boardsStrip");
  if (!strip) return;
  strip.innerHTML = config.boards
    .map(
      (board) => `
        <article class="board-panel" data-board-panel="${board.id}">
          <header class="board-panel-header">
            <h3>${board.title}</h3>
            <span>${formatBytes(board.sizeBytes)}</span>
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

function renderBoard() {
  const board = config.boards.find((item) => item.id === state.boardId) || config.boards[0];
  $$(".board-card").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.board === board.id);
  });
  $$(".board-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.boardPanel === board.id);
  });

  $("#currentBoardTitle").textContent = "4 planchas originales";
  $("#openBoard").href = getBoardUrl(board).split("#")[0];
  $("#downloadBoard").href = getBoardUrl(board, true);
  $("#downloadBoard").setAttribute("download", board.fileName);
  $("#sourcePill").textContent = "4 PDFs originales";
  $("#boardMeta").innerHTML = `
    <div>
      <dt>Vista</dt>
      <dd>Las 4 planchas se cargan juntas desde la release de GitHub.</dd>
    </div>
    <div>
      <dt>Documento seleccionado</dt>
      <dd>${board.title} - ${formatBytes(board.sizeBytes)}</dd>
    </div>
    <div>
      <dt>SHA-256 seleccionado</dt>
      <dd>${board.sha256}</dd>
    </div>
  `;
  loadAllBoards();
}

async function loadAllBoards() {
  if (boardsLoadStarted) {
    await renderAllBoardPages();
    return;
  }
  boardsLoadStarted = true;
  await Promise.all(config.boards.map((board) => loadBoardPage(board)));
}

async function loadBoardPage(board) {
  const loader = document.querySelector(`[data-board-loader="${board.id}"]`);
  try {
    const pdfjs = await getPdfJs();
    const loadingTask = pdfjs.getDocument({
      url: getBoardUrl(board),
      rangeChunkSize: 1024 * 1024,
      disableStream: false,
      disableAutoFetch: true
    });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    boardPdfEntries.set(board.id, { pdf, page });
    await renderBoardPage(board.id);
    loader?.classList.add("is-hidden");
  } catch (error) {
    if (loader) loader.textContent = "No se pudo dibujar este PDF. Usa Abrir para verlo.";
    console.error(error);
  }
}

async function renderAllBoardPages() {
  await Promise.all([...boardPdfEntries.keys()].map((boardId) => renderBoardPage(boardId)));
}

async function renderBoardPage(boardId) {
  const entry = boardPdfEntries.get(boardId);
  if (!entry?.page) return;
  const previousTask = boardRenderTasks.get(boardId);
  if (previousTask) {
    previousTask.cancel();
    boardRenderTasks.delete(boardId);
  }

  const shell = document.querySelector(`[data-board-shell="${boardId}"]`);
  const canvas = document.querySelector(`[data-board-canvas="${boardId}"]`);
  if (!shell || !canvas) return;

  const context = canvas.getContext("2d");
  const baseViewport = entry.page.getViewport({ scale: 1 });
  const shellWidth = Math.max(shell.clientWidth - 24, 240);
  const shellHeight = Math.max(shell.clientHeight - 24, 320);
  const fitScale = Math.min(shellWidth / baseViewport.width, shellHeight / baseViewport.height);
  const scale = fitScale * state.zoomScale;
  const viewport = entry.page.getViewport({ scale });
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);

  const task = entry.page.render({ canvasContext: context, viewport });
  boardRenderTasks.set(boardId, task);
  await task.promise;
  if (boardRenderTasks.get(boardId) === task) {
    boardRenderTasks.delete(boardId);
  }
}

function recenterBoards() {
  state.zoom = "fit";
  state.zoomScale = 1;
  const viewport = $("#boardsViewport");
  if (viewport) {
    viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }
  renderAllBoardPages();
}

function scrollBoardIntoView(boardId) {
  document.querySelector(`[data-board-panel="${boardId}"]`)?.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "center"
  });
}

async function loadPdfBoard(board) {
  const token = ++renderToken;
  const loader = $("#pdfLoader");
  loader.textContent = `Cargando ${board.fileName} original`;
  loader.classList.remove("is-hidden");

  if (activeRenderTask) {
    activeRenderTask.cancel();
    activeRenderTask = null;
  }
  if (activePdf) {
    activePdf.destroy();
    activePdf = null;
    activePage = null;
  }

  try {
    const pdfjs = await getPdfJs();
    const loadingTask = pdfjs.getDocument({
      url: getBoardUrl(board),
      rangeChunkSize: 1024 * 1024,
      disableStream: false,
      disableAutoFetch: false
    });
    const pdf = await loadingTask.promise;
    if (token !== renderToken) return;
    activePdf = pdf;
    activePage = await pdf.getPage(1);
    if (token !== renderToken) return;
    await renderActivePage();
    loader.classList.add("is-hidden");
  } catch (error) {
    if (token !== renderToken) return;
    loader.textContent = "No se pudo dibujar el PDF original. Usa Abrir para verlo en una pestana.";
    console.error(error);
  }
}

async function renderActivePage() {
  if (!activePage) return;
  if (activeRenderTask) {
    activeRenderTask.cancel();
    activeRenderTask = null;
  }

  const shell = $("#pdfCanvasShell");
  const canvas = $("#boardCanvas");
  const context = canvas.getContext("2d");
  const baseViewport = activePage.getViewport({ scale: 1 });
  const shellWidth = Math.max(shell.clientWidth - 48, 300);
  const shellHeight = Math.max(shell.clientHeight - 48, 300);
  const fitScale = Math.min(shellWidth / baseViewport.width, shellHeight / baseViewport.height);
  const scale = state.zoom === "fit" ? fitScale : state.zoomScale;
  const viewport = activePage.getViewport({ scale });
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);

  activeRenderTask = activePage.render({ canvasContext: context, viewport });
  await activeRenderTask.promise;
  activeRenderTask = null;
}

function renderPresentation() {
  const presentation = config.presentation;
  $("#canvaExternal").href = presentation.canvaShareUrl;
  $("#canvaExternal").textContent = presentation.canvaTitle;
  $("#canvaFrameLink").href = presentation.canvaShareUrl;
  $("#canvaFrameLink").textContent = presentation.canvaTitle;
  if ($("#inlineCanvaExternal")) {
    $("#inlineCanvaExternal").href = presentation.canvaShareUrl;
    $("#inlineCanvaExternal").textContent = presentation.canvaTitle;
  }
  updatePresentationMode();
  loadPresentationPdf();
}

async function loadPresentationPdf() {
  const token = ++presentationToken;
  const loaders = [$("#presentationLoader"), $("#inlinePresentationLoader")].filter(Boolean);
  loaders.forEach((loader) => {
    loader.textContent = "Cargando presentacion";
    loader.classList.remove("is-hidden");
  });

  try {
    const pdfjs = await getPdfJs();
    const loadingTask = pdfjs.getDocument({ url: config.presentation.localPdfUrl });
    const pdf = await loadingTask.promise;
    if (token !== presentationToken) return;
    presentationPdf = pdf;
    presentationPageCount = pdf.numPages;
    state.slide = Math.min(state.slide, presentationPageCount);
    await renderPresentationSlide();
    loaders.forEach((loader) => loader.classList.add("is-hidden"));
  } catch (error) {
    if (token !== presentationToken) return;
    loaders.forEach((loader) => {
      loader.textContent = "No se pudo dibujar la presentacion local.";
    });
    console.error(error);
  }
}

function updateSlideControls() {
  const statusText = presentationPageCount
    ? `Diapositiva ${state.slide} / ${presentationPageCount}`
    : "Diapositiva";
  ["#slideStatus", "#inlineSlideStatus"].forEach((selector) => {
    const status = $(selector);
    if (status) status.textContent = statusText;
  });
  ["#prevSlide", "#inlinePrevSlide"].forEach((selector) => {
    const button = $(selector);
    if (button) button.disabled = !presentationPageCount || state.slide <= 1;
  });
  ["#nextSlide", "#inlineNextSlide"].forEach((selector) => {
    const button = $(selector);
    if (button) button.disabled = !presentationPageCount || state.slide >= presentationPageCount;
  });
}

async function renderPresentationSlide() {
  if (!presentationPdf) return;
  updateSlideControls();
  if (presentationRenderTask) {
    presentationRenderTask.cancel();
    presentationRenderTask = null;
  }

  const page = await presentationPdf.getPage(state.slide);
  const shell = $("#presentationCanvasShell");
  const canvas = $("#presentationCanvas");
  const context = canvas.getContext("2d");
  const baseViewport = page.getViewport({ scale: 1 });
  const shellWidth = Math.max(shell.clientWidth - 36, 300);
  const shellHeight = Math.max(shell.clientHeight - 36, 260);
  const scale = Math.min(shellWidth / baseViewport.width, shellHeight / baseViewport.height);
  const viewport = page.getViewport({ scale });
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);

  presentationRenderTask = page.render({ canvasContext: context, viewport });
  await presentationRenderTask.promise;
  presentationRenderTask = null;
  await renderInlinePresentationSlide();
}

async function renderInlinePresentationSlide() {
  if (!presentationPdf || !$("#inlinePresentationCanvasShell") || !$("#inlinePresentationCanvas")) return;
  if (inlinePresentationRenderTask) {
    inlinePresentationRenderTask.cancel();
    inlinePresentationRenderTask = null;
  }

  const page = await presentationPdf.getPage(state.slide);
  const shell = $("#inlinePresentationCanvasShell");
  const canvas = $("#inlinePresentationCanvas");
  const context = canvas.getContext("2d");
  const baseViewport = page.getViewport({ scale: 1 });
  const shellWidth = Math.max(shell.clientWidth - 36, 300);
  const shellHeight = Math.max(shell.clientHeight - 36, 300);
  const scale = Math.min(shellWidth / baseViewport.width, shellHeight / baseViewport.height);
  const viewport = page.getViewport({ scale });
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);

  inlinePresentationRenderTask = page.render({ canvasContext: context, viewport });
  await inlinePresentationRenderTask.promise;
  inlinePresentationRenderTask = null;
}

async function changePresentationSlide(delta) {
  if (!presentationPageCount) return;
  const nextSlide = Math.min(Math.max(state.slide + delta, 1), presentationPageCount);
  if (nextSlide === state.slide) return;
  state.slide = nextSlide;
  await renderPresentationSlide();
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

function renderLinks() {
  $("#accessGrid").innerHTML = config.links
    .map(
      (link) => `
        <article class="access-card">
          <div>
            <h2>${link.title}</h2>
            <p>${link.note}</p>
          </div>
          <a class="primary-link" href="${link.url}" target="_blank" rel="noreferrer">${link.label}</a>
        </article>
      `
    )
    .join("");
}

function setView(viewName) {
  state.view = viewName;
  $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === `view-${viewName}`));
  $$(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewName);
  });
  if (viewName === "presentacion") $("#sourcePill").textContent = "Canva / PDF V3";
  if (viewName === "renders") $("#sourcePill").textContent = `${config.renders.length} renders`;
  if (viewName === "accesos") $("#sourcePill").textContent = "Accesos";
  if (viewName === "planchas") {
    $("#sourcePill").textContent = "4 PDFs originales";
  }
  if (viewName === "presentacion" && state.presentationMode === "pdf") {
    requestAnimationFrame(() => renderPresentationSlide());
  }
}

function updatePresentationMode() {
  $$(".segment").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.presentationMode === state.presentationMode);
  });
  $("#canvaFrame").classList.toggle("is-active", state.presentationMode === "canva");
  $("#presentationPdf").classList.toggle("is-active", state.presentationMode === "pdf");
  if (state.presentationMode === "pdf") {
    requestAnimationFrame(() => renderPresentationSlide());
  }
}

function bindEvents() {
  $("#boardList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-board]");
    if (!button) return;
    state.boardId = button.dataset.board;
    renderBoard();
    scrollBoardIntoView(state.boardId);
  });

  $$(".nav-button").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  $$(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      state.presentationMode = button.dataset.presentationMode;
      updatePresentationMode();
    });
  });

  $("#fullscreenBoard").addEventListener("click", async () => {
    const frameWrap = $("#boardsViewport");
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await frameWrap.requestFullscreen();
    }
  });

  $("#fitBoard").addEventListener("click", async () => {
    recenterBoards();
  });

  $("#zoomIn").addEventListener("click", async () => {
    state.zoom = "manual";
    state.zoomScale = Math.min(state.zoomScale + 0.2, 3);
    await renderAllBoardPages();
  });

  $("#zoomOut").addEventListener("click", async () => {
    state.zoom = "manual";
    state.zoomScale = Math.max(state.zoomScale - 0.2, 0.45);
    await renderAllBoardPages();
  });

  ["#prevSlide", "#inlinePrevSlide"].forEach((selector) => {
    $(selector)?.addEventListener("click", () => changePresentationSlide(-1));
  });

  ["#nextSlide", "#inlineNextSlide"].forEach((selector) => {
    $(selector)?.addEventListener("click", () => changePresentationSlide(1));
  });

  window.addEventListener("resize", () => {
    renderAllBoardPages();
    if (state.presentationMode === "pdf") renderPresentationSlide();
  });

  $("#resetView")?.addEventListener("click", () => {
    recenterBoards();
  });

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
}

function init() {
  renderBoardList();
  renderBoardPanels();
  renderBoard();
  renderPresentation();
  renderRenders();
  renderLinks();
  bindEvents();
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

init();
