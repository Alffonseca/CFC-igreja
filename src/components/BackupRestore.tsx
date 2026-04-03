import { useState } from 'react';
import { collection, getDocs, setDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Download, Upload, Database } from 'lucide-react';

export default function BackupRestore() {
  const [loading, setLoading] = useState(false);
  const [backupUrl, setBackupUrl] = useState<string | null>(null);

  const handleBackup = async () => {
    if (!auth.currentUser) {
      alert('Você precisa estar logado para realizar o backup.');
      return;
    }

    setLoading(true);
    setBackupUrl(null);
    try {
      const collections = ['users', 'transactions', 'settings', 'cells'];
      const backupData: any = {};

      for (const colName of collections) {
        const querySnapshot = await getDocs(collection(db, colName));
        backupData[colName] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      console.log('Backup URL gerada:', url);
      setBackupUrl(url);
      alert('Backup gerado com sucesso! Clique no link abaixo para baixar.');
    } catch (err: any) {
      console.error('Erro detalhado no backup:', err);
      alert(`Erro ao realizar backup: ${err.message || 'Erro desconhecido'}. Verifique se você tem permissão de administrador.`);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('Tem certeza? Isso substituirá os dados atuais pelos dados do backup.')) return;

    setLoading(true);
    try {
      const text = await file.text();
      const backupData = JSON.parse(text);
      const batch = writeBatch(db);

      for (const colName in backupData) {
        for (const item of backupData[colName]) {
          const { id, ...data } = item;
          batch.set(doc(db, colName, id), data);
        }
      }

      await batch.commit();
      alert('Restauração concluída com sucesso!');
    } catch (err: any) {
      console.error('Erro detalhado na restauração:', err);
      alert(`Erro ao restaurar backup: ${err.message || 'Erro desconhecido'}. Verifique o formato do arquivo.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200 mt-8">
      <div className="flex items-center gap-3 mb-6">
        <Database className="text-zinc-900" size={24} />
        <h2 className="text-xl font-bold text-zinc-900">Backup e Restauração</h2>
      </div>
      <div className="flex gap-4">
        <button
          onClick={handleBackup}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 font-semibold text-white transition-all hover:bg-zinc-800 active:scale-95 disabled:opacity-50"
        >
          <Download size={20} />
          {loading ? 'Processando...' : 'Gerar Backup (JSON)'}
        </button>
        <label className="flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2.5 font-semibold text-zinc-900 transition-all hover:bg-zinc-200 cursor-pointer active:scale-95">
          <Upload size={20} />
          Restaurar Backup
          <input type="file" accept=".json" onChange={handleRestore} className="hidden" />
        </label>
      </div>
      {backupUrl && (
        <a 
          href={backupUrl} 
          download={`backup_${new Date().toISOString().replace(/:/g, '-')}.json`}
          className="mt-4 block p-4 bg-blue-100 text-blue-900 font-bold rounded-lg border border-blue-300 underline"
        >
          Clique aqui para baixar o arquivo de backup
        </a>
      )}
      {loading && <p className="mt-4 text-sm text-zinc-500">Processando...</p>}
    </div>
  );
}
