import { useState, useEffect } from 'react';
import { Activity, FlaskConical, BarChart3, Database } from 'lucide-react';

interface SpectrumRow {
  mz: number;
  cont: number;
  ex: number;
  dif: number;
  enrichment: string;
}

interface MetadataSummary {
  total: number;
  byCondition: Record<string, number>;
  byExudateColor: Record<string, number>;
}

export function DESIDashboard() {
  const [loading, setLoading] = useState(true);
  const [posSpectra, setPosSpectra] = useState<SpectrumRow[]>([]);
  const [negSpectra, setNegSpectra] = useState<SpectrumRow[]>([]);
  const [metadata, setMetadata] = useState<MetadataSummary | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch and parse Metadata
        const metaRes = await fetch(`${import.meta.env.BASE_URL}desi-ms/PLATE_02_linked.csv`);
        const metaText = await metaRes.text();
        const metaLines = metaText.split('\n').filter(l => l.trim().length > 0);
        
        let conditionIdx = -1;
        let colorIdx = -1;
        
        const summary: MetadataSummary = { total: 0, byCondition: {}, byExudateColor: {} };
        
        if (metaLines.length > 0) {
          const headers = metaLines[0].split(',');
          conditionIdx = headers.indexOf('condition');
          colorIdx = headers.indexOf('21_Color_of_Exudate');
          
          summary.total = metaLines.length - 1;
          for (let i = 1; i < metaLines.length; i++) {
            const cols = metaLines[i].split(',');
            if (cols.length > Math.max(conditionIdx, colorIdx)) {
              const cond = cols[conditionIdx] || 'Unknown';
              const color = cols[colorIdx] || 'None';
              
              summary.byCondition[cond] = (summary.byCondition[cond] || 0) + 1;
              summary.byExudateColor[color] = (summary.byExudateColor[color] || 0) + 1;
            }
          }
        }
        setMetadata(summary);

        // Fetch and parse Spectra
        const parseSpectra = async (url: string) => {
          const res = await fetch(url);
          const text = await res.text();
          const lines = text.split('\n').filter(l => l.trim().length > 0).slice(1);
          return lines.map(l => {
            const cols = l.split(',');
            return {
              mz: parseFloat(cols[0]) || 0,
              cont: parseFloat(cols[1]) || 0,
              ex: parseFloat(cols[2]) || 0,
              dif: parseFloat(cols[4]) || 0,
              enrichment: cols[5]?.trim() || ''
            };
          }).filter(r => Math.abs(r.dif) > 0.05).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)); // Sort by magnitude of difference
        };

        setPosSpectra(await parseSpectra(`${import.meta.env.BASE_URL}desi-ms/Spectra_Pos.csv`));
        setNegSpectra(await parseSpectra(`${import.meta.env.BASE_URL}desi-ms/Spectra_Neg.csv`));
        
      } catch (err) {
        console.error("Failed to load DESI-MS data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading DESI-MS data...</div>;
  }

  const renderSpectraTable = (data: SpectrumRow[], title: string) => (
    <div className="card pad" style={{ flex: '1 1 400px' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0, marginBottom: 16 }}>
        <Activity size={20} color="var(--accent)" />
        {title} Top Enriched Ions
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '8px 4px' }}>m/z</th>
              <th style={{ padding: '8px 4px' }}>Enrichment</th>
              <th style={{ padding: '8px 4px' }}>Control Intensity</th>
              <th style={{ padding: '8px 4px' }}>Exp Intensity</th>
              <th style={{ padding: '8px 4px' }}>Diff Profile</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 15).map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td style={{ padding: '8px 4px', fontWeight: 'bold' }}>{row.mz.toFixed(3)}</td>
                <td style={{ padding: '8px 4px' }}>
                  {row.enrichment === 'Ex' ? <span style={{ color: 'var(--accent2)', fontWeight: 'bold' }}>Experimental</span> : row.enrichment === 'Cont' ? <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Control</span> : '-'}
                </td>
                <td style={{ padding: '8px 4px' }}>{row.cont.toFixed(3)}</td>
                <td style={{ padding: '8px 4px' }}>{row.ex.toFixed(3)}</td>
                <td style={{ padding: '8px 4px', width: 120 }}>
                  <div style={{ display: 'flex', alignItems: 'center', height: 16, backgroundColor: 'var(--bg-inset)', borderRadius: 2, overflow: 'hidden' }}>
                     {row.dif > 0 ? (
                       <div style={{ marginLeft: '50%', width: `${Math.min(row.dif * 100, 50)}%`, height: '100%', backgroundColor: 'var(--accent2)' }} />
                     ) : (
                       <div style={{ width: '50%', display: 'flex', justifyContent: 'flex-end', height: '100%' }}>
                         <div style={{ width: `${Math.min(Math.abs(row.dif) * 100, 100)}%`, height: '100%', backgroundColor: 'var(--accent)' }} />
                       </div>
                     )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 0, marginBottom: 24 }}>
        <FlaskConical size={28} color="var(--accent)" />
        DESI-MS Fungal Analysis Dashboard
      </h2>
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 24 }}>
        <div className="card pad" style={{ flex: '1 1 300px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0, marginBottom: 16 }}>
            <Database size={20} color="var(--accent2)" />
            Dataset Integration
          </h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--text)', marginBottom: 8 }}>
            {metadata?.total || 0}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>DESI-MS Samples successfully linked to EpiCollect5 phenotypes</div>
        </div>

        <div className="card pad" style={{ flex: '1 1 300px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0, marginBottom: 16 }}>
            <BarChart3 size={20} color="var(--accent)" />
            Samples by Condition
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(metadata?.byCondition || {}).map(([cond, count]) => (
              <div key={cond} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{cond}</span>
                <span style={{ fontWeight: 'bold' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        {renderSpectraTable(posSpectra, "Positive Ion Mode")}
        {renderSpectraTable(negSpectra, "Negative Ion Mode")}
      </div>
    </div>
  );
}
