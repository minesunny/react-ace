declare module "*.css?raw" {
  const contents: string;
  export default contents;
}

declare module "virtual:react-ace-mode-assets" {
  export const modes: ReadonlyMap<
    string,
    {
      load?: () => Promise<unknown>;
      url?: string;
      workers: readonly string[];
    }
  >;
  export function getWorkerUrl(id: string): string | undefined;
}
