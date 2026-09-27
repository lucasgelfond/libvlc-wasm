/*****************************************************************************
 * compat.c: libc shims for the emscripten link
 *****************************************************************************
 * Copyright (C) 2026 Lucas Gelfond
 *
 * SPDX-License-Identifier: MIT
 * See LICENSE at the root of the libvlc-wasm repository. Linked into VLC,
 * which is (L)GPL, the resulting binary is distributed under the GPL.
 *****************************************************************************/

/* Symbols contribs expect from glibc that Emscripten's libc does not provide. */
#define _GNU_SOURCE
#include <sched.h>
#include <stddef.h>
#include <string.h>
#include <sys/types.h>
#include <unistd.h>

#include <emscripten/threading.h>

/* libgcrypt's entropy gatherer. getentropy() is limited to 256 bytes per call
 * and is backed by crypto.getRandomValues(). */
ssize_t getrandom(void *buf, size_t len, unsigned flags)
{
    (void) flags;
    unsigned char *p = buf;
    size_t left = len;
    while (left) {
        size_t n = left > 256 ? 256 : left;
        if (getentropy(p, n) != 0)
            return -1;
        p += n;
        left -= n;
    }
    return (ssize_t)len;
}

/* x264 sizes its thread pool from the CPU affinity mask (it treats emscripten
 * as Linux). Every logical core is available to a page's workers. */
int sched_getaffinity(pid_t pid, size_t size, cpu_set_t *set)
{
    (void) pid;
    memset(set, 0, size);
    int n = emscripten_num_logical_cores();
    for (int k = 0; k < n && (size_t)k < size * 8; k++)
        CPU_SET_S(k, size, set);
    return 0;
}
