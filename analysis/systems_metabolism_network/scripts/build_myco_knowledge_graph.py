import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from matplotlib.lines import Line2D
import json
import os

OUT_PNG = "/Users/drb_laptop/Documents/AIRI_to_AIR/manuscript_figures/knowledge_graph.png"
OUT_HTML = "/Users/drb_laptop/Documents/AIRI_to_AIR/manuscript_figures/knowledge_graph.html"

# Define the Knowledge Graph
G = nx.MultiDiGraph()

# 1. ENZYMES (nodes)
enzymes = {
    "Alcohol oxidase\n(1.1.3.13)": {"logfc": 1.80, "group": "enzyme"},
    "Aldehyde dehydrogenase\n(1.2.1.3)": {"logfc": 1.90, "group": "enzyme"},
    "Mannitol 2-dehydrogenase\n(1.1.1.138)": {"logfc": 0.81, "group": "enzyme"},
    "Sorbitol 2-dehydrogenase\n(1.1.1.14)": {"logfc": 0.81, "group": "enzyme"},
    "Rhodanese\n(2.8.1.1)": {"logfc": 1.94, "group": "enzyme"},
    "Linoleate 8R-dioxygenase\n(1.13.11.60)": {"logfc": 2.78, "group": "enzyme"}
}

for e, attrs in enzymes.items():
    G.add_node(e, **attrs)

# 2. METABOLITES
metabolites = [
    "Primary Alcohol", "O2", "Aldehyde", "H2O2",
    "NAD+", "NADH", "H2O", "Carboxylate", "H+",
    "D-Mannitol", "NADP+", "D-Fructose", "NADPH",
    "D-Sorbitol", "L-Sorbose",
    "Thiosulfate", "Cyanide", "Sulfite", "Thiocyanate",
    "Linoleate", "8-HPODE"
]
for m in metabolites:
    G.add_node(m, group="metabolite")

# 3. BIOLOGICAL PROCESSES
processes = [
    "Oxidative 1C Metabolism", "Lignin Degradation",
    "Cyanide Detoxification", "Oxylipin Synthesis",
    "Osmotic Regulation", "Polyol Metabolism"
]
for p in processes:
    G.add_node(p, group="process")

# 4. COMPARTMENTS
compartments = ["Extracellular Space", "Cytoplasm", "Mitochondria"]
for c in compartments:
    G.add_node(c, group="compartment")

# 5. EDGES
def add_reaction(enzyme, consumes, produces, drives, localized):
    for c in consumes:
        G.add_edge(c, enzyme, relation="consumes")
    for p in produces:
        G.add_edge(enzyme, p, relation="produces")
    for d in drives:
        G.add_edge(enzyme, d, relation="drives_process")
    for loc in localized:
        G.add_edge(enzyme, loc, relation="localized_in")

add_reaction(
    "Alcohol oxidase\n(1.1.3.13)",
    consumes=["Primary Alcohol", "O2"],
    produces=["Aldehyde", "H2O2"],
    drives=["Oxidative 1C Metabolism", "Lignin Degradation"],
    localized=["Extracellular Space"]
)

add_reaction(
    "Aldehyde dehydrogenase\n(1.2.1.3)",
    consumes=["Aldehyde", "NAD+", "H2O"],
    produces=["Carboxylate", "NADH", "H+"],
    drives=["Oxidative 1C Metabolism"],
    localized=["Cytoplasm"]
)

add_reaction(
    "Mannitol 2-dehydrogenase\n(1.1.1.138)",
    consumes=["D-Fructose", "NADPH", "H+"],
    produces=["D-Mannitol", "NADP+"],
    drives=["Osmotic Regulation", "Polyol Metabolism"],
    localized=["Cytoplasm"]
)

add_reaction(
    "Sorbitol 2-dehydrogenase\n(1.1.1.14)",
    consumes=["L-Sorbose", "NADH", "H+"],
    produces=["D-Sorbitol", "NAD+"],
    drives=["Osmotic Regulation", "Polyol Metabolism"],
    localized=["Cytoplasm"]
)

add_reaction(
    "Rhodanese\n(2.8.1.1)",
    consumes=["Thiosulfate", "Cyanide"],
    produces=["Sulfite", "Thiocyanate"],
    drives=["Cyanide Detoxification"],
    localized=["Mitochondria"]
)

add_reaction(
    "Linoleate 8R-dioxygenase\n(1.13.11.60)",
    consumes=["Linoleate", "O2"],
    produces=["8-HPODE"],
    drives=["Oxylipin Synthesis"],
    localized=["Extracellular Space"]
)

def get_enzyme_color(logfc):
    norm = mcolors.TwoSlopeNorm(vmin=-1, vcenter=0, vmax=3)
    cmap = plt.get_cmap('coolwarm')
    rgb = cmap(norm(logfc))
    return mcolors.to_hex(rgb)

def generate_static():
    plt.figure(figsize=(22, 16))
    
    # Custom layout
    pos = nx.spring_layout(G, k=0.8, iterations=100, seed=42)
    
    # Draw by groups to apply different shapes
    group_shapes = {
        "enzyme": "o",       # Circle
        "metabolite": "s",   # Square
        "process": "D",      # Diamond
        "compartment": "h"   # Hexagon
    }
    
    # We will manually draw each group
    for group, shape in group_shapes.items():
        nodelist = [n for n, d in G.nodes(data=True) if d.get('group') == group]
        
        if group == "enzyme":
            colors = [get_enzyme_color(G.nodes[n]['logfc']) for n in nodelist]
            nx.draw_networkx_nodes(G, pos, nodelist=nodelist, node_shape=shape, 
                                   node_color=colors, node_size=3500, edgecolors='black', linewidths=2)
        elif group == "metabolite":
            nx.draw_networkx_nodes(G, pos, nodelist=nodelist, node_shape=shape, 
                                   node_color="#d3d3d3", node_size=800, edgecolors='grey')
        elif group == "process":
            nx.draw_networkx_nodes(G, pos, nodelist=nodelist, node_shape=shape, 
                                   node_color="#90EE90", node_size=2000, edgecolors='darkgreen')
        elif group == "compartment":
            nx.draw_networkx_nodes(G, pos, nodelist=nodelist, node_shape=shape, 
                                   node_color="#E6E6FA", node_size=2500, edgecolors='purple')

    # Draw edges with different colors/styles based on relation
    edge_styles = {
        "consumes": {"color": "#ff7f0e", "style": "solid", "width": 2},
        "produces": {"color": "#2ca02c", "style": "solid", "width": 2},
        "drives_process": {"color": "#1f77b4", "style": "dashed", "width": 2},
        "localized_in": {"color": "#9467bd", "style": "dotted", "width": 2}
    }
    
    for u, v, key, data in G.edges(data=True, keys=True):
        rel = data.get('relation')
        style = edge_styles.get(rel, {"color": "black", "style": "solid", "width": 1})
        nx.draw_networkx_edges(G, pos, edgelist=[(u,v)], edge_color=style["color"],
                               style=style["style"], width=style["width"],
                               arrowsize=15, connectionstyle='arc3, rad=0.1')
                               
    # Draw labels
    # Use smaller font for metabolites, larger for enzymes/processes
    labels_enz = {n: n for n, d in G.nodes(data=True) if d.get('group') == 'enzyme'}
    labels_met = {n: n for n, d in G.nodes(data=True) if d.get('group') == 'metabolite'}
    labels_pro = {n: n for n, d in G.nodes(data=True) if d.get('group') == 'process'}
    labels_com = {n: n for n, d in G.nodes(data=True) if d.get('group') == 'compartment'}
    
    nx.draw_networkx_labels(G, pos, labels=labels_enz, font_size=10, font_weight='bold')
    nx.draw_networkx_labels(G, pos, labels=labels_met, font_size=8)
    nx.draw_networkx_labels(G, pos, labels=labels_pro, font_size=9, font_weight='bold', font_color='darkgreen')
    nx.draw_networkx_labels(G, pos, labels=labels_com, font_size=9, font_weight='bold', font_color='purple')

    # Legend
    legend_elements = [
        Line2D([0], [0], marker='o', color='w', label='Enzyme (LogFC Colored)', markerfacecolor='#ff9999', markersize=15, markeredgecolor='black'),
        Line2D([0], [0], marker='s', color='w', label='Metabolite/Cofactor', markerfacecolor='#d3d3d3', markersize=10, markeredgecolor='grey'),
        Line2D([0], [0], marker='D', color='w', label='Biological Process', markerfacecolor='#90EE90', markersize=12, markeredgecolor='darkgreen'),
        Line2D([0], [0], marker='h', color='w', label='Cellular Compartment', markerfacecolor='#E6E6FA', markersize=12, markeredgecolor='purple'),
        Line2D([0], [0], color='#ff7f0e', lw=2, label='Consumes (Substrate)'),
        Line2D([0], [0], color='#2ca02c', lw=2, label='Produces (Product)'),
        Line2D([0], [0], color='#1f77b4', lw=2, linestyle='--', label='Drives Process'),
        Line2D([0], [0], color='#9467bd', lw=2, linestyle=':', label='Localized In')
    ]
    plt.legend(handles=legend_elements, loc='upper left', fontsize=12, title="Node & Edge Types", title_fontsize='14')

    plt.title("Myco-Pharma Systems Metabolism Knowledge Graph", fontsize=24)
    plt.axis('off')
    plt.tight_layout()
    plt.savefig(OUT_PNG, dpi=300, bbox_inches='tight')
    plt.close()
    
def generate_html():
    nodes_json = []
    for n, data in G.nodes(data=True):
        group = data.get('group')
        color = "#dddddd"
        shape = "ellipse"
        if group == "enzyme":
            color = get_enzyme_color(data['logfc'])
            shape = "ellipse"
        elif group == "metabolite":
            color = "#d3d3d3"
            shape = "rectangle"
        elif group == "process":
            color = "#90EE90"
            shape = "diamond"
        elif group == "compartment":
            color = "#E6E6FA"
            shape = "hexagon"
            
        nodes_json.append({
            'data': {'id': n, 'label': n, 'color': color, 'shape': shape, 'group': group}
        })
        
    edges_json = []
    edge_styles = {
        "consumes": {"color": "#ff7f0e", "style": "solid"},
        "produces": {"color": "#2ca02c", "style": "solid"},
        "drives_process": {"color": "#1f77b4", "style": "dashed"},
        "localized_in": {"color": "#9467bd", "style": "dotted"}
    }
    
    for u, v, key, data in G.edges(data=True, keys=True):
        rel = data.get('relation')
        style = edge_styles.get(rel, {"color": "black", "style": "solid"})
        edges_json.append({
            'data': {'source': u, 'target': v, 'color': style['color'], 'style': style['style'], 'relation': rel}
        })

    html_content = """<!DOCTYPE html>
<html>
<head>
    <title>Knowledge Graph</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.23.0/cytoscape.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/cytoscape-svg@0.4.0/cytoscape-svg.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <style>
        body { font-family: sans-serif; margin: 0; padding: 0; }
        #cy { width: 100vw; height: 100vh; display: block; }}
        .legend {{ position: absolute; top: 20px; left: 20px; background: rgba(255,255,255,0.95); padding: 15px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); z-index: 1000; border: 1px solid #ccc; }
        .legend h3 { margin-top: 0; font-size: 16px; margin-bottom: 10px; }
        .legend-item { margin-bottom: 6px; font-size: 12px; display: flex; align-items: center; }
        .color-box { display: inline-block; width: 14px; height: 14px; margin-right: 8px; border: 1px solid #999; }
        .edge-line { display: inline-block; width: 20px; height: 3px; margin-right: 8px; }
            .export-panel { position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.95); padding: 12px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); z-index: 1000; border: 1px solid #ccc; text-align: center; }
        .export-panel strong { font-size: 14px; margin-bottom: 8px; display: block; }
        .export-panel button { cursor: pointer; padding: 6px 12px; font-size: 12px; border: 1px solid #999; background: #eee; border-radius: 4px; display: block; width: 100%; margin-bottom: 6px; font-weight: bold; color: #333; }
        .export-panel button:hover { background: #ddd; }
    </style>
</head>
<body>
    <div class="legend">
        <h3>Knowledge Graph Legend</h3>
        <strong>Nodes</strong>
        <div class="legend-item"><span class="color-box" style="background:#ff9999; border-radius:50%;"></span>Enzyme (Colored by LogFC)</div>
        <div class="legend-item"><span class="color-box" style="background:#d3d3d3; border-radius:2px;"></span>Metabolite/Cofactor</div>
        <div class="legend-item"><span class="color-box" style="background:#90EE90; transform: rotate(45deg); margin: 0 10px 0 3px;"></span>Biological Process</div>
        <div class="legend-item"><span class="color-box" style="background:#E6E6FA; clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%); margin-left: 2px;"></span>Cellular Compartment</div>
        <br>
        <strong>Edges</strong>
        <div class="legend-item"><span class="edge-line" style="background:#ff7f0e;"></span>Consumes (Substrate)</div>
        <div class="legend-item"><span class="edge-line" style="background:#2ca02c;"></span>Produces (Product)</div>
        <div class="legend-item"><span class="edge-line" style="background:transparent; border-top: 3px dashed #1f77b4; height: 0;"></span>Drives Process</div>
        <div class="legend-item"><span class="edge-line" style="background:transparent; border-top: 3px dotted #9467bd; height: 0;"></span>Localized In</div>
    </div>
    <div class="export-panel">
        <strong>Export Graph</strong>
        <button onclick="exportPNG()">PNG</button>
        <button onclick="exportSVG()">SVG</button>
        <button onclick="exportPDF()">PDF</button>
    </div>
    <div id="cy"></div>
    <script>
        var cy = cytoscape({
            container: document.getElementById('cy'),
            elements: {
                nodes: $$NODES$$,
                edges: $$EDGES$$
            },
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': 'data(color)',
                        'label': 'data(label)',
                        'shape': 'data(shape)',
                        'font-size': '14px',
                        'text-wrap': 'wrap',
                        'text-max-width': '110px',
                        'width': '90px',
                        'height': '90px',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'color': '#000',
                        'border-width': 1,
                        'border-color': '#666'
                    }
                },
                {
                    selector: 'node[group="metabolite"]',
                    style: {
                        'width': '65px',
                        'height': '45px',
                        'font-size': '12px'
                    }
                },
                {
                    selector: 'node[group="process"]',
                    style: {
                        'width': '100px',
                        'height': '100px',
                        'color': 'darkgreen',
                        'font-weight': 'bold'
                    }
                },
                {
                    selector: 'node[group="compartment"]',
                    style: {
                        'width': '120px',
                        'height': '100px',
                        'color': 'indigo',
                        'font-weight': 'bold'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 3,
                        'line-color': 'data(color)',
                        'line-style': 'data(style)',
                        'target-arrow-color': 'data(color)',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'label': 'data(relation)',
                        'font-size': '12px',
                        'text-rotation': 'autorotate',
                        'text-margin-y': -10,
                        'text-opacity': 0.8
                    }
                }
            ],
            layout: {
                name: 'cose',
                idealEdgeLength: 150,
                nodeOverlap: 20,
                refresh: 20,
                fit: true,
                padding: 30,
                randomize: true,
                componentSpacing: 200,
                nodeRepulsion: 800000,
                edgeElasticity: 100,
                nestingFactor: 5,
                gravity: 80,
                numIter: 1000,
                initialTemp: 200,
                coolingFactor: 0.95,
                minTemp: 1.0
            }
        });
    </script>
</body>
</html>
    """
    html_content = html_content.replace("$$NODES$$", json.dumps(nodes_json))
    html_content = html_content.replace("$$EDGES$$", json.dumps(edges_json))
    with open(OUT_HTML, 'w') as f:
        f.write(html_content)

def main():
    print("Generating Knowledge Graph Static PNG...")
    generate_static()
    print("Generating Knowledge Graph Interactive HTML...")
    generate_html()
    print("Done!")

if __name__ == '__main__':
    main()
