import { createVLC } from 'libvlc-wasm';

let shared = null;

/**
 * One engine per page: it owns a Worker, the wasm instance and a thread pool,
 * and can drive any number of players.
 */
export function getVLC(opts) {
  shared ??= createVLC({ logLevel: 'warn', ...opts });
  return shared;
}
