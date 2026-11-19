import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || 'Erro desconhecido de renderização.';

      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 select-none">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border-2 border-rose-500/40 p-6 sm:p-8 shadow-2xl text-center space-y-5">
            <div className="w-16 h-16 rounded-3xl bg-rose-500/15 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center shadow-lg">
              <AlertTriangle className="w-8 h-8 stroke-[2.5]" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-black text-white">
                {this.props.fallbackTitle || 'Ocorreu um erro nesta tela'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Não se preocupe, seus dados estão seguros. Você pode tentar recarregar ou voltar para a tela principal da conferência.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-left overflow-x-auto max-h-32">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block mb-1">
                  Detalhes do erro:
                </span>
                <code className="text-xs text-slate-300 font-mono break-all">
                  {errorMsg}
                </code>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 stroke-[2.5]" />
                <span>Tentar Novamente</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
                <span>Recarregar App</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
