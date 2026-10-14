import { IconFileText, IconHeartbeat, IconIdBadge2, IconPlayerPause, IconPlayerPlay, IconPlug, IconTrash } from '@tabler/icons-react'
import { isLocalAdapter } from '../adapters'
import { descendantIds, isAbsolutePath, WORKSPACE_BASE } from '../store'
import type { Agent } from '../types'
import { AdapterSettings, Field, type ClaudeCheck } from './AdapterSettings'
import { STATUS_LABEL } from './AgentList'

type Props = {
  agents: Agent[]
  draft: Agent
  dirty: boolean
  onChange: (next: Agent) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
  claudeCheck: ClaudeCheck
  onRecheckClaude: () => void
  children?: React.ReactNode
}

export function AgentForm({ agents, draft, dirty, onChange, onSave, onCancel, onDelete, claudeCheck, onRecheckClaude, children }: Props) {
  const set = <K extends keyof Agent>(key: K, value: Agent[K]) => onChange({ ...draft, [key]: value })
  const blocked = descendantIds(agents, draft.id)
  const managerOptions = agents.filter((a) => !blocked.has(a.id))
  const local = isLocalAdapter(draft.adapter.type)
  const usage = draft.monthlyBudget > 0 ? Math.min(100, (draft.spentThisMonth / draft.monthlyBudget) * 100) : 0
  const paused = draft.status === 'paused'
  const nameError = draft.name.trim() === ''
  const workdirError = !isAbsolutePath(draft.workdir.trim())

  return (
    <section className="detail">
      <header className="detail-header">
        <div>
          <h1>{draft.name || '이름 없음'}</h1>
          <p className="muted">{draft.description || '설명이 없습니다.'}</p>
        </div>
        <div className="detail-actions">
          <span className={`badge status-${draft.status}`}>{STATUS_LABEL[draft.status]}</span>
          <button
            className="icon-button"
            aria-label={paused ? '재개' : '일시 정지'}
            title={paused ? '재개' : '일시 정지'}
            onClick={() => set('status', paused ? 'idle' : 'paused')}
          >
            {paused ? <IconPlayerPlay size={16} /> : <IconPlayerPause size={16} />}
          </button>
          <button className="icon-button danger" aria-label="삭제" title="삭제" onClick={onDelete}>
            <IconTrash size={16} />
          </button>
        </div>
      </header>

      <div className="section">
        <h2>
          <IconIdBadge2 size={16} aria-hidden /> 기본 정보
        </h2>
        <div className="grid-2">
          <Field label="이름" hint={nameError ? '이름을 입력하세요.' : undefined}>
            <input
              value={draft.name}
              aria-invalid={nameError}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="직책">
            <input value={draft.title} placeholder="Backend Engineer" onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="보고 대상">
            <select value={draft.reportsTo ?? ''} onChange={(e) => set('reportsTo', e.target.value || null)}>
              <option value="">없음 (최상위)</option>
              {managerOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="작업 디렉터리" hint={workdirError ? '절대 경로를 입력하세요. 예: C:\\Users\\...' : undefined}>
            <input
              className="mono"
              value={draft.workdir}
              placeholder={WORKSPACE_BASE}
              aria-invalid={workdirError}
              onChange={(e) => set('workdir', e.target.value)}
            />
          </Field>
        </div>
        <Field label="설명">
          <input
            value={draft.description}
            placeholder="이 에이전트가 맡는 일을 한 줄로 적어주세요"
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
      </div>

      <div className="section">
        <h2>
          <IconPlug size={16} aria-hidden /> 어댑터
        </h2>
        <AdapterSettings
          value={draft.adapter}
          onChange={(adapter) => set('adapter', adapter)}
          claudeCheck={claudeCheck}
          onRecheckClaude={onRecheckClaude}
        />
      </div>

      <div className="section">
        <h2>
          <IconFileText size={16} aria-hidden /> 지시문 (시스템 프롬프트)
        </h2>
        <textarea
          className="mono"
          rows={5}
          value={draft.instructions}
          placeholder="이 에이전트의 역할, 규칙, 보고 방식을 적어주세요"
          onChange={(e) => set('instructions', e.target.value)}
        />
      </div>

      <div className="section">
        <h2>
          <IconHeartbeat size={16} aria-hidden /> 하트비트와 예산
        </h2>
        <div className="grid-2">
          <Field label={`실행 주기 ${draft.heartbeatMinutes}분`}>
            <input
              type="range"
              min={5}
              max={240}
              step={5}
              value={draft.heartbeatMinutes}
              onChange={(e) => set('heartbeatMinutes', Number(e.target.value))}
            />
          </Field>
          <Field label="월 예산 (USD)" hint={local ? '로컬 모델은 API 비용이 들지 않습니다.' : undefined}>
            <input
              type="number"
              min={0}
              step={10}
              value={draft.monthlyBudget}
              disabled={local}
              onChange={(e) => set('monthlyBudget', Math.max(0, Number(e.target.value)))}
            />
          </Field>
        </div>
        {!local && (
          <div className="usage">
            <div className="usage-row">
              <span className="muted">이번 달 사용량</span>
              <span>
                ${draft.spentThisMonth.toFixed(2)} / ${draft.monthlyBudget.toFixed(0)}
              </span>
            </div>
            <div className="bar">
              <div className={`bar-fill${usage >= 100 ? ' over' : ''}`} style={{ width: `${usage}%` }} />
            </div>
          </div>
        )}
      </div>

      <footer className="detail-footer">
        {dirty && <span className="muted">저장하지 않은 변경 사항이 있습니다.</span>}
        <button onClick={onCancel} disabled={!dirty}>
          취소
        </button>
        <button className="primary" onClick={onSave} disabled={!dirty || nameError || workdirError}>
          저장
        </button>
      </footer>
      {children}
    </section>
  )
}
