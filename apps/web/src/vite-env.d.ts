/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

declare module "sprintf-js" {
  export function sprintf(format: string, ...args: unknown[]): string;
  export function vsprintf(format: string, args: unknown[]): string;
}
