import { useState } from 'react'
import { IconDownload } from '@tabler/icons-react'
import { api, type ServerState } from '../api'
import { Field } from '../components/AdapterSettings'
import { isAbsolutePath } from '../store'
import type { Settings } from '../types'

type Props = {
  data: ServerState
  onSaved: (settings: Settings) => void
}

export function SettingsPage({ data, onSaved }: Props) {
  const [draft, setDraft] = useState<Settings>(data.settings)
  const [message, setMessage] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings)
  const baseError = draft.workspaceBase.trim() !== '' && !isAbsolutePath(draft.workspaceBase.trim())
  const prefixError = !/^[A-Za-z]{1,6}$/.test(draft.taskPrefix.trim())

  const save = async () => {
    try {
      const saved = await api.saveSettings(draft)
      setDraft(saved)
      onSaved(saved)
      setMessage('저장했습니다.')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  return (
    <main className="page settings">
      <section className="card">
        <header className="card-header">
          <h2>자동 실행</h2>
        </header>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.automationEnabled}
            onChange={(e) => setDraft({ ...draft, automationEnabled: e.target.checked })}
          />
          <span>
            하트비트와 반복 업무 켜기
            <span className="muted"> · 끄면 모든 자동 실행이 멈추고, 직접 누르는 실행만 됩니다</span>
          </span>
        </label>
      </section>

      <section className="card">
        <header className="card-header">
          <h2>기본값</h2>
        </header>
        <div className="grid-2">
          <Field
            label="새 에이전트의 작업 디렉터리"
            hint={baseError ? '절대 경로를 입력하세요.' : '에이전트를 새로 만들 때 이 경로로 채워집니다.'}
          >
            <input
              className="mono"
              value={draft.workspaceBase}
              aria-invalid={baseError}
              onChange={(e) => setDraft({ ...draft, workspaceBase: e.target.value })}
            />
          </Field>
          <Field label="작업 번호 앞 글자" hint={prefixError ? '영문 1~6자로 입력하세요.' : `예: ${draft.taskPrefix || 'AC'}-12`}>
            <input
              className="mono"
              value={draft.taskPrefix}
              aria-invalid={prefixError}
              onChange={(e) => setDraft({ ...draft, taskPrefix: e.target.value.toUpperCase() })}
            />
          </Field>
        </div>
      </section>

      <div className="detail-footer">
        {message && <span className="muted">{message}</span>}
        <button onClick={() => setDraft(data.settings)} disabled={!dirty}>
          취소
        </button>
        <button className="primary" onClick={save} disabled={!dirty || baseError || prefixError}>
          저장
        </button>
      </div>

      <section className="card">
        <header className="card-header">
          <h2>데이터</h2>
        </header>
        <p className="muted">
          모든 데이터는 이 PC의 data/agentcrew.json 파일에 저장됩니다. 백업 파일에는 연결의 토큰과 주소가 들어가지 않습니다.
        </p>
        <a className="button-link" href="/api/export" download>
          <IconDownload size={14} aria-hidden /> 백업 내려받기
        </a>
      </section>
    </main>
  )
}
