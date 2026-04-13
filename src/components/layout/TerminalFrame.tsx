import type { ReactNode } from "react";

type TerminalFrameProps = {
  children: ReactNode;
  containerId: string;
  delayClassName: string;
};

export function TerminalFrame({
  children,
  containerId,
  delayClassName,
}: TerminalFrameProps) {
  return (
    <div id={containerId}>
      {children}
      <div id="terminal-window"></div>
      <div className="scanlines"></div>
      <div className={`scanlines ${delayClassName}`}></div>
    </div>
  );
}
