import type { SolverMode } from "../../state/store";

export type ControlBinding = {
  id: string;
  displayId?: string;
  decimals?: number;
  event?: "input" | "change";
  solver?: SolverMode;
  affectsTrace?: boolean;
  onChange?: () => void;
};

type BindHandlers = {
  getElement: <T extends HTMLElement>(id: string) => T;
  resetTrace: () => void;
  runSolverWhenActive: (mode: SolverMode) => void;
};

export function bindControls(configs: ControlBinding[], handlers: BindHandlers): Record<string, HTMLInputElement> {
  return configs.reduce<Record<string, HTMLInputElement>>((acc, config) => {
    const element = handlers.getElement<HTMLInputElement>(config.id);
    const display = config.displayId ? handlers.getElement<HTMLElement>(config.displayId) : null;
    const affectsTrace = config.affectsTrace ?? Boolean(config.solver);

    if (display) {
      display.textContent = config.decimals != null ? parseFloat(element.value).toFixed(config.decimals) : element.value;
    }

    element.addEventListener(config.event ?? "input", () => {
      if (display) {
        display.textContent = config.decimals != null ? parseFloat(element.value).toFixed(config.decimals) : element.value;
      }
      if (affectsTrace) handlers.resetTrace();
      if (config.onChange) config.onChange();
      else if (config.solver) handlers.runSolverWhenActive(config.solver);
    });

    acc[config.id] = element;
    return acc;
  }, {});
}

