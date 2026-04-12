type LpvizRuntimeCommandHandlers = {
  setConstraintHighlight: (index: number | null) => void;
  setIterateHighlight: (index: number | null) => void;
};

const noop = () => {};

let runtimeCommandHandlers: LpvizRuntimeCommandHandlers = {
  setConstraintHighlight: noop,
  setIterateHighlight: noop,
};

export const lpvizRuntimeCommands = {
  setConstraintHighlight(index: number | null) {
    runtimeCommandHandlers.setConstraintHighlight(index);
  },
  setIterateHighlight(index: number | null) {
    runtimeCommandHandlers.setIterateHighlight(index);
  },
};

export function registerLpvizRuntimeCommands(handlers: LpvizRuntimeCommandHandlers) {
  runtimeCommandHandlers = handlers;

  return () => {
    runtimeCommandHandlers = {
      setConstraintHighlight: noop,
      setIterateHighlight: noop,
    };
  };
}
