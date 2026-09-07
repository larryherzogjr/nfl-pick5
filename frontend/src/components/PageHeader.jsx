export default function PageHeader({ eyebrow, title, description, children }) {
  return (
    <header className="field-banner">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-6 px-4 py-7 sm:px-7 sm:py-9">
        <div>
          {eyebrow && <p className="eyebrow text-white/80">{eyebrow}</p>}
          <h1 className="page-title mt-2">{title}</h1>
          {description && (
            <p className="mt-3 text-sm text-white/90">{description}</p>
          )}
        </div>
        {children}
      </div>
    </header>
  );
}
