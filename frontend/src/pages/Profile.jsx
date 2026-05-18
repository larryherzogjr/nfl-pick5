import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import TopNav from '../components/TopNav';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';

const TOTAL_WEEKS = 18;

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

function formatMemberSince(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

function ProviderPill({ provider }) {
  if (!provider) return null;
  const label =
    provider === 'google'
      ? 'Signed in with Google'
      : provider === 'meta'
        ? 'Signed in with Meta'
        : null;
  if (!label) return null;
  return (
    <span className="mt-2 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
      {label}
    </span>
  );
}

function IdentityAvatar({ url, name }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="h-16 w-16 flex-none rounded-full object-cover ring-1 ring-slate-200"
      />
    );
  }
  return (
    <div className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-700 ring-1 ring-slate-200">
      {getInitials(name)}
    </div>
  );
}

function IdentityCard({ user }) {
  const memberSince = formatMemberSince(user.created_at);
  return (
    <section className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start gap-4">
        <IdentityAvatar url={user.avatar_url} name={user.display_name} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold text-slate-900">
            {user.display_name}
          </h1>
          {user.email && (
            <p className="mt-1 truncate text-sm text-slate-500">{user.email}</p>
          )}
          <ProviderPill provider={user.oauth_provider} />
        </div>
      </div>
      {memberSince && (
        <p className="mt-4 text-xs text-slate-500">Member since {memberSince}</p>
      )}
    </section>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-md bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function weeklyCellClass(points) {
  if (points == null) {
    return 'bg-slate-50 text-slate-300 ring-slate-200';
  }
  if (points >= 5) {
    return 'bg-emerald-100 text-emerald-900 ring-emerald-300';
  }
  if (points === 0) {
    return 'bg-red-50 text-red-700 ring-red-200';
  }
  return 'bg-white text-slate-800 ring-slate-200';
}

function WeeklyStrip({ breakdown }) {
  const byWeek = new Map();
  for (const entry of breakdown ?? []) {
    byWeek.set(entry.week, entry.points);
  }
  const cells = [];
  for (let w = 1; w <= TOTAL_WEEKS; w += 1) {
    const points = byWeek.has(w) ? byWeek.get(w) : null;
    cells.push({ week: w, points });
  }
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-slate-700">Weekly breakdown</h3>
      <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-9">
        {cells.map((c) => (
          <div
            key={c.week}
            className={`flex flex-col items-center justify-center rounded-md px-1 py-2 text-sm shadow-sm ring-1 ${weeklyCellClass(
              c.points,
            )}`}
            title={
              c.points == null
                ? `Week ${c.week}: not graded`
                : `Week ${c.week}: ${c.points} pts`
            }
          >
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-75">
              W{c.week}
            </span>
            <span className="mt-0.5 font-semibold">
              {c.points == null ? '—' : c.points}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsCard({ season, entries, currentUserId }) {
  const myEntry = (entries ?? []).find((e) => e.user.id === currentUserId);
  const points = myEntry?.points ?? 0;
  const picksMade = myEntry?.total_picked ?? 0;
  const breakdown = myEntry?.weekly_breakdown ?? [];
  const perfectWeeks = breakdown.filter((w) => (w.points ?? 0) >= 5).length;
  const rank = myEntry?.rank ?? '—';

  return (
    <section className="mt-6 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold text-slate-900">
        {season.label} Season
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Points" value={points} />
        <StatTile label="Picks made" value={picksMade} />
        <StatTile label="Perfect weeks" value={perfectWeeks} />
        <StatTile label="Season rank" value={rank} />
      </div>
      <WeeklyStrip breakdown={breakdown} />
    </section>
  );
}

export default function Profile() {
  const { user } = useAuth();

  const {
    data: season,
    isLoading: seasonLoading,
    isError: seasonIsError,
    error: seasonError,
    refetch: refetchSeason,
  } = useQuery({
    queryKey: ['season', 'active'],
    queryFn: async () => (await apiClient.get('/api/seasons/active')).data,
    retry: (failureCount, err) => {
      if (err?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });

  const seasonNotFound =
    seasonIsError && seasonError?.response?.status === 404;

  const {
    data: entries,
    isLoading: entriesLoading,
    isError: entriesIsError,
    error: entriesError,
    refetch: refetchEntries,
  } = useQuery({
    queryKey: ['leaderboard', 'season', season?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/leaderboard', {
        params: { season_id: season.id },
      });
      return data;
    },
    enabled: !!season?.id,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        {user && (
          <>
            <IdentityCard user={user} />

            {seasonLoading && (
              <div className="mt-6">
                <LoadingState label="Loading season stats…" />
              </div>
            )}

            {seasonNotFound && (
              <section className="mt-6 rounded-lg bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
                <p className="text-sm font-medium text-slate-700">
                  No active season yet
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Stats will appear once the next season begins.
                </p>
              </section>
            )}

            {seasonIsError && !seasonNotFound && (
              <div className="mt-6">
                <ErrorState
                  error={seasonError}
                  message="Failed to load the active season."
                  onRetry={refetchSeason}
                />
              </div>
            )}

            {season && entriesLoading && (
              <div className="mt-6">
                <LoadingState label="Loading stats…" />
              </div>
            )}

            {season && entriesIsError && (
              <div className="mt-6">
                <ErrorState
                  error={entriesError}
                  message="Failed to load season stats."
                  onRetry={refetchEntries}
                />
              </div>
            )}

            {season && !entriesLoading && !entriesIsError && (
              <StatsCard
                season={season}
                entries={entries ?? []}
                currentUserId={user.id}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
