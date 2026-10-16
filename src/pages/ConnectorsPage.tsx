import { useState } from 'react'
import { IconBrandGithub, IconBrandSlack, IconTrash, IconWebhook } from '@tabler/icons-react'
import { api, type ServerState } from '../api'
import { Field } from '../components/AdapterSettings'
import type { Connector, ConnectorType } from '../types'

const META: Record<ConnectorType, { label: string; icon: typeof IconWebhook; secretLabel: string; placeholder: string; help: string }> = {
  github: {
    label: 'GitHub',
    icon: IconBrandGithub,
    secretLabel: '개인 액세스 토큰',
    placeholder: 'github_pat_...',
    help: '에이전트를 실행할 때 GH_TOKEN, GITHUB_TOKEN 환경 변수로 넘겨서 gh CLI와 git이 이 계정으로 동작합니다.',
  },
  slack: {
    label: 'Slack',
    icon: IconBrandSlack,
    secretLabel: 'Incoming Webhook 주소',
    placeholder: 'https://hooks.slack.com/services/...',
    help: '실행 완료, 실패, 승인 요청이 생기면 이 채널로 알림을 보냅니다.',
  },
  webhook: {
    label: '웹훅',
    icon: IconWebhook,
    secretLabel: '받을 주소',
    placeholder: 'https://example.com/agentcrew',
    help: '실행 완료, 실패, 승인 요청이 생기면 이 주소로 JSON을 POST합니다.',
  },
}

type Props = {
  data: ServerState
  onAdd: (type: ConnectorType) => void
  onChange: (id: string, patch: Partial<Connector>, now?: boolean) => void
  onDelete: (id: string) => void
}

export function ConnectorsPage({ data, onAdd, onChange, onDelete }: Props) {
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string }>>({})

  const test = async (c: Connector) => {
    setResults((r) => ({ ...r, [c.id]: { ok: true, text: '확인하는 중…' } }))
    try {
      const { message } = await api.testConnector(c.id)
      setResults((r) => ({ ...r, [c.id]: { ok: true, text: message } }))
    } catch (err) {
      setResults((r) => ({ ...r, [c.id]: { ok: false, text: (err as Error).message } }))
    }
  }

  const remove = (c: Connector) => {
    if (window.confirm(`${c.name} 연결을 삭제할까요? 저장한 토큰이나 주소도 지워집니다.`)) onDelete(c.id)
  }

  return (
    <main className="page">
      <p className="muted page-intro">
        토큰과 주소는 이 PC의 데이터 파일(data/agentcrew.json)에만 저장되고 화면에는 다시 보여주지 않습니다.
      </p>
      <div className="add-row">
        {(Object.keys(META) as ConnectorType[]).map((type) => {
          const Icon = META[type].icon
          return (
            <button key={type} onClick={() => onAdd(type)}>
              <Icon size={16} aria-hidden /> {META[type].label} 추가
            </button>
          )
        })}
      </div>
      {data.connectors.length === 0 && <p className="muted">아직 연결이 없습니다.</p>}
      <div className="connector-grid">
        {data.connectors.map((c) => {
          const meta = META[c.type]
          const Icon = meta.icon
          const result = results[c.id]
          return (
            <section key={c.id} className="card">
              <header className="card-header">
                <h2>
                  <Icon size={16} aria-hidden /> {meta.label}
                </h2>
                <button className="icon-button danger" aria-label="삭제" title="삭제" onClick={() => remove(c)}>
                  <IconTrash size={16} />
                </button>
              </header>
              <p className="muted">{meta.help}</p>
              <Field label="이름">
                <input value={c.name} onChange={(e) => onChange(c.id, { name: e.target.value })} />
              </Field>
              <Field label={meta.secretLabel} hint={c.hasSecret ? '저장돼 있습니다. 바꾸려면 새로 입력하세요.' : undefined}>
                <input
                  type="password"
                  autoComplete="off"
                  value={c.secret}
                  placeholder={c.hasSecret ? '••••••••' : meta.placeholder}
                  onChange={(e) => onChange(c.id, { secret: e.target.value })}
                />
              </Field>
              <div className="run-actions">
                {result && <span className={result.ok ? 'muted' : 'error-text'}>{result.text}</span>}
                <label className="check">
                  <input type="checkbox" checked={c.enabled} onChange={(e) => onChange(c.id, { enabled: e.target.checked }, true)} />
                  <span>사용</span>
                </label>
                <button onClick={() => test(c)} disabled={!c.hasSecret && !c.secret}>
                  연결 확인
                </button>
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
