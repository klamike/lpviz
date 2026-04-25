import { useEffect, useRef, useState } from "react";
import {
  NULL_STATE_LOGO_VIEWBOX_WIDTH,
  NULL_STATE_LOGO_VIEWBOX_HEIGHT,
} from "../components/sidebar/NullStateLogo";

const DEFAULT_SIDEBAR_WIDTH = 450;
const MIN_SIDEBAR_WIDTH = 375;
const MAX_SIDEBAR_WIDTH = 1000;

const getMinSidebarWidth = (topResult: HTMLDivElement | null) => {
  if (!topResult) {
    return MIN_SIDEBAR_WIDTH;
  }

  const style = window.getComputedStyle(topResult);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const availableHeight = Math.max(
    1,
    topResult.clientHeight - paddingTop - paddingBottom,
  );
  const aspectRatio =
    NULL_STATE_LOGO_VIEWBOX_WIDTH / NULL_STATE_LOGO_VIEWBOX_HEIGHT;
  const logoWidth = availableHeight * aspectRatio;

  return Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(logoWidth + paddingLeft + paddingRight + 20, 400),
  );
};

export function useSidebarLayout() {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const topResultRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current) {
        return;
      }

      const minSidebarWidth = getMinSidebarWidth(topResultRef.current);
      setSidebarWidth(
        Math.max(minSidebarWidth, Math.min(event.clientX, MAX_SIDEBAR_WIDTH)),
      );
    };
    const handleMouseUp = () => {
      isResizingRef.current = false;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return {
    sidebarWidth,
    topResultRef,
    beginResize() {
      isResizingRef.current = true;
    },
  };
}
