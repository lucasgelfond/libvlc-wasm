/* Symbols contribs expect from glibc that Emscripten's libc does not provide. */
#include <stddef.h>
#include <sys/types.h>
#include <unistd.h>

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
