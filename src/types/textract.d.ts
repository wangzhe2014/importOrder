declare module 'textract' {
  interface TextractOptions {
    preserveLineBreaks?: boolean;
  }

  type TextractCallback = (error: Error | null, text: string | null) => void;

  export function fromFileWithPath(
    filePath: string,
    options?: TextractOptions,
    callback?: TextractCallback
  ): void;

  export function fromFileWithPath(
    filePath: string,
    callback: TextractCallback
  ): void;
}