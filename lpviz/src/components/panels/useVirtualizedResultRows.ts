import { useEffect, useMemo, useRef, useState } from "react";

import type { ResultTextBlock } from "../../ui/resultPayload";

const ESTIMATED_ROW_HEIGHT = 22;
const OVERSCAN_ROWS = 25;

export function useVirtualizedResultRows({
  enabled,
  rows,
}: {
  enabled: boolean;
  rows: ResultTextBlock[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(ESTIMATED_ROW_HEIGHT);

  useEffect(() => {
    const element = scrollRef.current;
    if (!enabled || !element) {
      setScrollTop(0);
      setViewportHeight(ESTIMATED_ROW_HEIGHT);
      return;
    }

    const syncLayout = () => {
      setScrollTop(element.scrollTop);
      setViewportHeight(Math.max(element.clientHeight, ESTIMATED_ROW_HEIGHT));
    };

    syncLayout();
    element.addEventListener("scroll", syncLayout, { passive: true });

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncLayout);
      return () => {
        element.removeEventListener("scroll", syncLayout);
        window.removeEventListener("resize", syncLayout);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      syncLayout();
    });
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener("scroll", syncLayout);
      resizeObserver.disconnect();
    };
  }, [enabled, rows]);

  const virtualRows = useMemo(() => {
    if (!enabled || rows.length === 0) {
      return {
        visibleRows: rows,
        paddingTop: 0,
        paddingBottom: 0,
      };
    }

    const visibleStart = Math.max(0, Math.floor(scrollTop / ESTIMATED_ROW_HEIGHT) - OVERSCAN_ROWS);
    const visibleEnd = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / ESTIMATED_ROW_HEIGHT) + OVERSCAN_ROWS);

    if (visibleEnd <= visibleStart) {
      return {
        visibleRows: [],
        paddingTop: 0,
        paddingBottom: 0,
      };
    }

    const paddingTop = visibleStart * ESTIMATED_ROW_HEIGHT;
    const paddingBottom = Math.max(rows.length * ESTIMATED_ROW_HEIGHT - visibleEnd * ESTIMATED_ROW_HEIGHT, 0);

    return {
      visibleRows: rows.slice(visibleStart, visibleEnd),
      paddingTop,
      paddingBottom,
    };
  }, [enabled, rows, scrollTop, viewportHeight]);

  return {
    scrollRef,
    ...virtualRows,
  };
}
