const config = window.PLANCHAS_CONFIG;
const LARGE_IMAGE_SCALE = 0.36;
const DETAIL_IMAGE_SCALE = 0.58;

const state = {
  view: "presentacion",
  scale: 1,
  x: 0,
  y: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  startX: 0,
  startY: 0,
  render: {
    scale: 1,
    x: 0,
    y: 0,
    isPanning: false,
    startX: 0,
    startY: 0,
    panStartX: 0,
    panStartY: 0,
    pointers: new Map(),
    pinchDistance: 0,
    pinchScale: 1
  }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function getBoardPdfUrl(board) {
  return board.pdfOriginalUrl || board.route || `${config.pdfReleaseBaseUrl}/${board.fileName}`;
}

function getBoardDownloadUrl(board) {
  const base = board.pdfRoute || board.route || board.pdfOriginalUrl || `${config.pdfReleaseBaseUrl}/${board.fileName}`;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}download=1`;
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
  const viewportRect = viewport.getBoundingClientRect();
  const sidebarRect = $(".sidebar")?.getBoundingClientRect();
  const insets = { left: 0, right: 0, top: 0, bottom: 0 };
  if (sidebarRect) {
    const overlapsX = sidebarRect.right > viewportRect.left && sidebarRect.left < viewportRect.right;
    const overlapsY = sidebarRect.bottom > viewportRect.top && sidebarRect.top < viewportRect.bottom;
    if (overlapsX && overlapsY && window.innerWidth > 900) {
      insets.left = Math.max(0, sidebarRect.right - viewportRect.left + 16);
    } else if (overlapsX && overlapsY) {
      insets.bottom = Math.max(0, viewportRect.bottom - sidebarRect.top + 16);
    }
  }
  return {
    viewportWidth: viewport.clientWidth,
    viewportHeight: viewport.clientHeight,
    contentWidth: content.scrollWidth,
    contentHeight: content.scrollHeight,
    insets
  };
}

function recenterPresentation() {
  const bounds = contentBounds();
  if (!bounds || !bounds.contentWidth || !bounds.contentHeight) return;
  const padding = 28;
  const availableWidth = Math.max(1, bounds.viewportWidth - bounds.insets.left - bounds.insets.right);
  const availableHeight = Math.max(1, bounds.viewportHeight - bounds.insets.top - bounds.insets.bottom);
  const scaleX = (availableWidth - padding * 2) / bounds.contentWidth;
  const scaleY = (availableHeight - padding * 2) / bounds.contentHeight;
  state.scale = clamp(Math.min(scaleX, scaleY), 0.14, 1);
  state.x = Math.round(bounds.insets.left + (availableWidth - bounds.contentWidth * state.scale) / 2);
  state.y = Math.round(bounds.insets.top + (availableHeight - bounds.contentHeight * state.scale) / 2);
  applyPan();
}

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function setFullscreenButtonState() {
  const button = $("#fitBoard");
  if (!button) return;
  const isFullscreen = Boolean(getFullscreenElement());
  button.setAttribute("aria-pressed", String(isFullscreen));
  button.title = isFullscreen ? "Salir de pantalla completa" : "Ampliar presentación";
  button.setAttribute("aria-label", button.title);
}

async function togglePresentationFullscreen() {
  const fullscreenElement = getFullscreenElement();
  if (fullscreenElement) {
    const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
    if (exitFullscreen) await exitFullscreen.call(document);
    return;
  }

  if (state.view !== "presentacion") setView("presentacion");
  const target = $(".app-shell") || document.documentElement;
  const requestFullscreen = target.requestFullscreen || target.webkitRequestFullscreen;
  if (!requestFullscreen) {
    zoomAt(1.35, window.innerWidth / 2, window.innerHeight / 2);
    return;
  }

  try {
    await requestFullscreen.call(target);
    requestAnimationFrame(recenterPresentation);
  } catch {
    zoomAt(1.35, window.innerWidth / 2, window.innerHeight / 2);
  }
}

function zoomAt(delta, originX, originY) {
  const viewport = $("#presentationViewport");
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const beforeScale = state.scale;
  const nextScale = clamp(state.scale * delta, 0.14, 6.5);
  if (nextScale === beforeScale) return;
  const x = originX - rect.left;
  const y = originY - rect.top;
  const contentX = (x - state.x) / beforeScale;
  const contentY = (y - state.y) / beforeScale;
  state.scale = nextScale;
  state.x = x - contentX * nextScale;
  state.y = y - contentY * nextScale;
  applyPan();
  if (state.scale > DETAIL_IMAGE_SCALE) {
    upgradeBoardImages(true);
  } else if (state.scale > LARGE_IMAGE_SCALE) {
    upgradeBoardImages(false);
  }
}

function renderBoardPanels() {
  $("#boardsStrip").innerHTML = config.boards
    .map(
      (board, index) => `
        <article class="board-panel" data-board-panel="${board.id}">
          <header>
            <span>${board.title}</span>
            <span class="board-actions">
              <a href="${getBoardPdfUrl(board)}" target="_blank" rel="noreferrer" title="Abrir PDF original" aria-label="Abrir PDF original de ${board.title}">
                <i data-lucide="external-link" aria-hidden="true"></i>
              </a>
              <a href="${getBoardDownloadUrl(board)}" target="_blank" rel="noreferrer" title="Descargar PDF" aria-label="Descargar PDF de ${board.title}">
                <i data-lucide="download" aria-hidden="true"></i>
              </a>
            </span>
          </header>
          <div class="board-canvas-shell" data-board-shell="${board.id}" style="--board-preview: url('${board.previewSrc || board.largeSrc || ""}')">
            <img
              class="board-image"
              data-board-image="${board.id}"
              data-large-src="${board.largeSrc || ""}"
              data-detail-src="${board.detailSrc || ""}"
              data-quality="${board.previewSrc ? "preview" : board.largeSrc ? "large" : ""}"
              src="${board.previewSrc || board.largeSrc || ""}"
              alt="${board.title}"
              loading="eager"
              decoding="async"
              fetchpriority="${index < 4 ? "high" : "auto"}"
            />
          </div>
        </article>
      `
    )
    .join("");

  $$(".board-image").forEach((image) => {
    image.addEventListener("load", () => image.closest(".board-canvas-shell")?.classList.add("is-loaded"));
    image.addEventListener("error", () => {
      const shell = image.closest(".board-canvas-shell");
      shell?.classList.add("is-error");
      shell?.insertAdjacentHTML("beforeend", '<p class="pdf-loader">No se pudo cargar la vista optimizada.</p>');
    });
  });
}

function upgradeBoardImages(useDetail = false) {
  $$(".board-image").forEach((image) => {
    const nextQuality = useDetail && image.dataset.detailSrc ? "detail" : "large";
    const nextSrc = nextQuality === "detail" ? image.dataset.detailSrc : image.dataset.largeSrc;
    if (!nextSrc || image.dataset.quality === nextQuality || image.dataset.quality === "detail" || image.dataset.loadingLarge === "true") return;
    image.dataset.loadingLarge = "true";
    const large = new Image();
    large.decoding = "async";
    large.onload = () => {
      image.src = nextSrc;
      image.dataset.quality = nextQuality;
      image.dataset.loadingLarge = "false";
      image.closest(".board-canvas-shell")?.classList.add(`is-${nextQuality}`);
    };
    large.onerror = () => {
      image.dataset.loadingLarge = "false";
    };
    large.src = nextSrc;
  });
}

function scheduleLargeBoardUpgrade() {
  const run = () => {
    if (state.scale > LARGE_IMAGE_SCALE) upgradeBoardImages(false);
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 2500 });
  } else {
    window.setTimeout(run, 1800);
  }
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
    <p>El enlace actual no entrega un visor público embebible. Cuando Canva genere un iframe público, este espacio lo mostrará directamente.</p>
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
          <img src="${render.src}" alt="${render.title}" loading="${index < 3 ? "eager" : "lazy"}" decoding="async" />
          <span>${render.title}</span>
        </button>
      `
    )
    .join("");
}

function setView(viewName) {
  state.view = viewName;
  $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === `view-${viewName}`));
  $$(".view-switch").forEach((button) => button.classList.toggle("is-active", button.dataset.view === viewName));
  $("#sourcePill").textContent = viewName === "renders" ? `${config.renders.length} renders` : "Presentación";
  if (viewName === "presentacion") requestAnimationFrame(recenterPresentation);
}

function startPan(event) {
  if (event.button !== 0 || event.target.closest("a, button")) return;
  const viewport = $("#presentationViewport");
  if (state.scale > DETAIL_IMAGE_SCALE) {
    upgradeBoardImages(true);
  } else if (state.scale > LARGE_IMAGE_SCALE) {
    upgradeBoardImages(false);
  }
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

function resetRenderZoom() {
  state.render.scale = 1;
  state.render.x = 0;
  state.render.y = 0;
  state.render.isPanning = false;
  state.render.pointers.clear();
  applyRenderZoom();
}

function applyRenderZoom() {
  const image = $("#renderPreview");
  if (!image) return;
  image.style.transform = `translate(${state.render.x}px, ${state.render.y}px) scale(${state.render.scale})`;
  $("#renderStage")?.classList.toggle("is-zoomed", state.render.scale > 1.01);
}

function renderZoomAt(delta) {
  state.render.scale = clamp(state.render.scale * delta, 1, 5.5);
  if (state.render.scale === 1) {
    state.render.x = 0;
    state.render.y = 0;
  }
  applyRenderZoom();
}

function openRender(index) {
  const render = config.renders[index];
  if (!render) return;
  $("#renderPreview").src = render.src;
  $("#renderPreview").alt = render.title;
  $("#renderCaption").textContent = render.title;
  resetRenderZoom();
  $("#renderDialog").showModal();
}

function normalizeWheelDelta(event, target) {
  const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return dominantDelta * 28;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return dominantDelta * target.clientWidth;
  return dominantDelta;
}

function handleRenderWheel(event) {
  if (state.view !== "renders" || event.ctrlKey || $("#renderDialog")?.open) return;
  const grid = $("#renderGrid");
  if (!grid || grid.scrollWidth <= grid.clientWidth) return;
  const delta = normalizeWheelDelta(event, grid);
  if (!delta) return;
  event.preventDefault();
  grid.scrollLeft += delta;
}

function renderPoint(event) {
  return { x: event.clientX, y: event.clientY };
}

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function startRenderPointer(event) {
  const stage = $("#renderStage");
  state.render.pointers.set(event.pointerId, renderPoint(event));
  stage.setPointerCapture(event.pointerId);
  if (state.render.pointers.size === 1) {
    state.render.isPanning = true;
    state.render.panStartX = event.clientX;
    state.render.panStartY = event.clientY;
    state.render.startX = state.render.x;
    state.render.startY = state.render.y;
  }
  if (state.render.pointers.size === 2) {
    const [first, second] = [...state.render.pointers.values()];
    state.render.pinchDistance = pointDistance(first, second);
    state.render.pinchScale = state.render.scale;
  }
}

function moveRenderPointer(event) {
  if (!state.render.pointers.has(event.pointerId)) return;
  state.render.pointers.set(event.pointerId, renderPoint(event));
  if (state.render.pointers.size >= 2) {
    const [first, second] = [...state.render.pointers.values()];
    const distance = pointDistance(first, second);
    if (state.render.pinchDistance) {
      state.render.scale = clamp(state.render.pinchScale * (distance / state.render.pinchDistance), 1, 5.5);
      applyRenderZoom();
    }
    return;
  }
  if (state.render.isPanning && state.render.scale > 1.01) {
    state.render.x = state.render.startX + event.clientX - state.render.panStartX;
    state.render.y = state.render.startY + event.clientY - state.render.panStartY;
    applyRenderZoom();
  }
}

function endRenderPointer(event) {
  const stage = $("#renderStage");
  state.render.pointers.delete(event.pointerId);
  if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  state.render.isPanning = false;
  if (state.render.pointers.size === 1) {
    const [[remainingId, point]] = state.render.pointers.entries();
    state.render.isPanning = true;
    state.render.panStartX = point.x;
    state.render.panStartY = point.y;
    state.render.startX = state.render.x;
    state.render.startY = state.render.y;
    state.render.pointerId = remainingId;
  }
}

function bindEvents() {
  $$(".view-switch").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  $("#resetView").addEventListener("click", recenterPresentation);
  $("#fitBoard").addEventListener("click", togglePresentationFullscreen);
  $("#zoomIn").addEventListener("click", () => zoomAt(1.24, window.innerWidth / 2, window.innerHeight / 2));
  $("#zoomOut").addEventListener("click", () => zoomAt(1 / 1.24, window.innerWidth / 2, window.innerHeight / 2));

  const viewport = $("#presentationViewport");
  viewport.addEventListener("pointerdown", startPan);
  viewport.addEventListener("pointermove", movePan);
  viewport.addEventListener("pointerup", endPan);
  viewport.addEventListener("pointercancel", endPan);
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 1.14 : 1 / 1.14, event.clientX, event.clientY);
  }, { passive: false });

  $("#view-renders").addEventListener("wheel", handleRenderWheel, { passive: false });

  $("#renderGrid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-render]");
    if (!card) return;
    openRender(Number(card.dataset.render));
  });

  $("#closeRender").addEventListener("click", () => $("#renderDialog").close());
  $("#renderDialog").addEventListener("close", resetRenderZoom);
  $("#renderDialog").addEventListener("click", (event) => {
    if (event.target.id === "renderDialog") $("#renderDialog").close();
  });

  const renderStage = $("#renderStage");
  renderStage.addEventListener("wheel", (event) => {
    event.preventDefault();
    renderZoomAt(event.deltaY < 0 ? 1.16 : 1 / 1.16);
  }, { passive: false });
  renderStage.addEventListener("pointerdown", startRenderPointer);
  renderStage.addEventListener("pointermove", moveRenderPointer);
  renderStage.addEventListener("pointerup", endRenderPointer);
  renderStage.addEventListener("pointercancel", endRenderPointer);
  renderStage.addEventListener("dblclick", resetRenderZoom);

  window.addEventListener("resize", recenterPresentation);
  document.addEventListener("fullscreenchange", setFullscreenButtonState);
  document.addEventListener("webkitfullscreenchange", setFullscreenButtonState);
}

function init() {
  renderCanva();
  renderBoardPanels();
  renderRenders();
  bindEvents();
  requestAnimationFrame(recenterPresentation);
  window.addEventListener("load", scheduleLargeBoardUpgrade, { once: true });
  window.setTimeout(scheduleLargeBoardUpgrade, 2500);
  setView("presentacion");
  if (window.lucide) window.lucide.createIcons();
}

init();
