import { state } from "../state/state";
import { CanvasManager } from "./canvasManager";
import { UIManager } from "./uiManager";
import { showElement, setButtonsEnabled } from "../utils/uiHelpers";

interface AnimatedCursor {
  x: number;
  y: number;
  element: HTMLElement;
}

interface TourStep {
  action: 'click' | 'wait' | 'select-solver' | 'click-button' | 'click-close';
  target?: string | { x: number; y: number };
  duration?: number;
  description?: string;
}

export class GuidedTour {
  private canvasManager: CanvasManager;
  private uiManager: UIManager;
  private sendPolytope: () => void;
  private saveToHistory: () => void;
  private animatedCursor: AnimatedCursor | null = null;
  private isRunning = false;
  private tourSteps: TourStep[] = [];
  private globalClickBlocker: ((e: Event) => void) | null = null;
  private allowNextClick = false;

  constructor(
    canvasManager: CanvasManager, 
    uiManager: UIManager,
    sendPolytope: () => void,
    saveToHistory: () => void
  ) {
    this.canvasManager = canvasManager;
    this.uiManager = uiManager;
    this.sendPolytope = sendPolytope;
    this.saveToHistory = saveToHistory;
  }

  public setSendPolytope(sendPolytope: () => void): void {
    this.sendPolytope = sendPolytope;
  }

  public setSaveToHistory(saveToHistory: () => void): void {
    this.saveToHistory = saveToHistory;
  }

  private createAnimatedCursor(): void {
    const cursor = document.createElement('div');
    cursor.id = 'guidedTourCursor';
    cursor.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" 
              fill="#4A90E2" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
    `;
    cursor.style.cssText = `
      position: fixed;
      z-index: 10000;
      width: 24px;
      height: 24px;
      pointer-events: none;
      transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      transform: translate(-25%, -25%);
      filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));
    `;
    document.body.appendChild(cursor);
    
    this.animatedCursor = {
      x: 0,
      y: 0,
      element: cursor
    };
  }

  private removeAnimatedCursor(): void {
    if (this.animatedCursor) {
      this.animatedCursor.element.remove();
      this.animatedCursor = null;
    }
  }

  private moveCursorTo(x: number, y: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.animatedCursor) return resolve();
      
      this.animatedCursor.x = x;
      this.animatedCursor.y = y;
      this.animatedCursor.element.style.left = `${x}px`;
      this.animatedCursor.element.style.top = `${y}px`;
      
      // Wait for transition to complete
      setTimeout(resolve, 800);
    });
  }

  private generateNicePolytope(): { x: number; y: number }[] {
    // Generate a nice-looking convex polytope (a pentagon with some randomness)
    const centerX = 0;
    const centerY = 0;
    const baseRadius = 10;
    const vertices: { x: number; y: number }[] = [];
    
    // Create a pentagon with slight perturbations for visual interest
    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2; // Start from top
      const radiusVariation = 0.8 + Math.random() * 0.4; // 20% variation
      const radius = baseRadius * radiusVariation;
      const angleVariation = (Math.random() - 0.5) * 0.3; // Small angle variation
      
      vertices.push({
        x: centerX + radius * Math.cos(angle + angleVariation),
        y: centerY + radius * Math.sin(angle + angleVariation)
      });
    }
    
    return vertices;
  }

  private generateRandomObjective(): { x: number; y: number } {
    // Generate a nice objective vector (not too steep, visually appealing)
    const angle = Math.random() * Math.PI / 3 - Math.PI / 6; // -30° to +30° from horizontal
    const magnitude = 6 + Math.random() * 8; // Length between 2 and 4
    
    return {
      x: magnitude * Math.cos(angle),
      y: magnitude * Math.sin(angle)
    };
  }

  private getCanvasCenter(): { x: number; y: number } {
    const canvas = this.canvasManager.canvas;
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  private logicalToScreenCoords(logicalX: number, logicalY: number): { x: number; y: number } {
    const canvas = this.canvasManager.canvas;
    const rect = canvas.getBoundingClientRect();
    
    // Convert logical coordinates to screen coordinates
    const screenX = this.canvasManager.centerX + (logicalX + this.canvasManager.offset.x) * this.canvasManager.gridSpacing * this.canvasManager.scaleFactor;
    const screenY = this.canvasManager.centerY - (logicalY + this.canvasManager.offset.y) * this.canvasManager.gridSpacing * this.canvasManager.scaleFactor;
    
    return {
      x: rect.left + screenX,
      y: rect.top + screenY
    };
  }

  private async performClickAnimation(): Promise<void> {
    if (!this.animatedCursor) return;
    
    return new Promise((resolve) => {
      // Scale up with a bounce effect
      this.animatedCursor!.element.style.transform = 'translate(-25%, -25%) scale(2.4)';
      this.animatedCursor!.element.style.filter = 'drop-shadow(2px 2px 8px rgba(74, 144, 226, 0.6))';
      
      setTimeout(() => {
        if (this.animatedCursor) {
          // Quick scale down then back to normal
          this.animatedCursor.element.style.transform = 'translate(-25%, -25%) scale(0.9)';
          
          setTimeout(() => {
            if (this.animatedCursor) {
              this.animatedCursor.element.style.transform = 'translate(-25%, -25%) scale(1)';
              this.animatedCursor.element.style.filter = 'drop-shadow(2px 2px 4px rgba(0,0,0,0.3))';
              resolve();
            }
          }, 80);
        }
      }, 120);
    });
  }

  private addGlobalClickBlocker(): void {
    this.globalClickBlocker = (e: Event) => {
      // Allow tour's own programmatic clicks
      if (this.allowNextClick) {
        this.allowNextClick = false;
        return;
      }

      // Allow clicks on the guided tour cursor and popup
      const target = e.target as HTMLElement;
      if (target?.id === 'guidedTourCursor' || target?.closest('#helpPopup')) {
        return;
      }
      
      // Block all other clicks during tour
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    // Add the blocker to capture phase to intercept all clicks
    document.addEventListener('click', this.globalClickBlocker, true);
    document.addEventListener('mousedown', this.globalClickBlocker, true);
    document.addEventListener('mouseup', this.globalClickBlocker, true);
  }

  private removeGlobalClickBlocker(): void {
    if (this.globalClickBlocker) {
      document.removeEventListener('click', this.globalClickBlocker, true);
      document.removeEventListener('mousedown', this.globalClickBlocker, true);
      document.removeEventListener('mouseup', this.globalClickBlocker, true);
      this.globalClickBlocker = null;
    }
  }

  private async executeStep(step: TourStep): Promise<void> {
    switch (step.action) {
      case 'click':
        if (typeof step.target === 'object' && 'x' in step.target && 'y' in step.target) {
          // Canvas click at logical coordinates
          const screenCoords = this.logicalToScreenCoords(step.target.x, step.target.y);
          await this.moveCursorTo(screenCoords.x, screenCoords.y);
          
          // Add click animation with ripple effect
          await this.performClickAnimation();
          
          // Simulate the click
          this.saveToHistory();
          if (!state.polygonComplete) {
            state.vertices.push(step.target);
            this.uiManager.hideNullStateMessage();
            this.canvasManager.draw();
            this.sendPolytope();
          } else if (state.objectiveVector === null) {
            state.objectiveVector = step.target;
            showElement("maximize");
            setButtonsEnabled({
              "ipmButton": true,
              "simplexButton": true,
              "pdhgButton": true,
              "iteratePathButton": false,
              "traceButton": true,
              "zoomButton": true
            });
            this.uiManager.updateSolverModeButtons();
            this.uiManager.updateObjectiveDisplay();
            this.canvasManager.draw();
          }
          
          // Wait 100ms before moving on
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        break;
      case 'click-close':
        if (typeof step.target === 'object' && 'x' in step.target && 'y' in step.target) {
            // Canvas click at logical coordinates
            const screenCoords = this.logicalToScreenCoords(step.target.x, step.target.y);
            await this.moveCursorTo(screenCoords.x, screenCoords.y);
            
            // Add click animation with ripple effect
            await this.performClickAnimation();
            
            // Simulate the click
            this.saveToHistory();
            state.polygonComplete = true;
            state.interiorPoint = step.target;
            this.canvasManager.draw();
            this.sendPolytope();
            setButtonsEnabled({
              "ipmButton": true,
              "simplexButton": true,
              "pdhgButton": true,
              "iteratePathButton": false,
              "traceButton": true,
              "zoomButton": true
            });
            
            // Wait 100ms before moving on
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          break;
      case 'click-button':
        if (typeof step.target === 'string') {
          const button = document.getElementById(step.target) as HTMLButtonElement;
          if (button) {
            const rect = button.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            await this.moveCursorTo(centerX, centerY);
            
            // Add click animation with ripple effect
            await this.performClickAnimation();
            
            // Allow the next click to pass through the blocker
            this.allowNextClick = true;
            
            // Click the button
            button.click();
            
            // Wait 100ms before moving on
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        break;
        
      case 'select-solver':
        // This will be handled by clicking the solver button
        break;
        
      case 'wait':
        await new Promise(resolve => setTimeout(resolve, step.duration || 1000));
        break;
    }
  }

  public async startGuidedTour(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Add global click blocker during tour
    this.addGlobalClickBlocker();
    
    // Clear any existing vertices and reset the polygon state
    state.vertices = [];
    state.polygonComplete = false;
    state.interiorPoint = null;
    state.objectiveVector = null;
    state.currentMouse = null;
    state.currentObjective = null;
    
    // Reset UI buttons to initial state
    setButtonsEnabled({
      "ipmButton": false,
      "simplexButton": false,
      "pdhgButton": false,
      "iteratePathButton": false,
      "traceButton": false,
      "zoomButton": true
    });
    
    // Update UI displays and redraw canvas
    this.uiManager.updateSolverModeButtons();
    this.uiManager.updateObjectiveDisplay();
    this.canvasManager.draw();
    
    // Generate the tour steps
    const nicePolytope = this.generateNicePolytope();
    const randomObjective = this.generateRandomObjective();
    
    this.tourSteps = [
      { action: 'wait', duration: 500 },
      ...nicePolytope.map(vertex => ({ action: 'click' as const, target: vertex })),
      { action: 'click-close', target: { x: 0, y: 0 } },
      { action: 'wait', duration: 1000 },
      { action: 'click', target: randomObjective },
      { action: 'wait', duration: 1000 },
      
      { action: 'click-button', target: 'ipmButton' },
      { action: 'wait', duration: 750 },
      { action: 'click-button', target: 'traceButton' },
      { action: 'wait', duration: 750 },
      
      { action: 'click-button', target: 'toggle3DButton' },
      { action: 'wait', duration: 750 },

      { action: 'click-button', target: 'startRotateObjectiveButton' },
      { action: 'wait', duration: 2000 },

      { action: 'click-button', target: 'iteratePathButton' },
      { action: 'wait', duration: 1500 },
      { action: 'click-button', target: 'traceCheckbox' },
    ];
    
    this.createAnimatedCursor();
    
    try {
      for (let i = 0; i < this.tourSteps.length && this.isRunning; i++) {
        await this.executeStep(this.tourSteps[i]);
        
        if (!this.isRunning) break;
        
        // Small delay between steps
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } finally {
      this.removeAnimatedCursor();
      this.removeGlobalClickBlocker();
      this.isRunning = false;
    }
  }

  public stopTour(): void {
    this.isRunning = false;
    this.removeGlobalClickBlocker();
    this.removeAnimatedCursor();
    
    // Clear mouse states when tour stops
    state.currentMouse = null;
    state.currentObjective = null;
    this.canvasManager.draw();
  }

  public isTouring(): boolean {
    return this.isRunning;
  }
}

export class HelpPopup {
  private popup: HTMLElement | null = null;
  private timer: number | null = null;
  private guidedTour: GuidedTour;
  private hasShownPopup = false;
  private checkInterval: number | null = null;

  constructor(guidedTour: GuidedTour) {
    this.guidedTour = guidedTour;
  }

  public isPopupVisible(): boolean {
    return this.popup !== null;
  }

  private createPopup(): void {
    const popup = document.createElement('div');
    popup.id = 'helpPopup';
    popup.innerHTML = `
      <div class="help-popup-content">
        <div class="help-popup-text">
          Stuck? Try a random LP
        </div>
        <button class="help-popup-close" aria-label="Close">×</button>
      </div>
    `;
    
    popup.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 9999;
      font-family: 'JuliaMono', monospace;
      cursor: pointer;
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    `;
    
    // Style the content
    const content = popup.querySelector('.help-popup-content') as HTMLElement;
    content.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      gap: 12px;
    `;
    
    const text = popup.querySelector('.help-popup-text') as HTMLElement;
    text.style.cssText = `
      font-size: 14px;
      font-weight: 500;
      line-height: 1.4;
    `;
    
    const closeBtn = popup.querySelector('.help-popup-close') as HTMLElement;
    closeBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      line-height: 1;
      transition: background 0.2s ease;
      flex-shrink: 0;
    `;
    
    // Add hover effects
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.3)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    });
    
    popup.addEventListener('mouseenter', () => {
      popup.style.transform = 'translateY(0) scale(1.02)';
    });
    popup.addEventListener('mouseleave', () => {
      popup.style.transform = 'translateY(0) scale(1)';
    });
    
    document.body.appendChild(popup);
    this.popup = popup;
    
    setTimeout(() => {
      popup.style.transform = 'translateY(0)';
      popup.style.opacity = '1';
    }, 50);
    
    // Add event listeners
    popup.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.target !== closeBtn) {
        this.startTour();
      }
    });
    
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.hidePopup();
    });
    
    // Prevent any mouse events from propagating through the popup
    popup.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    
    popup.addEventListener('mouseup', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    
    popup.addEventListener('mousemove', (e) => {
      e.stopPropagation();
    });
  }

  private hidePopup(): void {
    if (this.popup) {
      this.popup.style.transform = 'translateY(100px)';
      this.popup.style.opacity = '0';
      
      setTimeout(() => {
        if (this.popup) {
          this.popup.remove();
          this.popup = null;
        }
      }, 300);
    }
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private startTour(): void {
    this.hidePopup();
    this.guidedTour.startGuidedTour();
  }

  public startTimer(): void {
    if (this.hasShownPopup || this.timer) return;
    
    this.timer = window.setTimeout(() => {
      // Check if user still hasn't set an objective
      if (state.objectiveVector === null && !this.guidedTour.isTouring()) {
        this.hasShownPopup = true;
        this.createPopup();
      }
    }, 15000); // 15 seconds
    
    // Also start checking periodically if objective was set to auto-hide popup
    this.checkInterval = window.setInterval(() => {
      if (state.objectiveVector !== null) {
        this.stopTimer();
      }
    }, 300);
  }

  public stopTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.hidePopup();
  }

  public resetTimer(): void {
    this.stopTimer();
    this.hasShownPopup = false;
    this.startTimer();
  }
}
