import React, { useState, useEffect } from 'react';
import { Table, Download, Save, Info, Sparkles, HelpCircle, Check, RefreshCw } from 'lucide-react';
import { fetchAllComplete, projectName, type ProjectRef } from '../api/epicollect';
import type { Ec5Entry } from '../types';

interface Props {
  projects: ProjectRef[];
  onProjectsChange: () => void;
}

interface EditableMeta {
  filename: string;
  species: string;
  genotype: string;
  treatment: string;
  notes: string;
  camera: string;
  lighting: string;
}

export const MetadataEditor: React.FC<Props> = ({ projects, onProjectsChange }) => {
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [entries, setEntries] = useState<Ec5Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Local state for all editable rows, keyed by entry UUID (filename/sha)
  const [metadata, setMetadata] = useState<Record<string, EditableMeta>>({});
  const [savedStatus, setSavedStatus] = useState<boolean>(false);

  // Populate first non-builtin project as default if possible
  useEffect(() => {
    const importable = projects.filter(p => p.slug.startsWith('gh:') || p.slug.startsWith('local:'));
    if (importable.length > 0) {
      setSelectedSlug(importable[0].slug);
    } else if (projects.length > 0) {
      setSelectedSlug(projects[0].slug);
    }
  }, [projects]);

  // Load entries when selected slug changes
  useEffect(() => {
    if (!selectedSlug) return;
    
    const load = async () => {
      setLoading(true);
      setError(null);
      setSavedStatus(false);
      try {
        const { entries: loaded } = await fetchAllComplete([selectedSlug], 500, 10);
        setEntries(loaded);
        
        // Populate initial editable metadata from current fields
        const initialMeta: Record<string, EditableMeta> = {};
        loaded.forEach(e => {
          const filename = e.uuid || '';
          const getField = (keys: string[]) => 
            e.fields.find(f => keys.some(k => f.name.toLowerCase() === k))?.value || '';
          
          initialMeta[e.uuid] = {
            filename: filename,
            species: e.species || '',
            genotype: getField(['genotype', 'ecotype', 'cultivar', 'accession', 'line', 'strain']),
            treatment: getField(['treatment', 'growth condition', 'dose']),
            notes: e.fields.find(f => /note|comment/i.test(f.name))?.value || '',
            camera: getField(['camera', 'device', 'hardware']),
            lighting: getField(['lighting', 'light']),
          };
        });
        setMetadata(initialMeta);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedSlug]);

  const handleFieldChange = (uuid: string, field: keyof EditableMeta, value: string) => {
    setMetadata(prev => ({
      ...prev,
      [uuid]: {
        ...prev[uuid],
        [field]: value
      }
    }));
    setSavedStatus(false);
  };

  const handleSmartFill = () => {
    // Attempt auto-fill from filenames
    setMetadata(prev => {
      const next = { ...prev };
      entries.forEach(e => {
        const name = e.uuid.toLowerCase();
        const current = { ...next[e.uuid] };
        
        // Inferences matching our python tool logic
        if (!current.species) {
          if (/landoltia|londultia|punctata/.test(name)) current.species = 'Landoltia punctata';
          else if (/lemna|minor/.test(name)) current.species = 'Lemna minor';
          else if (/wolffia/.test(name)) current.species = 'Wolffia arrhiza';
          else if (/azolla|azola/.test(name)) current.species = 'Azolla caroliniana';
          else if (/arabidopsis|thaliana/.test(name)) current.species = 'Arabidopsis thaliana';
        }
        if (!current.genotype) {
          if (/col-0|col0/.test(name)) current.genotype = 'Col-0';
          else if (/pgm/.test(name)) current.genotype = 'pgm1-1';
        }
        if (!current.treatment) {
          if (/gibberellic|ga/.test(name)) current.treatment = 'Gibberellic Acid (GA)';
          else if (/clinostat|clino/.test(name)) current.treatment = 'Clinostat';
          else if (/control|ctrl|water/.test(name)) current.treatment = 'Control';
        }
        next[e.uuid] = current;
      });
      return next;
    });
  };

  const generateCSV = (): string => {
    const headers = ['filename', 'species', 'genotype', 'treatment', 'notes', 'camera', 'lighting'];
    const rows = entries.map(e => {
      const data = metadata[e.uuid] || { filename: e.uuid, species: '', genotype: '', treatment: '', notes: '', camera: '', lighting: '' };
      return [
        data.filename,
        data.species,
        data.genotype,
        data.treatment,
        data.notes,
        data.camera,
        data.lighting
      ].map(val => {
        const str = String(val || '');
        return str.includes(',') || str.includes('"') || str.includes('\n') 
          ? `"${str.replace(/"/g, '""')}"` 
          : str;
      });
    });
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  };

  const exportCSV = () => {
    const csvContent = generateCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'metadata.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSavedStatus(true);
  };

  const exportJSON = () => {
    const list = entries.map(e => metadata[e.uuid] || { filename: e.uuid });
    const jsonContent = JSON.stringify(list, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'metadata.json');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSavedStatus(true);
  };

  const filteredProjects = projects.filter(p => p.slug.startsWith('gh:') || p.slug.startsWith('local:'));

  return (
    <div style={{ maxWidth: '100%' }}>
      <div className="page-head">
        <div className="eyebrow">Enrich Datasets</div>
        <h1>Metadata editor</h1>
        <p>Edit metadata sidecars for your imported GitHub folders or local uploads. Add descriptions, species tags, and experimental treatments, then download standard CSV or Frictionless JSON files to commit back to your repository.</p>
      </div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="row wrap sb" style={{ alignItems: 'center', gap: 12 }}>
          <div className="row wrap" style={{ alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '.9rem', fontWeight: 600 }}>Select imported source:</span>
            <select 
              className="input" 
              style={{ padding: '6px 12px', minWidth: 260 }}
              value={selectedSlug} 
              onChange={e => setSelectedSlug(e.target.value)}
            >
              {filteredProjects.length === 0 ? (
                <option value="">(No importable GitHub/local sources)</option>
              ) : null}
              {filteredProjects.map(p => (
                <option key={p.slug} value={p.slug}>
                  {projectName(p.name)} ({p.slug.split(':')[0]})
                </option>
              ))}
            </select>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <button 
              className="btn btn-sm btn-ghost" 
              onClick={handleSmartFill} 
              disabled={entries.length === 0}
              title="Predict species, treatments, and genotypes from filenames"
            >
              <Sparkles size={14} /> Smart fill
            </button>
            <button 
              className="btn btn-sm" 
              onClick={exportCSV} 
              disabled={entries.length === 0}
            >
              <Download size={14} /> Download metadata.csv
            </button>
            <button 
              className="btn btn-sm btn-teal" 
              onClick={exportJSON} 
              disabled={entries.length === 0}
            >
              <Save size={14} /> Download metadata.json
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="row" style={{ justifyContent: 'center', padding: '40px 0', gap: 8 }}>
          <RefreshCw className="spin" /> Loading dataset entries...
        </div>
      ) : error ? (
        <div className="card pad" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          <p style={{ margin: 0 }}>Error: {error}</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="card pad" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Table size={32} className="muted" style={{ margin: '0 auto 12px' }} />
          <h3>No Importable Datasets Found</h3>
          <p className="muted" style={{ maxWidth: 480, margin: '0 auto 16px' }}>
            Go to the <strong>Contribute</strong> tab to add a public GitHub image folder or upload local files first. Once imported, you can generate sidecars for them here.
          </p>
        </div>
      ) : (
        <div>
          {savedStatus && (
            <div className="card pad" style={{ borderColor: 'var(--accent2)', background: 'rgba(0,128,128,0.05)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={16} style={{ color: 'var(--accent2)' }} />
              <span style={{ fontSize: '.85rem' }}>Downloaded successfully! Copy these files into your dataset folder and commit/push them to Git.</span>
            </div>
          )}

          <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 6 }}>
            <table className="data" style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Filename</th>
                  <th style={{ minWidth: 160 }}>Species</th>
                  <th style={{ minWidth: 130 }}>Genotype</th>
                  <th style={{ minWidth: 155 }}>Treatment</th>
                  <th style={{ minWidth: 180 }}>Notes</th>
                  <th style={{ minWidth: 120 }}>Camera</th>
                  <th style={{ minWidth: 100 }}>Lighting</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => {
                  const data = metadata[e.uuid] || { filename: e.uuid, species: '', genotype: '', treatment: '', notes: '', camera: '', lighting: '' };
                  return (
                    <tr key={e.uuid}>
                      <td className="mono" style={{ fontSize: '.76rem', wordBreak: 'break-all' }}>{e.uuid}</td>
                      <td>
                        <input 
                          className="input" 
                          style={{ width: '100%', padding: '4px 8px', fontSize: '.82rem' }}
                          placeholder="e.g. Landoltia punctata"
                          value={data.species}
                          onChange={ev => handleFieldChange(e.uuid, 'species', ev.target.value)}
                        />
                      </td>
                      <td>
                        <input 
                          className="input" 
                          style={{ width: '100%', padding: '4px 8px', fontSize: '.82rem' }}
                          placeholder="e.g. Col-0"
                          value={data.genotype}
                          onChange={ev => handleFieldChange(e.uuid, 'genotype', ev.target.value)}
                        />
                      </td>
                      <td>
                        <input 
                          className="input" 
                          style={{ width: '100%', padding: '4px 8px', fontSize: '.82rem' }}
                          placeholder="e.g. Gibberellic Acid"
                          value={data.treatment}
                          onChange={ev => handleFieldChange(e.uuid, 'treatment', ev.target.value)}
                        />
                      </td>
                      <td>
                        <input 
                          className="input" 
                          style={{ width: '100%', padding: '4px 8px', fontSize: '.82rem' }}
                          placeholder="Observed conditions..."
                          value={data.notes}
                          onChange={ev => handleFieldChange(e.uuid, 'notes', ev.target.value)}
                        />
                      </td>
                      <td>
                        <input 
                          className="input" 
                          style={{ width: '100%', padding: '4px 8px', fontSize: '.82rem' }}
                          placeholder="Camera model"
                          value={data.camera}
                          onChange={ev => handleFieldChange(e.uuid, 'camera', ev.target.value)}
                        />
                      </td>
                      <td>
                        <input 
                          className="input" 
                          style={{ width: '100%', padding: '4px 8px', fontSize: '.82rem' }}
                          placeholder="Lighting"
                          value={data.lighting}
                          onChange={ev => handleFieldChange(e.uuid, 'lighting', ev.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
