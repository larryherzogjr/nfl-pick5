import TopNav from '../components/TopNav';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-900">Home</h1>
        <p className="mt-2 text-sm text-slate-600">Stub page.</p>
      </main>
    </div>
  );
}
