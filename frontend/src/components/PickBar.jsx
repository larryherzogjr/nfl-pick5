export default function PickBar({ count, onSubmit, isSubmitting, isDirty }) {
  const complete = count === 5;
  const disabled = !isDirty || isSubmitting;

  const handleClick = () => {
    if (disabled) return;
    if (count < 5) {
      const ok = window.confirm(
        `You have ${count} of 5 picks. Submit anyway?`,
      );
      if (!ok) return;
    }
    onSubmit();
  };

  const counterClass = complete
    ? 'text-sm font-bold text-green-700'
    : 'text-sm font-medium text-slate-700';

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white shadow-[0_-1px_4px_rgba(0,0,0,0.04)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <span className={counterClass}>{count} of 5 picks made</span>
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className="min-h-[44px] rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSubmitting ? 'Saving...' : 'Submit Picks'}
        </button>
      </div>
    </div>
  );
}
