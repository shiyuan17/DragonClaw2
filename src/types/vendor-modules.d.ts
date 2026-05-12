declare module "turndown" {
  export interface TurndownOptions {
    bulletListMarker?: "-" | "+" | "*";
    codeBlockStyle?: "indented" | "fenced";
    emDelimiter?: "_" | "*";
    headingStyle?: "setext" | "atx";
  }

  export default class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(input: string): string;
  }
}

declare module "lake-codemirror" {
  export const EditorState: unknown;
  export const Compartment: unknown;
  export const EditorView: unknown;
  export const keymap: unknown;
  export const history: unknown;
  export const defaultKeymap: unknown;
  export const historyKeymap: unknown;
  export const indentWithTab: unknown;
  export const HighlightStyle: unknown;
  export const syntaxHighlighting: unknown;
  export const tags: unknown;
  export const langItems: unknown[];
}
