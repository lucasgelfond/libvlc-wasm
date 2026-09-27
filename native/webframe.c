/*****************************************************************************
 * webframe.c: video output into shared memory for a WebGL page
 *****************************************************************************
 * Copyright (C) 2026 Lucas Gelfond
 *
 * SPDX-License-Identifier: MIT
 * See LICENSE at the root of the libvlc-wasm repository. Linked into VLC,
 * which is (L)GPL, the resulting binary is distributed under the GPL.
 *****************************************************************************/

/*
 * webframe: a VLC video output that hands frames to the page's WebGL
 * renderer (packages/core/src/renderer.js) through shared memory.
 *
 * It replaces libvlc's vmem callbacks, which have two blind spots: the
 * callback is never told a picture's colour range, matrix, transfer or
 * sample aspect ratio (VLC 4 carries full range as a flag, not a "J" chroma),
 * and anything but the one chroma asked for goes through swscale -- in wasm,
 * on every frame. Here the display sees VLC's whole video_format_t: it keeps
 * the decoder's own layout whenever the shader can draw it (4:2:0/4:2:2/4:4:4
 * planar, NV12, 10-bit 4:2:0) and publishes the colour description with each
 * format, so the shader applies the right matrix and range.
 *
 * Frames are copied into one of three buffers (see wv_video_t in shared.h);
 * the page claims the newest on each animation frame. Like webaudio.c, it is
 * built out of tree and registered as a static module; the bridge selects it
 * with the player's "vout" variable and hands it the buffers through
 * "webframe-data".
 */
#ifdef HAVE_CONFIG_H
# include "config.h"
#endif

#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>

#include <vlc_common.h>
#include <vlc_plugin.h>
#include <vlc_vout_display.h>
#include <vlc_picture.h>

#include "shared.h"

/* How long Close() gives the page to take the last frame, and to finish an
 * upload, before the buffers go away. */
#define CLOSE_WAIT_MS 100

typedef struct
{
    wv_video_t *v;
    uint8_t *mem;
    picture_t *buffer[WV_VIDEO_BUFFERS]; /* pictures over v->planes */
    int idx;       /* buffer filled by prepare(), published by display() */
    unsigned x0, y0, w0, h0; /* the source region the buffers hold */
} vout_display_sys_t;

/* What the shader draws, indexed by enum wv_layout. */
static const struct
{
    vlc_fourcc_t fourcc;
    unsigned bpp, cw, ch, planes;
} layouts[WV_LAYOUT_COUNT] = {
    [WV_LAYOUT_I420]    = { VLC_CODEC_I420,     1, 2, 2, 3 },
    [WV_LAYOUT_I422]    = { VLC_CODEC_I422,     1, 2, 1, 3 },
    [WV_LAYOUT_I444]    = { VLC_CODEC_I444,     1, 1, 1, 3 },
    [WV_LAYOUT_NV12]    = { VLC_CODEC_NV12,     1, 2, 2, 2 },
    [WV_LAYOUT_I420_10] = { VLC_CODEC_I420_10L, 2, 2, 2, 3 },
    [WV_LAYOUT_RGBX]    = { VLC_CODEC_RGBX,     4, 1, 1, 1 },
    [WV_LAYOUT_BGRX]    = { VLC_CODEC_BGRX,     4, 1, 1, 1 },
};

static unsigned align_up(unsigned v, unsigned a) { return (v + a - 1) / a * a; }

static uint32_t describe_colour(const video_format_t *f, uint32_t code)
{
    uint32_t matrix;
    switch (f->space) {
    case COLOR_SPACE_BT709:  matrix = WV_MATRIX_BT709; break;
    case COLOR_SPACE_BT2020: matrix = WV_MATRIX_BT2020; break;
    case COLOR_SPACE_BT601:  matrix = WV_MATRIX_BT601; break;
    default: /* undefined: the usual convention, by size */
        matrix = f->i_visible_height >= 720 ? WV_MATRIX_BT709 : WV_MATRIX_BT601;
        break;
    }
    uint32_t transfer = f->transfer == TRANSFER_FUNC_SMPTE_ST2084 ? 1
                      : f->transfer == TRANSFER_FUNC_HLG ? 2 : 0;
    return code | (f->color_range == COLOR_RANGE_FULL ? WV_COLOUR_FULL_RANGE : 0)
                | (matrix << WV_COLOUR_MATRIX_SHIFT)
                | (transfer << WV_COLOUR_TRANSFER_SHIFT);
}

static void Prepare(vout_display_t *vd, picture_t *pic,
                    const struct vlc_render_subpicture *subpic, vlc_tick_t date)
{
    (void) subpic; (void) date;
    vout_display_sys_t *sys = vd->sys;
    wv_video_t *v = sys->v;

    /* Never the frame on screen (front) nor the one the page is uploading. */
    int front = atomic_load(&v->front), reading = atomic_load(&v->reading);
    int idx = 0;
    while (idx == front || idx == reading)
        idx++;

    picture_CopyPixels(sys->buffer[idx], pic);
    sys->idx = idx;
}

static void Display(vout_display_t *vd, picture_t *pic)
{
    (void) pic;
    vout_display_sys_t *sys = vd->sys;
    atomic_store(&sys->v->front, sys->idx);
    atomic_fetch_add(&sys->v->seq, 1);
    atomic_fetch_add(&sys->v->displayed, 1);
}

static void Close(vout_display_t *vd)
{
    vout_display_sys_t *sys = vd->sys;
    wv_video_t *v = sys->v;
    /* A clip that ends right after its last frame (a one-frame file, a still
     * followed by EOF) closes the display before the page's next animation
     * frame: give the page a moment to upload what it has not seen yet. */
    for (int ms = 0; ms < CLOSE_WAIT_MS && atomic_load(&v->front) >= 0
                     && atomic_load(&v->drawn) != atomic_load(&v->seq); ms++)
        vlc_tick_sleep(VLC_TICK_FROM_MS(1));
    atomic_store(&v->front, -1);
    atomic_fetch_add(&v->format_gen, 1);
    /* Let an upload in progress finish before the memory goes away. */
    for (int ms = 0; ms < CLOSE_WAIT_MS && atomic_load(&v->reading) >= 0; ms++)
        vlc_tick_sleep(VLC_TICK_FROM_MS(1));
    memset(v->planes, 0, sizeof v->planes);
    for (int b = 0; b < WV_VIDEO_BUFFERS; b++)
        picture_Release(sys->buffer[b]);
    /* A page that is still uploading (a stalled tab) holds a pointer into the
     * buffers: leaking them is better than freeing memory being read. */
    if (atomic_load(&v->reading) < 0)
        free(sys->mem);
    else
        msg_Warn(vd, "page still reading a frame, leaking its buffers");
    free(sys);
}

/* A forced aspect ratio ("16:9", ...) arrives as a new sample aspect ratio. */
static int SetSourceAspect(vout_display_t *vd, const video_format_t *fmt)
{
    wv_video_t *v = ((vout_display_sys_t *)vd->sys)->v;
    v->sar_num = fmt->i_sar_num ? fmt->i_sar_num : 1;
    v->sar_den = fmt->i_sar_den ? fmt->i_sar_den : 1;
    atomic_fetch_add(&v->format_gen, 1);
    return VLC_SUCCESS;
}

/* A crop arrives as a new visible region of the source; the buffers keep the
 * whole picture and the page's shader samples just that part. */
static int SetSourceCrop(vout_display_t *vd, const video_format_t *fmt)
{
    vout_display_sys_t *sys = vd->sys;
    wv_video_t *v = sys->v;
    /* The crop is given in the source's orientation, but the buffers hold the
     * rotated picture: let the core crop instead. */
    if (vd->source->orientation != ORIENT_NORMAL)
        return VLC_EGENERIC;
    unsigned x = fmt->i_x_offset > sys->x0 ? fmt->i_x_offset - sys->x0 : 0;
    unsigned y = fmt->i_y_offset > sys->y0 ? fmt->i_y_offset - sys->y0 : 0;
    unsigned w = fmt->i_visible_width, h = fmt->i_visible_height;
    if (x >= sys->w0 || y >= sys->h0 || w == 0 || h == 0) {
        x = y = w = h = 0; /* nothing sensible: show everything */
    } else {
        if (x + w > sys->w0) w = sys->w0 - x;
        if (y + h > sys->h0) h = sys->h0 - y;
    }
    v->crop_x = x;
    v->crop_y = y;
    v->crop_w = w;
    v->crop_h = h;
    atomic_fetch_add(&v->format_gen, 1);
    return VLC_SUCCESS;
}

static const struct vlc_display_operations ops = {
    .close = Close,
    .prepare = Prepare,
    .display = Display,
    .set_source_aspect = SetSourceAspect,
    .set_source_crop = SetSourceCrop,
};

static int Open(vout_display_t *vd, video_format_t *fmtp, vlc_video_context *context)
{
    (void) context;
    wv_video_t *v = var_InheritAddress(vd, "webframe-data");
    if (v == NULL)
        return VLC_EGENERIC;

    video_format_t fmt;
    video_format_ApplyRotation(&fmt, vd->source);

    /* Anything the shader cannot draw is converted by the core: to I420, or
     * to RGBX for RGB sources, which would otherwise lose alpha and precision
     * on the way through YUV. */
    unsigned pick = vlc_fourcc_IsYUV(fmt.i_chroma) ? WV_LAYOUT_I420 : WV_LAYOUT_RGBX;
    for (unsigned k = 0; k < WV_LAYOUT_COUNT; k++)
        if (fmt.i_chroma == layouts[k].fourcc) {
            pick = k;
            break;
        }
    fmt.i_chroma = layouts[pick].fourcc;

    /* Visible picture only: the core crops for us (as with vmem). */
    unsigned w = fmt.i_visible_width, h = fmt.i_visible_height;
    fmt.i_width = fmt.i_visible_width = w;
    fmt.i_height = fmt.i_visible_height = h;
    fmt.i_x_offset = fmt.i_y_offset = 0;

    const unsigned bpp = layouts[pick].bpp, cw = layouts[pick].cw, chh = layouts[pick].ch;
    const unsigned nplanes = layouts[pick].planes;
    /* Chroma pitches are the luma pitch over the horizontal subsampling, so a
     * single texture-coordinate crop (visible / pitch) fits every plane. */
    unsigned pitch[3] = { align_up(w * bpp, 64 * cw), 0, 0 };
    unsigned lines[3] = { align_up(h, 16), 0, 0 };
    for (unsigned k = 1; k < nplanes; k++) {
        pitch[k] = nplanes == 2 ? pitch[0] : pitch[0] / cw;
        lines[k] = lines[0] / chh;
    }
    size_t frame = 0;
    for (unsigned k = 0; k < 3; k++)
        frame += (size_t)pitch[k] * lines[k];

    vout_display_sys_t *sys = calloc(1, sizeof(*sys));
    uint8_t *mem = aligned_alloc(64, align_up(frame, 64) * WV_VIDEO_BUFFERS);
    if (sys == NULL || mem == NULL) {
        free(sys);
        free(mem);
        return VLC_ENOMEM;
    }
    memset(mem, 0, align_up(frame, 64) * WV_VIDEO_BUFFERS);
    for (int b = 0; b < WV_VIDEO_BUFFERS; b++) {
        uint8_t *base = mem + align_up(frame, 64) * b;
        picture_resource_t rsc = { .p_sys = NULL };
        for (unsigned k = 0; k < 3; k++) {
            v->planes[b][k] = base;
            rsc.p[k].p_pixels = base;
            rsc.p[k].i_lines = lines[k];
            rsc.p[k].i_pitch = pitch[k];
            base += (size_t)pitch[k] * lines[k];
        }
        sys->buffer[b] = picture_NewFromResource(&fmt, &rsc);
        if (sys->buffer[b] == NULL) {
            while (b-- > 0)
                picture_Release(sys->buffer[b]);
            memset(v->planes, 0, sizeof v->planes);
            free(mem);
            free(sys);
            return VLC_ENOMEM;
        }
    }
    sys->v = v;
    sys->mem = mem;
    sys->x0 = vd->source->i_x_offset;
    sys->y0 = vd->source->i_y_offset;
    sys->w0 = w;
    sys->h0 = h;
    v->crop_x = v->crop_y = v->crop_w = v->crop_h = 0;

    v->width = w;
    v->height = h;
    v->chroma = describe_colour(&fmt, pick);
    for (unsigned k = 0; k < 3; k++) {
        v->pitch[k] = pitch[k];
        v->lines[k] = lines[k];
    }
    v->sar_num = fmt.i_sar_num ? fmt.i_sar_num : 1;
    v->sar_den = fmt.i_sar_den ? fmt.i_sar_den : 1;
    atomic_store(&v->front, -1);
    atomic_fetch_add(&v->format_gen, 1);

    *fmtp = fmt;
    vd->sys = sys;
    vd->ops = &ops;
    return VLC_SUCCESS;
}

vlc_module_begin()
    set_shortname(N_("WebFrame"))
    set_description(N_("Shared-memory frames for a WebGL page"))
    set_subcategory(SUBCAT_VIDEO_VOUT)
    set_callback_display(Open, 0)
vlc_module_end()
