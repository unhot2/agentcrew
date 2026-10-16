import { useEffect, useRef } from 'react'
import type { RunEvent, RunStatus } from '../runTypes'

export const RUN_STATUS_TEXT: Record<RunStatus, string> = {
  running: '실행 중…',
  completed: '완료',
  failed: '실패',
  stopped: '중지됨',
}

export function RunLog({ events }: { events: RunEvent[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [events.length])

  if (events.length === 0) return <div className="run-log empty">로그를 기다리는 중…</div>

  return (
    <div className="run-log" ref={ref}>
      {events.map((e, i) => (
        <RunEventRow key={i} event={e} />
      ))}
    </div>
  )
}

function RunEventRow({ event: e }: { event: RunEvent }) {
  switch (e.kind) {
    case 'init':
      return <div className="log-meta">세션 {e.sessionId.slice(0, 8)} 시작 · {e.model}</div>
    case 'text':
      return <div className="log-text">{e.text}</div>
    case 'tool':
      return (
        <div className="log-tool">
          <span className="log-tool-name">{e.name}</span> {e.summary}
        </div>
      )
    case 'tool_result':
      return <pre className={`log-output${e.isError ? ' error' : ''}`}>{e.preview || '(출력 없음)'}</pre>
    case 'result':
      return (
        <div className={`log-result${e.isError ? ' error' : ''}`}>
          {e.isError ? '오류로 끝남' : '완료'} · ${e.costUsd.toFixed(4)} · {(e.durationMs / 1000).toFixed(1)}초
        </div>
      )
    case 'stderr':
      return <pre className="log-output muted">{e.text}</pre>
    case 'error':
      return <div className="log-result error">{e.text}</div>
    case 'exit':
      return null
  }
}
