import {
  getGeometryState,
  getObjectiveState,
  getSolverState,
  mutateGeometryState,
  mutateInteractionState,
  mutateSolverState,
} from "../state/state";
import { CanvasManager } from "./canvasManager";
import { UIManager } from "./uiManager";
import { isPolygonConvex, polytope } from "../utils/math2d";
import { setupHoverHighlight, adjustFontSize, adjustLogoFontSize, showElement } from "../utils/uiHelpers";
import { createDragHandlers, setupDragEventListeners, getLogicalCoords } from "./dragHandlers";
import { setupCanvasInteractions } from "./canvasInteractions";
import { saveToHistory, setupKeyboardHandlers, createUndoRedoHandler } from "../state/history";
import { setupUIControls } from "./uiControls";
import { createSharingHandlers } from "../state/sharing";
import { HelpPopup } from "./guidedTour";
import type { ResultRenderPayload, VirtualResultPayload } from "../types/resultPayload";

export function setupEventHandlers(canvasManager: CanvasManager, uiManager: UIManager, helpPopup?: HelpPopup) {
  const canvas = canvasManager.canvas;
  const ROTATE_ROW_LIMIT = 20; // FIXME: detect number of rows
  let lastVirtualResult: VirtualResultPayload | null = null;

  const setHighlight = (index: number | null) => {
    mutateSolverState((draft) => {
      draft.highlightIteratePathIndex = index;
    });
    canvasManager.draw();
  };

  function sendPolytope() {
    const geometry = getGeometryState();
    const points = geometry.vertices.map((pt) => [pt.x, pt.y]);
    try {
      const result = polytope(points);
      if (result.inequalities) {
        if (!isPolygonConvex(geometry.vertices)) {
          uiManager.inequalitiesDiv.textContent = "Nonconvex";
          return;
        }
        uiManager.inequalitiesDiv.innerHTML = result.inequalities
          .slice(0, geometry.polygonComplete ? result.inequalities.length : result.inequalities.length - 1)
          .map(
            (ineq, index) => `
            <div class="inequality-item" data-index="${index}">
              ${ineq}
            </div>
          `
          )
          .join("");
        const inequalityElements = document.querySelectorAll(".inequality-item");
        setupHoverHighlight(
          inequalityElements,
          (index) => {
            mutateInteractionState((draft) => {
              draft.highlightIndex = index;
            });
            canvasManager.draw();
          },
          () => {
            mutateInteractionState((draft) => {
              draft.highlightIndex = null;
            });
            canvasManager.draw();
          }
        );

        if (result.lines.length > 0) {
          showElement("subjectTo");
        }
        mutateGeometryState((draft) => {
          draft.computedVertices = result.vertices;
          draft.computedLines = result.lines;
        });
        uiManager.updateSolverModeButtons();
        const solverSnapshot = getSolverState();
        const objectiveSnapshot = getObjectiveState();
        const updatedGeometry = getGeometryState();
        if (
          solverSnapshot.iteratePathComputed &&
          objectiveSnapshot.objectiveVector &&
          updatedGeometry.computedLines.length > 0
        ) {
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

    const headerEl = document.createElement("div");
    headerEl.className = "iterate-header";
    headerEl.textContent = payload.header || "";
    resultDiv.appendChild(headerEl);

    const bodyEl = document.createElement("div");
    bodyEl.className = "iterate-scroll";
    const entries = payload.rows.map((text, index) => ({ text, index }));
    const rowsToRender = limitRows ? entries.slice(0, ROTATE_ROW_LIMIT) : entries;

    if (rowsToRender.length === 0) {
      const empty = document.createElement("div");
      empty.className = "iterate-item-nohover";
      empty.textContent = "No iterations available.";
      bodyEl.appendChild(empty);
    } else {
      rowsToRender.forEach(({ text, index }) => {
        const rowEl = document.createElement("div");
        rowEl.className = "iterate-item";
        rowEl.dataset.index = String(index);
        rowEl.textContent = text;
        rowEl.addEventListener("mouseenter", () => setHighlight(index));
        rowEl.addEventListener("mouseleave", () => setHighlight(null));
        bodyEl.appendChild(rowEl);
      });
    }
    resultDiv.appendChild(bodyEl);

    if (payload.footer) {
      const footerEl = document.createElement("div");
      footerEl.className = "iterate-footer";
      footerEl.textContent = payload.footer;
      resultDiv.appendChild(footerEl);
    }
  }

  function renderHtmlResult(html: string) {
    const resultDiv = document.getElementById("result") as HTMLElement;
    resultDiv.classList.remove("virtualized");
    resultDiv.innerHTML = html;
    
    const iterateElements = resultDiv.querySelectorAll(".iterate-header, .iterate-item, .iterate-footer");
    setupHoverHighlight(
      iterateElements,
      (index) => setHighlight(index),
      () => setHighlight(null)
    );
  }

  function refreshFullVirtualResult() {
    if (lastVirtualResult && !getSolverState().rotateObjectiveMode) {
      renderVirtualResult(lastVirtualResult, false);
      finalizeResultRender();
    }
  }

  function finalizeResultRender() {
    canvasManager.draw();
    adjustFontSize();
    adjustLogoFontSize();
  }

  function updateResult(payload: ResultRenderPayload) {
    if (payload.type === "virtual") {
      lastVirtualResult = payload;
      const limitRows = getSolverState().rotateObjectiveMode;
      renderVirtualResult(payload, limitRows);
    } else {
      lastVirtualResult = null;
      renderHtmlResult(payload.html);
    }
    finalizeResultRender();
  }

  // Create and setup all handler modules
  const dragHandlers = createDragHandlers(canvasManager, uiManager, saveToHistory, sendPolytope, helpPopup);
  const handleUndoRedo = createUndoRedoHandler(canvasManager, saveToHistory, sendPolytope);
  const settingsElements = setupUIControls(canvasManager, uiManager, updateResult, refreshFullVirtualResult);
  const { loadStateFromObject, generateShareLink } = createSharingHandlers(canvasManager, uiManager, settingsElements, sendPolytope);

  // Setup all event listeners
  setupDragEventListeners(canvas, dragHandlers, canvasManager);
  setupCanvasInteractions(canvasManager, uiManager, saveToHistory, sendPolytope, getLogicalCoords, helpPopup);
  setupKeyboardHandlers(handleUndoRedo);

  return { loadStateFromObject, generateShareLink, sendPolytope, saveToHistory };
}
