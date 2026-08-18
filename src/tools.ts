import { Box, type LucideIcon } from 'lucide-react';

// Analysis tools available inside the database shell. Unlike AstroBotany's
// sibling repos (AstroRoot, Anthocyanin), the 3D viewer has no separate
// standalone deployment to preserve, so it renders in-app rather than in an
// iframe — no cross-origin embed plumbing needed.
export interface ToolRef { id: string; name: string; sub: string; icon: LucideIcon; }

export const TOOLS: ToolRef[] = [
  { id: 'scan3d-viewer', name: '3D Scan Viewer', sub: 'Volume · dimensions', icon: Box },
];
export const toolById = (id: string) => TOOLS.find(t => t.id === id);
