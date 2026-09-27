# Corpus results

Generated 2026-09-27T14:26:03.909Z by `node tests/verify-corpus.mjs`. Native = the browser's own
`<video>`/`<audio>` reached `loadeddata`. libvlc-wasm = played in headless Chromium with frames that have
content (pixel variance) and/or audible output (RMS through an AnalyserNode).

| sample | category | native chromium | native webkit | native firefox | libvlc-wasm | first frame | notes |
|---|---|---|---|---|---|---|---|
| RealVideo 3 + Cook | realmedia | no | no | no | ✅ plays | 812 ms |  |
| RealVideo G2 (SVT) | realmedia | no | no | no | ✅ plays | 102 ms | RealVideo G2 (2.0) |
| RealVideo 4 + Cook (rmvb) | realmedia | no | no | no | ✅ plays | 102 ms | RealVideo 9/10 (4.0), Cook Audio |
| RealAudio Cook | realmedia | no | no | no | ✅ plays |  | Cook Audio |
| RealAudio SIPR 8.5k | realmedia | no | no | no | ✅ plays | 706 ms | RealVideo G2 (2.0), RealAudio Sipr |
| RealAudio 28.8 | realmedia | no | no | no | ✅ plays |  |  |
| RealVideo 2 in Matroska | realmedia | no | no | no | ✅ plays | 102 ms | RealVideo G2 (2.0) |
| RealVideo 2 + SIPR (A/V sync bug) | realmedia | no | no | no | ✅ plays | 709 ms | RealVideo G2 (2.0), RealAudio Sipr |
| WMV8 X8 intra | windows-media | no | no | no | ✅ plays | 102 ms | Windows Media Video 8, Windows Media Audio 2 |
| WMV7 | windows-media | no | no | no | ✅ plays | 103 ms | Windows Media Video 7, Windows Media Audio 2 |
| WMV9 / VC-1 simple/main raw (.rcv) | windows-media | no | no | no | ✅ plays | 102 ms |  |
| MS-MPEG4 v3 (DivX ;-) ) in ASF | windows-media | no | no | no | ✅ plays | 102 ms |  |
| WMA Voice 11k | windows-media | no | no | no | ✅ plays |  | Windows Media Audio Voice (Speech) |
| WMA Lossless 24-bit | windows-media | no | no | no | ✅ plays |  |  |
| MS Screen Codec 2 (WMV9 Screen) | windows-media | no | no | no | ✅ plays | 101 ms |  |
| MS-MPEG4 v1 | avi-era-codecs | no | no | no | ✅ plays | 102 ms |  |
| XviD + MP3 | avi-era-codecs | no | no | no | ⚠️ known issue | 101 ms | known issue: VLC 4 mpegaudio packetizer never syncs on this truncated AVI (VLC 3 does); a clean XviD+MP3 AVI plays |
| DivX 5 + MP3 | avi-era-codecs | no | no | no | ➖ VLC can't either | 102 ms | native VLC 3.0.24 decodes no audio from this truncated, index-less AVI either |
| Cinepak | avi-era-codecs | no | no | no | ✅ plays | 101 ms | Cinepak Video, PCM U8 |
| Indeo 3 | quicktime-and-3gp | no | no | no | ✅ plays | 102 ms |  |
| Indeo 4 (partial) | avi-era-codecs | no | no | no | ✅ plays | 101 ms | Indeo Video v4, PCM U8 |
| Indeo 5 | avi-era-codecs | no | no | no | ✅ plays | 102 ms | Indeo Video v5, PCM S16 LE |
| Motion-JPEG + mu-law (10 MB) | avi-era-codecs | no | no | no | ✅ plays | 102 ms | Motion JPEG Video, PCM MU-LAW |
| DVCPRO HD 720p50 | quicktime-and-3gp | no | no | no | ✅ plays | 102 ms |  |
| On2 VP5 + Speex | avi-era-codecs | no | no | no | ✅ plays | 102 ms | On2's VP5 Video, Speex Audio |
| DVD VOB single frame + DVD subs | subtitles-and-captions | no | yes | no | ✅ plays | 101 ms |  |
| MPEG-1 system stream | mpeg-ps-ts | no | yes | no | ✅ plays | 102 ms |  |
| DVD VOB MPEG-2 + AC-3 (5 MB) | mpeg-ps-ts | no | yes | no | ✅ plays | 101 ms | MPEG-1/2 Video, Audio Coding 3 (AC-3) |
| MPEG-2 field-encoded TS | mpeg-ps-ts | no | yes | no | ✅ plays | 102 ms |  |
| DTS in MPEG-TS | mpeg-ps-ts | no | no | no | ➖ VLC can't either |  | native VLC 3.0.24 also produces no audio from this sample |
| Flash VP6 (Sorenson/On2) | quicktime-and-3gp | no | no | no | ✅ plays | 102 ms | On2's VP6.2 Video (Flash) |
| FLV with H.264/AAC | flash | no | no | no | ✅ plays | 102 ms | H264 - MPEG-4 AVC (part 10), MPEG AAC Audio |
| VP6F + Nellymoser | flash | no | no | no | ✅ plays | 102 ms | On2's VP6.2 Video (Flash), NellyMoser ASAO |
| 3GPP H.263 + AMR-NB | quicktime-and-3gp | no | yes | no | ✅ plays | 102 ms | H263, AMR narrow band |
| 3GP H.263 phone clip | quicktime-and-3gp | no | yes | no | ✅ plays | 102 ms |  |
| Sorenson Video 1 | quicktime-and-3gp | yes | no | no | ✅ plays | 101 ms | SVQ-1 (Sorenson Video v1), PCM U8 |
| Sorenson Video 3 | quicktime-and-3gp | no | no | no | ✅ plays | 101 ms |  |
| QDesign Music 2 | quicktime-and-3gp | no | no | no | ✅ plays |  | QDM2 Audio |
| IMA4 ADPCM | quicktime-and-3gp | no | yes | no | ✅ plays |  | IMA QT ADPCM Audio |
| MACE 3:1 | quicktime-and-3gp | no | no | no | ✅ plays |  | MACE-3 Audio |
| Smacker | game-and-oddball-video | no | no | no | ✅ plays | 102 ms | Smacker Video, Smacker audio |
| Bink video | game-and-oddball-video | no | no | no | ✅ plays | 102 ms |  |
| id RoQ (Quake 3 logo) | game-and-oddball-video | no | no | no | ✅ plays | 102 ms | Id RoQ Video, Id RoQ DPCM Audio |
| Autodesk FLIC 640x480 | game-and-oddball-video | no | no | no | ✅ plays | 102 ms |  |
| Autodesk FLC 320x200 | game-and-oddball-video | no | no | no | ✅ plays | 102 ms | Flic Video |
| NuppelVideo (MythTV) | game-and-oddball-video | no | no | no | ✅ plays | 102 ms |  |
| Vivo 2 (VivoActive) | game-and-oddball-video | no | no | no | ➖ VLC can't either |  | video is a proprietary H.263 variant that FFmpeg cannot decode either; the Siren audio plays (patches/0010) |
| PlayStation STR (MDEC + XA) | game-and-oddball-video | no | no | no | ✅ plays | 102 ms | PSX MDEC Video, PSX XA ADPCM Audio |
| AC-3 5.1 448k | rare-and-surround-audio | no | yes | no | ✅ plays |  |  |
| E-AC-3 5.1 with SPX | rare-and-surround-audio | no | yes | no | ✅ plays |  |  |
| DTS-ES | rare-and-surround-audio | no | no | no | ✅ plays |  |  |
| Dolby TrueHD Atmos (8ch) | rare-and-surround-audio | no | no | no | ✅ plays |  |  |
| MLP 440 Hz | rare-and-surround-audio | no | no | no | ✅ plays |  | MLP/TrueHD Audio |
| Musepack SV8 | rare-and-surround-audio | no | no | no | ✅ plays |  | MUSEPACK8 Audio |
| Musepack SV7 | rare-and-surround-audio | no | no | no | ✅ plays |  | MUSEPACK7 Audio |
| Monkey's Audio | rare-and-surround-audio | no | no | no | ✅ plays |  |  |
| True Audio (6.6 MB) | rare-and-surround-audio | no | no | no | ✅ plays |  | The Lossless True Audio |
| AMR-NB 12.2k | rare-and-surround-audio | no | yes | no | ✅ plays |  | AMR narrow band |
| Shorten | rare-and-surround-audio | no | no | no | ➖ VLC can't either |  | native VLC 3.0.24 also cannot play Shorten (no demuxer claims it) |
| HEVC Main10 Dolby Vision P7 in MKV | modern-codecs | no | no | yes | ✅ plays | 203 ms |  |
| DVB subtitles in TS | subtitles-and-captions | no | no | no | ➖ VLC can't either |  | a subtitle-only fragment: its video and audio PIDs carry no packets, so there is no picture to show (FFmpeg's DVB-subtitle test fixture) |
| VobSub (.idx + .sub) over a video | subtitles-and-captions | — | — | — | ✅ plays | 107 ms | MPEG-1/2 Video, Audio Coding 3 (AC-3), DVD Subtitles |
| MPEG-2 ES with EIA-608 closed captions | subtitles-and-captions | no | yes | no | ✅ plays | 101 ms | MPEG-1/2 Video, EIA-608 subtitles, EIA-608 subtitles, EIA-608 subtitles, EIA-608 subtitles |
| MPEG-4 ASP + Vorbis + 16 ASS/SSA tracks | subtitles-and-captions | yes | no | yes | ✅ plays | 102 ms | MPEG-4 Video, Vorbis Audio, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles, SubStation Alpha subtitles |
| H.264 + 2x MP3 + VobSub in MKV | subtitles-and-captions | yes | no | yes | ✅ plays | 102 ms | H264 - MPEG-4 AVC (part 10), MPEG Audio layer 1/2, MPEG Audio layer 1/2, DVD Subtitles |
| SNES SPC | chiptune-tracker-midi | no | no | no | ✅ plays |  | PCM S16 LE |
| NES NSF (Tetris GB rip) | chiptune-tracker-midi | no | no | no | ✅ plays |  | PCM S16 LE |
| Sega Genesis VGZ (gzip VGM) | chiptune-tracker-midi | no | no | no | ➖ VLC can't either |  | native VLC 3.0.24 also fails: after gunzip, the AIFF probe claims the stream before gme |
| C64 SID (Rob Hubbard - Commando) | chiptune-tracker-midi | no | no | no | ➖ VLC can't either |  | sidplay2 is disabled in VLC's upstream emscripten contrib set |
| Standard MIDI file | chiptune-tracker-midi | no | no | no | ✅ plays |  | MIDI Audio |
| AXELF.MOD (15-sample Soundtracker, no M.K. tag) | chiptune-tracker-midi | no | yes | no | ✅ plays |  | PCM S16 LE |
| external.xm | chiptune-tracker-midi | no | no | no | ✅ plays |  | PCM S16 LE |
| Sandman.s3m | chiptune-tracker-midi | no | no | no | ✅ plays |  | PCM S16 LE |
| For A Change.it | chiptune-tracker-midi | no | no | no | ✅ plays |  | PCM S16 LE |
| OpenMPT test.xm | chiptune-tracker-midi | no | no | no | ✅ plays |  | PCM S16 LE |
