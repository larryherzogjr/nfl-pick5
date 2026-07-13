function extractMessage(error, fallback) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  const data = error?.response?.data;
  if (data) {
    if (typeof data === "string") return data;
    if (typeof data.error === "string") return data.error;
    if (typeof data.message === "string") return data.message;
  }
  if (typeof error.message === "string") return error.message;
  return fallback;
}

export default function ErrorState({
  error,
  message,
  title,
  onRetry,
  variant = "error",
  className = "",
}) {
  const isNotFound = variant === "notFound";
  const resolvedTitle =
    title ?? (isNotFound ? "Not found" : "Something went wrong");
  const resolvedMessage =
    message ??
    extractMessage(
      error,
      isNotFound
        ? "We couldn’t find what you were looking for."
        : "Please try again in a moment.",
    );

  const containerClass = isNotFound
    ? "rounded-lg bg-white p-8 text-center shadow-sm ring-1 ring-slate-200"
    : "rounded-md bg-red-50 p-4 text-left ring-1 ring-red-200";
  const titleClass = isNotFound
    ? "text-lg font-semibold text-slate-900"
    : "text-sm font-semibold text-red-800";
  const bodyClass = isNotFound
    ? "mt-2 text-sm text-slate-600"
    : "mt-1 text-sm text-red-700";

  return (
    <div role="alert" className={`${containerClass} ${className}`}>
      <p className={titleClass}>{resolvedTitle}</p>
      <p className={bodyClass}>{resolvedMessage}</p>
      {onRetry && !isNotFound && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[44px] rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
