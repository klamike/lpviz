import {
  DEFAULT_VIEW_ANGLE,
  getDisplayedIterateZ,
  getState,
  setState,
  on,
  onMeta,
  type ViewportDirtyFlags,
} from "@/features/core/store";
import type { BoundingBox } from "@lpviz/math/geometry";
import type { PointXY } from "@lpviz/math/types";
import {
  buildViewport2DSnapshot,
  fitViewport2DToBounds,
  isDefault2DView,
  toCanvasCoords2D,
  toLogicalCoords2D,
} from "@lpviz/viewport/projection2d";
import {
  getObjectiveScreenPosition3D,
  toCanvasCoords3D,
  toLogicalCoords3D,
} from "@lpviz/viewport/projection3d";
import {
  buildPerspectivePoseFromViewAngle,
  buildTransitionCompleteState,
  buildTransitionStartState,
  buildViewport2DStateFromTransitionFrame,
  buildViewportTransitionFrame,
  buildViewportTransitionPlan,
  TRANSITION_VIEWPORT_DIRTY_FLAGS,
  type ViewportTransitionPlan,
} from "@lpviz/viewport/transition";
import {
  buildResetViewport3DView,
  buildViewport3DSnapshot,
  fitViewport3DToBounds,
  getDefaultPerspectiveDistance3D,
  getMaxPerspectiveDistance3D,
  getViewAngleFromSnapshot3D,
  isDefault3DView,
} from "@lpviz/viewport/view3d";
import {
  getConstraintViewportDirtyFlags,
  getDraftPreviewViewportDirtyFlags,
  getIterateViewportDirtyFlags,
  getObjectiveViewportDirtyFlags,
  getPolytopeViewportDirtyFlags,
  getTraceViewportDirtyFlags,
  getViewportUnboundedClipBounds,
  getZScaleViewportDirtyFlags,
  isViewport3DState,
} from "./dirtyFlags";
import {
  getViewport2DControlsConfig,
  getViewport2DControlsSnapshot,
  resetViewport2DControlsConfig,
  setViewport2DControlsConfig,
  setViewport2DControlsState,
  syncViewport2DControlsStateFromSnapshot,
} from "./runtime/controls2d";
import {
  resetViewport3DControlsConfig,
  setViewport3DControlsConfig,
} from "./runtime/controls3d";
import {
  getViewportRenderSnapshot,
  resetViewportRenderSnapshot,
  setViewportRenderSnapshot,
} from "./runtime/snapshot";
import {
  resetViewportTransitionConfig,
  setViewportTransitionConfig,
} from "./runtime/transitionConfig";
import {
  DEFAULT_VIEWPORT_RENDER_SNAPSHOT,
  type ViewportBridge,
  type ViewportRenderSnapshot,
} from "./types";

const VIEWPORT_NAVIGATION_IDLE_MS = 100;

const ALL_VIEWPORT_DIRTY_FLAGS: ViewportDirtyFlags = {
  grid: true,
  polytope: true,
  constraints: true,
  objective: true,
  trace: true,
  iterate: true,
};

const getGridPanKey = (snapshot: ViewportRenderSnapshot) =>
  snapshot.mode === "2d"
    ? `${Math.round(snapshot.target.x)}:${Math.round(snapshot.target.y)}`
    : "";

function getSnapshotViewportDirtyFlags(
  prev: ViewportRenderSnapshot,
  next: ViewportRenderSnapshot,
): ViewportDirtyFlags {
  if (prev.mode !== next.mode) {
    return ALL_VIEWPORT_DIRTY_FLAGS;
  }

  if (prev.transitionZMultiplier !== next.transitionZMultiplier) {
    return TRANSITION_VIEWPORT_DIRTY_FLAGS;
  }

  const sizeChanged = prev.width !== next.width || prev.height !== next.height;
  const zoomChanged =
    prev.scaleFactor !== next.scaleFactor ||
    prev.unitsPerPixel !== next.unitsPerPixel ||
    prev.gridSpacing !== next.gridSpacing ||
    prev.orthographic.left !== next.orthographic.left ||
    prev.orthographic.right !== next.orthographic.right ||
    prev.orthographic.top !== next.orthographic.top ||
    prev.orthographic.bottom !== next.orthographic.bottom ||
    prev.perspective.fov !== next.perspective.fov ||
    prev.perspective.aspect !== next.perspective.aspect ||
    prev.perspective.near !== next.perspective.near ||
    prev.perspective.far !== next.perspective.far;
  if (zoomChanged || sizeChanged) {
    return { grid: true, objective: true };
  }

  if (getGridPanKey(prev) !== getGridPanKey(next)) {
    return { grid: true };
  }

  return {};
}

type ViewportZBounds = {
  minZ: number;
  maxZ: number;
};

export type ViewportApi = {
  draw: () => void;
  updateDimensions: () => void;
  setSidebarWidth: (width: number) => void;
  setNavigationFrameCallback: (callback: (() => void) | null) => void;
  isDefaultView: () => boolean;
  setViewState: (scale: number, offsetX: number, offsetY: number) => void;
  zoomToFit: (
    bounds: BoundingBox,
    padding?: number,
    zBounds?: ViewportZBounds,
  ) => void;
  resetView: () => void;
  setControlsBlocked: (blocked: boolean) => void;
  set2DPanEnabled: (enabled: boolean) => void;
  toLogicalCoords: (x: number, y: number) => PointXY;
  toCanvasCoords: (x: number, y: number, z?: number) => PointXY;
  getObjectiveScreenPosition: (point: PointXY) => PointXY;
  getUnboundedClipBounds: () => BoundingBox;
  start3DTransition: (targetMode: boolean) => void;
  getCanvasElement: () => HTMLCanvasElement;
  getCanvasRect: () => DOMRect;
  getObjectiveDirtyFlags: () => ViewportDirtyFlags;
  getPolytopeDirtyFlags: () => ViewportDirtyFlags;
  getTraceDirtyFlags: () => ViewportDirtyFlags;
  getIterateDirtyFlags: () => ViewportDirtyFlags;
  getConstraintDirtyFlags: () => ViewportDirtyFlags;
  getDraftPreviewDirtyFlags: () => ViewportDirtyFlags;
  getZScaleDirtyFlags: () => ViewportDirtyFlags;
};

export type ViewportRuntime = ViewportApi & {
  destroy: () => void;
};

export async function createViewportRuntime({
  viewportBridge,
}: {
  viewportBridge: ViewportBridge;
}): Promise<ViewportRuntime> {
  let currentSidebarWidth = 0;
  let navigationFrameCallback: (() => void) | null = null;
  let navigationIdleTimeoutId: number | null = null;
  let managerSnapshot: ViewportRenderSnapshot = {
    ...DEFAULT_VIEWPORT_RENDER_SNAPSHOT,
  };
  let externalControlsBlocked = false;
  let external2DViewportActive = false;
  let external3DControlsActive = false;
  let external3DControlsSyncToken = 0;
  let externalTransitionRunId = 0;
  let externalTransitionSnapshotActive = false;
  let externalTransitionProgress = 0;
  let activeTransitionPlan: ViewportTransitionPlan | null = null;
  let cachedViewportRect = viewportBridge.getCanvasRect();

  const shouldUseExternal2DViewport = () => {
    const state = getState();
    return !state.is3DMode && !state.isTransitioning3D;
  };

  const shouldUseExternal3DControls = () => {
    const state = getState();
    return state.is3DMode && !state.isTransitioning3D;
  };

  const isExternalViewportNavigationOwned = () =>
    shouldUseExternal2DViewport() || shouldUseExternal3DControls();

  const setViewportNavigationActive = (active: boolean) => {
    if (getState().isNavigatingViewport === active) {
      return;
    }
    setState({ isNavigatingViewport: active }, { viewportDirty: {} });
  };

  const clearViewportNavigationTimeout = () => {
    if (navigationIdleTimeoutId !== null) {
      clearTimeout(navigationIdleTimeoutId);
      navigationIdleTimeoutId = null;
    }
  };

  const beginViewportNavigation = () => {
    if (!isExternalViewportNavigationOwned()) {
      return;
    }
    clearViewportNavigationTimeout();
    setViewportNavigationActive(true);
  };

  const scheduleViewportNavigationEnd = () => {
    clearViewportNavigationTimeout();
    navigationIdleTimeoutId = window.setTimeout(() => {
      navigationIdleTimeoutId = null;
      if (!isExternalViewportNavigationOwned()) {
        return;
      }
      setViewportNavigationActive(false);
    }, VIEWPORT_NAVIGATION_IDLE_MS);
  };

  const notifyViewportNavigationFrame = () => {
    if (!shouldUseExternal2DViewport()) {
      return;
    }
    beginViewportNavigation();
    navigationFrameCallback?.();
    scheduleViewportNavigationEnd();
  };

  const publishSnapshot = (snapshot: ViewportRenderSnapshot) => {
    const previousSnapshot = getViewportRenderSnapshot();
    setViewportRenderSnapshot(snapshot);
    const viewportDirty = getSnapshotViewportDirtyFlags(
      previousSnapshot,
      snapshot,
    );
    const hasLayerDirty = Object.keys(viewportDirty).length > 0;
    viewportBridge.invalidate({
      layers: hasLayerDirty,
      viewportDirty: hasLayerDirty ? viewportDirty : undefined,
    });
  };

  const refreshViewportRect = () => {
    cachedViewportRect = viewportBridge.getCanvasRect();
    return cachedViewportRect;
  };

  const getViewportRect = () => cachedViewportRect;

  const buildPoseFromSnapshot = (snapshot: ViewportRenderSnapshot) => ({
    position: { ...snapshot.perspective.position },
    up: { ...snapshot.perspective.up },
    target: { ...snapshot.target },
  });

  const rebuildExternal3DSnapshot = (
    pose = buildPoseFromSnapshot(managerSnapshot),
  ) => {
    managerSnapshot = buildViewport3DSnapshot(
      managerSnapshot,
      pose,
      getViewportRect(),
    );
    return managerSnapshot;
  };

  const getExternal2DSnapshot = () =>
    getViewport2DControlsSnapshot(getViewportRect());

  const buildInitialSnapshot = () => {
    const initial2DSnapshot = getExternal2DSnapshot();
    const state = getState();
    if (!isViewport3DState(state)) {
      return initial2DSnapshot;
    }

    const pose = buildPerspectivePoseFromViewAngle(
      state.viewAngle,
      getDefaultPerspectiveDistance3D(initial2DSnapshot, getViewportRect()),
      initial2DSnapshot.target,
    );
    return buildViewport3DSnapshot(initial2DSnapshot, pose, getViewportRect());
  };

  const syncManagerPlanarState = () => {
    managerSnapshot = getExternal2DSnapshot();
    setViewport2DControlsConfig(
      {
        sidebarWidth: currentSidebarWidth,
        fallbackSnapshot: managerSnapshot,
      },
      { emit: false },
    );
  };

  const syncTransitionPlanarState = (
    plan: ViewportTransitionPlan,
    frame: ReturnType<typeof buildViewportTransitionFrame>,
  ) => {
    if (plan.direction !== "to2d") {
      return undefined;
    }

    const planarState = buildViewport2DStateFromTransitionFrame(
      plan,
      frame,
      getViewportRect(),
      currentSidebarWidth,
    );
    setViewport2DControlsConfig(
      {
        sidebarWidth: currentSidebarWidth,
        fallbackSnapshot: frame.snapshot,
      },
      { emit: false },
    );
    setViewport2DControlsState(planarState, {
      notify: false,
      emit: false,
    });
    return planarState;
  };

  const applyExternalPerspectivePose = (
    pose: {
      position: { x: number; y: number; z: number };
      up: { x: number; y: number; z: number };
      target: { x: number; y: number; z: number };
    },
    options: { syncControls?: boolean } = {},
  ) => {
    const previousScaleFactor = managerSnapshot.scaleFactor;
    rebuildExternal3DSnapshot(pose);
    if (Math.abs(managerSnapshot.scaleFactor - previousScaleFactor) > 1e-6) {
      setState({}, { viewportDirty: { objective: true } });
    }
    if (external3DControlsActive && options.syncControls) {
      publish3DControlsConfig({ syncFromSnapshot: true });
    }
    publishSnapshot(managerSnapshot);
  };

  const publish3DControlsConfig = ({
    syncFromSnapshot = false,
  }: {
    syncFromSnapshot?: boolean;
  } = {}) => {
    if (syncFromSnapshot) {
      external3DControlsSyncToken += 1;
    }

    setViewport3DControlsConfig({
      enabled: external3DControlsActive,
      blocked: externalControlsBlocked,
      maxDistance: getMaxPerspectiveDistance3D(
        managerSnapshot,
        getViewportRect(),
      ),
      syncToken: external3DControlsSyncToken,
      snapshot: managerSnapshot,
      onStart: () => {
        beginViewportNavigation();
        scheduleViewportNavigationEnd();
      },
      onChange: (pose) => {
        applyExternalPerspectivePose(pose);
        beginViewportNavigation();
        navigationFrameCallback?.();
        scheduleViewportNavigationEnd();
      },
      onEnd: () => {
        scheduleViewportNavigationEnd();
      },
    });
  };

  const syncExternal2DControls = (
    enabled: boolean,
    options: { syncStateFromSnapshot?: boolean } = {},
  ) => {
    if (options.syncStateFromSnapshot) {
      syncViewport2DControlsStateFromSnapshot(
        managerSnapshot,
        currentSidebarWidth,
        { emit: false },
      );
    }

    setViewport2DControlsConfig(
      {
        enabled,
        blocked: externalControlsBlocked,
        sidebarWidth: currentSidebarWidth,
        fallbackSnapshot: managerSnapshot,
      },
      { emit: false },
    );
  };

  const syncExternal3DControls = (
    enabled: boolean,
    options: { syncFromSnapshot?: boolean } = {},
  ) => {
    external3DControlsActive = enabled;
    if (enabled) {
      rebuildExternal3DSnapshot();
    }
    publish3DControlsConfig({
      syncFromSnapshot: enabled && options.syncFromSnapshot,
    });
  };

  setViewport2DControlsConfig(
    {
      enabled: false,
      blocked: externalControlsBlocked,
      panEnabled: true,
      sidebarWidth: currentSidebarWidth,
      fallbackSnapshot: managerSnapshot,
      onStateChange: (state) => {
        managerSnapshot = buildViewport2DSnapshot(
          state,
          currentSidebarWidth,
          getViewportRect(),
          managerSnapshot,
        );
        setViewport2DControlsConfig(
          {
            sidebarWidth: currentSidebarWidth,
            fallbackSnapshot: managerSnapshot,
          },
          { emit: false },
        );
        publishSnapshot(managerSnapshot);
      },
      onNavigationFrame: () => {
        notifyViewportNavigationFrame();
      },
    },
    { emit: false },
  );
  syncViewport2DControlsStateFromSnapshot(
    managerSnapshot,
    currentSidebarWidth,
    {
      emit: false,
    },
  );
  managerSnapshot = buildInitialSnapshot();
  setViewport2DControlsConfig(
    {
      sidebarWidth: currentSidebarWidth,
      fallbackSnapshot: managerSnapshot,
    },
    { emit: false },
  );

  external2DViewportActive = shouldUseExternal2DViewport();
  syncExternal2DControls(external2DViewportActive, {
    syncStateFromSnapshot: external2DViewportActive,
  });
  syncExternal3DControls(shouldUseExternal3DControls(), {
    syncFromSnapshot: shouldUseExternal3DControls(),
  });
  publishSnapshot(
    external2DViewportActive ? getExternal2DSnapshot() : managerSnapshot,
  );

  const externalOwnershipController = new AbortController();
  on(
    ["is3DMode", "isTransitioning3D"],
    () => {
      const nextExternal2DViewportActive = shouldUseExternal2DViewport();
      const nextExternal3DControlsActive = shouldUseExternal3DControls();
      const external2DChanged =
        nextExternal2DViewportActive !== external2DViewportActive;
      const external3DChanged =
        nextExternal3DControlsActive !== external3DControlsActive;

      if (!external2DChanged && !external3DChanged) {
        return;
      }

      syncExternal2DControls(nextExternal2DViewportActive);

      if (external3DChanged) {
        syncExternal3DControls(nextExternal3DControlsActive, {
          syncFromSnapshot: nextExternal3DControlsActive,
        });
      }

      external2DViewportActive = nextExternal2DViewportActive;

      if (externalTransitionSnapshotActive) {
        return;
      }

      if (external2DViewportActive) {
        managerSnapshot = getExternal2DSnapshot();
        setViewport2DControlsConfig(
          {
            sidebarWidth: currentSidebarWidth,
            fallbackSnapshot: managerSnapshot,
          },
          { emit: false },
        );
        syncExternal2DControls(true);
        publishSnapshot(managerSnapshot);
        return;
      }

      publishSnapshot(managerSnapshot);
    },
    externalOwnershipController.signal,
  );

  const viewportDirtyController = new AbortController();
  onMeta((meta) => {
    const viewportDirty = meta?.viewportDirty;
    if (!viewportDirty || Object.keys(viewportDirty).length === 0) {
      return;
    }
    viewportBridge.invalidate({ viewportDirty });
  }, viewportDirtyController.signal);

  return {
    draw: () => {
      viewportBridge.invalidate({ layers: false });
    },
    updateDimensions: () => {
      refreshViewportRect();
      if (shouldUseExternal2DViewport()) {
        managerSnapshot = getExternal2DSnapshot();
        setViewport2DControlsConfig(
          {
            sidebarWidth: currentSidebarWidth,
            fallbackSnapshot: managerSnapshot,
          },
          { emit: false },
        );
        publishSnapshot(managerSnapshot);
        return;
      }
      if (externalTransitionSnapshotActive && activeTransitionPlan) {
        const frame = buildViewportTransitionFrame(
          activeTransitionPlan,
          externalTransitionProgress,
          getViewportRect(),
        );
        syncTransitionPlanarState(activeTransitionPlan, frame);
        managerSnapshot = frame.snapshot;
        publishSnapshot(frame.snapshot);
        return;
      }
      if (external3DControlsActive) {
        rebuildExternal3DSnapshot();
        publish3DControlsConfig();
        publishSnapshot(managerSnapshot);
        return;
      }
      publishSnapshot(managerSnapshot);
    },
    setSidebarWidth: (width) => {
      currentSidebarWidth = width;
      refreshViewportRect();
      setViewport2DControlsConfig({ sidebarWidth: width }, { emit: false });
      if (shouldUseExternal2DViewport()) {
        syncManagerPlanarState();
        publishSnapshot(getExternal2DSnapshot());
        return;
      }
      if (externalTransitionSnapshotActive && activeTransitionPlan) {
        const frame = buildViewportTransitionFrame(
          activeTransitionPlan,
          externalTransitionProgress,
          getViewportRect(),
        );
        syncTransitionPlanarState(activeTransitionPlan, frame);
        managerSnapshot = frame.snapshot;
        publishSnapshot(frame.snapshot);
        return;
      }
      if (external3DControlsActive) {
        rebuildExternal3DSnapshot();
        publish3DControlsConfig();
        publishSnapshot(managerSnapshot);
        return;
      }
      publishSnapshot(managerSnapshot);
    },
    setNavigationFrameCallback: (callback) => {
      navigationFrameCallback = callback;
    },
    isDefaultView: () => {
      if (shouldUseExternal2DViewport()) {
        return isDefault2DView(
          getExternal2DSnapshot(),
          getViewport2DControlsConfig().sidebarWidth,
        );
      }

      if (!getState().isTransitioning3D) {
        return isDefault3DView(managerSnapshot);
      }

      return false;
    },
    setViewState: (scale, offsetX, offsetY) => {
      const { state } = getViewport2DControlsConfig();
      const nextPlanarState = {
        gridSpacing: state.gridSpacing,
        scaleFactor: scale,
        offsetX,
        offsetY,
      };

      if (shouldUseExternal2DViewport()) {
        setViewport2DControlsState(nextPlanarState);
        return;
      }

      setViewport2DControlsState(nextPlanarState, {
        notify: false,
        emit: false,
      });
      managerSnapshot = buildViewport2DSnapshot(
        nextPlanarState,
        currentSidebarWidth,
        getViewportRect(),
        managerSnapshot,
      );
      setViewport2DControlsConfig(
        {
          sidebarWidth: currentSidebarWidth,
          fallbackSnapshot: managerSnapshot,
        },
        { emit: false },
      );
    },
    zoomToFit: (bounds, padding, zBounds) => {
      if (shouldUseExternal2DViewport()) {
        const { state, sidebarWidth } = getViewport2DControlsConfig();
        setViewport2DControlsState(
          fitViewport2DToBounds(
            state,
            sidebarWidth,
            getViewportRect(),
            managerSnapshot,
            bounds,
            padding,
          ),
        );
        return;
      }

      if (!getState().isTransitioning3D) {
        const state = getState();
        const nextView = fitViewport3DToBounds(
          managerSnapshot,
          getViewportRect(),
          currentSidebarWidth,
          bounds,
          padding,
          zBounds
            ? {
                minZ: (zBounds.minZ * state.zScale) / 100,
                maxZ: (zBounds.maxZ * state.zScale) / 100,
              }
            : undefined,
        );
        if (!nextView) {
          return;
        }
        applyExternalPerspectivePose(nextView.pose, { syncControls: true });
        return;
      }

      return;
    },
    resetView: () => {
      setState({ viewAngle: { ...DEFAULT_VIEW_ANGLE } }, { viewportDirty: {} });

      if (shouldUseExternal2DViewport()) {
        const { state } = getViewport2DControlsConfig();
        setViewport2DControlsState({
          gridSpacing: state.gridSpacing,
          scaleFactor: 1,
          offsetX: 0,
          offsetY: 0,
        });
        return;
      }

      if (!getState().isTransitioning3D) {
        const nextView = buildResetViewport3DView(
          managerSnapshot,
          currentSidebarWidth,
          getViewportRect(),
        );
        applyExternalPerspectivePose(nextView.pose, { syncControls: true });
        return;
      }

      return;
    },
    setControlsBlocked: (blocked) => {
      externalControlsBlocked = blocked;
      setViewport2DControlsConfig({ blocked }, { emit: false });
      if (external3DControlsActive) {
        publish3DControlsConfig();
      }
    },
    set2DPanEnabled: (enabled) => {
      setViewport2DControlsConfig({ panEnabled: enabled }, { emit: false });
    },
    toLogicalCoords: (x, y) => {
      if (shouldUseExternal2DViewport()) {
        return toLogicalCoords2D(
          getExternal2DSnapshot(),
          getViewportRect(),
          x,
          y,
          { snapToGrid: getState().snapToGrid },
        );
      }

      const state = getState();
      const { editorInteraction } = state;
      const viewAnchor3D =
        editorInteraction.kind === "dragging" &&
        (editorInteraction.target.kind === "point" ||
          editorInteraction.target.kind === "objective")
          ? editorInteraction.target.viewAnchor3D
          : undefined;
      return toLogicalCoords3D(managerSnapshot, getViewportRect(), x, y, {
        objectiveVector: state.objectiveVector,
        zScale: state.zScale,
        snapToGrid: state.snapToGrid,
        editorInteractionKind: state.editorInteraction.kind,
        is3DMode: state.is3DMode,
        isTransitioning3D: state.isTransitioning3D,
        viewAnchor3D,
      });
    },
    toCanvasCoords: (x, y, z) => {
      if (shouldUseExternal2DViewport()) {
        return toCanvasCoords2D(getExternal2DSnapshot(), getViewportRect(), {
          x,
          y,
        });
      }

      return toCanvasCoords3D(
        managerSnapshot,
        getViewportRect(),
        { x, y },
        z,
        getState().zScale,
        getDisplayedIterateZ,
      );
    },
    getObjectiveScreenPosition: (point) => {
      if (shouldUseExternal2DViewport()) {
        return toCanvasCoords2D(
          getExternal2DSnapshot(),
          getViewportRect(),
          point,
        );
      }

      return getObjectiveScreenPosition3D(
        managerSnapshot,
        getViewportRect(),
        point,
      );
    },
    getUnboundedClipBounds: () => getViewportUnboundedClipBounds(),
    start3DTransition: (targetMode) => {
      if (getState().isTransitioning3D) {
        return;
      }

      // If the user was actively panning, the navigation-end timeout will fire
      // during the transition when isExternalViewportNavigationOwned() is false
      // (because isTransitioning3D=true) and silently bail out, leaving
      // isNavigatingViewport stuck true. Clear it now before the transition
      // disables the controls that set it.
      clearViewportNavigationTimeout();
      setViewportNavigationActive(false);

      const transitionBaseSnapshot = shouldUseExternal2DViewport()
        ? getExternal2DSnapshot()
        : managerSnapshot;
      const transitionViewAngle = external3DControlsActive
        ? getViewAngleFromSnapshot3D(transitionBaseSnapshot)
        : getState().viewAngle;
      const transitionStartTime = performance.now();

      if (shouldUseExternal2DViewport()) {
        syncManagerPlanarState();
        syncExternal2DControls(false);
      }
      if (external3DControlsActive) {
        setState({ viewAngle: transitionViewAngle }, { viewportDirty: {} });
        syncExternal3DControls(false);
      }

      const transitionPlan = buildViewportTransitionPlan({
        snapshot: transitionBaseSnapshot,
        targetMode,
        viewAngle: transitionViewAngle,
      });

      externalTransitionSnapshotActive = true;

      activeTransitionPlan = transitionPlan;
      externalTransitionProgress = 0;
      setState(
        buildTransitionStartState(
          targetMode,
          transitionStartTime,
          transitionPlan,
        ),
        { viewportDirty: TRANSITION_VIEWPORT_DIRTY_FLAGS },
      );
      const initialFrame = buildViewportTransitionFrame(
        transitionPlan,
        0,
        getViewportRect(),
      );
      syncTransitionPlanarState(transitionPlan, initialFrame);
      managerSnapshot = initialFrame.snapshot;
      publishSnapshot(initialFrame.snapshot);

      externalTransitionRunId += 1;
      setViewportTransitionConfig({
        active: true,
        runId: externalTransitionRunId,
        targetMode,
        startTime: transitionStartTime,
        duration: transitionPlan.duration,
        onFrame: (_progress, easedProgress) => {
          if (!activeTransitionPlan) {
            return;
          }
          externalTransitionProgress = easedProgress;
          const frame = buildViewportTransitionFrame(
            activeTransitionPlan,
            easedProgress,
            getViewportRect(),
          );
          syncTransitionPlanarState(activeTransitionPlan, frame);
          managerSnapshot = frame.snapshot;
          publishSnapshot(frame.snapshot);
        },
        onComplete: () => {
          const completedPlan = activeTransitionPlan;
          if (completedPlan) {
            externalTransitionProgress = 1;
            const frame = buildViewportTransitionFrame(
              completedPlan,
              1,
              getViewportRect(),
            );
            syncTransitionPlanarState(completedPlan, frame);
            managerSnapshot = frame.snapshot;
          }
          // Synchronous mode switch: clear transition state before setState so
          // the store subscription sees externalTransitionSnapshotActive=false
          // and correctly activates 2D/3D controls without an extra RAF delay.
          externalTransitionSnapshotActive = false;
          activeTransitionPlan = null;
          if (completedPlan) {
            setState(buildTransitionCompleteState(completedPlan), {
              viewportDirty: TRANSITION_VIEWPORT_DIRTY_FLAGS,
            });
          }
          resetViewportTransitionConfig();
          publishSnapshot(
            shouldUseExternal2DViewport()
              ? getExternal2DSnapshot()
              : managerSnapshot,
          );
        },
      });
    },
    getCanvasElement: () => viewportBridge.getCanvasElement(),
    getCanvasRect: () => getViewportRect() as DOMRect,
    getObjectiveDirtyFlags: () =>
      getObjectiveViewportDirtyFlags(isViewport3DState(getState())),
    getPolytopeDirtyFlags: () => getPolytopeViewportDirtyFlags(),
    getTraceDirtyFlags: () => getTraceViewportDirtyFlags(),
    getIterateDirtyFlags: () => getIterateViewportDirtyFlags(),
    getConstraintDirtyFlags: () => getConstraintViewportDirtyFlags(),
    getDraftPreviewDirtyFlags: () => getDraftPreviewViewportDirtyFlags(),
    getZScaleDirtyFlags: () => getZScaleViewportDirtyFlags(),
    destroy: () => {
      clearViewportNavigationTimeout();
      setViewportNavigationActive(false);
      externalTransitionSnapshotActive = false;
      activeTransitionPlan = null;
      resetViewport2DControlsConfig();
      resetViewport3DControlsConfig();
      resetViewportTransitionConfig();
      externalOwnershipController.abort();
      viewportDirtyController.abort();
      resetViewportRenderSnapshot();
    },
  };
}
