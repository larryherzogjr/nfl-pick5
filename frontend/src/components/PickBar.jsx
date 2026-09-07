export default function PickBar({
  count,
  onSubmit,
  isSubmitting,
  isDirty,
  disabled = false,
  notice,
}) {
  const cannotSave = disabled || !isDirty || isSubmitting;
  const handleClick = () => {
    if (cannotSave) return;
    if (
      count < 5 &&
      !window.confirm(`You have ${count} of 5 picks. Save anyway?`)
    )
      return;
    onSubmit();
  };
  return (
    <div className="pick-footer fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pt-4 shadow-[0_-2px_12px_rgba(16,46,36,0.04)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 sm:px-7">
        <div className="min-w-0">
          <div className="mb-2 flex gap-1.5" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 w-6 ${i < count ? "bg-field" : "bg-slate-200"}`}
              />
            ))}
          </div>
          <p className="text-sm font-bold text-slate-900">
            {count} of 5 picks selected
          </p>
          <p className="mt-1 text-xs text-slate-500" role="status">
            {notice ||
              (disabled
                ? "Picks unavailable"
                : isSubmitting
                  ? "Saving your picks…"
                  : isDirty
                    ? "Unsaved changes"
                    : count
                      ? "Saved · editable until kickoff"
                      : "Choose up to five games")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={cannotSave}
          className="min-h-[48px] shrink-0 rounded-md bg-gold px-5 py-3 text-sm font-bold text-slate-900 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 sm:px-7"
        >
          {isSubmitting ? "Saving…" : "Save picks"}
        </button>
      </div>
    </div>
  );
}
