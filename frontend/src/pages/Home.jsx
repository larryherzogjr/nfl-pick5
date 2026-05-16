import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import TopNav from '../components/TopNav';

export default function Home() {
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['weeks', 'current'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/weeks/current');
      return data;
    },
    retry: (failureCount, err) => {
      if (err?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });

  useEffect(() => {
    if (data?.id) {
      navigate(`/week/${data.id}`, { replace: true });
    }
  }, [data, navigate]);

  const noActiveWeek = isError && error?.response?.status === 404;

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-12">
        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
          </div>
        )}
        {noActiveWeek && (
          <div className="rounded-lg bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-slate-900">
              No active week
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Check back during the season.
            </p>
          </div>
        )}
        {isError && !noActiveWeek && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            Failed to load the current week.
          </div>
        )}
      </main>
    </div>
  );
}
