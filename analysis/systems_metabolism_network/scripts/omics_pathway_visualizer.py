import ssl
ssl._create_default_https_context = ssl._create_unverified_context

import subprocess
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
import csv
import re
import math
import os
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import json

# --- Config ---
TRANSCRIPTOMICS_FILE = '/Users/drb_laptop/Documents/AIRI_to_AIR/paintomics_input/transcriptomics_quantification.txt'
METABOLOMICS_FILE = '/Users/drb_laptop/Documents/AIRI_to_AIR/paintomics_input/metabolomics_quantification.txt'
PATHWAY_ID = 'hsa00010' # Global Metabolic Pathways
CACHE_FILE = '/Users/drb_laptop/Documents/AIRI_to_AIR/scripts/kegg_cache.json'
OUTPUT_PNG = '/Users/drb_laptop/Documents/AIRI_to_AIR/pathway_visualization.png'
OUTPUT_HTML = '/Users/drb_laptop/Documents/AIRI_to_AIR/pathway_visualization.html'

cache = {}
if os.path.exists(CACHE_FILE):
    with open(CACHE_FILE, 'r') as f:
        cache = json.load(f)

def save_cache():
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f)

kegg_compound_map = {}
kegg_gene_map = {}

def load_kegg_dictionaries():
    print("Loading KEGG dictionaries (this takes a moment but is a one-time operation)...")
    
    # Compounds
    if "list:compound" not in cache:
        print("Fetching compound list...")
        try:
            req = urllib.request.Request("https://rest.kegg.jp/list/compound")
            with urllib.request.urlopen(req) as resp:
                cache["list:compound"] = resp.read().decode('utf-8')
                save_cache()
        except Exception as e:
            print("Failed to fetch compounds:", e)
            cache["list:compound"] = ""
            
    for line in cache["list:compound"].split('\n'):
        if not line: continue
        parts = line.split('\t')
        if len(parts) == 2:
            cid = parts[0].replace('cpd:', '')
            names = [n.strip().lower() for n in parts[1].split(';')]
            for n in names:
                kegg_compound_map[n] = cid
                
    # Orthologs (Genes)
    if "list:orthology" not in cache:
        print("Fetching orthology list...")
        try:
            req = urllib.request.Request("https://rest.kegg.jp/list/orthology")
            with urllib.request.urlopen(req) as resp:
                cache["list:orthology"] = resp.read().decode('utf-8')
                save_cache()
        except Exception as e:
            print("Failed to fetch orthology:", e)
            cache["list:orthology"] = ""
            
    for line in cache["list:orthology"].split('\n'):
        if not line: continue
        parts = line.split('\t')
        if len(parts) == 2:
            kid = parts[0].replace('ko:', '')
            # Names can be "E1.1.1.1, adh..."
            names = [n.strip().lower() for n in parts[1].split(',')]
            for n in names:
                kegg_gene_map[n] = kid

def fetch_kegg_id(name, type_="compound"):
    n_lower = name.lower()
    if type_ == "compound":
        return kegg_compound_map.get(n_lower)
    else:
        return kegg_gene_map.get(n_lower)

def load_omics(filepath, type_):
    data = {}
    if not os.path.exists(filepath):
        print(f"File {filepath} not found!")
        return data
        
    with open(filepath, 'r') as f:
        reader = csv.reader(f, delimiter='\t')
        next(reader)
        rows = list(reader)
        print(f"Loading {len(rows)} items from {filepath}")
        mapped_count = 0
        for row in rows:
            if len(row) < 2: continue
            name, logfc = row[0], float(row[1])
            kegg_id = fetch_kegg_id(name, type_)
            if kegg_id:
                data[kegg_id] = logfc
                mapped_count += 1
        print(f"  -> Successfully mapped {mapped_count}/{len(rows)} to KEGG IDs via exact match.")
    return data

def get_kgml(pathway_id):
    cache_key = f"kgml:{pathway_id}"
    if cache_key in cache:
        return cache[cache_key]
        
    print(f"Fetching KGML for {pathway_id} via curl...")
    url = f"https://rest.kegg.jp/get/{pathway_id}/kgml"
    try:
        result = subprocess.run(["curl", "-s", "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", url], capture_output=True, text=True)
        if result.returncode == 0 and result.stdout:
            xml_data = result.stdout
            cache[cache_key] = xml_data
            save_cache()
            return xml_data
        else:
            print(f"Curl failed: {result.stderr}")
            return None
    except Exception as e:
        print(f"Error downloading KGML: {e}")
        return None

def build_network(xml_data):
    G = nx.DiGraph()
    root = ET.fromstring(xml_data)
    entry_dict = {}
    for entry in root.findall('entry'):
        eid = entry.attrib['id']
        name_str = entry.attrib['name']
        etype = entry.attrib['type']
        
        # For multiple ids, pick the first
        first_name = name_str.split(' ')[0].split(':')[-1]
        
        graphics = entry.find('graphics')
        x, y = 0, 0
        if graphics is not None:
            x = float(graphics.attrib.get('x', 0))
            y = float(graphics.attrib.get('y', 0))
            label = graphics.attrib.get('name', first_name).split(',')[0]
        else:
            label = first_name
            
        entry_dict[eid] = {
            'kegg_id': first_name,
            'type': etype,
            'x': x,
            'y': y,
            'label': label
        }
        
        if etype == 'compound':
            G.add_node(first_name, x=x, y=y, label=label, type=etype, logfc=None)
            
    for reaction in root.findall('reaction'):
        substrates = [s.attrib['id'] for s in reaction.findall('substrate')]
        products = [p.attrib['id'] for p in reaction.findall('product')]
        rn_name = reaction.attrib['name'].split(' ')[0].split(':')[-1]
        
        for sub_id in substrates:
            for prod_id in products:
                if sub_id in entry_dict and prod_id in entry_dict:
                    sub_kegg = entry_dict[sub_id]['kegg_id']
                    prod_kegg = entry_dict[prod_id]['kegg_id']
                    if G.has_node(sub_kegg) and G.has_node(prod_kegg):
                        G.add_edge(sub_kegg, prod_kegg, enzyme=rn_name, logfc=None)
                        
    return G

def map_data_to_network(G, metab_data, transcript_data):
    for node in G.nodes():
        if node in metab_data:
            G.nodes[node]['logfc'] = metab_data[node]
            
    for u, v, data in G.edges(data=True):
        rn = data.get('enzyme')
        if rn in transcript_data:
            data['logfc'] = transcript_data[rn]
            
    return G

def get_color(logfc):
    if logfc is None:
        return "#dddddd"
    norm = mcolors.TwoSlopeNorm(vmin=-2, vcenter=0, vmax=2)
    cmap = plt.get_cmap('coolwarm')
    rgb = cmap(norm(logfc))
    return mcolors.to_hex(rgb)

def visualize_static(G, output_path):
    plt.figure(figsize=(24, 24))
    
    pos = {}
    for node, data in G.nodes(data=True):
        if 'x' in data and 'y' in data and data['x'] != 0:
            pos[node] = (data['x'], -data['y'])
            
    if len(pos) < len(G.nodes()):
        pos = nx.spring_layout(G, k=0.15, iterations=20)
        
    node_colors = [get_color(G.nodes[n].get('logfc')) for n in G.nodes()]
    edge_colors = [get_color(G.edges[u, v].get('logfc')) for u, v in G.edges()]
    
    nx.draw_networkx_nodes(G, pos, node_color=node_colors, node_size=40, alpha=0.9)
    nx.draw_networkx_edges(G, pos, edge_color=edge_colors, alpha=0.5, arrows=False)
    
    plt.axis('off')
    plt.title("Multi-Omics Metabolic Pathway (hsa00010)", fontsize=24)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight')
    plt.close()

def visualize_html(G, output_path):
    nodes_json = []
    for n, data in G.nodes(data=True):
        color = get_color(data.get('logfc'))
        nodes_json.append({
            'data': {'id': n, 'label': data.get('label', n), 'color': color, 'type': 'metabolite', 'logfc': data.get('logfc', 'ND')}
        })
        
    edges_json = []
    for u, v, data in G.edges(data=True):
        color = get_color(data.get('logfc'))
        edges_json.append({
            'data': {'source': u, 'target': v, 'color': color, 'enzyme': data.get('enzyme', ''), 'logfc': data.get('logfc', 'ND')}
        })
        
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>Pathway Visualization</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.23.0/cytoscape.min.js"></script>
    <style>
        body {{ font-family: sans-serif; margin: 0; padding: 0; }}
        #cy {{ width: 100vw; height: 100vh; display: block; }}
        .legend {{ position: absolute; top: 20px; left: 20px; background: rgba(255,255,255,0.9); padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 1000; }}
        .legend h3 {{ margin-top: 0; }}
        .color-box {{ display: inline-block; width: 15px; height: 15px; margin-right: 8px; vertical-align: middle; border-radius: 3px; }}
        #tooltip {{ position: absolute; display: none; background: #333; color: white; padding: 5px 10px; border-radius: 4px; font-size: 12px; pointer-events: none; z-index: 1001; }}
    </style>
</head>
<body>
    <div class="legend">
        <h3>Multi-Omics KEGG Network (hsa00010)</h3>
        <p>LogFC Mapping:</p>
        <div><span class="color-box" style="background:#b40426;"></span>Upregulated (LogFC > 0)</div>
        <div><span class="color-box" style="background:#3b4cc0;"></span>Downregulated (LogFC < 0)</div>
        <div><span class="color-box" style="background:#dddddd;"></span>Undetected</div>
    </div>
    <div id="tooltip"></div>
    <div id="cy"></div>
    <script>
        var cy = cytoscape({{
            container: document.getElementById('cy'),
            elements: {{
                nodes: {json.dumps(nodes_json)},
                edges: {json.dumps(edges_json)}
            }},
            style: [
                {{
                    selector: 'node',
                    style: {{
                        'background-color': 'data(color)',
                        'label': 'data(label)',
                        'font-size': '10px',
                        'width': '20px',
                        'height': '20px',
                        'text-valign': 'center',
                        'text-halign': 'right',
                        'color': '#222'
                    }}
                }},
                {{
                    selector: 'edge',
                    style: {{
                        'width': 3,
                        'line-color': 'data(color)',
                        'target-arrow-color': 'data(color)',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'opacity': 0.8
                    }}
                }}
            ],
            layout: {{
                name: 'cose',
                animate: false,
                nodeOverlap: 20
            }}
        }});

        cy.on('mouseover', 'node', function(e){{
            var node = e.target;
            var pos = e.renderedPosition;
            var t = document.getElementById('tooltip');
            t.innerHTML = '<strong>' + node.data('id') + '</strong><br>' + node.data('label') + '<br>LogFC: ' + node.data('logfc');
            t.style.left = (pos.x + 20) + 'px';
            t.style.top = (pos.y) + 'px';
            t.style.display = 'block';
        }});
        cy.on('mouseout', 'node', function(e){{
            document.getElementById('tooltip').style.display = 'none';
        }});
    </script>
</body>
</html>
    """
    with open(output_path, 'w') as f:
        f.write(html_content)

def main():
    load_kegg_dictionaries()
    
    print("\n1. Loading and Mapping Omics Data...")
    metab_data = load_omics(METABOLOMICS_FILE, "compound")
    transcript_data = load_omics(TRANSCRIPTOMICS_FILE, "genes")
    
    print("\n2. Fetching KEGG KGML...")
    xml_data = get_kgml(PATHWAY_ID)
    if not xml_data:
        print("Failed to download KGML")
        return
        
    print("\n3. Building Graph Topology...")
    G = build_network(xml_data)
    print(f"   - Created graph with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges")
    
    print("\n4. Overlaying Omics Data...")
    G = map_data_to_network(G, metab_data, transcript_data)
    
    # Calculate how many mapped correctly onto the graph
    mapped_nodes = sum(1 for n, d in G.nodes(data=True) if d.get('logfc') is not None)
    mapped_edges = sum(1 for u, v, d in G.edges(data=True) if d.get('logfc') is not None)
    print(f"   - Features displayed in Pathway: {mapped_nodes} Metabolites, {mapped_edges} Transcript/Reactions.")
    
    print("\n5. Rendering Visualizations...")
    visualize_static(G, OUTPUT_PNG)
    print(f"   - Static image saved to {OUTPUT_PNG}")
    
    visualize_html(G, OUTPUT_HTML)
    print(f"   - Interactive HTML saved to {OUTPUT_HTML}")
    
    print("\nPipeline Complete!")

if __name__ == '__main__':
    main()
