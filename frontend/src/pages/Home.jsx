import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import apiClient from "../api/client";
import TopNav from "../components/TopNav";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import PageHeader from "../components/PageHeader";

export default function Home() {
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["weeks", "current"],
    queryFn: async () => {
      const { data } = await apiClient.get("/api/weeks/current");
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
      <PageHeader
        eyebrow="NFL Pick 5"
        title="Your week. Your five."
        description="Pick against the spread. Each game locks at kickoff."
      />
      <main className="mx-auto max-w-3xl px-4 py-12">
        {isLoading && <LoadingState label="Finding the current week…" />}
        {noActiveWeek && (
          <ErrorState
            variant="notFound"
            title="No active week"
            message="Check back during the season."
          />
        )}
        {isError && !noActiveWeek && (
          <ErrorState
            error={error}
            message="Failed to load the current week."
            onRetry={refetch}
          />
        )}
      </main>
    </div>
  );
}
