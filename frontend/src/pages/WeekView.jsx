import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import TopNav from '../components/TopNav';
import GameCard from '../components/GameCard';
import PickBar from '../components/PickBar';

// Known limitation: POST /api/weeks/:id/picks does not support deletion.
// Deselecting a previously-submitted pick and submitting will NOT remove it —
// the request simply omits that game, and the persisted pick is preserved.
// To remove a pick, the user must swap it to a different side. A DELETE
// endpoint can be added later.

const PICK_ERROR_MESSAGES = {
  game_not_in_week: 'Game is not part of this week.',
  invalid_picked_side: 'Invalid pick selection.',
  push_requires_whole_spread: 'Push picks require a whole-number spread.',
  invalid_pick_item: 'Malformed pick entry.',
};

export default function WeekView() {
  const { weekId } = useParams();
  const weekIdNum = Number(weekId);
  const weekIdValid = Number.isFinite(weekIdNum);
  const queryClient = useQueryClient();

  const picksQueryKey = ['picks', 'week', weekIdNum];

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
    queryKey: picksQueryKey,
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
  const [successVisible, setSuccessVisible] = useState(false);
  const [submitErrors, setSubmitErrors] = useState([]);
  const successTimerRef = useRef(null);

  useEffect(() => {
    if (!picks) return;
    const initial = {};
    for (const p of picks) {
      initial[p.game_id] = p.picked_side;
    }
    setSelected(initial);
  }, [picks]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  const picksByGame = useMemo(() => {
    const map = {};
    for (const p of picks ?? []) {
      map[p.game_id] = p;
    }
    return map;
  }, [picks]);

  const gamesById = useMemo(() => {
    const map = {};
    for (const g of games ?? []) {
      map[g.id] = g;
    }
    return map;
  }, [games]);

  const pickCount = Object.keys(selected).length;

  const isDirty = useMemo(() => {
    const persistedGameIds = Object.keys(picksByGame);
    const selectedGameIds = Object.keys(selected);
    if (persistedGameIds.length !== selectedGameIds.length) return true;
    for (const gid of selectedGameIds) {
      const persisted = picksByGame[gid];
      if (!persisted) return true;
      if (persisted.picked_side !== selected[gid]) return true;
    }
    for (const gid of persistedGameIds) {
      if (!Object.prototype.hasOwnProperty.call(selected, gid)) return true;
    }
    return false;
  }, [selected, picksByGame]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        picks: Object.entries(selected).map(([gameId, side]) => ({
          game_id: Number(gameId),
          picked_side: side,
        })),
      };
      const { data } = await apiClient.post(
        `/api/weeks/${weekIdNum}/picks`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      setSubmitErrors([]);
      queryClient.invalidateQueries({ queryKey: picksQueryKey });
      setSuccessVisible(true);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setSuccessVisible(false);
      }, 3000);
    },
    onError: (err) => {
      const status = err?.response?.status;
      const errs = err?.response?.data?.errors;
      if (status === 400 && Array.isArray(errs)) {
        setSubmitErrors(errs);
      } else {
        setSubmitErrors([{ game_id: null, error: 'unknown_error' }]);
      }
    },
  });

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

  const handleSubmit = () => {
    submitMutation.mutate();
  };

  const formatErrorMessage = (e) => {
    if (e.error === 'weekly_limit_exceeded') {
      return 'You may only pick 5 games per week.';
    }
    if (e.error === 'malformed_body') {
      return 'Request was malformed. Please refresh and try again.';
    }
    const base = PICK_ERROR_MESSAGES[e.error] ?? `Error: ${e.error}`;
    const game = e.game_id != null ? gamesById[e.game_id] : null;
    if (game) {
      return `${game.away_abbr} @ ${game.home_abbr}: ${base}`;
    }
    return base;
  };

  const weeklyLimitError = submitErrors.find(
    (e) => e.error === 'weekly_limit_exceeded',
  );
  const otherErrors = submitErrors.filter(
    (e) => e.error !== 'weekly_limit_exceeded',
  );

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

        {successVisible && (
          <div className="mb-4 rounded-md bg-green-50 p-3 text-sm font-medium text-green-800 ring-1 ring-green-200">
            Picks saved.
          </div>
        )}

        {weeklyLimitError && (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-sm font-semibold text-red-800 ring-2 ring-red-300">
            {formatErrorMessage(weeklyLimitError)}
          </div>
        )}

        {otherErrors.length > 0 && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
            <p className="font-semibold">Could not save picks:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {otherErrors.map((e, i) => (
                <li key={i}>{formatErrorMessage(e)}</li>
              ))}
            </ul>
          </div>
        )}

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

      <PickBar
        count={pickCount}
        onSubmit={handleSubmit}
        isSubmitting={submitMutation.isPending}
        isDirty={isDirty}
      />
    </div>
  );
}
