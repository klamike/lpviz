import { Vec2, Vec3 } from "../state/state";

export function rotationMatrixX(angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    [1, 0, 0],
    [0, cos, -sin],
    [0, sin, cos]
  ];
}
export function rotationMatrixY(angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    [cos, 0, sin],
    [0, 1, 0],
    [-sin, 0, cos]
  ];
}
export function rotationMatrixZ(angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    [cos, -sin, 0],
    [sin, cos, 0],
    [0, 0, 1]
  ];
}

export function multiplyMatrices(a: number[][], b: number[][]) {
  const result = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

export function transformPoint(matrix: number[][], point: Vec3) {
  const x = matrix[0][0] * point.x + matrix[0][1] * point.y + matrix[0][2] * point.z;
  const y = matrix[1][0] * point.x + matrix[1][1] * point.y + matrix[1][2] * point.z;
  const z = matrix[2][0] * point.x + matrix[2][1] * point.y + matrix[2][2] * point.z;
  return { x, y, z };
}

export function combinedRotationMatrix(angles: Vec3) {
  const rx = rotationMatrixX(angles.x);
  const ry = rotationMatrixY(angles.y);
  const rz = rotationMatrixZ(angles.z);
  return multiplyMatrices(rz, multiplyMatrices(ry, rx));
}

export function perspectiveProject(point3d: Vec3, focalDistance: number) {
  if (point3d.z >= focalDistance) {
    return { x: point3d.x * 1000, y: point3d.y * 1000 };
  }
  
  const factor = focalDistance / (focalDistance - point3d.z);
  return {
    x: point3d.x * factor,
    y: point3d.y * factor
  };
}

export function transform2DTo3DAndProject(point: Vec3, viewAngles: Vec3, focalDistance: number) {
  const point3d = { x: point.x, y: point.y, z: point.z || 0 };
  
  const rotationMatrix = combinedRotationMatrix(viewAngles);
  const transformedPoint = transformPoint(rotationMatrix, point3d);
  
  return perspectiveProject(transformedPoint, focalDistance);
}

export function inverseTransform2DProjection(projectedPoint2d: Vec2, viewAngles: Vec3, focalDistance: number) {
  const rotationMatrix = combinedRotationMatrix(viewAngles);
  const inverseRotationMatrix = [
    [rotationMatrix[0][0], rotationMatrix[1][0], rotationMatrix[2][0]],
    [rotationMatrix[0][1], rotationMatrix[1][1], rotationMatrix[2][1]],
    [rotationMatrix[0][2], rotationMatrix[1][2], rotationMatrix[2][2]]
  ];
  
  const transformedOrigin = transformPoint(rotationMatrix, { x: 0, y: 0, z: 0 } as Vec3);
  const estimatedZ = transformedOrigin.z;
  
  const factor = (focalDistance - estimatedZ) / focalDistance;
  const unprojected = {
    x: projectedPoint2d.x / factor,
    y: projectedPoint2d.y / factor,
    z: estimatedZ
  };
  
  const original3D = transformPoint(inverseRotationMatrix, unprojected);
  
  return { x: original3D.x, y: original3D.y };
} 