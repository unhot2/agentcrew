import { useEffect, useRef, useState } from 'react'
import { IconPlayerPlay, IconPlayerStop, IconTerminal2 } from '@tabler/icons-react'
import type { RunEvent, RunStatus } from '../runTypes'

export type RunState = {
  runId: string | null
  status: RunStatus | 'starting'
  events: RunEvent[]
}

const STATUS_TEXT: Record<RunState['status'], string> = {
  starting: '시작하는 중…',
  running: '실행 중…',
  completed: '완료',
  failed: '실패',
  stopped: '중지됨',
}

type Props = {
  run: RunState | undefined
  blockedReason: string | null
  onRun: (prompt: string) => void
  onStop: () => void
}

export function RunPanel({ run, blockedReason, onRun, onStop }: Props) {
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const active = run?.status === 'running' || run?.status === 'starting'

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [run?.events.length])

  const submit = () => {
    if (!prompt.trim()) return setError('작업 지시를 입력하세요.')
    onRun(prompt)
  }

  return (
    <div className="section">
      <h2>
        <IconTerminal2 size={16} aria-hidden /> 실행
      </h2>
      <textarea
        rows={3}
        value={prompt}
        placeholder="이번에 맡길 작업을 적어주세요. 예: README.md를 읽고 프로젝트 구조를 요약해줘"
        onChange={(e) => {
          setPrompt(e.target.value)
          setError('')
        }}
      />
      <div className="run-actions">
        {error && <span className="error-text">{error}</span>}
        {!error && blockedReason && <span className="muted">{blockedReason}</span>}
        {run && <span className={`run-status run-${run.status}`}>{STATUS_TEXT[run.status]}</span>}
        {active ? (
          <button onClick={onStop}>
            <IconPlayerStop size={14} aria-hidden /> 중지
          </button>
        ) : (
          <button className="primary" onClick={submit} disabled={!!blockedReason}>
            <IconPlayerPlay size={14} aria-hidden /> 실행
          </button>
        )}
      </div>
      {run && run.events.length > 0 && (
        <div className="run-log" ref={logRef}>
          {run.events.map((e, i) => (
            <RunEventRow key={i} event={e} />
          ))}
        </div>
      )}
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
