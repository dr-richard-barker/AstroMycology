import argparse
import pandas as pd
import re
import os

def parse_args():
    parser = argparse.ArgumentParser(description="Link DESI-MS plate data with EpiCollect5 phenotypic records.")
    parser.add_argument('--plate', required=True, help="Path to PLATE_XX.xlsx file")
    parser.add_argument('--uuids', required=True, help="Path to EpiCollect 'UUIDs and Date' file")
    parser.add_argument('--tubes', required=True, help="Path to EpiCollect 'Chamber Tubes Daily' file")
    parser.add_argument('--output', required=True, help="Path to save the merged output CSV")
    return parser.parse_args()

def parse_sample_id(sample_id):
    if not isinstance(sample_id, str):
        return {'parsed_source': None, 'parsed_date': None, 'parsed_chamber': None}
    match = re.match(r'SAM_([A-Za-z0-9]+)_(\d{4})_([A-Za-z0-9]+)', sample_id)
    if not match:
        return {'parsed_source': None, 'parsed_date': None, 'parsed_chamber': None}
    source, mmdd, chamber = match.groups()
    month = mmdd[:2]
    day = mmdd[2:]
    date_str = f"{day}/{month}/2026"
    return {
        'parsed_source': source,
        'parsed_date': date_str,
        'parsed_chamber': chamber
    }

def main():
    args = parse_args()

    print(f"Loading {args.uuids}...")
    uuids_df = pd.read_csv(args.uuids)
    print(f"Loading {args.tubes}...")
    tubes_df = pd.read_csv(args.tubes)

    print(f"Loading {args.plate} (Sample_Metadata)...")
    plate_df = pd.read_excel(args.plate, sheet_name="Sample_Metadata")

    parsed = plate_df['sample_id'].apply(parse_sample_id)
    plate_df = pd.concat([plate_df, pd.DataFrame(parsed.tolist())], axis=1)

    plate_df = plate_df.dropna(subset=['parsed_date', 'parsed_chamber'])

    merged = pd.merge(plate_df, uuids_df[['ec5_uuid', '1_Date']], left_on='parsed_date', right_on='1_Date', how='left')
    merged = merged.rename(columns={'ec5_uuid': 'parent_uuid'})

    final_merged = pd.merge(merged, tubes_df, 
                            left_on=['parent_uuid', 'parsed_chamber'], 
                            right_on=['ec5_branch_owner_uuid', '9_Which_chamber'], 
                            how='left')

    final_merged.to_csv(args.output, index=False)
    print(f"Successfully linked data! Saved to {args.output}")
    print(f"Total matched records with EpiCollect metadata: {final_merged['ec5_branch_uuid'].notna().sum()} / {len(plate_df)}")

if __name__ == "__main__":
    main()
