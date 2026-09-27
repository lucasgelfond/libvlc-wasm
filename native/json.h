/* A tiny append-only JSON writer: enough for track lists and metadata. */
#ifndef WV_JSON_H
#define WV_JSON_H

#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct { char *buf; size_t len, cap; bool comma; } json_t;

static void json_raw(json_t *j, const char *s, size_t n)
{
    if (j->len + n + 1 > j->cap) {
        size_t cap = j->cap ? j->cap : 256;
        while (cap < j->len + n + 1) cap *= 2;
        char *b = realloc(j->buf, cap);
        if (!b) return;
        j->buf = b; j->cap = cap;
    }
    memcpy(j->buf + j->len, s, n);
    j->len += n;
    j->buf[j->len] = '\0';
}
static void json_s(json_t *j, const char *s) { json_raw(j, s, strlen(s)); }

static void json_sep(json_t *j) { if (j->comma) json_s(j, ","); j->comma = true; }

static void json_str_value(json_t *j, const char *s)
{
    if (!s) { json_s(j, "null"); return; }
    json_s(j, "\"");
    for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
        char esc[8];
        switch (*p) {
        case '"':  json_s(j, "\\\""); break;
        case '\\': json_s(j, "\\\\"); break;
        case '\n': json_s(j, "\\n"); break;
        case '\r': json_s(j, "\\r"); break;
        case '\t': json_s(j, "\\t"); break;
        default:
            if (*p < 0x20) { snprintf(esc, sizeof esc, "\\u%04x", *p); json_s(j, esc); }
            else json_raw(j, (const char *)p, 1);
        }
    }
    json_s(j, "\"");
}

static void json_key(json_t *j, const char *k) { json_sep(j); json_str_value(j, k); json_s(j, ":"); j->comma = false; }
static void json_obj(json_t *j)  { json_sep(j); json_s(j, "{"); j->comma = false; }
static void json_arr(json_t *j)  { json_sep(j); json_s(j, "["); j->comma = false; }
static void json_end_obj(json_t *j) { json_s(j, "}"); j->comma = true; }
static void json_end_arr(json_t *j) { json_s(j, "]"); j->comma = true; }

static void json_kstr(json_t *j, const char *k, const char *v) { json_key(j, k); json_str_value(j, v); j->comma = true; }
static void json_knum(json_t *j, const char *k, double v)
{
    char b[40];
    json_key(j, k);
    snprintf(b, sizeof b, "%.17g", v);
    json_s(j, b);
    j->comma = true;
}
static void json_kbool(json_t *j, const char *k, bool v) { json_key(j, k); json_s(j, v ? "true" : "false"); j->comma = true; }
/* Opens an object/array as the value of key k. */
static void json_kobj(json_t *j, const char *k) { json_key(j, k); json_s(j, "{"); j->comma = false; }
static void json_karr(json_t *j, const char *k) { json_key(j, k); json_s(j, "["); j->comma = false; }

/* Returns the buffer (caller frees); never NULL. */
static char *json_take(json_t *j) { char *b = j->buf; if (!b) b = strdup(""); j->buf = NULL; return b; }

#endif
