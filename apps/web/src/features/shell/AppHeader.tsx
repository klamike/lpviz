import { GitHubLink } from "../branding/GitHubLink";

export function AppHeader() {
  return (
    <div className="header controlPanel">
      <h1>lpviz</h1>
      <GitHubLink />
    </div>
  );
}
