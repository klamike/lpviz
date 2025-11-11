import type { HistoryEntry } from "../history";

export interface HistorySlice {
  historyStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

export const createHistorySlice = (): HistorySlice => ({
  historyStack: [],
  redoStack: [],
});
