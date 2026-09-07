import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import TopNav from "../components/TopNav";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import { buildWeeklyCells, perfectWeekCount } from "../utils/standings";

const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const AVATAR_ERROR_MESSAGES = {
  file_too_large: "File is too large (max 5 MB)",
  invalid_type: "Please choose a JPEG, PNG, WebP, or GIF",
  invalid_image: "That file doesn't look like a valid image",
  no_file: "No file selected",
  upload_failed: "Upload failed. Try again.",
};

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function formatMemberSince(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

function ProviderPill({ provider }) {
  if (provider !== "google") return null;
  return (
    <span className="mt-2 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
      Signed in with Google
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

function AvatarUploader() {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const mutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await apiClient.post("/auth/me/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) {
            setProgress(Math.round((e.loaded * 100) / e.total));
          }
        },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setProgress(0);
      setError(null);
    },
    onError: (err) => {
      const code = err.response?.data?.error;
      setError(code || "upload_failed");
      setProgress(0);
    },
  });

  const onChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > MAX_AVATAR_SIZE) {
      setError("file_too_large");
      return;
    }
    mutation.mutate(file);
  };

  const openPicker = () => {
    if (mutation.isPending) return;
    setError(null);
    inputRef.current?.click();
  };

  const errorMessage = error
    ? AVATAR_ERROR_MESSAGES[error] || AVATAR_ERROR_MESSAGES.upload_failed
    : null;

  return (
    <div className="mt-2 flex flex-col items-start">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={onChange}
        className="hidden"
      />
      {mutation.isPending ? (
        <span className="text-xs font-medium text-slate-500">
          Uploading… {progress}%
        </span>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          Change
        </button>
      )}
      {errorMessage && (
        <p className="mt-1 text-xs text-red-700">{errorMessage}</p>
      )}
    </div>
  );
}

function DisplayNameEditor({ user, onDone }) {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [value, setValue] = useState(user.display_name ?? "");
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const trimmed = value.trim();
  const isEmpty = trimmed.length === 0;
  const isUnchanged = trimmed === (user.display_name ?? "").trim();
  const isTooLong = trimmed.length > MAX_DISPLAY_NAME_LENGTH;
  const canSave = !isEmpty && !isUnchanged && !isTooLong;

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.patch("/auth/me", {
        display_name: trimmed,
      });
      return data;
    },
    onSuccess: () => {
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      onDone();
    },
    onError: () => {
      setErrorMessage("Couldn't update name — please try again");
    },
  });

  const submit = () => {
    if (!canSave || mutation.isPending) return;
    mutation.mutate();
  };

  const cancel = () => {
    if (mutation.isPending) return;
    setValue(user.display_name ?? "");
    onDone();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={mutation.isPending}
        maxLength={MAX_DISPLAY_NAME_LENGTH + 1}
        aria-label="Display name"
        className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-2xl font-bold text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:cursor-not-allowed disabled:bg-slate-50"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSave || mutation.isPending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={mutation.isPending}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
      {errorMessage && (
        <p className="mt-2 text-xs text-red-700">{errorMessage}</p>
      )}
    </div>
  );
}

function providerDisplayName(provider) {
  if (provider === "google") return "Google";
  return "your original provider";
}

function ResetToOauthLink({ user }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post("/auth/me/reset-to-oauth");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (err) => {
      console.error("Reset-to-OAuth failed", err);
    },
  });

  const onClick = () => {
    if (mutation.isPending) return;
    const ok = window.confirm(
      `Reset your name to '${user.oauth_display_name}' and your avatar to your ${providerDisplayName(user.oauth_provider)} profile picture?`,
    );
    if (!ok) return;
    mutation.mutate();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={mutation.isPending}
      className="text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {mutation.isPending ? "Resetting…" : "Reset to OAuth info"}
    </button>
  );
}

function IdentityCard({ user }) {
  const memberSince = formatMemberSince(user.created_at);
  const [isEditing, setIsEditing] = useState(false);
  const canReset =
    user.display_name !== user.oauth_display_name ||
    user.avatar_url !== user.oauth_avatar_url;
  return (
    <section className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start gap-4">
        <div className="flex flex-none flex-col items-center">
          <IdentityAvatar url={user.avatar_url} name={user.display_name} />
          <AvatarUploader />
        </div>
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <DisplayNameEditor user={user} onDone={() => setIsEditing(false)} />
          ) : (
            <div className="flex items-start gap-3">
              <h1 className="truncate text-2xl font-bold text-slate-900">
                {user.display_name}
              </h1>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="mt-1 shrink-0 text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                Edit
              </button>
            </div>
          )}
          {user.email && (
            <p className="mt-1 truncate text-sm text-slate-500">{user.email}</p>
          )}
          <ProviderPill provider={user.oauth_provider} />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        {memberSince ? (
          <p className="text-xs text-slate-500">Member since {memberSince}</p>
        ) : (
          <span />
        )}
        {canReset && <ResetToOauthLink user={user} />}
      </div>
    </section>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-md bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 font-display text-4xl text-slate-900">{value}</div>
    </div>
  );
}

function weeklyCellClass(cell) {
  if (cell.points == null) {
    return "bg-slate-50 text-slate-300 ring-slate-200";
  }
  if (cell.isPerfect) {
    return "bg-emerald-100 text-emerald-900 ring-emerald-300";
  }
  if (cell.points === 0) {
    return "bg-red-50 text-red-700 ring-red-200";
  }
  return "bg-white text-slate-800 ring-slate-200";
}

function WeeklyStrip({ breakdown, minimumWeeks = 18, prefix = "W" }) {
  const cells = buildWeeklyCells(breakdown, minimumWeeks);
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-slate-700">Weekly breakdown</h3>
      <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-9">
        {cells.map((c) => (
          <div
            key={c.week}
            className={`flex flex-col items-center justify-center rounded-md px-1 py-2 text-sm shadow-sm ring-1 ${weeklyCellClass(c)}`}
            title={
              c.points == null
                ? `${prefix}${c.week}: not graded`
                : `${prefix}${c.week}: ${c.points} pts${c.isPerfect ? " — perfect" : ""}`
            }
          >
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-75">
              {prefix}
              {c.week}
            </span>
            <span className="mt-0.5 font-semibold">
              {c.points == null ? "—" : c.points}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSpreadValue(spread) {
  if (spread === 0) return "PK";
  if (spread > 0) return `+${spread}`;
  return `${spread}`;
}

function formatLockedSpread(pick) {
  const spread = pick.spread_at_pick;
  if (spread === null || spread === undefined) return "—";
  if (pick.picked_side === "push") {
    return `Push ${formatSpreadValue(spread)}`;
  }
  if (pick.picked_side === "home") {
    return `${pick.home_abbr} ${formatSpreadValue(spread)}`;
  }
  const awaySpread = spread === 0 ? 0 : -spread;
  return `${pick.away_abbr} ${formatSpreadValue(awaySpread)}`;
}

function formatKickoffShort(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function PickedSideBadge({ pick }) {
  let label;
  if (pick.picked_side === "home") label = pick.home_abbr;
  else if (pick.picked_side === "away") label = pick.away_abbr;
  else label = "Push";
  return (
    <span className="inline-flex items-center rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
      {label}
    </span>
  );
}

function PickOutcome({ pick }) {
  if (!pick.is_final) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs text-slate-500">
          {formatKickoffShort(pick.kickoff)}
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
          Pending
        </span>
      </div>
    );
  }
  const scored =
    pick.points_awarded !== null && pick.points_awarded !== undefined;
  const won = scored && pick.points_awarded > 0;
  const score =
    pick.score_home !== null && pick.score_away !== null
      ? `${pick.away_abbr} ${pick.score_away} – ${pick.home_abbr} ${pick.score_home}`
      : "Final";
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-xs font-medium text-slate-700">{score}</span>
      {won ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
          <span aria-hidden="true">✓</span>+{pick.points_awarded} pt
          {pick.points_awarded === 1 ? "" : "s"}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
          <span aria-hidden="true">✗</span>0 pts
        </span>
      )}
    </div>
  );
}

function PickRow({ pick }) {
  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div
          className="text-sm font-semibold text-slate-900"
          title={`${pick.away_team} @ ${pick.home_team}`}
        >
          <span className="text-slate-500">{pick.away_abbr}</span>{" "}
          <span className="font-normal text-slate-400">@</span>{" "}
          <span>{pick.home_abbr}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-slate-500">
          {pick.away_team} @ {pick.home_team}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-medium text-slate-700">
            Locked: {formatLockedSpread(pick)}
          </span>
          <span className="text-slate-400">•</span>
          <span className="inline-flex items-center gap-1 text-slate-600">
            Picked: <PickedSideBadge pick={pick} />
          </span>
        </div>
      </div>
      <div className="shrink-0">
        <PickOutcome pick={pick} />
      </div>
    </li>
  );
}

function WeekCard({ week, isExpanded, onToggle }) {
  const total = week.picks.length;
  const graded = week.picks.filter(
    (p) => p.points_awarded !== null && p.points_awarded !== undefined,
  ).length;
  const correct = week.picks.filter(
    (p) =>
      p.points_awarded !== null &&
      p.points_awarded !== undefined &&
      p.points_awarded > 0,
  ).length;
  const pending = total - graded;
  let summary;
  if (pending === 0) {
    summary = `${week.week_label} — ${correct} of ${total} correct`;
  } else if (graded === 0) {
    summary = `${week.week_label} — ${total} pending`;
  } else {
    summary = `${week.week_label} — ${correct} of ${graded} correct, ${pending} pending`;
  }
  const panelId = `pick-history-week-${week.week_id}`;
  return (
    <li className="overflow-hidden rounded-md ring-1 ring-slate-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <span className="text-sm font-semibold text-slate-900">{summary}</span>
        <span
          aria-hidden="true"
          className={`text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
        >
          ▶
        </span>
      </button>
      {isExpanded && (
        <ul
          id={panelId}
          className="divide-y divide-slate-100 border-t border-slate-200 bg-slate-50/30"
        >
          {week.picks.map((p) => (
            <PickRow key={p.pick_id} pick={p} />
          ))}
        </ul>
      )}
    </li>
  );
}

function PickHistoryCard({ data }) {
  const weeks = data?.weeks ?? [];
  const firstWeekId = weeks[0]?.week_id ?? null;
  const [overrides, setOverrides] = useState({});

  if (weeks.length === 0) {
    return (
      <section className="mt-6 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Pick History</h2>
        <p className="mt-3 text-sm text-slate-500">No picks yet</p>
      </section>
    );
  }

  const isExpanded = (weekId) => {
    if (overrides[weekId] !== undefined) return overrides[weekId];
    return weekId === firstWeekId;
  };

  return (
    <section className="mt-6 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold text-slate-900">Pick History</h2>
      <ul className="mt-4 flex flex-col gap-2">
        {weeks.map((w) => (
          <WeekCard
            key={w.week_id}
            week={w}
            isExpanded={isExpanded(w.week_id)}
            onToggle={() =>
              setOverrides((prev) => ({
                ...prev,
                [w.week_id]: !isExpanded(w.week_id),
              }))
            }
          />
        ))}
      </ul>
    </section>
  );
}

function StatsCard({ season, entries, currentUserId, preseason = false }) {
  const myEntry = (entries ?? []).find((e) => e.user.id === currentUserId);
  const points = myEntry?.points ?? 0;
  const picksMade = myEntry?.total_picked ?? 0;
  const breakdown = myEntry?.weekly_breakdown ?? [];
  const perfectWeeks = perfectWeekCount(myEntry);
  const rank = myEntry?.rank ?? "—";

  return (
    <section className="mt-6 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold text-slate-900">
        {preseason
          ? `${season.label} Preseason Test`
          : `${season.label} Season`}
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Points" value={points} />
        <StatTile label="Picks made" value={picksMade} />
        <StatTile label="Perfect weeks" value={perfectWeeks} />
        <StatTile
          label={preseason ? "Preseason rank" : "Season rank"}
          value={rank}
        />
      </div>
      <WeeklyStrip
        breakdown={breakdown}
        minimumWeeks={preseason ? 3 : 18}
        prefix={preseason ? "P" : "W"}
      />
    </section>
  );
}

export default function Profile() {
  const { user } = useAuth();

  const { data: currentWeek } = useQuery({
    queryKey: ["weeks", "current"],
    queryFn: async () => (await apiClient.get("/api/weeks/current")).data,
    retry: false,
  });
  const preseason = currentWeek?.phase === "preseason";

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

  const seasonNotFound = seasonIsError && seasonError?.response?.status === 404;

  const {
    data: entries,
    isLoading: entriesLoading,
    isError: entriesIsError,
    error: entriesError,
    refetch: refetchEntries,
  } = useQuery({
    queryKey: [
      "leaderboard",
      "season",
      season?.id,
      preseason ? "preseason" : null,
    ],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/leaderboard", {
        params: {
          season_id: season.id,
          ...(preseason ? { phase: "preseason" } : {}),
        },
      });
      return data;
    },
    enabled: !!season?.id,
  });

  const {
    data: pickHistory,
    isLoading: pickHistoryLoading,
    isError: pickHistoryIsError,
    error: pickHistoryError,
    refetch: refetchPickHistory,
  } = useQuery({
    queryKey: ["users", "me", "picks", season?.id],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/users/me/picks", {
        params: { season_id: season.id },
      });
      return data;
    },
    enabled: !!season?.id,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <PageHeader
        eyebrow="NFL Pick 5 · Profile"
        title="Your season."
        description="Your picks, your points, your place in the standings."
      />
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
                preseason={preseason}
              />
            )}

            {season && pickHistoryLoading && (
              <div className="mt-6">
                <LoadingState label="Loading pick history…" />
              </div>
            )}

            {season && pickHistoryIsError && (
              <div className="mt-6">
                <ErrorState
                  error={pickHistoryError}
                  message="Failed to load pick history."
                  onRetry={refetchPickHistory}
                />
              </div>
            )}

            {season && !pickHistoryLoading && !pickHistoryIsError && (
              <PickHistoryCard data={pickHistory} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
