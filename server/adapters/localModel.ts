import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import type { Agent, LocalModelConfig } from '../../src/types.ts'
import type { AdapterStatus } from '../../src/runTypes.ts'
import { agentTools, callAgentTool } from '../delegation.ts'
import { summarize, type AdapterContext, type AdapterHandle } from '../runner.ts'

const MAX_TURNS = 15
const MAX_READ = 100 * 1024

/** LM Studio 주소는 보통 /v1까지 적고, Ollama는 /v1 없이 적으므로 맞춰 준다 */
export function openAiBase(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, '')
  return /\/v1$/.test(base) ? base : `${base}/v1`
}

/** 이 PC에서 각 프로그램이 서버를 여는 흔한 주소. 버전에 따라 포트가 다르다 (LM Studio는 1234 또는 1235) */
const KNOWN_BASES: Record<string, string[]> = {
  lmstudio: ['http://localhost:1234/v1', 'http://localhost:1235/v1'],
  ollama: ['http://localhost:11434'],
}

/** 서버가 켜져 있는지와 받아 둔 모델 목록. 적은 주소가 안 되면 흔한 주소를 찾아 알려준다 */
export async function localModelStatus(baseUrl: string, type?: string): Promise<AdapterStatus> {
  const status = await probe(baseUrl)
  if (status.loggedIn || !type) return status
  for (const candidate of KNOWN_BASES[type] ?? []) {
    if (openAiBase(candidate) === openAiBase(baseUrl)) continue
    const other = await probe(candidate)
    if (other.loggedIn) return { ...status, suggestedBaseUrl: candidate, models: other.models }
  }
  return status
}

async function probe(baseUrl: string): Promise<AdapterStatus> {
  try {
    const res = await fetch(`${openAiBase(baseUrl)}/models`, { signal: AbortSignal.timeout(3_000) })
    if (!res.ok) return { installed: true, version: null, loggedIn: false, error: `서버 응답 코드 ${res.status}` }
    const body = (await res.json()) as { data?: { id: string }[] | null }
    const models = (body.data ?? []).map((m) => m.id)
    return { installed: true, version: null, loggedIn: true, models }
  } catch {
    return { installed: false, version: null, loggedIn: false, error: '서버에 연결하지 못했습니다. 프로그램에서 서버를 켜 주세요.' }
  }
}

type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

const FILE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '작업 폴더 안의 파일과 폴더 목록을 본다.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '작업 폴더 기준 경로. 비우면 작업 폴더' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '작업 폴더 안의 텍스트 파일을 읽는다.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '작업 폴더 안에 텍스트 파일을 만들거나 덮어쓴다.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
]

/** 작업 폴더 밖으로 나가는 경로는 거절한다 */
function inside(workdir: string, path: string) {
  const full = resolve(workdir, path || '.')
  const rel = relative(workdir, full)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('작업 폴더 밖의 경로는 쓸 수 없습니다.')
  return full
}

export function startLocalModel(agent: Agent, ctx: AdapterContext): AdapterHandle {
  const config = agent.adapter as LocalModelConfig
  const abort = new AbortController()
  const tools = [...FILE_TOOLS, ...(ctx.agentTools ? agentTools(ctx.agentTools.token) : [])]
  const messages: Message[] = [
    {
      role: 'system',
      content: [
        `작업 폴더: ${agent.workdir}`,
        '파일은 list_files, read_file, write_file 도구로만 다룰 수 있고 경로는 작업 폴더 기준이다.',
        ctx.systemPrompt,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    { role: 'user', content: ctx.prompt },
  ]

  const runTool = async (name: string, rawArgs: string): Promise<{ text: string; isError: boolean; path?: string }> => {
    let args: Record<string, string> = {}
    try {
      args = rawArgs ? JSON.parse(rawArgs) : {}
    } catch {
      return { text: '도구 인자가 올바른 JSON이 아닙니다.', isError: true }
    }
    try {
      if (name === 'list_files') {
        const dir = inside(agent.workdir, args.path ?? '')
        const entries = readdirSync(dir, { withFileTypes: true }).slice(0, 200)
        return { text: entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).join('\n') || '(비어 있음)', isError: false }
      }
      if (name === 'read_file') {
        const file = inside(agent.workdir, args.path)
        const size = statSync(file).size
        const text = readFileSync(file, 'utf8').slice(0, MAX_READ)
        return { text: size > MAX_READ ? `${text}\n…(앞부분 100KB만 읽음)` : text, isError: false }
      }
      if (name === 'write_file') {
        const file = inside(agent.workdir, args.path)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, args.content ?? '')
        return { text: `${args.path}에 저장했습니다.`, isError: false, path: file }
      }
      if (ctx.agentTools) return await callAgentTool(ctx.agentTools.token, name, args)
      return { text: `알 수 없는 도구: ${name}`, isError: true }
    } catch (err) {
      return { text: (err as Error).message, isError: true }
    }
  }

  const call = async (withTools: boolean) => {
    const url = `${openAiBase(config.baseUrl)}/chat/completions`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abort.signal,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
        stream: false,
        ...(withTools ? { tools } : {}),
      }),
    }).catch((err: Error) => {
      if (abort.signal.aborted) throw err
      throw new Error(`서버(${config.baseUrl})에 연결하지 못했습니다. 프로그램에서 서버를 켜 주세요.`)
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.error?.message ?? body?.error ?? `응답 코드 ${res.status}`)
    return body.choices?.[0]?.message as Message | undefined
  }

  const loop = async () => {
    const started = Date.now()
    ctx.emit({ kind: 'init', sessionId: ctx.runId, model: `${agent.adapter.type}:${config.model}` })
    let useTools = true
    let lastText = ''
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let message: Message | undefined
      try {
        message = await call(useTools)
      } catch (err) {
        // 도구를 지원하지 않는 모델이면 한 번은 도구 없이 다시 묻는다
        if (useTools && turn === 0 && !abort.signal.aborted && /tool/i.test((err as Error).message)) {
          ctx.emit({ kind: 'stderr', text: `도구 없이 다시 시도합니다: ${(err as Error).message}` })
          useTools = false
          turn--
          continue
        }
        throw err
      }
      if (!message) throw new Error('모델이 빈 응답을 보냈습니다.')
      messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls })
      if (message.content?.trim()) {
        lastText = message.content
        ctx.emit({ kind: 'text', text: message.content })
      }
      if (!message.tool_calls?.length) break
      for (const tc of message.tool_calls) {
        const result = await runTool(tc.function.name, tc.function.arguments)
        ctx.emit({
          kind: 'tool',
          name: tc.function.name,
          summary: summarize(tc.function.arguments ?? ''),
          ...(result.path ? { path: result.path } : {}),
        })
        ctx.emit({ kind: 'tool_result', isError: result.isError, preview: result.text.slice(0, 400) })
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result.text })
      }
      if (turn === MAX_TURNS - 1) ctx.emit({ kind: 'stderr', text: `도구 사용이 ${MAX_TURNS}번을 넘어 멈췄습니다.` })
    }
    // 로컬 모델은 API 비용이 들지 않는다
    ctx.emit({ kind: 'result', isError: false, text: lastText, costUsd: 0, durationMs: Date.now() - started })
  }

  loop()
    .then(() => ctx.finish('completed', 0))
    .catch((err: Error) => {
      if (abort.signal.aborted) return ctx.finish('stopped', null)
      ctx.emit({ kind: 'error', text: `${agent.adapter.type === 'ollama' ? 'Ollama' : 'LM Studio'} 실행 실패: ${err.message}` })
      ctx.finish('failed', null)
    })

  return { stop: () => abort.abort() }
}
