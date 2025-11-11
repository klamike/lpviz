export interface VirtualResultPayload {
  type: "virtual";
  header: string;
  rows: string[];
  footer?: string;
}

export interface HtmlResultPayload {
  type: "html";
  html: string;
}

export type ResultRenderPayload = VirtualResultPayload | HtmlResultPayload;
