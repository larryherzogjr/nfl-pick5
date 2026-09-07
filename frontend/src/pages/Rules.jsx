import { Link } from "react-router-dom";
import TopNav from "../components/TopNav";
import { useAuth } from "../context/AuthContext";
import Brand from "../components/Brand";
import PageHeader from "../components/PageHeader";

const RULES = [
  <>
    Each week during the NFL season, you pick{" "}
    <strong>5 games against the spread</strong>.
  </>,
  <>
    You may change your picks at any time{" "}
    <strong>before that game’s kickoff</strong>.
  </>,
  <>
    Once a game kicks off, your pick for that game is <strong>locked</strong>.
  </>,
  <>
    You do not have to make all 5 picks at once — you can pick games as lines
    are posted and come back later.
  </>,
  <>
    <strong>The spread is locked when you make your pick.</strong> If you change
    your pick later, the new pick uses the spread current at that moment. No
    exceptions.
  </>,
  <>
    After each game is final, your pick is graded against your snapshotted
    spread:
    <ul className="mt-2 ml-6 list-disc space-y-1 text-slate-700">
      <li>
        Picking the side that covers earns <strong>1 point</strong>.
      </li>
      <li>
        On <strong>whole-number spreads only</strong>, you may pick{" "}
        <strong>PUSH</strong> as a third option. A correct push pick earns{" "}
        <strong>2 points</strong>.
      </li>
      <li>
        A push outcome on a game where you picked home or away earns{" "}
        <strong>0 points</strong> — you had the option to pick push.
      </li>
    </ul>
  </>,
  <>
    Other players’ picks are visible to you only{" "}
    <strong>after each respective game kicks off</strong>.
  </>,
  <>
    The <strong>season leaderboard</strong> ranks players by{" "}
    <strong>total points</strong> across official weeks. Preseason beta results
    have a separate test leaderboard and do not count toward the season.
  </>,
  <>
    <strong>Tiebreaker:</strong> the player with more{" "}
    <strong>perfect weeks</strong> ranks higher. A perfect week is one where all
    5 of your picks scored at least 1 point. Push values don’t matter for the
    tiebreaker — five 1-point covers is the same as five 2-point pushes.
  </>,
  <>
    If players are still tied after the perfect-weeks tiebreaker, they share the
    rank (<strong>co-ranking</strong>).
  </>,
];

function PublicHeader() {
  return (
    <nav className="bg-field-dark">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-7">
        <Brand />
        <Link
          to="/login"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign in
        </Link>
      </div>
    </nav>
  );
}

export default function Rules() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      {isAuthenticated ? <TopNav /> : <PublicHeader />}
      <PageHeader
        eyebrow="NFL Pick 5 · The playbook"
        title="Know the game."
        description="Five picks. Every week. Here’s how it works."
      />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <ol className="space-y-4">
          {RULES.map((rule, idx) => (
            <li
              key={idx}
              className="flex gap-4 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {idx + 1}
              </span>
              <div className="flex-1 text-sm leading-relaxed text-slate-700">
                {rule}
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
