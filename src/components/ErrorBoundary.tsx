import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Captura errores de render para que un fallo en una parte de la app no deje la
 * pantalla en blanco. Muestra un aviso y permite recargar.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error de render capturado por ErrorBoundary:", error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary__box">
            <h2>Algo salió mal en la interfaz</h2>
            <p>
              Se produjo un error inesperado al mostrar esta pantalla. Los datos no se han perdido;
              puedes reintentar o recargar la página.
            </p>
            <pre className="error-boundary__detail">{this.state.error.message}</pre>
            <div className="stack compact actions-row">
              <button type="button" className="primary" onClick={this.handleReset}>
                Reintentar
              </button>
              <button type="button" onClick={() => window.location.reload()}>
                Recargar página
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
