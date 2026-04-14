import GitHubIcon from "@/assets/github.svg?react";

export function GitHubLink() {
  return (
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
  );
}
