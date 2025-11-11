import type { VecNs } from "../../types/arrays";

export interface TraceEntry {
  path: number[][];
  angle: number;
}

export interface TraceSlice {
  traceEnabled: boolean;
  currentTracePath: VecNs;
  totalRotationAngle: number;
  rotationCount: number;
  traceBuffer: TraceEntry[];
  maxTraceCount: number;
  lastDrawnTraceIndex: number;
}

export const createTraceSlice = (): TraceSlice => ({
  traceEnabled: false,
  currentTracePath: [],
  totalRotationAngle: 0,
  rotationCount: 0,
  traceBuffer: [],
  maxTraceCount: 0,
  lastDrawnTraceIndex: -1,
});
