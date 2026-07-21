import ClaudeColor   from '@lobehub/icons/es/Claude/components/Color'
import ClaudeMono    from '@lobehub/icons/es/Claude/components/Mono'
import BedrockColor  from '@lobehub/icons/es/Bedrock/components/Color'
import BedrockMono   from '@lobehub/icons/es/Bedrock/components/Mono'
import CodexColor    from '@lobehub/icons/es/Codex/components/Color'
import CodexMono     from '@lobehub/icons/es/Codex/components/Mono'
import GeminiColor   from '@lobehub/icons/es/Gemini/components/Color'
import GeminiMono    from '@lobehub/icons/es/Gemini/components/Mono'
import CopilotMono   from '@lobehub/icons/es/GithubCopilot/components/Mono'
import CursorMono    from '@lobehub/icons/es/Cursor/components/Mono'
import OpenCodeMono  from '@lobehub/icons/es/OpenCode/components/Mono'
import { Terminal } from 'lucide-react'
import type { AgentType } from '../types'

// Docker whale. `mono` renders it in currentColor to match a monochrome icon
// row (e.g. the terminal rail); otherwise it keeps its brand blue.
function DockerIcon({ size = 14, mono = false }: { size?: number; mono?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={mono ? 'currentColor' : '#2496ed'}>
      <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186h-2.12a.186.186 0 00-.184.186v1.887c0 .102.084.185.185.185m-2.92 0h2.12a.186.186 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.185.186v1.887c0 .102.083.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z"/>
    </svg>
  )
}

// Accepts any sbx agent id (open string so unknown agents fall back gracefully).
export type AgentId = AgentType | string

interface AgentIconProps {
  agent: AgentId
  size?: number
  style?: React.CSSProperties
  // Render the brand mark in currentColor (no brand colours) so it sits in a
  // monochrome icon row like the other glyphs. Agents without a colour variant
  // are already monochrome, so this only affects Claude/Bedrock/Codex/Gemini.
  mono?: boolean
}

export function AgentIcon({ agent, size = 14, style, mono = false }: AgentIconProps) {
  const p = { size, style }
  switch (agent) {
    case 'claude':         return mono ? <ClaudeMono  {...p} /> : <ClaudeColor  {...p} />
    case 'claude-bedrock': return mono ? <BedrockMono {...p} /> : <BedrockColor {...p} />
    case 'codex':          return mono ? <CodexMono   {...p} /> : <CodexColor   {...p} />
    case 'gemini':         return mono ? <GeminiMono  {...p} /> : <GeminiColor  {...p} />
    case 'opencode':       return <OpenCodeMono {...p} />
    case 'copilot':        return <CopilotMono  {...p} />
    case 'cursor':         return <CursorMono   {...p} />
    case 'docker-agent':   return <DockerIcon   size={size} mono={mono} />
    // droid and kiro have no brand icon shipped — fall back to the shell glyph.
    case 'droid':
    case 'kiro':
    case 'shell':
    default:               return <Terminal size={size} style={style} />
  }
}
