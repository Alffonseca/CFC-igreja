import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { 
  LayoutDashboard, 
  ArrowLeftRight, 
  FileText, 
  Users as UsersIcon, 
  Settings as SettingsIcon, 
  LogOut,
  Shield,
  Globe,
  Clock
} from 'lucide-react';
import { cn } from '../lib/utils';

interface LayoutProps {
  role: string | null;
  userName: string | null;
}

export default function Layout({ role, userName }: LayoutProps) {
  const navigate = useNavigate();
  const [churchSettings, setChurchSettings] = useState<{ name: string; logoUrl?: string } | null>(null);

  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const sDoc = await getDoc(doc(db, 'settings', 'church'));
        if (sDoc.exists()) {
          setChurchSettings(sDoc.data() as any);
        }
      } catch (err) {
        console.error('Error fetching church settings in layout:', err);
      }
    };
    fetchSettings();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const navItems = [
    ...(role !== 'cell' ? [
      { to: '/', icon: LayoutDashboard, label: 'Principal' },
      { to: '/transactions', icon: ArrowLeftRight, label: 'Lancamentos' },
    ] : []),
    { to: '/cells', icon: UsersIcon, label: 'Celulas' },
    { to: '/reports', icon: FileText, label: 'Relatorios' },
    ...(role === 'admin' ? [
      { to: '/users', icon: Shield, label: 'Usuarios' },
      { to: '/logs', icon: Clock, label: 'Logs' },
      { to: '/settings', icon: SettingsIcon, label: 'Ajustes' }
    ] : [])
  ];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-zinc-50 shadow-inner">
            {churchSettings?.logoUrl && !logoError ? (
              <img 
                src={churchSettings.logoUrl} 
                alt="Logo" 
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
              />
            ) : (
              <Globe className="text-zinc-300" size={24} />
            )}
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">
            {churchSettings?.name || 'Gestao Igreja'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {userName && (
            <span className="text-sm font-medium text-zinc-600 hidden sm:block">
              {userName}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600"
            title="Sair"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4 pb-24 lg:ml-64 lg:p-8 lg:pb-8 scrollbar-hide">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white pb-safe pt-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between overflow-x-auto px-4 scrollbar-hide">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex flex-shrink-0 flex-col items-center gap-1 rounded-xl px-4 py-2 transition-all active:scale-90",
                isActive ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"
              )}
            >
              {({ isActive }) => (
                <>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors">
                    <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider transition-colors",
                    isActive ? "text-zinc-900" : "text-zinc-400"
                  )}>
                    {item.label}
                  </span>
                  {/* Indicator dot for active state */}
                  <div className={cn(
                    "h-1 w-1 rounded-full transition-all duration-300",
                    isActive ? "bg-zinc-900 scale-100 opacity-100" : "bg-transparent scale-0 opacity-0"
                  )} />
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Desktop Sidebar Navigation */}
      <nav className="hidden lg:fixed lg:bottom-0 lg:left-0 lg:top-16 lg:z-40 lg:w-64 lg:border-r lg:border-zinc-200 lg:bg-white lg:pt-8">
        <div className="flex flex-col gap-2 px-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all",
                isActive ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              )}
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
