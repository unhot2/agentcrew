import { useEffect, useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { api, type ServerState } from '../api'
import { taskKey } from '../taskStore'

type Props = {
  data: ServerState
  onOpenTask: (id: string) => void
}

type Preview = { exists: boolean; size: number; content: string; truncated: boolean } | { error: string } | null

function splitPath(path: string) {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return { name: path.slice(i + 1), dir: path.slice(0, i) }
}

export function ArtifactsPage({ data, onOpenTask }: Props) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview>(null)
  const q = query.trim().toLowerCase()
  const items = data.artifacts.filter((a) => !q || a.path.toLowerCase().includes(q))
  const selected = data.artifacts.find((a) => a.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) return
    setPreview(null)
    api
      .artifactContent(selectedId)
      .then(setPreview)
      .catch((err: Error) => setPreview({ error: err.message }))
  }, [selectedId])

  return (
    <main className="layout">
      <aside className="sidebar">
        <label className="search">
          <IconSearch size={14} aria-hidden />
          <input placeholder="파일 경로 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <ul className="agent-list">
          {items.map((a) => {
            const { name, dir } = splitPath(a.path)
            const task = data.tasks.find((t) => t.id === a.taskId)
            return (
              <li key={a.id}>
                <button
                  className={`agent-row${a.id === selectedId ? ' selected' : ''}`}
                  onClick={() => setSelectedId(a.id)}
                  title={a.path}
                >
                  <span className="agent-row-text">
                    <span className="agent-row-name mono">{name}</span>
                    <span className="agent-row-sub">
                      {a.action} · {task ? taskKey(task) : '삭제된 작업'} · {new Date(a.at).toLocaleDateString('ko-KR')}
                    </span>
                    <span className="agent-row-sub path-dir">{dir}</span>
                  </span>
                </button>
              </li>
            )
          })}
          {items.length === 0 && (
            <li className="empty">{q ? '검색 결과가 없습니다.' : '에이전트가 파일을 만들거나 고치면 여기에 모입니다.'}</li>
          )}
        </ul>
      </aside>
      {selected ? (
        <section className="detail">
          <header className="detail-header">
            <div className="task-title-wrap">
              <span className="task-key">{selected.action}</span>
              <h1 className="mono artifact-path">{selected.path}</h1>
            </div>
          </header>
          <p className="muted">
            {data.agents.find((x) => x.id === selected.agentId)?.name ?? '삭제된 에이전트'} ·{' '}
            {new Date(selected.at).toLocaleString('ko-KR')}
            {data.tasks.some((t) => t.id === selected.taskId) && (
              <>
                {' · '}
                <button className="link-button" onClick={() => onOpenTask(selected.taskId)}>
                  작업 보기
                </button>
              </>
            )}
          </p>
          {!preview && <p className="muted">불러오는 중…</p>}
          {preview && 'error' in preview && <p className="error-text">{preview.error}</p>}
          {preview && 'exists' in preview && !preview.exists && <p className="muted">파일이 지금은 없습니다. 지워졌거나 옮겨졌을 수 있습니다.</p>}
          {preview && 'exists' in preview && preview.exists && (
            <>
              <p className="muted">
                {(preview.size / 1024).toFixed(1)}KB 지금 파일 기준{preview.truncated ? ' · 앞부분 300KB만 보여줍니다' : ''}
              </p>
              <pre className="artifact-preview">{preview.content}</pre>
            </>
          )}
        </section>
      ) : (
        <section className="detail empty-state">
          <h1>결과물</h1>
          <p className="muted">에이전트가 실행 중에 만들거나 고친 파일 목록입니다. 파일을 고르면 지금 내용을 볼 수 있습니다.</p>
        </section>
      )}
    </main>
  )
}
