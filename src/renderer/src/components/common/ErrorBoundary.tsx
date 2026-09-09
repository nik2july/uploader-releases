import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Baawaray App Error Boundary caught:', error, errorInfo);
  }

  public handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f9f8f6] flex items-center justify-center p-6 text-center font-sans">
          <div className="max-w-md w-full bg-white rounded-2xl border border-[#d4c1a3] p-8 shadow-xl">
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-[#7a2e33] mb-4">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-[#111417] mb-2 font-tan-moncheri tracking-wider">
              BAAWARAY FILMS
            </h2>
            <p className="text-sm text-[#6b6660] mb-6">
              A temporary sync or display interruption occurred. Click below to refresh your workspace.
            </p>
            <button
              onClick={this.handleReload}
              className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#7a2e33] text-white font-bold text-sm hover:bg-[#5e0d1e] transition-colors cursor-pointer shadow-md"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Studio Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
