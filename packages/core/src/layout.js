// Int32 indices into the shared structs in native/shared.h. Change both together.

export const RING = Object.freeze({
  MAGIC: 0, WRITE: 1, READ: 2, FLUSH_GEN: 3, FLUSH_POS: 4, PAUSED: 5, ACTIVE: 6,
  LATENCY_US: 7, VOLUME_MILLI: 8, MUTED: 9, DROPPED: 10, UNDERRUNS: 11,
  STREAM_GEN: 12, CAPACITY: 13, CHANNELS: 14, RATE: 15, HEARTBEAT: 16, DATA_PTR: 17,
});

export const VIDEO = Object.freeze({
  SEQ: 0, FRONT: 1, READING: 2, FORMAT_GEN: 3, WIDTH: 4, HEIGHT: 5, CHROMA: 6,
  PITCH: 7, LINES: 10, PLANES: 13, DISPLAYED: 22, SAR_NUM: 24, SAR_DEN: 25, SIZE: 26,
});

export const VIDEO_BUFFERS = 3;
