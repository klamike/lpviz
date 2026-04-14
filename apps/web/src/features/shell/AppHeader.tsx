// TODO: Rename all components that have an "App" prefix to just what they are. "AppHeader" should just be "Header", for example.

import { GitHubLink } from "../branding/GitHubLink";

export function AppHeader() {
  return (
    <div className="header controlPanel">
      <h1>lpviz</h1>
      <GitHubLink />
    </div>
  );
}
