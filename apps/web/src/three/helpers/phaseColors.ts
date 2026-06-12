import { Color } from "three";

export const PHASE_COLORS = [
  "#377eb8",
  "#800080",
  "#4daf4a",
  "#984ea3",
  "#ff7f00",
  "#ffff33",
  "#a65628",
  "#f781bf",
  "#999999",
  "#17becf",
];

export const PHASE_COLORS_LINEAR: ReadonlyArray<
  readonly [number, number, number]
> = PHASE_COLORS.map((hex) => {
  const c = new Color(hex);
  return [c.r, c.g, c.b] as const;
});

// raw sRGB bytes, for shaders that write to the framebuffer without the
// built-in materials' linear-to-sRGB output conversion (see pathRibbon.ts)
export const PHASE_COLORS_BYTES: ReadonlyArray<
  readonly [number, number, number]
> = PHASE_COLORS.map((hex) => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255] as const;
});
