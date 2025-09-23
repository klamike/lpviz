import { state } from "../state/state";
import { isPolygonConvex, polytope } from "../utils/math2d";
import {
  adjustFontSize,
  adjustLogoFontSize,
  getElement,
  setupHoverHighlight,
  showElement,
} from "../utils/uiHelpers";
import { CanvasManager } from "./canvasManager";
import { UIManager } from "./uiManager";

import {
  createUndoRedoHandler,
  saveToHistory,
  setupKeyboardHandlers,
} from "../state/history";
import { createSharingHandlers } from "../state/sharing";
import { setupCanvasInteractions } from "./canvasInteractions";
import {
  createDragHandlers,
  getLogicalCoords,
  setupDragEventListeners,
} from "./dragHandlers";
import { setupUIControls } from "./uiControls";

export function setupEventHandlers(
  canvasManager: CanvasManager,
  uiManager: UIManager,
  helpPopup?: any,
) {
  const canvas = canvasManager.canvas;

  function sendPolytope() {
    const points = state.vertices.map((pt) => [pt.x, pt.y]);
    try {
      const result = polytope(points);
      if (result.inequalities) {
        if (!isPolygonConvex(state.vertices)) {
          uiManager.inequalitiesDiv.textContent = "Nonconvex";
          return;
        }
        uiManager.inequalitiesDiv.innerHTML = result.inequalities
          .slice(
            0,
            state.polygonComplete
              ? result.inequalities.length
              : result.inequalities.length - 1,
          )
          .map(
            (ineq, index) => `
            <div class="inequality-item" data-index="${index}">
              ${ineq}
            </div>
          `,
          )
          .join("");
        const inequalityElements =
          document.querySelectorAll(".inequality-item");
        setupHoverHighlight(
          inequalityElements,
          (index) => {
            state.highlightIndex = index;
            canvasManager.draw();
          },
          () => {
            state.highlightIndex = null;
            canvasManager.draw();
          },
        );

        if (result.lines.length > 0) {
          showElement("subjectTo");
        }
        state.computedVertices = result.vertices;
        state.computedLines = result.lines;
        uiManager.updateSolverModeButtons();
        if (
          state.iteratePathComputed &&
          state.objectiveVector &&
          state.computedLines.length > 0
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

  function updateResult(html: string) {
    const resultDiv = getElement("result");
    resultDiv.innerHTML = html;

    const iterateElements = document.querySelectorAll(
      ".iterate-header, .iterate-item, .iterate-footer",
    );
    setupHoverHighlight(
      iterateElements,
      (index) => {
        state.highlightIteratePathIndex = index;
        canvasManager.draw();
      },
      () => {
        state.highlightIteratePathIndex = null;
        canvasManager.draw();
      },
    );

    canvasManager.draw();
    adjustFontSize();
    adjustLogoFontSize();
  }

  // Create and setup all handler modules
  const dragHandlers = createDragHandlers(
    canvasManager,
    uiManager,
    saveToHistory,
    sendPolytope,
    helpPopup,
  );
  const handleUndoRedo = createUndoRedoHandler(
    canvasManager,
    saveToHistory,
    sendPolytope,
  );
  const settingsElements = setupUIControls(
    canvasManager,
    uiManager,
    updateResult,
  );
  const { loadStateFromObject, generateShareLink } = createSharingHandlers(
    canvasManager,
    uiManager,
    settingsElements,
    sendPolytope,
  );

  // Setup all event listeners
  setupDragEventListeners(canvas, dragHandlers, canvasManager);
  setupCanvasInteractions(
    canvasManager,
    uiManager,
    saveToHistory,
    sendPolytope,
    getLogicalCoords,
    helpPopup,
  );
  setupKeyboardHandlers(
    canvasManager,
    saveToHistory,
    sendPolytope,
    handleUndoRedo,
  );

  return {
    loadStateFromObject,
    generateShareLink,
    sendPolytope,
    saveToHistory,
  };
}
