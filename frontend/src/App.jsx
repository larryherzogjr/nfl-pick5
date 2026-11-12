import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Home from "./pages/Home";
import WeekView from "./pages/WeekView";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import AdminPanel from "./pages/AdminPanel";
import Rules from "./pages/Rules";
import productBadge from "./assets/herzog-enclave-product-badge.png";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <div className="grid min-h-dvh grid-cols-1 grid-rows-[1fr_auto] bg-slate-50 has-[.pick-footer]:pb-40">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/rules" element={<Rules />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Home />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/week/:weekId"
                element={
                  <ProtectedRoute>
                    <WeekView />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leaderboard"
                element={
                  <ProtectedRoute>
                    <Leaderboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminPanel />
                  </ProtectedRoute>
                }
              />
            </Routes>
            <footer className="row-start-2 flex justify-end p-4 sm:px-7">
              <a
                href="https://herzogenclave.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-56 max-w-full"
              >
                <img
                  src={productBadge}
                  alt="A product by Herzog Enclave (opens in a new tab)"
                  width={2290}
                  height={590}
                  className="h-auto w-full"
                />
              </a>
            </footer>
          </div>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
