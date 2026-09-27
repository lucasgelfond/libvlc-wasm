/*
 * webwindow: the "window" a webframe video output draws into.
 *
 * There is no native window in a browser -- the page draws the frames on its
 * own canvas -- but VLC routes pointer input through the vout's window: it
 * maps window coordinates onto the picture and hands them to whatever listens
 * (dvdnav's menu buttons, for one). Like wdummy, this reports the size VLC asks
 * for, so the window is exactly the picture; unlike wdummy, it publishes itself
 * in the player's wv_window_t so the bridge can report the page's mouse.
 *
 * Built out of tree and registered as a static module, like webframe.c; the
 * bridge selects it with the player's "window" variable and hands it the
 * struct through "webwindow-data".
 */
#ifdef HAVE_CONFIG_H
# include "config.h"
#endif

#include <vlc_common.h>
#include <vlc_plugin.h>
#include <vlc_window.h>

#include "shared.h"

static int Enable(vlc_window_t *wnd, const vlc_window_cfg_t *cfg)
{
    wv_window_t *w = wnd->sys;
    vlc_mutex_lock(&w->lock);
    w->wnd = wnd;
    w->width = cfg->width;
    w->height = cfg->height;
    vlc_mutex_unlock(&w->lock);
    vlc_window_ReportSize(wnd, cfg->width, cfg->height);
    return VLC_SUCCESS;
}

static void Resize(vlc_window_t *wnd, unsigned width, unsigned height)
{
    wv_window_t *w = wnd->sys;
    vlc_mutex_lock(&w->lock);
    w->width = width;
    w->height = height;
    vlc_mutex_unlock(&w->lock);
    vlc_window_ReportSize(wnd, width, height);
}

static void Disable(vlc_window_t *wnd)
{
    wv_window_t *w = wnd->sys;
    vlc_mutex_lock(&w->lock);
    if (w->wnd == wnd)
        w->wnd = NULL;
    vlc_mutex_unlock(&w->lock);
}

static const struct vlc_window_operations ops = {
    .enable = Enable,
    .disable = Disable,
    .resize = Resize,
    .destroy = Disable,
};

static int Open(vlc_window_t *wnd)
{
    wv_window_t *w = var_InheritAddress(wnd, "webwindow-data");
    if (w == NULL)
        return VLC_EGENERIC;
    wnd->type = VLC_WINDOW_TYPE_DUMMY;
    wnd->sys = w;
    wnd->ops = &ops;
    return VLC_SUCCESS;
}

vlc_module_begin()
    set_shortname("WebWindow")
    set_description("Pointer input from a web page's canvas")
    set_subcategory(SUBCAT_VIDEO_VOUT)
    set_capability("vout window", 0)
    set_callback(Open)
vlc_module_end()
