import urllib.request
import xml.etree.ElementTree as ET
import os
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import subprocess
import csv
import json

CACHE_FILE = '/Users/drb_laptop/Documents/AIRI_to_AIR/scripts/kegg_cache.json'
METABOLOMICS_FILE = '/Users/drb_laptop/Documents/AIRI_to_AIR/paintomics_input/metabolomics_quantification.txt'
OUT_PNG = '/Users/drb_laptop/Documents/AIRI_to_AIR/manuscript_figures/ko01100_filtered.png'

with open(CACHE_FILE, 'r') as f:
    cache = json.load(f)

# Rebuild compound dicts for loading metabolomics (name -> CID)
kegg_compound_map = {}
for line in cache.get("list:compound", "").split('\n'):
    if line:
        parts = line.split('\t')
        if len(parts) == 2:
            cid = parts[0].replace('cpd:', '')
            names = [n.strip().lower() for n in parts[1].split(';')]
            for n in names:
                kegg_compound_map[n] = cid

# Also name lookup (CID -> name)
compounds_id_to_name = {}
for line in cache.get("list:compound", "").split('\n'):
    if line:
        parts = line.split('\t')
        if len(parts) == 2:
            cid = parts[0].replace('cpd:', '')
            name = parts[1].split(';')[0].strip()
            compounds_id_to_name[cid] = name

# 1. Load Metabolomics (81 items)
metab_data = {}
if os.path.exists(METABOLOMICS_FILE):
    with open(METABOLOMICS_FILE, 'r') as f:
        reader = csv.reader(f, delimiter='\t')
        next(reader)
        for row in reader:
            if len(row) < 2: continue
            name, logfc = row[0], float(row[1])
            cid = kegg_compound_map.get(name.lower())
            if cid:
                metab_data[cid] = logfc

# 2. Transcriptomic data (from manuscript)
ko_logfc = {
    "K17066": 1.80,
    "K00128": 1.90, "K00149": 1.90, "K14085": 1.90, "K28615": 1.90,
    "K28607": 0.81,
    "K00008": 0.81,
    "K01011": 1.94, "K02439": 1.94, "K03972": 1.94
}

def get_kgml(pathway_id):
    url = f"https://rest.kegg.jp/get/{pathway_id}/kgml"
    result = subprocess.run(["curl", "-sL", "-A", "Mozilla/5.0", url], capture_output=True, text=True)
    return result.stdout if result.returncode == 0 else None

def build_network(xml_data):
    G = nx.Graph() # Undirected for easier neighborhood finding
    root = ET.fromstring(xml_data)
    entry_dict = {}
    for entry in root.findall('entry'):
        eid = entry.attrib['id']
        name_str = entry.attrib['name']
        etype = entry.attrib['type']
        
        parsed_names = [n.split(':')[-1] for n in name_str.split(' ')]
        
        graphics = entry.find('graphics')
        x, y = 0, 0
        if graphics is not None:
            x = float(graphics.attrib.get('x', 0))
            y = float(graphics.attrib.get('y', 0))
            label = graphics.attrib.get('name', parsed_names[0]).split(',')[0]
        else:
            label = parsed_names[0]
            
        if etype == 'compound' and parsed_names[0] in compounds_id_to_name:
            label = compounds_id_to_name[parsed_names[0]]
            
        entry_dict[eid] = {
            'ids': parsed_names,
            'type': etype,
            'x': x,
            'y': y,
            'label': label
        }
        
        if etype in ['ortholog', 'compound']:
            G.add_node(eid, ids=parsed_names, x=x, y=y, label=label, type=etype, logfc=None, source=None)
            
    for reaction in root.findall('reaction'):
        substrates = [s.attrib['id'] for s in reaction.findall('substrate')]
        products = [p.attrib['id'] for p in reaction.findall('product')]
        
        for sub_id in substrates:
            for prod_id in products:
                if G.has_node(sub_id) and G.has_node(prod_id):
                    G.add_edge(sub_id, prod_id)
                    
    for rel in root.findall('relation'):
        entry1 = rel.attrib['entry1']
        entry2 = rel.attrib['entry2']
        if G.has_node(entry1) and G.has_node(entry2):
            G.add_edge(entry1, entry2)
            
    return G

def get_color(logfc):
    if logfc is None:
        return "#eeeeee"
    norm = mcolors.TwoSlopeNorm(vmin=-2, vcenter=0, vmax=2)
    cmap = plt.get_cmap('coolwarm')
    rgb = cmap(norm(logfc))
    return mcolors.to_hex(rgb)

def main():
    xml_data = get_kgml('ko01100')
    if not xml_data:
        print("Failed to get KGML")
        return
        
    G = build_network(xml_data)
    print(f"Original ko01100 Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    
    # Map Omics Data
    hit_nodes = set()
    for n, data in G.nodes(data=True):
        ids = data.get('ids', [])
        
        # Check metabolomics
        metab_fcs = [metab_data[i] for i in ids if i in metab_data]
        # Check transcriptomics
        trans_fcs = [ko_logfc[i] for i in ids if i in ko_logfc]
        
        if metab_fcs or trans_fcs:
            max_fc = max(metab_fcs + trans_fcs)
            data['logfc'] = max_fc
            hit_nodes.add(n)
            
    print(f"Found {len(hit_nodes)} nodes with direct omics data mapping.")
    
    # Find neighbors
    nodes_to_keep = set(hit_nodes)
    for hn in hit_nodes:
        nodes_to_keep.update(G.neighbors(hn))
        
    print(f"Total nodes to keep (hits + 1st degree neighbors): {len(nodes_to_keep)}")
    
    # Create Subgraph
    G_sub = G.subgraph(nodes_to_keep).copy()
    
    # Layout
    fixed_pos = {}
    fixed_nodes = []
    for n, data in G_sub.nodes(data=True):
        if data.get('x', 0) != 0:
            fixed_pos[n] = (data['x'], -data['y'])
            fixed_nodes.append(n)
            
    # Spring layout using fixed nodes as anchors
    print("Computing layout...")
    pos = nx.spring_layout(G_sub, pos=fixed_pos, fixed=fixed_nodes, k=0.5, iterations=50) if fixed_nodes else nx.spring_layout(G_sub)
    
    # Draw
    plt.figure(figsize=(24, 24))
    node_colors = []
    node_sizes = []
    
    for n in G_sub.nodes():
        d = G_sub.nodes[n]
        if n in hit_nodes:
            node_colors.append(get_color(d['logfc']))
            node_sizes.append(400)
        else:
            node_colors.append("#dddddd")
            node_sizes.append(100)
            
    nx.draw_networkx_nodes(G_sub, pos, node_color=node_colors, node_size=node_sizes, alpha=0.9, edgecolors='black')
    nx.draw_networkx_edges(G_sub, pos, alpha=0.4, edge_color="#999999")
    
    # Labels for all nodes in this filtered graph (since it's small enough now)
    labels = {n: G_sub.nodes[n]['label'][:20] for n in G_sub.nodes()}
    nx.draw_networkx_labels(G_sub, pos, labels, font_size=9, font_weight="bold")
    
    plt.title("Metabolic Pathways (ko01100) - Filtered to Omics Hits + Neighbors", fontsize=24)
    plt.axis('off')
    plt.tight_layout()
    plt.savefig(OUT_PNG, dpi=200, bbox_inches='tight')
    print(f"Saved {OUT_PNG}")

if __name__ == '__main__':
    main()
