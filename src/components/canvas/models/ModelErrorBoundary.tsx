import type { ReactNode } from "react"
import { Component } from "react"

interface Props {
  fallback?: ReactNode
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ModelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}
