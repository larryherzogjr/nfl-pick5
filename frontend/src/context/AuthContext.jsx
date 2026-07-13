import { createContext, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "../api/client";

const AuthContext = createContext(null);

const AUTH_QUERY_KEY = ["auth", "me"];

async function fetchMe() {
  try {
    const { data } = await apiClient.get("/auth/me");
    return data;
  } catch (err) {
    if (err.response && err.response.status === 401) {
      return null;
    }
    throw err;
  }
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const value = useMemo(() => {
    const refresh = () =>
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    const logout = async () => {
      await apiClient.post("/auth/logout");
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    };
    return {
      user: user ?? null,
      isLoading,
      isAuthenticated: !!user,
      refresh,
      logout,
    };
  }, [user, isLoading, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
