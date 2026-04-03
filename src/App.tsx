import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import Reports from './components/Reports';
import Cells from './components/Cells';
import Users from './components/Users';
import Settings from './components/Settings';
import Logs from './components/Logs';
import Layout from './components/Layout';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          setUser(currentUser);
          setRole(userDoc.data().role);
          setUserName(userDoc.data().name);
          setLoading(false);
        } else if (currentUser.email === 'emailparasiteslixo@gmail.com') {
          // Allow admin to access even if not in users collection (for first setup)
          setUser(currentUser);
          setRole('admin');
          setUserName('Administrador');
          setLoading(false);
        } else {
          // Not authorized
          await auth.signOut();
          alert('Acesso não autorizado. Entre em contato com o administrador para ser cadastrado.');
          setUser(null);
          setRole(null);
          setUserName(null);
          setLoading(false);
        }
      } else {
        setUser(null);
        setRole(null);
        setUserName(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-900 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        
        <Route element={user ? <Layout role={role} userName={userName} /> : <Navigate to="/login" />}>
          <Route path="/" element={role === 'cell' ? <Navigate to="/cells" /> : <Dashboard />} />
          <Route path="/transactions" element={role === 'cell' ? <Navigate to="/cells" /> : <Transactions />} />
          <Route path="/cells" element={<Cells />} />
          <Route path="/reports" element={<Reports role={role} />} />
          <Route path="/users" element={role === 'admin' ? <Users /> : <Navigate to="/" />} />
          <Route path="/logs" element={role === 'admin' ? <Logs /> : <Navigate to="/" />} />
          <Route path="/settings" element={role === 'admin' ? <Settings /> : <Navigate to="/" />} />
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </HashRouter>
  );
}
