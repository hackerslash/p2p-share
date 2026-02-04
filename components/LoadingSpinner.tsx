export default function LoadingSpinner() {
  return (
    <div className="app-shell min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-4 py-2 shadow-sm backdrop-blur">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
        <span className="text-sm font-medium text-muted-foreground">Preparing secure session</span>
      </div>
    </div>
  );
}
