import { IconFileText } from '@tabler/icons-react'
import { STATUS_LABEL, taskKey } from '../taskStore'
import type { Agent, Task, TaskRun } from '../types'
import { Markdown } from './Markdown'
import { ceoOf } from './OfficeView'

type Props = {
  task: Task
  children: Task[]
  agents: Agent[]
  onSign: (signedAt: string | null) => void
}

/**
 * 하위 작업이 모두 끝난 뒤 담당자가 결과를 정리해 올린 마지막 보고.
 * 예전 기록에는 실행 출처가 없으므로 하위 작업이 모두 끝났고 마지막 실행이 이어서 한 실행이면 보고로 본다
 */
export function findReportRun(task: Task, children: Task[]): TaskRun | null {
  if (children.length === 0) return null
  const run = [...task.runs].reverse().find((r) => r.status === 'completed')
  if (!run) return null
  if (run.source) return run.source === 'subtasks' ? run : null
  const finished = children.every((c) => c.status === 'done' || c.status === 'cancelled' || c.status === 'in_review')
  return finished && run === task.runs[task.runs.length - 1] && run !== task.runs[0] ? run : null
}

function reportText(run: TaskRun) {
  const result = [...run.events].reverse().find((e) => e.kind === 'result')
  if (result?.kind === 'result' && result.text.trim()) return result.text
  return run.events
    .filter((e) => e.kind === 'text')
    .map((e) => (e.kind === 'text' ? e.text : ''))
    .join('\n\n')
}

const dateText = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })

export function TaskReport({ task, children, agents, onSign }: Props) {
  const run = findReportRun(task, children)
  if (!run) return null
  const reporter = agents.find((a) => a.id === run.agentId)
  const nameOf = (id: string | null) => agents.find((a) => a.id === id)?.name ?? '담당 없음'
  const ceo = ceoOf(agents)
  // 보고서는 대표 바로 아래 에이전트가 대표에게만 올린다. 대표 본인이나 더 아래 에이전트의 정리는 보고서로 보지 않는다
  if (!ceo || !reporter || reporter.reportsTo !== ceo.id) return null
  const signedAt = task.reportSignedAt
  const text = reportText(run)

  return (
    <div className="section">
      <h2>
        <IconFileText size={16} aria-hidden /> 최종 보고
        <span className={`muted section-meta${signedAt ? ' report-signed' : ''}`}>
          {signedAt ? `${dateText(signedAt)} 결재 완료` : '대표 결재 대기'}
        </span>
      </h2>

      <article className="report-doc">
        <header className="report-head">
          <h3 className="report-title">업 무 보 고 서</h3>
          <table className="approval-box" aria-label="결재란">
            <tbody>
              <tr>
                <th rowSpan={2} className="approval-label">
                  결<br />재
                </th>
                <th>담당</th>
                <th>대표</th>
              </tr>
              <tr>
                <td>
                  <span className="stamp">
                    <span className="stamp-name">{reporter.name}</span>
                    <span className="stamp-date">{dateText(run.startedAt)}</span>
                  </span>
                </td>
                <td>
                  {signedAt ? (
                    <button
                      className="stamp stamp-ceo"
                      title="눌러서 결재를 취소합니다"
                      onClick={() => onSign(null)}
                    >
                      <span className="stamp-name">{ceo?.name ?? '결재'}</span>
                      <span className="stamp-date">{dateText(signedAt)}</span>
                    </button>
                  ) : (
                    <button className="sign-button" title="결재하면 이 작업을 완료로 바꿉니다" onClick={() => onSign(new Date().toISOString())}>
                      결재
                    </button>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </header>

        <table className="report-meta">
          <tbody>
            <tr>
              <th>문서번호</th>
              <td className="mono">{taskKey(task)}</td>
              <th>보고일</th>
              <td>{dateText(run.startedAt)}</td>
            </tr>
            <tr>
              <th>보고자</th>
              <td>
                {reporter.name}
                {reporter.title && <span className="muted"> · {reporter.title}</span>}
              </td>
              <th>수신</th>
              <td>대표 {ceo.name}</td>
            </tr>
            <tr>
              <th>제목</th>
              <td colSpan={3}>{task.title || '제목 없음'}</td>
            </tr>
          </tbody>
        </table>

        <h4 className="report-heading">1. 처리 현황</h4>
        <table className="report-table">
          <thead>
            <tr>
              <th>번호</th>
              <th>작업</th>
              <th>담당</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {children.map((c) => (
              <tr key={c.id}>
                <td className="mono">{taskKey(c)}</td>
                <td>{c.title}</td>
                <td>{nameOf(c.assigneeId)}</td>
                <td>
                  <span className={`task-status status-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4 className="report-heading">2. 보고 내용</h4>
        {text.trim() ? <Markdown text={text} /> : <p className="muted">남긴 보고 내용이 없습니다.</p>}

        <footer className="report-foot">
          <p>위와 같이 보고합니다.</p>
          <p>{dateText(run.startedAt)}</p>
          <p>
            보고자 <strong>{reporter.name}</strong> (인)
          </p>
        </footer>
      </article>
    </div>
  )
}
