import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "../api/client";
import TopNav from "../components/TopNav";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import TeamLogo from "../components/TeamLogo";

function SectionHeader({ number, title, description, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-field font-display text-lg text-gold"
          aria-hidden="true"
        >
          {number}
        </span>
        <div>
          <h2 className="font-display text-2xl uppercase tracking-wide text-field">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Matchup({ game }) {
  return (
    <div className="mb-4">
      <p className="border-b border-slate-200 pb-3 text-xs font-medium text-slate-500">
        {formatKickoff(game.kickoff)}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TeamLogo abbreviation={game.away_abbr} />
          <span className="font-display text-2xl tracking-wide">
            {game.away_abbr}
          </span>
        </div>
        <span className="text-xs font-bold text-slate-400">@</span>
        <div className="flex items-center gap-2">
          <span className="font-display text-2xl tracking-wide">
            {game.home_abbr}
          </span>
          <TeamLogo abbreviation={game.home_abbr} />
        </div>
      </div>
    </div>
  );
}

function WeekDropdown({ weeks, value, onChange, disabled }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled || !weeks || weeks.length === 0}
      className="admin-input max-w-full font-semibold disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
  );
}

function ResultPanel({ result, error }) {
  if (!result && !error) return null;
  if (error) {
    return (
      <pre
        role="alert"
        className="mt-4 max-h-48 overflow-auto rounded-md border border-red-200 bg-red-50 p-4 text-xs text-red-800"
      >
        {typeof error === "string" ? error : JSON.stringify(error, null, 2)}
      </pre>
    );
  }
  return (
    <div
      role="status"
      className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"
    >
      <p className="text-sm font-bold">Action completed</p>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer py-1 font-medium">
          View response details
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function formatKickoff(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function UserRow({ user }) {
  return (
    <tr className="border-t border-slate-200 transition-colors hover:bg-cream/60">
      <td className="whitespace-nowrap px-4 py-4">
        <div className="flex items-center gap-3">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="h-10 w-10 flex-none rounded-full object-cover ring-1 ring-slate-200"
            />
          ) : (
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-field/10 text-xs font-bold text-field ring-1 ring-slate-200">
              {getInitials(user.display_name)}
            </div>
          )}
          <span className="text-sm font-medium text-slate-900">
            {user.display_name}
          </span>
          {user.is_admin && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
              Admin
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-slate-600">
        <span className="whitespace-nowrap">{user.email}</span>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
        {user.oauth_provider === "google" && "Google"}
        {user.oauth_provider !== "google" && "Legacy"}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
        {formatDate(user.created_at)}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
        {formatDateTime(user.last_login)}
      </td>
    </tr>
  );
}

function UsersSection() {
  const {
    data: users,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => (await apiClient.get("/api/admin/users")).data,
  });

  return (
    <section id="users" className="admin-section">
      <SectionHeader
        number="04"
        title="Registered users"
        description="The people behind the picks."
      >
        {users && (
          <span className="rounded-full bg-field/10 px-3 py-1 text-xs font-bold text-field">
            {users.length} total
          </span>
        )}
      </SectionHeader>
      {isLoading && <LoadingState size="sm" className="mt-4" />}
      {isError && (
        <div className="mt-4">
          <ErrorState
            error={error}
            message="Failed to load users."
            onRetry={refetch}
          />
        </div>
      )}
      {users && users.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No users yet.</p>
      )}
      {users && users.length > 0 && (
        <div
          className="mt-5 overflow-x-auto rounded-lg border border-slate-200"
          tabIndex={0}
          role="region"
          aria-label="Registered users table"
        >
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-field text-left text-[10px] font-bold uppercase tracking-wider text-white/80">
                <th scope="col" className="px-4 py-4">
                  Name
                </th>
                <th scope="col" className="px-4 py-4">
                  Email
                </th>
                <th scope="col" className="px-4 py-4">
                  Provider
                </th>
                <th scope="col" className="px-4 py-4">
                  Joined
                </th>
                <th scope="col" className="px-4 py-4">
                  Last login
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} user={u} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function useGamesForWeek(weekId) {
  return useQuery({
    queryKey: ["games", "week", weekId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/weeks/${weekId}/games`);
      return data;
    },
    enabled: !!weekId,
  });
}

function ScoreRow({ game, onSuccess }) {
  const queryClient = useQueryClient();
  const [home, setHome] = useState(
    game.score_home != null ? String(game.score_home) : "",
  );
  const [away, setAway] = useState(
    game.score_away != null ? String(game.score_away) : "",
  );
  const [err, setErr] = useState(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(
        `/api/admin/games/${game.id}/score`,
        {
          score_home: Number(home),
          score_away: Number(away),
        },
      );
      return data;
    },
    onSuccess: (data) => {
      setErr(null);
      queryClient.invalidateQueries({
        queryKey: ["games", "week", game.week_id],
      });
      onSuccess?.(data);
    },
    onError: (e) => {
      setErr(e?.response?.data?.error ?? "unknown_error");
    },
  });

  const submit = (e) => {
    e.preventDefault();
    const h = Number(home);
    const a = Number(away);
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) {
      setErr("Scores must be non-negative integers.");
      return;
    }
    mutation.mutate();
  };

  return (
    <li className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <Matchup game={game} />
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="break-words">
          Current:{" "}
          {game.score_home != null && game.score_away != null
            ? `${game.away_abbr} ${game.score_away} — ${game.home_abbr} ${game.score_home}`
            : "—"}
        </span>
        {game.is_final ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
            Final
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            Not final
          </span>
        )}
      </div>
      <form
        onSubmit={submit}
        className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-bold text-slate-600">
          <span>{game.away_abbr} (away)</span>
          <input
            type="number"
            min="0"
            value={away}
            onChange={(e) => setAway(e.target.value)}
            className="admin-input w-full tabular-nums"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-bold text-slate-600">
          <span>{game.home_abbr} (home)</span>
          <input
            type="number"
            min="0"
            value={home}
            onChange={(e) => setHome(e.target.value)}
            className="admin-input w-full tabular-nums"
          />
        </label>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="admin-button-primary"
        >
          {mutation.isPending ? "Saving…" : "Set score"}
        </button>
        {err && (
          <span role="alert" className="basis-full text-xs text-red-700">
            Error: {err}
          </span>
        )}
      </form>
    </li>
  );
}

function SpreadRow({ game }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(
    game.spread_home != null ? String(game.spread_home) : "",
  );
  const [err, setErr] = useState(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(
        `/api/admin/games/${game.id}/spread`,
        {
          spread_home: Number(value),
        },
      );
      return data;
    },
    onSuccess: () => {
      setErr(null);
      queryClient.invalidateQueries({
        queryKey: ["games", "week", game.week_id],
      });
    },
    onError: (e) => {
      setErr(e?.response?.data?.error ?? "unknown_error");
    },
  });

  const submit = (e) => {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isFinite(n)) {
      setErr("Spread must be a number.");
      return;
    }
    mutation.mutate();
  };

  const highlight = game.admin_override
    ? "border-amber-300 bg-amber-50/50"
    : "border-slate-200 bg-white";

  return (
    <li className={`min-w-0 rounded-lg border p-4 ${highlight}`}>
      <Matchup game={game} />
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>
          Current spread (home):{" "}
          <span className="font-semibold text-slate-900">
            {game.spread_home != null ? game.spread_home : "—"}
          </span>
        </span>
        <span>
          Source: <span className="font-mono">{game.spread_source ?? "—"}</span>
        </span>
        {game.admin_override && (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
            Admin override
          </span>
        )}
      </div>
      <form
        onSubmit={submit}
        className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-bold text-slate-600">
          <span>New home spread</span>
          <input
            type="number"
            step="0.5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="admin-input w-full tabular-nums"
          />
        </label>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="admin-button-primary"
        >
          {mutation.isPending ? "Saving…" : "Override"}
        </button>
        {err && (
          <span role="alert" className="basis-full text-xs text-red-700">
            Error: {err}
          </span>
        )}
      </form>
    </li>
  );
}

export default function AdminPanel() {
  const queryClient = useQueryClient();

  const { data: season } = useQuery({
    queryKey: ["season", "active"],
    queryFn: async () => (await apiClient.get("/api/seasons/active")).data,
  });

  const { data: currentWeek, isFetched: currentWeekFetched } = useQuery({
    queryKey: ["weeks", "current"],
    queryFn: async () => (await apiClient.get("/api/weeks/current")).data,
    retry: false,
  });

  const { data: weeks } = useQuery({
    queryKey: ["weeks", "season", season?.id],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/weeks", {
        params: { season_id: season.id },
      });
      return data;
    },
    enabled: !!season?.id,
  });

  const [oddsWeekId, setOddsWeekId] = useState(null);
  const [scoreWeekId, setScoreWeekId] = useState(null);
  const [spreadWeekId, setSpreadWeekId] = useState(null);

  useEffect(() => {
    if (!weeks || weeks.length === 0) return;
    if (!currentWeekFetched) return;
    const initial =
      weeks.find((week) => week.id === currentWeek?.id)?.id ?? weeks[0].id;
    setOddsWeekId((prev) => prev ?? initial);
    setScoreWeekId((prev) => prev ?? initial);
    setSpreadWeekId((prev) => prev ?? initial);
  }, [weeks, currentWeek?.id, currentWeekFetched]);

  const [oddsResult, setOddsResult] = useState(null);
  const [oddsError, setOddsError] = useState(null);

  const refreshOddsMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(
        `/api/admin/weeks/${oddsWeekId}/refresh-odds`,
      );
      return data;
    },
    onSuccess: (data) => {
      setOddsResult(data);
      setOddsError(null);
      queryClient.invalidateQueries({
        queryKey: ["games", "week", oddsWeekId],
      });
    },
    onError: (e) => {
      setOddsError(e?.response?.data ?? e.message);
      setOddsResult(null);
    },
  });

  const scoreAllMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(
        `/api/admin/weeks/${oddsWeekId}/score-all`,
      );
      return data;
    },
    onSuccess: (data) => {
      setOddsResult(data);
      setOddsError(null);
      queryClient.invalidateQueries({
        queryKey: ["games", "week", oddsWeekId],
      });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (e) => {
      setOddsError(e?.response?.data ?? e.message);
      setOddsResult(null);
    },
  });

  const refreshAllScoresMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post("/api/admin/scores/refresh");
      return data;
    },
    onSuccess: (data) => {
      setOddsResult(data);
      setOddsError(null);
      queryClient.invalidateQueries({ queryKey: ["games"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (e) => {
      setOddsError(e?.response?.data ?? e.message);
      setOddsResult(null);
    },
  });

  const scoreGames = useGamesForWeek(scoreWeekId);
  const spreadGames = useGamesForWeek(spreadWeekId);

  const anyOddsPending =
    refreshOddsMutation.isPending ||
    scoreAllMutation.isPending ||
    refreshAllScoresMutation.isPending;

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <PageHeader
        eyebrow={`NFL Pick 5${season?.label ? ` · ${season.label}` : ""}`}
        title="Admin panel."
        description="Keep the league ready for game day."
      >
        <span className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-gold">
          League administration
        </span>
      </PageHeader>
      <main className="mx-auto max-w-5xl space-y-7 px-4 py-7 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium text-slate-600">
            <span className="font-bold text-field">Admin access</span> · Actions
            here affect all users.
          </p>
          <nav
            aria-label="Admin sections"
            className="flex flex-wrap gap-1 text-xs font-bold text-field"
          >
            {[
              ["operations", "Operations"],
              ["scores", "Scores"],
              ["spreads", "Spreads"],
              ["users", "Users"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="flex min-h-[44px] items-center rounded-md px-3 hover:bg-field/10"
              >
                {label}
                <span className="ml-2 text-slate-400" aria-hidden="true">
                  ↓
                </span>
              </a>
            ))}
          </nav>
        </div>
        <section id="operations" className="admin-section">
          <SectionHeader
            number="01"
            title="Odds & scoring"
            description="Refresh the lines and keep results up to date."
          >
            <label className="flex max-w-full items-center gap-2 text-sm text-slate-700">
              <span className="font-bold">Week</span>
              <WeekDropdown
                weeks={weeks}
                value={oddsWeekId}
                onChange={setOddsWeekId}
                disabled={anyOddsPending}
              />
            </label>
          </SectionHeader>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="flex flex-col rounded-lg bg-field p-5 text-white">
              <p className="eyebrow text-gold">Weekly odds</p>
              <p className="mb-5 mt-2 flex-1 text-sm leading-relaxed text-white/80">
                Pull the latest spreads for the selected week.
              </p>
              <button
                type="button"
                onClick={() => refreshOddsMutation.mutate()}
                disabled={!oddsWeekId || anyOddsPending}
                className="admin-button-primary w-full"
              >
                {refreshOddsMutation.isPending ? "Refreshing…" : "Refresh odds"}
              </button>
            </div>
            <div className="flex flex-col rounded-lg border border-slate-200 bg-cream/50 p-5">
              <p className="eyebrow text-field">Weekly grading</p>
              <p className="mb-5 mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                Re-grade all final games in the selected week.
              </p>
              <button
                type="button"
                onClick={() => scoreAllMutation.mutate()}
                disabled={!oddsWeekId || anyOddsPending}
                className="admin-button-secondary w-full"
              >
                {scoreAllMutation.isPending
                  ? "Re-grading…"
                  : "Re-grade final games"}
              </button>
            </div>
            <div className="flex flex-col rounded-lg border border-slate-200 bg-cream/50 p-5">
              <p className="eyebrow text-field">All scores</p>
              <p className="mb-5 mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                Fetch completed game scores across weeks from the provider.
              </p>
              <button
                type="button"
                onClick={() => refreshAllScoresMutation.mutate()}
                disabled={anyOddsPending}
                className="admin-button-secondary w-full"
              >
                {refreshAllScoresMutation.isPending
                  ? "Refreshing…"
                  : "Refresh all scores"}
              </button>
            </div>
          </div>
          <ResultPanel result={oddsResult} error={oddsError} />
        </section>

        <section id="scores" className="admin-section">
          <SectionHeader
            number="02"
            title="Manual score entry"
            description="Set a final score and grade the game’s picks."
          >
            <div className="flex max-w-full flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <span className="font-bold">Week</span>
                <WeekDropdown
                  weeks={weeks}
                  value={scoreWeekId}
                  onChange={setScoreWeekId}
                />
              </label>
            </div>
          </SectionHeader>
          {scoreGames.isLoading && <LoadingState size="sm" className="mt-4" />}
          {scoreGames.isError && (
            <div className="mt-4">
              <ErrorState
                error={scoreGames.error}
                message="Failed to load games."
                onRetry={scoreGames.refetch}
              />
            </div>
          )}
          {scoreGames.data && scoreGames.data.length === 0 && (
            <div className="mt-4">
              <ErrorState
                variant="notFound"
                title="No games"
                message="No games for this week."
              />
            </div>
          )}
          {scoreGames.data && scoreGames.data.length > 0 && (
            <ul className="mt-5 grid gap-4 md:grid-cols-2">
              {scoreGames.data.map((g) => (
                <ScoreRow key={g.id} game={g} />
              ))}
            </ul>
          )}
        </section>

        <section id="spreads" className="admin-section">
          <SectionHeader
            number="03"
            title="Spread overrides"
            description="Adjust the home line for an individual matchup."
          >
            <div className="flex max-w-full flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <span className="font-bold">Week</span>
                <WeekDropdown
                  weeks={weeks}
                  value={spreadWeekId}
                  onChange={setSpreadWeekId}
                />
              </label>
            </div>
          </SectionHeader>
          <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
            <strong>Saved lines stay protected.</strong> Overrides apply to new
            and re-submitted picks only. Already-locked picks retain their saved
            spread; existing picks are not retroactively re-graded.
          </p>
          {spreadGames.isLoading && <LoadingState size="sm" className="mt-4" />}
          {spreadGames.isError && (
            <div className="mt-4">
              <ErrorState
                error={spreadGames.error}
                message="Failed to load games."
                onRetry={spreadGames.refetch}
              />
            </div>
          )}
          {spreadGames.data && spreadGames.data.length === 0 && (
            <div className="mt-4">
              <ErrorState
                variant="notFound"
                title="No games"
                message="No games for this week."
              />
            </div>
          )}
          {spreadGames.data && spreadGames.data.length > 0 && (
            <ul className="mt-5 grid gap-4 md:grid-cols-2">
              {spreadGames.data.map((g) => (
                <SpreadRow key={g.id} game={g} />
              ))}
            </ul>
          )}
        </section>

        <UsersSection />
      </main>
    </div>
  );
}
