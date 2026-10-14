export type AdapterType = 'claude-code' | 'codex' | 'lmstudio' | 'ollama'

export type ClaudeCodeConfig = {
  type: 'claude-code'
  model: string
  permissionMode: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
}

export type CodexConfig = {
  type: 'codex'
  model: string
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'
  approval: 'untrusted' | 'on-request' | 'never'
}

export type LocalModelConfig = {
  type: 'lmstudio' | 'ollama'
  baseUrl: string
  model: string
  temperature: number
}

export type AdapterConfig = ClaudeCodeConfig | CodexConfig | LocalModelConfig

export type AgentStatus = 'running' | 'idle' | 'paused' | 'over-budget'

export type Agent = {
  id: string
  name: string
  title: string
  description: string
  reportsTo: string | null
  status: AgentStatus
  workdir: string
  adapter: AdapterConfig
  instructions: string
  heartbeatMinutes: number
  monthlyBudget: number
  spentThisMonth: number
}
