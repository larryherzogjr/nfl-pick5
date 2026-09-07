import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import apiClient from "../api/client";
import Brand from "./Brand";

export default function TopNav() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: currentWeek } = useQuery({
    queryKey: ["weeks", "current"],
    queryFn: async () => (await apiClient.get("/api/weeks/current")).data,
    retry: false,
  });
  const closeMenu = () => setMenuOpen(false);
  const handleLogout = async () => {
    closeMenu();
    await logout();
    navigate("/login", { replace: true });
  };
  const links = [
    {
      to: "/",
      label: "My picks",
      active: pathname === "/" || pathname.startsWith("/week/"),
    },
    { to: "/leaderboard", label: "Standings" },
    { to: "/rules", label: "Rules" },
    { to: "/profile", label: "Profile" },
    ...(user?.is_admin ? [{ to: "/admin", label: "Admin" }] : []),
  ];
  const renderLinks = () =>
    links.map((link) => (
      <Link
        key={link.to}
        to={link.to}
        onClick={closeMenu}
        aria-current={link.active || pathname === link.to ? "page" : undefined}
        className={`flex min-h-[44px] items-center border-b-2 py-2 text-sm font-medium transition-colors ${pathname === link.to || link.active ? "border-gold text-gold" : "border-transparent text-white/80 hover:text-white"}`}
      >
        {link.label}
      </Link>
    ));
  return (
    <>
      <nav className="bg-field-dark text-white" aria-label="Main navigation">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-5 px-4 py-3 sm:px-7">
          <div className="flex items-center gap-8">
            <Brand onClick={closeMenu} />
            <div className="hidden items-center gap-5 md:flex">
              {renderLinks()}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="hidden max-w-32 truncate text-sm text-white/75 lg:block">
                {user.display_name}
              </span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="hidden min-h-[44px] rounded-md border border-white/25 px-3 text-xs font-semibold text-white/90 hover:bg-white/10 md:block"
            >
              Log out
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-panel"
              aria-label={
                menuOpen ? "Close navigation menu" : "Open navigation menu"
              }
              className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-white/10 md:hidden"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path
                  d={
                    menuOpen
                      ? "M6 6l12 12M6 18L18 6"
                      : "M3 6h18M3 12h18M3 18h18"
                  }
                />
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <div
            id="mobile-nav-panel"
            className="border-t border-white/15 px-4 pb-4 md:hidden"
          >
            <div className="flex flex-col items-start">{renderLinks()}</div>
            <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-3">
              <span className="text-sm text-white/80">
                {user?.display_name}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[44px] rounded-md border border-white/25 px-4 text-sm"
              >
                Log out
              </button>
            </div>
          </div>
        )}
      </nav>
      {currentWeek?.phase === "preseason" && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900">
          Preseason beta — picks and standings do not count toward the regular
          season.
        </div>
      )}
    </>
  );
}
