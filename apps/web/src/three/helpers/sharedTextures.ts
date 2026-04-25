import { CanvasTexture } from "three";

function createCircleTexture() {
  const deviceRatio = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const size = 32 * deviceRatio * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create circle texture context");
  }

  context.clearRect(0, 0, size, size);
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
  context.fill();

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createSquareTexture() {
  const deviceRatio = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const size = 32 * deviceRatio * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create square texture context");
  }

  context.clearRect(0, 0, size, size);
  context.fillStyle = "#ffffff";
  const inset = size * 0.06;
  context.fillRect(inset, inset, size - inset * 2, size - inset * 2);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createStarTexture() {
  const deviceRatio = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const size = 48 * deviceRatio * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create star texture context");
  }

  const outerRadius = size * 0.38;
  const innerRadius = outerRadius * 0.47;
  const center = size / 2;

  context.clearRect(0, 0, size, size);
  context.fillStyle = "#ffffff";
  context.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.closePath();
  context.fill();

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export const SHARED_CIRCLE_TEXTURE = createCircleTexture();
export const SHARED_SQUARE_TEXTURE = createSquareTexture();
export const SHARED_STAR_TEXTURE = createStarTexture();
