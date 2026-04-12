type LpvizRuntimeCommandHandlers = {
  setConstraintHighlight: (index: number | null) => void;
};

const noop = () => {};

let runtimeCommandHandlers: LpvizRuntimeCommandHandlers = {
  setConstraintHighlight: noop,
};

export const lpvizRuntimeCommands = {
  setConstraintHighlight(index: number | null) {
    runtimeCommandHandlers.setConstraintHighlight(index);
  },
};

export function registerLpvizRuntimeCommands(handlers: LpvizRuntimeCommandHandlers) {
  runtimeCommandHandlers = handlers;

  return () => {
    runtimeCommandHandlers = {
      setConstraintHighlight: noop,
    };
  };
}
