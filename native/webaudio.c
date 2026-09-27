/*****************************************************************************
 * webaudio.c: audio output into an AudioWorklet ring buffer
 *****************************************************************************
 * Copyright (C) 2026 Lucas Gelfond
 *
 * SPDX-License-Identifier: MIT
 * See LICENSE at the root of the libvlc-wasm repository. Linked into VLC,
 * which is (L)GPL, the resulting binary is distributed under the GPL.
 *****************************************************************************/

/*
 * webaudio: a VLC audio output that writes into a ring buffer in wasm memory,
 * drained by an AudioWorklet on the page (packages/core/src/audio-worklet.js).
 *
 * It exists because amem, the public-API route, never reports timing, and a
 * VLC 4 aout that does not report timing gets no drift correction at all
 * ("nothing can be done if timing is unknown", src/audio_output/dec.c). This
 * module reports how far the worklet has actually played, so audio stays the
 * master clock and video follows it, as it does in desktop VLC.
 *
 * It is compiled out of tree against VLC's headers and registered as a static
 * module at link time, so VLC itself needs no patch. Per-player state arrives
 * through "amem-data", which libvlc_audio_set_callbacks() sets on the player;
 * the bridge then selects this module with libvlc_audio_output_set().
 */
#ifdef HAVE_CONFIG_H
# include "config.h"
#endif

#include <stdatomic.h>
#include <string.h>

#include <vlc_common.h>
#include <vlc_plugin.h>
#include <vlc_aout.h>

#include "shared.h"

#define CONSUMER_TIMEOUT VLC_TICK_FROM_MS(150) /* no heartbeat: nobody drains */
/* Draining is only waiting, so it gives a busy page (or a worklet that has
 * not rendered its first quantum yet) much longer before it concludes that
 * nobody is listening: stopping early throws away all of a short clip. */
#define DRAIN_TIMEOUT    VLC_TICK_FROM_SEC(1)
#define REPORT_INTERVAL  VLC_TICK_FROM_MS(250) /* between timing reports */
#define DRAIN_POLL       VLC_TICK_FROM_MS(10)
#define MAX_LEAD         VLC_TICK_FROM_SEC(2)  /* longest silence padded in */
#define PAD_WAIT         VLC_TICK_FROM_MS(50)
#define WRITE_WAIT       VLC_TICK_FROM_MS(400) /* longest Play() blocks */

typedef struct
{
    wv_ring_t *ring;
    unsigned rate;
    bool started;          /* first real sample written since start/flush */
    vlc_timer_t drain_timer;
    /* The drain timer's callback runs on its own thread, and disarming the
     * timer does not wait for a callback already running: lock protects the
     * drain state and the heartbeat, which both threads use, so a Flush can
     * never be followed by a drain report meant for the flushed stream. */
    vlc_mutex_t lock;
    bool draining;
    vlc_tick_t drain_start;
    uint32_t last_heartbeat;
    vlc_tick_t heartbeat_at;   /* when last_heartbeat was seen to change */
    uint32_t data_start;   /* ring position of the first real sample */
    uint8_t chan_table[AOUT_CHAN_MAX]; /* VLC order to Web Audio order */
    bool chan_reorder;
    vlc_tick_t first_pts;
    vlc_tick_t last_report;
} aout_sys_t;

static uint32_t ring_used(const wv_ring_t *r)
{
    return atomic_load(&r->write) - atomic_load(&r->read);
}

/* Writes n frames (NULL = silence). Returns frames written. Never blocks for
 * more than max_wait: a suspended AudioContext stops draining the ring, and a
 * decoder stuck behind it would stall video too. */
static uint32_t ring_write(wv_ring_t *r, const float *src, uint32_t n,
                           vlc_tick_t max_wait)
{
    const uint32_t cap = r->capacity, ch = r->channels;
    vlc_tick_t deadline = vlc_tick_now() + max_wait;
    uint32_t done = 0;

    while (done < n) {
        uint32_t space = cap - ring_used(r);
        if (space == 0) {
            if (vlc_tick_now() >= deadline)
                break;
            vlc_tick_sleep(VLC_TICK_FROM_MS(4)); /* about a render quantum */
            continue;
        }
        uint32_t w = atomic_load(&r->write);
        uint32_t chunk = __MIN(space, n - done);
        uint32_t pos = w % cap;
        uint32_t first = __MIN(chunk, cap - pos);
        float *dst = r->data + (size_t)pos * ch;
        if (src) {
            memcpy(dst, src + (size_t)done * ch, (size_t)first * ch * sizeof(float));
            if (chunk > first)
                memcpy(r->data, src + (size_t)(done + first) * ch,
                       (size_t)(chunk - first) * ch * sizeof(float));
        } else {
            memset(dst, 0, (size_t)first * ch * sizeof(float));
            if (chunk > first)
                memset(r->data, 0, (size_t)(chunk - first) * ch * sizeof(float));
        }
        atomic_store(&r->write, w + chunk);
        done += chunk;
    }
    return done;
}

/* Is anything draining the ring? A suspended AudioContext (autoplay policy)
 * or a page with no worklet never will, and waiting on it would back up the
 * decoder and then the demuxer, stalling video too. */
static bool consumer_beat_within_locked(aout_sys_t *sys, vlc_tick_t since,
                                        vlc_tick_t timeout)
{
    uint32_t hb = atomic_load(&sys->ring->heartbeat);
    vlc_tick_t now = vlc_tick_now();
    if (hb != sys->last_heartbeat) {
        sys->last_heartbeat = hb;
        sys->heartbeat_at = now;
        return true;
    }
    return now - __MAX(sys->heartbeat_at, since) < timeout;
}

static bool consumer_alive_locked(aout_sys_t *sys)
{
    return consumer_beat_within_locked(sys, VLC_TICK_0, CONSUMER_TIMEOUT);
}

static bool consumer_alive(aout_sys_t *sys)
{
    vlc_mutex_lock(&sys->lock);
    bool alive = consumer_alive_locked(sys);
    vlc_mutex_unlock(&sys->lock);
    return alive;
}

static void report_timing(audio_output_t *aout)
{
    aout_sys_t *sys = aout->sys;
    wv_ring_t *r = sys->ring;
    if (!sys->started || atomic_load(&r->paused))
        return;
    int32_t played = (int32_t)(atomic_load(&r->read) - sys->data_start);
    if (played <= 0)
        return; /* still in the leading silence, or the worklet has not caught up
                   with a flush yet */
    /* The worklet's read position moves in render-callback bursts: 2.7 ms in
     * Chromium, but 10-20 ms or more in Firefox and Safari. Points reported
     * every few ms carry that jitter at face value and VLC keeps resetting its
     * master clock ("coefficient too unstable"); a few per second keep it
     * down to a few percent, and VLC only asks for about one per second. */
    vlc_tick_t now = vlc_tick_now();
    if (sys->last_report != VLC_TICK_INVALID && now - sys->last_report < REPORT_INTERVAL)
        return;
    sys->last_report = now;
    vlc_tick_t latency = VLC_TICK_FROM_US(atomic_load(&r->latency_us));
    aout_TimingReport(aout, now + latency,
                      sys->first_pts + vlc_tick_from_samples(played, sys->rate));
}

/* Polled while draining: reports once the worklet has played everything. */
static void DrainPoll(void *data)
{
    audio_output_t *aout = data;
    aout_sys_t *sys = aout->sys;
    wv_ring_t *r = sys->ring;
    vlc_mutex_lock(&sys->lock);
    if (sys->draining && (ring_used(r) == 0 ||
        !consumer_beat_within_locked(sys, sys->drain_start, DRAIN_TIMEOUT))) {
        sys->draining = false;
        aout_DrainedReport(aout); /* an atomic store: fine under the lock */
    }
    vlc_mutex_unlock(&sys->lock);
}

/* Without this the core stops the stream once the last block is *queued*,
 * which throws away up to a ring's worth of audio: all of a short clip. */
static void Drain(audio_output_t *aout)
{
    aout_sys_t *sys = aout->sys;
    vlc_mutex_lock(&sys->lock);
    sys->draining = true;
    sys->drain_start = vlc_tick_now();
    vlc_mutex_unlock(&sys->lock);
    vlc_timer_schedule(sys->drain_timer, false, DRAIN_POLL, DRAIN_POLL);
}

static void StopDraining(aout_sys_t *sys)
{
    vlc_mutex_lock(&sys->lock);
    sys->draining = false;
    vlc_mutex_unlock(&sys->lock);
    vlc_timer_disarm(sys->drain_timer);
}

/* Web Audio's speaker layouts (Web Audio API, "Channel Ordering"): quad
 * L R SL SR, 5.1 L R C LFE SL SR. 7.1 follows WAVE: L R C LFE BL BR SL SR. */
static const uint32_t webaudio_chans_order[] = {
    AOUT_CHAN_LEFT, AOUT_CHAN_RIGHT, AOUT_CHAN_CENTER, AOUT_CHAN_LFE,
    AOUT_CHAN_REARLEFT, AOUT_CHAN_REARRIGHT, AOUT_CHAN_MIDDLELEFT,
    AOUT_CHAN_MIDDLERIGHT, 0,
};

static uint32_t webaudio_layout(unsigned channels)
{
    switch (channels) {
    case 1: return AOUT_CHAN_CENTER;
    case 4: return AOUT_CHANS_4_0;
    case 6: return AOUT_CHANS_5_1;
    case 8: return AOUT_CHANS_7_1;
    default: return AOUT_CHANS_STEREO;
    }
}

static int Start(audio_output_t *aout, audio_sample_format_t *restrict fmt)
{
    aout_sys_t *sys = aout->sys;
    wv_ring_t *r = sys->ring;

    if (!AOUT_FMT_LINEAR(fmt) || aout_FormatNbChannels(fmt) == 0)
        return VLC_EGENERIC; /* no S/PDIF passthrough in a browser */

    fmt->i_format = VLC_CODEC_FL32;
    fmt->i_rate = r->rate;
    fmt->channel_type = AUDIO_CHANNEL_TYPE_BITMAP;
    /* As many channels as the page's output takes (up to 7.1, see bridge.c);
     * VLC's filters downmix anything wider and place narrower streams. */
    fmt->i_physical_channels = webaudio_layout(r->channels);
    aout_FormatPrepare(fmt);
    sys->chan_reorder = aout_CheckChannelReorder(NULL, webaudio_chans_order,
                            fmt->i_physical_channels, sys->chan_table) != 0;

    sys->rate = r->rate;
    sys->started = false;
    atomic_store(&r->paused, 0);
    atomic_fetch_add(&r->stream_gen, 1);
    atomic_store(&r->active, 1);
    return VLC_SUCCESS;
}

static void Flush(audio_output_t *aout)
{
    aout_sys_t *sys = aout->sys;
    wv_ring_t *r = sys->ring;
    /* Only the worklet moves `read`. Tell it where live data resumes; until it
     * has jumped there, ring_used() overestimates, which only makes writes
     * more conservative. */
    atomic_store(&r->flush_pos, atomic_load(&r->write));
    atomic_fetch_add(&r->flush_gen, 1);
    sys->started = false;
    StopDraining(sys);
}

static void Stop(audio_output_t *aout)
{
    aout_sys_t *sys = aout->sys;
    Flush(aout);
    atomic_store(&sys->ring->active, 0);
}

static void Play(audio_output_t *aout, block_t *block, vlc_tick_t date)
{
    aout_sys_t *sys = aout->sys;
    wv_ring_t *r = sys->ring;

    if (!sys->started)
    {
        /* The first date is usually in the future: pad with silence so the
         * first sample lands on time rather than early. */
        vlc_tick_t latency = VLC_TICK_FROM_US(atomic_load(&r->latency_us));
        vlc_tick_t lead = date - vlc_tick_now() - latency;
        uint32_t pad = 0;
        if (lead > 0 && lead < MAX_LEAD)
            pad = samples_from_vlc_tick(lead, sys->rate);
        ring_write(r, NULL, pad, consumer_alive(sys) ? PAD_WAIT : 0);
        sys->data_start = atomic_load(&r->write);
        sys->first_pts = block->i_pts;
        sys->started = true;
        sys->last_report = VLC_TICK_INVALID; /* report the first point at once */
    }

    uint32_t n = block->i_nb_samples;
    if (sys->chan_reorder)
        aout_ChannelReorder(block->p_buffer, block->i_buffer,
                            r->channels, sys->chan_table,
                            VLC_CODEC_FL32);
    vlc_tick_t wait = consumer_alive(sys) ? WRITE_WAIT : 0;
    uint32_t done = ring_write(r, (const float *)block->p_buffer, n, wait);
    if (done < n)
        atomic_fetch_add(&r->dropped, n - done);
    block_Release(block);
    report_timing(aout);
}

static void Pause(audio_output_t *aout, bool paused, vlc_tick_t date)
{
    (void) date;
    atomic_store(&((aout_sys_t *)aout->sys)->ring->paused, paused ? 1 : 0);
}

static int VolumeSet(audio_output_t *aout, float vol)
{
    aout_sys_t *sys = aout->sys;
    atomic_store(&sys->ring->volume_milli, (int32_t)(vol * 1000.f + .5f));
    aout_VolumeReport(aout, vol);
    return 0;
}

static int MuteSet(audio_output_t *aout, bool mute)
{
    aout_sys_t *sys = aout->sys;
    atomic_store(&sys->ring->muted, mute ? 1 : 0);
    aout_MuteReport(aout, mute);
    return 0;
}

static int Open(vlc_object_t *obj)
{
    audio_output_t *aout = (audio_output_t *)obj;
    wv_ring_t *ring = var_InheritAddress(obj, "amem-data");
    if (ring == NULL || ring->magic != WV_RING_MAGIC)
        return VLC_EGENERIC; /* not created by the bridge */

    aout_sys_t *sys = calloc(1, sizeof(*sys));
    if (unlikely(sys == NULL))
        return VLC_ENOMEM;
    sys->ring = ring;
    vlc_mutex_init(&sys->lock);
    if (vlc_timer_create(&sys->drain_timer, DrainPoll, aout) != 0) {
        free(sys);
        return VLC_ENOMEM;
    }

    aout->sys = sys;
    aout->start = Start;
    aout->stop = Stop;
    aout->play = Play;
    aout->pause = Pause;
    aout->flush = Flush;
    aout->drain = Drain;
    aout->volume_set = VolumeSet;
    aout->mute_set = MuteSet;
    return VLC_SUCCESS;
}

static void Close(vlc_object_t *obj)
{
    aout_sys_t *sys = ((audio_output_t *)obj)->sys;
    vlc_timer_destroy(sys->drain_timer);
    free(sys);
}

vlc_module_begin()
    set_shortname(N_("WebAudio"))
    set_description(N_("Web Audio (AudioWorklet) audio output"))
    set_capability("audio output", 0)
    set_subcategory(SUBCAT_AUDIO_AOUT)
    set_callbacks(Open, Close)
vlc_module_end()
