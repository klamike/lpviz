import { getState, mutate, setState, SolverMode } from "../../state/store";
import { ViewportManager } from "../viewport";
import { LayoutManager } from "../layout";
import { VRep, hasPolytopeLines } from "../../solvers/utils/polytope";
import { adjustFontSize, adjustLogoFontSize } from "../utils";
import { setElementDisplay } from "../../state/utils";
import { registerCanvasInteractions } from "./canvas";
import { saveToHistory, setupKeyboardHandlers, createUndoRedoHandler } from "../../state/history";
import { initializeControlPanel } from "./controlPanel";
import { createSharingHandlers } from "../../state/sharing";
import JSONCrush from "jsoncrush";
import { initializeResizeManager } from "../resize";
import { Tour as Tour, InactivityHelpOverlay } from "../tour/tour";
import { NonconvexHullHintOverlay } from "../../solvers/utils/polytope";
import type { ResultRenderPayload, VirtualResultPayload } from "../../solvers/worker/solverService";
import { Virtualizer, elementScroll, observeElementOffset, observeElementRect } from "@tanstack/virtual-core";

export async function initializeUI(canvas: HTMLCanvasElement, params: URLSearchParams) {
  const canvasManager = await ViewportManager.create(canvas);
  const uiManager = new LayoutManager();

  const ROTATE_ROW_LIMIT = 20; // FIXME: detect number of rows
  let lastVirtualResult: VirtualResultPayload | null = null;
  let activeVirtualizer: VirtualizedRowsController | null = null;

  const setHighlight = (index: number | null) => {
    setState({ highlightIteratePathIndex: index });
    canvasManager.draw();
  };

  function sendPolytope() {
    const { vertices, polytopeComplete } = getState();
    const polytope = VRep.fromPoints(vertices);
    try {
      if (!polytope.isConvex()) {
        uiManager.inequalitiesDiv.textContent = "Nonconvex";
        return;
      }
      const result = polytope.toPolytopeRepresentation();
      if (result.inequalities) {
        uiManager.inequalitiesDiv.innerHTML = result.inequalities
          .slice(0, polytopeComplete ? result.inequalities.length : result.inequalities.length - 1)
          .map(
            (ineq, index) => `
            <div class="inequality-item" data-index="${index}">
              ${ineq}
            </div>
          `,
          )
          .join("");
        const inequalityElements = document.querySelectorAll(".inequality-item");
        setupHoverHighlight(
          inequalityElements,
          (index: number) => {
            setState({ highlightIndex: index });
            canvasManager.draw();
          },
          () => {
            setState({ highlightIndex: null });
            canvasManager.draw();
          },
        );

        if (result.lines.length > 0) {
          setElementDisplay("subjectTo", "block");
        }
        mutate((draft) => {
          draft.polytope = result;
        });
        uiManager.updateSolverModeButtons();
        const { iteratePathComputed, objectiveVector, polytope: updatedPolytope } = getState();
        if (iteratePathComputed && objectiveVector && hasPolytopeLines(updatedPolytope)) {
          // Note: computePath will be available after UI controls setup
        }
      } else {
        uiManager.inequalitiesDiv.textContent = "No inequalities returned.";
      }
    } catch (err) {
      console.error("Error:", err);
      uiManager.inequalitiesDiv.textContent = "Error computing inequalities.";
    }
  }

  function renderVirtualResult(payload: VirtualResultPayload, limitRows: boolean) {
    const resultDiv = document.getElementById("result") as HTMLElement;
    resultDiv.classList.add("virtualized");
    resultDiv.innerHTML = "";
    setHighlight(null);
    activeVirtualizer?.destroy();
    activeVirtualizer = null;

    const rowsForLayout = limitRows ? payload.rows.slice(0, ROTATE_ROW_LIMIT) : payload.rows;
    const maxLineChars = computeMaxChars([payload.header || "", ...(payload.footer ? [payload.footer] : []), ...rowsForLayout]);
    resultDiv.dataset.virtualMaxChars = String(maxLineChars);

    const createElement = (className: string, text: string) => {
      const el = document.createElement("div");
      el.className = className;
      el.textContent = text;
      return el;
    };

    resultDiv.appendChild(createElement("iterate-header", payload.header || ""));

    const bodyEl = document.createElement("div");
    bodyEl.className = "iterate-scroll";
    const rowsToRender = rowsForLayout;

    if (rowsToRender.length === 0) {
      bodyEl.appendChild(createElement("iterate-item-nohover", "No iterations available."));
      resultDiv.appendChild(bodyEl);
    } else {
      resultDiv.appendChild(bodyEl);
      activeVirtualizer = createIterateVirtualizer({
        container: bodyEl,
        rows: rowsToRender,
        onHover: (index) => setHighlight(index),
        onLeave: () => setHighlight(null),
      });
    }

    if (payload.footer) {
      resultDiv.appendChild(createElement("iterate-footer", payload.footer));
    }
  }

  function setupHoverHighlight(elements: NodeListOf<Element>, onMouseEnter: (index: number) => void, onMouseLeave: () => void): void {
    elements.forEach((item) => {
      item.addEventListener("mouseenter", () => {
        const index = parseInt(item.getAttribute("data-index") || "0");
        onMouseEnter(index);
      });
      item.addEventListener("mouseleave", () => {
        onMouseLeave();
      });
    });
  }

  function renderHtmlResult(html: string) {
    const resultDiv = document.getElementById("result") as HTMLElement;
    resultDiv.classList.remove("virtualized");
    activeVirtualizer?.destroy();
    activeVirtualizer = null;
    delete resultDiv.dataset.virtualMaxChars;
    resultDiv.innerHTML = html;

    const iterateElements = resultDiv.querySelectorAll(".iterate-header, .iterate-item, .iterate-footer");
    setupHoverHighlight(
      iterateElements,
      (index: number) => setHighlight(index),
      () => setHighlight(null),
    );
  }

  function refreshFullVirtualResult() {
    if (lastVirtualResult && !getState().rotateObjectiveMode) {
      renderVirtualResult(lastVirtualResult, false);
      finalizeResultRender();
    }
  }

  let lastSolverFontMode: SolverMode | null = null;

  function finalizeResultRender() {
    canvasManager.draw();
    const currentMode = getState().solverMode;
    const forceFont = lastSolverFontMode !== currentMode;
    lastSolverFontMode = currentMode;
    adjustFontSize("result", { force: forceFont });
    adjustLogoFontSize();
    activeVirtualizer?.refresh();
  }

  function updateResult(payload: ResultRenderPayload) {
    if (payload.type === "virtual") {
      lastVirtualResult = payload;
      const limitRows = getState().rotateObjectiveMode;
      renderVirtualResult(payload, limitRows);
    } else {
      lastVirtualResult = null;
      renderHtmlResult(payload.html);
    }
    finalizeResultRender();
  }

  const maybeLoadState = (params: URLSearchParams) => {
    if (!params.has("s")) return;
    try {
      const crushed = decodeURIComponent(params.get("s") ?? "");
      const jsonString = JSONCrush.uncrush(crushed);
      const data = JSON.parse(jsonString);
      loadStateFromObject(data);
      history.replaceState(null, "", window.location.pathname);
      helpPopup.resetTimer();
    } catch (err) {
      console.error("Failed to load shared state", err);
    }
  };

  const maybeStartDemo = (params: URLSearchParams) => {
    if (!params.has("demo")) return;
    tour.startTour();
  };

  const tour = new Tour(canvasManager, uiManager);
  const helpPopup = new InactivityHelpOverlay(tour);
  const nonconvexHullHintOverlay = new NonconvexHullHintOverlay();
  const cleanupNonconvexOverlay = () => nonconvexHullHintOverlay.destroy();
  window.addEventListener("beforeunload", cleanupNonconvexOverlay);
  helpPopup.startTimer();

  const { resizeCanvas } = initializeResizeManager(canvasManager, uiManager);
  const handleUndoRedo = createUndoRedoHandler(canvasManager, saveToHistory, sendPolytope);
  const { computePath, settingsElements } = initializeControlPanel(canvasManager, uiManager, updateResult, refreshFullVirtualResult, () => adjustFontSize("result", { force: true }));
  const { loadStateFromObject } = createSharingHandlers(canvasManager, uiManager, settingsElements, sendPolytope);
  registerCanvasInteractions(canvasManager, uiManager, saveToHistory, sendPolytope, computePath, helpPopup);
  setupKeyboardHandlers(canvasManager, handleUndoRedo);

  tour.setSendPolytope(sendPolytope);
  tour.setSaveToHistory(saveToHistory);
  canvasManager.attachTour(tour);
  uiManager.synchronize();
  resizeCanvas();

  maybeLoadState(params);
  maybeStartDemo(params);
  uiManager.synchronize();
  canvas.focus();
}

type VirtualizedRowsController = {
  destroy(): void;
  refresh(): void;
};

type VirtualizedRowsOptions = {
  container: HTMLElement;
  rows: string[];
  onHover: (index: number) => void;
  onLeave: () => void;
};

const ESTIMATED_ROW_HEIGHT = 22;

function createIterateVirtualizer({ container, rows, onHover, onLeave }: VirtualizedRowsOptions): VirtualizedRowsController {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.width = "100%";
  const topSpacer = document.createElement("div");
  const rowsContainer = document.createElement("div");
  rowsContainer.style.display = "flex";
  rowsContainer.style.flexDirection = "column";
  const bottomSpacer = document.createElement("div");
  wrapper.append(topSpacer, rowsContainer, bottomSpacer);
  container.appendChild(wrapper);

  const renderRows = () => {
    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();
    rowsContainer.innerHTML = "";
    if (virtualItems.length === 0) {
      topSpacer.style.height = "0px";
      bottomSpacer.style.height = "0px";
      return;
    }
    const paddingTop = virtualItems[0]?.start ?? 0;
    const paddingBottom = Math.max(totalSize - (virtualItems[virtualItems.length - 1]?.end ?? totalSize), 0);
    topSpacer.style.height = `${paddingTop}px`;
    bottomSpacer.style.height = `${paddingBottom}px`;

    virtualItems.forEach((item) => {
      const rowEl = document.createElement("div");
      rowEl.className = "iterate-item";
      rowEl.dataset.index = String(item.index);
      rowEl.textContent = rows[item.index];
      rowEl.addEventListener("mouseenter", () => onHover(item.index));
      rowEl.addEventListener("mouseleave", () => onLeave());
      rowsContainer.appendChild(rowEl);
    });
  };

  const virtualizer = new Virtualizer<HTMLElement, HTMLDivElement>({
    count: rows.length,
    getScrollElement: () => container,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 25,
    scrollToFn: elementScroll,
    observeElementRect,
    observeElementOffset,
    onChange: () => renderRows(),
  });

  const cleanupMount = virtualizer._didMount();
  virtualizer._willUpdate();
  renderRows();

  return {
    destroy() {
      cleanupMount?.();
      virtualizer.measureElement(null);
      wrapper.remove();
      onLeave();
    },
    refresh() {
      virtualizer._willUpdate();
      renderRows();
    },
  };
}

function computeMaxChars(lines: string[]): number {
  let maxChars = 0;
  lines.forEach((text) => {
    if (!text) return;
    const segments = text.split("\n");
    for (const seg of segments) {
      if (seg.length > maxChars) {
        maxChars = seg.length;
      }
    }
  });
  return maxChars;
}
