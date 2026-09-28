/*****************************************************************************
 * bridge.c: the libvlc API as called from JavaScript
 *****************************************************************************
 * Copyright (C) 2026 Lucas Gelfond
 *
 * SPDX-License-Identifier: MIT
 * See LICENSE at the root of the libvlc-wasm repository. Linked into VLC,
 * which is (L)GPL, the resulting binary is distributed under the GPL.
 *****************************************************************************/

/*
 * The C side of libvlc-wasm: every libvlc call the JavaScript API makes lands
 * here.
 *
 * Threading is the whole design. The Emscripten runtime's main thread is our
 * Web Worker, and that thread is also where every filesystem syscall from
 * VLC's pthreads is proxied to (WORKERFS reads File objects with
 * FileReaderSync, which only that thread holds). If a libvlc call ran there and
 * blocked on, say, the input thread, while the input thread waited on a proxied
 * read, both would wait forever. So libvlc is only ever called from one
 * dedicated control pthread: JS enqueues a wv_call_t, the control thread runs
 * it, and completion is posted back to the runtime thread asynchronously.
 *
 * VLC's own threads report events the same way, with MAIN_THREAD_ASYNC_EM_ASM,
 * which never blocks the caller.
 */
#ifdef HAVE_CONFIG_H
# include "config.h"
#endif

#include <emscripten.h>
#include <emscripten/threading.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>
#include <unistd.h>

#include <vlc/vlc.h>

/* VLC's internal variable API: see api_player_new (selecting our vout). */
#include <vlc_common.h>
#include <vlc_variables.h>
#include <vlc_window.h>
#include <vlc_mouse.h>

#include "json.h"
#include "shared.h"

/* ------------------------------------------------------------------------ */
/* RPC                                                                       */

typedef struct wv_call
{
    int32_t req;
    int32_t fn;
    int32_t i[6];
    double d[2];
    char *s[3];         /* owned by the call; freed after it runs */
    int32_t deferred;   /* set by an api function that completes later */
    int32_t ret_i;
    double ret_d;
    char *ret_s;        /* malloc'd here, freed by JS */
    struct wv_call *next;
} wv_call_t;

static pthread_mutex_t queue_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t queue_wait = PTHREAD_COND_INITIALIZER;
static wv_call_t *queue_head, *queue_tail;
static pthread_t control_thread;
static atomic_bool control_started;
#define CONTROL_STACK (1 << 20) /* libvlc calls nest deeply (open, parse) */

static void complete(wv_call_t *c)
{
    for (int k = 0; k < 3; k++) { free(c->s[k]); c->s[k] = NULL; }
    MAIN_THREAD_ASYNC_EM_ASM({ Module["wvDone"]($0); }, c);
}

/* Posted from any VLC thread; `str` is copied and freed by JS. */
static void emit(int player, int type, double a, double b, const char *str)
{
    char *copy = str ? strdup(str) : NULL;
    MAIN_THREAD_ASYNC_EM_ASM({ Module["wvEvent"]($0, $1, $2, $3, $4); },
                             player, type, a, b, copy);
}

enum {
    EV_STATE = 1, EV_BUFFERING, EV_POSITION, EV_LENGTH, EV_TRACKS,
    EV_TRACK_SELECTED, EV_RATE, EV_CAPS, EV_VOUT, EV_STOPPING, EV_META,
    EV_CHAPTER, EV_TITLES, EV_VOLUME, EV_MUTE, EV_PARSED, EV_MEDIA_CHANGED,
    EV_RECORDING, EV_PROGRAMS, EV_NEXT_FRAME, EV_PERF,
    EV_LOG = 100,
};

/* ------------------------------------------------------------------------ */
/* Instance                                                                  */

typedef struct
{
    libvlc_instance_t *vlc;
    libvlc_parser_t *parser;
    atomic_int log_level; /* LIBVLC_DEBUG=0 .. LIBVLC_ERROR=4; above = off */
} wv_instance_t;

static void on_log(void *data, int level, const libvlc_log_t *ctx,
                   const char *fmt, va_list ap)
{
    wv_instance_t *wi = data;
    if (level < atomic_load(&wi->log_level))
        return;
    const char *module = NULL, *file = NULL, *name = NULL, *header = NULL;
    uintptr_t id;
    unsigned line;
    libvlc_log_get_context(ctx, &module, &file, &line);
    libvlc_log_get_object(ctx, &name, &header, &id);
    char msg[1024];
    int n = snprintf(msg, sizeof msg, "%s %s: ", module ? module : "?", name ? name : "");
    if (n < 0 || n >= (int)sizeof msg) n = 0;
    vsnprintf(msg + n, sizeof msg - n, fmt, ap);
    emit(0, EV_LOG, level, 0, msg);
}

/* ------------------------------------------------------------------------ */
/* Player                                                                    */

typedef struct
{
    int id;
    libvlc_media_player_t *mp;
    wv_instance_t *inst;
    wv_ring_t ring;
    wv_video_t video;
    wv_window_t window;
    /* Performance readout (EV_PERF), sampled from the time callbacks. */
    wv_decode_stats_t webcodecs;  /* filled by webcodecs.c */
    pthread_mutex_t media_lock;   /* guards media */
    libvlc_media_t *media;        /* the current media, for its statistics */
    pthread_mutex_t perf_lock;    /* guards the rest; taken with trylock */
    _Atomic libvlc_time_t perf_date;
    atomic_bool perf_reset;       /* a new media: take a new baseline */
    libvlc_media_stats_t perf_stats;
    uint64_t perf_wc_busy, perf_wc_frames, perf_wc_base_busy, perf_wc_base_frames;
} wv_player_t;

/* --- audio: selected webaudio module reads p->ring through "amem-data" ------ */

static void audio_unused_play(void *data, const void *samples, unsigned count, int64_t pts)
{
    (void) data; (void) samples; (void) count; (void) pts;
}

/* --- player events ---------------------------------------------------------- */

static void on_state(void *o, libvlc_state_t s) { emit(((wv_player_t *)o)->id, EV_STATE, s, 0, NULL); }
static void on_buffering(void *o, float b) { emit(((wv_player_t *)o)->id, EV_BUFFERING, b, 0, NULL); }
static void on_rate(void *o, float r) { emit(((wv_player_t *)o)->id, EV_RATE, r, 0, NULL); }
static void on_caps(void *o, libvlc_capability_t old, libvlc_capability_t caps)
{ (void) old; emit(((wv_player_t *)o)->id, EV_CAPS, caps, 0, NULL); }
/* About once a second while playing: what decoding cost, over the last
 * interval and since the media started. The page turns it into rates. Run
 * from the clock's time updates and from the input thread's position reports
 * (on_position): either can stop coming while the other goes on (a DVD menu
 * has no clock, some demuxers report no position). A report waits until the
 * statistics have moved, so none come while paused. */
#define PERF_PERIOD_US 1000000
static void perf_sample(wv_player_t *p)
{
    libvlc_time_t now = libvlc_clock();
    if (now - p->perf_date < PERF_PERIOD_US || pthread_mutex_trylock(&p->perf_lock) != 0)
        return;
    if (now - p->perf_date < PERF_PERIOD_US) {
        pthread_mutex_unlock(&p->perf_lock);
        return;
    }
    pthread_mutex_lock(&p->media_lock);
    libvlc_media_t *m = p->media ? libvlc_media_retain(p->media) : NULL;
    pthread_mutex_unlock(&p->media_lock);
    libvlc_media_stats_t st;
    bool ok = m != NULL && libvlc_media_get_stats(m, &st);
    if (m != NULL)
        libvlc_media_release(m);
    const libvlc_media_stats_t *o = &p->perf_stats;
    if (ok && (st.i_decoded_video != o->i_decoded_video || st.i_decoded_audio != o->i_decoded_audio)) {
        uint64_t wc_busy = atomic_load(&p->webcodecs.busy_us);
        uint64_t wc_frames = atomic_load(&p->webcodecs.frames);
        /* A new media starts its counters from zero: its first report only
         * takes the baseline. */
        bool fresh = !atomic_exchange(&p->perf_reset, false) && p->perf_date != 0 &&
                     st.i_decoded_video >= o->i_decoded_video &&
                     st.i_decode_video_frames >= o->i_decode_video_frames &&
                     st.i_decoded_audio >= o->i_decoded_audio;
        if (fresh) {
            json_t j = {0};
            json_obj(&j);
            json_knum(&j, "interval", (now - p->perf_date) / 1e6);
            json_knum(&j, "videoFrames", st.i_decode_video_frames - o->i_decode_video_frames);
            json_knum(&j, "videoUs", st.i_decode_video_time_us - o->i_decode_video_time_us);
            json_knum(&j, "videoFramesTotal", st.i_decode_video_frames);
            json_knum(&j, "videoUsTotal", st.i_decode_video_time_us);
            json_knum(&j, "audioBlocks", st.i_decode_audio_blocks - o->i_decode_audio_blocks);
            json_knum(&j, "audioUs", st.i_decode_audio_time_us - o->i_decode_audio_time_us);
            json_knum(&j, "decoded", st.i_decoded_video - o->i_decoded_video);
            json_knum(&j, "displayed", st.i_displayed_pictures - o->i_displayed_pictures);
            json_knum(&j, "late", st.i_late_pictures - o->i_late_pictures);
            json_knum(&j, "lost", st.i_lost_pictures - o->i_lost_pictures);
            json_knum(&j, "audioLost", st.i_lost_abuffers - o->i_lost_abuffers);
            json_kbool(&j, "webcodecs", atomic_load(&p->webcodecs.active) > 0);
            json_knum(&j, "webcodecsFrames", wc_frames - p->perf_wc_frames);
            json_knum(&j, "webcodecsUs", wc_busy - p->perf_wc_busy);
            json_knum(&j, "webcodecsFramesTotal", wc_frames - p->perf_wc_base_frames);
            json_knum(&j, "webcodecsUsTotal", wc_busy - p->perf_wc_base_busy);
            json_end_obj(&j);
            char *s = json_take(&j);
            emit(p->id, EV_PERF, 0, 0, s);
            free(s);
        } else {
            /* The baseline. The media's own counters start from zero, so its
             * totals keep what came before (opening, filling the buffers);
             * WebCodecs' are the player's, and start from the last report. */
            p->perf_wc_base_busy = p->perf_wc_busy;
            p->perf_wc_base_frames = p->perf_wc_frames;
        }
        p->perf_stats = st;
        p->perf_wc_busy = wc_busy;
        p->perf_wc_frames = wc_frames;
        p->perf_date = now;
    }
    pthread_mutex_unlock(&p->perf_lock);
}

/* Time comes from the player's clock (libvlc_media_player_watch_time), not
 * on_position_changed: that also relays what demuxers answer DEMUX_GET_TIME
 * with, which for some is their read position -- libbluray's runs half a
 * second ahead of the picture -- so the two sources made time jump back and
 * forth. The page interpolates between points. */
static void on_time_update(void *o, const libvlc_media_player_time_point_t *v)
{
    perf_sample(o);
    libvlc_time_t ts;
    double pos;
    /* Interpolated to now: a point can be dated in the past or future (the
     * picture it belongs to), and just after a rate change it runs at the
     * new rate from its own date. Points from before the demuxer's normal
     * time was known are negative. */
    if (libvlc_media_player_time_point_interpolate(v, libvlc_clock(), &ts, &pos) != 0 || ts < 0)
        return;
    emit(((wv_player_t *)o)->id, EV_POSITION, (double)ts, pos, NULL);
}
static void on_time_paused(void *o, libvlc_time_t system_date_us)
{ (void) o; (void) system_date_us; }
static void on_time_seek(void *o, const libvlc_media_player_time_point_t *v)
{
    if (v != NULL && v->ts_us >= 0)
        emit(((wv_player_t *)o)->id, EV_POSITION, (double)v->ts_us, v->position, NULL);
}
static const struct libvlc_media_player_watch_time_cbs time_cbs = {
    .version = 0,
    .on_update = on_time_update,
    .on_paused = on_time_paused,
    .on_seek = on_time_seek,
};
#define TIME_PERIOD_US 100000 /* at most 10 updates a second */
/* Not used for time (see on_time_update), only as the input thread's tick. */
static void on_position(void *o, libvlc_time_t t, double pos)
{ (void) t; (void) pos; perf_sample(o); }
static void on_length(void *o, libvlc_time_t len) { emit(((wv_player_t *)o)->id, EV_LENGTH, (double)len, 0, NULL); }
static void on_tracks(void *o, libvlc_list_action_t a, libvlc_track_type_t t, const char *id)
{ emit(((wv_player_t *)o)->id, EV_TRACKS, a, t, id); }
static void on_track_selected(void *o, libvlc_track_type_t t, const char *un, const char *sel)
{ (void) un; emit(((wv_player_t *)o)->id, EV_TRACK_SELECTED, t, 0, sel); }
static void on_titles(void *o) { emit(((wv_player_t *)o)->id, EV_TITLES, 0, 0, NULL); }
/* A DVD's scenes menu jumps straight into a chapter of another title: VLC
 * then reports a new title, and the chapter event that follows can still
 * carry the menu's title index. The page refetches the list, which says
 * which title is current (and so whether a menu is showing). */
static void on_title_selected(void *o, const libvlc_title_description_t *t, unsigned idx)
{ (void) t; (void) idx; emit(((wv_player_t *)o)->id, EV_TITLES, 0, 0, NULL); }
/* `c` is not read: the player can report a chapter the title's list does not
 * have (a Blu-ray going from a title back to its menu announces the menu with
 * the old title's chapter), and then it points past the list -- VLC only
 * asserts the index -- so its name was a wild pointer. The page names the
 * chapter from the list it fetches, which is bounds-checked. */
static void on_chapter(void *o, const libvlc_title_description_t *t, unsigned ti,
                       const libvlc_chapter_description_t *c, unsigned ci)
{ (void) t; (void) c; emit(((wv_player_t *)o)->id, EV_CHAPTER, ti, ci, NULL); }
static void on_vout(void *o, unsigned n) { emit(((wv_player_t *)o)->id, EV_VOUT, n, 0, NULL); }
static void on_stopping(void *o, libvlc_media_t *m, libvlc_stopping_reason_t r)
{ (void) m; emit(((wv_player_t *)o)->id, EV_STOPPING, r, 0, NULL); }
static void on_meta(void *o, libvlc_media_t *m) { (void) m; emit(((wv_player_t *)o)->id, EV_META, 0, 0, NULL); }
static void on_parsed(void *o, libvlc_media_t *m) { (void) m; emit(((wv_player_t *)o)->id, EV_PARSED, 0, 0, NULL); }
static void on_media_changed(void *o, libvlc_media_t *m)
{
    wv_player_t *p = o;
    if (m != NULL)
        libvlc_media_retain(m);
    pthread_mutex_lock(&p->media_lock);
    libvlc_media_t *old = p->media;
    p->media = m;
    pthread_mutex_unlock(&p->media_lock);
    atomic_store(&p->perf_reset, true);
    if (old != NULL)
        libvlc_media_release(old);
    emit(p->id, EV_MEDIA_CHANGED, 0, 0, NULL);
}
static void on_volume(void *o, float v) { emit(((wv_player_t *)o)->id, EV_VOLUME, v, 0, NULL); }
static void on_mute(void *o, bool m) { emit(((wv_player_t *)o)->id, EV_MUTE, m, 0, NULL); }
static void on_recording(void *o, bool rec, const char *path)
{ emit(((wv_player_t *)o)->id, EV_RECORDING, rec, 0, path); }
static void on_programs(void *o, libvlc_list_action_t a, int id)
{ emit(((wv_player_t *)o)->id, EV_PROGRAMS, a, id, NULL); }
static void on_program_selected(void *o, int un, int sel)
{ (void) un; emit(((wv_player_t *)o)->id, EV_PROGRAMS, -1, sel, NULL); }
static void on_next_frame(void *o, int status) { emit(((wv_player_t *)o)->id, EV_NEXT_FRAME, status, 0, NULL); }

static const struct libvlc_media_player_cbs player_cbs = {
    .version = 0,
    .on_media_changed = on_media_changed,
    .on_media_stopping = on_stopping,
    .on_state_changed = on_state,
    .on_buffering_changed = on_buffering,
    .on_rate_changed = on_rate,
    .on_capabilities_changed = on_caps,
    .on_position_changed = on_position,
    .on_length_changed = on_length,
    .on_track_list_changed = on_tracks,
    .on_track_selection_changed = on_track_selected,
    .on_titles_changed = on_titles,
    .on_title_selection_changed = on_title_selected,
    .on_chapter_selection_changed = on_chapter,
    .on_media_parsed = on_parsed,
    .on_media_meta_changed = on_meta,
    .on_vout_changed = on_vout,
    .on_audio_volume_changed = on_volume,
    .on_audio_mute_changed = on_mute,
    .on_recording_changed = on_recording,
    .on_program_list_changed = on_programs,
    .on_program_selection_changed = on_program_selected,
    .on_next_frame_status = on_next_frame,
    .on_prev_frame_status = on_next_frame,
};

/* ------------------------------------------------------------------------ */
/* JSON views                                                                */

static const char *const meta_names[] = {
    "title", "artist", "genre", "copyright", "album", "trackNumber",
    "description", "rating", "date", "setting", "url", "language",
    "nowPlaying", "publisher", "encodedBy", "artworkUrl", "trackId",
    "trackTotal", "director", "season", "episode", "showName", "actors",
    "albumArtist", "discNumber", "discTotal", "compilation",
};

static void fourcc_str(uint32_t fcc, char out[5])
{
    for (int k = 0; k < 4; k++) {
        char c = (char)((fcc >> (8 * k)) & 0xff);
        out[k] = (c >= 32 && c < 127) ? c : ' ';
    }
    out[4] = '\0';
}

static const char *type_name(libvlc_track_type_t t)
{
    switch (t) {
    case libvlc_track_audio: return "audio";
    case libvlc_track_video: return "video";
    case libvlc_track_text: return "text";
    default: return "unknown";
    }
}

static void track_json(json_t *j, const libvlc_media_track_t *t)
{
    char fcc[5];
    json_obj(j);
    json_kstr(j, "id", t->psz_id);
    json_kstr(j, "type", type_name(t->i_type));
    fourcc_str(t->i_codec, fcc);
    json_kstr(j, "codec", fcc);
    json_kstr(j, "codecName", libvlc_media_get_codec_description(t->i_type, t->i_codec));
    if (t->i_original_fourcc) { fourcc_str(t->i_original_fourcc, fcc); json_kstr(j, "fourcc", fcc); }
    json_kstr(j, "name", t->psz_name);
    json_kstr(j, "language", t->psz_language);
    json_kstr(j, "description", t->psz_description);
    json_kbool(j, "selected", t->selected);
    if (t->i_bitrate) json_knum(j, "bitrate", t->i_bitrate);
    if (t->i_profile > 0) json_knum(j, "profile", t->i_profile);
    if (t->i_level > 0) json_knum(j, "level", t->i_level);
    switch (t->i_type) {
    case libvlc_track_video:
        json_knum(j, "width", t->u.video->i_width);
        json_knum(j, "height", t->u.video->i_height);
        if (t->u.video->i_sar_num && t->u.video->i_sar_den) {
            json_knum(j, "sarNum", t->u.video->i_sar_num);
            json_knum(j, "sarDen", t->u.video->i_sar_den);
        }
        if (t->u.video->i_frame_rate_den)
            json_knum(j, "fps", (double)t->u.video->i_frame_rate_num / t->u.video->i_frame_rate_den);
        json_knum(j, "orientation", t->u.video->i_orientation);
        json_knum(j, "projection", t->u.video->i_projection);
        break;
    case libvlc_track_audio:
        json_knum(j, "channels", t->u.audio->i_channels);
        json_knum(j, "rate", t->u.audio->i_rate);
        break;
    case libvlc_track_text:
        if (t->u.subtitle) json_kstr(j, "encoding", t->u.subtitle->psz_encoding);
        break;
    default: break;
    }
    json_end_obj(j);
}

static void tracklist_json(json_t *j, libvlc_media_tracklist_t *list)
{
    if (!list) return;
    for (size_t k = 0; k < libvlc_media_tracklist_count(list); k++)
        track_json(j, libvlc_media_tracklist_at(list, k));
    libvlc_media_tracklist_delete(list);
}

static void meta_json(json_t *j, libvlc_media_t *m)
{
    json_kobj(j, "meta");
    for (unsigned k = 0; k < sizeof meta_names / sizeof *meta_names; k++) {
        char *v = libvlc_media_get_meta(m, (libvlc_meta_t)k);
        if (v && *v) json_kstr(j, meta_names[k], v);
        free(v);
    }
    json_end_obj(j);
}

static char *media_json(libvlc_media_t *m, int status)
{
    json_t j = {0};
    json_obj(&j);
    if (status >= 0) json_knum(&j, "status", status);
    char *mrl = libvlc_media_get_mrl(m);
    json_kstr(&j, "mrl", mrl);
    free(mrl);
    libvlc_time_t dur = libvlc_media_get_duration(m);
    if (dur >= 0) json_knum(&j, "duration", dur / 1e6);
    meta_json(&j, m);
    json_karr(&j, "tracks");
    tracklist_json(&j, libvlc_media_get_tracklist(m, libvlc_track_video));
    tracklist_json(&j, libvlc_media_get_tracklist(m, libvlc_track_audio));
    tracklist_json(&j, libvlc_media_get_tracklist(m, libvlc_track_text));
    json_end_arr(&j);
    libvlc_media_stats_t st;
    if (libvlc_media_get_stats(m, &st)) {
        json_kobj(&j, "stats");
        json_knum(&j, "readBytes", st.i_read_bytes);
        json_knum(&j, "inputBitrate", st.f_input_bitrate);
        json_knum(&j, "demuxReadBytes", st.i_demux_read_bytes);
        json_knum(&j, "demuxBitrate", st.f_demux_bitrate);
        json_knum(&j, "demuxCorrupted", st.i_demux_corrupted);
        json_knum(&j, "demuxDiscontinuity", st.i_demux_discontinuity);
        json_knum(&j, "decodedVideo", st.i_decoded_video);
        json_knum(&j, "decodedAudio", st.i_decoded_audio);
        json_knum(&j, "displayedPictures", st.i_displayed_pictures);
        json_knum(&j, "latePictures", st.i_late_pictures);
        json_knum(&j, "lostPictures", st.i_lost_pictures);
        json_knum(&j, "playedAudioBuffers", st.i_played_abuffers);
        json_knum(&j, "lostAudioBuffers", st.i_lost_abuffers);
        json_end_obj(&j);
    }
    json_end_obj(&j);
    return json_take(&j);
}

/* ------------------------------------------------------------------------ */
/* API: each takes a call, reads its args, writes ret_*.                    */

#define P ((wv_player_t *)(intptr_t)c->i[0])
#define MP (P->mp)

static void api_version(wv_call_t *c)
{
    json_t j = {0};
    json_obj(&j);
    json_kstr(&j, "version", libvlc_get_version());
    json_kstr(&j, "compiler", libvlc_get_compiler());
    json_kstr(&j, "changeset", libvlc_get_changeset());
#ifndef WV_HAS_SOUT
# define WV_HAS_SOUT 0
#endif
    json_kobj(&j, "features");
    json_kbool(&j, "sout", WV_HAS_SOUT); /* transcode, remux, recording */
    json_end_obj(&j);
    json_end_obj(&j);
    c->ret_s = json_take(&j);
}

/* s0: arguments separated by '\n' */
static void api_instance_new(wv_call_t *c)
{
    const char *argv[64];
    int argc = 0;
    char *args = c->s[0], *save = NULL;
    for (char *a = args ? strtok_r(args, "\n", &save) : NULL; a && argc < 64;
         a = strtok_r(NULL, "\n", &save))
        argv[argc++] = a;

    wv_instance_t *wi = calloc(1, sizeof *wi);
    if (!wi) { c->ret_i = 0; return; }
    atomic_store(&wi->log_level, 3); /* warnings and errors */
    wi->vlc = libvlc_new(argc, argv);
    if (!wi->vlc) { free(wi); c->ret_i = 0; return; }
    libvlc_log_set(wi->vlc, on_log, wi);
    c->ret_i = (int32_t)(intptr_t)wi;
}

static void api_set_log_level(wv_call_t *c)
{
    atomic_store(&((wv_instance_t *)(intptr_t)c->i[0])->log_level, c->i[1]);
}

/* i0 instance, i1 js id, i2 sample rate, i3 channels, i4 ring frames */
static void api_player_new(wv_call_t *c)
{
    wv_instance_t *wi = (wv_instance_t *)(intptr_t)c->i[0];
    wv_player_t *p = calloc(1, sizeof *p);
    if (!p) { c->ret_i = 0; return; }
    p->id = c->i[1];
    p->inst = wi;
    atomic_store(&p->video.front, -1);
    atomic_store(&p->video.reading, -1);
    pthread_mutex_init(&p->media_lock, NULL);
    pthread_mutex_init(&p->perf_lock, NULL);

    wv_ring_t *r = &p->ring;
    r->magic = WV_RING_MAGIC;
    r->rate = c->i[2] > 0 ? c->i[2] : 48000;
    /* 1, 2 or the 4, 6 and 8 channel layouts of webaudio.c */
    r->channels = c->i[3] == 1 || c->i[3] == 4 || c->i[3] == 6 || c->i[3] == 8
                ? c->i[3] : 2;
    r->capacity = c->i[4] > 0 ? c->i[4] : r->rate / 2;
    r->data = calloc((size_t)r->capacity * r->channels, sizeof(float));
    if (!r->data) { free(p); c->ret_i = 0; return; }
    atomic_store(&r->volume_milli, 1000);

    p->mp = libvlc_media_player_new(wi->vlc, &player_cbs, p);
    if (!p->mp) { free(r->data); free(p); c->ret_i = 0; return; }
    /* Video goes to our webframe display (native/webframe.c), not libvlc's
     * vmem: it sees the full format (colour range/matrix, SAR) and keeps the
     * decoder's pixel layout. libvlc has no public setter for the vout, but a
     * media player is a VLC object, so its variables can be set directly. */
    vlc_object_t *obj = (vlc_object_t *)p->mp;
    var_Create(obj, "webframe-data", VLC_VAR_ADDRESS);
    var_SetAddress(obj, "webframe-data", &p->video);
    var_SetString(obj, "vout", "webframe");
    /* ...and its window is ours too (native/webwindow.c), so the page's mouse
     * reaches VLC: DVD menus are clickable. */
    vlc_mutex_init(&p->window.lock);
    vlc_cond_init(&p->window.idle);
    var_Create(obj, "webwindow-data", VLC_VAR_ADDRESS);
    var_SetAddress(obj, "webwindow-data", &p->window);
    var_Create(obj, "window", VLC_VAR_STRING);
    var_SetString(obj, "window", "webwindow");
    var_Create(obj, "webcodecs-stats", VLC_VAR_ADDRESS);
    var_SetAddress(obj, "webcodecs-stats", &p->webcodecs);
    libvlc_audio_set_callbacks(p->mp, audio_unused_play, NULL, NULL, NULL, NULL, r);
    libvlc_audio_output_set(p->mp, "webaudio");
    libvlc_media_player_watch_time(p->mp, TIME_PERIOD_US, &time_cbs, p);
    c->ret_i = (int32_t)(intptr_t)p;
}

static void api_player_release(wv_call_t *c)
{
    wv_player_t *p = P;
    libvlc_media_player_unwatch_time(p->mp);
    libvlc_media_player_release(p->mp);
    if (p->media != NULL)
        libvlc_media_release(p->media);
    free(p->ring.data);
    free(p);
}

/* s0 mrl, s1 options separated by '\n' (each like ":start-time=10") */
static void api_open(wv_call_t *c)
{
    libvlc_media_t *m = libvlc_media_new_location(c->s[0]);
    if (!m) { c->ret_i = -1; return; }
    char *save = NULL;
    for (char *o = c->s[1] ? strtok_r(c->s[1], "\n", &save) : NULL; o;
         o = strtok_r(NULL, "\n", &save))
        libvlc_media_add_option(m, o);
    libvlc_media_player_set_media(MP, m);
    libvlc_media_release(m);
    c->ret_i = 0;
}

static void api_play(wv_call_t *c) { c->ret_i = libvlc_media_player_play(MP); }
static void api_set_pause(wv_call_t *c) { libvlc_media_player_set_pause(MP, c->i[1]); }
static void api_stop(wv_call_t *c) { c->ret_i = libvlc_media_player_stop_async(MP); }
static void api_set_time(wv_call_t *c) { c->ret_i = libvlc_media_player_set_time(MP, (libvlc_time_t)c->d[0], c->i[1]); }
static void api_set_position(wv_call_t *c) { c->ret_i = libvlc_media_player_set_position(MP, c->d[0], c->i[1]); }
static void api_set_rate(wv_call_t *c) { c->ret_i = libvlc_media_player_set_rate(MP, (float)c->d[0]); }
static void api_set_volume(wv_call_t *c) { c->ret_i = libvlc_audio_set_volume(MP, c->i[1]); }
static void api_set_mute(wv_call_t *c) { libvlc_audio_set_mute(MP, c->i[1]); }
static void api_next_frame(wv_call_t *c) { libvlc_media_player_next_frame(MP); }
static void api_set_chapter(wv_call_t *c) { libvlc_media_player_set_chapter(MP, c->i[1]); }
static void api_set_title(wv_call_t *c) { libvlc_media_player_set_title(MP, c->i[1]); }
static void api_set_spu_delay(wv_call_t *c) { c->ret_i = libvlc_video_set_spu_delay(MP, (libvlc_time_t)c->d[0]); }
static void api_set_audio_delay(wv_call_t *c) { c->ret_i = libvlc_audio_set_delay(MP, (libvlc_time_t)c->d[0]); }
/* An integer VLC option for everything this player creates from now on
 * (decoders, the sout chain): VLC objects inherit variables from parents. */
static void api_set_int_option(wv_call_t *c)
{
    vlc_object_t *obj = (vlc_object_t *)MP;
    c->ret_i = var_Create(obj, c->s[0], VLC_VAR_INTEGER);
    if (c->ret_i == VLC_SUCCESS)
        var_SetInteger(obj, c->s[0], c->i[1]);
}
static void api_set_aspect(wv_call_t *c) { libvlc_video_set_aspect_ratio(MP, c->s[0]); }
static void api_set_deinterlace(wv_call_t *c) { c->ret_i = libvlc_video_set_deinterlace(MP, c->i[1], c->s[0]); }
static void api_set_adjust(wv_call_t *c)
{
    if (c->i[1] == 0) libvlc_video_set_adjust_int(MP, libvlc_adjust_Enable, c->i[2]);
    else libvlc_video_set_adjust_float(MP, (unsigned)c->i[1], (float)c->d[0]);
}

static void api_status(wv_call_t *c)
{
    json_t j = {0};
    json_obj(&j);
    json_knum(&j, "state", libvlc_media_player_get_state(MP));
    json_knum(&j, "time", libvlc_media_player_get_time(MP) / 1e6);
    json_knum(&j, "length", libvlc_media_player_get_length(MP) / 1e6);
    json_knum(&j, "position", libvlc_media_player_get_position(MP));
    json_knum(&j, "rate", libvlc_media_player_get_rate(MP));
    json_knum(&j, "volume", libvlc_audio_get_volume(MP));
    json_kbool(&j, "muted", libvlc_audio_get_mute(MP) == 1);
    json_kbool(&j, "seekable", libvlc_media_player_is_seekable(MP));
    json_kbool(&j, "pausable", libvlc_media_player_can_pause(MP));
    json_knum(&j, "chapter", libvlc_media_player_get_chapter(MP));
    json_knum(&j, "title", libvlc_media_player_get_title(MP));
    json_knum(&j, "audioDropped", atomic_load(&P->ring.dropped));
    json_knum(&j, "audioUnderruns", atomic_load(&P->ring.underruns));
    json_knum(&j, "framesDisplayed", atomic_load(&P->video.displayed));
    json_end_obj(&j);
    c->ret_s = json_take(&j);
}

static void api_tracks(wv_call_t *c)
{
    json_t j = {0};
    json_arr(&j);
    tracklist_json(&j, libvlc_media_player_get_tracklist(MP, libvlc_track_video, false));
    tracklist_json(&j, libvlc_media_player_get_tracklist(MP, libvlc_track_audio, false));
    tracklist_json(&j, libvlc_media_player_get_tracklist(MP, libvlc_track_text, false));
    json_end_arr(&j);
    c->ret_s = json_take(&j);
}

/* i1 type, s0 id or NULL to turn the type off */
static void api_select_track(wv_call_t *c)
{
    if (!c->s[0]) { libvlc_media_player_unselect_track_type(MP, c->i[1]); return; }
    libvlc_media_track_t *t = libvlc_media_player_get_track_from_id(MP, c->s[0]);
    if (!t) { c->ret_i = -1; return; }
    libvlc_media_player_select_track(MP, t);
    libvlc_media_track_release(t);
}

/* i1 slave type (0 subtitle, 1 audio), s0 uri, i2 select */
static void api_add_slave(wv_call_t *c)
{
    c->ret_i = libvlc_media_player_add_slave(MP, c->i[1], c->s[0], c->i[2]);
}

static void api_chapters(wv_call_t *c)
{
    json_t j = {0};
    json_obj(&j);
    libvlc_title_description_t **titles = NULL;
    int nt = libvlc_media_player_get_full_title_descriptions(MP, &titles);
    json_karr(&j, "titles");
    for (int k = 0; k < nt; k++) {
        json_obj(&j);
        json_kstr(&j, "name", titles[k]->psz_name);
        json_knum(&j, "duration", titles[k]->i_duration / 1e6);
        json_kbool(&j, "menu", titles[k]->i_flags & libvlc_title_menu);
        json_end_obj(&j);
    }
    json_end_arr(&j);
    if (nt > 0) libvlc_title_descriptions_release(titles, nt);
    libvlc_chapter_description_t **ch = NULL;
    int nc = libvlc_media_player_get_full_chapter_descriptions(MP, -1, &ch);
    json_karr(&j, "chapters");
    for (int k = 0; k < nc; k++) {
        json_obj(&j);
        json_kstr(&j, "name", ch[k]->psz_name);
        json_knum(&j, "time", ch[k]->i_time_offset / 1e6);
        json_knum(&j, "duration", ch[k]->i_duration / 1e6);
        json_end_obj(&j);
    }
    json_end_arr(&j);
    if (nc > 0) libvlc_chapter_descriptions_release(ch, nc);
    json_knum(&j, "title", libvlc_media_player_get_title(MP));
    json_knum(&j, "chapter", libvlc_media_player_get_chapter(MP));
    json_end_obj(&j);
    c->ret_s = json_take(&j);
}

static void api_media_info(wv_call_t *c)
{
    libvlc_media_t *m = libvlc_media_player_get_media(MP);
    if (!m) { c->ret_s = strdup("null"); return; }
    c->ret_s = media_json(m, -1);
    libvlc_media_release(m);
}

/* i1 preset index, -1 = off; d0 preamp dB if i2 */
static void api_set_equalizer(wv_call_t *c)
{
    if (c->i[1] < 0) { libvlc_media_player_set_equalizer(MP, NULL); return; }
    libvlc_equalizer_t *eq = libvlc_audio_equalizer_new_from_preset((unsigned)c->i[1]);
    if (!eq) { c->ret_i = -1; return; }
    if (c->i[2]) libvlc_audio_equalizer_set_preamp(eq, (float)c->d[0]);
    c->ret_i = libvlc_media_player_set_equalizer(MP, eq);
    /* The player copies the settings and keeps no reference. */
    libvlc_audio_equalizer_release(eq);
}

static void api_equalizer_presets(wv_call_t *c)
{
    json_t j = {0};
    json_obj(&j);
    json_karr(&j, "presets");
    for (unsigned k = 0; k < libvlc_audio_equalizer_get_preset_count(); k++) {
        json_sep(&j);
        json_str_value(&j, libvlc_audio_equalizer_get_preset_name(k));
    }
    json_end_arr(&j);
    json_karr(&j, "bands");
    for (unsigned k = 0; k < libvlc_audio_equalizer_get_band_count(); k++) {
        char num[24];
        json_sep(&j);
        snprintf(num, sizeof num, "%g", libvlc_audio_equalizer_get_band_frequency(k));
        json_s(&j, num);
    }
    json_end_arr(&j);
    json_end_obj(&j);
    c->ret_s = json_take(&j);
}

/* --- the rest of the player API ------------------------------------------------- */

/* s0 mrl: played after the current media without a gap */
static void api_set_next(wv_call_t *c)
{
    libvlc_media_t *m = c->s[0] ? libvlc_media_new_location(c->s[0]) : NULL;
    libvlc_media_player_set_next_media(MP, m);
    if (m) libvlc_media_release(m);
}
/* d0 a, d1 b in us; both < 0 resets */
static void api_set_abloop(wv_call_t *c)
{
    if (c->d[0] < 0 && c->d[1] < 0) c->ret_i = libvlc_media_player_reset_abloop(MP);
    else c->ret_i = libvlc_media_player_set_abloop_time(MP, (libvlc_time_t)c->d[0], (libvlc_time_t)c->d[1]);
}
static void api_programs(wv_call_t *c)
{
    json_t j = {0};
    json_arr(&j);
    libvlc_player_programlist_t *list = libvlc_media_player_get_programlist(MP);
    for (size_t k = 0; list && k < libvlc_player_programlist_count(list); k++) {
        libvlc_player_program_t *pg = libvlc_player_programlist_at(list, k);
        json_obj(&j);
        json_knum(&j, "id", pg->i_group_id);
        json_kstr(&j, "name", pg->psz_name);
        json_kbool(&j, "selected", pg->b_selected);
        json_kbool(&j, "scrambled", pg->b_scrambled);
        json_end_obj(&j);
    }
    if (list) libvlc_player_programlist_delete(list);
    json_end_arr(&j);
    c->ret_s = json_take(&j);
}
static void api_select_program(wv_call_t *c) { libvlc_media_player_select_program_id(MP, c->i[1]); }
static void api_previous_frame(wv_call_t *c) { libvlc_media_player_previous_frame(MP); }
static void api_navigate(wv_call_t *c) { libvlc_media_player_navigate(MP, (unsigned)c->i[1]); }
/* i1 0 move, 1 press, 2 release; d0, d1 position over the picture, 0..1.
 * ret 0 when there is a video window to report to. */
static void api_mouse(wv_call_t *c)
{
    wv_window_t *w = &P->window;
    c->ret_i = -1;
    /* Report outside the lock: a report runs vout filters and variable
     * callbacks, and the window's disable/destroy callbacks take w->lock
     * while the vout holds its own locks. `reporting` keeps the window alive
     * meanwhile (webwindow.c Destroy waits for it). */
    vlc_mutex_lock(&w->lock);
    vlc_window_t *wnd = w->wnd;
    unsigned width = w->width, height = w->height;
    if (wnd == NULL || width == 0 || height == 0) {
        vlc_mutex_unlock(&w->lock);
        return;
    }
    w->reporting++;
    vlc_mutex_unlock(&w->lock);

    int x = (int)(c->d[0] * width), y = (int)(c->d[1] * height);
    switch (c->i[1]) {
    case 0:
        vlc_window_ReportMouseMoved(wnd, x, y);
        break;
    case 1:
        vlc_window_ReportMouseMoved(wnd, x, y);
        vlc_window_ReportMousePressed(wnd, MOUSE_BUTTON_LEFT);
        break;
    case 2:
        vlc_window_ReportMouseReleased(wnd, MOUSE_BUTTON_LEFT);
        break;
    }
    c->ret_i = 0;

    vlc_mutex_lock(&w->lock);
    if (--w->reporting == 0)
        vlc_cond_broadcast(&w->idle);
    vlc_mutex_unlock(&w->lock);
}
static void api_set_teletext(wv_call_t *c)
{
    if (c->i[2] >= 0) libvlc_video_set_teletext_transparency(MP, c->i[2]);
    libvlc_video_set_teletext(MP, c->i[1]);
}
/* i1 option, i2 value | s0 string (marquee text) */
static void api_marquee(wv_call_t *c)
{
    if (c->s[0]) libvlc_video_set_marquee_string(MP, (unsigned)c->i[1], c->s[0]);
    else libvlc_video_set_marquee_int(MP, (unsigned)c->i[1], c->i[2]);
}
static void api_logo(wv_call_t *c)
{
    if (c->s[0]) libvlc_video_set_logo_string(MP, (unsigned)c->i[1], c->s[0]);
    else libvlc_video_set_logo_int(MP, (unsigned)c->i[1], c->i[2]);
}
static void api_set_stereomode(wv_call_t *c) { c->ret_i = libvlc_audio_set_stereomode(MP, c->i[1]); }
static void api_set_mixmode(wv_call_t *c) { c->ret_i = libvlc_audio_set_mixmode(MP, c->i[1]); }
static void api_set_spu_scale(wv_call_t *c) { libvlc_video_set_spu_text_scale(MP, (float)c->d[0]); }
/* i1 kind (0 none, 1 ratio, 2 window, 3 border), i2..i5 */
static void api_set_crop(wv_call_t *c)
{
    switch (c->i[1]) {
    case 1: libvlc_video_set_crop_ratio(MP, c->i[2], c->i[3]); break;
    case 2: libvlc_video_set_crop_window(MP, c->i[2], c->i[3], c->i[4], c->i[5]); break;
    case 3: libvlc_video_set_crop_border(MP, c->i[2], c->i[3], c->i[4], c->i[5]); break;
    default: libvlc_video_set_crop_ratio(MP, 0, 0); break;
    }
}
/* i1 enable, s0 directory */
static void api_record(wv_call_t *c) { libvlc_media_player_record(MP, c->i[1], c->s[0]); }

/* --- parser & thumbnailer: complete asynchronously ---------------------------- */

static libvlc_parser_t *get_parser(wv_instance_t *wi)
{
    if (!wi->parser) {
        /* No timeout here: probe() times out in JS (default 10 s, longer
         * than VLC's 5 s preparse-timeout, which is short for slow URLs). */
        struct libvlc_parser_cfg cfg = {
            .version = 0, .max_parser_threads = 2, .max_thumbnailer_threads = 1, .timeout = 0,
        };
        wi->parser = libvlc_parser_new(wi->vlc, &cfg);
    }
    return wi->parser;
}

static void parse_done(void *opaque, libvlc_parser_task *task, libvlc_parser_status_t status)
{
    wv_call_t *c = opaque;
    libvlc_media_t *m = libvlc_parser_task_get_media(task);
    c->ret_i = status == libvlc_parser_status_done ? 0 : -1;
    c->ret_s = media_json(m, status);
    libvlc_parser_task_release(task);
    complete(c);
}

static const struct libvlc_parser_cbs parse_cbs = { .version = 0, .on_parsed = parse_done };

/* i0 instance, s0 mrl, i1 flags */
static void api_parse(wv_call_t *c)
{
    wv_instance_t *wi = (wv_instance_t *)(intptr_t)c->i[0];
    libvlc_parser_t *parser = get_parser(wi);
    libvlc_media_t *m = parser ? libvlc_media_new_location(c->s[0]) : NULL;
    if (!m) { c->ret_i = -1; return; }
    libvlc_parser_request_t req = {
        .version = 0, .media = m,
        /* No libvlc_media_fetch_local: this build has no art finder
         * modules, so the fetch step only added latency to every probe. */
        .parse_flags = libvlc_media_parse,
    };
    libvlc_parser_task *task = libvlc_parser_task_new_parse(parser, &req, &parse_cbs, c);
    libvlc_media_release(m);
    if (!task || libvlc_parser_submit(wi->parser, task) != 0) {
        if (task) libvlc_parser_task_release(task);
        c->ret_i = -1;
        return;
    }
    c->deferred = 1;
}

static void thumb_done(void *opaque, libvlc_parser_task *task, libvlc_picture_t *pic)
{
    wv_call_t *c = opaque;
    c->ret_i = 0;
    if (pic) {
        size_t size = 0;
        const unsigned char *buf = libvlc_picture_get_buffer(pic, &size);
        c->ret_s = malloc(size);
        if (c->ret_s) {
            memcpy(c->ret_s, buf, size);
            c->ret_i = (int32_t)size;
            c->ret_d = libvlc_picture_get_width(pic) * 65536.0 + libvlc_picture_get_height(pic);
        }
    }
    libvlc_parser_task_release(task);
    complete(c);
}

static const struct libvlc_thumbnailer_cbs thumb_cbs = { .version = 0, .on_ended = thumb_done };

/* i0 instance, s0 mrl, d0 time (s, <0 = position d1), i1 width, i2 height, i3 crop, i4 fast */
static void api_thumbnail(wv_call_t *c)
{
    wv_instance_t *wi = (wv_instance_t *)(intptr_t)c->i[0];
    libvlc_parser_t *parser = get_parser(wi);
    libvlc_media_t *m = parser ? libvlc_media_new_location(c->s[0]) : NULL;
    if (!m) { c->ret_i = -1; return; }
    libvlc_thumbnailer_request_t req = {
        .version = 0, .media = m,
        .width = (unsigned)c->i[1], .height = (unsigned)c->i[2], .crop = c->i[3],
        .type = libvlc_picture_Jpg, /* the only image encoder in a build without sout */
    };
    if (c->d[0] >= 0) {
        req.seek.type = libvlc_thumbnailer_seek_time;
        req.seek.value.time = (libvlc_time_t)(c->d[0] * 1e6);
    } else {
        req.seek.type = libvlc_thumbnailer_seek_pos;
        req.seek.value.pos = c->d[1];
    }
    req.seek.speed = c->i[4] ? libvlc_media_thumbnail_seek_fast : libvlc_media_thumbnail_seek_precise;
    libvlc_parser_task *task = libvlc_parser_task_new_thumbnail(parser, &req, &thumb_cbs, c);
    libvlc_media_release(m);
    if (!task || libvlc_parser_submit(wi->parser, task) != 0) {
        if (task) libvlc_parser_task_release(task);
        c->ret_i = -1;
        return;
    }
    c->deferred = 1;
}

/* ------------------------------------------------------------------------ */
/* Dispatch                                                                  */

#define WV_API(X) \
    X(version) X(instance_new) X(set_log_level) X(player_new) X(player_release) \
    X(open) X(play) X(set_pause) X(stop) X(set_time) X(set_position) \
    X(set_rate) X(set_volume) X(set_mute) X(next_frame) X(set_chapter) \
    X(set_title) X(set_spu_delay) X(set_audio_delay) X(set_aspect) \
    X(set_deinterlace) X(set_adjust) X(status) X(tracks) X(select_track) \
    X(add_slave) X(chapters) X(media_info) X(set_equalizer) \
    X(equalizer_presets) X(parse) X(thumbnail) X(set_next) X(set_abloop) \
    X(programs) X(select_program) X(previous_frame) X(navigate) X(set_teletext) \
    X(marquee) X(logo) X(set_stereomode) X(set_mixmode) X(set_spu_scale) \
    X(set_crop) X(record) X(set_int_option) X(mouse)

#define X_FN(name) api_##name,
#define X_NAME(name) #name ","
static void (*const api_table[])(wv_call_t *) = { WV_API(X_FN) };
static const char api_names[] = WV_API(X_NAME);

static void *control_main(void *unused)
{
    (void) unused;
    for (;;) {
        pthread_mutex_lock(&queue_lock);
        while (!queue_head)
            pthread_cond_wait(&queue_wait, &queue_lock);
        wv_call_t *c = queue_head;
        queue_head = c->next;
        if (!queue_head) queue_tail = NULL;
        pthread_mutex_unlock(&queue_lock);

        c->next = NULL;
        if (c->fn >= 0 && (size_t)c->fn < sizeof api_table / sizeof *api_table)
            api_table[c->fn](c);
        else
            c->ret_i = -1;
        if (!c->deferred)
            complete(c);
    }
    return NULL;
}

/* ------------------------------------------------------------------------ */
/* Exports called directly from the runtime thread. None of them touch libvlc. */

EMSCRIPTEN_KEEPALIVE const char *wv_api_names(void) { return api_names; }

/* Runs anything VLC's threads queued for this (the runtime) thread. Normally
 * an Atomics.waitAsync wakeup does it; engine.js also calls this on a timer,
 * because WebKit sometimes misses that wakeup and results (a finished probe())
 * or events were then never delivered. */
EMSCRIPTEN_KEEPALIVE void wv_pump(void) { emscripten_current_thread_process_queued_calls(); }

EMSCRIPTEN_KEEPALIVE int wv_call_layout(int field)
{
    static const int offsets[] = {
        sizeof(wv_call_t), offsetof(wv_call_t, req), offsetof(wv_call_t, fn),
        offsetof(wv_call_t, i), offsetof(wv_call_t, d), offsetof(wv_call_t, s),
        offsetof(wv_call_t, ret_i), offsetof(wv_call_t, ret_d), offsetof(wv_call_t, ret_s),
        offsetof(wv_player_t, ring), offsetof(wv_player_t, video),
        offsetof(wv_ring_t, data),
    };
    if (field < 0 || (size_t)field >= ARRAY_SIZE(offsets))
        return -1;
    return offsets[field];
}

EMSCRIPTEN_KEEPALIVE void wv_submit(wv_call_t *c)
{
    if (!atomic_exchange(&control_started, true)) {
        pthread_attr_t attr;
        pthread_attr_init(&attr);
        pthread_attr_setstacksize(&attr, CONTROL_STACK);
        int err = pthread_create(&control_thread, &attr, control_main, NULL);
        pthread_attr_destroy(&attr);
        if (err != 0) {
            /* Answer now rather than queue a call nothing will ever run; the
             * next call tries again. */
            atomic_store(&control_started, false);
            c->ret_i = -1;
            complete(c);
            return;
        }
    }
    c->next = NULL;
    pthread_mutex_lock(&queue_lock);
    if (queue_tail) queue_tail->next = c; else queue_head = c;
    queue_tail = c;
    pthread_cond_signal(&queue_wait);
    pthread_mutex_unlock(&queue_lock);
}
