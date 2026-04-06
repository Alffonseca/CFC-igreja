import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, onSnapshot, setDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as secondarySignOut, sendEmailVerification, updatePassword, updateEmail, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { Plus, Edit2, Trash2, UserPlus, X, Shield, User as UserIcon, Lock, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { logAction } from '../lib/logger';

interface UserProfile {
  id: string;
  uid?: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'cell' | 'pastor' | 'secretaria' | 'membro';
  createdAt: any;
}

const INTERNAL_DOMAIN = '@gestao.igreja';

export default function Users() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user' as 'admin' | 'user' | 'cell' | 'pastor' | 'secretaria' | 'membro'
  });

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = new Date().getTime();
      const data = snapshot.docs.map(doc => {
        const userData = doc.data();
        const lastSeen = userData.lastSeen?.toDate().getTime() || 0;
        const isOnline = (now - lastSeen) < 5 * 60 * 1000; // 5 minutos
        return { 
          id: doc.id, 
          ...userData, 
          status: isOnline ? 'online' : 'offline' 
        } as UserProfile & { status: string };
      });
      setUsers(data);
      
      const myProfile = data.find(u => u.uid === auth.currentUser?.uid || u.id === auth.currentUser?.uid);
      setCurrentUserProfile(myProfile || null);
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Generate email, and if it's not the main admin email, use the provided email/username
      const baseEmail = formData.email.includes('@') && formData.email !== 'emailparasiteslixo@gmail.com'
        ? formData.email.split('@')[0]
        : formData.email.includes('@')
          ? formData.email.split('@')[0]
          : formData.email;
      
      const emailToUse = formData.email === 'emailparasiteslixo@gmail.com' 
        ? formData.email
        : `${baseEmail}${INTERNAL_DOMAIN}`;

      console.log('Tentando salvar usuário com e-mail/login:', emailToUse);
      console.log('FormData:', formData);

      if (editingUser) {
        // Update Firestore document
        await updateDoc(doc(db, 'users', editingUser.id), {
          name: formData.name,
          email: emailToUse,
          role: formData.role,
        });
        await logAction('Editar Usuario', `Editou usuario: ${formData.name} (${emailToUse})`);

        // If editing current user and email/username changed, update it in Auth
        if (editingUser.uid === auth.currentUser?.uid && emailToUse !== auth.currentUser?.email) {
          try {
            await updateEmail(auth.currentUser, emailToUse);
          } catch (emailErr: any) {
            console.error('Erro ao atualizar e-mail:', emailErr);
            if (emailErr.code === 'auth/requires-recent-login') {
              alert('Para alterar seu nome de usuário, você precisa ter feito login recentemente. Por favor, saia e entre novamente.');
            } else {
              alert('Erro ao atualizar nome de usuário: ' + (emailErr.message || 'Erro desconhecido'));
            }
          }
        }

        // If editing current user and password provided, update it
        if (editingUser.uid === auth.currentUser?.uid && formData.password) {
          try {
            await updatePassword(auth.currentUser, formData.password);
            alert('Senha atualizada com sucesso!');
          } catch (passErr: any) {
            console.error('Erro ao atualizar senha:', passErr);
            if (passErr.code === 'auth/requires-recent-login') {
              alert('Para alterar sua senha, você precisa ter feito login recentemente. Por favor, saia e entre novamente.');
            } else {
              alert('Erro ao atualizar senha: ' + (passErr.message || 'Erro desconhecido'));
            }
          }
        }
      } else {
        // Use a secondary app instance to create the user without logging out the current admin
        if (!firebaseConfig || !firebaseConfig.apiKey) {
          throw new Error('Configuração do Firebase não encontrada ou inválida.');
        }

        const appName = `SecondaryApp_${Date.now()}`;
        const secondaryApp = initializeApp(firebaseConfig, appName);
        const secondaryAuth = getAuth(secondaryApp);
        
        try {
          console.log('Chamando createUserWithEmailAndPassword com:', emailToUse);
          const userCredential = await createUserWithEmailAndPassword(
            secondaryAuth, 
            emailToUse, 
            formData.password
          );
          
          const newUser = userCredential.user;
          console.log('Usuário criado com sucesso:', newUser.uid);
          
          await setDoc(doc(db, 'users', newUser.uid), {
            uid: newUser.uid,
            name: formData.name,
            email: emailToUse,
            role: formData.role,
            createdAt: serverTimestamp()
          });
          await logAction('Novo Usuario', `Criou novo usuario: ${formData.name} (${emailToUse})`);

          // Clean up secondary app
          await secondarySignOut(secondaryAuth);
          await deleteApp(secondaryApp);
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-in-use') {
            console.warn('E-mail já em uso na Auth, tentando prosseguir apenas com Firestore...');
            // Se o erro for apenas que o e-mail já existe na Auth, 
            // tentamos apenas criar o documento no Firestore.
            // Nota: Isso pode falhar se não tivermos o UID do usuário existente.
            alert('Este nome de usuário já existe na autenticação. Tente um nome diferente.');
          } else {
            console.error('Erro detalhado no bloco try/catch do createUserWithEmailAndPassword:', authErr);
          }
          
          // Clean up on error
          if (getApps().find(a => a.name === appName)) {
            await deleteApp(secondaryApp);
          }
          throw authErr;
        }
      }
      setIsModalOpen(false);
      setEditingUser(null);
      setFormData({ name: '', email: '', password: '', role: 'user' });
    } catch (err: any) {
      console.error('Erro detalhado ao salvar usuário:', err);
      let message = `Erro ao salvar usuário (${err.code || 'Erro desconhecido'}): ${err.message || ''}`;
      
      if (err.code === 'auth/email-already-in-use') {
        message = 'Este nome de usuário já está em uso. Por favor, verifique se o usuário já existe na lista e edite-o, ou utilize um nome de usuário diferente.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'O nome de usuário ou e-mail fornecido é inválido.';
      } else if (err.code === 'auth/weak-password') {
        message = 'A senha deve ter pelo menos 6 caracteres.';
      } else if (err.code === 'auth/operation-not-allowed') {
        message = 'O método de login por e-mail/senha não está ativado no Firebase Console. Por favor, ative-o em Autenticação > Sign-in method.';
      } else if (err.code === 'auth/invalid-api-key') {
        message = 'Chave de API do Firebase inválida. Verifique sua configuração.';
      } else if (err.code === 'auth/network-request-failed') {
        message = 'Erro de rede. Verifique sua conexão com a internet.';
      } else if (err.code === 'auth/too-many-requests') {
        message = 'Muitas tentativas. Por favor, tente novamente mais tarde.';
      } else if (err.code === 'permission-denied') {
        message = 'Você não tem permissão para criar usuários. Certifique-se de que você inicializou seu perfil de administrador acima.';
      } else if (err.message) {
        message = err.message;
      }
      
      alert(message);
    } finally {
      setSubmitting(false);
    }
  };

  const [deleteUser, setDeleteUser] = useState<UserProfile | null>(null);

  const handleDelete = async (user: UserProfile) => {
    if (user.role === 'admin') {
      alert('Não é possível excluir um administrador.');
      return;
    }
    if (user.id === auth.currentUser?.uid) {
      alert('Não é possível excluir a si mesmo.');
      return;
    }
    setDeleteUser(user);
  };

  const confirmDelete = async () => {
    if (!deleteUser) return;
    try {
      await deleteDoc(doc(db, 'users', deleteUser.id));
      await logAction('Excluir Usuario', `Excluiu usuario: ${deleteUser.name} (${deleteUser.email})`);
      alert('Usuario excluido com sucesso!');
    } catch (err: any) {
      console.error('Erro ao excluir usuario:', err);
      alert('Erro ao excluir usuario: ' + err.message);
    } finally {
      setDeleteUser(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Usuarios</h1>
            <p className="text-zinc-500">Gerencie quem tem acesso ao sistema</p>
          </div>
          <button
            onClick={() => {
              setEditingUser(null);
              setFormData({ name: '', email: '', password: '', role: 'user' });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 font-semibold text-white transition-all hover:bg-zinc-800 active:scale-95"
          >
            <UserPlus size={20} />
            Adicionar Usuario
          </button>
        </div>
        <input
          type="text"
          placeholder="Pesquisar por nome ou nivel..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
        />
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {users.filter(user => {
          // Existing role-based filter
          let matchesRole = false;
          if (currentUserProfile?.role === 'admin') matchesRole = true;
          else if (currentUserProfile?.role === 'pastor') matchesRole = user.role !== 'admin';
          else if (currentUserProfile?.role === 'secretaria') matchesRole = user.role !== 'admin' && user.role !== 'pastor';
          
          if (!matchesRole) return false;

          // New search filter
          const roleDisplayName = user.role === 'admin' ? 'Administrador' : 
                                  user.role === 'pastor' ? 'Pastor' :
                                  user.role === 'secretaria' ? 'Secretaria' :
                                  user.role === 'cell' ? 'Celula' : 
                                  user.role === 'membro' ? 'Membro' : 'Usuario';

          const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                roleDisplayName.toLowerCase().includes(searchTerm.toLowerCase());
          
          return matchesSearch;
        }).map((user) => (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="group relative flex flex-col items-center rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-zinc-200"
          >
            <div className={cn(
              "mb-4 flex h-16 w-16 items-center justify-center rounded-full",
              user.role === 'admin' ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-400"
            )}>
              {user.role === 'admin' ? <Shield size={32} /> : <UserIcon size={32} />}
            </div>
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              {user.name}
              <div className={cn(
                "h-4 w-4 rounded-full border-2 border-white",
                (user as any).status === 'online' ? "bg-emerald-500" : "bg-rose-500"
              )} title={(user as any).status === 'online' ? 'Online' : 'Offline'} />
            </h3>
            <p className="text-sm text-zinc-500">
              {user.email.endsWith(INTERNAL_DOMAIN) 
                ? user.email.replace(INTERNAL_DOMAIN, '') 
                : user.email}
            </p>
            <span className={cn(
              "mt-3 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              user.role === 'admin' ? "bg-zinc-900 text-white" : 
              user.role === 'pastor' ? "bg-purple-100 text-purple-800" :
              user.role === 'secretaria' ? "bg-blue-100 text-blue-800" :
              user.role === 'cell' ? "bg-zinc-200 text-zinc-800" : 
              user.role === 'membro' ? "bg-emerald-100 text-emerald-800" :
              "bg-zinc-100 text-zinc-600"
            )}>
              {user.role === 'admin' ? 'Administrador' : 
               user.role === 'pastor' ? 'Pastor' :
               user.role === 'secretaria' ? 'Secretaria' :
               user.role === 'cell' ? 'Celula' : 
               user.role === 'membro' ? 'Membro' : 'Usuario'}
            </span>

            <div className="mt-6 flex w-full gap-2 border-t border-zinc-100 pt-4">
              <button
                onClick={() => {
                  setEditingUser(user);
                  setFormData({ name: user.name, email: user.email, password: '', role: user.role });
                  setIsModalOpen(true);
                }}
                className="flex-1 rounded-lg bg-zinc-50 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
              >
                Editar
              </button>
              <button
                onClick={() => handleDelete(user)}
                className="flex-1 rounded-lg bg-rose-50 py-2 text-sm font-medium text-rose-600 hover:bg-rose-100"
              >
                Excluir
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-zinc-900">
                  {editingUser ? 'Editar Usuario' : 'Novo Usuario'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-900">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="Ex: Joao Silva"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Nome de Usuario (Login)</label>
                  <input
                    type="text"
                    required
                    value={formData.email.endsWith(INTERNAL_DOMAIN) ? formData.email.replace(INTERNAL_DOMAIN, '') : formData.email}
                    onChange={(e) => {
                      // Prevent entering @ if it's not the main admin email
                      const val = e.target.value;
                      if (!val.includes('@') || val === 'emailparasiteslixo@gmail.com') {
                        setFormData({ ...formData, email: val });
                      } else {
                        setFormData({ ...formData, email: val.split('@')[0] });
                      }
                    }}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="Ex: joaosilva"
                  />
                  <p className="text-[10px] text-zinc-400 italic">Este nome sera usado para entrar no sistema.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    {editingUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha'}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required={!editingUser}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-10 outline-none focus:ring-2 focus:ring-zinc-900/10"
                      placeholder="••••••••"
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {editingUser && editingUser.uid !== auth.currentUser?.uid && (
                    <p className="text-[10px] text-zinc-400 italic">Nota: Por seguranca, voce so pode alterar sua propria senha.</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Nivel de Acesso</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  >
                    <option value="user">Usuario Comum</option>
                    <option value="admin">Administrador</option>
                    <option value="pastor">Pastor</option>
                    <option value="secretaria">Secretaria</option>
                    <option value="cell">Celula</option>
                    <option value="membro">Membro</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-zinc-900 py-3 font-semibold text-white transition-all hover:bg-zinc-800 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  {editingUser ? 'Salvar Alteracoes' : 'Criar Usuario'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {deleteUser && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDeleteUser(null)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl text-center"
          >
            <h2 className="text-xl font-bold text-zinc-900 mb-4">Excluir Usuario?</h2>
            <p className="text-zinc-500 mb-8">Esta acao nao pode ser desfeita.</p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeleteUser(null)}
                className="flex-1 rounded-lg bg-zinc-100 py-2.5 font-semibold text-zinc-700 hover:bg-zinc-200"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 rounded-lg bg-rose-600 py-2.5 font-semibold text-white hover:bg-rose-700"
              >
                Excluir
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
}
