import { Component, Fragment, type ReactNode } from 'react';

type Props = { children: ReactNode; onError?: (e: Error) => void; fallback?: (msg: string, reload: () => void) => ReactNode };
type State = { key: number; failed: boolean; msg: string; stuck: boolean };

/**
 * Fängt Abstürze beim Zeichnen ab. Statt eines leeren grauen Bildschirms wird der betroffene Teil neu aufgebaut;
 * `onError` kann dabei den Spielstand bereinigen (im Koop: frischen Stand vom Server holen).
 * Häufen sich Abstürze kurz hintereinander, bleibt ein Hinweis mit „Neu laden“ stehen.
 */
export class Recover extends Component<Props, State> {
  state: State = { key: 0, failed: false, msg: '', stuck: false };
  private times: number[] = [];

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { failed: true, msg: error?.message ?? String(error) };
  }

  componentDidCatch(error: Error) {
    console.error('Absturz abgefangen:', error);
    const now = Date.now();
    this.times = [...this.times.filter((t) => now - t < 15000), now];
    try {
      this.props.onError?.(error);
    } catch {
      /* Bereinigen darf den Neuaufbau nicht verhindern */
    }
    const stuck = this.times.length >= 4;
    // kurz warten, damit eine Bereinigung (z. B. frischer Koop-Stand) vor dem Neuaufbau ankommt
    setTimeout(() => this.setState((s) => ({ key: s.key + 1, failed: false, stuck })), stuck ? 0 : 300);
  }

  render() {
    if (this.state.stuck && this.props.fallback) return this.props.fallback(this.state.msg, () => location.reload());
    if (this.state.failed) return null;
    return <Fragment key={this.state.key}>{this.props.children}</Fragment>;
  }
}
