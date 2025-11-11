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

  private generatePentagon(): { x: number; y: number }[] {
    const centerX = 0;
    const centerY = 0;
    const baseRadius = 10;
    const vertices: { x: number; y: number }[] = [];
    
    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      const radiusVariation = 0.8 + Math.random() * 0.4;
      const radius = baseRadius * radiusVariation;
      const angleVariation = (Math.random() - 0.5) * 0.3;
      
      vertices.push({
        x: centerX + radius * Math.cos(angle + angleVariation),
        y: centerY + radius * Math.sin(angle + angleVariation)
      });
    }
    
    return vertices;
  }

  private generateRandomObjective(): { x: number; y: number } {
    const angle = Math.random() * Math.PI / 3 - Math.PI / 6;
    const magnitude = 6 + Math.random() * 8;
    
    return {
      x: magnitude * Math.cos(angle),
      y: magnitude * Math.sin(angle)
    };
  }

  private logicalToScreenCoords(logicalX: number, logicalY: number): { x: number; y: number } {
    const canvas = this.canvasManager.canvas;
    const rect = canvas.getBoundingClientRect();
    const canvasPoint = this.canvasManager.toCanvasCoords(logicalX, logicalY);
    return {
      x: rect.left + canvasPoint.x,
      y: rect.top + canvasPoint.y
    };
  }

  private async performClickAnimation(): Promise<void> {
    if (!this.animatedCursor) return;
    
    return new Promise((resolve) => {
      this.animatedCursor!.element.style.transform = 'translate(-25%, -25%) scale(2.4)';
      this.animatedCursor!.element.style.filter = 'drop-shadow(2px 2px 8px rgba(74, 144, 226, 0.6))';
      
      setTimeout(() => {
        if (this.animatedCursor) {
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
      if (this.allowNextClick) {
        this.allowNextClick = false;
        return;
      }

      const target = e.target as HTMLElement;
      if (target?.id === 'guidedTourCursor' || target?.closest('#helpPopup')) {
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

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
          const screenCoords = this.logicalToScreenCoords(step.target.x, step.target.y);
          await this.moveCursorTo(screenCoords.x, screenCoords.y);
          
          await this.performClickAnimation();
          
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
            const screenCoords = this.logicalToScreenCoords(step.target.x, step.target.y);
            await this.moveCursorTo(screenCoords.x, screenCoords.y);
            
            await this.performClickAnimation();
            
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
            await this.performClickAnimation();
            this.allowNextClick = true;
            button.click();
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        break;
        
      case 'select-solver':
        break;
        
      case 'wait':
        await new Promise(resolve => setTimeout(resolve, step.duration || 1000));
        break;
    }
  }

  public async startGuidedTour(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    this.addGlobalClickBlocker();
    
    state.vertices = [];
    state.polygonComplete = false;
    state.interiorPoint = null;
    state.objectiveVector = null;
    state.currentMouse = null;
    state.currentObjective = null;
    
    setButtonsEnabled({
      "ipmButton": false,
      "simplexButton": false,
      "pdhgButton": false,
      "iteratePathButton": false,
      "traceButton": false,
      "zoomButton": true
    });
    
    this.uiManager.updateSolverModeButtons();
    this.uiManager.updateObjectiveDisplay();
    this.canvasManager.draw();
    
    const nicePolytope = this.generatePentagon();
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

  public isTouring(): boolean {
    return this.guidedTour.isTouring();
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
