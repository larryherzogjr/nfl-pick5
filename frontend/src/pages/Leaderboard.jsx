import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import TopNav from '../components/TopNav';
import LeaderboardTable from '../components/LeaderboardTable';

export default function Leaderboard() {
  const [scope, setScope] = useState('season');
  const [selectedWeekId, setSelectedWeekId] = useState(null);

  const {
    data: season,
    isLoading: seasonLoading,
    isError: seasonError,
  } = useQuery({
    queryKey: ['season', 'active'],
    queryFn: async () => (await apiClient.get('/api/seasons/active')).data,
  });

  const { data: weeks, isLoading: weeksLoading } = useQuery({
    queryKey: ['weeks', 'season', season?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/weeks', {
        params: { season_id: season.id },
      });
      return data;
    },
    enabled: !!season?.id,
  });

  useEffect(() => {
    if (scope !== 'week') return;
    if (!weeks || weeks.length === 0) return;
    if (selectedWeekId && weeks.some((w) => w.id === selectedWeekId)) return;
    setSelectedWeekId(weeks[0].id);
  }, [scope, weeks, selectedWeekId]);

  const seasonQueryEnabled = scope === 'season' && !!season?.id;
  const weekQueryEnabled = scope === 'week' && !!selectedWeekId;

  const {
    data: entries,
    isLoading: entriesLoading,
    isError: entriesError,
  } = useQuery({
    queryKey:
      scope === 'season'
        ? ['leaderboard', 'season', season?.id]
        : ['leaderboard', 'week', selectedWeekId],
    queryFn: async () => {
      const params =
        scope === 'season'
          ? { season_id: season.id }
          : { week_id: selectedWeekId };
      const { data } = await apiClient.get('/api/leaderboard', { params });
      return data;
    },
    enabled: seasonQueryEnabled || weekQueryEnabled,
  });

  const handleScopeChange = (next) => {
    setScope(next);
  };

  const showSpinner =
    seasonLoading ||
    (scope === 'week' && weeksLoading) ||
    ((seasonQueryEnabled || weekQueryEnabled) && entriesLoading);

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Leaderboard</h1>
          {season?.label && (
            <p className="mt-1 text-sm text-slate-500">
              {season.label} season
            </p>
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
              aria-selected={scope === 'season'}
              onClick={() => handleScopeChange('season')}
              className={`rounded-l-md px-4 py-1.5 text-sm font-medium transition-colors ${
                scope === 'season'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Season
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'week'}
              onClick={() => handleScopeChange('week')}
              className={`rounded-r-md px-4 py-1.5 text-sm font-medium transition-colors ${
                scope === 'week'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Week
            </button>
          </div>

          {scope === 'week' && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="sr-only">Week</span>
              <select
                value={selectedWeekId ?? ''}
                onChange={(e) => setSelectedWeekId(Number(e.target.value))}
                disabled={!weeks || weeks.length === 0}
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
            </label>
          )}
        </div>

        {seasonError && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            Failed to load the active season.
          </div>
        )}

        {entriesError && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            Failed to load the leaderboard.
          </div>
        )}

        {showSpinner && (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
          </div>
        )}

        {!showSpinner && !entriesError && (seasonQueryEnabled || weekQueryEnabled) && (
          <LeaderboardTable entries={entries ?? []} />
        )}
      </main>
    </div>
  );
}
