import { Box3, Sphere } from "three";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { DEFAULT_BOUNDING_EXTENT } from "../constants";

export class AlwaysVisibleLineGeometry extends LineGeometry {
  // Avoid computing bounding volumes; effectively ignored in frustum culling
  override computeBoundingBox() {
    if (this.boundingBox === null) {
      this.boundingBox = new Box3();
    }
    this.boundingBox.min.setScalar(-DEFAULT_BOUNDING_EXTENT);
    this.boundingBox.max.setScalar(DEFAULT_BOUNDING_EXTENT);
  }

  override computeBoundingSphere() {
    if (this.boundingSphere === null) {
      this.boundingSphere = new Sphere();
    }
    this.boundingSphere.center.set(0, 0, 0);
    this.boundingSphere.radius = DEFAULT_BOUNDING_EXTENT;
  }
}
