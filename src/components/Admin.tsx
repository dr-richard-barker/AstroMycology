import React, { useEffect, useState } from 'react';
import { ShieldCheck, Ban, UserCheck, Star, StarOff, EyeOff, Eye, Users, FolderTree, ImageOff, Loader2 } from 'lucide-react';
import type { ProjectRef } from '../api/epicollect';
import { projectName } from '../api/epicollect';
import type { Profile } from '../lib/auth';
import { listProfiles, setBanned, setRole, hideItem, unhideItem, type HiddenItem } from '../lib/moderation';

interface Props {
  projects: ProjectRef[];
  hidden: HiddenItem[];
  myId: string | undefined;
  onChanged: () => void;   // reload hidden list in the app
}

export const Admin: React.FC<Props> = ({ projects, hidden, myId, onChanged }) => {
  const [tab, setTab] = useState<'users' | 'content'>('users');
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadUsers = () => listProfiles().then(setProfiles).catch(() => setProfiles([]));
  useEffect(() => { loadUsers(); }, []);

  const act = async (key: string, fn: () => Promise<void>, after: () => void) => {
    setBusy(key); try { await fn(); after(); } finally { setBusy(null); }
  };

  const hiddenProjects = new Set(hidden.filter(h => h.kind === 'project').map(h => h.ref));
  const hiddenImages = hidden.filter(h => h.kind === 'image');

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Admin</div>
        <h1><ShieldCheck size={22} style={{ verticalAlign: -3, color: 'var(--accent2)' }} /> Moderation</h1>
        <p>Manage who can access the database and hide any project or image you deem inappropriate. Changes apply to everyone.</p>
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === 'users' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('users')}><Users size={14} /> People</button>
        <button className={`btn btn-sm ${tab === 'content' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('content')}><FolderTree size={14} /> Content</button>
      </div>

      {tab === 'users' && (
        <div className="card pad">
          <div className="card-title"><Users /> People ({profiles?.length ?? '…'})</div>
          {!profiles ? <p className="muted"><Loader2 className="spin" size={14} /> Loading…</p> : profiles.length === 0 ? (
            <p className="muted" style={{ fontSize: '.85rem' }}>No accounts yet. Share your app link — anyone who signs in with Google appears here.</p>
          ) : (
            <table className="admin-table">
              <thead><tr><th>Email</th><th>Role</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {profiles.map(p => {
                  const me = p.id === myId;
                  return (
                    <tr key={p.id}>
                      <td>{p.email || p.display_name || p.id.slice(0, 8)}{me && <span className="chip" style={{ marginLeft: 6 }}>you</span>}</td>
                      <td>{p.role === 'admin' ? <span className="chip" style={{ color: 'var(--accent2)' }}><Star size={11} /> admin</span> : 'user'}</td>
                      <td>{p.banned ? <span className="chip" style={{ color: 'var(--danger)' }}>banned</span> : <span className="chip">active</span>}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {!me && (
                          <>
                            <button className="btn btn-xs btn-ghost" disabled={busy === 'ban' + p.id}
                              onClick={() => act('ban' + p.id, () => setBanned(p.id, !p.banned), loadUsers)}
                              style={{ color: p.banned ? 'var(--accent2)' : 'var(--danger)' }}>
                              {p.banned ? <><UserCheck size={12} /> Unban</> : <><Ban size={12} /> Ban</>}
                            </button>
                            <button className="btn btn-xs btn-ghost" disabled={busy === 'role' + p.id}
                              onClick={() => act('role' + p.id, () => setRole(p.id, p.role === 'admin' ? 'user' : 'admin'), loadUsers)}>
                              {p.role === 'admin' ? <><StarOff size={12} /> Demote</> : <><Star size={12} /> Make admin</>}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'content' && (
        <div className="grid" style={{ gap: 16 }}>
          <div className="card pad">
            <div className="card-title"><FolderTree /> Projects</div>
            <p className="muted" style={{ fontSize: '.8rem', marginTop: -6, marginBottom: 10 }}>Hidden projects disappear from the selector and dashboards for everyone.</p>
            <div className="grid" style={{ gap: 6 }}>
              {projects.map(pr => {
                const isHidden = hiddenProjects.has(pr.slug);
                const row = hidden.find(h => h.kind === 'project' && h.ref === pr.slug);
                return (
                  <div key={pr.slug} className="row sb" style={{ justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, background: 'var(--bg)' }}>
                    <span style={{ fontSize: '.86rem', opacity: isHidden ? 0.6 : 1 }}>{isHidden ? <EyeOff size={13} style={{ verticalAlign: -2 }} /> : <Eye size={13} style={{ verticalAlign: -2, opacity: .5 }} />} {pr.name}</span>
                    <button className="btn btn-xs btn-ghost" disabled={busy === 'p' + pr.slug}
                      onClick={() => act('p' + pr.slug, () => isHidden ? unhideItem(row!.id) : hideItem('project', pr.slug, pr.name, 'hidden by admin'), onChanged)}
                      style={{ color: isHidden ? 'var(--accent2)' : 'var(--danger)' }}>
                      {isHidden ? 'Unhide' : 'Hide'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card pad">
            <div className="card-title"><ImageOff /> Hidden images ({hiddenImages.length})</div>
            <p className="muted" style={{ fontSize: '.8rem', marginTop: -6, marginBottom: 10 }}>Use the <strong>Hide</strong> button on an image in the database to add one here.</p>
            {hiddenImages.length === 0 ? <p className="muted" style={{ fontSize: '.85rem' }}>No images hidden.</p> : (
              <div className="grid" style={{ gap: 6 }}>
                {hiddenImages.map(h => (
                  <div key={h.id} className="row sb" style={{ justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, background: 'var(--bg)' }}>
                    <span style={{ fontSize: '.82rem' }}>{h.label || h.ref}</span>
                    <button className="btn btn-xs btn-ghost" disabled={busy === 'i' + h.id} onClick={() => act('i' + h.id, () => unhideItem(h.id), onChanged)} style={{ color: 'var(--accent2)' }}>Unhide</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
