/*
 * wasm2c-wasi-host.c - the smallest WASI preview1 host that decode.wasm needs,
 * for running wasm2c output natively. wabt ships no WASI implementation, so
 * this provides the 22 imports decode.wasm has (see `wasm-objdump -x -j Import`).
 *
 * Usage: decode-wasm2c <host dir> <guest path> [args...]
 *   <host dir> is preopened as "/media" (guest fd == the host directory fd).
 *
 * Scope: a benchmark harness, not a sandbox. Guest fds are host fds, paths are
 * resolved with openat() against the preopened directory without ".." checks,
 * and calls decode.wasm never makes (readdir, poll, rename, ...) return ENOSYS.
 * Memory is bounds-checked by wasm-rt (guard pages), which is the part that
 * matters for performance parity with the other runtimes.
 */
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/uio.h>
#include <time.h>
#include <unistd.h>

#include "decode.h"
#include "wasm-rt-exceptions.h"
#include "wasm-rt-impl.h"

#define W_SUCCESS 0
#define W_ACCES 2
#define W_BADF 8
#define W_EXIST 20
#define W_INVAL 28
#define W_IO 29
#define W_ISDIR 31
#define W_NOENT 44
#define W_NOSYS 52
#define W_NOTDIR 54

struct w2c_wasi__snapshot__preview1 {
    wasm_rt_memory_t *mem;
    int argc;
    char **argv;
    int dirfd;
    const char *guest_dir;
};

static u8 *M(struct w2c_wasi__snapshot__preview1 *w, u32 off, u32 len)
{
    if ((u64)off + len > w->mem->size) {
        fprintf(stderr, "wasi host: out-of-bounds guest pointer %u+%u\n", off, len);
        abort();
    }
    return w->mem->data + off;
}
static void st16(u8 *p, u16 v) { memcpy(p, &v, 2); }
static void st32(u8 *p, u32 v) { memcpy(p, &v, 4); }
static void st64(u8 *p, u64 v) { memcpy(p, &v, 8); }
static u32 ld32(const u8 *p) { u32 v; memcpy(&v, p, 4); return v; }

static u32 werr(int e)
{
    switch (e) {
    case EACCES: case EPERM: return W_ACCES;
    case EBADF: return W_BADF;
    case EEXIST: return W_EXIST;
    case EINVAL: return W_INVAL;
    case EISDIR: return W_ISDIR;
    case ENOENT: return W_NOENT;
    case ENOTDIR: return W_NOTDIR;
    default: return W_IO;
    }
}

static u8 ftype(mode_t m)
{
    if (S_ISREG(m)) return 4;
    if (S_ISDIR(m)) return 3;
    if (S_ISCHR(m)) return 2;
    if (S_ISBLK(m)) return 1;
    if (S_ISLNK(m)) return 7;
    return 0;
}

static void put_filestat(u8 *b, const struct stat *s)
{
    memset(b, 0, 64);
    st64(b + 0, (u64)s->st_dev);
    st64(b + 8, (u64)s->st_ino);
    b[16] = ftype(s->st_mode);
    st64(b + 24, (u64)s->st_nlink);
    st64(b + 32, (u64)s->st_size);
    st64(b + 40, (u64)s->st_atimespec.tv_sec * 1000000000ull + s->st_atimespec.tv_nsec);
    st64(b + 48, (u64)s->st_mtimespec.tv_sec * 1000000000ull + s->st_mtimespec.tv_nsec);
    st64(b + 56, (u64)s->st_ctimespec.tv_sec * 1000000000ull + s->st_ctimespec.tv_nsec);
}

/* -- args / environ ------------------------------------------------------ */
u32 w2c_wasi__snapshot__preview1_args_sizes_get(struct w2c_wasi__snapshot__preview1 *w, u32 pargc, u32 pbuf)
{
    u32 n = 0;
    for (int i = 0; i < w->argc; i++) n += strlen(w->argv[i]) + 1;
    st32(M(w, pargc, 4), w->argc);
    st32(M(w, pbuf, 4), n);
    return W_SUCCESS;
}
u32 w2c_wasi__snapshot__preview1_args_get(struct w2c_wasi__snapshot__preview1 *w, u32 pargv, u32 pbuf)
{
    for (int i = 0; i < w->argc; i++) {
        u32 len = strlen(w->argv[i]) + 1;
        memcpy(M(w, pbuf, len), w->argv[i], len);
        st32(M(w, pargv + 4 * i, 4), pbuf);
        pbuf += len;
    }
    return W_SUCCESS;
}
u32 w2c_wasi__snapshot__preview1_environ_sizes_get(struct w2c_wasi__snapshot__preview1 *w, u32 pn, u32 pbuf)
{
    st32(M(w, pn, 4), 0);
    st32(M(w, pbuf, 4), 0);
    return W_SUCCESS;
}
u32 w2c_wasi__snapshot__preview1_environ_get(struct w2c_wasi__snapshot__preview1 *w, u32 a, u32 b)
{
    (void)w; (void)a; (void)b;
    return W_SUCCESS;
}

/* -- clock --------------------------------------------------------------- */
u32 w2c_wasi__snapshot__preview1_clock_time_get(struct w2c_wasi__snapshot__preview1 *w, u32 id, u64 prec, u32 pt)
{
    (void)prec;
    static const clockid_t ids[] = { CLOCK_REALTIME, CLOCK_MONOTONIC, CLOCK_PROCESS_CPUTIME_ID, CLOCK_THREAD_CPUTIME_ID };
    if (id > 3) return W_INVAL;
    struct timespec ts;
    if (clock_gettime(ids[id], &ts)) return werr(errno);
    st64(M(w, pt, 8), (u64)ts.tv_sec * 1000000000ull + ts.tv_nsec);
    return W_SUCCESS;
}

/* -- fds ----------------------------------------------------------------- */
u32 w2c_wasi__snapshot__preview1_fd_prestat_get(struct w2c_wasi__snapshot__preview1 *w, u32 fd, u32 pbuf)
{
    if ((int)fd != w->dirfd) return W_BADF;
    u8 *b = M(w, pbuf, 8);
    memset(b, 0, 8);
    st32(b + 4, strlen(w->guest_dir));
    return W_SUCCESS;
}
u32 w2c_wasi__snapshot__preview1_fd_prestat_dir_name(struct w2c_wasi__snapshot__preview1 *w, u32 fd, u32 p, u32 len)
{
    if ((int)fd != w->dirfd) return W_BADF;
    size_t n = strlen(w->guest_dir);
    if (len < n) return W_INVAL;
    memcpy(M(w, p, n), w->guest_dir, n);
    return W_SUCCESS;
}
u32 w2c_wasi__snapshot__preview1_fd_fdstat_get(struct w2c_wasi__snapshot__preview1 *w, u32 fd, u32 pbuf)
{
    struct stat s;
    if (fstat(fd, &s)) return werr(errno);
    u8 *b = M(w, pbuf, 24);
    memset(b, 0, 24);
    b[0] = ftype(s.st_mode);
    st16(b + 2, 0);
    st64(b + 8, ~0ull);  /* all rights */
    st64(b + 16, ~0ull);
    return W_SUCCESS;
}
u32 w2c_wasi__snapshot__preview1_fd_fdstat_set_flags(struct w2c_wasi__snapshot__preview1 *w, u32 fd, u32 f)
{
    (void)w; (void)fd; (void)f;
    return W_NOSYS;
}
u32 w2c_wasi__snapshot__preview1_fd_filestat_get(struct w2c_wasi__snapshot__preview1 *w, u32 fd, u32 pbuf)
{
    struct stat s;
    if (fstat(fd, &s)) return werr(errno);
    put_filestat(M(w, pbuf, 64), &s);
    return W_SUCCESS;
}
u32 w2c_wasi__snapshot__preview1_fd_close(struct w2c_wasi__snapshot__preview1 *w, u32 fd)
{
    if ((int)fd == w->dirfd || fd < 3) return W_SUCCESS;
    return close(fd) ? werr(errno) : W_SUCCESS;
}

static u32 do_iov(struct w2c_wasi__snapshot__preview1 *w, u32 fd, u32 piov, u32 n, u32 pnout, int wr)
{
    struct iovec iov[64];
    if (n > 64) n = 64;
    for (u32 i = 0; i < n; i++) {
        u8 *e = M(w, piov + 8 * i, 8);
        u32 base = ld32(e), len = ld32(e + 4);
        iov[i].iov_base = M(w, base, len);
        iov[i].iov_len = len;
    }
    ssize_t r = wr ? writev(fd, iov, n) : readv(fd, iov, n);
    if (r < 0) return werr(errno);
    st32(M(w, pnout, 4), (u32)r);
    return W_SUCCESS;
}
u32 w2c_wasi__snapshot__preview1_fd_read(struct w2c_wasi__snapshot__preview1 *w, u32 fd, u32 iov, u32 n, u32 out)
{
    return do_iov(w, fd, iov, n, out, 0);
}
u32 w2c_wasi__snapshot__preview1_fd_write(struct w2c_wasi__snapshot__preview1 *w, u32 fd, u32 iov, u32 n, u32 out)
{
    return do_iov(w, fd, iov, n, out, 1);
}
u32 w2c_wasi__snapshot__preview1_fd_seek(struct w2c_wasi__snapshot__preview1 *w, u32 fd, u64 off, u32 whence, u32 pout)
{
    if (whence > 2) return W_INVAL;
    off_t r = lseek(fd, (off_t)off, whence == 0 ? SEEK_SET : whence == 1 ? SEEK_CUR : SEEK_END);
    if (r < 0) return werr(errno);
    st64(M(w, pout, 8), (u64)r);
    return W_SUCCESS;
}
u32 w2c_wasi__snapshot__preview1_fd_readdir(struct w2c_wasi__snapshot__preview1 *w, u32 a, u32 b, u32 c, u64 d, u32 e)
{
    (void)w; (void)a; (void)b; (void)c; (void)d; (void)e;
    return W_NOSYS;
}

/* -- paths --------------------------------------------------------------- */
static char *gpath(struct w2c_wasi__snapshot__preview1 *w, u32 p, u32 len, char *buf, size_t cap)
{
    if (len >= cap) return NULL;
    memcpy(buf, M(w, p, len), len);
    buf[len] = 0;
    return buf;
}
u32 w2c_wasi__snapshot__preview1_path_open(struct w2c_wasi__snapshot__preview1 *w, u32 dirfd, u32 lookup,
                                           u32 p, u32 plen, u32 oflags, u64 rights, u64 rights_inh,
                                           u32 fdflags, u32 pfd)
{
    (void)lookup; (void)rights_inh; (void)fdflags;
    char buf[4096];
    if (!gpath(w, p, plen, buf, sizeof buf)) return W_INVAL;
    int fl = O_CLOEXEC;
    int want_write = (rights & (1ull << 6)) != 0; /* fd_write right */
    fl |= want_write ? O_RDWR : O_RDONLY;
    if (oflags & 1) fl |= O_CREAT;
    if (oflags & 2) fl |= O_DIRECTORY;
    if (oflags & 4) fl |= O_EXCL;
    if (oflags & 8) fl |= O_TRUNC;
    int fd = openat(dirfd, buf, fl, 0644);
    if (fd < 0 && want_write && errno == EISDIR)
        fd = openat(dirfd, buf, (fl & ~O_RDWR) | O_RDONLY, 0644);
    if (fd < 0) return werr(errno);
    st32(M(w, pfd, 4), fd);
    return W_SUCCESS;
}
u32 w2c_wasi__snapshot__preview1_path_filestat_get(struct w2c_wasi__snapshot__preview1 *w, u32 dirfd, u32 flags,
                                                   u32 p, u32 plen, u32 pbuf)
{
    char buf[4096];
    if (!gpath(w, p, plen, buf, sizeof buf)) return W_INVAL;
    struct stat s;
    if (fstatat(dirfd, buf, &s, (flags & 1) ? 0 : AT_SYMLINK_NOFOLLOW)) return werr(errno);
    put_filestat(M(w, pbuf, 64), &s);
    return W_SUCCESS;
}
u32 w2c_wasi__snapshot__preview1_path_remove_directory(struct w2c_wasi__snapshot__preview1 *w, u32 a, u32 b, u32 c)
{
    (void)w; (void)a; (void)b; (void)c;
    return W_NOSYS;
}
u32 w2c_wasi__snapshot__preview1_path_unlink_file(struct w2c_wasi__snapshot__preview1 *w, u32 a, u32 b, u32 c)
{
    (void)w; (void)a; (void)b; (void)c;
    return W_NOSYS;
}
u32 w2c_wasi__snapshot__preview1_path_rename(struct w2c_wasi__snapshot__preview1 *w, u32 a, u32 b, u32 c, u32 d,
                                             u32 e, u32 f)
{
    (void)w; (void)a; (void)b; (void)c; (void)d; (void)e; (void)f;
    return W_NOSYS;
}
u32 w2c_wasi__snapshot__preview1_poll_oneoff(struct w2c_wasi__snapshot__preview1 *w, u32 a, u32 b, u32 c, u32 d)
{
    (void)w; (void)a; (void)b; (void)c; (void)d;
    return W_NOSYS;
}
void w2c_wasi__snapshot__preview1_proc_exit(struct w2c_wasi__snapshot__preview1 *w, u32 code)
{
    (void)w;
    fflush(stdout);
    exit((int)code);
}

int main(int argc, char **argv)
{
    if (argc < 3) {
        fprintf(stderr, "usage: %s <host dir preopened as /media> <guest args...>\n", argv[0]);
        return 2;
    }
    static struct w2c_wasi__snapshot__preview1 wasi;
    /* opened first so it gets the lowest free fd; wasi-libc scans prestats
     * upward from 3 and stops at the first EBADF */
    wasi.dirfd = open(argv[1], O_RDONLY | O_DIRECTORY);
    if (wasi.dirfd < 0) {
        perror(argv[1]);
        return 1;
    }
    wasi.guest_dir = "/media";
    argv[1] = "decode";
    wasi.argc = argc - 1;
    wasi.argv = argv + 1;

    wasm_rt_init();
    static w2c_decode inst;
    wasm2c_decode_instantiate(&inst, &wasi);
    wasi.mem = w2c_decode_memory(&inst);

    wasm_rt_trap_t trap = wasm_rt_impl_try();
    if (trap) {
        fprintf(stderr, "trap: %s\n", wasm_rt_strerror(trap));
        return 1;
    }
    w2c_decode_0x5Fstart(&inst);
    wasm2c_decode_free(&inst);
    wasm_rt_free();
    return 0;
}
