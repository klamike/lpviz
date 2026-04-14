import type { PointXY } from "../../math/blas";
import {
  DEFAULT_VIEW_ANGLE,
  getState,
  setState,
  subscribe,
  type ViewportDirtyFlags,
} from "../../store/lpvizStore";
import { ViewportManager } from "../../ViewportManager";
import {
  getViewport2DControlsConfig,
  getViewport2DControlsSnapshot,
  resetViewport2DControlsConfig,
  setViewport2DControlsConfig,
  setViewport2DControlsState,
  syncViewport2DControlsStateFromSnapshot,
} from "./r3f/viewport2DControlsStore";
import {
  resetViewportRenderSnapshot,
  setViewportRenderSnapshot,
} from "./r3f/viewportRenderStore";
import {
  resetViewport3DControlsConfig,
  setViewport3DControlsConfig,
} from "./r3f/viewport3DControlsStore";
import {
  resetViewportTransitionConfig,
  setViewportTransitionConfig,
} from "./r3f/viewportTransitionStore";
import {
  fitViewport2DToBounds,
  isDefault2DView,
  toCanvasCoords2D,
  toLogicalCoords2D,
} from "./r3f/viewport2dProjection";
import {
  getObjectiveScreenPosition3D,
  toCanvasCoords3D,
  toLogicalCoords3D,
} from "./r3f/viewport3dProjection";
import {
  buildResetViewport3DView,
  buildViewport3DSnapshot,
  fitViewport3DToBounds,
  getMaxPerspectiveDistance3D,
  isDefault3DView,
} from "./r3f/viewport3dView";
import {
  buildTransitionCompleteState,
  buildTransitionProgressState,
  buildTransitionStartState,
  buildViewport2DStateFromTransitionFrame,
  buildViewportTransitionFrame,
  buildViewportTransitionPlan,
  TRANSITION_VIEWPORT_DIRTY_FLAGS,
  type ViewportTransitionPlan,
} from "./r3f/viewport3dTransition";
import type { R3FViewportBridge } from "./r3f/ViewportBridge";
import type { ViewportRenderSnapshot } from "./viewportRenderTypes";

const VIEWPORT_NAVIGATION_IDLE_MS = 100;

export type ViewportBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type ViewportZBounds = {
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
    bounds: ViewportBounds,
    padding?: number,
    zBounds?: ViewportZBounds,
  ) => void;
  resetView: () => void;
  setControlsBlocked: (blocked: boolean) => void;
  set2DPanEnabled: (enabled: boolean) => void;
  toLogicalCoords: (x: number, y: number) => PointXY;
  toCanvasCoords: (x: number, y: number, z?: number) => PointXY;
  getObjectiveScreenPosition: (point: PointXY) => PointXY;
  getUnboundedClipBounds: () => ViewportBounds;
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
  canvas,
  viewportBridge,
}: {
  canvas: HTMLCanvasElement;
  viewportBridge: R3FViewportBridge;
}): Promise<ViewportRuntime> {
  const manager = await ViewportManager.create(
    canvas,
    viewportBridge.getCanvasElement(),
  );

  let currentSidebarWidth = 0;
  let navigationFrameCallback: (() => void) | null = null;
  let navigationIdleTimeoutId: number | null = null;
  let managerSnapshot = manager.getRenderSnapshot();
  let externalControlsBlocked = false;
  let external2DViewportActive = false;
  let external3DControlsActive = false;
  let external3DControlsSyncToken = 0;
  let externalTransitionRunId = 0;
  let externalTransitionSnapshotActive = false;
  let externalTransitionProgress = 0;
  let activeTransitionPlan: ViewportTransitionPlan | null = null;
  let shouldAdoptManager2DStateFromNextSnapshot = false;

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
    setViewportRenderSnapshot(snapshot);
    viewportBridge.invalidate();
  };

  const getViewportRect = () => viewportBridge.getCanvasRect();

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

  const captureManagerSnapshot = (
    snapshot: ViewportRenderSnapshot = manager.getRenderSnapshot(),
  ) => {
    managerSnapshot =
      external3DControlsActive && !externalTransitionSnapshotActive
        ? buildViewport3DSnapshot(
            snapshot,
            buildPoseFromSnapshot(snapshot),
            getViewportRect(),
          )
        : snapshot;
    return managerSnapshot;
  };

  const getExternal2DSnapshot = () =>
    getViewport2DControlsSnapshot(getViewportRect());

  const syncManagerPlanarState = () => {
    const { state } = getViewport2DControlsConfig();
    manager.setSidebarWidth(currentSidebarWidth);
    manager.syncPlanarViewState(
      state.scaleFactor,
      state.offsetX,
      state.offsetY,
    );
    captureManagerSnapshot();
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
    manager.syncPlanarViewState(
      planarState.scaleFactor,
      planarState.offsetX,
      planarState.offsetY,
      { syncTarget: false },
    );
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
    manager.syncExternalPerspectivePose(pose);
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

  const syncExternal2DLayers = (
    enabled: boolean,
    options: {
      enablePolytopeBaseInStable3D?: boolean;
      enablePolytopeVerticesInStable3D?: boolean;
      enableConstraintHighlightInStable3D?: boolean;
      enableObjectiveInStable3D?: boolean;
      enableTraceInStable3D?: boolean;
      enableIterateLineInStable3D?: boolean;
      enableIteratePointsInStable3D?: boolean;
      enableIterateRestartPointsInStable3D?: boolean;
      enableIterateHighlightInStable3D?: boolean;
      enableIterateStarInStable3D?: boolean;
      hideLegacyCanvasInStable3D?: boolean;
    } = {},
  ) => {
    manager.setExternal2DControlsEnabled(enabled);
    manager.setExternalPolytopeBaseEnabled(
      enabled || options.enablePolytopeBaseInStable3D === true,
    );
    manager.setExternalPolytopeVerticesEnabled(
      enabled || options.enablePolytopeVerticesInStable3D === true,
    );
    manager.setExternalObjectiveEnabled(
      enabled || options.enableObjectiveInStable3D === true,
    );
    manager.setExternalTraceLineEnabled(
      enabled || options.enableTraceInStable3D === true,
    );
    manager.setExternalTracePointsEnabled(
      enabled || options.enableTraceInStable3D === true,
    );
    manager.setExternalConstraintHighlightEnabled(
      enabled || options.enableConstraintHighlightInStable3D === true,
    );
    manager.setExternalIterateLineEnabled(
      enabled || options.enableIterateLineInStable3D === true,
    );
    manager.setExternalIteratePointsEnabled(
      enabled || options.enableIteratePointsInStable3D === true,
    );
    manager.setExternalIterateRestartPointsEnabled(
      enabled || options.enableIterateRestartPointsInStable3D === true,
    );
    manager.setExternalIterateHighlightEnabled(
      enabled || options.enableIterateHighlightInStable3D === true,
    );
    manager.setExternalIterateStarEnabled(
      enabled || options.enableIterateStarInStable3D === true,
    );
    canvas.classList.toggle(
      "canvas-stage__canvas--legacy-hidden",
      enabled || options.hideLegacyCanvasInStable3D === true,
    );
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
    manager.setExternal3DControlsEnabled(enabled);
    if (enabled) {
      manager.syncExternalPerspectivePose({
        position: { ...managerSnapshot.perspective.position },
        up: { ...managerSnapshot.perspective.up },
        target: { ...managerSnapshot.target },
      });
      rebuildExternal3DSnapshot();
    }
    publish3DControlsConfig({
      syncFromSnapshot: enabled && options.syncFromSnapshot,
    });
  };

  const syncExternalStable3DRendering = (enabled: boolean) => {
    manager.setExternalStable3DRenderingEnabled(enabled);
  };

  setViewport2DControlsConfig(
    {
      enabled: false,
      blocked: externalControlsBlocked,
      panEnabled: true,
      sidebarWidth: currentSidebarWidth,
      fallbackSnapshot: managerSnapshot,
      onStateChange: () => {
        syncManagerPlanarState();
        publishSnapshot(getExternal2DSnapshot());
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

  manager.setRenderSnapshotCallback((snapshot) => {
    captureManagerSnapshot(snapshot);
    if (shouldUseExternal2DViewport()) {
      if (shouldAdoptManager2DStateFromNextSnapshot && snapshot.mode === "2d") {
        syncViewport2DControlsStateFromSnapshot(snapshot, currentSidebarWidth, {
          emit: false,
        });
        shouldAdoptManager2DStateFromNextSnapshot = false;
      } else {
        setViewport2DControlsConfig(
          {
            sidebarWidth: currentSidebarWidth,
            fallbackSnapshot: snapshot,
          },
          { emit: false },
        );
      }
      publishSnapshot(getExternal2DSnapshot());
      return;
    }
    if (externalTransitionSnapshotActive) {
      return;
    }
    publishSnapshot(managerSnapshot);
  });
  manager.setExternalGridEnabled(true);

  external2DViewportActive = shouldUseExternal2DViewport();
  syncExternalStable3DRendering(shouldUseExternal3DControls());
  syncExternal2DLayers(external2DViewportActive, {
    enablePolytopeBaseInStable3D: shouldUseExternal3DControls(),
    enablePolytopeVerticesInStable3D: shouldUseExternal3DControls(),
    enableConstraintHighlightInStable3D: shouldUseExternal3DControls(),
    enableObjectiveInStable3D: shouldUseExternal3DControls(),
    enableTraceInStable3D: shouldUseExternal3DControls(),
    enableIterateLineInStable3D: shouldUseExternal3DControls(),
    enableIteratePointsInStable3D: shouldUseExternal3DControls(),
    enableIterateRestartPointsInStable3D: shouldUseExternal3DControls(),
    enableIterateHighlightInStable3D: shouldUseExternal3DControls(),
    enableIterateStarInStable3D: shouldUseExternal3DControls(),
    hideLegacyCanvasInStable3D: shouldUseExternal3DControls(),
  });
  syncExternal2DControls(external2DViewportActive, {
    syncStateFromSnapshot: external2DViewportActive,
  });
  syncExternal3DControls(shouldUseExternal3DControls(), {
    syncFromSnapshot: shouldUseExternal3DControls(),
  });
  publishSnapshot(
    external2DViewportActive ? getExternal2DSnapshot() : managerSnapshot,
  );

  const unsubscribeExternalOwnership = subscribe(() => {
    const nextExternal2DViewportActive = shouldUseExternal2DViewport();
    const nextExternal3DControlsActive = shouldUseExternal3DControls();
    const external2DChanged =
      nextExternal2DViewportActive !== external2DViewportActive;
    const external3DChanged =
      nextExternal3DControlsActive !== external3DControlsActive;

    if (!external2DChanged && !external3DChanged) {
      return;
    }

    syncExternalStable3DRendering(nextExternal3DControlsActive);
    syncExternal2DLayers(nextExternal2DViewportActive, {
      enablePolytopeBaseInStable3D: nextExternal3DControlsActive,
      enablePolytopeVerticesInStable3D: nextExternal3DControlsActive,
      enableConstraintHighlightInStable3D: nextExternal3DControlsActive,
      enableObjectiveInStable3D: nextExternal3DControlsActive,
      enableTraceInStable3D: nextExternal3DControlsActive,
      enableIterateLineInStable3D: nextExternal3DControlsActive,
      enableIteratePointsInStable3D: nextExternal3DControlsActive,
      enableIterateRestartPointsInStable3D: nextExternal3DControlsActive,
      enableIterateHighlightInStable3D: nextExternal3DControlsActive,
      enableIterateStarInStable3D: nextExternal3DControlsActive,
      hideLegacyCanvasInStable3D: nextExternal3DControlsActive,
    });
    syncExternal2DControls(nextExternal2DViewportActive);

    if (external3DChanged) {
      captureManagerSnapshot();
      syncExternal3DControls(nextExternal3DControlsActive, {
        syncFromSnapshot: nextExternal3DControlsActive,
      });
    }

    external2DViewportActive = nextExternal2DViewportActive;

    if (externalTransitionSnapshotActive) {
      shouldAdoptManager2DStateFromNextSnapshot = false;
      return;
    }

    if (external2DViewportActive) {
      captureManagerSnapshot();
      syncExternal2DControls(true, { syncStateFromSnapshot: true });
      shouldAdoptManager2DStateFromNextSnapshot = true;
      publishSnapshot(getExternal2DSnapshot());
      return;
    }

    shouldAdoptManager2DStateFromNextSnapshot = false;
    captureManagerSnapshot();
    publishSnapshot(managerSnapshot);
  });

  // Temporary compatibility bridge while ViewportManager still backs transitions/fallback 3D.
  return {
    draw: () => {
      if (!shouldUseExternal2DViewport() && !external3DControlsActive) {
        manager.draw();
      }
      viewportBridge.invalidate();
    },
    updateDimensions: () => {
      manager.updateDimensions();
      if (shouldUseExternal2DViewport()) {
        captureManagerSnapshot();
        setViewport2DControlsConfig(
          {
            sidebarWidth: currentSidebarWidth,
            fallbackSnapshot: managerSnapshot,
          },
          { emit: false },
        );
        publishSnapshot(getExternal2DSnapshot());
        return;
      }
      if (externalTransitionSnapshotActive && activeTransitionPlan) {
        const frame = buildViewportTransitionFrame(
          activeTransitionPlan,
          externalTransitionProgress,
          getViewportRect(),
        );
        const planarState = syncTransitionPlanarState(
          activeTransitionPlan,
          frame,
        );
        manager.syncExternal3DTransitionProgress(
          activeTransitionPlan.direction === "to3d",
          externalTransitionProgress,
          frame.pose,
          planarState,
          { applyState: false },
        );
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
      captureManagerSnapshot();
      viewportBridge.invalidate();
    },
    setSidebarWidth: (width) => {
      currentSidebarWidth = width;
      manager.setSidebarWidth(width);
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
        const planarState = syncTransitionPlanarState(
          activeTransitionPlan,
          frame,
        );
        manager.syncExternal3DTransitionProgress(
          activeTransitionPlan.direction === "to3d",
          externalTransitionProgress,
          frame.pose,
          planarState,
          { applyState: false },
        );
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
      captureManagerSnapshot();
      viewportBridge.invalidate();
    },
    setNavigationFrameCallback: (callback) => {
      navigationFrameCallback = callback;
      manager.setNavigationFrameCallback(callback);
    },
    isDefaultView: () => {
      if (shouldUseExternal2DViewport()) {
        return isDefault2DView(
          getExternal2DSnapshot(),
          getViewport2DControlsConfig().sidebarWidth,
        );
      }

      if (external3DControlsActive) {
        return isDefault3DView(managerSnapshot);
      }

      return manager.isDefaultView();
    },
    setViewState: (scale, offsetX, offsetY) => {
      if (!shouldUseExternal2DViewport()) {
        manager.setViewState(scale, offsetX, offsetY);
        return;
      }

      const { state } = getViewport2DControlsConfig();
      setViewport2DControlsState({
        gridSpacing: state.gridSpacing,
        scaleFactor: scale,
        offsetX,
        offsetY,
      });
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

      if (external3DControlsActive) {
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

      manager.zoomToFit(bounds, padding, zBounds);
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

      if (external3DControlsActive) {
        const nextView = buildResetViewport3DView(
          managerSnapshot,
          getViewportRect(),
        );
        applyExternalPerspectivePose(nextView.pose, { syncControls: true });
        return;
      }

      manager.resetView();
    },
    setControlsBlocked: (blocked) => {
      externalControlsBlocked = blocked;
      manager.setControlsBlocked(blocked);
      setViewport2DControlsConfig({ blocked }, { emit: false });
      if (external3DControlsActive) {
        publish3DControlsConfig();
      }
    },
    set2DPanEnabled: (enabled) => {
      setViewport2DControlsConfig({ panEnabled: enabled }, { emit: false });
      manager.set2DPanEnabled(enabled);
    },
    toLogicalCoords: (x, y) => {
      if (shouldUseExternal2DViewport()) {
        return toLogicalCoords2D(
          getExternal2DSnapshot(),
          getViewportRect(),
          x,
          y,
        );
      }

      const state = getState();
      if (state.is3DMode || state.isTransitioning3D) {
        return toLogicalCoords3D(managerSnapshot, getViewportRect(), x, y, {
          objectiveVector: state.objectiveVector,
          zScale: state.zScale,
          zAxisOffsetOnly: state.zAxisOffsetOnly,
          snapToGrid: state.snapToGrid,
          editorInteractionKind: state.editorInteraction.kind,
          is3DMode: state.is3DMode,
          isTransitioning3D: state.isTransitioning3D,
        });
      }

      return manager.toLogicalCoords(x, y);
    },
    toCanvasCoords: (x, y, z) => {
      if (shouldUseExternal2DViewport()) {
        return toCanvasCoords2D(getExternal2DSnapshot(), getViewportRect(), {
          x,
          y,
        });
      }

      const state = getState();
      if (state.is3DMode || state.isTransitioning3D) {
        return toCanvasCoords3D(
          managerSnapshot,
          getViewportRect(),
          { x, y },
          z,
          state.zScale,
        );
      }

      return manager.toCanvasCoords(x, y, z);
    },
    getObjectiveScreenPosition: (point) => {
      if (shouldUseExternal2DViewport()) {
        return toCanvasCoords2D(
          getExternal2DSnapshot(),
          getViewportRect(),
          point,
        );
      }

      const state = getState();
      if (state.is3DMode || state.isTransitioning3D) {
        return getObjectiveScreenPosition3D(
          managerSnapshot,
          getViewportRect(),
          point,
        );
      }

      return manager.getObjectiveScreenPosition(point);
    },
    getUnboundedClipBounds: () => manager.getUnboundedClipBounds(),
    start3DTransition: (targetMode) => {
      const wasExternal2DViewportActive = external2DViewportActive;
      const wasExternal3DControlsActive = external3DControlsActive;

      if (shouldUseExternal2DViewport()) {
        syncManagerPlanarState();
        syncExternal2DControls(false);
      }
      if (external3DControlsActive) {
        manager.capturePerspectiveViewAngle();
        syncExternal3DControls(false);
      }
      syncExternal2DLayers(false);
      syncExternalStable3DRendering(false);

      const transitionPlan = buildViewportTransitionPlan({
        snapshot: shouldUseExternal2DViewport()
          ? getExternal2DSnapshot()
          : managerSnapshot,
        targetMode,
        viewAngle: getState().viewAngle,
      });

      externalTransitionSnapshotActive = true;
      manager.setExternalTransitionCameraEnabled(true);
      const transition = manager.beginExternal3DTransition(
        targetMode,
        {
          duration: transitionPlan.duration,
          startAngles: transitionPlan.startAngles,
          endAngles: transitionPlan.endAngles,
          startTarget: transitionPlan.startTarget,
          endTarget: transitionPlan.endTarget,
          perspectiveDistance: transitionPlan.perspectiveDistance,
        },
        { applyState: false },
      );
      if (!transition) {
        externalTransitionSnapshotActive = false;
        activeTransitionPlan = null;
        manager.setExternalTransitionCameraEnabled(false);
        syncExternalStable3DRendering(wasExternal3DControlsActive);
        syncExternal2DLayers(wasExternal2DViewportActive, {
          enablePolytopeBaseInStable3D: wasExternal3DControlsActive,
          enablePolytopeVerticesInStable3D: wasExternal3DControlsActive,
          enableConstraintHighlightInStable3D: wasExternal3DControlsActive,
          enableObjectiveInStable3D: wasExternal3DControlsActive,
          enableTraceInStable3D: wasExternal3DControlsActive,
          enableIterateLineInStable3D: wasExternal3DControlsActive,
          enableIteratePointsInStable3D: wasExternal3DControlsActive,
          enableIterateRestartPointsInStable3D: wasExternal3DControlsActive,
          enableIterateHighlightInStable3D: wasExternal3DControlsActive,
          enableIterateStarInStable3D: wasExternal3DControlsActive,
          hideLegacyCanvasInStable3D: wasExternal3DControlsActive,
        });
        syncExternal2DControls(wasExternal2DViewportActive, {
          syncStateFromSnapshot: wasExternal2DViewportActive,
        });
        syncExternal3DControls(wasExternal3DControlsActive, {
          syncFromSnapshot: wasExternal3DControlsActive,
        });
        publishSnapshot(
          wasExternal2DViewportActive
            ? getExternal2DSnapshot()
            : managerSnapshot,
        );
        return;
      }

      activeTransitionPlan = transitionPlan;
      externalTransitionProgress = 0;
      setState(
        buildTransitionStartState(
          targetMode,
          transition.startTime,
          transitionPlan,
        ),
        { viewportDirty: TRANSITION_VIEWPORT_DIRTY_FLAGS },
      );
      const initialFrame = buildViewportTransitionFrame(
        transitionPlan,
        0,
        getViewportRect(),
      );
      const initialPlanarState = syncTransitionPlanarState(
        transitionPlan,
        initialFrame,
      );
      manager.syncExternal3DTransitionProgress(
        targetMode,
        0,
        initialFrame.pose,
        initialPlanarState,
        { applyState: false },
      );
      managerSnapshot = initialFrame.snapshot;
      publishSnapshot(initialFrame.snapshot);

      externalTransitionRunId += 1;
      setViewportTransitionConfig({
        active: true,
        runId: externalTransitionRunId,
        targetMode,
        startTime: transition.startTime,
        duration: transitionPlan.duration,
        onFrame: (_progress, easedProgress) => {
          if (!activeTransitionPlan) {
            return;
          }
          externalTransitionProgress = easedProgress;
          setState(
            buildTransitionProgressState(activeTransitionPlan, easedProgress),
            {
              viewportDirty: TRANSITION_VIEWPORT_DIRTY_FLAGS,
            },
          );
          const frame = buildViewportTransitionFrame(
            activeTransitionPlan,
            easedProgress,
            getViewportRect(),
          );
          const planarState = syncTransitionPlanarState(
            activeTransitionPlan,
            frame,
          );
          manager.syncExternal3DTransitionProgress(
            targetMode,
            easedProgress,
            frame.pose,
            planarState,
            { applyState: false },
          );
          managerSnapshot = frame.snapshot;
          publishSnapshot(frame.snapshot);
        },
        onComplete: () => {
          const completedPlan = activeTransitionPlan;
          if (completedPlan) {
            externalTransitionProgress = 1;
            setState(buildTransitionProgressState(completedPlan, 1), {
              viewportDirty: TRANSITION_VIEWPORT_DIRTY_FLAGS,
            });
            const frame = buildViewportTransitionFrame(
              completedPlan,
              1,
              getViewportRect(),
            );
            const planarState = syncTransitionPlanarState(completedPlan, frame);
            managerSnapshot = frame.snapshot;
            publishSnapshot(frame.snapshot);
            manager.finishExternal3DTransition(
              targetMode,
              frame.pose,
              planarState,
              { autoComplete: false, applyState: false },
            );
          } else {
            manager.finishExternal3DTransition(
              targetMode,
              undefined,
              undefined,
              { autoComplete: false, applyState: false },
            );
          }
          requestAnimationFrame(() => {
            if (completedPlan) {
              setState(buildTransitionCompleteState(completedPlan), {
                viewportDirty: TRANSITION_VIEWPORT_DIRTY_FLAGS,
              });
            }
            externalTransitionSnapshotActive = false;
            activeTransitionPlan = null;
            manager.completeExternal3DTransition(targetMode, {
              applyState: false,
            });
            resetViewportTransitionConfig();
          });
        },
      });
    },
    getCanvasElement: () => viewportBridge.getCanvasElement(),
    getCanvasRect: () => viewportBridge.getCanvasRect(),
    getObjectiveDirtyFlags: () => manager.getObjectiveDirtyFlags(),
    getPolytopeDirtyFlags: () => manager.getPolytopeDirtyFlags(),
    getTraceDirtyFlags: () => manager.getTraceDirtyFlags(),
    getIterateDirtyFlags: () => manager.getIterateDirtyFlags(),
    getConstraintDirtyFlags: () => manager.getConstraintDirtyFlags(),
    getDraftPreviewDirtyFlags: () => manager.getDraftPreviewDirtyFlags(),
    getZScaleDirtyFlags: () => manager.getZScaleDirtyFlags(),
    destroy: () => {
      clearViewportNavigationTimeout();
      setViewportNavigationActive(false);
      externalTransitionSnapshotActive = false;
      activeTransitionPlan = null;
      resetViewport2DControlsConfig();
      resetViewport3DControlsConfig();
      resetViewportTransitionConfig();
      unsubscribeExternalOwnership();
      manager.setExternal2DControlsEnabled(false);
      manager.setExternal3DControlsEnabled(false);
      manager.setExternalStable3DRenderingEnabled(false);
      manager.setExternalTransitionCameraEnabled(false);
      canvas.classList.remove("canvas-stage__canvas--legacy-hidden");
      manager.setRenderSnapshotCallback(null);
      resetViewportRenderSnapshot();
      manager.destroy();
    },
  };
}
