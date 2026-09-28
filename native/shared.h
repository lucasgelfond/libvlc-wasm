/*****************************************************************************
 * shared.h: memory layouts shared with JavaScript
 *****************************************************************************
 * Copyright (C) 2026 Lucas Gelfond
 *
 * SPDX-License-Identifier: MIT
 * See LICENSE at the root of the libvlc-wasm repository. Linked into VLC,
 * which is (L)GPL, the resulting binary is distributed under the GPL.
 *****************************************************************************/

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
#include <stddef.h>
#include <stdint.h>

#include <vlc_common.h>
#include <vlc_threads.h> /* vlc_mutex_t */

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

/* Pixel layouts the page's shader draws: the low byte of wv_video_t.chroma,
 * and the format webcodecs.c's wv_wc_push() takes. renderer.js and engine.js
 * (webCodecsHost) use the same numbers. */
enum wv_layout
{
    WV_LAYOUT_I420,
    WV_LAYOUT_I422,
    WV_LAYOUT_I444,
    WV_LAYOUT_NV12,
    WV_LAYOUT_I420_10,  /* 10-bit little-endian */
    WV_LAYOUT_RGBX,     /* packed, already RGB */
    WV_LAYOUT_BGRX,     /* Firefox's hardware frames */
    WV_LAYOUT_COUNT
};

/* Colour description bits, above the layout byte. */
#define WV_COLOUR_FULL_RANGE    (1u << 8)
#define WV_COLOUR_MATRIX_SHIFT  12       /* enum wv_matrix */
#define WV_COLOUR_TRANSFER_SHIFT 16      /* 0 SDR, 1 PQ, 2 HLG */
#define WV_COLOUR_KNOWN         (1u << 24) /* webcodecs: the frame said so */

enum wv_matrix { WV_MATRIX_BT601, WV_MATRIX_BT709, WV_MATRIX_BT2020 };

typedef struct wv_video
{
    _Atomic uint32_t seq;         /*  0 bumped on every displayed frame */
    _Atomic int32_t front;        /*  1 index of the newest complete frame, -1 none */
    _Atomic int32_t reading;      /*  2 set by the page, -1 none */
    _Atomic uint32_t format_gen;  /*  3 bumped whenever buffers are (re)allocated */
    uint32_t width;               /*  4 */
    uint32_t height;              /*  5 */
    uint32_t chroma;              /*  6 wv_layout | WV_COLOUR_* bits */
    uint32_t pitch[3];            /*  7..9 */
    uint32_t lines[3];            /* 10..12 */
    uint8_t *planes[WV_VIDEO_BUFFERS][3]; /* 13..21 */
    _Atomic uint32_t displayed;   /* 22 total frames handed to the page */
    _Atomic uint32_t drawn;       /* 23 seq of the last frame the page uploaded */
    uint32_t sar_num;             /* 24 sample aspect ratio of the picture */
    uint32_t sar_den;             /* 25 */
    /* 26..29: the part of the buffered picture to show, in pixels (0,0,0,0 =
     * all of it): VLC's crop, applied by the page's shader. */
    uint32_t crop_x, crop_y, crop_w, crop_h;
} wv_video_t;

/* Pointer input for the picture: webwindow.c is the vout's window, and the
 * bridge reports the page's mouse through it, so VLC maps it onto the video
 * (DVD menu buttons, and anything else that listens to vout mouse events). */
typedef struct wv_window
{
    vlc_mutex_t lock;
    vlc_cond_t idle;              /* signalled when reporting drops to 0 */
    struct vlc_window *wnd;       /* NULL while no video output is open */
    unsigned width, height;       /* the window VLC asked for (picture size) */
    unsigned reporting;           /* reports in progress, made outside lock */
} wv_window_t;

/* C only, not read by JavaScript. WebCodecs decodes asynchronously, so the
 * time its decode calls take (VLC's own decode statistics) says nothing about
 * the browser's decoder: webcodecs.c measures it here instead, one per player,
 * found through the "webcodecs-stats" variable. */
typedef struct wv_decode_stats
{
    _Atomic uint64_t busy_us;     /* time the VideoDecoder decoded flat out, in us */
    _Atomic uint64_t frames;      /* frames it produced in that time */
    _Atomic int32_t active;       /* WebCodecs decoders open */
} wv_decode_stats_t;

/* The indices above are hardcoded in packages/core/src/layout.js and
 * audio-worklet.js: fail the build rather than the page if they drift. */
#define WV_AT(type, field, index) \
    _Static_assert(offsetof(type, field) == (index) * 4, #type "." #field " moved")
_Static_assert(sizeof(void *) == 4, "the layouts assume wasm32");
WV_AT(wv_ring_t, heartbeat, 16);
WV_AT(wv_ring_t, data, 17);
WV_AT(wv_video_t, chroma, 6);
WV_AT(wv_video_t, planes, 13);
WV_AT(wv_video_t, displayed, 22);
WV_AT(wv_video_t, drawn, 23);
WV_AT(wv_video_t, sar_num, 24);
WV_AT(wv_video_t, crop_x, 26);
WV_AT(wv_video_t, crop_h, 29);
_Static_assert(sizeof(wv_video_t) == 30 * 4, "wv_video_t size changed");
#undef WV_AT

#endif
