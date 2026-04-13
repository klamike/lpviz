import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useLpvizRuntime } from "../../app/lpvizRuntime";
import { NULL_STATE_LOGO_VIEWBOX_HEIGHT, NULL_STATE_LOGO_VIEWBOX_WIDTH } from "../../ui/logo";

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
  const availableHeight = Math.max(1, topResult.clientHeight - paddingTop - paddingBottom);
  const aspectRatio = NULL_STATE_LOGO_VIEWBOX_WIDTH / NULL_STATE_LOGO_VIEWBOX_HEIGHT;
  const logoWidth = availableHeight * aspectRatio;

  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(logoWidth + paddingLeft + paddingRight + 20, 400));
};

export function useSidebarLayout() {
  const runtimeActions = useLpvizRuntime();
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const topResultRef = useRef<HTMLDivElement>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  const isResizingRef = useRef(false);

  useLayoutEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
    runtimeActions.setSidebarWidth(sidebarWidth);
  }, [runtimeActions, sidebarWidth]);

  useEffect(() => {
    const handleWindowResize = () => {
      runtimeActions.syncViewportLayout(sidebarWidthRef.current);
    };
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current) {
        return;
      }

      const minSidebarWidth = getMinSidebarWidth(topResultRef.current);
      setSidebarWidth(Math.max(minSidebarWidth, Math.min(event.clientX, MAX_SIDEBAR_WIDTH)));
    };
    const handleMouseUp = () => {
      isResizingRef.current = false;
    };

    window.addEventListener("resize", handleWindowResize);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [runtimeActions]);

  return {
    sidebarWidth,
    topResultRef,
    beginResize() {
      isResizingRef.current = true;
    },
  };
}
