import { getState, mutate, setState } from "../../state/store";
import { ViewportManager } from "../viewport";
import { LayoutManager } from "../layout";
import { VRep, hasPolytopeLines } from "../../solvers/utils/polytope";
import { setupHoverHighlight, adjustFontSize, adjustLogoFontSize } from "../utils";
import { showElement } from "../../state/utils";
import { registerCanvasInteractions } from "./canvas";
import { saveToHistory, setupKeyboardHandlers, createUndoRedoHandler } from "../../state/history";
import { initializeControlPanel } from "./controlPanel";
import { createSharingHandlers } from "../../state/sharing";
import { InactivityHelpOverlay } from "../tour/tour";
import type { ResultRenderPayload, VirtualResultPayload } from "../../solvers/worker/solverService";

export function initializeApplicationInteractions(canvasManager: ViewportManager, uiManager: LayoutManager, helpPopup?: InactivityHelpOverlay) {
  const ROTATE_ROW_LIMIT = 20; // FIXME: detect number of rows
  let lastVirtualResult: VirtualResultPayload | null = null;

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
          (index) => {
            setState({ highlightIndex: index });
            canvasManager.draw();
          },
          () => {
            setState({ highlightIndex: null });
            canvasManager.draw();
          },
        );

        if (result.lines.length > 0) {
          showElement("subjectTo");
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

    const createElement = (className: string, text: string) => {
      const el = document.createElement("div");
      el.className = className;
      el.textContent = text;
      return el;
    };

    resultDiv.appendChild(createElement("iterate-header", payload.header || ""));

    const bodyEl = document.createElement("div");
    bodyEl.className = "iterate-scroll";
    const rowsToRender = limitRows ? payload.rows.slice(0, ROTATE_ROW_LIMIT) : payload.rows;

    if (rowsToRender.length === 0) {
      bodyEl.appendChild(createElement("iterate-item-nohover", "No iterations available."));
    } else {
      rowsToRender.forEach((text, index) => {
        const rowEl = createElement("iterate-item", text);
        rowEl.dataset.index = String(index);
        rowEl.addEventListener("mouseenter", () => setHighlight(index));
        rowEl.addEventListener("mouseleave", () => setHighlight(null));
        bodyEl.appendChild(rowEl);
      });
    }
    resultDiv.appendChild(bodyEl);

    if (payload.footer) {
      resultDiv.appendChild(createElement("iterate-footer", payload.footer));
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
      () => setHighlight(null),
    );
  }

  function refreshFullVirtualResult() {
    if (lastVirtualResult && !getState().rotateObjectiveMode) {
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
      const limitRows = getState().rotateObjectiveMode;
      renderVirtualResult(payload, limitRows);
    } else {
      lastVirtualResult = null;
      renderHtmlResult(payload.html);
    }
    finalizeResultRender();
  }

  // Create and setup all handler modules
  const handleUndoRedo = createUndoRedoHandler(canvasManager, saveToHistory, sendPolytope);
  const { computePath, settingsElements } = initializeControlPanel(canvasManager, uiManager, updateResult, refreshFullVirtualResult);
  const { loadStateFromObject, generateShareLink } = createSharingHandlers(canvasManager, uiManager, settingsElements, sendPolytope);

  // Setup all event listeners
  registerCanvasInteractions(canvasManager, uiManager, saveToHistory, sendPolytope, computePath, helpPopup);
  setupKeyboardHandlers(canvasManager, handleUndoRedo);

  return {
    loadStateFromObject,
    generateShareLink,
    sendPolytope,
    saveToHistory,
  };
}
