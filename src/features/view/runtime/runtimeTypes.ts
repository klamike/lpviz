import type { SolverSettings } from "../../../store/lpvizStore";

export type SolverSettingUpdater = <K extends keyof SolverSettings>(
  key: K,
  value: SolverSettings[K],
) => void;
