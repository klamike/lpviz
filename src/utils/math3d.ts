import { ArrayMatrix, PointXY, PointXYZ } from "../types/arrays";

export function rotationMatrixX(angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    [1, 0, 0],
    [0, cos, -sin],
    [0, sin, cos],
  ];
}
export function rotationMatrixY(angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    [cos, 0, sin],
    [0, 1, 0],
    [-sin, 0, cos],
  ];
}
export function rotationMatrixZ(angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    [cos, -sin, 0],
    [sin, cos, 0],
    [0, 0, 1],
  ];
}

export function multiplyMatrices(a: ArrayMatrix, b: ArrayMatrix) {
  const result = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

export function transformPoint(matrix: ArrayMatrix, point: PointXYZ) {
  const x =
    matrix[0][0] * point.x + matrix[0][1] * point.y + matrix[0][2] * point.z;
  const y =
    matrix[1][0] * point.x + matrix[1][1] * point.y + matrix[1][2] * point.z;
  const z =
    matrix[2][0] * point.x + matrix[2][1] * point.y + matrix[2][2] * point.z;
  return { x, y, z };
}

export function combinedRotationMatrix(angles: PointXYZ) {
  const rx = rotationMatrixX(angles.x);
  const ry = rotationMatrixY(angles.y);
  const rz = rotationMatrixZ(angles.z);
  return multiplyMatrices(rz, multiplyMatrices(ry, rx));
}

export function perspectiveProject(point3d: PointXYZ, focalDistance: number) {
  if (point3d.z >= focalDistance) {
    return { x: point3d.x * 1000, y: point3d.y * 1000 };
  }

  const factor = focalDistance / (focalDistance - point3d.z);
  return {
    x: point3d.x * factor,
    y: point3d.y * factor,
  };
}

export function transform2DTo3DAndProject(
  point: PointXYZ,
  viewAngles: PointXYZ,
  focalDistance: number,
) {
  const point3d = { x: point.x, y: point.y, z: point.z || 0 };

  const rotationMatrix = combinedRotationMatrix(viewAngles);
  const transformedPoint = transformPoint(rotationMatrix, point3d);

  return perspectiveProject(transformedPoint, focalDistance);
}

export function inverseTransform2DProjection(
  projectedPoint2d: PointXY,
  viewAngles: PointXYZ,
  focalDistance: number,
) {
  const rotationMatrix = combinedRotationMatrix(viewAngles);
  const inverseRotationMatrix = [
    [rotationMatrix[0][0], rotationMatrix[1][0], rotationMatrix[2][0]],
    [rotationMatrix[0][1], rotationMatrix[1][1], rotationMatrix[2][1]],
    [rotationMatrix[0][2], rotationMatrix[1][2], rotationMatrix[2][2]],
  ];

  // For inverse projection, we assume the point lies on the z=0 plane in the original space
  // This is a reasonable assumption for most use cases in this 2D->3D visualization
  const estimatedZ = 0;

  const factor = focalDistance / (focalDistance - estimatedZ);
  const unprojected = {
    x: projectedPoint2d.x / factor,
    y: projectedPoint2d.y / factor,
    z: estimatedZ,
  };

  const original3D = transformPoint(inverseRotationMatrix, unprojected);

  return { x: original3D.x, y: original3D.y };
}
