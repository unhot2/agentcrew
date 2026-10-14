export type RunStatus = 'running' | 'completed' | 'failed' | 'stopped'

/** 서버가 Claude Code 출력(stream-json)을 정리해서 보내는 실행 이벤트 */
export type RunEvent =
  | { kind: 'init'; sessionId: string; model: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; summary: string }
  | { kind: 'tool_result'; isError: boolean; preview: string }
  | { kind: 'result'; isError: boolean; text: string; costUsd: number; durationMs: number }
  | { kind: 'stderr'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'exit'; status: RunStatus; code: number | null }

export type ClaudeCodeStatus = {
  installed: boolean
  version: string | null
  loggedIn: boolean
  email?: string
  authMethod?: string
  subscriptionType?: string
}
