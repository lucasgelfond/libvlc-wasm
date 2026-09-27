/*
 * decode.c - minimal libavformat + libavcodec decode benchmark driver.
 *
 * Usage: decode <file>
 *
 * 1. Demuxes the whole file into memory (untimed), keeping the packets of the
 *    best video stream. File I/O through a WASI shim is therefore not part of
 *    the measurement.
 * 2. Decodes every packet single-threaded (thread_count = 1) and drains the
 *    decoder, timing only that loop with clock_gettime(CLOCK_MONOTONIC).
 * 3. Prints one JSON line:
 *      {"codec":"h264","frames":N,"seconds":S,"fps":F,"checksum":"xxxxxxxx"}
 *    The checksum is a cheap Adler-style sum over one row of the luma plane of
 *    every frame; the build uses the same C code everywhere (--disable-asm), so
 *    it must be identical across native and every wasm runtime.
 *
 * No SIMD intrinsics; plain C.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/log.h>

static double now(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec + (double)ts.tv_nsec * 1e-9;
}

static uint32_t sum_a = 1, sum_b = 0;

static void checksum_frame(const AVFrame *f)
{
    /* one row from the middle of the luma plane: enough to catch a broken
     * decode, cheap enough (<0.1% of decode time) to leave in the timed loop */
    const uint8_t *row = f->data[0] + (size_t)(f->height / 2) * f->linesize[0];
    for (int i = 0; i < f->width; i++) {
        sum_a = (sum_a + row[i]) % 65521u;
        sum_b = (sum_b + sum_a) % 65521u;
    }
}

static int drain(AVCodecContext *ctx, AVFrame *frame, long *frames)
{
    for (;;) {
        int ret = avcodec_receive_frame(ctx, frame);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF)
            return 0;
        if (ret < 0)
            return ret;
        checksum_frame(frame);
        (*frames)++;
        av_frame_unref(frame);
    }
}

int main(int argc, char **argv)
{
    if (argc < 2) {
        fprintf(stderr, "usage: %s <file>\n", argv[0]);
        return 2;
    }
    av_log_set_level(AV_LOG_ERROR);

    AVFormatContext *fmt = NULL;
    int ret = avformat_open_input(&fmt, argv[1], NULL, NULL);
    if (ret < 0) {
        fprintf(stderr, "cannot open %s: %s\n", argv[1], av_err2str(ret));
        return 1;
    }
    if ((ret = avformat_find_stream_info(fmt, NULL)) < 0) {
        fprintf(stderr, "find_stream_info: %s\n", av_err2str(ret));
        return 1;
    }
    const AVCodec *codec = NULL;
    int vs = av_find_best_stream(fmt, AVMEDIA_TYPE_VIDEO, -1, -1, &codec, 0);
    if (vs < 0 || !codec) {
        fprintf(stderr, "no decodable video stream\n");
        return 1;
    }

    AVCodecContext *ctx = avcodec_alloc_context3(codec);
    avcodec_parameters_to_context(ctx, fmt->streams[vs]->codecpar);
    ctx->thread_count = 1;
    ctx->thread_type = 0;
    if ((ret = avcodec_open2(ctx, codec, NULL)) < 0) {
        fprintf(stderr, "avcodec_open2: %s\n", av_err2str(ret));
        return 1;
    }

    /* Untimed: pull every video packet into memory. */
    size_t npkts = 0, cap = 256;
    AVPacket **pkts = malloc(cap * sizeof(*pkts));
    for (;;) {
        AVPacket *p = av_packet_alloc();
        if (av_read_frame(fmt, p) < 0) {
            av_packet_free(&p);
            break;
        }
        if (p->stream_index != vs) {
            av_packet_free(&p);
            continue;
        }
        if (npkts == cap)
            pkts = realloc(pkts, (cap *= 2) * sizeof(*pkts));
        pkts[npkts++] = p;
    }

    AVFrame *frame = av_frame_alloc();
    long frames = 0;

    double t0 = now();
    for (size_t i = 0; i < npkts; i++) {
        ret = avcodec_send_packet(ctx, pkts[i]);
        if (ret < 0 && ret != AVERROR(EAGAIN)) {
            fprintf(stderr, "send_packet %zu: %s\n", i, av_err2str(ret));
            return 1;
        }
        if ((ret = drain(ctx, frame, &frames)) < 0) {
            fprintf(stderr, "receive_frame: %s\n", av_err2str(ret));
            return 1;
        }
    }
    avcodec_send_packet(ctx, NULL);
    if ((ret = drain(ctx, frame, &frames)) < 0) {
        fprintf(stderr, "receive_frame (flush): %s\n", av_err2str(ret));
        return 1;
    }
    double secs = now() - t0;

    printf("{\"codec\":\"%s\",\"frames\":%ld,\"seconds\":%.6f,\"fps\":%.3f,"
           "\"checksum\":\"%08x\"}\n",
           codec->name, frames, secs, secs > 0 ? frames / secs : 0.0,
           (unsigned)((sum_b << 16) | sum_a));

    for (size_t i = 0; i < npkts; i++)
        av_packet_free(&pkts[i]);
    free(pkts);
    av_frame_free(&frame);
    avcodec_free_context(&ctx);
    avformat_close_input(&fmt);
    return 0;
}
