// In-browser 3D scan viewer + analysis, replacing AstroBotany's AstroRoot/RSML
// tool for this database. Loads a mesh or point cloud (.ply/.obj/.glb/.gltf/
// .stl), renders it with orbit controls, and computes volume/dimensions/area
// client-side — the same idea as the legacy notebook's `trimesh.mesh.volume`
// loop, ported to run in the browser instead of Colab.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export type ScanFormat = 'ply' | 'obj' | 'glb' | 'gltf' | 'stl';
const FORMAT_RE = /\.(ply|obj|glb|gltf|stl)(?:\?.*)?$/i;

export function formatFromName(name: string): ScanFormat | null {
  const m = name.toLowerCase().match(FORMAT_RE);
  return m ? (m[1] as ScanFormat) : null;
}

const MESH_MATERIAL = () => new THREE.MeshStandardMaterial({ color: 0xcbb994, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
const POINTS_MATERIAL = () => new THREE.PointsMaterial({ color: 0x3fb6a8, size: 1.4, sizeAttenuation: true });

// Load a scan (from a URL or a local File/Blob) into a renderable Object3D.
export async function loadScan(source: string | Blob, format: ScanFormat): Promise<THREE.Object3D> {
  const isBlobSource = typeof source !== 'string';
  const url = isBlobSource ? URL.createObjectURL(source as Blob) : (source as string);
  try {
    if (format === 'ply') {
      const geometry = await new PLYLoader().loadAsync(url);
      const hasFaces = geometry.index !== null;
      geometry.computeVertexNormals();
      return hasFaces ? new THREE.Mesh(geometry, MESH_MATERIAL()) : new THREE.Points(geometry, POINTS_MATERIAL());
    }
    if (format === 'stl') {
      const geometry = await new STLLoader().loadAsync(url);
      geometry.computeVertexNormals();
      return new THREE.Mesh(geometry, MESH_MATERIAL());
    }
    if (format === 'obj') {
      const obj = await new OBJLoader().loadAsync(url);
      obj.traverse(c => { if (c instanceof THREE.Mesh) c.material = MESH_MATERIAL(); });
      return obj;
    }
    // glb / gltf
    const gltf = await new GLTFLoader().loadAsync(url);
    return gltf.scene;
  } finally {
    if (isBlobSource) URL.revokeObjectURL(url);
  }
}

export interface MeshStats {
  vertexCount: number;
  faceCount: number;
  isPointCloudOnly: boolean;
  dims: { x: number; y: number; z: number }; // bounding-box size, native units
  volume: number | null;     // native units^3 (null for point clouds — no faces to integrate)
  area: number | null;       // native units^2
  watertight: boolean | null; // null when not applicable (point cloud)
  parts: number;              // how many separate meshes/point-clouds were combined
}

// Signed-tetrahedron-sum volume (same algorithm trimesh's `mesh.volume` uses)
// plus surface area and a manifold/watertight check (every edge shared by
// exactly two faces — a non-manifold mesh gives an unreliable volume, same
// failure mode the legacy notebook hit on `Blank Tube Scan_pc.ply`).
function statsForGeometry(geometry: THREE.BufferGeometry): { vertexCount: number; faceCount: number; volume: number; area: number; watertight: boolean } | { vertexCount: number; faceCount: 0 } {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const index = geometry.index;
  if (!index) return { vertexCount: pos.count, faceCount: 0 };

  let volume = 0, area = 0;
  const edgeCounts = new Map<string, number>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const bumpEdge = (i: number, j: number) => {
    const key = i < j ? `${i}_${j}` : `${j}_${i}`;
    edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
  };
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    volume += a.dot(b.clone().cross(c)) / 6;
    area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    bumpEdge(ia, ib); bumpEdge(ib, ic); bumpEdge(ic, ia);
  }
  const watertight = [...edgeCounts.values()].every(n => n === 2);
  return { vertexCount: pos.count, faceCount: index.count / 3, volume: Math.abs(volume), area, watertight };
}

// Aggregate stats across every mesh/point-cloud in the loaded object (an OBJ
// or GLTF scene can contain several), plus one combined bounding box.
export function computeStats(root: THREE.Object3D): MeshStats {
  let vertexCount = 0, faceCount = 0, volume = 0, area = 0, parts = 0;
  let anyFaces = false, allWatertight = true;
  const box = new THREE.Box3();

  root.updateMatrixWorld(true);
  root.traverse(obj => {
    if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.Points)) return;
    parts++;
    box.expandByObject(obj);
    const s = statsForGeometry(obj.geometry as THREE.BufferGeometry);
    vertexCount += s.vertexCount;
    if (s.faceCount > 0) {
      anyFaces = true;
      faceCount += s.faceCount;
      volume += (s as any).volume as number;
      area += (s as any).area as number;
      allWatertight = allWatertight && (s as any).watertight;
    }
  });

  const size = new THREE.Vector3();
  if (!box.isEmpty()) box.getSize(size);

  return {
    vertexCount, faceCount, parts,
    isPointCloudOnly: !anyFaces,
    dims: { x: size.x, y: size.y, z: size.z },
    volume: anyFaces ? volume : null,
    area: anyFaces ? area : null,
    watertight: anyFaces ? allWatertight : null,
  };
}

// ---- viewer scaffold: scene, camera, orbit controls, resize + render loop ----
export interface Viewer {
  setObject(obj: THREE.Object3D): void;
  dispose(): void;
}

export function createViewer(container: HTMLElement): Viewer {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14181f);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x30323a, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 5, 4);
  scene.add(key);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  let current: THREE.Object3D | null = null;
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  const resize = () => {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  return {
    setObject(obj: THREE.Object3D) {
      if (current) { scene.remove(current); }
      current = obj;
      scene.add(obj);

      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      obj.position.sub(center); // center at origin

      const radius = Math.max(size.length() / 2, 1e-6);
      camera.near = radius / 100;
      camera.far = radius * 100;
      camera.position.set(radius * 1.6, radius * 1.2, radius * 1.6);
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.update();
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
