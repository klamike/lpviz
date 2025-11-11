import { Box3, Sphere } from "three";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

const DEFAULT_BOUNDING_EXTENT = 1e9;

export class AlwaysVisibleLineGeometry extends LineGeometry {
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
