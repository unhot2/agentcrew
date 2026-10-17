import { execFile, spawn } from 'node:child_process'
import type { Agent, HermesConfig } from '../../src/types.ts'
import type { AdapterStatus, RunEvent } from '../../src/runTypes.ts'
import { killTree, onLines, summarize, type AdapterContext, type AdapterHandle } from '../runner.ts'

const HERMES_BIN = process.env.HERMES_BIN || 'hermes'

function runCli(args: string[], timeout = 30_000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(HERMES_BIN, args, { windowsHide: true, timeout }, (err, stdout) => resolve(err ? null : stdout.trim()))
  })
}

/** 설치 여부, 버전, 설정된 모델과 공급자. hermes status의 표에서 읽는다 */
export async function hermesStatus(): Promise<AdapterStatus> {
  const versionLine = await runCli(['--version'])
  if (versionLine === null) return { installed: false, version: null, loggedIn: false }
  // "Hermes Agent v0.21.5+7249.g7157422 (2026.9.24) · upstream ..." 에서 "Hermes Agent v0.21.5"만 쓴다
  const version = versionLine.split(/\r?\n/)[0].replace(/\+.*$/, '').trim()
  const status = (await runCli(['status'], 60_000)) ?? ''
  const field = (name: string) => status.match(new RegExp(`${name}:\\s*(.+)`))?.[1]?.trim()
  const model = field('Model')
  const provider = field('Provider')
  return {
    installed: true,
    version,
    loggedIn: !!model,
    account: model ? `${model}${provider ? ` (${provider})` : ''}` : undefined,
    error: model ? undefined : '모델이 설정되지 않았습니다. 터미널에서 hermes setup을 실행하세요.',
  }
}

export function startHermes(agent: Agent, ctx: AdapterContext): AdapterHandle {
  const config = agent.adapter as HermesConfig
  const args = ['chat', '--query-file', '-', '--format', 'stream-json', '--max-turns', String(config.maxTurns || 30)]
  if (config.model) args.push('-m', config.model)
  if (config.provider) args.push('--provider', config.provider)
  // 화면 없이 실행하므로 위험 명령 확인을 물을 수 없다. 끄면 그런 명령은 거절된다
  if (config.yolo) args.push('--yolo')

  // Hermes에는 시스템 프롬프트를 덧붙이는 옵션이 없어서 지시문을 작업 앞에 붙인다.
  // 작은 모델은 파일 경로를 지어내기도 해서 작업 폴더를 분명히 알려준다
  const folder = `작업 폴더: ${agent.workdir}\n파일은 이 폴더 안에 만들고, 경로는 이 폴더 기준 상대 경로로 쓰세요.`
  const instructions = [folder, ctx.systemPrompt.trim()].filter(Boolean).join('\n\n')
  const prompt = `# 지시문\n${instructions}\n\n# 작업\n${ctx.prompt}`
  const child = spawn(HERMES_BIN, args, {
    cwd: agent.workdir,
    windowsHide: true,
    env: { ...process.env, ...ctx.env, PYTHONIOENCODING: 'utf-8' },
  })
  child.stdin.end(prompt)

  let failed = false
  onLines(child, (line) => {
    for (const e of parseLine(line)) {
      if (e.kind === 'result' && e.isError) failed = true
      ctx.emit(e)
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    const text = chunk.trim()
    if (text) ctx.emit({ kind: 'stderr', text })
  })
  child.on('error', (err) => {
    ctx.emit({ kind: 'error', text: `Hermes를 실행하지 못했습니다: ${err.message}` })
    ctx.finish('failed', null)
  })
  child.on('close', (code) => ctx.finish(code === 0 && !failed ? 'completed' : 'failed', code))
  return { stop: () => killTree(child) }
}

/** 파일을 쓰는 Hermes 도구. 이 도구가 다룬 파일을 결과물로 기록한다 */
const FILE_TOOLS = new Set(['write_file', 'edit_file', 'patch', 'apply_patch', 'str_replace'])

/** hermes chat --format stream-json 한 줄을 화면용 이벤트로 바꾼다 */
function parseLine(line: string): RunEvent[] {
  let msg: any
  try {
    msg = JSON.parse(line)
  } catch {
    // 끝에 찍히는 session_id 줄 같은 안내는 건너뛴다
    return /^session_id:/.test(line) ? [] : [{ kind: 'stderr', text: line }]
  }
  switch (msg.type) {
    case 'system':
      return msg.subtype === 'init' ? [{ kind: 'init', sessionId: msg.session_id ?? '', model: msg.model ?? 'hermes' }] : []
    case 'assistant':
    case 'text': {
      const text = typeof msg.text === 'string' ? msg.text : typeof msg.content === 'string' ? msg.content : ''
      return text.trim() ? [{ kind: 'text', text }] : []
    }
    case 'tool_use': {
      const input = msg.input ?? {}
      const path = FILE_TOOLS.has(msg.name) ? (input.path ?? input.file_path) : undefined
      const key = ['command', 'path', 'file_path', 'query', 'url'].find((k) => typeof input[k] === 'string')
      return [
        {
          kind: 'tool',
          name: String(msg.name),
          summary: summarize(key ? String(input[key]) : JSON.stringify(input)),
          ...(typeof path === 'string' ? { path } : {}),
        },
      ]
    }
    case 'tool_result': {
      const output = typeof msg.output === 'string' ? msg.output : JSON.stringify(msg.output ?? '')
      let isError = false
      try {
        const parsed = JSON.parse(output)
        isError = !!parsed?.error || (typeof parsed?.exit_code === 'number' && parsed.exit_code !== 0)
      } catch {
        // 출력이 JSON이 아니면 오류 여부를 알 수 없다
      }
      return [{ kind: 'tool_result', isError, preview: output.slice(0, 400) }]
    }
    case 'result':
      return [
        {
          kind: 'result',
          isError: (msg.exit_code ?? 0) !== 0 || !!msg.error,
          text: String(msg.text ?? msg.error ?? ''),
          // chat 모드의 결과에는 비용이 없다 (토큰 수만 온다)
          costUsd: Number(msg.cost_usd ?? msg.total_cost_usd) || 0,
          durationMs: Number(msg.duration_ms) || 0,
        },
      ]
    case 'error':
      return [{ kind: 'error', text: String(msg.message ?? msg.error ?? '오류') }]
    default:
      return []
  }
}
