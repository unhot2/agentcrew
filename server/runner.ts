import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import type { Agent } from '../src/types.ts'
import type { RunEvent, RunStatus } from '../src/runTypes.ts'
import { startClaudeCode } from './adapters/claudeCode.ts'
import { startCodex } from './adapters/codex.ts'
import { startHermes } from './adapters/hermes.ts'
import { startLocalModel } from './adapters/localModel.ts'

/** 에이전트 도구(승인 요청, 작업 위임)에 필요한 정보 */
export type AgentToolsContext = {
  /** 에이전트 도구(MCP 서버)가 서버 API를 부를 때 쓰는 실행별 토큰 */
  token: string
  apiUrl: string
  /** 이 실행에서 쓸 수 있는 도구 이름 */
  tools: string[]
}

export type AdapterContext = {
  prompt: string
  /** 에이전트 지시문 + 스킬 + 위임 안내 */
  systemPrompt: string
  /** 연결(GitHub 토큰 등)에서 넘겨줄 환경 변수 */
  env: Record<string, string>
  agentTools: AgentToolsContext | null
  /** 이어서 실행할 Claude Code 세션 (승인 후 이어서 진행할 때) */
  resumeSessionId?: string
  /** 이어서 실행할 세션이 앞 실행까지 쓴 누적 비용. Claude Code는 세션 전체 누적 비용을 알려 주므로 이 값을 뺀다 */
  resumeBaseCostUsd?: number
  /** 이 실행의 id (로컬 모델이 에이전트 도구를 직접 부를 때 쓴다) */
  runId: string
  emit: (e: RunEvent) => void
  /** 실행이 끝났을 때 한 번 부른다 */
  finish: (status: RunStatus, code: number | null) => void
}

export type AdapterHandle = { stop: () => void }

export type Run = {
  id: string
  agentId: string
  status: RunStatus
  events: RunEvent[]
  listeners: Set<(e: RunEvent) => void>
  handle: AdapterHandle
}

const runs = new Map<string, Run>()

export function getRun(id: string) {
  return runs.get(id)
}

export function isAgentRunning(agentId: string) {
  for (const r of runs.values()) if (r.agentId === agentId && r.status === 'running') return true
  return false
}

/** 지금 실행할 수 있는 어댑터 */
export const RUNNABLE = new Set<Agent['adapter']['type']>(['claude-code', 'codex', 'hermes', 'lmstudio', 'ollama'])

/** 실행 전에 막아야 할 조건이 있으면 오류 문구를 돌려준다 */
export function validate(agent: Agent, prompt: string): string | null {
  if (!RUNNABLE.has(agent.adapter.type)) return '실행할 수 없는 어댑터입니다.'
  if (!prompt.trim()) return '작업 지시를 입력하세요.'
  if (!existsSync(agent.workdir) || !statSync(agent.workdir).isDirectory()) return `작업 디렉터리가 없습니다: ${agent.workdir}`
  if ((agent.adapter.type === 'lmstudio' || agent.adapter.type === 'ollama') && !agent.adapter.model.trim())
    return '로컬 모델 이름을 정하세요.'
  if (agent.monthlyBudget > 0 && agent.spentThisMonth >= agent.monthlyBudget) return '이번 달 예산을 모두 썼습니다.'
  if (isAgentRunning(agent.id)) return '이 에이전트는 이미 실행 중입니다.'
  return null
}

type StartOptions = Omit<AdapterContext, 'prompt' | 'emit' | 'finish' | 'runId'>

/** 에이전트의 어댑터로 실행을 시작한다. 이벤트는 onEvent와 실행 로그 구독자에게 보낸다 */
export function startRun(agent: Agent, prompt: string, onEvent: (e: RunEvent) => void, options: StartOptions): Run {
  const run: Run = {
    id: randomUUID(),
    agentId: agent.id,
    status: 'running',
    events: [],
    listeners: new Set(),
    handle: { stop: () => {} },
  }
  runs.set(run.id, run)

  const emit = (e: RunEvent) => {
    run.events.push(e)
    onEvent(e)
    for (const l of run.listeners) l(e)
  }
  let finished = false
  const finish = (status: RunStatus, code: number | null) => {
    if (finished) return
    finished = true
    if (run.status === 'running') run.status = status
    emit({ kind: 'exit', status: run.status, code })
  }

  const ctx: AdapterContext = { ...options, prompt, runId: run.id, emit, finish }
  const starters = { 'claude-code': startClaudeCode, codex: startCodex, hermes: startHermes, lmstudio: startLocalModel, ollama: startLocalModel }
  const start = starters[agent.adapter.type]
  // 어댑터 안에서 바로 이벤트를 내보내도 실행 기록이 먼저 만들어지도록 다음 차례에 시작한다
  queueMicrotask(() => {
    try {
      run.handle = start(agent, ctx)
    } catch (err) {
      emit({ kind: 'error', text: `실행하지 못했습니다: ${(err as Error).message}` })
      finish('failed', null)
    }
  })
  return run
}

export function stopRun(run: Run) {
  if (run.status !== 'running') return
  run.status = 'stopped'
  run.handle.stop()
}

/** 자식 프로세스를 하위 프로세스까지 끝낸다. Windows에서는 kill()이 셸이 띄운 프로세스를 남긴다 */
export function killTree(child: ChildProcess) {
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    child.kill()
  }
}

/** 표준 출력을 줄 단위로 읽는다 */
export function onLines(child: ChildProcess, handle: (line: string) => void) {
  let buffer = ''
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    buffer += chunk
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) handle(line)
    }
  })
  child.stdout?.on('end', () => {
    if (buffer.trim()) handle(buffer.trim())
    buffer = ''
  })
}

export function summarize(text: string, max = 200) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}
