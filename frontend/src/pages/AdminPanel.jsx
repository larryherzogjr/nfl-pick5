import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import TopNav from '../components/TopNav';

function WeekDropdown({ weeks, value, onChange, disabled }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled || !weeks || weeks.length === 0}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
      <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-red-50 p-3 text-xs text-red-800 ring-1 ring-red-200">
        {typeof error === 'string' ? error : JSON.stringify(error, null, 2)}
      </pre>
    );
  }
  return (
    <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-800 ring-1 ring-slate-200">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

function formatKickoff(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function useGamesForWeek(weekId) {
  return useQuery({
    queryKey: ['games', 'week', weekId],
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
    game.score_home != null ? String(game.score_home) : '',
  );
  const [away, setAway] = useState(
    game.score_away != null ? String(game.score_away) : '',
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
      queryClient.invalidateQueries({ queryKey: ['games', 'week', game.week_id] });
      onSuccess?.(data);
    },
    onError: (e) => {
      setErr(e?.response?.data?.error ?? 'unknown_error');
    },
  });

  const submit = (e) => {
    e.preventDefault();
    const h = Number(home);
    const a = Number(away);
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) {
      setErr('Scores must be non-negative integers.');
      return;
    }
    mutation.mutate();
  };

  return (
    <li className="rounded-md bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">
          {game.away_abbr} @ {game.home_abbr}
        </div>
        <div className="text-xs text-slate-500">{formatKickoff(game.kickoff)}</div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>
          Current:{' '}
          {game.score_home != null && game.score_away != null
            ? `${game.away_abbr} ${game.score_away} — ${game.home_abbr} ${game.score_home}`
            : '—'}
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
      <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-slate-600">
          <span>{game.away_abbr} (away)</span>
          <input
            type="number"
            min="0"
            value={away}
            onChange={(e) => setAway(e.target.value)}
            className="mt-0.5 w-24 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-600">
          <span>{game.home_abbr} (home)</span>
          <input
            type="number"
            min="0"
            value={home}
            onChange={(e) => setHome(e.target.value)}
            className="mt-0.5 w-24 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </label>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? 'Saving…' : 'Set score'}
        </button>
        {err && <span className="text-xs text-red-700">Error: {err}</span>}
      </form>
    </li>
  );
}

function SpreadRow({ game }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(
    game.spread_home != null ? String(game.spread_home) : '',
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
      queryClient.invalidateQueries({ queryKey: ['games', 'week', game.week_id] });
    },
    onError: (e) => {
      setErr(e?.response?.data?.error ?? 'unknown_error');
    },
  });

  const submit = (e) => {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isFinite(n)) {
      setErr('Spread must be a number.');
      return;
    }
    mutation.mutate();
  };

  const highlight = game.admin_override
    ? 'ring-2 ring-amber-300 bg-amber-50'
    : 'ring-1 ring-slate-200 bg-white';

  return (
    <li className={`rounded-md p-3 shadow-sm ${highlight}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">
          {game.away_abbr} @ {game.home_abbr}
        </div>
        <div className="text-xs text-slate-500">{formatKickoff(game.kickoff)}</div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>
          Current spread (home):{' '}
          <span className="font-semibold text-slate-900">
            {game.spread_home != null ? game.spread_home : '—'}
          </span>
        </span>
        <span>
          Source: <span className="font-mono">{game.spread_source ?? '—'}</span>
        </span>
        {game.admin_override && (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
            Admin override
          </span>
        )}
      </div>
      <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-slate-600">
          <span>New spread_home</span>
          <input
            type="number"
            step="0.5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-0.5 w-28 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </label>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? 'Saving…' : 'Override'}
        </button>
        {err && <span className="text-xs text-red-700">Error: {err}</span>}
      </form>
    </li>
  );
}

export default function AdminPanel() {
  const queryClient = useQueryClient();

  const { data: season } = useQuery({
    queryKey: ['season', 'active'],
    queryFn: async () => (await apiClient.get('/api/seasons/active')).data,
  });

  const { data: weeks } = useQuery({
    queryKey: ['weeks', 'season', season?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/weeks', {
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
    const first = weeks[0].id;
    setOddsWeekId((prev) => prev ?? first);
    setScoreWeekId((prev) => prev ?? first);
    setSpreadWeekId((prev) => prev ?? first);
  }, [weeks]);

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
      queryClient.invalidateQueries({ queryKey: ['games', 'week', oddsWeekId] });
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
      queryClient.invalidateQueries({ queryKey: ['games', 'week', oddsWeekId] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: (e) => {
      setOddsError(e?.response?.data ?? e.message);
      setOddsResult(null);
    },
  });

  const refreshAllScoresMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/api/admin/scores/refresh');
      return data;
    },
    onSuccess: (data) => {
      setOddsResult(data);
      setOddsError(null);
      queryClient.invalidateQueries({ queryKey: ['games'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
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
      <div className="border-b border-amber-300 bg-amber-200 text-amber-900">
        <div className="mx-auto max-w-5xl px-4 py-2 text-sm font-semibold uppercase tracking-wide">
          ⚠ Admin Panel — actions here affect all users
        </div>
      </div>
      <main className="mx-auto max-w-5xl px-4 py-8 space-y-10">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
          {season?.label && (
            <p className="mt-1 text-sm text-slate-500">{season.label} season</p>
          )}
        </header>

        <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Odds &amp; Scoring
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>Week:</span>
              <WeekDropdown
                weeks={weeks}
                value={oddsWeekId}
                onChange={setOddsWeekId}
                disabled={anyOddsPending}
              />
            </label>
            <button
              type="button"
              onClick={() => refreshOddsMutation.mutate()}
              disabled={!oddsWeekId || anyOddsPending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshOddsMutation.isPending
                ? 'Refreshing…'
                : 'Refresh odds for this week'}
            </button>
            <button
              type="button"
              onClick={() => scoreAllMutation.mutate()}
              disabled={!oddsWeekId || anyOddsPending}
              className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {scoreAllMutation.isPending
                ? 'Re-grading…'
                : 'Re-grade all final games in this week'}
            </button>
          </div>
          <div className="mt-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => refreshAllScoresMutation.mutate()}
              disabled={anyOddsPending}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshAllScoresMutation.isPending
                ? 'Refreshing…'
                : 'Refresh all scores from API'}
            </button>
          </div>
          <ResultPanel result={oddsResult} error={oddsError} />
        </section>

        <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Manual score entry
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>Week:</span>
              <WeekDropdown
                weeks={weeks}
                value={scoreWeekId}
                onChange={setScoreWeekId}
              />
            </label>
          </div>
          {scoreGames.isLoading && (
            <div className="mt-4 flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
            </div>
          )}
          {scoreGames.isError && (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              Failed to load games.
            </div>
          )}
          {scoreGames.data && scoreGames.data.length === 0 && (
            <div className="mt-4 text-sm text-slate-500">
              No games for this week.
            </div>
          )}
          {scoreGames.data && scoreGames.data.length > 0 && (
            <ul className="mt-4 space-y-2">
              {scoreGames.data.map((g) => (
                <ScoreRow key={g.id} game={g} />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Spread overrides
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Note: overrides do <strong>not</strong> retroactively re-grade
            existing picks. Each pick uses the spread captured at submission
            time.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>Week:</span>
              <WeekDropdown
                weeks={weeks}
                value={spreadWeekId}
                onChange={setSpreadWeekId}
              />
            </label>
          </div>
          {spreadGames.isLoading && (
            <div className="mt-4 flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
            </div>
          )}
          {spreadGames.isError && (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              Failed to load games.
            </div>
          )}
          {spreadGames.data && spreadGames.data.length === 0 && (
            <div className="mt-4 text-sm text-slate-500">
              No games for this week.
            </div>
          )}
          {spreadGames.data && spreadGames.data.length > 0 && (
            <ul className="mt-4 space-y-2">
              {spreadGames.data.map((g) => (
                <SpreadRow key={g.id} game={g} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
