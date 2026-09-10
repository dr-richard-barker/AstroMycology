import pandas as pd
import requests
import time
import os

print("Downloading KEGG compound names...")
kegg_list_req = requests.get("https://rest.kegg.jp/list/compound")
kegg_names = {}
if kegg_list_req.status_code == 200:
    for line in kegg_list_req.text.split('\n'):
        if line.strip():
            parts = line.split('\t')
            if len(parts) >= 2:
                # The first name in the list, split by ';'
                kegg_names[parts[0]] = parts[1].split(';')[0]
else:
    print("Failed to download KEGG compound list.")

def query_kegg_mass(target_mass, tolerance=0.01):
    low = target_mass - tolerance
    high = target_mass + tolerance
    url = f"https://rest.kegg.jp/find/compound/{low:.4f}-{high:.4f}/exact_mass"
    
    try:
        r = requests.get(url)
        if r.status_code == 200 and r.text.strip():
            hits = []
            for line in r.text.split('\n'):
                if line.strip():
                    parts = line.split('\t')
                    if len(parts) >= 1:
                        cpd_id = parts[0].replace('cpd:', '')
                        name = kegg_names.get(cpd_id, "Unknown Compound")
                        hits.append(name)
            return " | ".join(list(set(hits)))[:200]  # Limit string length
        return None
    except Exception as e:
        return None

def process_file(csv_path, mode, output_path):
    print(f"Processing {csv_path} in {mode} mode...")
    if not os.path.exists(csv_path):
        print(f"File not found: {csv_path}")
        return
        
    df = pd.read_csv(csv_path)
    df.rename(columns=lambda x: x.strip(), inplace=True)
    
    # We only care about the top 20 most differentially enriched ions to save time
    # Sort by absolute Dif
    df['abs_dif'] = df['Dif'].abs()
    df = df.sort_values(by='abs_dif', ascending=False)
    
    # We will just process all of them if small, or top 50
    df = df.head(50).copy()
    
    putative_names = []
    
    for idx, row in df.iterrows():
        mz = row['m/z']
        hits = []
        
        if mode == 'pos':
            # [M+H]+
            mass_h = mz - 1.007276
            res_h = query_kegg_mass(mass_h, 0.05)
            if res_h: hits.append(f"[M+H]+: {res_h}")
            
            # [M+Na]+
            mass_na = mz - 22.989769
            res_na = query_kegg_mass(mass_na, 0.05)
            if res_na: hits.append(f"[M+Na]+: {res_na}")
            
        else:
            # [M-H]-
            mass_h = mz + 1.007276
            res_h = query_kegg_mass(mass_h, 0.05)
            if res_h: hits.append(f"[M-H]-: {res_h}")
        
        time.sleep(0.1) # Be nice to KEGG
        
        if hits:
            putative_names.append(" || ".join(hits))
        else:
            putative_names.append("No matches in KEGG")
            
        print(f"m/z {mz:.4f} -> {putative_names[-1][:50]}...")
            
    df['Putative_Metabolites'] = putative_names
    df.drop(columns=['abs_dif'], inplace=True)
    
    df.to_csv(output_path, index=False)
    print(f"Saved annotated results to {output_path}")

def main():
    base_dir = "/Users/drb_laptop/Documents/AstroMycology/datasets/pharma-mycoponics-summer26"
    pos_file = os.path.join(base_dir, "Spectra_Pos.csv")
    neg_file = os.path.join(base_dir, "Spectra_Neg.csv")
    
    process_file(pos_file, 'pos', os.path.join(base_dir, "Annotated_Spectra_Pos.csv"))
    process_file(neg_file, 'neg', os.path.join(base_dir, "Annotated_Spectra_Neg.csv"))

if __name__ == "__main__":
    main()
