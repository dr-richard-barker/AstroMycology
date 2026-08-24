# MDRS Pre/Post mission (2025)

3D scans of Blue Oyster (*Pleurotus ostreatus*) grow-tubes taken before and after an analog
astronaut mission rotation at the Mars Desert Research Station (MDRS). 8 tubes were scanned
pre-mission (2025-02-03); 6 of those were rescanned post-mission (2025-04-28). All scans are
Revopoint structured-light meshes (binary PLY), same format/scanner as the other datasets in
this repo.

Tubes 3 and 5 have no post-mission scan:
- **Tube 3** exploded in transit through the airport on the way home from MDRS.
- **Tube 5** was too contaminated to bring on the mission and was left at Purdue.

`metadata.csv`'s `treatment` column carries the pre/post + tube number (`Pre · Tube N` /
`Post · Tube N`), which also drives the Database's "Treatment" filter chips. `age_days` (11 for
Pre, 29 for Post) records mycelium age the same way this lab's other tube-time-series datasets do
(days post inoculation), so this run can be compared against them despite the mission-specific
Pre/Post labels. The app's Dashboard joins each tube's pre/post volume (computed by the in-app 3D
Scan Viewer / "Compute volumes" batch) into a paired before/after comparison for the 6 tubes that
have both scans.

**Location**: every row is geotagged to the Mars Desert Research Station (Hanksville, UT,
38.4065°N 110.7919°W) so this dataset appears on the Dashboard's world map — this marks the
dataset as MDRS-mission-associated, not the literal scan location. All 3D scanning (both pre- and
post-mission) took place at Purdue; only the tubes themselves traveled to MDRS and back.
