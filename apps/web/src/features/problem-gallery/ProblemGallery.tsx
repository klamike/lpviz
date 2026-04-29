import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { useAppActions } from "@/features/core/actions";
import { GALLERY_PROBLEMS, type GalleryProblem } from "./problems";

const GALLERY_IDLE_DELAY_MS = 3000;
const GALLERY_ITEM_WIDTH_PX = 84;
const GALLERY_ITEM_GAP_PX = 8;
const GALLERY_CHROME_WIDTH_PX = 16;

function pointsAttribute(problem: GalleryProblem) {
  const minX = Math.min(...problem.vertices.map((v) => v.x));
  const maxX = Math.max(...problem.vertices.map((v) => v.x));
  const minY = Math.min(...problem.vertices.map((v) => v.y));
  const maxY = Math.max(...problem.vertices.map((v) => v.y));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);

  return problem.vertices
    .map((vertex) => {
      const x = 8 + ((vertex.x - minX) / width) * 44;
      const y = 36 - ((vertex.y - minY) / height) * 28;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function ProblemGallery({ sidebarWidth }: { sidebarWidth: number }) {
  const runtimeActions = useAppActions();
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<number | null>(null);
  const cancelAutoExpandRef = useRef<() => void>(() => {});

  useEffect(() => {
    function clearTimer() {
      if (timerRef.current === null) return;
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    function stopAutoExpand() {
      clearTimer();
      document.removeEventListener("click", handleFirstClick);
    }

    function handleFirstClick() {
      setExpanded(false);
      stopAutoExpand();
    }

    cancelAutoExpandRef.current = stopAutoExpand;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setExpanded(true);
      document.removeEventListener("click", handleFirstClick);
    }, GALLERY_IDLE_DELAY_MS);
    document.addEventListener("click", handleFirstClick);

    return () => {
      document.removeEventListener("click", handleFirstClick);
      clearTimer();
    };
  }, []);

  return (
    <div
      className={`problem-gallery ${expanded ? "is-expanded" : ""}`.trim()}
      style={{
        left: `calc(${sidebarWidth}px + (100vw - ${sidebarWidth}px) / 2)`,
        "--problem-gallery-expanded-width": `min(${GALLERY_PROBLEMS.length * GALLERY_ITEM_WIDTH_PX + Math.max(0, GALLERY_PROBLEMS.length - 1) * GALLERY_ITEM_GAP_PX + GALLERY_CHROME_WIDTH_PX}px, calc(100vw - ${sidebarWidth}px - 120px))`,
      } as CSSProperties}
      aria-label="Problem gallery"
    >
      <button
        type="button"
        className="problem-gallery__toggle"
        title="Problem gallery"
        aria-expanded={expanded}
        onClick={(event) => {
          event.stopPropagation();
          cancelAutoExpandRef.current();
          setExpanded((value) => !value);
        }}
      >
        <svg
          className="problem-gallery__chevron"
          viewBox="0 0 12 8"
          aria-hidden="true"
        >
          <polyline points="1 1 6 6 11 1" />
        </svg>
      </button>
      <div className="problem-gallery__items" aria-hidden={!expanded}>
        {GALLERY_PROBLEMS.map((problem) => (
          <button
            key={problem.id}
            type="button"
            className="problem-gallery__item"
            title={problem.name}
            onClick={() => runtimeActions.loadGalleryProblem(problem)}
          >
            <svg
              className="problem-gallery__thumb"
              viewBox="0 0 60 44"
              aria-hidden="true"
            >
              <polygon points={pointsAttribute(problem)} />
              <line
                x1="30"
                y1="22"
                x2={30 + problem.objectiveVector.x}
                y2={22 - problem.objectiveVector.y}
              />
            </svg>
            <span>{problem.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
