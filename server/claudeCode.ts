import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import type { Agent, ClaudeCodeConfig } from '../src/types.ts'
import type { ClaudeCodeStatus, RunEvent, RunStatus } from '../src/runTypes.ts'

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'

type Run = {
  id: string
  agentId: string
  status: RunStatus
  events: RunEvent[]
  listeners: Set<(e: RunEvent) => void>
  child: ChildProcess
}

const runs = new Map<string, Run>()

export function getRun(id: string) {
  return runs.get(id)
}

function runCli(args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, args, { windowsHide: true })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.on('error', () => resolve(null))
    child.on('close', (code) => resolve(code === 0 ? out.trim() : null))
  })
}

/** 설치 여부, 버전, 로그인 상태. 화면에 필요한 항목만 골라 돌려준다 */
export async function claudeStatus(): Promise<ClaudeCodeStatus> {
  const version = await runCli(['--version'])
  if (version === null) return { installed: false, version: null, loggedIn: false }
  const raw = await runCli(['auth', 'status'])
  try {
    const auth = JSON.parse(raw ?? '')
    return {
      installed: true,
      version,
      loggedIn: !!auth.loggedIn,
      email: auth.email,
      authMethod: auth.authMethod,
      subscriptionType: auth.subscriptionType,
    }
  } catch {
    return { installed: true, version, loggedIn: false }
  }
}

/** 실행 전에 막아야 할 조건이 있으면 오류 문구를 돌려준다 */
export function validate(agent: Agent, prompt: string): string | null {
  if (agent.adapter.type !== 'claude-code') return 'Claude Code 어댑터를 쓰는 에이전트만 실행할 수 있습니다.'
  if (!prompt.trim()) return '작업 지시를 입력하세요.'
  if (!existsSync(agent.workdir) || !statSync(agent.workdir).isDirectory())
    return `작업 디렉터리가 없습니다: ${agent.workdir}`
  if (agent.monthlyBudget > 0 && agent.spentThisMonth >= agent.monthlyBudget) return '이번 달 예산을 모두 썼습니다.'
  for (const r of runs.values()) {
    if (r.agentId === agent.id && r.status === 'running') return '이 에이전트는 이미 실행 중입니다.'
  }
  return null
}

export function startRun(agent: Agent, prompt: string): Run {
  const config = agent.adapter as ClaudeCodeConfig
  const args = ['-p', '--output-format', 'stream-json', '--verbose']
  // 모델을 비워 두면 CLI에 설정된 기본 모델을 쓴다
  if (config.model) args.push('--model', config.model)
  args.push('--permission-mode', config.permissionMode)
  if (agent.instructions.trim()) args.push('--append-system-prompt', agent.instructions)
  if (agent.monthlyBudget > 0) {
    // 남은 예산을 이번 실행의 상한으로 건다
    args.push('--max-budget-usd', (agent.monthlyBudget - agent.spentThisMonth).toFixed(2))
  }

  // 작업 지시는 인자 대신 stdin으로 넘겨 따옴표, 줄바꿈 문제를 피한다
  const child = spawn(CLAUDE_BIN, args, { cwd: agent.workdir, windowsHide: true })
  const run: Run = { id: randomUUID(), agentId: agent.id, status: 'running', events: [], listeners: new Set(), child }
  runs.set(run.id, run)

  const emit = (e: RunEvent) => {
    run.events.push(e)
    for (const l of run.listeners) l(e)
  }

  child.stdin.end(prompt)

  let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) for (const e of parseLine(line)) emit(e)
    }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    const text = chunk.trim()
    if (text) emit({ kind: 'stderr', text })
  })

  child.on('error', (err) => {
    run.status = 'failed'
    emit({ kind: 'error', text: `Claude Code를 실행하지 못했습니다: ${err.message}` })
    emit({ kind: 'exit', status: run.status, code: null })
  })

  child.on('close', (code) => {
    if (buffer.trim()) for (const e of parseLine(buffer.trim())) emit(e)
    if (run.status === 'running') run.status = code === 0 ? 'completed' : 'failed'
    emit({ kind: 'exit', status: run.status, code })
  })

  return run
}

export function stopRun(run: Run) {
  if (run.status !== 'running') return
  run.status = 'stopped'
  // Windows에서는 kill()이 claude.exe만 끝내고 도구가 띄운 하위 프로세스는 남기므로 트리째 종료한다
  if (process.platform === 'win32' && run.child.pid) {
    spawn('taskkill', ['/pid', String(run.child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    run.child.kill()
  }
}

/** stream-json 한 줄을 화면용 이벤트로 바꾼다. JSON이 아닌 줄(경고 등)은 그대로 로그로 남긴다 */
function parseLine(line: string): RunEvent[] {
  let msg: any
  try {
    msg = JSON.parse(line)
  } catch {
    return [{ kind: 'stderr', text: line }]
  }

  if (msg.type === 'system' && msg.subtype === 'init') {
    return [{ kind: 'init', sessionId: msg.session_id, model: msg.model ?? '' }]
  }

  if (msg.type === 'assistant') {
    const out: RunEvent[] = []
    for (const block of msg.message?.content ?? []) {
      if (block.type === 'text' && block.text.trim()) out.push({ kind: 'text', text: block.text })
      if (block.type === 'tool_use') out.push({ kind: 'tool', name: block.name, summary: summarizeInput(block.input) })
    }
    return out
  }

  if (msg.type === 'user') {
    const out: RunEvent[] = []
    for (const block of msg.message?.content ?? []) {
      if (block.type !== 'tool_result') continue
      const content =
        typeof block.content === 'string'
          ? block.content
          : (block.content ?? []).map((c: any) => c.text ?? '').join('\n')
      out.push({ kind: 'tool_result', isError: !!block.is_error, preview: content.slice(0, 400) })
    }
    return out
  }

  if (msg.type === 'result') {
    return [
      {
        kind: 'result',
        isError: !!msg.is_error,
        text: typeof msg.result === 'string' ? msg.result : '',
        costUsd: Number(msg.total_cost_usd) || 0,
        durationMs: Number(msg.duration_ms) || 0,
      },
    ]
  }

  return []
}

function summarizeInput(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  const key = ['command', 'file_path', 'pattern', 'path', 'url', 'description'].find((k) => typeof input[k] === 'string')
  const text = key ? String(input[key]) : JSON.stringify(input)
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}
