// Stopper Supabase lock-feil før React starter
window.addEventListener("error", (event) => {
  if (
    event?.message?.includes("LockManager") ||
    event?.message?.includes("navigator.locks")
  ) {
    event.preventDefault();
    console.warn("Suppressed error:", event.message);
  }
});
