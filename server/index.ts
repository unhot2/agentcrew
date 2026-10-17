import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createViteServer } from 'vite'
import {
  ApiError,
  artifactContent,
  checkConnector,
  decideApproval,
  deleteAgent,
  deleteConnector,
  deleteGoal,
  deleteProject,
  deleteRoutine,
  deleteSkill,
  deleteTask,
  importState,
  publicState,
  putAgent,
  putConnector,
  putGoal,
  putProject,
  putRoutine,
  putSettings,
  putSkill,
  putTask,
  runTask,
} from './api.ts'
import { claudeStatus } from './adapters/claudeCode.ts'
import { codexStatus } from './adapters/codex.ts'
import { hermesStatus } from './adapters/hermes.ts'
import { localModelStatus } from './adapters/localModel.ts'
import { agentTools, callAgentTool, setApiUrl } from './delegation.ts'
import { getRun, stopRun } from './runner.ts'
import { dataFilePath, flush, onChange } from './db.ts'
import { startScheduler } from './scheduler.ts'

const PORT = Number(process.env.PORT) || 5180
// 에이전트가 이 PC에서 명령을 실행하므로 외부에서 접근하지 못하게 로컬에만 연다
const HOST = '127.0.0.1'

const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' })

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const MAX_BODY = 5 * 1024 * 1024

async function readJson(req: IncomingMessage): Promise<any> {
  // 다른 사이트의 단순 폼 전송을 막으려고 JSON 요청만 받는다
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'JSON 요청만 받습니다.')
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > MAX_BODY) throw new ApiError(413, '요청이 너무 큽니다.')
  }
  try {
    return JSON.parse(raw || '{}')
  } catch {
    throw new ApiError(400, 'JSON 형식이 올바르지 않습니다.')
  }
}

/** 다른 사이트가 브라우저를 통해 이 API를 호출하지 못하게 같은 출처 요청만 받는다 */
function isSameOrigin(req: IncomingMessage) {
  // Host도 확인해서 DNS 리바인딩(외부 도메인을 127.0.0.1로 돌리는 공격)을 막는다
  const host = req.headers.host ?? ''
  if (host !== `localhost:${PORT}` && host !== `127.0.0.1:${PORT}`) return false
  const origin = req.headers.origin
  return !origin || origin === `http://${host}`
}

/** 서버 데이터가 바뀔 때마다 화면에 알려서 다시 불러가게 한다 */
function streamChanges(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.write('retry: 2000\n\n')
  const off = onChange(() => res.write('data: changed\n\n'))
  const ping = setInterval(() => res.write(': ping\n\n'), 30_000)
  req.on('close', () => {
    off()
    clearInterval(ping)
  })
}

type Put = (id: string, body: any) => unknown
type Delete = (id: string) => void

const ENTITIES: Record<string, { put: Put; remove: Delete }> = {
  agents: { put: putAgent, remove: deleteAgent },
  tasks: { put: putTask, remove: deleteTask },
  projects: { put: putProject, remove: deleteProject },
  goals: { put: putGoal, remove: deleteGoal },
  routines: { put: putRoutine, remove: deleteRoutine },
  skills: { put: putSkill, remove: deleteSkill },
  connectors: { put: putConnector, remove: deleteConnector },
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (!isSameOrigin(req)) return sendJson(res, 403, { error: '허용되지 않은 출처입니다.' })
  const path = url.pathname
  const method = req.method ?? 'GET'

  if (method === 'GET' && path === '/api/adapters/claude-code/status') return sendJson(res, 200, await claudeStatus())
  if (method === 'GET' && path === '/api/adapters/codex/status') return sendJson(res, 200, await codexStatus())
  if (method === 'GET' && path === '/api/adapters/hermes/status') return sendJson(res, 200, await hermesStatus())
  if (method === 'GET' && path === '/api/adapters/local/status') {
    const base = url.searchParams.get('base') ?? ''
    // 이 PC에서 도는 모델 서버만 확인한다 (다른 주소로 요청을 보내는 통로가 되지 않게)
    if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(base)) throw new ApiError(400, '이 PC의 주소(localhost)만 확인할 수 있습니다.')
    return sendJson(res, 200, await localModelStatus(base, url.searchParams.get('type') ?? undefined))
  }

  // 실행 중인 에이전트가 MCP 서버를 통해 부르는 도구(승인 요청, 위임). 실행별 토큰이 있어야 한다
  if (path.startsWith('/api/agent/')) {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!token) throw new ApiError(401, '토큰이 필요합니다.')
    if (method === 'GET' && path === '/api/agent/tools') return sendJson(res, 200, { tools: agentTools(token) })
    if (method === 'POST' && path === '/api/agent/call') {
      const { name, arguments: args } = await readJson(req)
      return sendJson(res, 200, await callAgentTool(token, String(name), args ?? {}))
    }
  }
  if (method === 'GET' && path === '/api/state') return sendJson(res, 200, publicState())
  if (method === 'GET' && path === '/api/stream') return streamChanges(req, res)

  if (method === 'GET' && path === '/api/export') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="agentcrew-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    })
    return res.end(JSON.stringify(publicState(), null, 2))
  }

  if (method === 'POST' && path === '/api/import') {
    importState(await readJson(req))
    return sendJson(res, 200, publicState())
  }

  if (method === 'PUT' && path === '/api/settings') return sendJson(res, 200, putSettings(await readJson(req)))

  const entity = path.match(/^\/api\/(\w+)\/([\w-]+)$/)
  if (entity && ENTITIES[entity[1]]) {
    const { put, remove } = ENTITIES[entity[1]]
    if (method === 'PUT') return sendJson(res, 200, put(entity[2], await readJson(req)))
    if (method === 'DELETE') {
      remove(entity[2])
      return sendJson(res, 200, { ok: true })
    }
  }

  const action = path.match(/^\/api\/(\w+)\/([\w-]+)\/(\w+)$/)
  if (action) {
    const [, kind, id, verb] = action
    if (method === 'POST' && kind === 'tasks' && verb === 'run') return sendJson(res, 201, runTask(id))
    if (method === 'POST' && kind === 'approvals' && verb === 'decide') {
      const { decision, comment } = await readJson(req)
      if (decision !== 'approved' && decision !== 'rejected') throw new ApiError(400, '승인 또는 거절만 할 수 있습니다.')
      return sendJson(res, 200, decideApproval(id, decision, typeof comment === 'string' ? comment : ''))
    }
    if (method === 'POST' && kind === 'connectors' && verb === 'test') return sendJson(res, 200, await checkConnector(id))
    if (method === 'GET' && kind === 'artifacts' && verb === 'content') return sendJson(res, 200, artifactContent(id))

    const run = kind === 'runs' ? getRun(id) : undefined
    if (kind === 'runs' && !run) return sendJson(res, 404, { error: '실행을 찾을 수 없습니다.' })
    if (run && method === 'POST' && verb === 'stop') {
      stopRun(run)
      return sendJson(res, 200, { ok: true })
    }
    if (run && method === 'GET' && verb === 'events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`)
      // 이미 지나간 이벤트부터 보내고 이후 이벤트를 이어서 보낸다
      run.events.forEach(send)
      run.listeners.add(send)
      req.on('close', () => run.listeners.delete(send))
      return
    }
  }

  sendJson(res, 404, { error: '지원하지 않는 요청입니다.' })
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) =>
      err instanceof ApiError
        ? sendJson(res, err.status, { error: err.message })
        : sendJson(res, 500, { error: String(err?.message ?? err) }),
    )
  } else {
    vite.middlewares(req, res)
  }
}).listen(PORT, HOST, () => {
  console.log(`AgentCrew: http://localhost:${PORT}`)
  console.log(`데이터 파일: ${dataFilePath()}`)
  setApiUrl(`http://127.0.0.1:${PORT}`)
  startScheduler()
})

// 꺼질 때 아직 쓰지 않은 변경을 저장한다
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    flush()
    process.exit(0)
  })
}
