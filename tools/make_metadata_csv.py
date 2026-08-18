#!/usr/bin/env python3
"""
make_metadata_csv.py — build a metadata.csv for the AstroMycology Calibration
Image Database from a folder of images.

The database (https://github.com/dr-richard-barker/AstroMycology)
joins a `metadata.csv` to images by a `filename` column. This script scans a
folder, reads EXIF where present (capture time, GPS, camera), also parses the
ExoLab imaging-rig filename pattern (…_lens_position_7.0_cam_0_<unixtime>.jpg),
and writes a ready-to-edit metadata.csv. Species / treatment / notes are left
blank for you to fill in.

Usage:
    python3 make_metadata_csv.py <folder> [-o metadata.csv]

EXIF reading uses Pillow if it's installed (`pip install Pillow`); without it the
script still emits filename-derived fields. HEIC/HEIF EXIF additionally needs
`pip install pillow-heif` (Pillow alone can't open HEIC).
"""
import argparse
import csv
import os
import re
import sys
from datetime import datetime, timezone

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".bmp", ".heic", ".heif"}

try:
    from PIL import Image, ExifTags
    _TAGS = {v: k for k, v in ExifTags.TAGS.items()}
    _GPS = {v: k for k, v in ExifTags.GPSTAGS.items()}
    HAVE_PIL = True
except Exception:
    HAVE_PIL = False

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    HAVE_HEIF = True
except Exception:
    HAVE_HEIF = False


def _ratio(x):
    try:
        return float(x[0]) / float(x[1]) if isinstance(x, tuple) else float(x)
    except Exception:
        return None


def _dms_to_deg(dms, ref):
    try:
        d, m, s = (_ratio(v) for v in dms)
        deg = d + m / 60.0 + s / 3600.0
        if ref in ("S", "W"):
            deg = -deg
        return round(deg, 6)
    except Exception:
        return None


def exif_meta(path):
    """Return (captured_iso, lat, lng, camera) from EXIF, best-effort."""
    if not HAVE_PIL:
        return None, None, None, None
    try:
        img = Image.open(path)
        exif = img.getexif()
        if not exif:
            return None, None, None, None
        captured = None
        for key in ("DateTimeOriginal", "DateTime"):
            v = exif.get(_TAGS.get(key))
            if v:
                try:
                    captured = datetime.strptime(str(v), "%Y:%m:%d %H:%M:%S").isoformat()
                except Exception:
                    captured = str(v)
                break
        make = exif.get(_TAGS.get("Make"))
        model = exif.get(_TAGS.get("Model"))
        camera = " ".join(str(x).strip() for x in (make, model) if x) or None
        lat = lng = None
        gps_ifd = exif.get_ifd(_TAGS.get("GPSInfo")) if hasattr(exif, "get_ifd") else None
        if gps_ifd:
            lat = _dms_to_deg(gps_ifd.get(_GPS.get("GPSLatitude")), gps_ifd.get(_GPS.get("GPSLatitudeRef")))
            lng = _dms_to_deg(gps_ifd.get(_GPS.get("GPSLongitude")), gps_ifd.get(_GPS.get("GPSLongitudeRef")))
        return captured, lat, lng, camera
    except Exception:
        return None, None, None, None


def filename_meta(name):
    """Pull lens position, camera index, and a unix timestamp from the filename."""
    out = {}
    m = re.search(r"position[_-]?([\d.]+)", name, re.I)
    if m:
        out["lens_position"] = m.group(1)
    m = re.search(r"cam[_-]?(\d+)", name, re.I)
    if m:
        out["cam"] = m.group(1)
    m = re.search(r"(?:^|[_-])(\d{10})(?:\D|$)", name)
    if m:
        try:
            out["captured"] = datetime.fromtimestamp(int(m.group(1)), tz=timezone.utc).isoformat()
        except Exception:
            pass
    return out


def main():
    ap = argparse.ArgumentParser(description="Build a metadata.csv from a folder of images.")
    ap.add_argument("folder", help="folder containing the images")
    ap.add_argument("-o", "--output", default=None, help="output CSV (default: <folder>/metadata.csv)")
    args = ap.parse_args()

    folder = args.folder
    if not os.path.isdir(folder):
        sys.exit(f"Not a folder: {folder}")
    out_path = args.output or os.path.join(folder, "metadata.csv")

    files = sorted(f for f in os.listdir(folder)
                   if os.path.splitext(f)[1].lower() in IMAGE_EXTS)
    if not files:
        sys.exit(f"No images found in {folder}")

    cols = ["filename", "species", "treatment", "captured", "latitude", "longitude", "camera", "lens_position", "cam", "notes"]
    rows = []
    for name in files:
        path = os.path.join(folder, name)
        cap, lat, lng, cam = exif_meta(path)
        fm = filename_meta(name)
        rows.append({
            "filename": name,
            "species": "",
            "treatment": "",
            "captured": cap or fm.get("captured", ""),
            "latitude": "" if lat is None else lat,
            "longitude": "" if lng is None else lng,
            "camera": cam or "",
            "lens_position": fm.get("lens_position", ""),
            "cam": fm.get("cam", ""),
            "notes": "",
        })

    with open(out_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    print(f"Wrote {out_path} with {len(rows)} rows.")
    if not HAVE_PIL:
        print("Note: Pillow not installed — EXIF (capture time / GPS / camera) skipped. "
              "Install with `pip install Pillow` for full extraction.")
    elif any(os.path.splitext(f)[1].lower() in (".heic", ".heif") for f in files) and not HAVE_HEIF:
        print("Note: pillow-heif not installed — EXIF for .heic/.heif files was skipped. "
              "Install with `pip install pillow-heif` for full extraction, or use "
              "tools/heic_metadata_to_csv.py which handles this automatically.")


if __name__ == "__main__":
    main()
