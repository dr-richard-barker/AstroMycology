#!/usr/bin/env python3
"""
generate_sidecar.py — Build metadata.csv and datapackage.json sidecars for AstroMycology calibration image datasets.
Supports both local directories and remote GitHub repository folder URLs.

Usage:
    python3 generate_sidecar.py <source_path_or_url> [-o <output_dir>]

Examples:
    python3 generate_sidecar.py ./my_images
    python3 generate_sidecar.py https://github.com/dr-richard-barker/image-analysis-software-and-R-codes/tree/master/Londultia
"""

import os
import re
import csv
import json
import urllib.request
import urllib.parse
import argparse
import sys
from datetime import datetime, timezone

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".bmp", ".heic", ".heif"}
VIDEO_EXTS = {".avi", ".mp4", ".webm", ".ogv", ".mov", ".m4v", ".mkv"}
SCAN3D_EXTS = {".ply", ".obj", ".glb", ".gltf", ".stl"}

# Common species keyword mapping
SPECIES_MAP = {
    r"landoltia|londultia|punctata": "Landoltia punctata",
    r"lemna|minor": "Lemna minor",
    r"wolffia|arrhiza": "Wolffia arrhiza",
    r"azolla|caroliniana|azola": "Azolla caroliniana",
    r"arabidopsis|thaliana|col0|col-0": "Arabidopsis thaliana",
}

# Common treatments keywords
TREATMENT_MAP = {
    r"ga|gibberellic": "Gibberellic Acid (GA)",
    r"water|ctrl|control": "Control (Water)",
    r"nutrient|ms|media": "Nutrient Medium",
    r"clinostat|clino": "Clinostat (Microgravity Analog)",
}

def parse_github_url(url):
    """
    Parses a GitHub URL into owner, repo, branch/ref, and folder path.
    Supported format: https://github.com/owner/repo/tree/branch/path/to/folder
    """
    url = url.strip()
    m = re.match(r"https?://(?:www\.)?github\.com/([^/]+)/([^/]+)/tree/([^/]+)/(.+)", url, re.I)
    if m:
        return {
            "owner": m.group(1),
            "repo": m.group(2).replace(".git", ""),
            "ref": m.group(3),
            "path": m.group(4).rstrip("/")
        }
    m = re.match(r"https?://(?:www\.)?github\.com/([^/]+)/([^/]+)/?$", url, re.I)
    if m:
        return {
            "owner": m.group(1),
            "repo": m.group(2).replace(".git", ""),
            "ref": "main",
            "path": ""
        }
    return None

def fetch_github_contents(target):
    """Lists files in a GitHub folder using the public Contents API."""
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    path_encoded = "/".join(urllib.parse.quote(p) for p in target["path"].split("/"))
    api_url = f"https://api.github.com/repos/{target['owner']}/{target['repo']}/contents/{path_encoded}?ref={target['ref']}"
    
    req = urllib.request.Request(api_url, headers={"User-Agent": "AstroMycology-Sidecar-Generator"})
    try:
        with urllib.request.urlopen(req, context=ctx) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as e:
        sys.exit(f"Error fetching GitHub contents: {e}\n(Note: public rate limit is 60 requests/hr. Please ensure the repository is public and path is correct.)")

def infer_from_filename(name, path=""):
    """Parses species, well, genotype, treatment, and capture time from filename patterns and paths."""
    metadata = {
        "species": "",
        "treatment": "",
        "genotype": "",
        "captured": "",
        "well": "",
        "plate": "",
    }
    name_lower = name.lower()
    path_lower = path.lower() if path else ""
    
    # 1. Infer Species
    for pattern, species_val in SPECIES_MAP.items():
        if re.search(pattern, name_lower) or (path_lower and re.search(pattern, path_lower)):
            metadata["species"] = species_val
            break
            
    # 2. Infer Treatment
    for pattern, treatment_val in TREATMENT_MAP.items():
        if re.search(pattern, name_lower) or (path_lower and re.search(pattern, path_lower)):
            metadata["treatment"] = treatment_val
            break

    # 3. Infer genotype
    if "col-0" in name_lower or "col0" in name_lower:
        metadata["genotype"] = "Col-0"
    elif "pgm" in name_lower:
        metadata["genotype"] = "pgm1-1"

    # 4. Infer Plate/Well
    well_match = re.search(r"well[_-]?([a-h]\d{1,2})", name_lower)
    if well_match:
        metadata["well"] = well_match.group(1).upper()
    else:
        # short well formats like _A1_, _B12_
        short_well = re.search(r"[_-]([a-h])(\d{1,2})[_-]", name_lower)
        if short_well:
            metadata["well"] = f"{short_well.group(1).upper()}{int(short_well.group(2)):02d}"

    plate_match = re.search(r"plate[_-]?(\d+)", name_lower)
    if plate_match:
        metadata["plate"] = f"Plate {plate_match.group(1)}"

    # 5. Capture date
    dtm = re.search(r"(\d{4})[_.-](\d{2})[_.-](\d{2})(?:[_.T-](\d{2})[_.:-](\d{2})[_.:-](\d{2}))?", name)
    if dtm and 1990 < int(dtm.group(1)) < 2100:
        try:
            year, month, day = int(dtm.group(1)), int(dtm.group(2)), int(dtm.group(3))
            hour = int(dtm.group(4)) if dtm.group(4) else 0
            minute = int(dtm.group(5)) if dtm.group(5) else 0
            second = int(dtm.group(6)) if dtm.group(6) else 0
            metadata["captured"] = datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc).isoformat()
        except Exception:
            pass

    if not metadata["captured"]:
        ts = re.search(r"(?:^|[_-])(\d{10})(?:\D|$)", name)
        if ts:
            try:
                metadata["captured"] = datetime.fromtimestamp(int(ts.group(1)), tz=timezone.utc).isoformat()
            except Exception:
                pass
                
    return metadata

def generate_datapackage(files_count, columns, output_dir):
    """Generates a standard Frictionless Data Package descriptor file."""
    schema_fields = []
    for col in columns:
        field_type = "string"
        if col in ("latitude", "longitude", "scale_bar_mm"):
            field_type = "number"
        elif col in ("width_px", "height_px"):
            field_type = "integer"
        elif col == "calibration_marker":
            field_type = "boolean"
        elif col == "date_taken":
            field_type = "datetime"
            
        schema_fields.append({
            "name": col,
            "type": field_type
        })

    datapackage = {
        "profile": "tabular-data-package",
        "resources": [
            {
                "name": "metadata",
                "path": "metadata.csv",
                "profile": "tabular-data-resource",
                "schema": {
                    "fields": schema_fields,
                    "primaryKey": "filename"
                }
            }
        ],
        "created": datetime.now(timezone.utc).isoformat(),
        "license": "CC0-1.0",
        "sources": [
            {
                "title": "AstroMycology Calibration Image Sharing and Analysis Hub",
                "path": "https://github.com/dr-richard-barker/AstroMycology"
            }
        ]
    }
    
    dp_path = os.path.join(output_dir, "datapackage.json")
    with open(dp_path, "w", encoding="utf-8") as fh:
        json.dump(datapackage, fh, indent=2)
    print(f"Wrote Frictionless Data Package descriptor: {dp_path}")

def main():
    ap = argparse.ArgumentParser(description="Generate metadata.csv sidecar for AstroMycology Calibration database.")
    ap.add_argument("source", help="Local directory path OR GitHub folder URL")
    ap.add_argument("-o", "--output", default=None, help="Output directory for generated sidecar (defaults to current dir or local folder)")
    args = ap.parse_args()
    
    source = args.source
    github_target = parse_github_url(source)
    
    files = []
    is_github = github_target is not None
    
    def media_kind_for(name):
        ext = os.path.splitext(name)[1].lower()
        if ext in SCAN3D_EXTS:
            return "scan3d"
        return "photo"

    if is_github:
        print(f"Detected GitHub URL: {github_target['owner']}/{github_target['repo']} path={github_target['path']}")
        contents = fetch_github_contents(github_target)
        for item in contents:
            ext = os.path.splitext(item["name"])[1].lower()
            if item["type"] == "file" and (ext in IMAGE_EXTS or ext in VIDEO_EXTS or ext in SCAN3D_EXTS):
                files.append({
                    "name": item["name"],
                    "repo": f"{github_target['owner']}/{github_target['repo']}",
                    "path": github_target["path"]
                })
        output_dir = args.output or "."
    else:
        if not os.path.isdir(source):
            sys.exit(f"Not a valid local directory or GitHub URL: {source}")
        print(f"Scanning local folder: {source}")
        output_dir = args.output or source
        for item in sorted(os.listdir(source)):
            ext = os.path.splitext(item)[1].lower()
            if ext in IMAGE_EXTS or ext in VIDEO_EXTS or ext in SCAN3D_EXTS:
                files.append({
                    "name": item,
                    "repo": "",
                    "path": os.path.abspath(source)
                })

    if not files:
        sys.exit("No images, videos, or 3D scans found in the specified source.")

    columns = [
        "filename", "species", "media_kind", "genotype", "treatment", "glds_accession",
        "experiment", "date_taken", "latitude", "longitude", "camera",
        "lighting", "scale_bar_mm", "calibration_marker", "width_px",
        "height_px", "notes", "source_repo", "source_path", "contributor", "license"
    ]

    rows = []
    for f in files:
        inf = infer_from_filename(f["name"], f["path"])
        rows.append({
            "filename": f["name"],
            "species": inf["species"],
            "media_kind": media_kind_for(f["name"]),
            "genotype": inf["genotype"],
            "treatment": inf["treatment"],
            "glds_accession": "",
            "experiment": github_target["repo"] if is_github else os.path.basename(os.path.abspath(source)),
            "date_taken": inf["captured"],
            "latitude": "",
            "longitude": "",
            "camera": "",
            "lighting": "",
            "scale_bar_mm": "",
            "calibration_marker": "false",
            "width_px": "",
            "height_px": "",
            "notes": f"Plate well: {inf['well']}" if inf["well"] else "",
            "source_repo": f["repo"],
            "source_path": f["path"],
            "contributor": "Dr. Richard Barker",
            "license": "CC0-1.0"
        })

    csv_path = os.path.join(output_dir, "metadata.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=columns)
        w.writeheader()
        w.writerows(rows)
        
    print(f"Wrote metadata sidecar CSV: {csv_path} with {len(rows)} entries.")
    
    # Write json sidecar as well
    json_path = os.path.join(output_dir, "metadata.json")
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(rows, fh, indent=2)
    print(f"Wrote metadata sidecar JSON: {json_path}")
    
    generate_datapackage(len(files), columns, output_dir)
    print("Done! Ready to commit these files alongside your images.")

if __name__ == "__main__":
    main()
