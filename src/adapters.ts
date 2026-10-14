import type { AdapterConfig, AdapterType } from './types'

export type AdapterMeta = {
  type: AdapterType
  label: string
  description: string
  local: boolean
}

export const ADAPTERS: AdapterMeta[] = [
  { type: 'claude-code', label: 'Claude Code', description: 'Anthropic CLI 에이전트', local: false },
  { type: 'codex', label: 'Codex', description: 'OpenAI CLI 에이전트', local: false },
  { type: 'lmstudio', label: 'LM Studio', description: '로컬 OpenAI 호환 서버', local: true },
  { type: 'ollama', label: 'Ollama', description: '로컬 모델 런타임', local: true },
]

export const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']

export function defaultAdapterConfig(type: AdapterType): AdapterConfig {
  switch (type) {
    case 'claude-code':
      return { type, model: '', permissionMode: 'acceptEdits' }
    case 'codex':
      return { type, model: '', sandbox: 'workspace-write', approval: 'on-request' }
    case 'lmstudio':
      return { type, baseUrl: 'http://localhost:1234/v1', model: '', temperature: 0.7 }
    case 'ollama':
      return { type, baseUrl: 'http://localhost:11434', model: '', temperature: 0.7 }
  }
}

export function adapterLabel(type: AdapterType) {
  return ADAPTERS.find((a) => a.type === type)?.label ?? type
}

export function isLocalAdapter(type: AdapterType) {
  return ADAPTERS.find((a) => a.type === type)?.local ?? false
}
