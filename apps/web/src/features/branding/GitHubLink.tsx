import GitHubMark from "../../assets/github-mark.svg?react";

export function GitHubLink() {
  return (
    <a
      className="github-link"
      href="https://github.com/klamike/lpviz"
      target="_blank"
      rel="noreferrer"
      aria-label="GitHub Repository for lpviz"
    >
      <GitHubMark className="github-icon" aria-hidden="true" focusable="false" />
    </a>
  );
}
