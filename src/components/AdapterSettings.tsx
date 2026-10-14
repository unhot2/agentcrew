import { IconBox, IconCode, IconDeviceDesktop, IconRefresh, IconSparkles } from '@tabler/icons-react'
import { ADAPTERS, CLAUDE_MODELS, defaultAdapterConfig } from '../adapters'
import type { ClaudeCodeStatus } from '../runTypes'
import type { AdapterConfig, AdapterType } from '../types'

export type ClaudeCheck = { phase: 'checking' } | { phase: 'offline' } | { phase: 'done'; status: ClaudeCodeStatus }

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

export function AdapterSettings({ value, onChange, claudeCheck, onRecheckClaude }: SettingsProps) {
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
      {value.type === 'claude-code' && <ClaudeConnection check={claudeCheck} onRecheck={onRecheckClaude} />}
      <AdapterFields value={value} onChange={onChange} />
    </>
  )
}

function AdapterFields({ value, onChange }: Props) {
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
        <div className="grid-3">
          <Field label="모델" hint="비우면 Codex 기본 모델">
            <input
              value={value.model}
              placeholder="기본값"
              onChange={(e) => onChange({ ...value, model: e.target.value })}
            />
          </Field>
          <Field label="샌드박스">
            <select
              value={value.sandbox}
              onChange={(e) => onChange({ ...value, sandbox: e.target.value as typeof value.sandbox })}
            >
              <option value="read-only">read-only</option>
              <option value="workspace-write">workspace-write</option>
              <option value="danger-full-access">danger-full-access</option>
            </select>
          </Field>
          <Field label="승인 정책">
            <select
              value={value.approval}
              onChange={(e) => onChange({ ...value, approval: e.target.value as typeof value.approval })}
            >
              <option value="untrusted">untrusted</option>
              <option value="on-request">on-request</option>
              <option value="never">never</option>
            </select>
          </Field>
        </div>
      )
    case 'lmstudio':
    case 'ollama':
      return (
        <div className="grid-2">
          <Field label="서버 주소">
            <input
              className="mono"
              value={value.baseUrl}
              onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
            />
          </Field>
          <Field label="모델">
            <input
              className="mono"
              value={value.model}
              placeholder={value.type === 'ollama' ? 'llama3.1:8b' : 'qwen2.5-coder-7b-instruct'}
              onChange={(e) => onChange({ ...value, model: e.target.value })}
            />
          </Field>
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
      )
  }
}

function ClaudeConnection({ check, onRecheck }: { check: ClaudeCheck; onRecheck: () => void }) {
  let tone: 'ok' | 'warn' | 'muted' = 'muted'
  let text = '연결 상태를 확인하는 중…'
  if (check.phase === 'offline') {
    tone = 'warn'
    text = '서버에 연결하지 못했습니다. npm run dev로 실행하세요.'
  } else if (check.phase === 'done') {
    const s = check.status
    if (!s.installed) {
      tone = 'warn'
      text = 'Claude Code CLI(claude)를 찾을 수 없습니다. 설치 후 다시 확인하세요.'
    } else if (!s.loggedIn) {
      tone = 'warn'
      text = `${s.version} 설치됨 · 로그인 안 됨. 터미널에서 claude auth login을 실행하세요.`
    } else {
      tone = 'ok'
      const plan = s.subscriptionType ? ` (${s.subscriptionType})` : ''
      text = `${s.version} · ${s.email ?? '로그인됨'}${plan} 계정으로 실행됩니다.`
    }
  }
  return (
    <div className={`connection connection-${tone}`}>
      <span className={`dot ${tone === 'ok' ? 'status-running' : tone === 'warn' ? 'status-over-budget' : 'status-paused'}`} />
      <span className="connection-text">{text}</span>
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
