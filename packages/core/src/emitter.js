/** Minimal typed-ish event emitter: on() returns its own unsubscribe. */
export class Emitter {
  #handlers = new Map();

  /** @param {string} type @param {(detail: any) => void} fn @returns {() => void} */
  on(type, fn) {
    let set = this.#handlers.get(type);
    if (!set) this.#handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.#handlers.get(type)?.delete(fn);
  }

  /** Resolves with the next event of this type. */
  once(type) {
    return new Promise((resolve) => {
      const off = this.on(type, (d) => { off(); resolve(d); });
    });
  }

  emit(type, detail) {
    for (const fn of this.#handlers.get(type) ?? []) {
      try { fn(detail); } catch (e) { queueMicrotask(() => { throw e; }); }
    }
  }
}
