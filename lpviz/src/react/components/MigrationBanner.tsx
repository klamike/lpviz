export function MigrationBanner() {
  return (
    <div className="migration-banner">
      <div className="migration-banner__title">
        React + R3F migration in progress
      </div>
      <div className="migration-banner__body">
        Core UI is now rendered with React and @react-three/fiber. Feature
        parity with the legacy UI is being rebuilt incrementally—see
        <code> REACT_MIGRATION_TODO.md</code> for the live checklist.
      </div>
    </div>
  );
}
