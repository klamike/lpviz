export type TourActionTarget =
  | "activate-ipm"
  | "activate-central"
  | "toggle-3d"
  | "start-rotation"
  | "toggle-trace";

export type TourUiController = {
  getActionTarget: (target: TourActionTarget) => HTMLElement | null;
  showCursor: () => void;
  hideCursor: () => void;
  moveCursor: (x: number, y: number) => void;
  setCursorClicking: (clicking: boolean) => void;
  showHelpPopup: (options: {
    text: string;
    gradient: string;
    onClick?: () => void;
    onClose?: () => void;
  }) => void;
  hideHelpPopup: () => void;
  showNonconvexHint: (options: {
    text: string;
    gradient: string;
    onClick?: () => void;
    onClose?: () => void;
  }) => void;
  hideNonconvexHint: () => void;
};
