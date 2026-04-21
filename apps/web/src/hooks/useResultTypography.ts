import { useLayoutEffect, useRef, useState } from "react";

const BASE_RESULT_FONT_SIZE = 18;

const getResultFontSize = (maxLineChars: number, effectiveWidth: number) => {
  if (maxLineChars <= 0 || effectiveWidth <= 0) {
    return null;
  }

  const targetWidth = Math.max(1, effectiveWidth - 10);
  const maxLineWidth = maxLineChars * BASE_RESULT_FONT_SIZE * 0.55;
  const scale = Math.min(
    4,
    Math.max(0, targetWidth / Math.max(maxLineWidth, 1)),
  );

  return Math.min(24, Math.max(10, BASE_RESULT_FONT_SIZE * scale * 0.875));
};

export function useResultTypography({
  enabled,
  maxLineChars,
}: {
  enabled: boolean;
  maxLineChars: number;
}) {
  const resultRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = resultRef.current;
    if (!enabled || !element || maxLineChars <= 0) {
      setFontSize(null);
      return;
    }

    const updateFontSize = () => {
      const style = window.getComputedStyle(element);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;
      const effectiveWidth = element.clientWidth - paddingLeft - paddingRight;
      const nextFontSize = getResultFontSize(maxLineChars, effectiveWidth);

      setFontSize((currentFontSize) =>
        currentFontSize === nextFontSize ? currentFontSize : nextFontSize,
      );
    };

    updateFontSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFontSize);
      return () => {
        window.removeEventListener("resize", updateFontSize);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      updateFontSize();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [enabled, maxLineChars]);

  const resultStyle =
    !enabled || fontSize === null
      ? undefined
      : { ["--result-font-size" as string]: `${fontSize}px` };

  return {
    resultRef,
    resultStyle,
  };
}
