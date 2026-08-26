import React from 'react';
import { ExternalLink } from 'lucide-react';

const ATLAS_URL = 'https://dr-richard-barker.github.io/fungal-bgc-atlas/#overview';

// A sibling standalone tool (609 curated fungal BGC dossiers), already built
// and deployed on its own Pages site — embedded here rather than rebuilt,
// same as this app's own precedent for AstroRoot/Anthocyanin-style sibling
// tools. It doesn't respond to an ?embed=1-style query param, so its own
// header/tab-bar renders nested inside this page's chrome.
export const BgcAtlas: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-head">
        <div className="eyebrow">BGC Atlas</div>
        <h1>Fungal biosynthetic gene cluster explorer</h1>
        <p>
          A curated, evidence-linked knowledge base of 609 fungal BGC dossiers — genes, metabolites, experiments,
          claims, and preserved conflicts, each traceable to its primary sources. Opens the live{' '}
          <a href={ATLAS_URL} target="_blank" rel="noreferrer">Fungal BGC Atlas <ExternalLink size={12} /></a> in place.
        </p>
      </div>
      <iframe
        src={ATLAS_URL}
        title="Fungal BGC Atlas"
        style={{ flex: 1, minHeight: '75vh', width: '100%', border: '1px solid var(--line)', borderRadius: 'var(--radius)' }}
      />
    </div>
  );
};
