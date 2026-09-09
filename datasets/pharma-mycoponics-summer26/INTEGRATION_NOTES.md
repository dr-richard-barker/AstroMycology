# Pharma Mycoponics Summer 2026: EpiCollect5 Integration Notes

The data provided by our collaborator (from their `aymarizwan2027/pharma-mycoponics-summer26` repository) offers an excellent model for how to robustly pull datasets from Epicollect5.

## Using Branches in EpiCollect5

The collaborator structured their EpiCollect5 project (**Mycoponics Porterfield**, Form: `Mycopharmaceutical bioproduction`) using "branches" to represent repeated observational events. The main form tracks the top-level collection events (e.g., Dates), but the detailed information about:
- **Chamber Conditions** (Environmental data)
- **Tube Observations** (Mushroom yield, image references)

...are tracked as separate branches connected to the main records.

When exporting via the API, the base `entries` endpoint does not automatically expand these branches. Instead, the collaborator explicitly specifies the branch to download using the `branch_ref` query parameter.

## Paginated Snapshots Strategy

To ensure data integrity and avoid losing data if the remote project changes or gets deleted, the collaborator wrote a robust PowerShell script (`scripts/download_epicollect.ps1`) that takes a local snapshot of the dataset:

1. **Structured Polling**: The script spaces API requests 25 seconds apart to respect rate limits (`five.epicollect.net` is rate-limited).
2. **Pagination Safety**: It handles pagination and carefully verifies that the `meta.total` records number hasn't changed during the pagination sequence to avoid capturing inconsistent states.
3. **Branch Specificity**: It downloads the main form, then specifically requests `chamber_conditions` (`..._6a7412262bf6f`) and `tube_observations` (`..._6a73c6a20258a`) by appending `&branch_ref=...` to the query.
4. **Data Flattening**: The nested JSON responses are flattened into clean CSV files, which is excellent for archival purposes and traditional data processing pipelines.
5. **Space Efficiency**: While photo and image references (UUIDs and API URLs) are preserved in the metadata, the actual binary images are intentionally NOT downloaded by the script. This saves an enormous amount of space in the Git repository, offloading the media hosting to EpiCollect while preserving the metadata linking.

## AstroMycology Web Client Support

In order to consume the collaborator's data natively in the AstroMycology UI directly from EpiCollect5, we adopted the lesson from their snapshot strategy: we updated our `ProjectRef` configuration to optionally provide a `branchRef`. This enables AstroMycology to fetch the `tube_observations` branch specifically, allowing our image-viewing gallery to successfully retrieve the mushroom photos.
