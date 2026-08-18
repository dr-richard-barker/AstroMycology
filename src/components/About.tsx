import React from 'react';
import { Ruler, Cpu, Database, Github, Box } from 'lucide-react';

export const About: React.FC = () => (
  <div style={{ maxWidth: 760 }}>
    <div className="page-head">
      <div className="eyebrow">About</div>
      <h1>What this is</h1>
      <p>A community database for mushroom imagery — RGB photos, RGB-thermal photos, and 3D scans — with an in-browser 3D viewer/analysis tool and optional calibration-marker scale &amp; colour recovery on flat photos.</p>
    </div>

    <div className="grid" style={{ gap: 16 }}>
      <div className="card pad">
        <div className="card-title"><Box /> 3D scans, viewed &amp; measured in the browser</div>
        <p style={{ fontSize: '.9rem' }}>A <span className="mono">.ply</span>/<span className="mono">.obj</span>/<span className="mono">.glb</span>/<span className="mono">.gltf</span>/<span className="mono">.stl</span> scan (e.g. from a structured-light scanner) opens in an orbitable Three.js viewer. Vertex/face counts, bounding-box dimensions, surface area, and volume are computed client-side — the volume via a signed-tetrahedron sum over the mesh faces, the same approach the original <span className="mono">Mushroom_to_Volume_ply.ipynb</span> notebook used with <span className="mono">trimesh</span>, ported to run in-browser. Non-watertight meshes are flagged, since that's exactly where the notebook's own volume figure went unreliable on one sample.</p>
      </div>

      <div className="card pad">
        <div className="card-title"><Ruler /> The calibration marker (for flat photos)</div>
        <p style={{ fontSize: '.9rem' }}>Recycled from the AstroBotany project: a card with four corner ArUco fiducials (dictionary <span className="mono">ARUCO_MIP_36h12</span>) around a 15-chip colour + grayscale reference, with a fixed <span className="mono">4.3&nbsp;cm</span> span between opposite corner centres. Detecting the four corners gives the pixels-per-mm scale, the in-plane rotation, and a sampling grid for the colour chips — useful for RGB and RGB-thermal photos; 3D scans use the viewer's own volume/dimension measurements instead.</p>
      </div>

      <div className="card pad">
        <div className="card-title"><Database /> Storage: Epicollect5 (free), GitHub, or local upload</div>
        <p style={{ fontSize: '.9rem' }}>Sources can be a free <a href="https://five.epicollect.net" target="_blank" rel="noreferrer">Epicollect5</a> project (mobile-app capture with GPS + fields), a public GitHub folder of images/scans, or files uploaded locally in your browser (including <span className="mono">.heic</span>/<span className="mono">.heif</span>, decoded client-side). This app is a <strong>static site</strong> that reads those sources directly — no server, no hosting fees, no Google GenAI.</p>
      </div>

      <div className="card pad">
        <div className="card-title"><Cpu /> Analysis — in your browser</div>
        <p style={{ fontSize: '.9rem' }}>Marker detection (geometric + <span className="mono">js-aruco2</span> ArUco fallback), colour calibration, HEIC decoding, and 3D mesh analysis all run client-side. Results are cached in your browser and included in the exported manifest — nothing is uploaded to a server for analysis.</p>
      </div>

      <div className="card pad">
        <div className="card-title"><Github /> Open source</div>
        <p style={{ fontSize: '.9rem' }}>Built for the Center of Space Exploration, forked from the architecture of <a href="https://github.com/dr-richard-barker/AstroBotany_calibration_image_sharing_and_analysis" target="_blank" rel="noreferrer">AstroBotany_calibration_image_sharing_and_analysis</a>. The repo's <span className="mono">legacy/</span> folder keeps the original mesh-volume-calculator notebook this project grew out of.</p>
      </div>
    </div>
  </div>
);
