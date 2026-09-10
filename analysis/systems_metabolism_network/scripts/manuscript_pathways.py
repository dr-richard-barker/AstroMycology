import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
import os
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import subprocess

# The specific KOs and their approximated log2FC derived from the manuscript table (Exudophore / max(other))
ko_logfc = {
    "K17066": 1.80, # Alcohol oxidase (3.49 fold -> ~1.8 log2)
    "K00128": 1.90, "K00149": 1.90, "K14085": 1.90, "K28615": 1.90, # Aldehyde dehy
    "K28607": 0.81, # Mannitol 2-dehy
    "K00008": 0.81, # Sorbitol 2-dehy
    "K01011": 1.94, "K02439": 1.94, "K03972": 1.94 # Rhodanese
}

OUT_DIR = '/Users/drb_laptop/Documents/AIRI_to_AIR/manuscript_figures'
os.makedirs(OUT_DIR, exist_ok=True)

def fetch_pathways_for_ko(ko_id):
    url = f"https://rest.kegg.jp/link/pathway/ko:{ko_id}"
    pathways = []
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            content = response.read().decode('utf-8')
            for line in content.split('\n'):
                if line:
                    parts = line.split('\t')
                    if len(parts) == 2:
                        pid = parts[1].replace('path:', '')
                        if pid.startswith('ko'):
                            pathways.append(pid)
    except Exception as e:
        print(f"Error fetching pathways for {ko_id}: {e}")
    return pathways

def get_kgml(pathway_id):
    print(f"Fetching KGML for {pathway_id} via curl...")
    url = f"https://rest.kegg.jp/get/{pathway_id}/kgml"
    try:
        result = subprocess.run(["curl", "-sL", "-A", "Mozilla/5.0", url], capture_output=True, text=True)
        if result.returncode == 0 and result.stdout:
            if "DOCTYPE pathway" in result.stdout:
                return result.stdout
    except Exception as e:
        pass
    return None

def build_network(xml_data):
    G = nx.DiGraph()
    root = ET.fromstring(xml_data)
    entry_dict = {}
    for entry in root.findall('entry'):
        eid = entry.attrib['id']
        name_str = entry.attrib['name']
        etype = entry.attrib['type']
        
        # An ortholog node can contain multiple KOs separated by space: "ko:K01623 ko:K01624"
        kos = [n.replace('ko:', '') for n in name_str.split(' ') if n.startswith('ko:')]
        
        graphics = entry.find('graphics')
        x, y = 0, 0
        if graphics is not None:
            x = float(graphics.attrib.get('x', 0))
            y = float(graphics.attrib.get('y', 0))
            label = graphics.attrib.get('name', ','.join(kos))
        else:
            label = ','.join(kos)
            
        entry_dict[eid] = {
            'kos': kos,
            'type': etype,
            'x': x,
            'y': y,
            'label': label
        }
        
        # Add node if it's an ortholog or compound
        if etype in ['ortholog', 'compound']:
            G.add_node(eid, kos=kos, x=x, y=y, label=label, type=etype, logfc=None)
            
    # Reactions
    for reaction in root.findall('reaction'):
        substrates = [s.attrib['id'] for s in reaction.findall('substrate')]
        products = [p.attrib['id'] for p in reaction.findall('product')]
        
        for sub_id in substrates:
            for prod_id in products:
                if G.has_node(sub_id) and G.has_node(prod_id):
                    G.add_edge(sub_id, prod_id)
                    
    # Also add relations
    for rel in root.findall('relation'):
        entry1 = rel.attrib['entry1']
        entry2 = rel.attrib['entry2']
        if G.has_node(entry1) and G.has_node(entry2):
            G.add_edge(entry1, entry2)
            
    return G

def get_color(logfc):
    if logfc is None:
        return "#dddddd"
    norm = mcolors.TwoSlopeNorm(vmin=-2, vcenter=0, vmax=2)
    cmap = plt.get_cmap('coolwarm')
    rgb = cmap(norm(logfc))
    return mcolors.to_hex(rgb)

def visualize_static(G, output_path, title):
    plt.figure(figsize=(16, 16))
    
    pos = {}
    for node, data in G.nodes(data=True):
        if 'x' in data and 'y' in data and data['x'] != 0:
            pos[node] = (data['x'], -data['y'])
            
    if len(pos) < len(G.nodes()):
        pos = nx.spring_layout(G, k=0.15, iterations=20)
        
    node_colors = []
    node_sizes = []
    
    for n in G.nodes():
        data = G.nodes[n]
        if data.get('logfc') is not None:
            node_colors.append(get_color(data['logfc']))
            node_sizes.append(300) # larger for highlighted
        else:
            node_colors.append(get_color(None))
            node_sizes.append(50)
            
    nx.draw_networkx_nodes(G, pos, node_color=node_colors, node_size=node_sizes, alpha=0.9)
    nx.draw_networkx_edges(G, pos, alpha=0.3, edge_color="#999999", arrows=False)
    
    # Add labels only for highlighted nodes
    labels = {n: data['label'].split(',')[0][:15] for n, data in G.nodes(data=True) if data.get('logfc') is not None}
    nx.draw_networkx_labels(G, pos, labels, font_size=10, font_weight="bold")
    
    plt.axis('off')
    plt.title(title, fontsize=20)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight')
    plt.close()

def main():
    print("1. Identifying relevant KEGG pathways...")
    pathway_counts = {}
    for ko in ko_logfc.keys():
        pwys = fetch_pathways_for_ko(ko)
        for p in pwys:
            if p not in pathway_counts:
                pathway_counts[p] = set()
            pathway_counts[p].add(ko)
            
    # Filter pathways that have at least 1 KO
    target_pathways = {p: kos for p, kos in pathway_counts.items() if len(kos) >= 1}
    print(f"Found {len(target_pathways)} unique pathways containing these KOs.")
    
    # Pick a few key pathways to plot (to avoid plotting 50 images)
    # E.g., the ones with the most hits, or specific metabolic ones
    sorted_pwys = sorted(target_pathways.items(), key=lambda x: len(x[1]), reverse=True)
    
    # Let's take the top 5
    for pwy, kos_present in sorted_pwys[:5]:
        print(f"\nProcessing {pwy} (contains {len(kos_present)} of our targets: {kos_present})")
        xml_data = get_kgml(pwy)
        if not xml_data:
            print(f"Could not get KGML for {pwy}")
            continue
            
        G = build_network(xml_data)
        
        # Map our logFC data
        for n, data in G.nodes(data=True):
            node_kos = data.get('kos', [])
            # If any KO matches our dict, apply the max logFC
            fc_vals = [ko_logfc[k] for k in node_kos if k in ko_logfc]
            if fc_vals:
                G.nodes[n]['logfc'] = max(fc_vals)
                
        out_png = os.path.join(OUT_DIR, f"{pwy}_highlighted.png")
        visualize_static(G, out_png, f"Pathway {pwy}")
        print(f"Saved {out_png}")
        
    print("\nDone!")

if __name__ == '__main__':
    main()
