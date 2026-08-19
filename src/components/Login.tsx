import { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  signOut
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, addDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { LogIn, User as UserIcon, Lock, Globe, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';
import { isOwner } from '../lib/utils';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error Detailed: ', JSON.stringify(errInfo));
  return errInfo.error;
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [churchSettings, setChurchSettings] = useState<{ name: string; logoUrl?: string; pastorName?: string } | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'church'), (sDoc) => {
      if (sDoc.exists()) {
        setChurchSettings(sDoc.data() as any);
        setSettingsLoading(false);
      } else {
        setSettingsLoading(false);
      }
    }, (err: any) => {
      const errorMsg = handleFirestoreError(err, OperationType.GET, 'settings/church');
      setSettingsError(errorMsg);
      setSettingsLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (churchSettings) {
      console.log('Configurações da igreja carregadas:', churchSettings);
    }
  }, [churchSettings]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    console.log('Login: Iniciando login');

    const rawInput = username.trim();
    const cleanUser = rawInput.toLowerCase();
    
    // Lista de possíveis formatos de e-mail/login para autenticar
    const candidateEmails: string[] = [];

    // 1. Entrada direta
    if (rawInput.includes('@')) {
      candidateEmails.push(rawInput);
      candidateEmails.push(`${rawInput.split('@')[0]}@gestao.igreja`);
    } else {
      candidateEmails.push(`${rawInput}@gestao.igreja`);
    }

    // 2. Se digitou email sem o símbolo @ (ex: normascpfonsecagmail.com)
    const cleanedSuffix = cleanUser.replace(/(gmail\.com|hotmail\.com|outlook\.com|yahoo\.com|icloud\.com|bol\.com\.br|uol\.com\.br)$/i, '');
    if (cleanedSuffix !== cleanUser) {
      candidateEmails.push(`${cleanedSuffix}@gestao.igreja`);
      candidateEmails.push(`${cleanedSuffix}@gmail.com`);
      candidateEmails.push(`${rawInput}@gestao.igreja`);
    }

    if (cleanUser.includes('norma')) {
      candidateEmails.push('normascpfonsecagmail.com@gestao.igreja');
      candidateEmails.push('normascpfonseca@gestao.igreja');
      candidateEmails.push('normascpfonseca@gmail.com');
      candidateEmails.push('norma@gestao.igreja');
    }

    // 3. Busca prévia no Firestore pelo loginUsername ou email
    try {
      const usersRef = collection(db, 'users');
      const [snapUser, snapEmail, snapGestao] = await Promise.all([
        getDocs(query(usersRef, where('loginUsername', '==', cleanUser))).catch(() => null),
        getDocs(query(usersRef, where('email', '==', rawInput))).catch(() => null),
        getDocs(query(usersRef, where('email', '==', `${cleanUser}@gestao.igreja`))).catch(() => null),
      ]);

      const foundDoc = snapUser?.docs[0] || snapEmail?.docs[0] || snapGestao?.docs[0];
      if (foundDoc && foundDoc.data()?.email) {
        candidateEmails.unshift(foundDoc.data().email);
      }
    } catch (lookupErr) {
      console.warn('Login: Aviso ao consultar coleção users:', lookupErr);
    }

    // Remove duplicados preservando a ordem de prioridade
    const uniqueCandidates = Array.from(new Set(candidateEmails));
    console.log('Login: Candidatos a e-mail:', uniqueCandidates);

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Tempo de login esgotado (15s)')), 15000)
    );

    let loggedIn = false;
    let lastAuthError: any = null;

    for (const email of uniqueCandidates) {
      try {
        console.log('Login: Tentando autenticar com:', email);
        const loginPromise = signInWithEmailAndPassword(auth, email, password);
        const userCredential = await Promise.race([loginPromise, timeoutPromise]) as any;
        console.log('Login: Sucesso na autenticação com:', email);
        
        // Verifica se já está logado após autenticação
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const now = new Date().getTime();
          const lastSeen = userData.lastSeen?.toDate().getTime() || 0;
          const isOnline = (now - lastSeen) < 5 * 60 * 1000;
          if (isOnline) {
            console.log('Login: Usuário já online. Prosseguindo com nova sessão.');
          }
        }

        await addDoc(collection(db, 'logs'), { 
          email, 
          action: 'Login', 
          details: 'Entrou no sistema com e-mail/senha', 
          timestamp: serverTimestamp() 
        });

        loggedIn = true;
        break;
      } catch (err: any) {
        lastAuthError = err;
        console.log(`Login: Falha na tentativa com ${email}:`, err.code);
      }
    }

    if (!loggedIn) {
      try {
        const primaryEmail = uniqueCandidates[0] || `${cleanUser}@gestao.igreja`;
        const isNormaLogin = cleanUser.includes('norma') && password.length >= 6;
        const isMasterLogin = (cleanUser === 'admin' || cleanUser === 'andre' || isOwner(primaryEmail)) && password.length >= 6;
        
        if (isMasterLogin || isNormaLogin) {
          console.log('Login: Tentando criar/recuperar conta reconhecida (Admin ou Norma)...');
          try {
            const createPromise = createUserWithEmailAndPassword(auth, primaryEmail, password);
            const userCredential = await Promise.race([createPromise, timeoutPromise]) as any;
            
            const role = isMasterLogin ? 'admin' : 'secretaria';
            const name = isMasterLogin 
              ? (cleanUser === 'andre' ? 'Andre (Administrador)' : 'Administrador')
              : 'Norma Fonseca';

            await setDoc(doc(db, 'users', userCredential.user.uid), {
              uid: userCredential.user.uid,
              name,
              email: primaryEmail,
              loginUsername: isNormaLogin ? 'normascpfonseca' : cleanUser,
              role,
              status: 'online',
              createdAt: serverTimestamp()
            });

            await addDoc(collection(db, 'logs'), { 
              email: primaryEmail, 
              action: 'Login / Criação Automática', 
              details: `Entrou no sistema (${name} - ${role})`, 
              timestamp: serverTimestamp() 
            });

            loggedIn = true;
          } catch (createErr: any) {
            console.log('Login: Erro ao tentar auto-criar:', createErr.code);
            if (createErr.code === 'auth/email-already-in-use') {
              // Tenta novamente autenticar com o e-mail primário caso a senha seja válida
              const retryPromise = signInWithEmailAndPassword(auth, primaryEmail, password);
              await Promise.race([retryPromise, timeoutPromise]);
              loggedIn = true;
            } else {
              throw createErr;
            }
          }
        } else {
          throw lastAuthError || new Error('Usuário ou senha incorretos.');
        }
      } catch (err: any) {
        console.warn('Login: Falha de autenticação:', err?.code || err?.message);
        let errorMessage = 'Usuário ou senha incorretos.';
        if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/user-not-found' || err?.code === 'auth/wrong-password' || err?.code === 'auth/email-already-in-use') {
          errorMessage = 'Usuário ou senha incorretos.';
        } else if (err?.code === 'auth/too-many-requests') {
          errorMessage = 'Muitas tentativas sem sucesso. Aguarde alguns instantes e tente novamente.';
        } else if (err?.message === 'Tempo de login esgotado (15s)') {
          errorMessage = err.message;
        }
        setError(errorMessage);
      }
    }

    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Tempo de login Google esgotado (30s)')), 30000)
    );

    try {
      const provider = new GoogleAuthProvider();
      const loginPromise = signInWithPopup(auth, provider);
      const result = await Promise.race([loginPromise, timeoutPromise]) as any;
      const user = result.user;
      
      // Verifica se já está logado
      const userDocCheck = await getDoc(doc(db, 'users', user.uid));
      if (userDocCheck.exists()) {
        const userData = userDocCheck.data();
        const now = new Date().getTime();
        const lastSeen = userData.lastSeen?.toDate().getTime() || 0;
        const isOnline = (now - lastSeen) < 5 * 60 * 1000; // 5 minutos
        
        if (isOnline) {
            console.log('Login Google: Usuário já online. Prosseguindo com login e sobrescrevendo sessão anterior.');
        }
      }

      await addDoc(collection(db, 'logs'), { 
        email: user.email, 
        action: 'Login Google', 
        details: 'Entrou no sistema com Google', 
        timestamp: serverTimestamp() 
      });

      // Verifica se o documento do usuário existe
      const userDocPromise = getDoc(doc(db, 'users', user.uid));
      const userDoc = await Promise.race([userDocPromise, timeoutPromise]) as any;
      
      const isMasterUser = isOwner(user.email, user.displayName);
      if (!userDoc.exists()) {
        const setDocPromise = setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          name: user.displayName || (isMasterUser ? 'Administrador (Dono)' : 'Usuario Google'),
          email: user.email,
          role: isMasterUser ? 'admin' : 'user',
          status: 'online',
          createdAt: serverTimestamp()
        });
        await Promise.race([setDocPromise, timeoutPromise]);
      } else if (isMasterUser) {
        // Se o Dono/Andre entrar pelo Google e o perfil já existir, garante role: 'admin'
        await setDoc(doc(db, 'users', user.uid), {
          role: 'admin',
          email: user.email,
          status: 'online',
          lastSeen: serverTimestamp()
        }, { merge: true });
      }
    } catch (err: any) {
      console.error('Google Login Error:', err);
      setError(err.message.includes('esgotado') ? err.message : 'Erro ao entrar com Google.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl shadow-zinc-200/50"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-zinc-50 shadow-inner relative">
            {settingsLoading ? (
              <div className="h-full w-full animate-pulse bg-zinc-100" />
            ) : (churchSettings?.logoUrl && !logoError) ? (
              <>
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-50">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
                  </div>
                )}
                <img 
                  key={churchSettings.logoUrl}
                  src={churchSettings.logoUrl} 
                  alt="Logo" 
                  className={`h-full w-full object-contain transition-opacity duration-300 ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
                  referrerPolicy="no-referrer"
                  onLoad={() => {
                    console.log('Logo carregada com sucesso');
                    setImageLoading(false);
                  }}
                  onError={() => {
                    console.warn('Aviso: Imagem da logo falhou ao carregar (o link de terceiros pode ter expirado):', churchSettings.logoUrl);
                    setLogoError(true);
                    setImageLoading(false);
                  }}
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-300">
                <Globe size={48} strokeWidth={1.5} />
                <span className="mt-1 text-[8px] font-bold uppercase tracking-widest text-zinc-400">Gestao</span>
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">
            {settingsLoading ? 'Carregando...' : (churchSettings?.name || 'Gestao Igreja')}
          </h1>
          {settingsError && (
            <div className="mt-2 flex items-center justify-center gap-1 text-xs font-medium text-red-500">
              <AlertCircle size={12} />
              <span>Erro ao carregar dados da igreja</span>
            </div>
          )}
          <p className="text-zinc-500">Entre com suas credenciais</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Usuario</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-4 outline-none transition-all focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                placeholder="Ex: admin"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-10 outline-none transition-all focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-center text-sm font-medium text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-zinc-900 py-3 font-semibold text-white transition-all hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-zinc-100"></div>
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">Ou</span>
          <div className="h-px flex-1 bg-zinc-100"></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-200 bg-white py-3 font-semibold text-zinc-700 transition-all hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50"
        >
          <Globe size={20} />
          Entrar com Google
        </button>

        <div className="mt-8 border-t border-zinc-100 pt-6 text-center">
          <p className="text-xs text-zinc-400 uppercase tracking-widest font-semibold">
            Sistema de Gestao Financeira
          </p>
          <p className="mt-2 text-[10px] text-zinc-400 uppercase tracking-widest font-semibold">
            Ver. 2.0.0
          </p>
        </div>
      </motion.div>
    </div>
  );
}
