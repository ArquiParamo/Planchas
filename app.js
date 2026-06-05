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
let presentationPageCount = 0;
let presentationToken = 0;

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

function renderBoard() {
  const board = config.boards.find((item) => item.id === state.boardId) || config.boards[0];
  $$(".board-card").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.board === board.id);
  });

  $("#currentBoardTitle").textContent = board.title;
  $("#openBoard").href = getBoardUrl(board).split("#")[0];
  $("#downloadBoard").href = getBoardUrl(board, true);
  $("#downloadBoard").setAttribute("download", board.fileName);
  $("#sourcePill").textContent = `${board.fileName} original`;
  $("#boardMeta").innerHTML = `
    <div>
      <dt>Tamano</dt>
      <dd>${formatBytes(board.sizeBytes)} (${board.sizeBytes.toLocaleString("es-CO")} bytes)</dd>
    </div>
    <div>
      <dt>SHA-256</dt>
      <dd>${board.sha256}</dd>
    </div>
    <div>
      <dt>Origen local verificado</dt>
      <dd>${board.sourcePath}</dd>
    </div>
  `;
  loadPdfBoard(board);
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
  $("#canvaFrame").src = presentation.canvaEmbedUrl;
  $("#canvaExternal").href = presentation.canvaShareUrl;
  $("#canvaExternal").textContent = presentation.canvaTitle;
  loadPresentationPdf();
  updatePresentationMode();
}

async function loadPresentationPdf() {
  const token = ++presentationToken;
  const loader = $("#presentationLoader");
  loader.textContent = "Cargando presentacion";
  loader.classList.remove("is-hidden");

  try {
    const pdfjs = await getPdfJs();
    const loadingTask = pdfjs.getDocument({ url: config.presentation.localPdfUrl });
    const pdf = await loadingTask.promise;
    if (token !== presentationToken) return;
    presentationPdf = pdf;
    presentationPageCount = pdf.numPages;
    state.slide = Math.min(state.slide, presentationPageCount);
    await renderPresentationSlide();
    loader.classList.add("is-hidden");
  } catch (error) {
    if (token !== presentationToken) return;
    loader.textContent = "No se pudo dibujar la presentacion local.";
    console.error(error);
  }
}

async function renderPresentationSlide() {
  if (!presentationPdf) return;
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

  $("#slideStatus").textContent = `Diapositiva ${state.slide} / ${presentationPageCount}`;
  $("#prevSlide").disabled = state.slide <= 1;
  $("#nextSlide").disabled = state.slide >= presentationPageCount;

  presentationRenderTask = page.render({ canvasContext: context, viewport });
  await presentationRenderTask.promise;
  presentationRenderTask = null;
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
    const board = config.boards.find((item) => item.id === state.boardId) || config.boards[0];
    $("#sourcePill").textContent = `${board.fileName} original`;
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
    const frameWrap = $(".pdf-frame-wrap");
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await frameWrap.requestFullscreen();
    }
  });

  $("#fitBoard").addEventListener("click", async () => {
    state.zoom = "fit";
    await renderActivePage();
  });

  $("#zoomIn").addEventListener("click", async () => {
    const current = state.zoom === "fit" ? 1 : state.zoomScale;
    state.zoom = "manual";
    state.zoomScale = Math.min(current + 0.2, 4);
    await renderActivePage();
  });

  $("#zoomOut").addEventListener("click", async () => {
    const current = state.zoom === "fit" ? 1 : state.zoomScale;
    state.zoom = "manual";
    state.zoomScale = Math.max(current - 0.2, 0.25);
    await renderActivePage();
  });

  $("#prevSlide").addEventListener("click", async () => {
    if (state.slide <= 1) return;
    state.slide -= 1;
    await renderPresentationSlide();
  });

  $("#nextSlide").addEventListener("click", async () => {
    if (state.slide >= presentationPageCount) return;
    state.slide += 1;
    await renderPresentationSlide();
  });

  window.addEventListener("resize", () => {
    if (state.zoom === "fit") renderActivePage();
    if (state.presentationMode === "pdf") renderPresentationSlide();
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
  renderBoard();
  renderPresentation();
  renderRenders();
  renderLinks();
  bindEvents();
}

init();
