import { doc, getDoc, updateDoc, collection, query, onSnapshot, where, orderBy } from 'firebase/firestore';
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
  Clock,
  MessageSquare,
  Image as ImageIcon,
  Menu,
  X,
  Crown
} from 'lucide-react';
import { cn, isOwner } from '../lib/utils';
import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';

interface LayoutProps {
  role: string | null;
  userName: string | null;
}

export default function Layout({ role, userName }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [churchSettings, setChurchSettings] = useState<{ name: string; logoUrl?: string } | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [privateMessageAlert, setPrivateMessageAlert] = useState<{senderName: string, senderUid: string} | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'messages'),
      where('recipientUid', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const createdAt = data.createdAt?.toDate();
          if (createdAt && (new Date().getTime() - createdAt.getTime() < 5000) && window.location.pathname !== '/chat') {
            setPrivateMessageAlert({senderName: data.senderName, senderUid: data.senderUid});
          }
        }
      });
    });
    return () => unsubscribe();
  }, [auth.currentUser]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'church'), (sDoc) => {
      if (sDoc.exists()) {
        setChurchSettings(sDoc.data() as any);
        setLogoError(false);
      }
    }, (err) => {
      console.error('Error listening to church settings in layout:', err);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (auth.currentUser) {
      try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { status: 'offline' });
      } catch (err) {
        console.error('Error updating status to offline:', err);
      }
    }
    await signOut(auth);
    navigate('/login');
  };

  const isMasterAdmin = role === 'admin' || isOwner(auth.currentUser?.email, userName);

  const navItems = [
    ...(isMasterAdmin || (role !== 'cell' && role !== 'membro') ? [
      { to: '/', icon: LayoutDashboard, label: 'Principal', desc: 'Resumo e indicadores' },
      { to: '/transactions', icon: ArrowLeftRight, label: 'Lançamentos', desc: 'Dízimos, ofertas e saídas' },
    ] : []),
    ...(isMasterAdmin || role !== 'membro' ? [
      { to: '/cells', icon: UsersIcon, label: 'Células', desc: 'Liderança e encontros' },
      { to: '/reports', icon: FileText, label: 'Relatórios', desc: 'Documentos e PDFs' },
    ] : []),
    { to: '/mural', icon: ImageIcon, label: 'Mural', desc: 'Avisos da igreja' },
    { to: '/chat', icon: MessageSquare, label: 'Chat', desc: 'Mensagens em tempo real' },
    ...(isMasterAdmin || role === 'pastor' || role === 'secretaria' ? [
      { to: '/users', icon: Shield, label: 'Usuários', desc: 'Controle de acessos' },
    ] : []),
    ...(isMasterAdmin || role === 'pastor' ? [
      { to: '/settings', icon: SettingsIcon, label: 'Ajustes', desc: 'Configurações e dados' }
    ] : []),
    ...(isMasterAdmin ? [
      { to: '/logs', icon: Clock, label: 'Logs', desc: 'Histórico de auditoria' },
    ] : [])
  ];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-4 sm:px-6 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 lg:hidden"
            title="Todos os Menus"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          
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
          <div>
            <h1 className="text-base sm:text-xl font-bold tracking-tight text-zinc-900 line-clamp-1">
              {churchSettings?.name || 'Gestão Igreja'}
            </h1>
            {isMasterAdmin && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                <Crown size={12} className="text-amber-500" />
                Painel Master
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {userName && (
            <div className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-800">
              {isMasterAdmin && <Crown size={13} className="text-amber-500" />}
              <span className="max-w-[120px] truncate">{userName}</span>
            </div>
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

      {/* Mobile Menu Drawer Modal */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-900/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div 
            className="mt-16 max-h-[80vh] w-full overflow-y-auto rounded-b-2xl bg-white p-5 shadow-2xl border-b border-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Todos os Menus ({navItems.length})</span>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => cn(
                    "flex flex-col items-start gap-1 rounded-xl p-3 text-left transition-all border",
                    isActive 
                      ? "bg-zinc-900 text-white border-zinc-900 shadow-sm" 
                      : "bg-zinc-50 text-zinc-800 border-zinc-100 hover:bg-zinc-100"
                  )}
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex w-full items-center justify-between">
                        <item.icon size={20} className={isActive ? "text-white" : "text-zinc-600"} />
                        {isActive && <div className="h-2 w-2 rounded-full bg-emerald-400" />}
                      </div>
                      <span className="text-sm font-bold mt-1">{item.label}</span>
                      <span className={cn("text-[10px] line-clamp-1", isActive ? "text-zinc-300" : "text-zinc-400")}>
                        {item.desc}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4 pb-24 lg:ml-64 lg:p-8 lg:pb-8 scrollbar-hide">
        {privateMessageAlert && (
          <div className="fixed top-20 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50 flex items-center gap-4">
            <span>Nova mensagem privada de {privateMessageAlert.senderName}</span>
            <button onClick={() => { navigate('/chat'); setPrivateMessageAlert(null); }} className="bg-white text-blue-600 px-2 py-1 rounded text-sm font-bold">Ver</button>
            <button onClick={() => setPrivateMessageAlert(null)} className="text-white font-bold">X</button>
          </div>
        )}
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white pb-safe pt-1.5 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-start sm:justify-center overflow-x-auto px-2 scrollbar-hide gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex flex-shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-1.5 transition-all active:scale-90 min-w-[62px]",
                isActive ? "text-zinc-900 font-bold" : "text-zinc-400 hover:text-zinc-600 font-medium"
              )}
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                    isActive ? "bg-zinc-100" : ""
                  )}>
                    <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className="text-[9px] uppercase tracking-wider whitespace-nowrap">
                    {item.label}
                  </span>
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
      <nav className="hidden lg:block lg:fixed lg:bottom-0 lg:left-0 lg:top-16 lg:z-40 lg:w-64 lg:border-r lg:border-zinc-200 lg:bg-white lg:pt-6">
        <div className="flex flex-col gap-1.5 px-4">
          <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            Navegação do Sistema
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
                isActive ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              )}
            >
              <item.icon size={19} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
