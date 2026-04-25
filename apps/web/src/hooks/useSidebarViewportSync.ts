import type { ViewportApi } from "@/features/viewport/runtime";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useLatest } from "@/hooks/useLatest";

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
  const syncViewportLayoutRef = useLatest(syncViewportLayout);

  useLayoutEffect(() => {
    if (!canvasManager) return;
    syncViewportLayoutRef.current(sidebarWidth);
  }, [canvasManager, sidebarWidth]);

  useEffect(() => {
    if (!canvasManager) return;
    const handleResize = () => {
      syncViewportLayoutRef.current(sidebarWidthRef.current);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [canvasManager]);
}
