import { useEffect, useRef, useState } from 'react'

type Request = { message: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void }

let show: ((req: Request) => void) | null = null

/**
 * 브라우저 기본 확인창(window.confirm) 대신 쓰는 확인창.
 * 앱 안 브라우저처럼 기본 확인창이 막힌 곳에서는 confirm이 바로 false를 돌려줘서 삭제가 안 되므로 직접 그린다
 */
export function askConfirm(message: string, options: { confirmLabel?: string; danger?: boolean } = {}) {
  const { confirmLabel = '삭제', danger = true } = options
  return new Promise<boolean>((resolve) => {
    if (!show) return resolve(window.confirm(message))
    show({ message, confirmLabel, danger, resolve })
  })
}

/** 앱에 한 번만 둔다 */
export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    show = (req) =>
      setRequest((prev) => {
        // 이미 떠 있는 확인창은 취소로 닫는다
        prev?.resolve(false)
        return req
      })
    return () => {
      show = null
    }
  }, [])

  useEffect(() => {
    if (!request) return
    confirmButton.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [request])

  const close = (ok: boolean) => {
    request?.resolve(ok)
    setRequest(null)
  }

  if (!request) return null
  return (
    <div className="confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-message">
        <p id="confirm-message">{request.message}</p>
        <div className="confirm-actions">
          <button onClick={() => close(false)}>취소</button>
          <button ref={confirmButton} className={request.danger ? 'danger-solid' : 'primary'} onClick={() => close(true)}>
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
