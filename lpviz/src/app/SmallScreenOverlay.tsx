import { useEffect, useState } from "react";

import { MIN_SCREEN_WIDTH } from "./uiConstants";

export function SmallScreenOverlay() {
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const tooSmall = windowWidth < MIN_SCREEN_WIDTH;

  return (
    <div className={`small-screen-overlay${tooSmall ? " is-flex" : " is-hidden"}`}>
      {`The window is not wide enough (${windowWidth}px < ${MIN_SCREEN_WIDTH}px) for lpviz.`}
    </div>
  );
}
