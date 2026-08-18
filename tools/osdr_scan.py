#!/usr/bin/env python3
"""Scan the NASA OSDR (Open Science Data Repository) API for plant *imaging*
datasets that can be imported into the AstroMycology Calibration Image Database.

Why a script and not a button in the app: the OSDR API responds with
`Access-Control-Allow-Origin: osdr.nasa.gov`, so a browser on another origin
cannot call it. This runs offline (or in CI) and writes a catalogue the import
step consumes.

What it does:
  1. Search the OSDR study index for plant organisms (search API).
  2. For each unique study, read its file listing (files API) and detect
     photographic images — real image extensions and/or the
     "Morphometric Photography" / "Image Analysis" file categories.
  3. Rank and print the importable imaging datasets, and write osdr_catalog.json.

Usage:
  python3 tools/osdr_scan.py                # default plant organism terms
  python3 tools/osdr_scan.py "cotton" "lettuce"   # custom search terms
"""
import json, sys, time, urllib.parse, urllib.request

API = "https://osdr.nasa.gov/osdr/data"
IMG_EXT = ("jpg", "jpeg", "png", "tif", "tiff", "bmp", "gif")
VID_EXT = ("avi", "mp4", "mov", "webm", "m4v")
IMG_CAT = ("photograph", "image", "morphomet", "micrograph")
PLANT_TERMS = ["Arabidopsis thaliana", "Brachypodium distachyon", "Mizuna",
               "lettuce", "Populus", "cotton", "Brassica", "soybean", "plant morphometric"]
# Studies to always inspect directly — the search API is relevance-ranked and
# capped, so notable imaging studies (e.g. OSD-120) can fall outside the hits.
KNOWN_ACCESSIONS = ["OSD-120", "OSD-121", "OSD-469", "OSD-476", "OSD-678"]


def get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "osdr-scan/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def search_accessions(term, size=40):
    url = f"{API}/search?term={urllib.parse.quote(term)}&type=cgene&size={size}"
    try:
        hits = get(url).get("hits", {}).get("hits", [])
    except Exception as e:
        print(f"  ! search '{term}' failed: {e}", file=sys.stderr)
        return {}
    out = {}
    for h in hits:
        s = h.get("_source", {})
        acc = s.get("Accession") or s.get("Study Identifier")
        if acc and str(acc).startswith("OSD"):
            out[acc] = {"organism": s.get("organism") or s.get("Organism") or "",
                        "title": (s.get("Study Title") or "")[:90]}
    return out


def inspect_files(acc):
    """Return image/video stats for a study, or None on error."""
    num = acc.split("-")[-1]
    try:
        d = get(f"{API}/osd/files/{num}")
    except Exception as e:
        print(f"  ! files {acc} failed: {e}", file=sys.stderr)
        return None
    imgs = vids = 0
    bytes_img = 0
    cats = set()
    for s in d.get("studies", {}).values():
        for f in s.get("study_files", []):
            name = f.get("file_name", "")
            ext = name.lower().rsplit(".", 1)[-1] if "." in name else ""
            cat = f"{f.get('category','')}/{f.get('subcategory','')}".strip("/")
            catl = cat.lower()
            if ext in IMG_EXT or any(k in catl for k in IMG_CAT):
                if ext in IMG_EXT:
                    imgs += 1; bytes_img += f.get("file_size", 0)
                    cats.add(f.get("category", "") or "(uncat)")
            if ext in VID_EXT:
                vids += 1
    return {"images": imgs, "videos": vids, "mb": round(bytes_img / 1048576, 1), "categories": sorted(cats)}


def main():
    terms = sys.argv[1:] or PLANT_TERMS
    print(f"Scanning OSDR for plant imaging across {len(terms)} search term(s)…\n")
    candidates = {}
    for t in terms:
        found = search_accessions(t)
        for acc, meta in found.items():
            candidates.setdefault(acc, meta)
        print(f"  '{t}': {len(found)} studies")
        time.sleep(0.3)
    for acc in KNOWN_ACCESSIONS:
        candidates.setdefault(acc, {"organism": "", "title": "(known accession)"})
    print(f"\n{len(candidates)} unique studies — checking file listings for images…\n")

    catalog = []
    for acc, meta in candidates.items():
        stats = inspect_files(acc)
        time.sleep(0.2)
        if stats and stats["images"] > 0:
            catalog.append({"accession": acc, **meta, **stats})

    catalog.sort(key=lambda r: r["images"], reverse=True)
    print(f"=== {len(catalog)} importable imaging datasets ===\n")
    print(f"{'Accession':<10} {'Imgs':>5} {'Vids':>4} {'MB':>7}  Organism / categories")
    for r in catalog:
        print(f"{r['accession']:<10} {r['images']:>5} {r['videos']:>4} {r['mb']:>7}  {r['organism']} · {', '.join(r['categories'])[:50]}")
        print(f"{'':12}{r['title']}")

    out = "tools/osdr_catalog.json"
    with open(out, "w") as f:
        json.dump(catalog, f, indent=1)
    print(f"\nWrote {out} ({len(catalog)} datasets).")


if __name__ == "__main__":
    main()
