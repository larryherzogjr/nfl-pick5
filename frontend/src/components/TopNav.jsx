import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function TopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold text-slate-900">
            NFL Pick 5
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <Link to="/" className="hover:text-slate-900">Home</Link>
            <Link to="/leaderboard" className="hover:text-slate-900">Leaderboard</Link>
            <Link to="/profile" className="hover:text-slate-900">Profile</Link>
            {user?.is_admin && (
              <Link to="/admin" className="hover:text-slate-900">Admin</Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user && <span className="text-slate-600">{user.display_name}</span>}
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      </div>
    </nav>
  );
}
