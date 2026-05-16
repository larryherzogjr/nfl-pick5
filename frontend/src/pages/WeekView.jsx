import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import TopNav from '../components/TopNav';
import GameCard from '../components/GameCard';

export default function WeekView() {
  const { weekId } = useParams();
  const weekIdNum = Number(weekId);
  const weekIdValid = Number.isFinite(weekIdNum);

  const {
    data: games,
    isLoading: gamesLoading,
    isError: gamesError,
  } = useQuery({
    queryKey: ['games', 'week', weekIdNum],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/weeks/${weekIdNum}/games`);
      return data;
    },
    enabled: weekIdValid,
  });

  const { data: picks, isLoading: picksLoading } = useQuery({
    queryKey: ['picks', 'week', weekIdNum],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/weeks/${weekIdNum}/picks`);
      return data;
    },
    enabled: weekIdValid,
  });

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

  const week = weeks?.find((w) => w.id === weekIdNum);

  const [selected, setSelected] = useState({});

  useEffect(() => {
    if (!picks) return;
    const initial = {};
    for (const p of picks) {
      initial[p.game_id] = p.picked_side;
    }
    setSelected(initial);
  }, [picks]);

  const picksByGame = useMemo(() => {
    const map = {};
    for (const p of picks ?? []) {
      map[p.game_id] = p;
    }
    return map;
  }, [picks]);

  const pickCount = Object.keys(selected).length;

  const handlePickChange = (gameId, side) => {
    setSelected((prev) => {
      if (prev[gameId] === side) {
        const next = { ...prev };
        delete next[gameId];
        return next;
      }
      const already = Object.prototype.hasOwnProperty.call(prev, gameId);
      if (!already && Object.keys(prev).length >= 5) {
        return prev;
      }
      return { ...prev, [gameId]: side };
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900">
            {week?.label ?? `Week ${weekId}`}
          </h1>
          {season?.label && (
            <p className="mt-1 text-sm text-slate-500">{season.label} season</p>
          )}
        </header>

        {!weekIdValid && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            Invalid week.
          </div>
        )}

        {weekIdValid && gamesError && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            Failed to load games for this week.
          </div>
        )}

        {weekIdValid && (gamesLoading || picksLoading) && (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
          </div>
        )}

        {weekIdValid && !gamesLoading && games && games.length === 0 && (
          <div className="rounded-md bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
            No games scheduled for this week yet.
          </div>
        )}

        {weekIdValid && games && games.length > 0 && (
          <div className="space-y-3">
            {games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                currentPick={picksByGame[game.id] ?? null}
                selectedSide={selected[game.id] ?? null}
                onPickChange={(side) => handlePickChange(game.id, side)}
              />
            ))}
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white shadow-[0_-1px_4px_rgba(0,0,0,0.04)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-sm font-medium text-slate-700">
            {pickCount} of 5 picks made
          </span>
          <span className="text-xs text-slate-400">
            Submission coming soon
          </span>
        </div>
      </div>
    </div>
  );
}
