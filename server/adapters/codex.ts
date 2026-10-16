import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Agent, CodexConfig } from '../../src/types.ts'
import type { AdapterStatus, RunEvent } from '../../src/runTypes.ts'
import { mcpServerSpec } from '../delegation.ts'
import { killTree, onLines, summarize, type AdapterContext, type AdapterHandle } from '../runner.ts'

/**
 * Codex 실행 명령. Windows의 npm 설치본은 codex.cmd라서 셸 없이 띄울 수 없으므로,
 * 같은 폴더의 codex.js를 node로 직접 실행한다 (셸을 거치면 인자 따옴표 처리가 위험하다).
 */
let resolved: { command: string; prefix: string[] } | null = null

function codexCommand(): Promise<{ command: string; prefix: string[] }> {
  if (resolved) return Promise.resolve(resolved)
  if (process.env.CODEX_BIN) return Promise.resolve((resolved = { command: process.env.CODEX_BIN, prefix: [] }))
  if (process.platform !== 'win32') return Promise.resolve((resolved = { command: 'codex', prefix: [] }))
  return new Promise((resolve) => {
    execFile('where.exe', ['codex.cmd'], { windowsHide: true }, (err, stdout) => {
      const shim = err ? '' : stdout.split(/\r?\n/)[0].trim()
      const js = shim ? join(dirname(shim), 'node_modules', '@openai', 'codex', 'bin', 'codex.js') : ''
      resolved = js && existsSync(js) ? { command: process.execPath, prefix: [js] } : { command: 'codex', prefix: [] }
      resolve(resolved)
    })
  })
}

function runCli(args: string[]): Promise<string | null> {
  return codexCommand().then(
    ({ command, prefix }) =>
      new Promise((resolve) => {
        execFile(command, [...prefix, ...args], { windowsHide: true, timeout: 20_000 }, (err, stdout, stderr) =>
          resolve(err ? null : `${stdout}${stderr}`.trim()),
        )
      }),
  )
}

export async function codexStatus(): Promise<AdapterStatus> {
  const version = await runCli(['--version'])
  if (version === null) return { installed: false, version: null, loggedIn: false }
  const login = (await runCli(['login', 'status'])) ?? ''
  const loggedIn = /logged in/i.test(login) && !/not logged in/i.test(login)
  return { installed: true, version, loggedIn, account: loggedIn ? login.split('\n')[0] : undefined }
}

/** TOML 값. JSON 문자열 표기는 TOML 기본 문자열과 호환된다 */
const toml = (value: string) => JSON.stringify(value)

export function startCodex(agent: Agent, ctx: AdapterContext): AdapterHandle {
  const config = agent.adapter as CodexConfig
  const args = ['exec', '--json', '--skip-git-repo-check', '-s', config.sandbox, '-C', agent.workdir]
  if (config.model) args.push('-m', config.model)
  if (ctx.delegation) {
    const spec = mcpServerSpec(ctx.delegation)
    const env = Object.entries(spec.env)
      .map(([k, v]) => `${k}=${toml(v)}`)
      .join(', ')
    args.push('-c', `mcp_servers.agentcrew.command=${toml(spec.command)}`)
    args.push('-c', `mcp_servers.agentcrew.args=[${spec.args.map(toml).join(', ')}]`)
    args.push('-c', `mcp_servers.agentcrew.env={ ${env} }`)
  }
  // Codex exec에는 시스템 프롬프트를 덧붙이는 옵션이 없어서 지시문을 작업 앞에 붙인다
  const prompt = ctx.systemPrompt.trim() ? `# 지시문\n${ctx.systemPrompt.trim()}\n\n# 작업\n${ctx.prompt}` : ctx.prompt

  let child: ReturnType<typeof spawn> | null = null
  let stopped = false
  codexCommand().then(({ command, prefix }) => {
    if (stopped) return ctx.finish('stopped', null)
    child = spawn(command, [...prefix, ...args], { cwd: agent.workdir, windowsHide: true, env: { ...process.env, ...ctx.env } })
    child.stdin?.end(prompt)
    let failed = false
    const parseLine = makeParser()
    onLines(child, (line) => {
      for (const e of parseLine(line)) {
        if (e.kind === 'result' && e.isError) failed = true
        ctx.emit(e)
      }
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      const text = chunk.trim()
      // 시작할 때 늘 찍히는 안내 문구는 건너뛴다
      if (text && text !== 'Reading prompt from stdin...') ctx.emit({ kind: 'stderr', text })
    })
    child.on('error', (err) => {
      ctx.emit({ kind: 'error', text: `Codex를 실행하지 못했습니다: ${err.message}` })
      ctx.finish('failed', null)
    })
    child.on('close', (code) => ctx.finish(code === 0 && !failed ? 'completed' : 'failed', code))
  })
  return {
    stop: () => {
      stopped = true
      if (child) killTree(child)
    },
  }
}

/** codex exec --json 한 줄을 화면용 이벤트로 바꾼다. 실행마다 걸린 시간을 따로 재도록 실행별로 만든다 */
function makeParser() {
  let started = 0
  return (line: string) => parseLine(line, started, (t) => (started = t))
}

function parseLine(line: string, started: number, setStarted: (t: number) => void): RunEvent[] {
  let msg: any
  try {
    msg = JSON.parse(line)
  } catch {
    return [{ kind: 'stderr', text: line }]
  }
  if (msg.type === 'thread.started') {
    setStarted(Date.now())
    return [{ kind: 'init', sessionId: msg.thread_id ?? '', model: 'codex' }]
  }
  const item = msg.item
  if (msg.type === 'item.started' && item?.type === 'command_execution') {
    return [{ kind: 'tool', name: 'shell', summary: summarize(String(item.command ?? '')) }]
  }
  if (msg.type === 'item.completed' && item) {
    switch (item.type) {
      case 'agent_message':
        return item.text?.trim() ? [{ kind: 'text', text: item.text }] : []
      case 'command_execution':
        return [{ kind: 'tool_result', isError: (item.exit_code ?? 0) !== 0, preview: String(item.aggregated_output ?? '').slice(0, 400) }]
      case 'file_change':
        return (item.changes ?? []).map((c: { path: string; kind: string }) => ({
          kind: 'tool' as const,
          name: `file_${c.kind}`,
          summary: c.path,
          path: c.path,
        }))
      case 'mcp_tool_call':
        return [{ kind: 'tool', name: `${item.server}:${item.tool}`, summary: summarize(JSON.stringify(item.arguments ?? {})) }]
      case 'error':
        return [{ kind: 'error', text: String(item.message ?? '오류') }]
    }
  }
  if (msg.type === 'turn.completed') {
    // ChatGPT 요금제로 쓰면 비용 정보가 오지 않는다
    return [{ kind: 'result', isError: false, text: '', costUsd: 0, durationMs: started ? Date.now() - started : 0 }]
  }
  if (msg.type === 'turn.failed' || msg.type === 'error') {
    const text = msg.error?.message ?? msg.message ?? '실행이 실패했습니다.'
    return [{ kind: 'result', isError: true, text, costUsd: 0, durationMs: started ? Date.now() - started : 0 }]
  }
  return []
}
