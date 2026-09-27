/*
 * webcodecs: a VLC video decoder backed by the browser's WebCodecs
 * VideoDecoder, i.e. the platform's (usually hardware) H.264/HEVC/VP9/AV1
 * decoders instead of FFmpeg/dav1d compiled to wasm.
 *
 * WebCodecs is asynchronous and lives in a JS event loop, while VLC's decoder
 * threads run C code that never yields to one. So the VideoDecoder lives on
 * the Emscripten main runtime thread (our Worker, which is otherwise idle):
 * this module posts it packets with MAIN_THREAD_ASYNC_EM_ASM and never waits
 * on it except for backpressure, open and drain. Decoded frames are copied
 * straight into wasm memory by VideoFrame.copyTo() on that thread, handed back
 * through wv_wc_push(), and turned into ordinary VLC pictures here, so every
 * video output and filter keeps working.
 *
 * The JS half is Module.wvWc in packages/core/src/engine.js. When the browser
 * cannot decode a stream (or has no WebCodecs, as under Node), Open fails and
 * VLC falls back to avcodec on its own.
 */
#ifdef HAVE_CONFIG_H
# include "config.h"
#endif

#include <emscripten.h>
#include <stdatomic.h>
#include <string.h>

#include <vlc_common.h>
#include <vlc_plugin.h>
#include <vlc_codec.h>
#include <vlc_picture.h>

#define MAX_QUEUED   16   /* decoded frames waiting for the decoder thread */
#define MAX_INFLIGHT 6    /* packets submitted but not yet decoded */

typedef struct
{
    uint8_t *data;       /* malloc'd by JS, freed here */
    vlc_fourcc_t chroma;
    unsigned width, height, planes;
    unsigned offset[4], stride[4];
    int64_t ts;
    int colour; /* bit 0 known, bit 1 full range, bits 4-7 matrix (1 BT.601, 2 BT.709, 3 BT.2020) */
} wc_frame_t;

typedef struct
{
    vlc_mutex_t lock;
    vlc_cond_t  wait;
    wc_frame_t  queue[MAX_QUEUED];
    unsigned    queued;
    int         inflight;
    uint32_t    gen;       /* bumped on every flush; stale frames are dropped */
    int         open_result;  /* 0 pending, 1 ok, -1 failed */
    bool        drained;
    bool        failed;
    bool        need_key;
    bool        verified;  /* the browser has decoded a first frame */
    uint8_t    *xps;       /* Annex B parameter sets for key frames (H.264/HEVC) */
    size_t      xps_size;
    char       *codec;
    vlc_fourcc_t out_chroma;
    unsigned    out_w, out_h;
    int         out_colour;
} decoder_sys_t;

/* --- called from JS, on the runtime thread ------------------------------- */

EMSCRIPTEN_KEEPALIVE void wv_wc_opened(decoder_sys_t *sys, int ok)
{
    vlc_mutex_lock(&sys->lock);
    sys->open_result = ok ? 1 : -1;
    vlc_cond_broadcast(&sys->wait);
    vlc_mutex_unlock(&sys->lock);
}

/* format: 0 I420, 1 NV12, 2 I420P10, 3 I422, 4 I444, 5 RGBX, 6 BGRX */
EMSCRIPTEN_KEEPALIVE void wv_wc_push(decoder_sys_t *sys, uint32_t gen, uint8_t *data,
                                     int format, unsigned w, unsigned h, double ts,
                                     unsigned o0, unsigned s0, unsigned o1, unsigned s1,
                                     unsigned o2, unsigned s2, int colour)
{
    static const vlc_fourcc_t chroma[] = {
        VLC_CODEC_I420, VLC_CODEC_NV12, VLC_CODEC_I420_10L, VLC_CODEC_I422,
        VLC_CODEC_I444, VLC_CODEC_RGBX, VLC_CODEC_BGRX,
    };
    static const unsigned planes[] = { 3, 2, 3, 3, 3, 1, 1 };
    vlc_mutex_lock(&sys->lock);
    if (gen != sys->gen || sys->queued == MAX_QUEUED || format < 0 || format > 6) {
        vlc_mutex_unlock(&sys->lock);
        free(data);
        return;
    }
    wc_frame_t *f = &sys->queue[sys->queued++];
    *f = (wc_frame_t) {
        .data = data, .chroma = chroma[format], .width = w, .height = h,
        .planes = planes[format], .offset = { o0, o1, o2 }, .stride = { s0, s1, s2 },
        .ts = (int64_t)ts, .colour = colour,
    };
    if (sys->inflight > 0)
        sys->inflight--;
    vlc_cond_broadcast(&sys->wait);
    vlc_mutex_unlock(&sys->lock);
}

EMSCRIPTEN_KEEPALIVE void wv_wc_drained(decoder_sys_t *sys, uint32_t gen)
{
    vlc_mutex_lock(&sys->lock);
    if (gen == sys->gen) {
        sys->drained = true;
        sys->inflight = 0;
    }
    vlc_cond_broadcast(&sys->wait);
    vlc_mutex_unlock(&sys->lock);
}

EMSCRIPTEN_KEEPALIVE void wv_wc_error(decoder_sys_t *sys)
{
    vlc_mutex_lock(&sys->lock);
    sys->failed = true;
    vlc_cond_broadcast(&sys->wait);
    vlc_mutex_unlock(&sys->lock);
}

/* --- decoder thread -------------------------------------------------------- */

static void output_frame(decoder_t *dec, wc_frame_t *f)
{
    decoder_sys_t *sys = dec->p_sys;
    if (f->chroma != sys->out_chroma || f->width != sys->out_w || f->height != sys->out_h ||
        f->colour != sys->out_colour) {
        video_format_t *v = &dec->fmt_out.video;
        /* The browser's decoder knows the frame's colour description (a
         * hardware decoder may even hand back full range from a limited
         * stream); trust it over the container's. */
        if (f->colour & 1) {
            v->color_range = (f->colour & 2) ? COLOR_RANGE_FULL : COLOR_RANGE_LIMITED;
            switch ((f->colour >> 4) & 0xf) {
            case 1: v->space = COLOR_SPACE_BT601; break;
            case 2: v->space = COLOR_SPACE_BT709; break;
            case 3: v->space = COLOR_SPACE_BT2020; break;
            default: break;
            }
        }
        sys->out_colour = f->colour;
        dec->fmt_out.i_codec = f->chroma;
        v->i_chroma = f->chroma;
        v->i_width = v->i_visible_width = f->width;
        v->i_height = v->i_visible_height = f->height;
        v->i_x_offset = v->i_y_offset = 0;
        if (!v->i_sar_num || !v->i_sar_den) {
            v->i_sar_num = dec->fmt_in->video.i_sar_num ? dec->fmt_in->video.i_sar_num : 1;
            v->i_sar_den = dec->fmt_in->video.i_sar_den ? dec->fmt_in->video.i_sar_den : 1;
        }
        if (decoder_UpdateVideoFormat(dec) != 0) {
            msg_Err(dec, "cannot set up output for %4.4s %ux%u", (char *)&f->chroma, f->width, f->height);
            free(f->data);
            return;
        }
        sys->out_chroma = f->chroma;
        sys->out_w = f->width;
        sys->out_h = f->height;
    }

    picture_t *pic = decoder_NewPicture(dec);
    if (pic == NULL) {
        free(f->data);
        return;
    }
    for (unsigned k = 0; k < f->planes && k < (unsigned)pic->i_planes; k++) {
        plane_t *p = &pic->p[k];
        const uint8_t *src = f->data + f->offset[k];
        unsigned rows = p->i_visible_lines;
        unsigned bytes = __MIN((unsigned)p->i_visible_pitch, f->stride[k]);
        for (unsigned y = 0; y < rows; y++)
            memcpy(p->p_pixels + (size_t)y * p->i_pitch, src + (size_t)y * f->stride[k], bytes);
    }
    free(f->data);
    pic->date = f->ts;
    pic->b_progressive = true;
    decoder_QueueVideo(dec, pic);
}

/* Moves decoded frames out from under the lock and queues them. */
static void output_ready(decoder_t *dec)
{
    decoder_sys_t *sys = dec->p_sys;
    wc_frame_t ready[MAX_QUEUED];
    vlc_mutex_lock(&sys->lock);
    unsigned n = sys->queued;
    memcpy(ready, sys->queue, n * sizeof(*ready));
    sys->queued = 0;
    vlc_mutex_unlock(&sys->lock);
    for (unsigned k = 0; k < n; k++)
        output_frame(dec, &ready[k]);
}

/* Copies a packet for JS. In Annex B mode, key frames get the parameter sets
 * from p_extra prepended: a VideoDecoder only recognises a key frame that
 * carries them in-band. */
static uint8_t *packet_copy(decoder_t *dec, const block_t *block, bool key, size_t *size)
{
    decoder_sys_t *sys = dec->p_sys;
    size_t extra = key ? sys->xps_size : 0;
    uint8_t *buf = malloc(extra + block->i_buffer);
    if (buf == NULL)
        return NULL;
    if (extra)
        memcpy(buf, sys->xps, extra);
    memcpy(buf + extra, block->p_buffer, block->i_buffer);
    *size = extra + block->i_buffer;
    return buf;
}

static int Decode(decoder_t *dec, block_t *block)
{
    decoder_sys_t *sys = dec->p_sys;

    if (block == NULL) {
        /* Drain: flush the VideoDecoder, then hand over everything it had. */
        vlc_mutex_lock(&sys->lock);
        sys->drained = false;
        uint32_t gen = sys->gen;
        vlc_mutex_unlock(&sys->lock);
        MAIN_THREAD_ASYNC_EM_ASM({ Module["wvWc"].drain($0, $1); }, sys, gen);
        vlc_tick_t deadline = vlc_tick_now() + VLC_TICK_FROM_SEC(5);
        vlc_mutex_lock(&sys->lock);
        while (!sys->drained && !sys->failed)
            if (vlc_cond_timedwait(&sys->wait, &sys->lock, deadline))
                break;
        vlc_mutex_unlock(&sys->lock);
        output_ready(dec);
        return VLCDEC_SUCCESS;
    }

    if (sys->failed) {
        /* Hand the stream to the next decoder (avcodec, dav1d): mark this
         * ES so Open refuses it, and leave the block untouched for it. */
        msg_Warn(dec, "WebCodecs failed on %s, falling back", sys->codec);
        var_Create(dec, "webcodecs-failed", VLC_VAR_VOID);
        return VLCDEC_RELOAD;
    }
    if (block->i_flags & BLOCK_FLAG_CORRUPTED) {
        block_Release(block);
        return VLCDEC_SUCCESS;
    }
    bool key = (block->i_flags & BLOCK_FLAG_TYPE_I) != 0;
    /* A VideoDecoder rejects anything but a key frame after configure/reset.
     * Packetizers do not flag key frames for every codec; after the first
     * packet we stop insisting and let the decoder judge. */
    if (sys->need_key && !key && dec->fmt_in->i_codec != VLC_CODEC_VP9 &&
        dec->fmt_in->i_codec != VLC_CODEC_AV1) {
        block_Release(block);
        return VLCDEC_SUCCESS;
    }
    if (sys->need_key)
        key = true;
    sys->need_key = false;

    vlc_tick_t ts = block->i_pts != VLC_TICK_INVALID ? block->i_pts : block->i_dts;

    if (!sys->verified) {
        /* isConfigSupported() can say yes to a stream the platform decoder
         * then rejects (Chromium without proprietary codecs does for H.264).
         * Try the first key frame on a throwaway VideoDecoder -- flushing the
         * real one would make it demand another key frame -- and fall back
         * with this very block untouched if no picture comes out. */
        size_t probe_size;
        uint8_t *probe = packet_copy(dec, block, true, &probe_size);
        if (probe == NULL) {
            block_Release(block);
            return VLCDEC_SUCCESS;
        }
        vlc_mutex_lock(&sys->lock);
        sys->open_result = 0;
        vlc_mutex_unlock(&sys->lock);
        MAIN_THREAD_ASYNC_EM_ASM({ Module["wvWc"].verify($0, $1, $2, $3); },
                                 sys, probe, (int)probe_size, (double)ts);
        vlc_tick_t until = vlc_tick_now() + VLC_TICK_FROM_SEC(2);
        vlc_mutex_lock(&sys->lock);
        while (sys->open_result == 0)
            if (vlc_cond_timedwait(&sys->wait, &sys->lock, until))
                break;
        bool ok = sys->open_result == 1;
        vlc_mutex_unlock(&sys->lock);
        if (!ok) {
            msg_Warn(dec, "WebCodecs produced no picture for %s, falling back", sys->codec);
            var_Create(dec, "webcodecs-failed", VLC_VAR_VOID);
            return VLCDEC_RELOAD; /* the same block goes to the next decoder */
        }
        sys->verified = true;
    }

    size_t size;
    uint8_t *copy = packet_copy(dec, block, key, &size);
    if (copy == NULL) {
        block_Release(block);
        return VLCDEC_SUCCESS;
    }

    vlc_mutex_lock(&sys->lock);
    sys->inflight++;
    uint32_t gen = sys->gen;
    vlc_mutex_unlock(&sys->lock);
    MAIN_THREAD_ASYNC_EM_ASM({ Module["wvWc"].decode($0, $1, $2, $3, $4, $5); },
                             sys, gen, copy, (int)size, (double)ts, key);
    block_Release(block);

    /* Backpressure: the browser decodes ahead happily, but VLC's clock and
     * picture pool expect a decoder to keep only a handful of frames. */
    vlc_mutex_lock(&sys->lock);
    vlc_tick_t deadline = vlc_tick_now() + VLC_TICK_FROM_MS(500);
    while (sys->inflight > MAX_INFLIGHT && !sys->failed && sys->queued == 0)
        if (vlc_cond_timedwait(&sys->wait, &sys->lock, deadline))
            break;
    vlc_mutex_unlock(&sys->lock);

    output_ready(dec);
    return sys->failed ? VLCDEC_ECRITICAL : VLCDEC_SUCCESS;
}

static void Flush(decoder_t *dec)
{
    decoder_sys_t *sys = dec->p_sys;
    vlc_mutex_lock(&sys->lock);
    sys->gen++;
    uint32_t gen = sys->gen;
    for (unsigned k = 0; k < sys->queued; k++)
        free(sys->queue[k].data);
    sys->queued = 0;
    sys->inflight = 0;
    sys->need_key = true;
    vlc_mutex_unlock(&sys->lock);
    MAIN_THREAD_ASYNC_EM_ASM({ Module["wvWc"].reset($0, $1); }, sys, gen);
}

/* WebCodecs codec strings. Profile and level only have to be plausible:
 * support is decided on the codec family and the decoder reads the real
 * parameters from the stream. */
static char *codec_string(const es_format_t *fmt)
{
    char *s = NULL;
    int profile = fmt->i_profile, level = fmt->i_level;
    switch (fmt->i_codec) {
    case VLC_CODEC_H264:
        if (profile <= 0) profile = 100;
        if (level <= 0) level = 51;
        if (asprintf(&s, "avc1.%02X00%02X", profile & 0xff, level & 0xff) < 0) s = NULL;
        break;
    case VLC_CODEC_HEVC:
        if (profile <= 0) profile = 1;
        if (level <= 0) level = 153;
        if (asprintf(&s, "hev1.%d.%d.L%d.B0", profile, profile == 2 ? 4 : 6, level) < 0) s = NULL;
        break;
    case VLC_CODEC_VP9:
        if (profile < 0) profile = 0;
        if (asprintf(&s, "vp09.%02d.51.%s", profile, profile >= 2 ? "10" : "08") < 0) s = NULL;
        break;
    case VLC_CODEC_AV1:
        if (profile < 0) profile = 0;
        if (asprintf(&s, "av01.%d.15M.08", profile) < 0) s = NULL;
        break;
    default:
        break;
    }
    return s;
}

static int Open(vlc_object_t *obj)
{
    decoder_t *dec = (decoder_t *)obj;
    if (!var_InheritBool(dec, "webcodecs") || var_Type(dec, "webcodecs-failed") != 0)
        return VLC_EGENERIC;
    char *codec = codec_string(dec->fmt_in);
    if (codec == NULL)
        return VLC_EGENERIC;

    decoder_sys_t *sys = calloc(1, sizeof(*sys));
    if (unlikely(sys == NULL)) {
        free(codec);
        return VLC_ENOMEM;
    }
    vlc_mutex_init(&sys->lock);
    vlc_cond_init(&sys->wait);
    sys->codec = codec;
    sys->need_key = true;
    dec->p_sys = sys;

    /* Two bitstream shapes reach an H.264/HEVC decoder in VLC 4. From MP4 and
     * Matroska: length-prefixed NAL units with avcC/hvcC in p_extra, which is
     * exactly WebCodecs' "AVC/HEVC format": pass it as the description and
     * send blocks untouched. From TS/ES: Annex B, where p_extra (if any) holds
     * start-code-prefixed parameter sets to repeat in front of key frames. */
    const es_format_t *in = dec->fmt_in;
    const void *description = NULL;
    size_t description_size = 0;
    if ((in->i_codec == VLC_CODEC_H264 || in->i_codec == VLC_CODEC_HEVC) && in->i_extra > 4) {
        const uint8_t *e = in->p_extra;
        if (e[0] == 1) {
            description = e;
            description_size = in->i_extra;
        } else if (e[0] == 0 && e[1] == 0 && (e[2] == 1 || (e[2] == 0 && e[3] == 1))) {
            sys->xps = malloc(in->i_extra);
            if (sys->xps) { memcpy(sys->xps, e, in->i_extra); sys->xps_size = in->i_extra; }
        }
    }

    const video_format_t *v = &dec->fmt_in->video;
    MAIN_THREAD_ASYNC_EM_ASM({ Module["wvWc"].open($0, UTF8ToString($1), $2, $3, $4, $5); },
                             sys, codec, v->i_width, v->i_height, description, (int)description_size);
    vlc_tick_t deadline = vlc_tick_now() + VLC_TICK_FROM_SEC(3);
    vlc_mutex_lock(&sys->lock);
    while (sys->open_result == 0)
        if (vlc_cond_timedwait(&sys->wait, &sys->lock, deadline))
            break;
    int result = sys->open_result;
    vlc_mutex_unlock(&sys->lock);
    if (result != 1) {
        msg_Dbg(dec, "WebCodecs cannot decode %s here", codec);
        free(codec);
        free(sys->xps);
        /* If JS never answered it may still call back: let it free sys. */
        MAIN_THREAD_ASYNC_EM_ASM({ Module["wvWc"].close($0, $1); }, sys, result == 0);
        if (result != 0)
            free(sys);
        return VLC_EGENERIC;
    }
    msg_Dbg(dec, "decoding %s with WebCodecs", codec);

    es_format_Copy(&dec->fmt_out, dec->fmt_in);
    dec->fmt_out.i_cat = VIDEO_ES;
    dec->pf_decode = Decode;
    dec->pf_flush = Flush;
    return VLC_SUCCESS;
}

static void Close(vlc_object_t *obj)
{
    decoder_t *dec = (decoder_t *)obj;
    decoder_sys_t *sys = dec->p_sys;
    vlc_mutex_lock(&sys->lock);
    sys->gen++; /* anything still in flight is dropped by wv_wc_push */
    for (unsigned k = 0; k < sys->queued; k++)
        free(sys->queue[k].data);
    sys->queued = 0;
    vlc_mutex_unlock(&sys->lock);
    /* The JS side keeps its record until close() runs there, and wv_wc_push
     * checks the generation, so sys must outlive any callback in flight: it is
     * freed by JS once the VideoDecoder is closed. */
    MAIN_THREAD_ASYNC_EM_ASM({ Module["wvWc"].close($0, true); }, sys);
    free(sys->codec);
    free(sys->xps);
}

EMSCRIPTEN_KEEPALIVE void wv_wc_free(decoder_sys_t *sys)
{
    free(sys);
}

vlc_module_begin()
    set_shortname("WebCodecs")
    set_description("WebCodecs (browser / hardware) video decoder")
    set_capability("video decoder", 20000) /* above dav1d (10000) and avcodec */
    set_subcategory(SUBCAT_INPUT_VCODEC)
    add_bool("webcodecs", true, "Use WebCodecs",
             "Decode H.264, HEVC, VP9 and AV1 with the browser's decoders when it can.")
    set_callbacks(Open, Close)
vlc_module_end()
