import { spawn } from 'node:child_process'
import type { Agent, ClaudeCodeConfig } from '../../src/types.ts'
import type { AdapterStatus, RunEvent } from '../../src/runTypes.ts'
import { mcpServerSpec } from '../delegation.ts'
import { killTree, onLines, summarize, type AdapterContext, type AdapterHandle } from '../runner.ts'

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'

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
export async function claudeStatus(): Promise<AdapterStatus> {
  const version = await runCli(['--version'])
  if (version === null) return { installed: false, version: null, loggedIn: false }
  const raw = await runCli(['auth', 'status'])
  try {
    const auth = JSON.parse(raw ?? '')
    const plan = auth.subscriptionType ? ` (${auth.subscriptionType})` : ''
    return { installed: true, version, loggedIn: !!auth.loggedIn, account: auth.email ? `${auth.email}${plan}` : undefined }
  } catch {
    return { installed: true, version, loggedIn: false }
  }
}

export function startClaudeCode(agent: Agent, ctx: AdapterContext): AdapterHandle {
  const config = agent.adapter as ClaudeCodeConfig
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', config.permissionMode]
  // 모델을 비워 두면 CLI에 설정된 기본 모델을 쓴다
  if (config.model) args.push('--model', config.model)
  if (ctx.systemPrompt.trim()) args.push('--append-system-prompt', ctx.systemPrompt)
  if (agent.monthlyBudget > 0) {
    // 남은 예산을 이번 실행의 상한으로 건다
    args.push('--max-budget-usd', (agent.monthlyBudget - agent.spentThisMonth).toFixed(2))
  }
  if (ctx.agentTools) {
    // 에이전트 도구는 화면 없이 실행하므로 허락을 묻지 않고 쓸 수 있게 미리 허용한다
    const mcp = { mcpServers: { agentcrew: mcpServerSpec(ctx.agentTools) } }
    args.push('--allowedTools', ctx.agentTools.tools.map((n) => `mcp__agentcrew__${n}`).join(','))
    args.push('--mcp-config', JSON.stringify(mcp))
  }
  // 승인 후에는 앞 실행의 대화를 이어서 진행한다
  if (ctx.resumeSessionId) args.push('--resume', ctx.resumeSessionId)

  // 작업 지시는 인자 대신 stdin으로 넘겨 따옴표, 줄바꿈 문제를 피한다
  const child = spawn(CLAUDE_BIN, args, { cwd: agent.workdir, windowsHide: true, env: { ...process.env, ...ctx.env } })
  child.stdin.end(ctx.prompt)
  onLines(child, (line) => {
    for (const e of parseLine(line)) ctx.emit(e)
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    const text = chunk.trim()
    if (text) ctx.emit({ kind: 'stderr', text })
  })
  child.on('error', (err) => {
    ctx.emit({ kind: 'error', text: `Claude Code를 실행하지 못했습니다: ${err.message}` })
    ctx.finish('failed', null)
  })
  child.on('close', (code) => ctx.finish(code === 0 ? 'completed' : 'failed', code))
  return { stop: () => killTree(child) }
}

/** 파일을 만들거나 고치는 도구. 이 도구가 다룬 파일을 결과물로 기록한다 */
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

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
      if (block.type === 'tool_use') {
        const path = FILE_TOOLS.has(block.name) ? (block.input?.file_path ?? block.input?.notebook_path) : undefined
        out.push({
          kind: 'tool',
          name: String(block.name).replace(/^mcp__agentcrew__/, 'agentcrew:'),
          summary: summarizeInput(block.input),
          ...(typeof path === 'string' ? { path } : {}),
        })
      }
    }
    return out
  }

  if (msg.type === 'user') {
    const out: RunEvent[] = []
    for (const block of msg.message?.content ?? []) {
      if (block.type !== 'tool_result') continue
      const content =
        typeof block.content === 'string' ? block.content : (block.content ?? []).map((c: any) => c.text ?? '').join('\n')
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
  const key = ['command', 'file_path', 'pattern', 'path', 'url', 'description', 'title'].find((k) => typeof input[k] === 'string')
  return summarize(key ? String(input[key]) : JSON.stringify(input))
}
