// Metadata review across the connected Epicollect5 projects.
//
// "Using an LLM": the concept mapping below (which groups differently-worded
// questions — species/variety/cultivar/genotype — into shared concepts) and the
// lessons + recommendations were derived by analysing the projects' actual
// questions with an LLM. The app then APPLIES that mapping live to the current
// project schemas to compute which concepts are conserved vs variant, so the
// matrix stays accurate as projects change.

const EC5_BASE = 'https://five.epicollect.net';

export interface Question { question: string; type: string; }

const qCache = new Map<string, { time: number; qs: Question[] }>();
const TTL = 5 * 60_000;

// Fetch a project's questions (walks forms → inputs → groups/branches).
export async function fetchProjectQuestions(slug: string): Promise<Question[]> {
  const hit = qCache.get(slug);
  if (hit && Date.now() - hit.time < TTL) return hit.qs;
  const res = await fetch(`${EC5_BASE}/api/export/project/${encodeURIComponent(slug)}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`project ${slug}: HTTP ${res.status}`);
  const j = await res.json();
  const out: Question[] = [];
  const seen = new Set<string>();
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.question === 'string' && typeof node.type === 'string' && node.type !== 'readme') {
      const key = node.question.trim().toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push({ question: node.question.trim(), type: node.type }); }
    }
    for (const k of Object.keys(node)) if (k !== 'question') walk(node[k]);
  };
  walk(j.data || j);
  qCache.set(slug, { time: Date.now(), qs: out });
  return out;
}

// --- concept dictionary (LLM-derived), in priority order ---
export interface Concept { id: string; label: string; category: string; re: RegExp; }
export const CONCEPTS: Concept[] = [
  // identity & provenance
  { id: 'experiment_id', label: 'Experiment ID / citation', category: 'Identity', re: /\bdoi\b|citation|identifying|name\/title|experiment name|title of your/i },
  { id: 'contributor', label: 'Contributor / submitter', category: 'Identity', re: /provide a name|your name|name to pair|submission/i },
  { id: 'sample_desc', label: 'Sample description', category: 'Identity', re: /description of sample|file name/i },
  // organism
  { id: 'species', label: 'Species / cultivar / genotype', category: 'Organism', re: /speci|cultivar|variety|ecotype|genotype|martinez chimayo/i },
  // location & environment
  { id: 'location', label: 'Location', category: 'Environment', re: /city|country|geographical location|space farming|elevation/i },
  { id: 'gravity_context', label: 'Gravity / spaceflight context', category: 'Environment', re: /gravity|microgravity|clinostat|scispinner|spaceflight|\biss\b|environment (of|your) .*(pepper|sample)/i },
  { id: 'atmosphere', label: 'Atmosphere (CO₂/O₂)', category: 'Environment', re: /atmospher|\bco2\b|\bo2\b|oxygen/i },
  // timing
  { id: 'sowing_date', label: 'Sowing / entry date', category: 'Timing', re: /seeds planted|date of form|sowing|planting date/i },
  { id: 'germination', label: 'Germination timing', category: 'Timing', re: /germinat|sprout/i },
  { id: 'harvest_timing', label: 'Flower / fruit / harvest timing', category: 'Timing', re: /flower|blossom|fruit|harvest/i },
  // light
  { id: 'light_source', label: 'Light source', category: 'Light', re: /light source|light treatment|what light|\bled\b/i },
  { id: 'light_spectrum', label: 'Light spectrum / colour', category: 'Light', re: /light quality|light value for|\brgb\b|spectrum|red.*green.*blue/i },
  { id: 'light_intensity', label: 'Light intensity', category: 'Light', re: /light quantity|microeinstein|µmol|umol|\bpar\b|light value/i },
  { id: 'photoperiod', label: 'Photoperiod', category: 'Light', re: /photoperiod|hours.*light|light.*hours|hours where the lights|hours per day/i },
  { id: 'light_direction', label: 'Light direction', category: 'Light', re: /light direction|diffuse|direction from/i },
  // climate
  { id: 'temperature', label: 'Temperature', category: 'Climate', re: /temperature|celsius|celcius|fahrenheit/i },
  { id: 'humidity', label: 'Humidity', category: 'Climate', re: /humidity/i },
  // substrate & nutrition
  { id: 'growth_media', label: 'Growth media / method', category: 'Substrate', re: /growth media|gelling|agar|phytagel|growth method|substrate|hydroponic|soil/i },
  { id: 'nutrients', label: 'Nutrients', category: 'Substrate', re: /nutrient|\bls\b|\bms\b|sucrose|fertili/i },
  { id: 'watering', label: 'Watering', category: 'Substrate', re: /water|irrigat/i },
  { id: 'container', label: 'Container / vessel', category: 'Substrate', re: /container|\bplate\b|\bdish\b|vessel/i },
  // phenotype
  { id: 'size', label: 'Size (height/width/length)', category: 'Phenotype', re: /height|width|depth|length/i },
  { id: 'area', label: 'Leaf / canopy area', category: 'Phenotype', re: /canopy area|leaf.*area|leaf canopy/i },
  { id: 'biomass', label: 'Biomass / mass', category: 'Phenotype', re: /biomass|mass|weight/i },
  { id: 'count', label: 'Count (plants/leaves/fruit)', category: 'Phenotype', re: /number of (plants|leaves|fruit|pepper)|peppers.*produced|leaf count/i },
  { id: 'health', label: 'Plant health / condition', category: 'Phenotype', re: /plant health|\bhealth\b|condition/i },
  // imaging
  { id: 'photo', label: 'Photo / image', category: 'Imaging', re: /photo|picture|\bimage\b/i },
  { id: 'timelapse', label: 'Time-lapse / video', category: 'Imaging', re: /time-lapse|timelapse|\bvideo\b|image interval/i },
  { id: 'calibration', label: 'Calibration marker / scale', category: 'Imaging', re: /calibrat|marker|\bscale\b|astromycology|chip pitch/i },
  { id: 'processing', label: 'Image post-processing', category: 'Imaging', re: /post processing|post-processing/i },
  // protocol
  { id: 'sterilization', label: 'Seed sterilization', category: 'Protocol', re: /steriliz|ethanol|bleach/i },
  { id: 'imbibition', label: 'Seed imbibition', category: 'Protocol', re: /imbibition|imbib/i },
  { id: 'preservation', label: 'Tissue preservation', category: 'Protocol', re: /preservation|flash freeze|rna ?later/i },
  // notes
  { id: 'notes', label: 'Notes / observations', category: 'Notes', re: /notes|observation|comments|elaborate|issues|breakthrough|tell us|anything else/i },
];

export function classify(q: string): Concept | null {
  for (const c of CONCEPTS) if (c.re.test(q)) return c;
  return null;
}

export interface ConceptRow {
  concept: Concept;
  present: Record<string, string[]>; // slug -> matching question texts
  count: number;
}
export interface ReviewResult {
  projects: { slug: string; name: string; total: number }[];
  rows: ConceptRow[];                 // one per concept that appears at least once
  conserved: ConceptRow[];            // in a majority of projects
  variant: ConceptRow[];              // in exactly one project
  unmapped: { slug: string; question: string }[]; // questions that matched no concept
  gaps: Concept[];                    // recommended concepts absent from ALL projects
}

// Concepts we'd expect any imaging/phenotyping project to capture — used to flag gaps.
const EXPECTED = new Set(['experiment_id', 'species', 'location', 'photo', 'calibration', 'temperature', 'photoperiod', 'sowing_date']);

export function analyze(byProject: { slug: string; name: string; questions: Question[] }[]): ReviewResult {
  const rowMap = new Map<string, ConceptRow>();
  const unmapped: { slug: string; question: string }[] = [];
  for (const p of byProject) {
    for (const q of p.questions) {
      const c = classify(q.question);
      if (!c) { unmapped.push({ slug: p.slug, question: q.question }); continue; }
      let row = rowMap.get(c.id);
      if (!row) { row = { concept: c, present: {}, count: 0 }; rowMap.set(c.id, row); }
      (row.present[p.slug] ||= []).push(q.question);
    }
  }
  for (const row of rowMap.values()) row.count = Object.keys(row.present).length;

  const n = byProject.length;
  const majority = Math.max(2, Math.ceil(n / 2));
  // Order rows by category (as in CONCEPTS) then by count desc.
  const order = new Map(CONCEPTS.map((c, i) => [c.id, i]));
  const rows = [...rowMap.values()].sort((a, b) => (order.get(a.concept.id)! - order.get(b.concept.id)!));

  const conserved = [...rows].filter(r => r.count >= majority).sort((a, b) => b.count - a.count);
  const variant = rows.filter(r => r.count === 1);
  const gaps = CONCEPTS.filter(c => EXPECTED.has(c.id) && !rowMap.has(c.id));

  return {
    projects: byProject.map(p => ({ slug: p.slug, name: p.name, total: p.questions.length })),
    rows, conserved, variant, unmapped, gaps,
  };
}

// --- LLM-authored review content (grounded in the real projects) ---
export interface Lesson { title: string; detail: string; }
export const LESSONS: Lesson[] = [
  { title: 'Same concept, many wordings', detail: 'Species is asked five different ways across the projects (“species/variety/ecotype/genotype”, “cultivar”, “species of microgreen”, “plant variety”, “Is your pepper a Martinez Chimayo?”). Agree on one field name and a controlled vocabulary so answers can be compared and merged.' },
  { title: 'Units are inconsistent', detail: 'Temperature is recorded in °C in one project and °F in another; leaf area is sometimes cm² and sometimes pixels. Always state the unit in the question and pick one standard (SI) per concept.' },
  { title: 'Light captured at very different resolutions', detail: 'Light ranges from a qualitative note (“Red/blue/white”) to numeric RGBW values 0–255 to a simple checkbox. Capture source, spectrum, intensity (µmol·m⁻²·s⁻¹) and photoperiod (h) as separate, structured fields.' },
  { title: 'No consistent identifier or provenance', detail: 'Only one project asks for a DOI/citation, and contributor/date capture is uneven. Give every entry a stable sample/experiment ID plus contributor and submission date.' },
  { title: 'Imaging + calibration under-specified', detail: 'Only 3 of 5 projects have a photo field, and none ask whether a calibration marker is in frame. For this database, always include a Photo field and a “calibration marker present? (type)” field so scale and colour are recoverable.' },
  { title: 'Free text is hard to aggregate', detail: 'Many fields are open text with “other, please describe”. Prefer dropdowns / checkboxes with a controlled list (plus an optional free-text note) so the data is analysable.' },
  { title: 'Time-series schemas differ', detail: 'One project records Day 4/8/12, another Week 2/3/4, with the timepoint baked into the field name. Use a repeatable observation (date + measurement + unit) instead of hard-coded day/week columns.' },
];

export interface Recommendation { category: string; concept: string; why: string; example: string; }
export const RECOMMENDATIONS: Recommendation[] = [
  { category: 'Identity', concept: 'Sample / experiment ID', why: 'A stable key ties images, metadata and results together and enables merging across projects.', example: 'Sample ID (unique, e.g. LAB-EXP-2026-001)' },
  { category: 'Identity', concept: 'Contributor & date', why: 'Provenance and the ability to follow up.', example: 'Contributor name; Date of observation (ISO 8601)' },
  { category: 'Organism', concept: 'Species + genotype', why: 'One controlled field, Latin binomial + cultivar/ecotype, so taxa are comparable.', example: 'Species (e.g. Arabidopsis thaliana); Genotype/ecotype (e.g. Col-0)' },
  { category: 'Environment', concept: 'Gravity / environment context', why: 'Distinguishes ground vs clinostat vs microgravity/ISS — currently only one project captures it.', example: 'Environment: {ground control | clinostat | ISS/microgravity | other}' },
  { category: 'Environment', concept: 'Location', why: 'For ground samples; use the Location input for GPS.', example: 'Location (GPS)' },
  { category: 'Light', concept: 'Structured light', why: 'Separate, comparable fields instead of one free-text answer.', example: 'Source; Spectrum/RGBW; Intensity (µmol·m⁻²·s⁻¹); Photoperiod (h)' },
  { category: 'Climate', concept: 'Temperature, humidity, atmosphere', why: 'With explicit SI units.', example: 'Temperature (°C); Relative humidity (%); CO₂ (%)' },
  { category: 'Substrate', concept: 'Media & nutrition', why: 'Type, concentration and units so growth conditions are reproducible.', example: 'Media (e.g. ½ MS); Concentration (%); Sucrose (%)' },
  { category: 'Timing', concept: 'Key dates', why: 'Enables growth-rate calculations across timepoints.', example: 'Sowing date; Germination day; Sampling/imaging date' },
  { category: 'Phenotype', concept: 'Repeatable measurement', why: 'Record each measurement with its unit and method rather than per-day columns.', example: 'Trait; Value; Unit; Method; Date' },
  { category: 'Imaging', concept: 'Photo + calibration', why: 'The heart of this database — makes scale and colour recoverable.', example: 'Photo; Calibration marker present? (type); Camera/lens (optional)' },
];
