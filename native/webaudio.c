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

typedef struct
{
    wv_ring_t *ring;
    uint32_t last_heartbeat;
    vlc_tick_t heartbeat_at;   /* when last_heartbeat was seen to change */
    unsigned rate;
    bool started;          /* first real sample written since start/flush */
    vlc_timer_t drain_timer;
    atomic_bool draining; /* set on the decoder thread, read on the timer thread */
    uint32_t data_start;   /* ring position of the first real sample */
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

    while (done < n)
    {
        uint32_t space = cap - ring_used(r);
        if (space == 0)
        {
            if (vlc_tick_now() >= deadline)
                break;
            vlc_tick_sleep(VLC_TICK_FROM_MS(4));
            continue;
        }
        uint32_t w = atomic_load(&r->write);
        uint32_t chunk = __MIN(space, n - done);
        uint32_t pos = w % cap;
        uint32_t first = __MIN(chunk, cap - pos);
        float *dst = r->data + (size_t)pos * ch;
        if (src)
        {
            memcpy(dst, src + (size_t)done * ch, (size_t)first * ch * sizeof(float));
            if (chunk > first)
                memcpy(r->data, src + (size_t)(done + first) * ch,
                       (size_t)(chunk - first) * ch * sizeof(float));
        }
        else
        {
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
static bool consumer_alive(aout_sys_t *sys)
{
    uint32_t hb = atomic_load(&sys->ring->heartbeat);
    vlc_tick_t now = vlc_tick_now();
    if (hb != sys->last_heartbeat) {
        sys->last_heartbeat = hb;
        sys->heartbeat_at = now;
        return true;
    }
    return now - sys->heartbeat_at < VLC_TICK_FROM_MS(150);
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
    if (sys->last_report != VLC_TICK_INVALID && now - sys->last_report < VLC_TICK_FROM_MS(250))
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
    if (!sys->draining)
        return;
    if (ring_used(r) == 0 || !consumer_alive(sys)) {
        sys->draining = false;
        vlc_timer_disarm(sys->drain_timer);
        aout_DrainedReport(aout);
    }
}

/* Without this the core stops the stream once the last block is *queued*,
 * which throws away up to a ring's worth of audio: all of a short clip. */
static void Drain(audio_output_t *aout)
{
    aout_sys_t *sys = aout->sys;
    sys->draining = true;
    vlc_timer_schedule(sys->drain_timer, false, VLC_TICK_FROM_MS(10), VLC_TICK_FROM_MS(10));
}

static void StopDraining(aout_sys_t *sys)
{
    sys->draining = false;
    vlc_timer_disarm(sys->drain_timer);
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
    fmt->i_physical_channels = r->channels == 1 ? AOUT_CHAN_CENTER : AOUT_CHANS_STEREO;
    aout_FormatPrepare(fmt);

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
        if (lead > 0 && lead < VLC_TICK_FROM_SEC(2))
            pad = samples_from_vlc_tick(lead, sys->rate);
        ring_write(r, NULL, pad, consumer_alive(sys) ? VLC_TICK_FROM_MS(50) : 0);
        sys->data_start = atomic_load(&r->write);
        sys->first_pts = block->i_pts;
        sys->started = true;
        sys->last_report = VLC_TICK_INVALID; /* report the first point at once */
    }

    uint32_t n = block->i_nb_samples;
    vlc_tick_t wait = consumer_alive(sys) ? VLC_TICK_FROM_MS(400) : 0;
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
    set_shortname("WebAudio")
    set_description("Web Audio (AudioWorklet) audio output")
    set_capability("audio output", 0)
    set_subcategory(SUBCAT_AUDIO_AOUT)
    set_callbacks(Open, Close)
vlc_module_end()
