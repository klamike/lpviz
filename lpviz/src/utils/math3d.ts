import { Euler, Matrix4, Vector3 } from "three";
import { PointXY, PointXYZ } from "../types/arrays";

const rotationEuler = new Euler();
const forwardVector = new Vector3();
const inverseVector = new Vector3();
const inverseRotationMatrix = new Matrix4();

function applyRotation(point: PointXYZ, angles: PointXYZ, target: Vector3) {
  rotationEuler.set(angles.x, angles.y, angles.z, "XYZ");
  return target.set(point.x, point.y, point.z || 0).applyEuler(rotationEuler);
}

function projectVector(vector: Vector3, focalDistance: number): PointXY {
  if (vector.z >= focalDistance) {
    return { x: vector.x * 1000, y: vector.y * 1000 };
  }
  const factor = focalDistance / (focalDistance - vector.z);
  return { x: vector.x * factor, y: vector.y * factor };
}

export function transform2DTo3DAndProject(point: PointXYZ, viewAngles: PointXYZ, focalDistance: number) {
  const rotated = applyRotation(point, viewAngles, forwardVector);
  return projectVector(rotated, focalDistance);
}

export function inverseTransform2DProjection(
  projectedPoint2d: PointXY,
  viewAngles: PointXYZ,
): PointXY {
  rotationEuler.set(viewAngles.x, viewAngles.y, viewAngles.z, "XYZ");
  inverseRotationMatrix.makeRotationFromEuler(rotationEuler).invert();
  inverseVector.set(projectedPoint2d.x, projectedPoint2d.y, 0).applyMatrix4(inverseRotationMatrix);
  return { x: inverseVector.x, y: inverseVector.y };
}
