import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ClipboardList, CheckCircle2, GitCompare, AlertTriangle, Lightbulb, ListChecks, Sparkles, FileJson, Table } from 'lucide-react';
import { getProjects, isGithub, isLocal, projectName } from '../api/epicollect';
import { fetchProjectQuestions, analyze, LESSONS, RECOMMENDATIONS, type ReviewResult, type Question } from '../lib/metadata-review';
import { buildEc5Template, templateCsv, TEMPLATE_FIELDS, download } from '../lib/form-template';

const CAT_ORDER = ['Identity', 'Organism', 'Environment', 'Timing', 'Light', 'Climate', 'Substrate', 'Phenotype', 'Imaging', 'Protocol', 'Notes'];

export const MetadataReview: React.FC = () => {
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ec5 = getProjects().filter(p => !isGithub(p.slug) && !isLocal(p.slug));
      const results = await Promise.allSettled(ec5.map(p => fetchProjectQuestions(p.slug)));
      const byProject: { slug: string; name: string; questions: Question[] }[] = [];
      const errs: string[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') byProject.push({ slug: ec5[i].slug, name: ec5[i].name, questions: r.value });
        else errs.push(`${ec5[i].name}: ${r.reason?.message || r.reason}`);
      });
      if (!alive) return;
      setReview(byProject.length ? analyze(byProject) : null);
      setErrors(errs);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const rowsByCat = useMemo(() => {
    const m = new Map<string, ReviewResult['rows']>();
    review?.rows.forEach(r => { (m.get(r.concept.category) || m.set(r.concept.category, []).get(r.concept.category)!).push(r); });
    return m;
  }, [review]);

  if (loading) return <div className="empty"><Loader2 className="spin" /><div style={{ marginTop: 10 }}>Reading the projects’ questions…</div></div>;

  const P = review?.projects || [];
  const short = (i: number) => `P${i + 1}`;

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Metadata review</div>
        <h1>Conserved &amp; variant metadata across projects</h1>
        <p>
          A comparison of the <strong>questions</strong> asked by the connected Epicollect5 projects. Questions are grouped into shared concepts using an <Sparkles size={13} style={{ verticalAlign: -2 }} /> LLM-derived mapping (so “species / variety / cultivar / genotype” count as one concept); the presence matrix is then computed <strong>live</strong> from each project’s current form, and the lessons &amp; recommendations below were written by an LLM from these same projects.
        </p>
      </div>

      {errors.length > 0 && <div className="card pad" style={{ marginBottom: 14, borderColor: 'var(--warn)', color: 'var(--warn)', fontSize: '.82rem' }}>{errors.map((e, i) => <div key={i}>{e}</div>)}</div>}

      {review && (
        <>
          <div className="stat-row" style={{ marginBottom: 18 }}>
            <div className="stat"><div className="k">Projects</div><div className="v">{P.length}</div></div>
            <div className="stat"><div className="k">Questions</div><div className="v">{P.reduce((a, p) => a + p.total, 0)}</div></div>
            <div className="stat"><div className="k">Concepts</div><div className="v">{review.rows.length}</div></div>
            <div className="stat"><div className="k">Conserved</div><div className="v accent">{review.conserved.length}</div></div>
            <div className="stat"><div className="k">Variant</div><div className="v teal">{review.variant.length}</div></div>
          </div>

          {/* legend */}
          <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
            {P.map((p, i) => <span key={p.slug} className="chip"><span className="mono">{short(i)}</span> {p.name}</span>)}
          </div>

          {/* concept × project matrix */}
          <div className="card pad" style={{ marginBottom: 16, overflowX: 'auto' }}>
            <div className="card-title"><GitCompare /> Concept coverage</div>
            <table className="data" style={{ minWidth: 520 }}>
              <thead>
                <tr><th style={{ minWidth: 190 }}>Concept</th>{P.map((_, i) => <th key={i} style={{ textAlign: 'center' }}>{short(i)}</th>)}<th style={{ textAlign: 'center' }}>#</th></tr>
              </thead>
              <tbody>
                {CAT_ORDER.filter(c => rowsByCat.has(c)).map(cat => (
                  <React.Fragment key={cat}>
                    <tr><td colSpan={P.length + 2} style={{ background: 'color-mix(in srgb, var(--accent) 6%, transparent)', fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)' }}>{cat}</td></tr>
                    {rowsByCat.get(cat)!.map(r => (
                      <tr key={r.concept.id}>
                        <td>{r.concept.label}</td>
                        {P.map(p => {
                          const qs = r.present[p.slug];
                          return <td key={p.slug} style={{ textAlign: 'center' }} title={qs ? qs.join('\n') : ''}>
                            {qs ? <CheckCircle2 size={14} color={r.count >= Math.max(2, Math.ceil(P.length / 2)) ? 'var(--accent)' : 'var(--accent2)'} style={{ verticalAlign: -2 }} /> : <span className="muted">·</span>}
                          </td>;
                        })}
                        <td style={{ textAlign: 'center', fontWeight: 600 }} className="mono">{r.count}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', marginBottom: 16 }}>
            <div className="card pad">
              <div className="card-title"><CheckCircle2 /> Conserved concepts</div>
              <p className="muted" style={{ fontSize: '.78rem', marginTop: -6 }}>Captured by a majority of projects (though often worded differently).</p>
              <div className="grid" style={{ gap: 7 }}>
                {review.conserved.map(r => (
                  <div key={r.concept.id} className="row sb" style={{ justifyContent: 'space-between', fontSize: '.85rem' }}>
                    <span>{r.concept.label}</span><span className="chip">{r.count}/{P.length}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card pad">
              <div className="card-title"><GitCompare /> Variant (single-project) concepts</div>
              <p className="muted" style={{ fontSize: '.78rem', marginTop: -6 }}>Asked by only one project — candidates for a shared standard, or genuinely project-specific.</p>
              <div className="grid" style={{ gap: 7 }}>
                {review.variant.map(r => (
                  <div key={r.concept.id} className="row sb" style={{ justifyContent: 'space-between', fontSize: '.85rem' }}>
                    <span>{r.concept.label}</span><span className="chip tag">{projectName(Object.keys(r.present)[0])}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {review.gaps.length > 0 && (
            <div className="card pad" style={{ marginBottom: 16, borderColor: 'var(--warn)' }}>
              <div className="card-title"><AlertTriangle style={{ color: 'var(--warn)' }} /> Gaps — expected but absent from every project</div>
              <div className="row wrap" style={{ gap: 6 }}>{review.gaps.map(g => <span key={g.id} className="badge neg">{g.label}</span>)}</div>
            </div>
          )}
        </>
      )}

      {/* LLM-authored review */}
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="card-title"><Lightbulb /> Lessons learnt</div>
        <div className="grid" style={{ gap: 12 }}>
          {LESSONS.map((l, i) => (
            <div key={i}>
              <div style={{ fontWeight: 650, fontSize: '.9rem' }}>{i + 1}. {l.title}</div>
              <div className="muted" style={{ fontSize: '.85rem', marginTop: 2 }}>{l.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card pad">
        <div className="card-title sb" style={{ justifyContent: 'space-between' }}>
          <span className="row" style={{ gap: 8 }}><ListChecks /> Recommended metadata for future projects</span>
          <span className="row wrap" style={{ gap: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={() => download('astromycology_epicollect5_form_template.json', JSON.stringify(buildEc5Template(), null, 2), 'application/json')}>
              <FileJson size={14} /> Epicollect5 form template (JSON)
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => download('astromycology_form_template.csv', templateCsv(), 'text/csv')}>
              <Table size={14} /> CSV
            </button>
          </span>
        </div>
        <p className="muted" style={{ fontSize: '.8rem', marginTop: 2, marginBottom: 12 }}>
          A concept checklist to consider when designing the next Epicollect5 form, so data can be compared and merged across studies. Download it as a ready-to-build <strong>Epicollect5 form template</strong> ({TEMPLATE_FIELDS.length} questions with types &amp; option lists, in Epicollect5’s project-structure format) or a plain CSV to build by hand in the form builder.
        </p>
        <table className="data">
          <thead><tr><th>Category</th><th>Concept</th><th>Why</th><th>Example question(s)</th></tr></thead>
          <tbody>
            {RECOMMENDATIONS.map((r, i) => (
              <tr key={i}>
                <td><span className="chip">{r.category}</span></td>
                <td style={{ fontWeight: 600 }}>{r.concept}</td>
                <td className="muted" style={{ fontSize: '.82rem' }}>{r.why}</td>
                <td className="mono" style={{ fontSize: '.78rem' }}>{r.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
