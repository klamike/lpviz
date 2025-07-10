// for 3D visuals
export interface PointXY { x: number; y: number; }
export interface PointXYZ { x: number; y: number; z: number; }

// solver types
export type Vec2 = number[]; // [x, y]
export type Vec3 = number[]; // [x, y, z] or [A, B, C]
export type VecM = number[]; // M refers to number of constraints, e.g. for the barrier weights vector
export type VecN = number[]; // N refers to number of variables, e.g. for the objective vector
export type ArrayMatrix = number[][];

// for pdhg and simplex
export type Vec2N = number[];
export type Vec2Ns = Vec2N[];

// iterates
export type VecNs = VecN[];

// polytope representation
export type Vertices = Vec2[];
export type Line = Vec3;  // A, B, C in Ax + By = C
export type Lines = Line[];
