import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function Login() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg bg-white p-8 shadow">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">NFL Pick 5</h1>
          <p className="mt-2 text-sm text-slate-600">Sign in to make your picks.</p>
        </div>
        <div className="space-y-3">
          <a
            href={`${API_BASE}/auth/login/google`}
            className="block w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Sign in with Google
          </a>
          <a
            href={`${API_BASE}/auth/login/meta`}
            className="block w-full rounded-md bg-[#1877F2] px-4 py-2 text-center text-sm font-medium text-white shadow-sm hover:bg-[#166FE5]"
          >
            Sign in with Meta
          </a>
        </div>
      </div>
    </div>
  );
}
