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
import { setupHoverHighlight, adjustFontSize, adjustLogoFontSize, getElement, showElement } from "../utils/uiHelpers";
import { createDragHandlers, setupDragEventListeners, getLogicalCoords } from "./dragHandlers";
import { setupCanvasInteractions } from "./canvasInteractions";
import { saveToHistory, setupKeyboardHandlers, createUndoRedoHandler } from "../state/history";
import { setupUIControls } from "./uiControls";
import { createSharingHandlers } from "../state/sharing";
import { HelpPopup } from "./guidedTour";

export function setupEventHandlers(canvasManager: CanvasManager, uiManager: UIManager, helpPopup?: HelpPopup) {
  const canvas = canvasManager.canvas;

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

  function updateResult(html: string) {
    const resultDiv = getElement("result");
    resultDiv.innerHTML = html;
    
    const iterateElements = document.querySelectorAll(".iterate-header, .iterate-item, .iterate-footer");
    setupHoverHighlight(
      iterateElements,
      (index) => {
        mutateSolverState((draft) => {
          draft.highlightIteratePathIndex = index;
        });
        canvasManager.draw();
      },
      () => {
        mutateSolverState((draft) => {
          draft.highlightIteratePathIndex = null;
        });
        canvasManager.draw();
      }
    );
    
    canvasManager.draw();
    adjustFontSize();
    adjustLogoFontSize();
  }

  // Create and setup all handler modules
  const dragHandlers = createDragHandlers(canvasManager, uiManager, saveToHistory, sendPolytope, helpPopup);
  const handleUndoRedo = createUndoRedoHandler(canvasManager, saveToHistory, sendPolytope);
  const settingsElements = setupUIControls(canvasManager, uiManager, updateResult);
  const { loadStateFromObject, generateShareLink } = createSharingHandlers(canvasManager, uiManager, settingsElements, sendPolytope);

  // Setup all event listeners
  setupDragEventListeners(canvas, dragHandlers, canvasManager);
  setupCanvasInteractions(canvasManager, uiManager, saveToHistory, sendPolytope, getLogicalCoords, helpPopup);
  setupKeyboardHandlers(handleUndoRedo);

  return { loadStateFromObject, generateShareLink, sendPolytope, saveToHistory };
}
