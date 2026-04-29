import type { PointXY } from "@lpviz/math/types";

export type GalleryProblem = {
  id: string;
  name: string;
  vertices: PointXY[];
  interiorPoint: PointXY;
  objectiveVector: PointXY;
};

const regularPolygon = (count: number, radiusX: number, radiusY: number) =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index * 2 * Math.PI) / count;
    return {
      x: radiusX * Math.cos(angle),
      y: radiusY * Math.sin(angle),
    };
  });

export const GALLERY_PROBLEMS: GalleryProblem[] = [
  {
    id: "pentagon",
    name: "Pentagon",
    vertices: [
      { x: -8, y: -5 },
      { x: -9, y: 4 },
      { x: -2, y: 9 },
      { x: 7, y: 5 },
      { x: 8, y: -4 },
    ],
    interiorPoint: { x: -1, y: 1 },
    objectiveVector: { x: 7, y: 3 },
  },
  {
    id: "corridor",
    name: "Corridor",
    vertices: [
      { x: -12, y: -3 },
      { x: -8, y: 5 },
      { x: 4, y: 6 },
      { x: 12, y: 1 },
      { x: 9, y: -5 },
      { x: -4, y: -6 },
    ],
    interiorPoint: { x: 0, y: 0 },
    objectiveVector: { x: 9, y: 2 },
  },
  {
    id: "diamond",
    name: "Diamond",
    vertices: [
      { x: 0, y: -9 },
      { x: -10, y: 0 },
      { x: 0, y: 9 },
      { x: 10, y: 0 },
    ],
    interiorPoint: { x: 0, y: 0 },
    objectiveVector: { x: 4, y: 8 },
  },
  {
    id: "wide-box",
    name: "Wide Box",
    vertices: [
      { x: -14, y: -4 },
      { x: -14, y: 4 },
      { x: 14, y: 4 },
      { x: 14, y: -4 },
    ],
    interiorPoint: { x: 0, y: 0 },
    objectiveVector: { x: 3, y: 7 },
  },
  {
    id: "needle",
    name: "Needle",
    vertices: [
      { x: -30, y: -0.35 },
      { x: -30, y: 0.35 },
      { x: 30, y: 0.35 },
      { x: 30, y: -0.35 },
    ],
    interiorPoint: { x: 0, y: 0 },
    objectiveVector: { x: 10, y: 0.1 },
  },
  {
    id: "slanted-strip",
    name: "Slanted Strip",
    vertices: [
      { x: -24, y: -8 },
      { x: -23, y: -6 },
      { x: 24, y: 8 },
      { x: 23, y: 6 },
    ],
    interiorPoint: { x: 0, y: 0 },
    objectiveVector: { x: 8, y: 6 },
  },
  {
    id: "many-facets",
    name: "Many Facets",
    vertices: regularPolygon(28, 12, 10),
    interiorPoint: { x: 0, y: 0 },
    objectiveVector: { x: 5, y: 7 },
  },
  {
    id: "flat-many",
    name: "Flat Facets",
    vertices: regularPolygon(32, 24, 2.2),
    interiorPoint: { x: 0, y: 0 },
    objectiveVector: { x: 9, y: 1 },
  },
  {
    id: "tight-corner",
    name: "Tight Corner",
    vertices: [
      { x: -10, y: -6 },
      { x: -10, y: 6 },
      { x: 2, y: 6 },
      { x: 9, y: 0.25 },
      { x: 9.25, y: -0.25 },
      { x: 2, y: -6 },
    ],
    interiorPoint: { x: -1, y: 0 },
    objectiveVector: { x: 10, y: 0.2 },
  },
];
