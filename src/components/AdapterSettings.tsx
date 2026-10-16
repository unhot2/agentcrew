import { useEffect, useState } from 'react'
import { IconBox, IconCode, IconDeviceDesktop, IconRefresh, IconSparkles } from '@tabler/icons-react'
import { ADAPTERS, CLAUDE_MODELS, defaultAdapterConfig } from '../adapters'
import type { AdapterStatus } from '../runTypes'
import type { AdapterConfig, AdapterType } from '../types'

export type ClaudeCheck = { phase: 'checking' } | { phase: 'offline' } | { phase: 'done'; status: AdapterStatus }

const ICONS: Record<AdapterType, typeof IconCode> = {
  'claude-code': IconSparkles,
  codex: IconCode,
  lmstudio: IconDeviceDesktop,
  ollama: IconBox,
}

type Props = {
  value: AdapterConfig
  onChange: (next: AdapterConfig) => void
}

type SettingsProps = Props & {
  claudeCheck: ClaudeCheck
  onRecheckClaude: () => void
}

/** Codex와 로컬 모델 서버의 연결 상태. 로컬 모델은 주소가 바뀌면 잠시 뒤 다시 확인한다 */
function useAdapterStatus(value: AdapterConfig) {
  const [check, setCheck] = useState<ClaudeCheck>({ phase: 'checking' })
  const [nonce, setNonce] = useState(0)
  const local = value.type === 'lmstudio' || value.type === 'ollama'
  const key = value.type === 'codex' ? 'codex' : local ? `${value.type}:${value.baseUrl}` : ''

  useEffect(() => {
    if (!key) return
    setCheck({ phase: 'checking' })
    let cancelled = false
    const url =
      value.type === 'codex'
        ? '/api/adapters/codex/status'
        : `/api/adapters/local/status?type=${value.type}&base=${encodeURIComponent((value as { baseUrl: string }).baseUrl)}`
    const timer = setTimeout(() => {
      fetch(url)
        .then(async (r) => {
          const body = await r.json()
          if (!r.ok) throw new Error(body.error)
          return body as AdapterStatus
        })
        .then((status) => !cancelled && setCheck({ phase: 'done', status }))
        .catch((err: Error) =>
          !cancelled && setCheck({ phase: 'done', status: { installed: false, version: null, loggedIn: false, error: err.message } }),
        )
    }, local ? 500 : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, nonce])

  return { check, recheck: () => setNonce((n) => n + 1) }
}

export function AdapterSettings({ value, onChange, claudeCheck, onRecheckClaude }: SettingsProps) {
  const other = useAdapterStatus(value)
  const check = value.type === 'claude-code' ? claudeCheck : other.check
  const recheck = value.type === 'claude-code' ? onRecheckClaude : other.recheck
  const models = check.phase === 'done' ? (check.status.models ?? []) : []

  return (
    <>
      <div className="adapter-grid" role="radiogroup" aria-label="어댑터">
        {ADAPTERS.map((a) => {
          const Icon = ICONS[a.type]
          const selected = a.type === value.type
          return (
            <button
              key={a.type}
              role="radio"
              aria-checked={selected}
              className={`adapter-card${selected ? ' selected' : ''}`}
              onClick={() => !selected && onChange(defaultAdapterConfig(a.type))}
            >
              <span className="adapter-card-title">
                <Icon size={16} aria-hidden /> {a.label}
              </span>
              <span className="adapter-card-sub">{a.description}</span>
            </button>
          )
        })}
      </div>
      <Connection
        type={value.type}
        check={check}
        onRecheck={recheck}
        onUseBase={(baseUrl) => (value.type === 'lmstudio' || value.type === 'ollama') && onChange({ ...value, baseUrl })}
      />
      <AdapterFields value={value} onChange={onChange} models={models} />
    </>
  )
}

function AdapterFields({ value, onChange, models }: Props & { models: string[] }) {
  switch (value.type) {
    case 'claude-code':
      return (
        <div className="grid-2">
          <Field label="모델">
            <select value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })}>
              <option value="">CLI 기본 모델</option>
              {CLAUDE_MODELS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="권한 모드">
            <select
              value={value.permissionMode}
              onChange={(e) => onChange({ ...value, permissionMode: e.target.value as typeof value.permissionMode })}
            >
              <option value="default">default (매번 확인)</option>
              <option value="acceptEdits">acceptEdits (편집 자동 승인)</option>
              <option value="plan">plan (계획만)</option>
              <option value="bypassPermissions">bypassPermissions (전부 허용)</option>
            </select>
          </Field>
        </div>
      )
    case 'codex':
      return (
        <div className="grid-2">
          <Field label="모델" hint="비우면 Codex에 설정된 기본 모델">
            <input value={value.model} placeholder="기본값" onChange={(e) => onChange({ ...value, model: e.target.value })} />
          </Field>
          <Field label="샌드박스" hint="화면 없이 실행하므로 중간에 승인을 묻지 않습니다.">
            <select
              value={value.sandbox}
              onChange={(e) => onChange({ ...value, sandbox: e.target.value as typeof value.sandbox })}
            >
              <option value="read-only">read-only (읽기만)</option>
              <option value="workspace-write">workspace-write (작업 폴더에 쓰기)</option>
              <option value="danger-full-access">danger-full-access (전부 허용)</option>
            </select>
          </Field>
        </div>
      )
    case 'lmstudio':
    case 'ollama':
      return (
        <>
          <div className="grid-2">
            <Field label="서버 주소">
              <input className="mono" value={value.baseUrl} onChange={(e) => onChange({ ...value, baseUrl: e.target.value })} />
            </Field>
            <ModelPicker
              models={models}
              value={value.model}
              placeholder={value.type === 'ollama' ? 'qwen3:8b' : 'qwen2.5-coder-7b-instruct'}
              onChange={(model) => onChange({ ...value, model })}
            />
            <Field label={`Temperature ${value.temperature.toFixed(1)}`}>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={value.temperature}
                onChange={(e) => onChange({ ...value, temperature: Number(e.target.value) })}
              />
            </Field>
          </div>
          <p className="muted">
            로컬 모델은 작업 폴더 안에서 파일 목록 보기, 읽기, 쓰기 도구만 쓸 수 있습니다. 도구를 지원하지 않는 모델은 글로만
            답합니다.
          </p>
        </>
      )
  }
}

const CUSTOM = '__custom__'

type ModelPickerProps = { models: string[]; value: string; placeholder: string; onChange: (model: string) => void }

/** 서버에 받아 둔 모델은 선택 상자로 고르고, 목록에 없는 모델은 직접 입력한다 */
function ModelPicker({ models, value, placeholder, onChange }: ModelPickerProps) {
  const [typing, setTyping] = useState(false)
  // 목록에 없는 모델이 저장돼 있으면 직접 입력 칸을 보여준다
  const custom = typing || (value !== '' && !models.includes(value)) || models.length === 0

  return (
    <Field label="모델" hint={models.length ? `받아 둔 모델 ${models.length}개` : '서버에 받아 둔 모델이 없으면 직접 입력하세요.'}>
      {models.length > 0 && (
        <select
          value={custom ? CUSTOM : value}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setTyping(true)
              return
            }
            setTyping(false)
            onChange(e.target.value)
          }}
        >
          {value === '' && !typing && <option value="">모델을 고르세요</option>}
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value={CUSTOM}>직접 입력…</option>
        </select>
      )}
      {custom && (
        <input className="mono" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  )
}

const NAMES: Record<AdapterType, string> ={ 'claude-code': 'Claude Code', codex: 'Codex', lmstudio: 'LM Studio', ollama: 'Ollama' }

type ConnectionProps = {
  type: AdapterType
  check: ClaudeCheck
  onRecheck: () => void
  onUseBase: (baseUrl: string) => void
}

function Connection({ type, check, onRecheck, onUseBase }: ConnectionProps) {
  const suggested = check.phase === 'done' ? check.status.suggestedBaseUrl : undefined
  const local = type === 'lmstudio' || type === 'ollama'
  let tone: 'ok' | 'warn' | 'muted' = 'muted'
  let text = '연결 상태를 확인하는 중…'
  if (check.phase === 'offline') {
    tone = 'warn'
    text = '서버에 연결하지 못했습니다. npm run dev로 실행하세요.'
  } else if (check.phase === 'done') {
    const s = check.status
    if (local) {
      tone = s.loggedIn ? 'ok' : 'warn'
      // 앱을 켜도 API 서버는 따로 켜야 하는 경우가 많아서 켜는 방법을 같이 알려준다
      const howTo =
        type === 'lmstudio'
          ? 'LM Studio 앱의 Developer 탭에서 서버(Status)를 Running으로 켜세요. 터미널에서는 lms server start.'
          : 'Ollama 앱을 실행하거나 터미널에서 ollama serve를 실행하세요.'
      text = s.loggedIn
        ? `${NAMES[type]} 서버에 연결됐습니다. 받아 둔 모델 ${s.models?.length ?? 0}개.${s.models?.length ? '' : ' 모델을 먼저 받아 주세요.'}`
        : s.suggestedBaseUrl
          ? `이 주소에는 서버가 없지만 ${s.suggestedBaseUrl}에서 ${NAMES[type]} 서버를 찾았습니다.`
          : `${NAMES[type]} 서버에 연결하지 못했습니다. ${howTo}`
    } else if (!s.installed) {
      tone = 'warn'
      text = `${NAMES[type]} CLI를 찾을 수 없습니다. 설치 후 다시 확인하세요.`
    } else if (!s.loggedIn) {
      tone = 'warn'
      const login = type === 'codex' ? 'codex login' : 'claude auth login'
      text = `${s.version} 설치됨 · 로그인 안 됨. 터미널에서 ${login}을 실행하세요.`
    } else {
      tone = 'ok'
      text = `${s.version} · ${s.account ?? '로그인됨'}${type === 'codex' ? ' · 비용은 Codex 요금제에서 차감되어 여기에는 $0으로 기록됩니다.' : ' 계정으로 실행됩니다.'}`
    }
  }
  return (
    <div className={`connection connection-${tone}`}>
      <span className={`dot ${tone === 'ok' ? 'status-running' : tone === 'warn' ? 'status-over-budget' : 'status-paused'}`} />
      <span className="connection-text">{text}</span>
      {suggested && (
        <button className="connection-action" onClick={() => onUseBase(suggested)}>
          이 주소 쓰기
        </button>
      )}
      <button className="icon-button" aria-label="다시 확인" title="다시 확인" onClick={onRecheck}>
        <IconRefresh size={14} />
      </button>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}
