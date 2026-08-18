import React from 'react';
import { Database as DbIcon, Github, Cloud, HardDrive, Sprout, BookText, Rocket } from 'lucide-react';
import { type ProjectRef, isGithub, isLocal } from '../api/epicollect';
import { isCloud } from '../lib/uploads';

function badge(p: ProjectRef) {
  if (isCloud(p.slug)) return { icon: Cloud, label: 'Community', color: 'var(--accent2)' };
  if (isGithub(p.slug)) return { icon: Github, label: 'GitHub', color: 'var(--fg)' };
  if (isLocal(p.slug)) return { icon: HardDrive, label: 'Local', color: 'var(--muted)' };
  return { icon: DbIcon, label: 'Epicollect5', color: 'var(--accent)' };
}

const fallbackDesc = (p: ProjectRef) =>
  isCloud(p.slug) ? 'Images uploaded by signed-in contributors to the shared collection.'
  : isGithub(p.slug) ? 'Images imported from a public GitHub folder.'
  : isLocal(p.slug) ? 'Images you uploaded locally in this browser.'
  : 'Field-collected project on the free Epicollect5 platform.';

// Provenance catalogue: every dataset, where it comes from, what it contains,
// and how to cite it. Datasets with curated provenance sort first.
export const Datasets: React.FC<{ projects: ProjectRef[]; onOpen: (slug: string) => void }> = ({ projects, onOpen }) => {
  const sorted = [...projects].sort((a, b) => (b.provenance ? 1 : 0) - (a.provenance ? 1 : 0));

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Provenance</div>
        <h1>Datasets</h1>
        <p>Every collection in the database — its organism, conditions, what it contains, and how to cite it. Open any dataset to browse and analyse it.</p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {sorted.map(p => {
          const b = badge(p); const Icon = b.icon; const prov = p.provenance;
          return (
            <div key={p.slug} className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div className="row sb" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <strong style={{ fontSize: '.95rem', lineHeight: 1.3 }}>{p.name}</strong>
                <span className="chip" style={{ color: b.color, flexShrink: 0 }}><Icon size={11} /> {b.label}</span>
              </div>

              {prov?.organism && (
                <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
                  <span className="chip" style={{ color: 'var(--accent2)' }}><Sprout size={11} /> {prov.organism}</span>
                  {prov.conditions && <span className="muted" style={{ fontSize: '.75rem' }}>{prov.conditions}</span>}
                </div>
              )}

              <p className="muted" style={{ fontSize: '.83rem', lineHeight: 1.5, margin: 0, flex: 1 }}>{prov?.description || fallbackDesc(p)}</p>

              {prov?.source && <div className="muted" style={{ fontSize: '.72rem' }}><Rocket size={10} style={{ verticalAlign: -1 }} /> {prov.source}</div>}

              <div className="row sb" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 }}>
                {p.reference
                  ? <a href={p.reference.url} target="_blank" rel="noreferrer" className="row" style={{ gap: 5, fontSize: '.76rem' }} title={p.reference.text}><BookText size={12} /> Citation ↗</a>
                  : <span />}
                <button className="btn btn-sm btn-primary" style={{ padding: '3px 12px' }} onClick={() => onOpen(p.slug)}>Open</button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="muted" style={{ fontSize: '.75rem', marginTop: 18, lineHeight: 1.5 }}>
        Data courtesy of NASA OSDR / GeneLab, the original investigators, and the contributing citizen-science and rocketry programs. Each dataset links to its source study or repository for citation and licensing terms.
      </p>
    </div>
  );
};
