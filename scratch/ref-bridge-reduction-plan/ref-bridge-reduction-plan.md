# Ref Bridge Reduction Plan

## Goal

Reduce the current React ↔ imperative bridge from an app-wide ref bag to a small canvas-host boundary.

The important distinction is:

- **local React refs are fine** when a component owns its own DOM measurement or a canvas host
- **the thing we want to remove** is the shared cross-layer ref registry used to feed imperative UI/runtime code from many parts of the tree

In practical terms, the target is:

- React owns sidebar, result UI, layout, and measurement logic
- imperative code owns canvas rendering, solver orchestration, and other true runtime concerns
- the remaining long-lived DOM bridge is ideally just the canvas element

## Non-Goals

This plan does **not** require us to:

- rewrite `ViewportManager`
- rewrite solver implementations or worker plumbing
- remove every `useRef` from the codebase
- redesign the UI
- replace the existing app store in one pass

## Current Shape

Today the bridge is centered around:

- `lpviz/src/app/legacyRuntimeElements.tsx`
- `lpviz/src/components/layout/useLegacyCanvasRuntime.ts`
- `lpviz/src/ui/interaction/initialize.ts`

React currently renders most of the shell and most controls, but `initializeUI()` still receives a bag of DOM nodes:

- `canvas`
- `sidebar`
- `sidebarHandle`
- `topResult`
- `result`
- `resultVirtualHost`

Those refs exist because imperative code still owns a few UI-adjacent behaviors:

- sidebar width reads/writes
- sidebar min-width measurement
- result font sizing
- virtualized result scroll host wiring
- null-state logo DOM injection

At the same time, a lot of UI ownership has already moved into React:

- solver buttons
- solver settings
- top result text
- result blocks and usage view
- 3D toggle label/state
- animation controls
- small-screen overlay

That means the bridge is already smaller than the original app, but it is still wider than it needs to be.

## Current Ref Inventory

| Bridge ref            | Current owner                                     | Current imperative use                                 | Why it exists today               | Target state                          | Proposed phase |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------ | --------------------------------- | ------------------------------------- | -------------- |
| `canvas`              | `CanvasStage` via `LegacyRuntimeElementsProvider` | `ViewportManager.create(canvas)`, canvas events, focus | true imperative rendering surface | keep as a **local canvas host ref**   | Phase 6        |
| `sidebar`             | `Sidebar` via provider                            | write `style.width`, read `offsetWidth`                | imperative layout ownership       | move width to React state/context     | Phase 3        |
| `sidebarHandle`       | `CanvasStage` via provider                        | write `style.left`                                     | imperative layout ownership       | derive `left` from React layout state | Phase 3        |
| `topResult`           | `TopResultPanel` via provider                     | measure available height for min sidebar width         | imperative layout measurement     | local React measurement hook only     | Phase 3        |
| `result`              | `UsagePanel` via provider                         | query children, set inline font sizes, set dataset     | imperative responsive typography  | local React typography hook           | Phase 4        |
| `resultVirtualHost`   | `UsagePanel` via provider                         | scroll listener + `ResizeObserver` for visible rows    | imperative virtualization         | local React virtualizer ref           | Phase 5        |
| `nullStateMessageRef` | `TopResultPanel` local ref                        | `renderNullStateLogo(container)`                       | DOM injection helper              | render JSX/SVG directly               | Phase 2        |

## Secondary Imperative UI Seams

These are not refs, but they matter because they keep the bridge feeling larger than it should:

- `lpviz/src/app/lpvizRuntime.ts` global mutable command registry
- no-op UI callbacks still threaded through `canvas.ts` / `solverRuntime.ts`
- imperative overlay/tour DOM creation inside `initialize.ts`
- `document.getElementById()` still used by the tour button click path

These should be shrunk too, but **after** the DOM ref bridge gets smaller.

## What “Done” Looks Like

A good end state for this migration is:

1. `LegacyRuntimeElementsProvider` is gone.
2. `useLegacyCanvasRuntime()` is replaced by a canvas-focused hook.
3. `initializeUI()` is renamed and narrowed to canvas/runtime concerns.
4. Sidebar width and result virtualization are React-owned.
5. Result typography is React-owned.
6. The only unavoidable bridge ref is the canvas host ref.
7. React components call runtime actions through context/hooks, not a global mutable singleton.

## Migration Principles

### 1. Delete bridge surface area instead of wrapping it

Do not add a fancier abstraction around the current ref bag unless it directly helps delete that bag.

### 2. Prefer React-local refs over shared bridge refs

If a component needs a DOM node for its own measurement or scroll handling, that is normal React code.

The smell is the **app-wide registry** of refs passed into a monolithic initializer.

### 3. Keep domain state global, keep view mechanics local

Good candidates for local React state/hooks:

- sidebar width
- drag-in-progress for sidebar resizing
- measured font size for result text
- visible virtual rows / padding

Good candidates to remain in app state:

- solver mode
- solver settings
- polytope/objective/editor state
- rendered solver result payloads
- hover/highlight state that affects canvas drawing

### 4. Migrate one visual surface at a time

Recommended order:

1. dead callback cleanup
2. logo
3. sidebar layout
4. result typography
5. result virtualization
6. collapse bridge to canvas-only
7. runtime actions/context cleanup

### 5. Keep ids until the tour is ported

The demo/tour code still clicks buttons by DOM id.

That means ids can stay for now, even after refs are removed.

## Recommended Phases

## Phase 0: Baseline And Guardrails

Outcome:

- the current bridge is documented
- we have a stable manual smoke checklist for every slice

Tasks:

- [ ] record the current ref inventory and target deletion order
- [ ] keep this plan updated as slices land
- [ ] define a small manual regression checklist

Manual smoke checklist:

- load app with no console errors
- draw a polygon
- close/open a region
- set an objective
- run each solver button
- hover inequalities and iterate rows
- animate / rotate objective
- drag the sidebar handle
- toggle 3D and z-scale
- share a configuration
- run the `?demo` tour

Definition of done:

- every subsequent slice can be tested with the same short checklist

---

## Phase 1: Remove Dead Imperative UI Callback Contracts

Why first:

React already derives these UI states from store data, and several callback hooks passed into imperative modules are now no-ops.

Current examples:

- `hideNullStateMessage()`
- `syncButtonStates()`
- `updateObjectiveDisplay()`
- `updateMaximizeVisibility()`

Outcome:

- imperative modules stop pretending they directly update React-owned UI
- `initialize.ts` loses a chunk of compatibility ballast

Tasks:

- [x] remove the UI callback object from `registerCanvasInteractions()` where calls are now redundant
- [x] remove the `uiRuntime` callback dependency from `createSolverRuntime()` where it only fans out into no-ops
- [x] let store updates be the only trigger for React rendering in these paths
- [x] keep canvas redraw calls where they are still needed

Likely files:

- `lpviz/src/ui/interaction/canvas.ts`
- `lpviz/src/ui/interaction/solverRuntime.ts`
- `lpviz/src/ui/interaction/initialize.ts`

Definition of done:

- no dead UI callback plumbing remains between `initialize.ts`, `canvas.ts`, and `solverRuntime.ts`
- behavior is unchanged

---

## Phase 2: Port The Null-State Logo To React

Why next:

This is the cleanest low-risk deletion of imperative DOM work.

Outcome:

- `TopResultPanel` renders the null-state logo directly
- the local DOM injection effect disappears

Tasks:

- [x] replace `renderNullStateLogo(container)` with a React component, likely built from `NULL_STATE_LOGO_LINES`
- [x] render it directly inside `TopResultPanel`
- [x] delete `useNullStateLogo()`
- [x] remove the `nullStateMessageRef` bridge usage
- [x] keep the same CSS class and sizing behavior

Likely files:

- `lpviz/src/components/panels/TopResultPanel.tsx`
- `lpviz/src/components/panels/useNullStateLogo.ts`
- `lpviz/src/ui/logo.ts`
- maybe a new `lpviz/src/components/logo/NullStateLogo.tsx`

Definition of done:

- no effect-based DOM injection is needed for the null-state logo
- visual output matches current behavior

---

## Phase 3: Move Sidebar Layout And Resize Ownership To React

Why this matters:

Three of the shared bridge refs exist only because `initialize.ts` still owns sidebar layout.

Those refs are:

- `sidebar`
- `sidebarHandle`
- `topResult`

Outcome:

- sidebar width becomes React-owned view state
- resize gesture handling moves into a layout hook/provider
- imperative runtime only receives width updates, not raw DOM nodes

Recommended shape:

- `Sidebar` receives `width`
- `CanvasStage` receives `sidebarWidth` and positions `#sidebarHandle`
- a small `useSidebarLayout()` hook owns drag lifecycle
- `TopResultPanel` may keep a **local** measurement ref if needed for min-width calculation

Tasks:

- [x] introduce React-owned sidebar width state (prefer local layout context over global app store)
- [x] move handle drag lifecycle (`mousedown` / document `mousemove` / document `mouseup`) into React code
- [x] port `getMinSidebarWidth()` logic from `initialize.ts` into a React hook using local measurement only
- [x] apply width through JSX style props, not imperative `style.width` / `style.left` writes
- [x] introduce a small temporary runtime sync such as `setSidebarWidth(width)` so React can notify `ViewportManager`
- [x] delete `beginResize`, `updateResize`, `finishResize`, and `scheduleViewportSync` once React owns the interaction end-to-end
- [x] remove `sidebar`, `sidebarHandle`, and `topResult` from `LegacyRuntimeElements`

Likely files:

- `lpviz/src/components/layout/Sidebar.tsx`
- `lpviz/src/components/layout/CanvasStage.tsx`
- `lpviz/src/components/panels/TopResultPanel.tsx`
- `lpviz/src/components/layout/useLegacyCanvasRuntime.ts`
- `lpviz/src/ui/interaction/initialize.ts`
- `lpviz/src/app/legacyRuntimeElements.tsx`
- `lpviz/src/app/lpvizRuntime.ts`
- maybe a new `lpviz/src/components/layout/useSidebarLayout.ts`

Definition of done:

- dragging the sidebar handle still works
- min-width clamping still works
- canvas viewport updates still follow sidebar width
- the bridge no longer needs `sidebar`, `sidebarHandle`, or `topResult`

Notes:

- A local `topResultRef` inside React is acceptable here.
- The key win is removing those nodes from the shared imperative bridge.

---

## Phase 4: Move Result Typography / Font Fitting To React

Why this matters:

`result` is currently passed into imperative code largely so `initialize.ts` can inspect rendered text and set inline font sizes.

That is view logic and belongs in React.

Outcome:

- result font fitting is handled in `UsagePanel` (or a dedicated hook)
- `initialize.ts` no longer queries result DOM children to size text

Tasks:

- [x] create a `useResultTypography()` hook local to the result panel
- [x] compute `maxLineChars` from React data instead of `resultDiv.dataset.virtualMaxChars`
- [x] set a CSS variable or inline font size from React
- [x] use `ResizeObserver` or `useLayoutEffect` for container measurement
- [x] preserve current behavior while `isNavigatingViewport` is true, if deferral is still needed for perf
- [x] remove the responsive result font logic from `initialize.ts`

Likely files:

- `lpviz/src/components/panels/UsagePanel.tsx`
- `lpviz/src/app/uiSelectors.ts`
- `lpviz/src/ui/interaction/initialize.ts`
- `lpviz/src/ui/interaction/resultRuntime.ts`
- maybe a new `lpviz/src/components/panels/useResultTypography.ts`

Definition of done:

- long result lines still fit the panel
- no imperative text queries or inline font writes happen in `initialize.ts`
- `result` no longer needs to be in the shared bridge for typography work

---

## Phase 5: Move Result Virtualization To React

Why this matters:

`resultVirtualHost` only exists because virtual row visibility is still driven from imperative code.

This is also a good opportunity to simplify state ownership:

- store the **full result payload** globally
- keep the **visible row window** local to the result component

Outcome:

- `createResultRuntime()` becomes DOM-free
- `UsagePanel` owns its scroll container and virtual row window
- scroll no longer forces app-wide state updates for every visible-row change

Recommended state transition:

Current store shape includes view-derived fields like:

- `resultVirtualRows`
- `resultVirtualPaddingTop`
- `resultVirtualPaddingBottom`

Proposed direction:

- add a field for the full virtual result payload or row list
- keep visible rows/padding as local component state
- keep hover/highlight index in app state because it affects canvas drawing

Tasks:

- [ ] change `resultRuntime.render()` to write the full virtual payload into state, not the visible slice
- [ ] create a local `useVirtualRows()` hook in the result panel
- [ ] move the scroll listener + `ResizeObserver` to that hook
- [ ] preserve the current estimated row height and overscan numbers first; optimize later
- [ ] delete `resultVirtualHost` from `LegacyRuntimeElements`
- [ ] once typography is already React-owned, remove `result` from the shared bridge too

Likely files:

- `lpviz/src/ui/interaction/resultRuntime.ts`
- `lpviz/src/state/store.ts`
- `lpviz/src/app/uiSelectors.ts`
- `lpviz/src/components/panels/UsagePanel.tsx`
- `lpviz/src/app/legacyRuntimeElements.tsx`
- maybe a new `lpviz/src/components/panels/useVirtualRows.ts`

Definition of done:

- long virtual results still scroll smoothly
- hover/highlight behavior still works
- no result-panel DOM node is required by `initialize.ts`

---

## Phase 6: Collapse The Shared Bridge To Canvas-Only

Outcome:

- `LegacyRuntimeElementsProvider` disappears
- the remaining bridge is just the canvas host ref

Tasks:

- [ ] remove the ref context/provider entirely
- [ ] let `CanvasStage` own its own `canvasRef`
- [ ] change `useLegacyCanvasRuntime()` to accept only the canvas ref (and URL params)
- [ ] rename bridge modules to reflect the new scope, e.g. `useCanvasRuntime()` / `initializeCanvasRuntime()`
- [ ] delete `LegacyRuntimeElements` types and the provider file

Likely files:

- `lpviz/src/app/legacyRuntimeElements.tsx`
- `lpviz/src/components/layout/useLegacyCanvasRuntime.ts`
- `lpviz/src/components/layout/CanvasStage.tsx`
- `lpviz/src/app/App.tsx`
- `lpviz/src/ui/interaction/initialize.ts`

Definition of done:

- the shared ref registry is gone
- the only remaining imperative host ref is the canvas element

---

## Phase 7: Replace The Global Runtime Command Registry With React Actions

Why after the bridge shrink:

Once the DOM bridge is small, the remaining command surface is easier to replace without mixing concerns.

Outcome:

- React components call runtime actions through a provider/hook instead of `lpvizRuntimeCommands`
- command availability is tied to the mounted tree, not module-global mutable state

Tasks:

- [ ] create `LpvizRuntimeContext` or a similarly small actions provider
- [ ] expose stable actions like `setActiveSolverMode`, `toggle3D`, `share`, `setConstraintHighlight`, etc.
- [ ] migrate components away from `lpvizRuntimeCommands`
- [ ] remove `registerLpvizRuntimeCommands()`
- [ ] keep the API flat and boring; this should be a thin action surface, not a second store

Likely files:

- `lpviz/src/app/lpvizRuntime.ts`
- `lpviz/src/components/layout/CanvasStage.tsx`
- `lpviz/src/components/layout/Sidebar.tsx`
- `lpviz/src/components/panels/*.tsx`
- maybe a new `lpviz/src/app/LpvizRuntimeContext.tsx`

Definition of done:

- no module-global mutable runtime command registry remains
- runtime actions are accessed through React, not imports with hidden registration timing

---

## Phase 8: Split `initialize.ts` Into Feature Runtimes

Why this matters:

Even after refs are removed, `initialize.ts` is still a large composition root.

Shrinking it will make future React migrations much easier.

Outcome:

- the imperative runtime is organized by concern
- remaining DOM-specific logic is easier to isolate and port

Suggested split:

- `createCanvasRuntime()`
- `createSolverRuntime()`
- `createShareRuntime()`
- `createTourRuntime()`
- `createOverlayRuntime()`

Tasks:

- [ ] extract self-contained runtime modules out of `initialize.ts`
- [ ] pass domain dependencies, not whole bags of DOM nodes
- [ ] keep the top-level initializer small and declarative
- [ ] rename the initializer to match its actual responsibility after the split

Likely files:

- `lpviz/src/ui/interaction/initialize.ts`
- new files under `lpviz/src/ui/interaction/`

Definition of done:

- `initialize.ts` reads as assembly code, not feature logic
- remaining imperative modules have small typed dependencies

---

## Phase 9: Port Remaining Imperative UI DOM (Tour / Overlay)

This is slightly outside the ref bridge itself, but it is the last chunk of imperative UI ownership.

Outcome:

- popup and tour cursor are React-rendered or at least React-owned through portals
- the tour no longer clicks buttons by DOM id

Tasks:

- [ ] move popup/cursor DOM creation into React components or portals
- [ ] replace `getTourButtonTarget(id)` with direct action calls where possible
- [ ] only keep ids for CSS/testing compatibility, not runtime lookup

Likely files:

- `lpviz/src/ui/interaction/initialize.ts`
- new React portal components under `lpviz/src/components/`

Definition of done:

- no user-facing UI behavior depends on `document.getElementById()` or manual `appendChild()` outside the canvas runtime

## Suggested First Three Slices

If we want the safest start, do these first:

1. **Phase 1** — remove dead no-op UI callback plumbing
2. **Phase 2** — port the null-state logo to React
3. **Phase 3** — move sidebar layout/resize to React and delete three bridge refs at once

That sequence gives us:

- a smaller imperative surface
- an immediate easy win
- the biggest ref reduction early

## File-Level Deletion Targets

These are the files most likely to shrink substantially over this effort:

- `lpviz/src/app/legacyRuntimeElements.tsx`
- `lpviz/src/components/layout/useLegacyCanvasRuntime.ts`
- `lpviz/src/ui/interaction/initialize.ts`
- `lpviz/src/ui/interaction/resultRuntime.ts`
- `lpviz/src/app/lpvizRuntime.ts`

## Risks

### Risk: We accidentally move view mechanics into the global app store

Mitigation:

- prefer local hooks/context for layout, measurement, and visible virtual rows
- only store data that matters outside the component

### Risk: We remove DOM timing assumptions too quickly

Mitigation:

- keep the canvas runtime stable while porting sidebar/result logic
- use one UI surface per slice

### Risk: Virtualized result rendering changes hover/highlight behavior

Mitigation:

- keep highlight index in shared state
- preserve current row height/overscan constants first

### Risk: Sidebar layout migration causes canvas resize glitches

Mitigation:

- introduce a minimal width-sync hook first
- test drag, resize, zoom, and 3D after each change

### Risk: The tour still depends on DOM ids

Mitigation:

- keep ids in place until the tour is ported to actions

## Recommended End-State Ownership Map

| Concern                             | Final owner                      |
| ----------------------------------- | -------------------------------- |
| canvas element                      | local ref in `CanvasStage`       |
| canvas rendering / viewport         | imperative runtime               |
| solver orchestration                | imperative/runtime actions       |
| sidebar width                       | React layout state/context       |
| result font fitting                 | React hook                       |
| result virtualization               | React hook                       |
| null-state logo                     | React component                  |
| tour / overlay UI                   | ideally React portals/components |
| hover/highlight that affects canvas | app state + runtime actions      |

## Immediate Next Step

Phases 1, 2, 3, and 4 are done.

The next practical coding task should be:

1. move result virtualization into React
2. then remove `resultVirtualHost` from `LegacyRuntimeElements`

That should leave the shared bridge very close to canvas-only.
