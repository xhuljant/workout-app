"""Regenerate the app icons in backend/static/.

One-off asset build -- NOT part of the app or its runtime deps. Pillow is only
needed to run this.

    python -m venv .venv && .venv/Scripts/pip install pillow
    .venv/Scripts/python tools/gen_icons.py

Draws a plain geometric dumbbell (bar + two plates + two end caps) in the app's
accent blue. The SVG favicon is written by hand in backend/static/favicon.svg;
this script rasterises the same shape for the .ico and the PWA / Apple icons.
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

STATIC = os.path.join(os.path.dirname(__file__), "..", "backend", "static")

ACCENT = (47, 129, 247, 255)      # --accent #2f81f7
BG = (11, 11, 13, 255)            # theme_color / background_color #0b0b0d
SS = 8                            # supersample factor for smooth edges

# Dumbbell geometry as fractions of the glyph box (a square of side `span`).
# x runs 0..1 left->right, y 0..1 top->bottom, bar centred on y=0.5.
BAR = dict(x0=0.30, x1=0.70, half_t=0.055)
PLATE = dict(w=0.105, half_h=0.24, cx=(0.245, 0.755))
CAP = dict(w=0.085, half_h=0.135, cx=(0.150, 0.850))


def _rrect(draw: ImageDraw.ImageDraw, cx, cy, w, h, r, box, off):
    """Rounded rect centred at (cx, cy); all args are glyph-box fractions."""
    px = lambda v: off + v * box
    draw.rounded_rectangle(
        [px(cx - w / 2), px(cy - h / 2), px(cx + w / 2), px(cy + h / 2)],
        radius=r * box,
        fill=ACCENT,
    )


def _draw_dumbbell(size: int, *, glyph_scale: float, bg) -> Image.Image:
    hi = size * SS
    img = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if bg is not None:
        d.rounded_rectangle([0, 0, hi - 1, hi - 1], radius=0.18 * hi, fill=bg)

    box = hi * glyph_scale
    off = (hi - box) / 2

    # bar
    d.rounded_rectangle(
        [off + BAR["x0"] * box, off + (0.5 - BAR["half_t"]) * box,
         off + BAR["x1"] * box, off + (0.5 + BAR["half_t"]) * box],
        radius=BAR["half_t"] * box, fill=ACCENT,
    )
    # plates + end caps, mirrored
    for cx in PLATE["cx"]:
        _rrect(d, cx, 0.5, PLATE["w"], PLATE["half_h"] * 2, 0.028, box, off)
    for cx in CAP["cx"]:
        _rrect(d, cx, 0.5, CAP["w"], CAP["half_h"] * 2, 0.022, box, off)

    return img.resize((size, size), Image.LANCZOS)


def save_png(name, size, *, glyph_scale, bg):
    path = os.path.join(STATIC, name)
    _draw_dumbbell(size, glyph_scale=glyph_scale, bg=bg).save(path)
    print("wrote", os.path.normpath(path))


def save_ico(name):
    path = os.path.join(STATIC, name)
    base = _draw_dumbbell(256, glyph_scale=0.94, bg=None)
    base.save(path, sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("wrote", os.path.normpath(path))


if __name__ == "__main__":
    # Transparent, glyph nearly full-bleed -- these render tiny in a browser tab.
    save_ico("favicon.ico")
    # PWA "any": opaque dark tile, comfortable margin.
    save_png("icon-192.png", 192, glyph_scale=0.80, bg=BG)
    save_png("icon-512.png", 512, glyph_scale=0.80, bg=BG)
    # PWA "maskable": launcher crops to a circle -- keep the glyph well inside.
    save_png("icon-512-maskable.png", 512, glyph_scale=0.62, bg=BG)
    # iOS home screen: opaque, no transparency; iOS rounds the corners itself.
    save_png("apple-touch-icon.png", 180, glyph_scale=0.76, bg=BG)
