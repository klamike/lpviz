import type { SolverSettings } from "@lpviz/state";

export type SolverSettingUpdater = <K extends keyof SolverSettings>(
  key: K,
  value: SolverSettings[K],
) => void;
