#!/usr/bin/env python3
"""
compress_images.py - shrink image files while keeping them visually close to the original.

Usage examples:
    python compress_images.py photo.jpg
    python compress_images.py ./photos -o ./small -r
    python compress_images.py ./photos -q 75 --max-dimension 2048
    python compress_images.py ./photos --format webp
    python compress_images.py ./icons --lossy-png 128

Requires: pip install Pillow
"""
import argparse
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageOps

SUPPORTED = {".jpg", ".jpeg", ".png", ".webp"}


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024


def has_alpha(im: Image.Image) -> bool:
    return im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info


def compress_one(src: Path, dst: Path, args) -> tuple[int, int]:
    """Compress src into dst. Returns (original_size, final_size)."""
    original_size = src.stat().st_size
    dst.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(src) as im:
        src_format = im.format
        icc = im.info.get("icc_profile")
        # Bake in EXIF rotation so dropping metadata doesn't flip the photo.
        im = ImageOps.exif_transpose(im)
        exif = im.getexif().tobytes() if args.keep_exif else None

        resized = False
        if args.max_dimension and max(im.size) > args.max_dimension:
            im.thumbnail((args.max_dimension, args.max_dimension), Image.Resampling.LANCZOS)
            resized = True

        target = (args.format or src_format).upper()
        if target == "JPG":
            target = "JPEG"
        dst = dst.with_suffix({"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}[target])

        save_kwargs = {}
        if icc:
            save_kwargs["icc_profile"] = icc  # keeps colors accurate
        if exif:
            save_kwargs["exif"] = exif

        if target == "JPEG":
            if has_alpha(im):  # JPEG has no transparency: flatten onto white
                im = im.convert("RGBA")
                bg = Image.new("RGB", im.size, (255, 255, 255))
                bg.paste(im, mask=im.getchannel("A"))
                im = bg
            elif im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            save_kwargs.update(quality=args.quality, optimize=True, progressive=True)

        elif target == "WEBP":
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if has_alpha(im) else "RGB")
            save_kwargs.update(quality=args.quality, method=6)

        elif target == "PNG":
            if args.lossy_png:
                rgba = has_alpha(im)
                im = im.convert("RGBA" if rgba else "RGB")
                method = Image.Quantize.FASTOCTREE if rgba else Image.Quantize.MEDIANCUT
                im = im.quantize(colors=args.lossy_png, method=method, dither=Image.Dither.FLOYDSTEINBERG)
            save_kwargs.update(optimize=True, compress_level=9)

        im.save(dst, target, **save_kwargs)

    final_size = dst.stat().st_size

    # Never make a file bigger: if compression didn't help, keep the original.
    if final_size >= original_size and not resized:
        dst.unlink(missing_ok=True)  # drop the converted file (may have a different extension)
        dst = dst.with_suffix(src.suffix)
        shutil.copy2(src, dst)
        final_size = original_size

    return original_size, final_size


def collect(path: Path, recursive: bool):
    if path.is_file():
        return [path]
    pattern = "**/*" if recursive else "*"
    return sorted(p for p in path.glob(pattern) if p.suffix.lower() in SUPPORTED and p.is_file())


def main():
    p = argparse.ArgumentParser(description="Reduce image file size without a visible quality drop.")
    p.add_argument("input", type=Path, help="Image file or folder")
    p.add_argument("-o", "--output", type=Path, default=None,
                   help="Output folder (default: 'compressed' next to the input)")
    p.add_argument("-q", "--quality", type=int, default=82,
                   help="JPEG/WebP quality 1-100 (default 82; 75-85 is the sweet spot)")
    p.add_argument("-m", "--max-dimension", type=int, default=None,
                   help="Downscale so the longest side is at most this many pixels")
    p.add_argument("-f", "--format", choices=["jpeg", "png", "webp"], default=None,
                   help="Convert to this format (default: keep original format)")
    p.add_argument("--lossy-png", type=int, metavar="COLORS", default=0,
                   help="Reduce PNGs to N colors (e.g. 256) for much smaller files")
    p.add_argument("--keep-exif", action="store_true", help="Keep EXIF metadata (stripped by default)")
    p.add_argument("-r", "--recursive", action="store_true", help="Process sub-folders")
    args = p.parse_args()

    if not args.input.exists():
        sys.exit(f"Not found: {args.input}")
    if not 1 <= args.quality <= 100:
        sys.exit("--quality must be between 1 and 100")

    base = args.input if args.input.is_dir() else args.input.parent
    out_root = args.output or (base / "compressed")
    files = collect(args.input, args.recursive)
    files = [f for f in files if out_root not in f.parents]  # don't re-process our own output
    if not files:
        sys.exit("No supported images found (jpg, png, webp).")

    total_before = total_after = 0
    for f in files:
        dst = out_root / f.relative_to(base)
        try:
            before, after = compress_one(f, dst, args)
        except Exception as e:  # keep going if one file is bad
            print(f"  FAILED  {f.name}: {e}")
            continue
        total_before += before
        total_after += after
        saved = (1 - after / before) * 100 if before else 0
        print(f"  {f.name:<40} {human(before):>9} -> {human(after):>9}  ({saved:4.0f}% smaller)")

    if total_before:
        saved = (1 - total_after / total_before) * 100
        print(f"\nTotal: {human(total_before)} -> {human(total_after)}  ({saved:.0f}% saved)")
        print(f"Output: {out_root}")


if __name__ == "__main__":
    main()
