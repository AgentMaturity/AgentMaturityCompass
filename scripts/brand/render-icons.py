"""Render AMC icon files from the 400px logo (website/amc-logo.png): python3 scripts/brand/render-icons.py

The logo is three flat colours, so it is enlarged, split back into its white and green shapes by threshold, and
shrunk again; that gives clean edges at 1024px, which a plain resize of a 400px file does not. macOS only for the
.icns step (iconutil); the PNG and .ico files render anywhere Pillow and numpy are installed.
"""
import subprocess, sys, tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
BG, WHITE, GREEN = (10, 10, 10), (255, 255, 255), (74, 239, 121)
OVERSAMPLE = 4


def master(size: int) -> Image.Image:
    """The full-bleed square logo at `size` px."""
    big = size * OVERSAMPLE
    src = np.asarray(Image.open(ROOT / "website/amc-logo.png").convert("RGB").resize((big, big), Image.BICUBIC)
                     .filter(ImageFilter.GaussianBlur(big / 400 * 0.9))).astype(int)
    r, g, b = src[..., 0], src[..., 1], src[..., 2]
    green = (g - np.maximum(r, b)) > 60
    white = (np.minimum(np.minimum(r, g), b) > 128) & ~green
    out = np.empty((big, big, 3), dtype=np.uint8)
    out[:] = BG
    out[white] = WHITE
    out[green] = GREEN
    return Image.fromarray(out).resize((size, size), Image.LANCZOS)


def rounded(logo: Image.Image, canvas: int, body: int, radius: int) -> Image.Image:
    """The logo on a rounded tile with a transparent margin (the macOS app icon shape)."""
    scale = OVERSAMPLE
    mask = Image.new("L", (body * scale, body * scale), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, body * scale - 1, body * scale - 1), radius * scale, fill=255)
    tile = logo.resize((body, body), Image.LANCZOS).convert("RGBA")
    tile.putalpha(mask.resize((body, body), Image.LANCZOS))
    icon = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    icon.alpha_composite(tile, ((canvas - body) // 2, (canvas - body) // 2))
    return icon


def main() -> None:
    logo = master(1024)
    web = ROOT / "website"
    con = ROOT / "src/console/assets/icons"
    for out, size in ((web / "icon-512.png", 512), (web / "icon-192.png", 192), (web / "apple-touch-icon.png", 180),
                      (web / "favicon-32.png", 32), (con / "icon-512.png", 512), (con / "icon-192.png", 192),
                      (con / "apple-touch-icon.png", 180), (con / "favicon-32.png", 32)):
        logo.resize((size, size), Image.LANCZOS).save(out, optimize=True)
    logo.save(web / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    logo.save(ROOT / "scripts/brand/amc-studio.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    logo.resize((512, 512), Image.LANCZOS).save(ROOT / "scripts/brand/amc-studio.png", optimize=True)
    # Linux menu icons (the 512 px one is amc-studio.png).
    for size in (48, 128, 256):
        logo.resize((size, size), Image.LANCZOS).save(ROOT / f"scripts/brand/amc-studio-{size}.png", optimize=True)
    app = rounded(logo, 1024, 824, 185)
    if sys.platform != "darwin":
        print("skipped amc-studio.icns: iconutil is macOS only")
        return
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "amc.iconset"
        iconset.mkdir()
        for points in (16, 32, 128, 256, 512):
            app.resize((points, points), Image.LANCZOS).save(iconset / f"icon_{points}x{points}.png")
            app.resize((points * 2, points * 2), Image.LANCZOS).save(iconset / f"icon_{points}x{points}@2x.png")
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(ROOT / "scripts/brand/amc-studio.icns")], check=True)


if __name__ == "__main__":
    main()
