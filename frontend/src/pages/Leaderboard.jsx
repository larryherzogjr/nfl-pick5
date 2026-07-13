import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "../api/client";
import TopNav from "../components/TopNav";
import LeaderboardTable from "../components/LeaderboardTable";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";

export default function Leaderboard() {
  const [scope, setScope] = useState("season");
  const [selectedWeekId, setSelectedWeekId] = useState(null);

  const {
    data: season,
    isLoading: seasonLoading,
    isError: seasonIsError,
    error: seasonError,
    refetch: refetchSeason,
  } = useQuery({
    queryKey: ["season", "active"],
    queryFn: async () => (await apiClient.get("/api/seasons/active")).data,
    retry: (failureCount, err) => {
      if (err?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });

  const { data: weeks, isLoading: weeksLoading } = useQuery({
    queryKey: ["weeks", "season", season?.id],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/weeks", {
        params: { season_id: season.id },
      });
      return data;
    },
    enabled: !!season?.id,
  });

  useEffect(() => {
    if (scope !== "week") return;
    if (!weeks || weeks.length === 0) return;
    if (selectedWeekId && weeks.some((w) => w.id === selectedWeekId)) return;
    setSelectedWeekId(weeks[0].id);
  }, [scope, weeks, selectedWeekId]);

  const seasonQueryEnabled = scope === "season" && !!season?.id;
  const weekQueryEnabled = scope === "week" && !!selectedWeekId;

  const {
    data: entries,
    isLoading: entriesLoading,
    isError: entriesIsError,
    error: entriesError,
    refetch: refetchEntries,
  } = useQuery({
    queryKey:
      scope === "season"
        ? ["leaderboard", "season", season?.id]
        : ["leaderboard", "week", selectedWeekId],
    queryFn: async () => {
      const params =
        scope === "season"
          ? { season_id: season.id }
          : { week_id: selectedWeekId };
      const { data } = await apiClient.get("/api/leaderboard", { params });
      return data;
    },
    enabled: seasonQueryEnabled || weekQueryEnabled,
  });

  const handleScopeChange = (next) => {
    setScope(next);
  };

  const showSpinner =
    seasonLoading ||
    (scope === "week" && weeksLoading) ||
    ((seasonQueryEnabled || weekQueryEnabled) && entriesLoading);

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Leaderboard</h1>
          {season?.label && (
            <p className="mt-1 text-sm text-slate-500">{season.label} season</p>
          )}
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div
            className="inline-flex rounded-md ring-1 ring-slate-300"
            role="tablist"
            aria-label="Leaderboard scope"
          >
            <button
              type="button"
              role="tab"
              aria-selected={scope === "season"}
              onClick={() => handleScopeChange("season")}
              className={`min-h-[44px] rounded-l-md px-4 py-2 text-sm font-medium transition-colors ${
                scope === "season"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Season
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === "week"}
              onClick={() => handleScopeChange("week")}
              className={`min-h-[44px] rounded-r-md px-4 py-2 text-sm font-medium transition-colors ${
                scope === "week"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Week
            </button>
          </div>

          {scope === "week" && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="sr-only">Week</span>
              <select
                value={selectedWeekId ?? ""}
                onChange={(e) => setSelectedWeekId(Number(e.target.value))}
                disabled={!weeks || weeks.length === 0}
                className="min-h-[44px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                {(!weeks || weeks.length === 0) && (
                  <option value="">No weeks available</option>
                )}
                {weeks?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {seasonIsError && seasonError?.response?.status === 404 && (
          <ErrorState
            variant="notFound"
            title="No active season"
            message="There is no active season right now. Check back when the next season starts."
          />
        )}

        {seasonIsError && seasonError?.response?.status !== 404 && (
          <ErrorState
            error={seasonError}
            message="Failed to load the active season."
            onRetry={refetchSeason}
          />
        )}

        {entriesIsError && entriesError?.response?.status === 404 && (
          <ErrorState
            variant="notFound"
            title="Leaderboard not found"
            message="We couldn’t find leaderboard data for this scope yet."
          />
        )}

        {entriesIsError && entriesError?.response?.status !== 404 && (
          <ErrorState
            error={entriesError}
            message="Failed to load the leaderboard."
            onRetry={refetchEntries}
          />
        )}

        {showSpinner && <LoadingState label="Loading leaderboard…" />}

        {!showSpinner &&
          !entriesIsError &&
          (seasonQueryEnabled || weekQueryEnabled) && (
            <LeaderboardTable
              entries={entries ?? []}
              selectedWeekId={scope === "week" ? selectedWeekId : null}
            />
          )}
      </main>
    </div>
  );
}
