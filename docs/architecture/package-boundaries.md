# Workspace package boundaries

This repo is being split into internal TypeScript workspace packages incrementally.

## Current extracted packages

- `@lpviz/contracts`
- `@lpviz/math`
- `@lpviz/polytope`
- `@lpviz/solver-engine`
- `@lpviz/state`
- `@lpviz/viewport`
- `@lpviz/runtime`

## App workspace

- `apps/web`
  - React app entrypoint and composition
  - UI providers
  - shell/layout/panel components
  - top-level styles/assets

## Import rules

- App code in `src/**` should import extracted libraries through package names only.
- Do not deep-import package internals like `@lpviz/<pkg>/src/...`.
- Do not keep importing extracted modules through old relative source paths such as:
  - `../features/solver/resultPayload`
  - `../math/blas`
  - `../math/dense`
  - `../polytope/...`
  - `../solvers/centralPath` / `ipm` / `simplex` / `pdhg*`
  - `../store/lpvizStore`
  - `../store/uiSelectors`
  - `../store/useLpvizStore`
  - `../features/canvas/viewportApi`
  - `../features/canvas/r3f/...`
  - `../features/canvas/initializeCanvasRuntime`
  - `../features/editor/...`
  - `../features/onboarding/onboardingRuntime`
  - `../features/shared/runtimeTypes`
  - `../features/shared/sharedState`
  - `../features/solver/resultRuntime`
  - `../features/solver/solverControls`
  - `../features/solver/solverRuntime`
  - `../solvers/worker/client`
  - `../solvers/worker/solverService`
  - `../solvers/worker/solverWorker`

## Planned dependency direction

- `@lpviz/contracts`
- `@lpviz/math -> @lpviz/contracts` (if ever needed)
- `@lpviz/polytope -> @lpviz/math`
- `@lpviz/solver-engine -> @lpviz/math`, `@lpviz/polytope`
- `@lpviz/state -> @lpviz/contracts`, `@lpviz/math`, `@lpviz/polytope`
- `@lpviz/viewport -> @lpviz/math`, `@lpviz/polytope`, `@lpviz/state`
- `@lpviz/runtime -> @lpviz/contracts`, `@lpviz/math`, `@lpviz/polytope`, `@lpviz/solver-engine`, `@lpviz/state`, `@lpviz/viewport`
- later packages:
  - `apps/web` composition split

## Guardrail

Run:

```sh
bun run check:workspace-imports
```

This currently enforces the extracted package seams, including state, viewport, and runtime package moves, and can be expanded as more packages move out of `src/**`.
