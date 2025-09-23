declare module "sprintf-js" {
  export function sprintf(format: string, ...args: any[]): string;
  export function vsprintf(format: string, args: any[]): string;
}
