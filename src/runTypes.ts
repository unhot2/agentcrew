export type RunStatus = 'running' | 'completed' | 'failed' | 'stopped'

/** 서버가 Claude Code 출력(stream-json)을 정리해서 보내는 실행 이벤트 */
export type RunEvent =
  | { kind: 'init'; sessionId: string; model: string }
  | { kind: 'text'; text: string }
  /** path: 파일을 쓰거나 고친 도구일 때 그 파일 경로 (결과물로 기록) */
  | { kind: 'tool'; name: string; summary: string; path?: string }
  | { kind: 'tool_result'; isError: boolean; preview: string }
  | { kind: 'result'; isError: boolean; text: string; costUsd: number; durationMs: number }
  | { kind: 'stderr'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'exit'; status: RunStatus; code: number | null }

/** 어댑터 연결 상태. 로컬 모델은 서버가 켜져 있으면 loggedIn이 true이고 models에 받아 둔 모델이 온다 */
export type AdapterStatus = {
  installed: boolean
  version: string | null
  loggedIn: boolean
  account?: string
  models?: string[]
  error?: string
  /** 적은 주소로는 안 되지만 다른 주소에서 서버를 찾았을 때 그 주소 */
  suggestedBaseUrl?: string
}

export type ClaudeCodeStatus = AdapterStatus
