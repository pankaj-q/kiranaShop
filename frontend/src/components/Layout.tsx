import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../state/auth'
import { LogOut, Store, User } from 'lucide-react'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate(user?.role === 'OWNER' ? '/admin/login' : '/login')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to={user?.role === 'OWNER' ? '/admin' : '/'} className="brand">
          <Store size={20} />
          <span>MajitKirana</span>
        </Link>
        {user && (
          <div className="topbar-right">
            <span className="who">
              <User size={16} />
              {user.name}
            </span>
            <button className="icon-btn" onClick={handleLogout} aria-label="Logout">
              <LogOut size={18} />
            </button>
          </div>
        )}
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  )
}
