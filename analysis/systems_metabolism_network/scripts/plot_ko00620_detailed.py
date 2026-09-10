import urllib.request
import xml.etree.ElementTree as ET
import os
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import subprocess
import json

CACHE_FILE = '/Users/drb_laptop/Documents/AIRI_to_AIR/scripts/kegg_cache.json'
OUT_PNG = '/Users/drb_laptop/Documents/AIRI_to_AIR/manuscript_figures/ko00620_detailed.png'

with open(CACHE_FILE, 'r') as f:
    cache = json.load(f)

# Build quick lookup for compound names
compounds = {}
for line in cache.get("list:compound", "").split('\n'):
    if line:
        parts = line.split('\t')
        if len(parts) == 2:
            cid = parts[0].replace('cpd:', '')
            # Just take the first common name
            name = parts[1].split(';')[0].strip()
            compounds[cid] = name

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

def build_detailed_network(xml_data):
    G = nx.DiGraph()
    root = ET.fromstring(xml_data)
    entry_dict = {}
    
    # 1. Add all defined entries
    for entry in root.findall('entry'):
        eid = entry.attrib['id']
        name_str = entry.attrib['name']
        etype = entry.attrib['type']
        
        raw_names = name_str.split(' ')
        parsed_names = [n.split(':')[-1] for n in raw_names]
        
        graphics = entry.find('graphics')
        x, y = 0, 0
        if graphics is not None:
            x = float(graphics.attrib.get('x', 0))
            y = float(graphics.attrib.get('y', 0))
            
        # Try to resolve a nice label
        label = parsed_names[0]
        if etype == 'compound' and label in compounds:
            label = compounds[label]
        elif graphics is not None and graphics.attrib.get('name'):
            label = graphics.attrib.get('name').split(',')[0]
            
        entry_dict[eid] = {
            'ids': parsed_names,
            'type': etype,
            'x': x,
            'y': y,
            'label': label
        }
        
        if etype in ['ortholog', 'compound']:
            G.add_node(eid, ids=parsed_names, x=x, y=y, label=label, type=etype, logfc=None)

    # 2. Add reactions, including all substrates/products (even if they lack graphics)
    for reaction in root.findall('reaction'):
        rn_name = reaction.attrib['name'].split(' ')[0].split(':')[-1]
        substrates = [s.attrib['name'].split(':')[-1] for s in reaction.findall('substrate')]
        products = [p.attrib['name'].split(':')[-1] for p in reaction.findall('product')]
        
        # We need to map these raw compound IDs (like C00002) back to node IDs in the graph.
        # If they don't exist, we CREATE them!
        
        # Find or create nodes for substrates
        sub_nodes = []
        for cpd in substrates:
            found = False
            for n, data in G.nodes(data=True):
                if cpd in data.get('ids', []):
                    sub_nodes.append(n)
                    found = True
                    break
            if not found:
                new_id = f"extra_{cpd}"
                label = compounds.get(cpd, cpd)
                G.add_node(new_id, ids=[cpd], x=0, y=0, label=label, type='compound', logfc=None, is_cofactor=True)
                sub_nodes.append(new_id)
                
        # Find or create nodes for products
        prod_nodes = []
        for cpd in products:
            found = False
            for n, data in G.nodes(data=True):
                if cpd in data.get('ids', []):
                    prod_nodes.append(n)
                    found = True
                    break
            if not found:
                new_id = f"extra_{cpd}"
                label = compounds.get(cpd, cpd)
                G.add_node(new_id, ids=[cpd], x=0, y=0, label=label, type='compound', logfc=None, is_cofactor=True)
                prod_nodes.append(new_id)

        # Connect substrates to products (we can use the enzyme as edge data, but let's just make direct edges)
        for s in sub_nodes:
            for p in prod_nodes:
                G.add_edge(s, p)
                
    return G

def get_color(logfc, is_cofactor=False):
    if logfc is None:
        return "#f0e68c" if is_cofactor else "#dddddd" # Khaki for cofactors, grey for normal
    norm = mcolors.TwoSlopeNorm(vmin=-2, vcenter=0, vmax=2)
    cmap = plt.get_cmap('coolwarm')
    rgb = cmap(norm(logfc))
    return mcolors.to_hex(rgb)

def main():
    xml_data = get_kgml('ko00620')
    G = build_detailed_network(xml_data)
    
    # Map data
    for n, data in G.nodes(data=True):
        ids = data.get('ids', [])
        fc_vals = [ko_logfc[k] for k in ids if k in ko_logfc]
        if fc_vals:
            data['logfc'] = max(fc_vals)
            
    # Layout
    fixed_pos = {}
    fixed_nodes = []
    for n, data in G.nodes(data=True):
        if data.get('x', 0) != 0:
            fixed_pos[n] = (data['x'], -data['y'])
            fixed_nodes.append(n)
            
    # Use spring layout for the extra nodes (cofactors), keeping original nodes fixed
    pos = nx.spring_layout(G, pos=fixed_pos, fixed=fixed_nodes, k=2.0, iterations=50) if fixed_nodes else nx.spring_layout(G)
    
    # Draw
    plt.figure(figsize=(24, 24))
    node_colors = []
    node_sizes = []
    for n in G.nodes():
        d = G.nodes[n]
        is_cofactor = d.get('is_cofactor', False)
        node_colors.append(get_color(d.get('logfc'), is_cofactor))
        if d.get('logfc') is not None:
            node_sizes.append(600)
        elif is_cofactor:
            node_sizes.append(100)
        else:
            node_sizes.append(200)
            
    nx.draw_networkx_nodes(G, pos, node_color=node_colors, node_size=node_sizes, alpha=0.9, edgecolors='black')
    nx.draw_networkx_edges(G, pos, alpha=0.4, edge_color="#888888", arrows=True, arrowsize=10)
    
    labels = {n: data['label'][:20] for n, data in G.nodes(data=True)}
    nx.draw_networkx_labels(G, pos, labels, font_size=8, font_weight="bold")
    
    plt.title("Pyruvate Metabolism (ko00620) - Detailed with Cofactors", fontsize=24)
    plt.axis('off')
    plt.tight_layout()
    plt.savefig(OUT_PNG, dpi=200, bbox_inches='tight')
    print(f"Saved {OUT_PNG}")

if __name__ == '__main__':
    main()
