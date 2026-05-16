import { useParams } from 'react-router-dom';
import TopNav from '../components/TopNav';

export default function WeekView() {
  const { weekId } = useParams();
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-900">WeekView</h1>
        <p className="mt-2 text-sm text-slate-600">Stub for week {weekId}.</p>
      </main>
    </div>
  );
}
