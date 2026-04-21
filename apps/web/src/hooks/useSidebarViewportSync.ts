import type { ViewportApi } from "@/features/viewport/runtime";
import { useEffect, useLayoutEffect, useRef } from "react";

export function useSidebarViewportSync({
  canvasManager,
  sidebarWidth,
  syncViewportLayout,
}: {
  canvasManager: ViewportApi | null;
  sidebarWidth: number;
  syncViewportLayout: (width: number) => void;
}) {
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  useLayoutEffect(() => {
    if (!canvasManager) return;
    syncViewportLayout(sidebarWidth);
  }, [canvasManager, sidebarWidth, syncViewportLayout]);

  useEffect(() => {
    if (!canvasManager) return;
    const handleResize = () => {
      syncViewportLayout(sidebarWidthRef.current);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [canvasManager, syncViewportLayout]);
}
