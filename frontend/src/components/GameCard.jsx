import { useEffect, useState } from "react";
import CountdownTimer from "./CountdownTimer";
import TeamLogo from "./TeamLogo";

function formatKickoff(iso) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}
function formatSpread(spread) {
  if (spread == null) return "—";
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : `${spread}`;
}
function formatPickLine(pick, game) {
  const line = pick.spread_at_pick;
  if (pick.picked_side === "push")
    return `Push · ${game.home_abbr} ${formatSpread(line)}`;
  return pick.picked_side === "home"
    ? `${game.home_abbr} ${formatSpread(line)}`
    : `${game.away_abbr} ${formatSpread(line == null ? null : -line)}`;
}

export default function GameCard({
  game,
  currentPick,
  selectedSide,
  onPickChange,
  isSaving = false,
}) {
  const kickoffMs = new Date(game.kickoff).getTime();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const remaining = kickoffMs - Date.now();
    if (remaining <= 0) return;
    // Long delays exceed browser timer limits; reschedule until kickoff.
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(remaining + 25, 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [kickoffMs, now]);
  const locked = game.is_locked || game.is_final || now >= kickoffMs;
  const currentSpread = game.spread_home;
  const spread =
    locked && currentPick?.spread_at_pick != null
      ? currentPick.spread_at_pick
      : currentSpread;
  const hasLine = spread != null;
  const buttons = [
    {
      side: "away",
      label: `${game.away_abbr} ${formatSpread(hasLine ? -spread : null)}`,
    },
    { side: "home", label: `${game.home_abbr} ${formatSpread(spread)}` },
  ];
  if (
    (hasLine && Number.isInteger(spread)) ||
    (locked && currentPick?.picked_side === "push")
  )
    buttons.push({ side: "push", label: "Push · 2 pts" });
  const hasGrade = currentPick?.points_awarded != null;
  const points = currentPick?.points_awarded;
  const hasScores =
    game.is_final && game.score_away != null && game.score_home != null;
  return (
    <article
      className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 sm:p-5"
      aria-label={`${game.away_team} at ${game.home_team}`}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <time dateTime={game.kickoff}>{formatKickoff(game.kickoff)}</time>
        {locked ? (
          <span className="rounded bg-slate-100 px-2 py-1 font-bold uppercase tracking-wide text-slate-600">
            {game.is_final ? "Final" : "Locked"}
          </span>
        ) : (
          <CountdownTimer kickoff={game.kickoff} />
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <TeamLogo abbreviation={game.away_abbr} />
          <div className="mt-2 font-display text-3xl tracking-wide">
            {game.away_abbr}
            {hasScores && (
              <span className="ml-3 tabular-nums">{game.score_away}</span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">{game.away_team}</div>
        </div>
        <span className="text-xs font-medium text-slate-500">AT</span>
        <div className="flex min-w-0 flex-1 flex-col items-end text-right">
          <TeamLogo abbreviation={game.home_abbr} />
          <div className="mt-2 font-display text-3xl tracking-wide">
            {hasScores && (
              <span className="mr-3 tabular-nums">{game.score_home}</span>
            )}
            {game.home_abbr}
          </div>
          <div className="mt-1 text-xs text-slate-500">{game.home_team}</div>
        </div>
      </div>
      <div className="mt-auto pt-5">
        <div
          className="flex gap-2"
          role="group"
          aria-label={`Pick ${game.away_abbr} at ${game.home_abbr}`}
        >
          {buttons.map((button) => (
            <button
              key={button.side}
              type="button"
              disabled={locked || !hasLine || isSaving}
              aria-pressed={selectedSide === button.side}
              onClick={() => {
                if (!game.is_locked && Date.now() < kickoffMs)
                  onPickChange(button.side);
              }}
              className="pick-button"
            >
              {selectedSide === button.side && (
                <span aria-hidden="true">✓ </span>
              )}
              {button.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            {currentPick
              ? `Saved line: ${formatPickLine(currentPick, game)}`
              : locked
                ? "No pick for this game"
                : hasLine
                  ? "Current line · saved on submission"
                  : "Waiting for a line"}
          </span>
          {hasGrade && (
            <span
              className={`rounded px-2 py-1 font-bold ${points > 0 ? "bg-green-100 text-green-800" : "bg-red-50 text-red-700"}`}
            >
              {points > 0 ? "✓" : "✗"} {points} {points === 1 ? "pt" : "pts"}
            </span>
          )}
        </div>
        {!locked && hasLine && Number.isInteger(spread) && (
          <p className="mt-2 text-xs text-slate-500">
            Push scores 2 points if the game lands on the line.
          </p>
        )}
      </div>
    </article>
  );
}
