#!/usr/bin/env python3
"""
heic_metadata_to_csv.py — parse EXIF/GPS metadata out of a folder of .heic/.heif
photos into a simple metadata.csv table, ready to use as a sidecar in the
AstroMycology database (https://github.com/dr-richard-barker/AstroMycology).

HEIC/HEIF can't be opened by plain Pillow — this needs `pillow-heif` to
register a HEIF opener for Pillow. Install both with:

    pip install Pillow pillow-heif

Usage:
    python3 heic_metadata_to_csv.py <folder> [-o metadata.csv] [--recursive]

Species / genotype / treatment / notes columns are left blank for you to fill
in — this script only extracts what's actually recoverable from the files
themselves (EXIF + filename), nothing is guessed.
"""
import argparse
import csv
import os
import sys
from datetime import datetime

try:
    from PIL import Image, ExifTags
except ImportError:
    sys.exit("Pillow is required: pip install Pillow pillow-heif")

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    sys.exit("pillow-heif is required to open HEIC/HEIF files: pip install pillow-heif")

HEIC_EXTS = {".heic", ".heif"}
_TAGS = {v: k for k, v in ExifTags.TAGS.items()}
_GPS = {v: k for k, v in ExifTags.GPSTAGS.items()}

COLUMNS = [
    "filename", "species", "media_kind", "genotype", "treatment", "captured",
    "latitude", "longitude", "altitude_m", "camera", "lens", "iso",
    "f_number", "exposure_time_s", "focal_length_mm", "orientation",
    "width_px", "height_px", "notes", "source_path", "contributor", "license",
]


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


def read_heic_metadata(path):
    """Best-effort EXIF/GPS/dimension extraction from one HEIC/HEIF file."""
    row = {c: "" for c in COLUMNS}
    row["filename"] = os.path.basename(path)
    row["media_kind"] = "photo"

    try:
        img = Image.open(path)
        row["width_px"], row["height_px"] = img.size
        exif = img.getexif()
    except Exception as e:
        row["notes"] = f"could not read: {e}"
        return row
    if not exif:
        return row

    def tag(name):
        return exif.get(_TAGS.get(name))

    captured = tag("DateTimeOriginal") or tag("DateTime")
    if captured:
        try:
            row["captured"] = datetime.strptime(str(captured), "%Y:%m:%d %H:%M:%S").isoformat()
        except Exception:
            row["captured"] = str(captured)

    make, model = tag("Make"), tag("Model")
    row["camera"] = " ".join(str(x).strip() for x in (make, model) if x)
    row["lens"] = str(tag("LensModel") or "")
    iso = tag("ISOSpeedRatings")
    if iso:
        row["iso"] = str(iso)
    fnum = _ratio(tag("FNumber"))
    if fnum:
        row["f_number"] = f"f/{fnum:.1f}"
    exposure = _ratio(tag("ExposureTime"))
    if exposure:
        row["exposure_time_s"] = str(exposure)
    focal = _ratio(tag("FocalLength"))
    if focal:
        row["focal_length_mm"] = str(round(focal, 1))
    orientation = tag("Orientation")
    if orientation:
        row["orientation"] = str(orientation)

    try:
        gps_ifd = exif.get_ifd(_TAGS.get("GPSInfo")) if hasattr(exif, "get_ifd") else None
    except Exception:
        gps_ifd = None
    if gps_ifd:
        lat = _dms_to_deg(gps_ifd.get(_GPS.get("GPSLatitude")), gps_ifd.get(_GPS.get("GPSLatitudeRef")))
        lng = _dms_to_deg(gps_ifd.get(_GPS.get("GPSLongitude")), gps_ifd.get(_GPS.get("GPSLongitudeRef")))
        if lat is not None:
            row["latitude"] = lat
        if lng is not None:
            row["longitude"] = lng
        alt = _ratio(gps_ifd.get(_GPS.get("GPSAltitude")))
        if alt is not None:
            row["altitude_m"] = round(alt, 1)

    return row


def find_heic_files(folder, recursive):
    if recursive:
        for root, _dirs, files in os.walk(folder):
            for name in sorted(files):
                if os.path.splitext(name)[1].lower() in HEIC_EXTS:
                    yield os.path.join(root, name)
    else:
        for name in sorted(os.listdir(folder)):
            if os.path.splitext(name)[1].lower() in HEIC_EXTS:
                yield os.path.join(folder, name)


def main():
    ap = argparse.ArgumentParser(description="Build a metadata.csv from a folder of .heic/.heif photos.")
    ap.add_argument("folder", help="folder containing the .heic/.heif images")
    ap.add_argument("-o", "--output", default=None, help="output CSV (default: <folder>/metadata.csv)")
    ap.add_argument("--recursive", action="store_true", help="also scan subfolders")
    args = ap.parse_args()

    if not os.path.isdir(args.folder):
        sys.exit(f"Not a folder: {args.folder}")
    out_path = args.output or os.path.join(args.folder, "metadata.csv")

    paths = list(find_heic_files(args.folder, args.recursive))
    if not paths:
        sys.exit(f"No .heic/.heif files found in {args.folder}" + (" (try --recursive)" if not args.recursive else ""))

    rows = [read_heic_metadata(p) for p in paths]

    with open(out_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)

    with_gps = sum(1 for r in rows if r["latitude"] != "")
    with_date = sum(1 for r in rows if r["captured"] != "")
    print(f"Wrote {out_path} with {len(rows)} rows ({with_gps} with GPS, {with_date} with a capture date).")
    print("Fill in species / genotype / treatment / notes, then drop this metadata.csv next to the "
          "images (local upload, or a GitHub folder source) — AstroMycology joins it by filename.")


if __name__ == "__main__":
    main()
