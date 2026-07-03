import {
  FolderGit2, Folder, Code, Box, Rocket, Globe, Terminal, Layers,
  Star, Database, Cpu, FlaskConical, icons as LUCIDE, type LucideIcon
} from 'lucide-react'

// Shared icon utilities for the sandbox customize picker: the full Lucide set
// (browse) plus a small curated quick-set and a colour palette.
export const LUCIDE_ICONS = LUCIDE as unknown as Record<string, LucideIcon>
export const ALL_ICON_NAMES = Object.keys(LUCIDE_ICONS)

export const PROJECT_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
]

// Curated quick icons (kebab-case keys kept for any previously-saved values).
export const PROJECT_ICONS: Record<string, LucideIcon> = {
  'folder-git-2': FolderGit2, folder: Folder, code: Code, box: Box, rocket: Rocket,
  globe: Globe, terminal: Terminal, layers: Layers, star: Star, database: Database, cpu: Cpu, beaker: FlaskConical
}

// Resolve a stored icon key: curated quick-set key, or any full Lucide name.
export function resolveIcon(key?: string | null): LucideIcon {
  if (!key) return FolderGit2
  return PROJECT_ICONS[key] ?? LUCIDE_ICONS[key] ?? FolderGit2
}
