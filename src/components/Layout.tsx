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
    { to: '/', icon: LayoutDashboard, label: 'Principal', desc: 'Resumo e indicadores' },
    ...(isMasterAdmin || (role !== 'cell' && role !== 'membro') ? [
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
    <div className="flex min-h-screen flex-col bg-zinc-50 w-full max-w-full overflow-x-hidden print:bg-white print:overflow-visible">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-zinc-200 bg-white px-3 sm:px-6 shadow-sm print:hidden">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 lg:hidden"
            title="Todos os Menus"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-50 shadow-inner">
            {churchSettings?.logoUrl && !logoError ? (
              <img 
                src={churchSettings.logoUrl} 
                alt="Logo" 
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
              />
            ) : (
              <Globe className="text-zinc-300" size={20} />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-lg font-bold tracking-tight text-zinc-900 truncate">
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
        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          {userName && (
            <div className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-zinc-800 max-w-[130px] sm:max-w-[200px]">
              {isMasterAdmin && <Crown size={13} className="text-amber-500 flex-shrink-0" />}
              <span className="truncate">{userName}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 rounded-lg p-1.5 sm:p-2 text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600"
            title="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Mobile Menu Drawer Modal */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-900/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div 
            className="mt-16 max-h-[80vh] w-full overflow-y-auto rounded-b-2xl bg-white p-4 sm:p-5 shadow-2xl border-b border-zinc-200"
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
            <div className="grid grid-cols-2 gap-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) => cn(
                    "flex flex-col items-start gap-1 rounded-xl p-2.5 sm:p-3 text-left transition-all border",
                    isActive 
                      ? "bg-zinc-900 text-white border-zinc-900 shadow-sm" 
                      : "bg-zinc-50 text-zinc-800 border-zinc-100 hover:bg-zinc-100"
                  )}
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex w-full items-center justify-between">
                        <item.icon size={18} className={isActive ? "text-white" : "text-zinc-600"} />
                        {isActive && <div className="h-2 w-2 rounded-full bg-emerald-400" />}
                      </div>
                      <span className="text-xs sm:text-sm font-bold mt-1 truncate w-full">{item.label}</span>
                      <span className={cn("text-[9px] sm:text-[10px] line-clamp-1", isActive ? "text-zinc-300" : "text-zinc-400")}>
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
      <main className="flex-1 w-full max-w-full min-w-0 p-2 sm:p-4 pb-28 lg:pl-64 lg:p-8 lg:pb-8 print:p-0 print:m-0 print:overflow-visible print:w-full print:max-w-none">
        {privateMessageAlert && (
          <div className="fixed top-20 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50 flex items-center gap-4 print:hidden">
            <span>Nova mensagem privada de {privateMessageAlert.senderName}</span>
            <button onClick={() => { navigate('/chat'); setPrivateMessageAlert(null); }} className="bg-white text-blue-600 px-2 py-1 rounded text-sm font-bold">Ver</button>
            <button onClick={() => setPrivateMessageAlert(null)} className="text-white font-bold">X</button>
          </div>
        )}
        <div className="mx-auto max-w-6xl w-full min-w-0 print:max-w-none print:w-full">
          <Outlet />
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white pb-safe pt-1.5 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] lg:hidden print:hidden max-w-full overflow-hidden">
        <div className="mx-auto flex w-full max-w-full items-center justify-start sm:justify-center overflow-x-auto px-1 scrollbar-hide gap-0.5 touch-pan-x">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex flex-shrink-0 flex-col items-center gap-0.5 rounded-xl px-2.5 py-1 transition-all active:scale-90 min-w-[58px]",
                isActive ? "text-zinc-900 font-bold" : "text-zinc-400 hover:text-zinc-600 font-medium"
              )}
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                    isActive ? "bg-zinc-100" : ""
                  )}>
                    <item.icon size={19} strokeWidth={isActive ? 2.5 : 2} />
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
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-shrink-0 flex-col items-center gap-0.5 rounded-xl px-2.5 py-1 text-zinc-400 hover:text-zinc-600 active:scale-90 min-w-[58px]"
            title="Ver todos os menus"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg">
              <Menu size={19} strokeWidth={2} />
            </div>
            <span className="text-[9px] uppercase tracking-wider whitespace-nowrap font-medium">
              Mais
            </span>
            <div className="h-1 w-1 rounded-full bg-transparent" />
          </button>
        </div>
      </nav>

      {/* Desktop Sidebar Navigation */}
      <nav className="hidden lg:block lg:fixed lg:bottom-0 lg:left-0 lg:top-16 lg:z-40 lg:w-64 lg:border-r lg:border-zinc-200 lg:bg-white lg:pt-6 print:hidden">
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
