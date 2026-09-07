import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import apiBaseUrl from "../api/baseUrl";
import Brand from "../components/Brand";

const EMBEDDED_WEBVIEW_REGEX =
  /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter|TikTok/;

export default function Login() {
  const { isLoading, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    setIsEmbedded(EMBEDDED_WEBVIEW_REGEX.test(navigator.userAgent));
  }, []);

  const showWarning = isEmbedded && !bannerDismissed;
  const loginError = searchParams.get("error");

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
    <div className="flex min-h-screen flex-col bg-cream">
      <nav className="bg-field-dark px-6 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Brand />
          <Link
            to="/rules"
            className="text-sm font-medium text-white/80 hover:text-white"
          >
            The rules
          </Link>
        </div>
      </nav>
      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center px-4 py-10">
        <div className="grid w-full overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-2">
          <div className="field-banner flex flex-col justify-center p-8 sm:p-10">
            <p className="eyebrow text-white/80">NFL Pick 5</p>
            <h1 className="page-title mt-4">
              Your week.
              <br />
              Your five.
            </h1>
            <p className="mt-5 text-sm leading-relaxed text-white/90">
              Five picks against the spread. A season of bragging rights.
            </p>
          </div>
          <div className="space-y-6 p-8 sm:py-12">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Ready for kickoff?
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Sign in to make your picks.
              </p>
            </div>
            {loginError === "email_already_registered" && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                That email is already registered. Sign in with the Google
                account originally used to create it.
              </div>
            )}
            {showWarning && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">Google sign-in is blocked here</p>
                <p className="mt-1">
                  Google blocks sign-in from in-app browsers for security. To
                  use Google, tap the <span className="font-semibold">⋯</span>{" "}
                  menu and choose{" "}
                  <span className="font-semibold">
                    &ldquo;Open in Browser&rdquo;
                  </span>
                  , or copy this link into Safari or Chrome.
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
                  href={`${apiBaseUrl}/auth/login/google`}
                  className="block min-h-[48px] w-full rounded-md bg-gold px-4 py-3 text-center text-sm font-bold text-slate-900 hover:bg-amber-300"
                >
                  Sign in with Google
                </a>
              )}
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Make your picks now. Change them any time before each game kicks
              off.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
