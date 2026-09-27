/*
 * Shared-memory layouts read directly by JavaScript.
 *
 * Every field is 32 bits and in a fixed order: the page and the AudioWorklet
 * read these through Int32Array views at the indices given in the comments,
 * mirrored in packages/core/src/layout.js. Change one, change both.
 */
#ifndef WV_SHARED_H
#define WV_SHARED_H

#include <stdatomic.h>
#include <stdint.h>

#define WV_RING_MAGIC 0x57564152u /* "WVAR" */

typedef struct wv_ring
{
    uint32_t magic;               /*  0 */
    _Atomic uint32_t write;       /*  1 frames written, wraps */
    _Atomic uint32_t read;        /*  2 frames consumed by the worklet, wraps */
    _Atomic uint32_t flush_gen;   /*  3 bumped on flush */
    _Atomic uint32_t flush_pos;   /*  4 where `read` jumps to on a new flush_gen */
    _Atomic int32_t paused;       /*  5 */
    _Atomic int32_t active;       /*  6 a stream is started */
    _Atomic int32_t latency_us;   /*  7 set by the page: base + output latency */
    _Atomic int32_t volume_milli; /*  8 */
    _Atomic int32_t muted;        /*  9 */
    _Atomic uint32_t dropped;     /* 10 frames discarded because the ring was full */
    _Atomic uint32_t underruns;   /* 11 render quanta the worklet came up short */
    _Atomic uint32_t stream_gen;  /* 12 bumped on every start */
    uint32_t capacity;            /* 13 frames */
    uint32_t channels;            /* 14 */
    uint32_t rate;                /* 15 */
    _Atomic uint32_t heartbeat;   /* 16 bumped by the worklet on every render quantum */
    float *data;                  /* 17 interleaved float32 */
} wv_ring_t;

/* Video: the vout thread copies each frame into one of three buffers and
 * publishes its index; the page uploads whichever is newest on its next
 * animation frame. `reading` is the page's claim on a buffer, so the vout never
 * writes into the one being uploaded. */
#define WV_VIDEO_BUFFERS 3

typedef struct wv_video
{
    _Atomic uint32_t seq;         /*  0 bumped on every displayed frame */
    _Atomic int32_t front;        /*  1 index of the newest complete frame, -1 none */
    _Atomic int32_t reading;      /*  2 set by the page, -1 none */
    _Atomic uint32_t format_gen;  /*  3 bumped whenever buffers are (re)allocated */
    uint32_t width;               /*  4 */
    uint32_t height;              /*  5 */
    uint32_t chroma;              /*  6 layout | full range << 8 | matrix << 12 | transfer << 16 */
    uint32_t pitch[3];            /*  7..9 */
    uint32_t lines[3];            /* 10..12 */
    uint8_t *planes[WV_VIDEO_BUFFERS][3]; /* 13..21 */
    _Atomic uint32_t displayed;   /* 22 total frames handed to the page */
    int32_t locked;               /* 23 (unused since webframe.c; kept for the layout) */
    uint32_t sar_num;             /* 24 sample aspect ratio of the picture */
    uint32_t sar_den;             /* 25 */
} wv_video_t;

#endif
