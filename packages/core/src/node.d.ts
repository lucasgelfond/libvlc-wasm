import type { MediaInfo } from './index.js';

export interface NodeVLC {
  version: { version: string; compiler: string; changeset: string; features: { sout: boolean } };
  probe(path: string): Promise<MediaInfo>;
  thumbnail(path: string, opts?: { time?: number; position?: number; width?: number; height?: number; crop?: boolean; fast?: boolean }):
    Promise<{ jpeg: Uint8Array; width: number; height: number }>;
  destroy(): Promise<void>;
}

export declare function createVLC(opts?: {
  threads?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'off';
  args?: string[];
  onLog?: (l: { level: number; message: string }) => void;
}): Promise<NodeVLC>;
