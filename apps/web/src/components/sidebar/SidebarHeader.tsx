import { GitHubLink } from "./GitHubLink";

export function SidebarHeader() {
  return (
    <div className="header controlPanel">
      <h1>lpviz</h1>
      <GitHubLink />
    </div>
  );
}
