import CountdownTimer from "./CountdownTimer";

function formatKickoff(iso) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatSpread(spread) {
  if (spread === null || spread === undefined) return "—";
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : `${spread}`;
}

function pointsBadge(points) {
  if (points === 2)
    return { text: "✓ 2 pts", className: "bg-green-100 text-green-800" };
  if (points === 1)
    return { text: "✓ 1 pt", className: "bg-green-100 text-green-800" };
  return { text: "✗ 0 pts", className: "bg-red-100 text-red-700" };
}

function buttonClass(selected, locked) {
  const base =
    "flex-1 min-h-[44px] rounded-md border px-3 py-3 text-sm font-medium transition select-none";
  if (locked) {
    if (selected) {
      return `${base} cursor-not-allowed border-slate-300 bg-slate-200 text-slate-500`;
    }
    return `${base} cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400`;
  }
  if (selected) {
    return `${base} border-slate-900 bg-slate-900 text-white`;
  }
  return `${base} border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100`;
}

export default function GameCard({
  game,
  currentPick,
  selectedSide,
  onPickChange,
}) {
  const kickoffMs = new Date(game.kickoff).getTime();
  const locked = game.is_locked || Date.now() >= kickoffMs;
  const spread = game.spread_home;
  const isWholeSpread =
    spread !== null && spread !== undefined && Number.isInteger(spread);

  const buttons = [
    { side: "away", label: "Away" },
    { side: "home", label: "Home" },
  ];
  if (isWholeSpread) {
    buttons.push({ side: "push", label: "Push (2x)" });
  }

  const hasGrade =
    currentPick &&
    currentPick.points_awarded !== null &&
    currentPick.points_awarded !== undefined;
  const badge = hasGrade ? pointsBadge(currentPick.points_awarded) : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-slate-900">
            <span className="text-slate-500">{game.away_abbr}</span>{" "}
            <span className="font-normal text-slate-400">@</span>{" "}
            <span>{game.home_abbr}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-500">
            {game.away_team} @ {game.home_team}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span>{formatKickoff(game.kickoff)}</span>
            <span className="font-medium text-slate-800">
              {game.home_abbr} {formatSpread(spread)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {locked ? (
            <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
              LOCKED
            </span>
          ) : (
            <CountdownTimer kickoff={game.kickoff} />
          )}
          {badge && (
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${badge.className}`}
            >
              {badge.text}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {buttons.map((b) => (
          <button
            key={b.side}
            type="button"
            disabled={locked}
            onClick={() => onPickChange(b.side)}
            className={buttonClass(selectedSide === b.side, locked)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
