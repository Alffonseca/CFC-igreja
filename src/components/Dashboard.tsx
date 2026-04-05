import { useEffect, useState } from 'react';
import { collection, query, onSnapshot, where, Timestamp, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { TrendingUp, TrendingDown, Wallet, DollarSign } from 'lucide-react';
import { motion } from 'motion/react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface Transaction {
  id: string;
  type: 'tithe' | 'offering' | 'expense';
  amount: number;
  date: string;
  description: string;
}

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');
  const [churchSettings, setChurchSettings] = useState<{ qrCodeUrl?: string; titheMessage?: string } | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'transactions'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(data);
      setLoading(false);
    });

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'church'), (sDoc) => {
      if (sDoc.exists()) {
        setChurchSettings(sDoc.data() as any);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeSettings();
    };
  }, []);

  const currentMonth = startOfMonth(new Date());
  const monthTransactions = transactions.filter(t => {
    const tDate = new Date(t.date);
    return tDate >= currentMonth && tDate <= endOfMonth(new Date());
  });

  const totals = monthTransactions.reduce((acc, t) => {
    if (t.type === 'tithe') acc.tithes += t.amount;
    if (t.type === 'offering') acc.offerings += t.amount;
    if (t.type === 'expense') acc.expenses += t.amount;
    return acc;
  }, { tithes: 0, offerings: 0, expenses: 0 });

  const balance = totals.tithes + totals.offerings - totals.expenses;

  const stats = [
    { label: 'Dizimos', value: totals.tithes, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Ofertas', value: totals.offerings, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Despesas', value: totals.expenses, icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Saldo Mensal', value: balance, icon: Wallet, color: 'text-zinc-900', bg: 'bg-zinc-100' },
  ];

  const chartData = [
    { name: 'Dizimos', value: totals.tithes, color: '#10b981' },
    { name: 'Ofertas', value: totals.offerings, color: '#3b82f6' },
    { name: 'Despesas', value: totals.expenses, color: '#f43f5e' },
  ];

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Dashboard</h1>
          <p className="text-zinc-500">Resumo financeiro de {format(new Date(), 'MMMM yyyy', { locale: ptBR })}</p>
        </div>
        {churchSettings?.qrCodeUrl && (
          <div className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
            <img src={churchSettings.qrCodeUrl} alt="QR Code" className="h-16 w-16 object-contain" referrerPolicy="no-referrer" />
            {churchSettings.titheMessage && <p className="text-sm font-medium text-zinc-700 max-w-[200px]">{churchSettings.titheMessage}</p>}
          </div>
        )}
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200"
          >
            <div className="flex items-center justify-between">
              <div className={cn("rounded-xl p-2", stat.bg)}>
                <stat.icon className={stat.color} size={24} />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-zinc-500">{stat.label}</p>
              <p className={cn("text-2xl font-bold", stat.color)}>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stat.value)}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          <h3 className="mb-4 text-lg font-semibold">Lançamentos Recentes</h3>
          <div className="space-y-4">
            {monthTransactions.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-zinc-100 pb-4 last:border-0">
                <div>
                  <p className="font-medium text-zinc-900">{t.description}</p>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">{t.type} • {format(new Date(t.date), 'dd/MM/yyyy')}</p>
                </div>
                <p className={cn("font-bold", t.type === 'expense' ? "text-rose-600" : "text-emerald-600")}>
                  {t.type === 'expense' ? '-' : '+'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                </p>
              </div>
            ))}
            {monthTransactions.length === 0 && (
              <p className="text-center text-zinc-500 py-8">Nenhum lançamento este mês.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Resumo Financeiro</h3>
            <div className="flex rounded-lg bg-zinc-100 p-1">
              <button onClick={() => setChartType('pie')} className={cn("px-3 py-1 rounded-md text-sm font-semibold transition-all", chartType === 'pie' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500")}>Pizza</button>
              <button onClick={() => setChartType('bar')} className={cn("px-3 py-1 rounded-md text-sm font-semibold transition-all", chartType === 'bar' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500")}>Barra</button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            {chartType === 'pie' ? (
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#8884d8">
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// Helper for cn in this file since I can't import it easily without creating it first
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
