// Global error suppressor for Supabase tab-lock issue
window.addEventListener("error", (event) => {
  if (
    event?.message?.includes("LockManager") ||
    event?.message?.includes("navigator.locks")
  ) {
    event.preventDefault();
    console.warn("Suppressed Supabase lock error:", event.message);
  }
});
class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.error("App crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return <h1>Noe gikk galt.</h1>;
    }

    return this.props.children;
  }
}
