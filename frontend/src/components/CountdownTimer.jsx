import { useEffect, useState } from 'react';

function computeRemaining(kickoff) {
  return new Date(kickoff).getTime() - Date.now();
}

function formatRemaining(ms) {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m`;
}

export default function CountdownTimer({ kickoff }) {
  const [remaining, setRemaining] = useState(() => computeRemaining(kickoff));

  useEffect(() => {
    setRemaining(computeRemaining(kickoff));
    const interval = setInterval(() => {
      setRemaining(computeRemaining(kickoff));
    }, 60_000);
    return () => clearInterval(interval);
  }, [kickoff]);

  if (remaining <= 0) {
    return (
      <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
        LOCKED
      </span>
    );
  }
  return (
    <span className="font-mono text-xs text-slate-600">
      {formatRemaining(remaining)}
    </span>
  );
}
