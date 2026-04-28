import { Component, ErrorInfo, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { logError } from '@/utils/errorLog';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(error, 'boundary');
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg w-full space-y-4 rounded-xl border border-destructive/40 bg-card p-6">
          <h2 className="text-lg font-semibold text-destructive">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          {this.state.error.stack && (
            <pre className="text-xs bg-muted/30 p-3 rounded overflow-auto max-h-60">{this.state.error.stack}</pre>
          )}
          <div className="flex gap-2">
            <Button onClick={this.reset}>Try again</Button>
            <Button asChild variant="outline"><Link to="/errors">View error log</Link></Button>
          </div>
        </div>
      </div>
    );
  }
}
