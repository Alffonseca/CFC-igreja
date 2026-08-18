import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { isOwner } from './lib/utils';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import Reports from './components/Reports';
import Cells from './components/Cells';
import Users from './components/Users';
import Settings from './components/Settings';
import Logs from './components/Logs';
import Mural from './components/Mural';
import Chat from './components/Chat';
import Layout from './components/Layout';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('App: Inicializando onAuthStateChanged');
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('App: Auth state changed, user:', currentUser?.email);
      
      setUserName(null);
      setRole(null);
      setUser(null);
      setLoading(true);

      if (currentUser) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          const currentData = userDoc.exists() ? userDoc.data() : {};
          const isMaster = isOwner(currentUser.email, currentUser.displayName) || isOwner(currentUser.email, currentData.name);

          console.log('App: Iniciando busca no Firestore para:', currentUser.uid, 'isMaster:', isMaster);
          
          if (isMaster) {
            console.log('App: Dono/Master identificado:', currentUser.email, currentData.name);
            const ownerName = currentData.name || currentUser.displayName || 'Administrador (Dono)';
            
            // Garante e corrige no Firestore que o Dono/Admin é sempre role: 'admin'
            await setDoc(userDocRef, {
              uid: currentUser.uid,
              name: ownerName,
              email: currentUser.email,
              role: 'admin',
              status: 'online',
              lastSeen: serverTimestamp()
            }, { merge: true });

            setUser(currentUser);
            setRole('admin');
            setUserName(ownerName);
            setLoading(false);
          } else if (userDoc.exists()) {
            const data = userDoc.data();
            console.log('App: Dados do usuário encontrados:', data);
            await setDoc(userDocRef, { status: 'online', lastSeen: serverTimestamp() }, { merge: true });
            setUser(currentUser);
            setRole(data.role);
            setUserName(data.name);
            setLoading(false);
          } else {
            console.log('App: Usuário não autorizado.');
            await auth.signOut();
            alert('Acesso não autorizado. Entre em contato com o administrador para ser cadastrado.');
            setUser(null);
            setRole(null);
            setUserName(null);
            setLoading(false);
          }
        } catch (error) {
          console.error('App: Erro ao buscar documento do usuário:', error);
          const fallbackIsMaster = isOwner(currentUser.email, currentUser.displayName);
          if (fallbackIsMaster) {
            setUser(currentUser);
            setRole('admin');
            setUserName(currentUser.displayName || 'Administrador (Dono)');
          }
          setLoading(false);
        }
      } else {
        console.log('App: Usuário não logado.');
        setUser(null);
        setRole(null);
        setUserName(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const updateLastSeen = async () => {
      try {
        await setDoc(doc(db, 'users', user.uid), { lastSeen: serverTimestamp() }, { merge: true });
      } catch (error) {
        console.error('App: Erro ao atualizar lastSeen:', error);
      }
    };

    updateLastSeen();
    const interval = setInterval(updateLastSeen, 60000); // Atualiza a cada 1 minuto

    return () => clearInterval(interval);
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-900 border-t-transparent"></div>
      </div>
    );
  }

  const isMasterAdmin = role === 'admin' || isOwner(user?.email, userName);

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        
        <Route element={user ? <Layout key={user.uid} role={isMasterAdmin ? 'admin' : role} userName={userName} /> : <Navigate to="/login" />}>
          <Route path="/" element={(!isMasterAdmin && (role === 'cell' || role === 'membro')) ? <Navigate to="/cells" /> : <Dashboard />} />
          <Route path="/transactions" element={(!isMasterAdmin && (role === 'cell' || role === 'membro')) ? <Navigate to="/cells" /> : <Transactions />} />
          <Route path="/cells" element={<Cells />} />
          <Route path="/reports" element={(!isMasterAdmin && role === 'membro') ? <Navigate to="/" /> : <Reports role={isMasterAdmin ? 'admin' : role} />} />
          <Route path="/users" element={(isMasterAdmin || role === 'pastor' || role === 'secretaria') ? <Users /> : <Navigate to="/" />} />
          <Route path="/logs" element={isMasterAdmin ? <Logs /> : <Navigate to="/" />} />
          <Route path="/mural" element={<Mural />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/settings" element={(isMasterAdmin || role === 'pastor') ? <Settings role={isMasterAdmin ? 'admin' : role} /> : <Navigate to="/" />} />
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </HashRouter>
  );
}

