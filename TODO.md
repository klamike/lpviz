- [ ] const bounds = VRep.fromPoints(points).boundingBox();
      if (!bounds) {
      return null;
      }
      replace this with a VRep.isValid(), delete boundingBox and BoundingBox

- [ ] get rid of tour, replace with a problem gallery at top of viewport

- [ ] sometimes (maybe already fixed) when switching solvers, only first 4 rows of virtualized results appear, until scroll when it fixes itself.

- [ ] z scale should adapt to the range of values being displayed. then we can get rid of the 500\*eps etc...

- [ ] decide to either expose or remove dual simplex

- [ ] add show phase 1 button, visualize with diff color than phase 2

- [ ] don't disable the animate and rotate buttons while the animation is playing, re-clicking animate should restart it.

- [ ] // Called once per frame by SharedMaterialsController when canvas size changes.
      let \_lastW = 0;
      let \_lastH = 0;

export function tickSharedLineMaterialResolutions(w: number, h: number): void {
if (w === \_lastW && h === \_lastH) return;
\_lastW = w;
\_lastH = h;
materialCache.forEach((mat) => mat.resolution.set(w, h));
}
re-evaluate if this is necessary

- [ ] make a textures folder in canvas3d for the creator/builder code

- [ ] benchmarks for solvers and rendering (as part of this -- [ ] decide if its worth going back to multi-scene)

- [ ] move getVisibleBounds, clipLineToBounds to viewport package

728cf13f
dedupe/move getDisplayedIterateZ; this is app logic not three logic. also get rid of ITERATE_Z; just use drawing order to make sure it's on top.

- [ ] is it possible to refactor makeLine2 to not create a new Line? (or rather, refactor update to now call makeLine2 each time). ideally we'd share stuff for performance.

- [ ] combine iteratepoints, iteraterestartpoints, iteratestar, if it's not too complicated

- [ ] make sure 3d to 2d always takes shortest path (relevant when upside down)

- [ ] modularize solver API; make it very easy to add a new solver (ideally, no changes required besides in solver-engine, which should export some list of solvers and their options.)

- [ ] remove dependency on jsoncrush

- [ ] simplify the code in viewport package

- [ ] make dismissHelpOverlay not slow

- [ ] debug memory leak, especially when not tracing

3c079b4fccf4fac1d3263c164b29784b469dce47
make exclude obj = true the only option, delete all dead code this creates.

- [ ] replace maxit text fields with log-space sliders (style the slider range to somehow communicate that it is log-spaced)

- [ ] fix zoom button in 3d (currently can cut off the polytope)

- [ ] fix home button in 3d (seems it's using the center of the window instead of the center of the viewport)

- [ ] allow central path when unbounded

- [ ] make sure camera is always above z= 0 + eps

- [ ] track down + fix bug: lines can get cut off when zoom is high and camera is close

- [ ] put objective arrow, polytope above (using render order, not offset) the grid
