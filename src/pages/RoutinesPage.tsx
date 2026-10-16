import { IconTrash } from '@tabler/icons-react'
import type { ServerState } from '../api'
import { Field } from '../components/AdapterSettings'
import { EmptyDetail, SimpleList } from '../components/SimpleList'
import { PRIORITY_LABEL, PRIORITY_ORDER } from '../taskStore'
import type { Routine, RoutineSchedule, TaskPriority } from '../types'

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export function scheduleText(s: RoutineSchedule) {
  if (s.kind === 'interval') {
    return s.minutes % 60 === 0 ? `${s.minutes / 60}시간마다` : `${s.minutes}분마다`
  }
  const days = s.days.length === 0 || s.days.length === 7 ? '매일' : s.days.map((d) => DAYS[d]).join(', ')
  return `${days} ${s.time}`
}

type Props = {
  data: ServerState
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  onChange: (id: string, patch: Partial<Routine>, now?: boolean) => void
  onDelete: (id: string) => void
}

export function RoutinesPage({ data, selectedId, onSelect, onAdd, onChange, onDelete }: Props) {
  const routine = data.routines.find((r) => r.id === selectedId) ?? null
  const automationOff = !data.settings.automationEnabled

  const items = data.routines.map((r) => ({
    id: r.id,
    title: r.name || '이름 없는 반복 업무',
    sub: `${r.enabled ? scheduleText(r.schedule) : '꺼짐'} · ${data.agents.find((a) => a.id === r.assigneeId)?.name ?? '담당 없음'}`,
    dim: !r.enabled,
  }))

  const remove = (r: Routine) => {
    if (!window.confirm(`반복 업무 '${r.name || '이름 없음'}'을 삭제할까요? 이미 만든 작업은 남습니다.`)) return
    onDelete(r.id)
    onSelect(null)
  }

  const setSchedule = (r: Routine, schedule: RoutineSchedule) => onChange(r.id, { schedule })

  return (
    <main className="layout">
      <SimpleList items={items} selectedId={selectedId} empty="반복 업무가 없습니다." onSelect={onSelect} />
      {routine ? (
        <section className="detail" key={routine.id}>
          {automationOff && <div className="notice">설정에서 자동 실행이 꺼져 있어 반복 업무가 돌지 않습니다.</div>}
          <header className="detail-header">
            <div className="task-title-wrap">
              <span className="task-key">반복 업무</span>
              <input
                className="task-title"
                value={routine.name}
                placeholder="반복 업무 이름 (만들어지는 작업의 제목)"
                aria-label="반복 업무 이름"
                onChange={(e) => onChange(routine.id, { name: e.target.value })}
              />
            </div>
            <button className="icon-button danger" aria-label="삭제" title="삭제" onClick={() => remove(routine)}>
              <IconTrash size={16} />
            </button>
          </header>

          <div className="section">
            <h2>일정</h2>
            <div className="check-list">
              <label className="check">
                <input
                  type="checkbox"
                  checked={routine.enabled}
                  onChange={(e) => onChange(routine.id, { enabled: e.target.checked }, true)}
                />
                <span>켜기</span>
              </label>
            </div>
            <div className="grid-2">
              <Field label="반복 방식">
                <select
                  value={routine.schedule.kind}
                  onChange={(e) =>
                    setSchedule(
                      routine,
                      e.target.value === 'interval'
                        ? { kind: 'interval', minutes: 60 }
                        : { kind: 'daily', time: '09:00', days: [] },
                    )
                  }
                >
                  <option value="interval">일정 간격마다</option>
                  <option value="daily">정해진 시각에</option>
                </select>
              </Field>
              {routine.schedule.kind === 'interval' ? (
                <Field label="간격 (분)">
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={routine.schedule.minutes}
                    onChange={(e) => setSchedule(routine, { kind: 'interval', minutes: Math.max(5, Number(e.target.value)) })}
                  />
                </Field>
              ) : (
                <Field label="시각">
                  <input
                    type="time"
                    value={routine.schedule.time}
                    onChange={(e) =>
                      routine.schedule.kind === 'daily' && setSchedule(routine, { ...routine.schedule, time: e.target.value })
                    }
                  />
                </Field>
              )}
            </div>
            {routine.schedule.kind === 'daily' && (
              <div className="day-picker" role="group" aria-label="요일">
                {DAYS.map((label, d) => {
                  const schedule = routine.schedule as Extract<RoutineSchedule, { kind: 'daily' }>
                  const on = schedule.days.includes(d)
                  return (
                    <button
                      key={d}
                      className={on ? 'selected' : ''}
                      aria-pressed={on}
                      onClick={() =>
                        setSchedule(routine, {
                          ...schedule,
                          days: on ? schedule.days.filter((x) => x !== d) : [...schedule.days, d].sort(),
                        })
                      }
                    >
                      {label}
                    </button>
                  )
                })}
                <span className="muted">아무 요일도 고르지 않으면 매일입니다.</span>
              </div>
            )}
            <p className="muted">
              {routine.lastRunAt ? `마지막 실행: ${new Date(routine.lastRunAt).toLocaleString('ko-KR')} · ` : ''}
              다음 실행: {routine.enabled && routine.nextRunAt ? new Date(routine.nextRunAt).toLocaleString('ko-KR') : '없음'}
            </p>
          </div>

          <div className="section">
            <h2>만들어질 작업</h2>
            <div className="grid-3">
              <Field label="담당 에이전트">
                <select
                  value={routine.assigneeId ?? ''}
                  onChange={(e) => onChange(routine.id, { assigneeId: e.target.value || null })}
                >
                  <option value="">담당 없음</option>
                  {data.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="프로젝트">
                <select
                  value={routine.projectId ?? ''}
                  onChange={(e) => onChange(routine.id, { projectId: e.target.value || null })}
                >
                  <option value="">프로젝트 없음</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || '이름 없는 프로젝트'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="우선순위">
                <select
                  value={routine.priority}
                  onChange={(e) => onChange(routine.id, { priority: e.target.value as TaskPriority })}
                >
                  {PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="작업 내용">
              <textarea
                rows={5}
                value={routine.description}
                placeholder="매번 만들어지는 작업의 설명입니다. 에이전트가 할 일을 자세히 적어주세요."
                onChange={(e) => onChange(routine.id, { description: e.target.value })}
              />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={routine.runImmediately}
                onChange={(e) => onChange(routine.id, { runImmediately: e.target.checked }, true)}
              />
              <span>
                만들자마자 실행
                <span className="muted"> · 끄면 담당 에이전트의 다음 하트비트 때 실행됩니다 (에이전트의 자동 실행이 켜져 있어야 함)</span>
              </span>
            </label>
          </div>
        </section>
      ) : (
        <EmptyDetail
          title={data.routines.length ? '반복 업무를 선택하세요' : '첫 반복 업무를 만들어 보세요'}
          body="정해진 주기마다 작업을 자동으로 만들고 담당 에이전트에게 맡깁니다."
          action="새 반복 업무"
          onAction={onAdd}
        />
      )}
    </main>
  )
}
