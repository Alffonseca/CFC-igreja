import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Plus, Edit2, Trash2, Search, Filter, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { logAction } from '../lib/logger';

interface Transaction {
  id: string;
  type: 'tithe' | 'offering' | 'expense';
  amount: number;
  date: string;
  description: string;
  category?: string;
  notes?: string;
  createdBy: string;
  createdAt: any;
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'tithe' | 'offering' | 'expense'>('all');

  // Form state
  const [formData, setFormData] = useState({
    type: 'tithe' as 'tithe' | 'offering' | 'expense',
    amount: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    category: '',
    notes: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    const data = {
      ...formData,
      amount: parseFloat(formData.amount),
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp()
    };

    try {
      if (editingTransaction) {
        await updateDoc(doc(db, 'transactions', editingTransaction.id), data);
        await logAction('Editar Lancamento', `Editou lancamento: ${data.description} (${data.type})`);
      } else {
        await addDoc(collection(db, 'transactions'), data);
        await logAction('Novo Lancamento', `Criou novo lancamento: ${data.description} (${data.type})`);
      }
      setIsModalOpen(false);
      setEditingTransaction(null);
      setFormData({
        type: 'tithe',
        amount: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        description: '',
        category: '',
        notes: ''
      });
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar lancamento.');
    }
  };

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const transaction = transactions.find(t => t.id === deleteId);
      await deleteDoc(doc(db, 'transactions', deleteId));
      await logAction('Excluir Lancamento', `Excluiu lancamento: ${transaction?.description} (${transaction?.type})`);
      alert('Lancamento excluido com sucesso!');
    } catch (err: any) {
      console.error('Erro ao excluir lancamento:', err);
      alert('Erro ao excluir lancamento: ' + err.message);
    } finally {
      setDeleteId(null);
    }
  };

  const openEdit = (t: Transaction) => {
    setEditingTransaction(t);
    setFormData({
      type: t.type,
      amount: t.amount.toString(),
      date: t.date,
      description: t.description,
      category: t.category || '',
      notes: t.notes || ''
    });
    setIsModalOpen(true);
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = t.description.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'all' || t.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Lancamentos</h1>
          <p className="text-zinc-500">Gerencie dizimos, ofertas e despesas</p>
        </div>
        <button
          onClick={() => {
            setEditingTransaction(null);
            setFormData({
              type: 'tithe',
              amount: '',
              date: format(new Date(), 'yyyy-MM-dd'),
              description: '',
              category: '',
              notes: ''
            });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 font-semibold text-white transition-all hover:bg-zinc-800 active:scale-95"
        >
          <Plus size={20} />
          Novo Lançamento
        </button>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-10 pr-4 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-zinc-400" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="rounded-lg border border-zinc-200 bg-white py-2 pl-3 pr-8 outline-none focus:border-zinc-900"
          >
            <option value="all">Todos</option>
            <option value="tithe">Dízimos</option>
            <option value="offering">Ofertas</option>
            <option value="expense">Despesas</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 scrollbar-hide">
        <table className="w-full min-w-[600px] text-left">
          <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-6 py-4">Data</th>
              <th className="px-6 py-4">Descricao</th>
              <th className="px-6 py-4">Tipo</th>
              <th className="px-6 py-4">Valor</th>
              <th className="px-6 py-4 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filteredTransactions.map((t) => (
              <tr key={t.id} className="group hover:bg-zinc-50/50">
                <td className="px-6 py-4 text-sm text-zinc-600">{format(new Date(t.date), 'dd/MM/yyyy')}</td>
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-zinc-900">{t.description}</p>
                  {t.notes && <p className="text-xs text-zinc-400">{t.notes}</p>}
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                    t.type === 'tithe' ? "bg-emerald-100 text-emerald-700" :
                    t.type === 'offering' ? "bg-blue-100 text-blue-700" :
                    "bg-rose-100 text-rose-700"
                  )}>
                    {t.type === 'tithe' ? 'Dízimo' : t.type === 'offering' ? 'Oferta' : 'Despesa'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm font-bold text-zinc-900">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(t)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(t.id)} className="rounded-lg p-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredTransactions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">Nenhum lançamento encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
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
              className="relative w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-zinc-900">
                  {editingTransaction ? 'Editar Lançamento' : 'Novo Lançamento'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-900">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Tipo</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                    >
                      <option value="tithe">Dízimo</option>
                      <option value="offering">Oferta</option>
                      <option value="expense">Despesa</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Valor</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Data</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Descrição / Nome do Membro</label>
                  <input
                    type="text"
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="Ex: João Silva ou Conta de Luz"
                  />
                </div>

                {formData.type === 'expense' && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Categoria</label>
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                      placeholder="Ex: Manutenção, Água, Luz..."
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Observações</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                    rows={3}
                    placeholder="Informações adicionais..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-zinc-900 py-3 font-semibold text-white transition-all hover:bg-zinc-800 active:scale-95"
                >
                  {editingTransaction ? 'Salvar Alterações' : 'Confirmar Lançamento'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {deleteId && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDeleteId(null)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl text-center"
          >
            <h2 className="text-xl font-bold text-zinc-900 mb-4">Excluir Lançamento?</h2>
            <p className="text-zinc-500 mb-8">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeleteId(null)}
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
