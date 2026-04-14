# State package notes

`@lpviz/state` owns the application store, state model, and derived UI selectors.

## Public entrypoints

- `@lpviz/state`
  - store state/types/constants
  - selectors and selector equality helpers
- `@lpviz/state/react`
  - `useLpvizSelector`
  - React hook bindings for the external store

## Boundary intent

- `@lpviz/state` may depend on:
  - `@lpviz/contracts`
  - `@lpviz/math`
  - `@lpviz/polytope`
- `@lpviz/state` should not depend on feature folders or app shell UI.
- React-specific state bindings stay in the `./react` subpath so the core state entrypoint remains non-React.
