// Generate a downloadable Epicollect5 form template from the recommended
// metadata concepts. The JSON matches Epicollect5's own project-structure schema
// (project → forms → inputs), so it doubles as a precise build checklist for the
// form builder and is ready for any import path Epicollect5 offers.

export interface TemplateField {
  question: string;
  type: 'text' | 'textarea' | 'integer' | 'decimal' | 'date' | 'location' | 'photo' | 'dropdown' | 'checkbox';
  required?: boolean;
  title?: boolean;
  options?: string[];      // for dropdown / checkbox
  help?: string;           // shown in the CSV / builder notes
}

// The recommended form — grounded in the metadata review (adds the identifiers,
// units, structured light and the calibration-marker field the projects lacked).
export const TEMPLATE_FIELDS: TemplateField[] = [
  // Identity & provenance
  { question: 'Sample / experiment ID', type: 'text', required: true, title: true, help: 'Unique key, e.g. LAB-EXP-2026-001. Ties images, metadata and results together.' },
  { question: 'Contributor name', type: 'text', help: 'Who recorded this entry.' },
  { question: 'Date of observation', type: 'date', help: 'ISO 8601. Use the app to auto-fill current date if desired.' },
  { question: 'DOI or citation (optional)', type: 'text', help: 'Reference for the protocol/dataset.' },
  // Organism
  { question: 'Species (Latin binomial)', type: 'text', required: true, help: 'e.g. Arabidopsis thaliana. Use one controlled field.' },
  { question: 'Genotype / ecotype / cultivar', type: 'text', help: 'e.g. Col-0, WS, Micro-Tom.' },
  // Environment
  { question: 'Environment', type: 'dropdown', options: ['Ground control (1g)', 'Clinostat / random-positioning', 'ISS / microgravity', 'Parabolic flight', 'Other'], help: 'Gravity / spaceflight context — currently only one project captures this.' },
  { question: 'Location', type: 'location', help: 'GPS (auto-captured by the app) for ground samples.' },
  // Substrate & nutrition
  { question: 'Growth medium / substrate', type: 'dropdown', options: ['Agar / gel', 'Soil', 'Rockwool', 'Hydroponic', 'Aeroponic', 'Other'] },
  { question: 'Medium concentration / strength', type: 'text', help: 'e.g. 0.5% phytagel; ½ MS.' },
  { question: 'Nutrient solution', type: 'text', help: 'e.g. ½ MS, ½ LS; sucrose %.' },
  { question: 'Watering / nutrient delivery', type: 'textarea' },
  // Light (structured)
  { question: 'Light source', type: 'dropdown', options: ['LED', 'Fluorescent', 'Sunlight', 'Mixed', 'Other'] },
  { question: 'Light spectrum', type: 'checkbox', options: ['Red', 'Green', 'Blue', 'White', 'Far-red', 'Full spectrum'] },
  { question: 'Light intensity (µmol·m⁻²·s⁻¹)', type: 'integer', help: 'PPFD. Give a number + this unit.' },
  { question: 'Photoperiod (hours light / day)', type: 'integer', help: '0–24.' },
  // Climate
  { question: 'Temperature (°C)', type: 'decimal', help: 'Standardise on °C.' },
  { question: 'Relative humidity (%)', type: 'integer' },
  { question: 'CO₂ (%) (optional)', type: 'decimal' },
  // Timing
  { question: 'Sowing / planting date', type: 'date' },
  { question: 'Days to germination', type: 'integer' },
  { question: 'Days after planting at imaging', type: 'integer' },
  // Phenotype (repeatable value + unit)
  { question: 'Measurement type', type: 'dropdown', options: ['Plant height', 'Plant width', 'Root length', 'Leaf / canopy area', 'Fresh mass', 'Dry mass', 'Leaf count', 'Fruit count', 'Other'] },
  { question: 'Measurement value', type: 'decimal', help: 'Record with the unit below and the method.' },
  { question: 'Measurement unit', type: 'dropdown', options: ['mm', 'cm', 'mm²', 'cm²', 'g', 'mg', 'count'] },
  { question: 'Phenotype notes', type: 'textarea' },
  // Imaging (the point of this database)
  { question: 'Photo', type: 'photo', required: true, help: 'Photograph the specimen NEXT TO the calibration marker so scale & colour are recoverable.' },
  { question: 'Calibration marker in frame?', type: 'dropdown', options: ['Yes — AstroMycology ArUco card', 'Yes — ruler / scale bar', 'Yes — colour card', 'No'], required: true, help: 'The field the reviewed projects were missing.' },
  { question: 'Marker type / notes', type: 'text' },
  { question: 'Camera / lens (optional)', type: 'text' },
  // Notes
  { question: 'General notes / issues', type: 'textarea' },
];

// Deterministic 13-hex ref parts so downloads are stable.
const PROJECT_REF = 'a57 b0da 71c 4e5 8f60 astromycology'.replace(/[^a-f0-9]/g, '').padEnd(32, '0').slice(0, 32);
const hex = (n: number) => (n + 0x1000000000000).toString(16).slice(-13);

// Build the Epicollect5 project structure object.
export function buildEc5Template(projectName = 'AstroMycology Calibration Image Metadata') {
  const formRef = `${PROJECT_REF}_${hex(1)}`;
  const inputs = TEMPLATE_FIELDS.map((f, i) => {
    const ref = `${formRef}_${hex(100 + i)}`;
    const possible_answers = (f.options || []).map((answer, j) => ({ answer, answer_ref: hex(500 + i * 20 + j).slice(-5) }));
    return {
      max: null, min: null, ref, type: f.type, group: [], jumps: [], regex: null, branch: [],
      verify: false, default: null, is_title: !!f.title, question: f.question,
      uniqueness: 'none', is_required: !!f.required,
      datetime_format: f.type === 'date' ? 'dd/MM/yyyy' : null,
      possible_answers, set_to_current_datetime: false,
    };
  });
  return {
    data: {
      id: PROJECT_REF, type: 'project',
      project: {
        ref: PROJECT_REF, name: projectName, slug: projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        access: 'public', status: 'active', visibility: 'listed',
        description: 'Recommended metadata form generated from the AstroMycology metadata review — includes provenance, controlled organism/light/climate fields with SI units, repeatable measurements, and a calibration-marker field.',
        small_description: 'Recommended AstroMycology calibration-image metadata form.',
        forms: [{ ref: formRef, name: projectName, slug: 'form-1', type: 'hierarchy', inputs }],
      },
    },
    _note: 'Epicollect5 project-structure format. Build these questions in the Epicollect5 form builder (or import if your instance supports it). Field types + options are ready to copy.',
  };
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// A readable CSV for building the form by hand.
export function templateCsv(): string {
  const rows = [['#', 'Question', 'Type', 'Required', 'Title', 'Options', 'Notes']];
  TEMPLATE_FIELDS.forEach((f, i) => rows.push([
    String(i + 1), f.question, f.type, f.required ? 'yes' : '', f.title ? 'yes' : '',
    (f.options || []).join(' | '), f.help || '',
  ]));
  return rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
}

export function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
