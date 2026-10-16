import type { Connector } from '../src/types.ts'
import { log, state } from './db.ts'

/** 켜진 GitHub 연결의 토큰을 에이전트 실행 환경 변수로 넘긴다 (gh CLI, git이 사용) */
export function connectorEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  const github = state.connectors.find((c) => c.type === 'github' && c.enabled && c.secret)
  if (github) {
    env.GH_TOKEN = github.secret
    env.GITHUB_TOKEN = github.secret
  }
  return env
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`응답 코드 ${res.status}`)
}

/** Slack, 웹훅 연결로 알림을 보낸다. 실패해도 작업은 계속하고 활동 기록에만 남긴다 */
export function notify(event: string, text: string, payload: Record<string, unknown> = {}) {
  for (const c of state.connectors) {
    if (!c.enabled || !c.secret || (c.type !== 'slack' && c.type !== 'webhook')) continue
    const body = c.type === 'slack' ? { text: `[AgentCrew] ${text}` } : { event, text, ...payload }
    post(c.secret, body).catch((err: Error) => log('connector', `${c.name} 알림 전송 실패: ${err.message}`))
  }
}

/** 연결 확인. 성공하면 설명 문구를, 실패하면 예외를 던진다 */
export async function testConnector(c: Connector): Promise<string> {
  if (!c.secret) throw new Error('토큰이나 주소가 없습니다.')
  if (c.type === 'github') {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${c.secret}`, 'User-Agent': 'agentcrew' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`GitHub 응답 코드 ${res.status}`)
    const user = (await res.json()) as { login?: string }
    return `GitHub 계정 ${user.login ?? '(알 수 없음)'}으로 연결됩니다.`
  }
  const text = 'AgentCrew 연결 확인 메시지입니다.'
  await post(c.secret, c.type === 'slack' ? { text } : { event: 'test', text })
  return '확인 메시지를 보냈습니다.'
}
