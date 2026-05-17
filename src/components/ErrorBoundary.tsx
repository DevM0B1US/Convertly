import { Component, ErrorInfo, ReactNode } from "react";

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
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Convertly] Uncaught render error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            width: "100vw",
            backgroundColor: "var(--bg-color, #111827)",
            color: "var(--text-color, #F9FAFB)",
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              marginBottom: "0.75rem",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              opacity: 0.7,
              maxWidth: "400px",
              lineHeight: 1.6,
              marginBottom: "1.5rem",
            }}
          >
            Convertly encountered an unexpected error. Your files are safe — no
            data was lost. Click below to restart the application.
          </p>
          <p
            style={{
              fontSize: "0.75rem",
              opacity: 0.4,
              fontFamily: "'JetBrains Mono', monospace",
              maxWidth: "500px",
              wordBreak: "break-all",
              marginBottom: "1.5rem",
            }}
          >
            {this.state.error?.message}
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: "0.75rem 2rem",
              backgroundColor: "#0A7C6E",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: "pointer",
              transition: "background-color 0.15s",
            }}
            onMouseOver={(e) =>
              ((e.target as HTMLButtonElement).style.backgroundColor = "#086B5F")
            }
            onMouseOut={(e) =>
              ((e.target as HTMLButtonElement).style.backgroundColor = "#0A7C6E")
            }
          >
            Reload Convertly
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
