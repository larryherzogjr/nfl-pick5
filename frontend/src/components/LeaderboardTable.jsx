import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "../api/client";

function Avatar({ url, name }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="h-8 w-8 flex-none rounded-full object-cover ring-1 ring-slate-200"
      />
    );
  }
  return (
    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
      {initial}
    </div>
  );
}

function WeeklyBreakdown({ breakdown }) {
  if (!breakdown || breakdown.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-slate-500">
        No graded weeks yet for this player.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2 font-medium">Week</th>
            <th className="px-4 py-2 font-medium">Points</th>
            <th className="px-4 py-2 font-medium">Picks Scored</th>
            <th className="px-4 py-2 font-medium">Perfect</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {breakdown.map((w) => (
            <tr key={w.week}>
              <td className="px-4 py-2 text-slate-700">Week {w.week}</td>
              <td className="px-4 py-2 font-semibold text-slate-900">
                {w.points}
              </td>
              <td className="px-4 py-2 text-slate-700">{w.picks_scored}</td>
              <td className="px-4 py-2">
                {w.is_perfect ? (
                  <span
                    className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
                    title="Perfect week"
                  >
                    ★ Perfect
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatSpread(spread) {
  if (spread === null || spread === undefined) return "—";
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : String(spread);
}

function PlayerPicks({ userId, weekId }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["visible-picks", userId, weekId],
    queryFn: async () =>
      (await apiClient.get(`/api/users/${userId}/weeks/${weekId}/picks`)).data,
    enabled: !!userId && !!weekId,
  });

  if (isLoading) {
    return <p className="px-4 py-3 text-sm text-slate-500">Loading picks…</p>;
  }
  if (isError) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-red-700">
        <span>Could not load this player’s picks.</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="font-medium underline"
        >
          Retry
        </button>
      </div>
    );
  }
  if (!data?.picks?.length) {
    return (
      <p className="px-4 py-3 text-sm text-slate-500">
        No picks are visible yet. Other players’ choices appear as each game
        kicks off.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {data.picks.map((pick) => {
        const pickedTeam =
          pick.picked_side === "home"
            ? pick.home_abbr
            : pick.picked_side === "away"
              ? pick.away_abbr
              : "PUSH";
        return (
          <li
            key={pick.pick_id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
          >
            <div>
              <span className="font-medium text-slate-900">
                {pick.away_abbr} @ {pick.home_abbr}
              </span>
              <span className="ml-2 text-slate-500">
                {pick.home_abbr} {formatSpread(pick.spread_at_pick)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">{pickedTeam}</span>
              {pick.points_awarded !== null &&
                pick.points_awarded !== undefined && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {pick.points_awarded}{" "}
                    {pick.points_awarded === 1 ? "pt" : "pts"}
                  </span>
                )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function LeaderboardTable({ entries, selectedWeekId = null }) {
  const [expandedUserId, setExpandedUserId] = useState(null);

  if (!entries || entries.length === 0) {
    return (
      <div className="rounded-lg bg-white p-10 text-center shadow-sm ring-1 ring-slate-200">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">
          🏈
        </div>
        <h2 className="text-base font-semibold text-slate-900">
          No graded picks yet
        </h2>
        <p className="mt-1 text-sm text-slate-600">Check back after Sunday.</p>
      </div>
    );
  }

  const toggleRow = (userId) => {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  };

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-3 font-medium">
                Rank
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Player
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Points
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Perfect Weeks
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Total Picked
              </th>
              <th scope="col" className="w-8 px-2 py-3" aria-label="Expand" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const isExpanded = expandedUserId === entry.user.id;
              return (
                <Fragment key={entry.user.id}>
                  <tr
                    onClick={() => toggleRow(entry.user.id)}
                    className={`cursor-pointer transition-colors ${
                      isExpanded ? "bg-slate-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                      {entry.rank}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          url={entry.user.avatar_url}
                          name={entry.user.display_name}
                        />
                        <span className="font-medium text-slate-900">
                          {entry.user.display_name}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                      {entry.points}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                      {entry.perfect_weeks}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                      {entry.total_picked}
                    </td>
                    <td className="px-2 py-3 text-slate-400">
                      <span
                        className={`inline-block transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                        aria-hidden="true"
                      >
                        ▶
                      </span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-slate-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="rounded-md bg-white ring-1 ring-slate-200">
                          {selectedWeekId ? (
                            <PlayerPicks
                              userId={entry.user.id}
                              weekId={selectedWeekId}
                            />
                          ) : (
                            <WeeklyBreakdown
                              breakdown={entry.weekly_breakdown}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
