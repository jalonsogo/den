import AnthropicMono  from '@lobehub/icons/es/Anthropic/components/Mono'
import OpenAIMono     from '@lobehub/icons/es/OpenAI/components/Mono'
import GoogleColor    from '@lobehub/icons/es/Google/components/Color'
import GithubMono     from '@lobehub/icons/es/Github/components/Mono'
import AwsColor       from '@lobehub/icons/es/Aws/components/Color'
import BedrockColor   from '@lobehub/icons/es/Bedrock/components/Color'
import CursorMono     from '@lobehub/icons/es/Cursor/components/Mono'
import GroqMono       from '@lobehub/icons/es/Groq/components/Mono'
import MistralColor   from '@lobehub/icons/es/Mistral/components/Color'
import OpenRouterMono from '@lobehub/icons/es/OpenRouter/components/Mono'
import XAIMono        from '@lobehub/icons/es/XAI/components/Mono'
import NebiusMono     from '@lobehub/icons/es/Nebius/components/Mono'
import { KeyRound } from 'lucide-react'
import type { SecretService } from '../types'

// Fallback for services without a vendored brand icon (e.g. droid).
function KeyIcon({ size = 16 }: { size?: number }) {
  return <KeyRound size={size} />
}

export function SecretIcon({ service, size = 16 }: { service: SecretService | string; size?: number }) {
  switch (service) {
    case 'anthropic':  return <AnthropicMono  size={size} />
    case 'openai':     return <OpenAIMono     size={size} />
    case 'google':     return <GoogleColor    size={size} />
    case 'github':     return <GithubMono     size={size} />
    case 'aws':        return <AwsColor       size={size} />
    case 'bedrock':    return <BedrockColor   size={size} />
    case 'cursor':     return <CursorMono     size={size} />
    case 'groq':       return <GroqMono       size={size} />
    case 'mistral':    return <MistralColor   size={size} />
    case 'openrouter': return <OpenRouterMono size={size} />
    case 'xai':        return <XAIMono        size={size} />
    case 'nebius':     return <NebiusMono     size={size} />
    default:           return <KeyIcon        size={size} />
  }
}
