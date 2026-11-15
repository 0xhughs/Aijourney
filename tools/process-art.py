#!/usr/bin/env python3
"""
Cleanly extract RGBA cutouts from solid-background renders (border-seeded flood fill +
soft anti-aliased edge ramp + color spill decontamination), crop with uniform padding,
and export optimized transparent WebP files + favicon.
"""
import os
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

BRAIN = os.environ.get("RAW_ART_DIR", os.path.join(os.path.dirname(__file__), "raw-art"))
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets"))

ASSETS = [
    # (src_filename, dest_relpath, target_size, is_lapis_bg)
    ("char_fanak_1794757553616.jpg", "characters/fanak.webp", 640, True),
    ("char_fanak_celebrate_1794757573783.jpg", "characters/fanak_celebrate.webp", 640, True),
    ("char_fanak_think_1794757582601.jpg", "characters/fanak_think.webp", 640, True),
    ("char_hughes_1794757605806.jpg", "characters/hughes.webp", 640, False),
    ("char_hasoub_1794757620288.jpg", "characters/hasoub.webp", 640, False),
    ("char_sanad_1794757629458.jpg", "characters/sanad.webp", 640, False),
    ("char_reem_1794757658741.jpg", "characters/reem.webp", 640, False),
    ("char_hudhud_1794757667082.jpg", "characters/hudhud.webp", 640, False),
    ("icon_u01_1794757674945.jpg", "icons/u01.webp", 384, False),
    ("icon_u02_1794757683789.jpg", "icons/u02.webp", 384, False),
    ("icon_u03_1794757715158.jpg", "icons/u03.webp", 384, False),
    ("icon_u04_1794757723431.jpg", "icons/u04.webp", 384, False),
    ("icon_u05_1794757733003.jpg", "icons/u05.webp", 384, False),
    ("icon_u06_1794757742081.jpg", "icons/u06.webp", 384, False),
    ("icon_u07_1794757832206.jpg", "icons/u07.webp", 384, False),
    ("icon_u08_1794757782181.jpg", "icons/u08.webp", 384, False),
    ("icon_u09_1794757839007.jpg", "icons/u09.webp", 384, False),
    ("icon_u10_1794757796843.jpg", "icons/u10.webp", 384, False),
    ("icon_certificate_1794757847919.jpg", "icons/certificate.webp", 384, False),
    ("icon_gem_1794757856216.jpg", "icons/gem.webp", 256, False),
    ("icon_headphones_1794757905561.jpg", "icons/headphones.webp", 256, False),
    ("icon_lantern_1794757888826.jpg", "icons/lantern.webp", 256, False),
    ("icon_lock_1794757880908.jpg", "icons/lock.webp", 256, False),
    ("icon_star_1794757896910.jpg", "icons/star.webp", 256, False),
]


def cutout(img: Image.Image, is_lapis: bool) -> Image.Image:
    rgb = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w, _ = rgb.shape
    # Estimate background color from outer border median
    border = np.concatenate([
        rgb[0:6, :, :].reshape(-1, 3),
        rgb[-6:, :, :].reshape(-1, 3),
        rgb[:, 0:6, :].reshape(-1, 3),
        rgb[:, -6:, :].reshape(-1, 3),
    ], axis=0)
    bg = np.median(border, axis=0)
    dist = np.linalg.norm(rgb - bg, axis=2)

    # Flood-fill from border pixels where color distance to bg is small
    hard_tol = 38.0 if is_lapis else 24.0
    soft_hi = 72.0 if is_lapis else 46.0

    cand = dist < hard_tol
    bg_mask = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        if cand[0, x]:
            bg_mask[0, x] = True
            q.append((0, x))
        if cand[h - 1, x]:
            bg_mask[h - 1, x] = True
            q.append((h - 1, x))
    for y in range(h):
        if cand[y, 0] and not bg_mask[y, 0]:
            bg_mask[y, 0] = True
            q.append((y, 0))
        if cand[y, w - 1] and not bg_mask[y, w - 1]:
            bg_mask[y, w - 1] = True
            q.append((y, w - 1))

    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and not bg_mask[ny, nx] and cand[ny, nx]:
                bg_mask[ny, nx] = True
                q.append((ny, nx))

    # Also catch enclosed holes in icons (like inside padlock shackle, magnifying glass handle/arrows loop)
    # ONLY for white background where enclosed pure-white holes (>250 brightness, low saturation) are clearly bg
    if not is_lapis:
        pure_white = (dist < 12.0) & (rgb.min(axis=2) > 245.0)
        # Keep lens glass slightly translucent rather than punched out only if desired; actually pure white >245 with dist<12 is background hole (like inside U06 loop, padlock shackle, lantern ring, hudhud wing gaps)
        bg_mask = bg_mask | pure_white

    # Dilate bg_mask by 3px to find boundary band where soft alpha ramp applies
    bg_pil = Image.fromarray((bg_mask * 255).astype(np.uint8))
    dilated = np.asarray(bg_pil.filter(ImageFilter.MaxFilter(7))) > 0
    edge_band = dilated & (~bg_mask)

    alpha = np.ones((h, w), dtype=np.float32)
    alpha[bg_mask] = 0.0
    ramp = np.clip((dist - (hard_tol * 0.65)) / (soft_hi - hard_tol * 0.65), 0.0, 1.0)
    alpha[edge_band] = ramp[edge_band]

    # Mild Gaussian smoothing on alpha only at edge band to avoid stair-stepping
    alpha_img = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius=0.85))
    alpha_s = np.asarray(alpha_img, dtype=np.float32) / 255.0
    alpha_s[bg_mask] = 0.0
    interior = (~dilated)
    alpha_s[interior] = 1.0

    # Color decontamination along semi-transparent boundary pixels:
    # C_obs = a * C_fg + (1 - a) * bg  =>  C_fg = (C_obs - (1 - a) * bg) / a
    out_rgb = rgb.copy()
    semi = (alpha_s > 0.04) & (alpha_s < 0.98)
    a_exp = alpha_s[semi][:, None]
    unmixed = (out_rgb[semi] - (1.0 - a_exp) * bg[None, :]) / np.maximum(a_exp, 0.2)
    out_rgb[semi] = np.clip(unmixed, 0, 255)

    rgba = np.dstack([out_rgb.astype(np.uint8), (alpha_s * 255).astype(np.uint8)])
    res = Image.fromarray(rgba, mode="RGBA")

    # Tight bbox crop + 5% square padding
    bbox = res.getbbox()
    if bbox:
        cropped = res.crop(bbox)
        cw, ch = cropped.size
        side = int(max(cw, ch) * 1.08)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(cropped, ((side - cw) // 2, (side - ch) // 2), cropped)
        res = canvas
    return res


def main():
    os.makedirs(os.path.join(OUT, "characters"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "icons"), exist_ok=True)
    for src, dst, size, is_lapis in ASSETS:
        src_path = os.path.join(BRAIN, src)
        dst_path = os.path.join(OUT, dst)
        im = Image.open(src_path)
        cut = cutout(im, is_lapis)
        cut = cut.resize((size, size), Image.Resampling.LANCZOS)
        cut.save(dst_path, "WEBP", quality=90, method=6)
        print(f"ok {dst} ({os.path.getsize(dst_path)//1024} KB)")

    # Favicon from fanak
    fanak = Image.open(os.path.join(OUT, "characters/fanak.webp"))
    fav = fanak.resize((128, 128), Image.Resampling.LANCZOS)
    fav.save(os.path.join(OUT, "favicon.png"), "PNG")
    print("ok favicon.png")


if __name__ == "__main__":
    main()
