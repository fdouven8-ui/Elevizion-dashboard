import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  backUrl?: string;
  backLabel?: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    try {
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          url: window.location.href,
        }),
      }).catch(() => {});
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      const {
        fallbackTitle = "Er ging iets mis",
        fallbackMessage = "Er ging iets mis bij het laden van deze pagina.",
        backUrl = "/",
        backLabel = "Terug naar overzicht",
      } = this.props;

      return (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <Card className="max-w-md w-full border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-5 w-5" />
                {fallbackTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-red-600">{fallbackMessage}</p>
              {this.state.error && (
                <details className="text-xs text-muted-foreground bg-white rounded p-2 border">
                  <summary className="cursor-pointer font-medium">Technische details</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all overflow-auto max-h-32">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    this.setState({ hasError: false, error: null });
                    window.location.reload();
                  }}
                  data-testid="button-retry"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Opnieuw proberen
                </Button>
                <Link href={backUrl}>
                  <Button variant="outline" size="sm" data-testid="button-back-to-overview">
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    {backLabel}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
