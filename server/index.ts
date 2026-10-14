import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createViteServer } from 'vite'
import type { Agent } from '../src/types.ts'
import { claudeStatus, getRun, startRun, stopRun, validate } from './claudeCode.ts'

const PORT = Number(process.env.PORT) || 5173
// 에이전트가 이 PC에서 명령을 실행하므로 외부에서 접근하지 못하게 로컬에만 연다
const HOST = '127.0.0.1'

const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' })

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<any> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return JSON.parse(raw || '{}')
}

/** 다른 사이트가 브라우저를 통해 이 API를 호출하지 못하게 같은 출처 요청만 받는다 */
function isSameOrigin(req: IncomingMessage) {
  // Host도 확인해서 DNS 리바인딩(외부 도메인을 127.0.0.1로 돌리는 공격)을 막는다
  const host = req.headers.host ?? ''
  if (host !== `localhost:${PORT}` && host !== `127.0.0.1:${PORT}`) return false
  const origin = req.headers.origin
  return !origin || origin === `http://${host}`
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (!isSameOrigin(req)) return sendJson(res, 403, { error: '허용되지 않은 출처입니다.' })

  if (req.method === 'GET' && url.pathname === '/api/adapters/claude-code/status') {
    return sendJson(res, 200, await claudeStatus())
  }

  if (req.method === 'POST' && url.pathname === '/api/runs') {
    if (!req.headers['content-type']?.startsWith('application/json'))
      return sendJson(res, 415, { error: 'JSON 요청만 받습니다.' })
    const { agent, prompt } = (await readJson(req)) as { agent: Agent; prompt: string }
    const error = validate(agent, prompt ?? '')
    if (error) return sendJson(res, 400, { error })
    const run = startRun(agent, prompt)
    return sendJson(res, 201, { runId: run.id })
  }

  const match = url.pathname.match(/^\/api\/runs\/([\w-]+)\/(events|stop)$/)
  const run = match && getRun(match[1])
  if (!match || !run) return sendJson(res, 404, { error: '실행을 찾을 수 없습니다.' })

  if (req.method === 'POST' && match[2] === 'stop') {
    stopRun(run)
    return sendJson(res, 200, { ok: true })
  }

  if (req.method === 'GET' && match[2] === 'events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`)
    // 이미 지나간 이벤트부터 보내고 이후 이벤트를 이어서 보낸다
    run.events.forEach(send)
    run.listeners.add(send)
    req.on('close', () => run.listeners.delete(send))
    return
  }

  sendJson(res, 405, { error: '지원하지 않는 요청입니다.' })
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => sendJson(res, 500, { error: String(err?.message ?? err) }))
  } else {
    vite.middlewares(req, res)
  }
}).listen(PORT, HOST, () => {
  console.log(`AgentCrew: http://localhost:${PORT}`)
})
