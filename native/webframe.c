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
#include <unistd.h>

#include <vlc_common.h>
#include <vlc_plugin.h>
#include <vlc_vout_display.h>
#include <vlc_picture.h>

#include "shared.h"

typedef struct
{
    wv_video_t *v;
    uint8_t *mem;
    int idx;       /* buffer filled by prepare(), published by display() */
} vout_display_sys_t;

/* Layout codes shared with renderer.js (low byte of wv_video_t.chroma). */
static const struct {
    vlc_fourcc_t fourcc;
    uint32_t code;
    unsigned bpp, cw, ch, planes;
} LAYOUTS[] = {
    { VLC_CODEC_I420,     0, 1, 2, 2, 3 },
    { VLC_CODEC_I422,     1, 1, 2, 1, 3 },
    { VLC_CODEC_I444,     2, 1, 1, 1, 3 },
    { VLC_CODEC_NV12,     3, 1, 2, 2, 2 },
    { VLC_CODEC_I420_10L, 4, 2, 2, 2, 3 },
    { VLC_CODEC_RGBX,     5, 4, 1, 1, 1 },  /* packed; already RGB */
    { VLC_CODEC_BGRX,     6, 4, 1, 1, 1 },  /* Firefox's hardware frames */
};

static unsigned align_up(unsigned v, unsigned a) { return (v + a - 1) / a * a; }

static uint32_t describe_colour(const video_format_t *f, uint32_t code)
{
    /* bit 8 full range; bits 12-15 matrix (0 BT.601, 1 BT.709, 2 BT.2020);
     * bits 16-19 transfer (0 SDR, 1 PQ, 2 HLG) -- see renderer.js */
    uint32_t matrix;
    switch (f->space) {
    case COLOR_SPACE_BT709:  matrix = 1; break;
    case COLOR_SPACE_BT2020: matrix = 2; break;
    case COLOR_SPACE_BT601:  matrix = 0; break;
    default: /* undefined: the usual convention, by size */
        matrix = f->i_visible_height >= 720 ? 1 : 0;
        break;
    }
    uint32_t transfer = f->transfer == TRANSFER_FUNC_SMPTE_ST2084 ? 1
                      : f->transfer == TRANSFER_FUNC_HLG ? 2 : 0;
    uint32_t full = f->color_range == COLOR_RANGE_FULL ? 1 : 0;
    return code | (full << 8) | (matrix << 12) | (transfer << 16);
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

    picture_resource_t rsc = { .p_sys = NULL };
    for (int k = 0; k < PICTURE_PLANE_MAX; k++) {
        rsc.p[k].p_pixels = v->planes[idx][k < 3 ? k : 0];
        rsc.p[k].i_lines = k < 3 ? v->lines[k] : 0;
        rsc.p[k].i_pitch = k < 3 ? v->pitch[k] : 0;
    }
    picture_t *dst = picture_NewFromResource(vd->fmt, &rsc);
    if (dst != NULL) {
        picture_CopyPixels(dst, pic);
        picture_Release(dst);
    }
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
    atomic_store(&v->front, -1);
    atomic_fetch_add(&v->format_gen, 1);
    /* Let an upload in progress finish before the memory goes away. */
    for (int spin = 0; spin < 100 && atomic_load(&v->reading) >= 0; spin++)
        usleep(1000);
    memset(v->planes, 0, sizeof v->planes);
    free(sys->mem);
    free(sys);
}

static const struct vlc_display_operations ops = {
    .close = Close,
    .prepare = Prepare,
    .display = Display,
};

static int Open(vout_display_t *vd, video_format_t *fmtp, vlc_video_context *context)
{
    (void) context;
    wv_video_t *v = var_InheritAddress(vd, "webframe-data");
    if (v == NULL)
        return VLC_EGENERIC;

    video_format_t fmt;
    video_format_ApplyRotation(&fmt, vd->source);

    unsigned pick = 0; /* anything the shader cannot draw becomes I420 */
    for (unsigned k = 0; k < ARRAY_SIZE(LAYOUTS); k++)
        if (fmt.i_chroma == LAYOUTS[k].fourcc) { pick = k; break; }
    fmt.i_chroma = LAYOUTS[pick].fourcc;

    /* Visible picture only: the core crops for us (as with vmem). */
    unsigned w = fmt.i_visible_width, h = fmt.i_visible_height;
    fmt.i_width = fmt.i_visible_width = w;
    fmt.i_height = fmt.i_visible_height = h;
    fmt.i_x_offset = fmt.i_y_offset = 0;

    const unsigned bpp = LAYOUTS[pick].bpp, cw = LAYOUTS[pick].cw, chh = LAYOUTS[pick].ch;
    const unsigned nplanes = LAYOUTS[pick].planes;
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
        for (unsigned k = 0; k < 3; k++) {
            v->planes[b][k] = base;
            base += (size_t)pitch[k] * lines[k];
        }
    }
    sys->v = v;
    sys->mem = mem;

    v->width = w;
    v->height = h;
    v->chroma = describe_colour(&fmt, LAYOUTS[pick].code);
    for (unsigned k = 0; k < 3; k++) { v->pitch[k] = pitch[k]; v->lines[k] = lines[k]; }
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
    set_shortname("WebFrame")
    set_description("Shared-memory frames for a WebGL page")
    set_subcategory(SUBCAT_VIDEO_VOUT)
    set_callback_display(Open, 0)
vlc_module_end()
