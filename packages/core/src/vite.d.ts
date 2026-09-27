/** Vite plugin: cross-origin isolation headers on every dev/preview response, plus the engine kept out of dependency optimisation. */
export default function crossOriginIsolation(): {
  name: string;
  configureServer: (server: unknown) => void;
  configurePreviewServer: (server: unknown) => void;
  config: () => Record<string, unknown>;
};
