import GitHubIcon from "@/assets/github.svg?react";

export function SidebarHeader() {
  return (
    <div className="header controlPanel">
      <h1>lpviz</h1>
      <a
        className="github-link"
        href="https://github.com/klamike/lpviz"
        target="_blank"
        rel="noreferrer"
        aria-label="GitHub Repository for lpviz"
      >
        <GitHubIcon
          className="github-icon"
          aria-hidden="true"
          focusable="false"
        />
      </a>
    </div>
  );
}
