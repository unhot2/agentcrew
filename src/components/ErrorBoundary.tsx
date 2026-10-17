import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; resetKey: string }
type State = { error: Error | null }

/** 화면 하나에서 오류가 나도 앱 전체가 하얗게 멈추지 않게, 그 화면 자리에 오류를 보여준다 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props) {
    // 다른 메뉴로 옮기면 다시 그려 본다
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="page">
        <div className="notice error-notice" role="alert">
          <span>이 화면을 그리다 오류가 났습니다: {this.state.error.message}</span>
          <button onClick={() => window.location.reload()}>새로고침</button>
        </div>
      </main>
    )
  }
}
