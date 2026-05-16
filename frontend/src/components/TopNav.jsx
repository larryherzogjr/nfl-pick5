import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function HamburgerIcon({ open }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      {open ? (
        <path d="M6 6l12 12M6 18L18 6" />
      ) : (
        <path d="M3 6h18M3 12h18M3 18h18" />
      )}
    </svg>
  );
}

export default function TopNav() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = async () => {
    closeMenu();
    await logout();
    navigate('/login', { replace: true });
  };

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: '/rules', label: 'Rules' },
    { to: '/profile', label: 'Profile' },
    ...(user?.is_admin ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link
            to="/"
            onClick={closeMenu}
            className="whitespace-nowrap text-lg font-semibold text-slate-900"
          >
            NFL Pick 5
          </Link>
          <div className="hidden items-center gap-4 text-sm text-slate-600 sm:flex">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="hover:text-slate-900"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {user && (
            <span className="hidden text-slate-600 sm:inline">
              {user.display_name}
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="hidden min-h-[44px] rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 sm:inline-flex sm:items-center"
          >
            Log out
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-panel"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 sm:hidden"
          >
            <HamburgerIcon open={menuOpen} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          id="mobile-nav-panel"
          className="border-t border-slate-200 bg-white sm:hidden"
        >
          <div className="mx-auto flex max-w-5xl flex-col px-4 py-2">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={closeMenu}
                className="flex min-h-[44px] items-center text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
              {user ? (
                <span className="text-sm text-slate-600">
                  {user.display_name}
                </span>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[44px] rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
