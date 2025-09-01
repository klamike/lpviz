import { state } from "../state/state";
import { fetchPolytope } from "../services/apiClient";
import { CanvasManager } from "./canvasManager";
import { UIManager } from "./uiManager";
import { isPolygonConvex } from "../utils/math2D";
import { setupHoverHighlight, adjustFontSize, getElement, showElement } from "../utils/uiHelpers";

import { createDragHandlers, setupDragEventListeners, getLogicalCoords } from "./dragHandlers";
import { 
  setupCanvasInteractions, 
  setupKeyboardHandlers, 
  createUndoRedoHandler 
} from "./canvasInteractions";
import { setupUIControls } from "./uiControls";
import { createSharingHandlers } from "./sharing";

export function setupEventHandlers(canvasManager: CanvasManager, uiManager: UIManager) {
  const canvas = canvasManager.canvas;

  function saveToHistory() {
    state.historyStack.push({
      vertices: JSON.parse(JSON.stringify(state.vertices)),
      objectiveVector: state.objectiveVector ? { ...state.objectiveVector } : null,
    });
  }

  async function sendPolytope() {
    const points = state.vertices.map((pt) => [pt.x, pt.y]);
    try {
      const result = await fetchPolytope(points);
      if (result.inequalities) {
        if (!isPolygonConvex(state.vertices)) {
          uiManager.inequalitiesDiv.textContent = "Nonconvex";
          return;
        }
        uiManager.inequalitiesDiv.innerHTML = result.inequalities
          .slice(0, state.polygonComplete ? result.inequalities.length : result.inequalities.length - 1)
          .map(
            (ineq, index) => `
            <div class="inequality-item" data-index="${index}">
              ${ineq}<br>
              <span class="barrier-weight-container" style="display: ${
                state.barrierWeightsVisible ? "inline" : "none"
              };">
                <span style="font-family: sans-serif;">Barrier weight:</span>
                <input type="number" id="weight-${index}" value="${
              state.barrierWeights[index] !== undefined ? state.barrierWeights[index] : 1
            }" step="any" autocomplete="off" style="width:60px" />
              </span>
            </div>
          `
          )
          .join("");
        const inequalityElements = document.querySelectorAll(".inequality-item");
        setupHoverHighlight(
          inequalityElements,
          (index) => {
            state.highlightIndex = index;
            canvasManager.draw();
          },
          () => {
            state.highlightIndex = null;
            canvasManager.draw();
          }
        );
        
        inequalityElements.forEach((item) => {
          item.querySelectorAll('input[type="number"]').forEach((el) => {
            const inputEl = el as HTMLInputElement;
            inputEl.addEventListener("change", () => {
              const index = parseInt(inputEl.id.split("-")[1]);
              state.barrierWeights[index] = parseFloat(inputEl.value);
            });
          });
        });
        if (result.lines.length > 0) {
          showElement("subjectTo");
        }
        state.computedVertices = result.vertices;
        state.computedLines = result.lines;
        uiManager.updateSolverModeButtons();
        if (state.iteratePathComputed && state.objectiveVector && state.computedLines.length > 0) {
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
        state.highlightIteratePathIndex = index;
        canvasManager.draw();
      },
      () => {
        state.highlightIteratePathIndex = null;
        canvasManager.draw();
      }
    );
    
    canvasManager.draw();
    adjustFontSize();
  }

  // Create and setup all handler modules
  const dragHandlers = createDragHandlers(canvasManager, uiManager, saveToHistory, sendPolytope);
  const handleUndoRedo = createUndoRedoHandler(canvasManager, saveToHistory, sendPolytope);
  const settingsElements = setupUIControls(canvasManager, uiManager, updateResult);
  const { loadStateFromObject, generateShareLink } = createSharingHandlers(canvasManager, uiManager, settingsElements, sendPolytope);

  // Setup all event listeners
  setupDragEventListeners(canvas, dragHandlers, canvasManager);
  setupCanvasInteractions(canvasManager, uiManager, saveToHistory, sendPolytope, getLogicalCoords);
  setupKeyboardHandlers(canvasManager, saveToHistory, sendPolytope, handleUndoRedo);

  return { loadStateFromObject, generateShareLink };
}
