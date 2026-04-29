const MIN_SCREEN_WIDTH = 750;
export function mountSmallScreenOverlay(parent: HTMLElement) {
  const node = document.createElement("div");
  node.className = "small-screen-overlay";
  parent.append(node);
  const render = () => {
    const w = window.innerWidth;
    node.className = `small-screen-overlay${w < MIN_SCREEN_WIDTH ? " is-flex" : " is-hidden"}`;
    node.textContent = `The window is not wide enough (${w}px < ${MIN_SCREEN_WIDTH}px) for lpviz.`;
  };
  window.addEventListener("resize", render);
  render();
  return {
    destroy: () => {
      window.removeEventListener("resize", render);
      node.remove();
    },
  };
}
