import { Line2 } from "three/examples/jsm/lines/Line2.js";

export class UndashedLine2 extends Line2 {
  override computeLineDistances() {
    // Intentionally no-op to avoid per-frame distance recomputation.
    return this;
  }
}
