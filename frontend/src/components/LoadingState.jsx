export default function LoadingState({ label, size = "md", className = "" }) {
  const dim = size === "sm" ? "h-5 w-5 border-[3px]" : "h-8 w-8 border-4";
  const pad = size === "sm" ? "py-6" : "py-12";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-2 ${pad} ${className}`}
    >
      <div
        className={`${dim} animate-spin rounded-full border-slate-300 border-t-slate-700`}
      />
      {label && <span className="text-sm text-slate-500">{label}</span>}
      {!label && <span className="sr-only">Loading…</span>}
    </div>
  );
}
