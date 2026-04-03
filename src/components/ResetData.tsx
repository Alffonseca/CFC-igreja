import { useState } from 'react';
import { collection, getDocs, deleteDoc, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Trash2, AlertTriangle } from 'lucide-react';
import { logAction } from '../lib/logger';

export default function ResetData() {
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!window.confirm('ATENCAO: Tem certeza absoluta que deseja apagar TODOS os dados do sistema? Esta acao e irreversivel e apagara transacoes, reunioes, celulas, logs e todos os outros usuarios, mantendo apenas o seu usuario administrador atual.')) {
      return;
    }

    setResetting(true);
    try {
      const collectionsToClear = ['transactions', 'meetings', 'cells', 'logs'];

      for (const colName of collectionsToClear) {
        const q = query(collection(db, colName));
        const snapshot = await getDocs(q);
        for (const doc of snapshot.docs) {
          await deleteDoc(doc.ref);
        }
      }

      // Clear users except current admin
      if (auth.currentUser) {
        const usersQ = query(collection(db, 'users'), where('uid', '!=', auth.currentUser.uid));
        const usersSnapshot = await getDocs(usersQ);
        for (const doc of usersSnapshot.docs) {
          await deleteDoc(doc.ref);
        }
      }

      await logAction('Resetar Dados', 'Apagou todos os dados do sistema (exceto administrador atual)');
      alert('Todos os dados foram resetados com sucesso!');
    } catch (err: any) {
      console.error('Erro ao resetar dados:', err);
      alert('Erro ao resetar dados: ' + err.message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="mt-8 rounded-2xl bg-rose-50 p-6 ring-1 ring-rose-100">
      <div className="flex items-center gap-3 text-rose-900 mb-4">
        <AlertTriangle size={24} />
        <h2 className="text-lg font-bold">Zona de Perigo</h2>
      </div>
      <p className="text-sm text-rose-700 mb-6">
        Esta acao apagara permanentemente todos os dados cadastrados no sistema (transacoes, reunioes, celulas, logs e outros usuarios). Esta acao nao pode ser desfeita.
      </p>
      <button
        onClick={handleReset}
        disabled={resetting}
        className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 font-semibold text-white transition-all hover:bg-rose-700 active:scale-95 disabled:opacity-50"
      >
        <Trash2 size={18} />
        {resetting ? 'Resetando...' : 'Zerar Todos os Dados'}
      </button>
    </div>
  );
}
