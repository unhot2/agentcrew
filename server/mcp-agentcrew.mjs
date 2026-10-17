// AgentCrew 에이전트 도구(승인 요청, 작업 위임)를 Claude Code, Codex에 붙이는 MCP 서버 (stdio, 줄 단위 JSON-RPC).
// 도구 정의와 실행은 AgentCrew 서버가 맡고, 여기서는 실행별 토큰을 붙여 전달만 한다.
import { createInterface } from 'node:readline'

const URL_BASE = process.env.AGENTCREW_URL
const TOKEN = process.env.AGENTCREW_TOKEN

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

async function api(path, body) {
  const res = await fetch(`${URL_BASE}/api/agent/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `응답 코드 ${res.status}`)
  return data
}

async function handle(msg) {
  switch (msg.method) {
    case 'initialize':
      return {
        protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'agentcrew', version: '0.1.0' },
      }
    case 'ping':
      return {}
    case 'tools/list': {
      const { tools } = await api('tools')
      return {
        tools: tools.map((t) => ({ name: t.function.name, description: t.function.description, inputSchema: t.function.parameters })),
      }
    }
    case 'tools/call': {
      const result = await api('call', { name: msg.params?.name, arguments: msg.params?.arguments ?? {} })
      return { content: [{ type: 'text', text: result.text }], isError: !!result.isError }
    }
    default:
      throw Object.assign(new Error(`지원하지 않는 요청: ${msg.method}`), { code: -32601 })
  }
}

createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  // id가 없으면 알림이라 응답하지 않는다
  if (msg.id === undefined) return
  try {
    send({ jsonrpc: '2.0', id: msg.id, result: await handle(msg) })
  } catch (err) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: err.code ?? -32000, message: err.message } })
  }
})
