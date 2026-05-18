import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const EMBEDDED_WEBVIEW_REGEX = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter|TikTok/;

export default function Login() {
  const { isLoading, isAuthenticated } = useAuth();
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    setIsEmbedded(EMBEDDED_WEBVIEW_REGEX.test(navigator.userAgent));
  }, []);

  const showWarning = isEmbedded && !bannerDismissed;

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
        {showWarning && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Google sign-in is blocked here</p>
            <p className="mt-1">
              Google blocks sign-in from in-app browsers for security. To use Google,
              tap the <span className="font-semibold">⋯</span> menu and choose{' '}
              <span className="font-semibold">&ldquo;Open in Browser&rdquo;</span>, or
              copy this link into Safari or Chrome.
            </p>
            <p className="mt-2">
              <span className="font-semibold">Sign in with Facebook</span> works in
              this browser.
            </p>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="mt-2 rounded border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="space-y-3">
          {showWarning ? (
            <button
              type="button"
              disabled
              title="Open this page in Safari/Chrome to use Google sign-in"
              className="block w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 shadow-sm opacity-50 cursor-not-allowed"
            >
              Sign in with Google
            </button>
          ) : (
            <a
              href={`${API_BASE}/auth/login/google`}
              className="block w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Sign in with Google
            </a>
          )}
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
