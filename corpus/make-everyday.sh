#!/bin/sh
# Everyday formats for the compatibility matrix: 3-second clips (a test
# pattern and a tone) in the containers and codecs people actually have,
# so the comparison covers the ordinary cases as well as the hard ones.
# Writes corpus/media/everyday/. Needs ffmpeg with libx264, libx265,
# libsvtav1, libvpx, libopus and libmp3lame.
set -eu
cd "$(dirname "$0")/media" && mkdir -p everyday && cd everyday
q="-loglevel error -y"
V="-f lavfi -i testsrc2=size=640x360:rate=30"
A="-f lavfi -i sine=frequency=440:sample_rate=48000"
T="-t 3"
ffmpeg $q $V $A $T -c:v libx264 -pix_fmt yuv420p -c:a aac mp4-h264-aac.mp4
ffmpeg $q $V $A $T -c:v libx265 -tag:v hvc1 -pix_fmt yuv420p -c:a aac mp4-hevc-aac.mp4
ffmpeg $q $V $A $T -c:v libsvtav1 -pix_fmt yuv420p -c:a aac mp4-av1-aac.mp4
ffmpeg $q $V $A $T -c:v libvpx-vp9 -b:v 1M -c:a libopus webm-vp9-opus.webm
ffmpeg $q $V $A $T -c:v libsvtav1 -pix_fmt yuv420p -c:a libopus webm-av1-opus.webm
ffmpeg $q $V $A $T -c:v libvpx -b:v 1M -c:a vorbis -strict -2 -ac 2 webm-vp8-vorbis.webm
ffmpeg $q $V $A $T -c:v libx264 -pix_fmt yuv420p -c:a aac mkv-h264-aac.mkv
ffmpeg $q $V $A $T -c:v prores_ks -profile:v 2 -c:a pcm_s16le mov-prores-pcm.mov
ffmpeg $q $V $A $T -c:v mpeg4 -vtag XVID -q:v 4 -c:a libmp3lame avi-mpeg4-mp3.avi
ffmpeg $q $A $T -c:a libmp3lame -b:a 192k audio.mp3
ffmpeg $q $A $T -c:a aac -b:a 160k audio.m4a
ffmpeg $q $A $T -c:a flac audio.flac
ffmpeg $q $A $T -c:a pcm_s16le audio.wav
ffmpeg $q $A $T -c:a vorbis -strict -2 -ac 2 audio.ogg
ffmpeg $q $A $T -c:a libopus audio.opus
ls -la
