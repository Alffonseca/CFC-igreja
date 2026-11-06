import { useEffect, useState } from 'react';
import { collection, query, onSnapshot, where, Timestamp, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { TrendingUp, TrendingDown, Wallet, DollarSign, Calendar, ChevronLeft, ChevronRight, Landmark, Building2, ShieldCheck, Percent } from 'lucide-react';
import { motion } from 'motion/react';
import { startOfMonth, endOfMonth, format, parse, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface Transaction {
  id: string;
  type: 'tithe' | 'offering' | 'expense';
  amount: number;
  date: string;
  description: string;
  category?: string;
}

interface RefcReportTotals {
  totalArrecadacao?: number;
  taxaNacional?: number;
  taxaEstadual?: number;
  taxaRegional?: number;
  totalTaxasOficiais?: number;
  totalTithes?: number;
  totalOfferingGeneral?: number;
  totalOfferingSpecial?: number;
  totalMissions?: number;
}

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');
  const [churchSettings, setChurchSettings] = useState<{ 
    qrCodeUrl?: string; 
    titheMessage?: string;
    pctTaxaNacional?: number;
    pctTaxaEstadual?: number;
    pctTaxaRegional?: number;
  } | null>(null);
  const [refcTotals, setRefcTotals] = useState<RefcReportTotals | null>(null);

  // Mês selecionado (persiste e sincroniza com os relatórios e REFC)
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('ieq_selected_month_year');
      if (saved && /^\d{4}-\d{2}$/.test(saved)) {
        return saved;
      }
    } catch (e) {
      // Ignore
    }
    return format(new Date(), 'yyyy-MM');
  });

  useEffect(() => {
    if (selectedMonthYear && /^\d{4}-\d{2}$/.test(selectedMonthYear)) {
      try {
        localStorage.setItem('ieq_selected_month_year', selectedMonthYear);
      } catch (e) {
        // Ignore
      }
    }
  }, [selectedMonthYear]);

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

    // Escuta o relatório oficial consolidado do mês (REFC)
    const unsubscribeRefc = onSnapshot(doc(db, 'refc_reports', selectedMonthYear), (rDoc) => {
      if (rDoc.exists() && rDoc.data()?.totals) {
        setRefcTotals(rDoc.data().totals as RefcReportTotals);
      } else {
        setRefcTotals(null);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeSettings();
      unsubscribeRefc();
    };
  }, [selectedMonthYear]);

  const parsedMonthDate = (() => {
    try {
      const parsed = parse(selectedMonthYear, 'yyyy-MM', new Date());
      return isNaN(parsed.getTime()) ? new Date() : parsed;
    } catch {
      return new Date();
    }
  })();

  const handlePrevMonth = () => {
    const prev = subMonths(parsedMonthDate, 1);
    setSelectedMonthYear(format(prev, 'yyyy-MM'));
  };

  const handleNextMonth = () => {
    const next = addMonths(parsedMonthDate, 1);
    setSelectedMonthYear(format(next, 'yyyy-MM'));
  };

  const monthTransactions = transactions.filter(t => {
    if (!t.date) return false;
    return t.date.startsWith(selectedMonthYear);
  });

  const totals = monthTransactions.reduce((acc, t) => {
    const amt = typeof t.amount === 'number' ? t.amount : (parseFloat(String(t.amount)) || 0);
    if (t.type === 'tithe') acc.tithes += amt;
    if (t.type === 'offering') acc.offerings += amt;
    if (t.type === 'expense') acc.expenses += amt;
    return acc;
  }, { tithes: 0, offerings: 0, expenses: 0 });

  totals.tithes = Math.round(totals.tithes * 100) / 100;
  totals.offerings = Math.round(totals.offerings * 100) / 100;
  totals.expenses = Math.round(totals.expenses * 100) / 100;

  const balance = Math.round((totals.tithes + totals.offerings - totals.expenses) * 100) / 100;

  // Total da arrecadação base de cálculo para as taxas (prioriza REFC oficial salvo ou dízimos + ofertas do mês)
  const baseArrecadacao = refcTotals?.totalArrecadacao !== undefined
    ? Number(refcTotals.totalArrecadacao) || 0
    : Math.round((totals.tithes + totals.offerings) * 100) / 100;

  // Oferta de Missões do 3º Domingo (SEMEQ) do mês
  const missionsFromTransactions = monthTransactions
    .filter(t => t.type === 'offering' && (t.description?.toLowerCase().includes('miss') || t.category?.toLowerCase().includes('miss')))
    .reduce((sum, t) => sum + (typeof t.amount === 'number' ? t.amount : (parseFloat(String(t.amount)) || 0)), 0);

  const totalMissoesMes = refcTotals?.totalMissions !== undefined
    ? Number(refcTotals.totalMissions) || 0
    : Math.round(missionsFromTransactions * 100) / 100;

  // 50% de Missões para o Boleto Nacional e 50% para o Boleto Estadual
  const metadeMissoes = Math.round((totalMissoesMes / 2) * 100) / 100;

  // Alíquotas Oficiais Exatas (calculadas a partir dos boletos reais: 5% Nacional, 11,0714% Estadual, 3,9143% Regional)
  const pctNacConfig = churchSettings?.pctTaxaNacional !== undefined ? churchSettings.pctTaxaNacional : 5.00;
  const pctEstConfig = churchSettings?.pctTaxaEstadual !== undefined ? churchSettings.pctTaxaEstadual : 11.0714;
  const pctRegConfig = churchSettings?.pctTaxaRegional !== undefined ? churchSettings.pctTaxaRegional : 3.9143;

  // Taxas Puras sobre a Arrecadação:
  // 1º Taxa Nacional Pura (5,00% da arrecadação = R$ 231,00 para A = 4.620,00)
  const taxaNacionalPura = refcTotals?.taxaNacional !== undefined
    ? Number(refcTotals.taxaNacional) || 0
    : Math.round((baseArrecadacao * (pctNacConfig / 100)) * 100) / 100;

  // 2º Taxa Estadual Pura (11,0714% da arrecadação = R$ 511,50 para A = 4.620,00)
  const taxaEstadualPura = refcTotals?.taxaEstadual !== undefined
    ? Number(refcTotals.taxaEstadual) || 0
    : Math.round((baseArrecadacao * (pctEstConfig / 100)) * 100) / 100;

  // 3º Taxa Regional Pura (3,9143% da arrecadação = R$ 180,84 para A = 4.620,00)
  const taxaRegional = refcTotals?.taxaRegional !== undefined
    ? Number(refcTotals.taxaRegional) || 0
    : Math.round((baseArrecadacao * (pctRegConfig / 100)) * 100) / 100;

  // Valores Reais dos Boletos (Taxa % + 50% de Missões para Nacional e Estadual):
  // Para A = 4.620,00 e Missões = 30,00 (metade = 15,00):
  // Boleto Nacional = 231,00 + 15,00 = R$ 246,00 (EXATO!)
  // Boleto Estadual = 511,50 + 15,00 = R$ 526,50 (EXATO!)
  // Boleto Regional = 180,84 (EXATO!)
  const boletoNacionalReal = Math.round((taxaNacionalPura + metadeMissoes) * 100) / 100;
  const boletoEstadualReal = Math.round((taxaEstadualPura + metadeMissoes) * 100) / 100;
  const boletoRegionalReal = taxaRegional; // Boleto Regional leva apenas a taxa de 4% / 3,9143%

  const totalTaxas = Math.round((taxaNacionalPura + taxaEstadualPura + taxaRegional) * 100) / 100;
  const totalBoletosOficiais = Math.round((boletoNacionalReal + boletoEstadualReal + boletoRegionalReal) * 100) / 100;

  const stats = [
    { label: 'Dízimos', value: totals.tithes, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Ofertas', value: totals.offerings, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Despesas', value: totals.expenses, icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Saldo Mensal', value: balance, icon: Wallet, color: 'text-zinc-900', bg: 'bg-zinc-100' },
  ];

  const chartData = [
    { name: 'Dízimos', value: totals.tithes, color: '#10b981' },
    { name: 'Ofertas', value: totals.offerings, color: '#3b82f6' },
    { name: 'Despesas', value: totals.expenses, color: '#f43f5e' },
  ].filter(item => item.value > 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  const renderPieLabel = ({ value, percent }: any) => {
    if (!value || value <= 0) return '';
    const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(value);
    const pct = Math.round((percent || 0) * 100);
    return `${formatted} (${pct}%)`;
  };

  if (loading) return <div className="p-8 text-center text-zinc-500 font-medium">Carregando painel geral...</div>;

  return (
    <div className="space-y-8 w-full max-w-full">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900">Dashboard</h1>
          <p className="text-xs sm:text-sm text-zinc-500 capitalize">
            Resumo financeiro de {format(parsedMonthDate, 'MMMM \'de\' yyyy', { locale: ptBR })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor do Mês Sincronizado */}
          <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-zinc-200 shadow-sm">
            <button
              onClick={handlePrevMonth}
              title="Mês anterior"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-1.5 px-2">
              <Calendar size={15} className="text-blue-600" />
              <input
                type="month"
                value={selectedMonthYear}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedMonthYear(e.target.value);
                  }
                }}
                className="text-xs sm:text-sm font-bold text-zinc-800 bg-transparent border-none focus:outline-none cursor-pointer"
              />
            </div>
            <button
              onClick={handleNextMonth}
              title="Próximo mês"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {churchSettings && (churchSettings.qrCodeUrl || churchSettings.titheMessage) && (
            <div className="flex items-center gap-3 rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-200">
              {churchSettings.qrCodeUrl && (
                <img src={churchSettings.qrCodeUrl} alt="QR Code" className="h-10 w-10 sm:h-12 sm:w-12 object-contain" referrerPolicy="no-referrer" />
              )}
              {churchSettings.titheMessage && (
                <p className="text-xs font-medium text-zinc-700 max-w-[180px] hidden sm:block">{churchSettings.titheMessage}</p>
              )}
            </div>
          )}
        </div>
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
        {/* CARDS DE TAXAS E BOLETOS OFICIAIS (NACIONAL, ESTADUAL E REGIONAL) */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">Taxas e Boletos Oficiais</h3>
              <p className="text-xs text-zinc-500">
                Arrecadação: <strong className="text-zinc-800 font-mono">{formatCurrency(baseArrecadacao)}</strong> • Oferta Missões (3º Dom): <strong className="text-emerald-800 font-mono">{formatCurrency(totalMissoesMes)}</strong>
              </p>
            </div>
            <span className="inline-flex items-center gap-1 self-start sm:self-auto rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 ring-1 ring-indigo-200">
              <ShieldCheck size={14} />
              50% Missões em Nac./Est.
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {/* 1º Card: BOLETO NACIONAL (5,00% + 50% Missões) */}
            <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 transition-all hover:shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900">
                    Boleto Nacional
                  </span>
                  <span className="inline-flex items-center rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                    {pctNacConfig.toFixed(2)}% + 50% Mis.
                  </span>
                </div>
                <div className="mt-2.5">
                  <p className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-950">
                    {formatCurrency(boletoNacionalReal)}
                  </p>
                  <p className="text-[10px] uppercase font-bold text-amber-900/70 tracking-wider mt-0.5">
                    Valor Real do Boleto
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-amber-200/70 text-[11px] space-y-0.5 font-mono">
                <div className="flex justify-between text-amber-900">
                  <span className="font-sans font-medium text-[10px]">Taxa ({pctNacConfig.toFixed(2)}%):</span>
                  <span>{formatCurrency(taxaNacionalPura)}</span>
                </div>
                <div className="flex justify-between text-emerald-800 font-semibold">
                  <span className="font-sans font-medium text-[10px]">+ 50% Missões:</span>
                  <span>+{formatCurrency(metadeMissoes)}</span>
                </div>
              </div>
            </div>

            {/* 2º Card: BOLETO ESTADUAL (11,07% + 50% Missões) */}
            <div className="rounded-xl border border-indigo-300 bg-indigo-50/60 p-4 transition-all hover:shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-900">
                    Boleto Estadual
                  </span>
                  <span className="inline-flex items-center rounded-full bg-indigo-200/80 px-2 py-0.5 text-[10px] font-bold text-indigo-950">
                    {pctEstConfig.toFixed(2)}% + 50% Mis.
                  </span>
                </div>
                <div className="mt-2.5">
                  <p className="text-2xl sm:text-3xl font-extrabold font-mono text-indigo-950">
                    {formatCurrency(boletoEstadualReal)}
                  </p>
                  <p className="text-[10px] uppercase font-bold text-indigo-900/70 tracking-wider mt-0.5">
                    Valor Real do Boleto
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-indigo-200/70 text-[11px] space-y-0.5 font-mono">
                <div className="flex justify-between text-indigo-900">
                  <span className="font-sans font-medium text-[10px]">Taxa ({pctEstConfig.toFixed(2)}%):</span>
                  <span>{formatCurrency(taxaEstadualPura)}</span>
                </div>
                <div className="flex justify-between text-emerald-800 font-semibold">
                  <span className="font-sans font-medium text-[10px]">+ 50% Missões:</span>
                  <span>+{formatCurrency(metadeMissoes)}</span>
                </div>
              </div>
            </div>

            {/* 3º Card: BOLETO REGIONAL (3,91% / 4%) */}
            <div className="rounded-xl border border-purple-300 bg-purple-50/60 p-4 transition-all hover:shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-900">
                    Boleto Regional
                  </span>
                  <span className="inline-flex items-center rounded-full bg-purple-200/80 px-2 py-0.5 text-[10px] font-bold text-purple-950">
                    {pctRegConfig.toFixed(2)}%
                  </span>
                </div>
                <div className="mt-2.5">
                  <p className="text-2xl sm:text-3xl font-extrabold font-mono text-purple-950">
                    {formatCurrency(boletoRegionalReal)}
                  </p>
                  <p className="text-[10px] uppercase font-bold text-purple-900/70 tracking-wider mt-0.5">
                    Valor Real do Boleto
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-purple-200/70 text-[11px] space-y-0.5 font-mono">
                <div className="flex justify-between text-purple-900">
                  <span className="font-sans font-medium text-[10px]">Taxa Regional:</span>
                  <span>{formatCurrency(taxaRegional)}</span>
                </div>
                <div className="flex justify-between text-zinc-500 font-medium">
                  <span className="font-sans text-[10px]">Taxa Fixa:</span>
                  <span>{pctRegConfig.toFixed(2)}% Arrecad.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
            <span className="font-medium">
              Rateio de Missões ({formatCurrency(totalMissoesMes)}): <strong className="text-emerald-800 font-mono">50% ({formatCurrency(metadeMissoes)})</strong> para cada boleto (Nacional e Estadual).
            </span>
            <span className="font-mono font-bold text-indigo-950">
              Total Geral dos Boletos: {formatCurrency(totalBoletosOficiais)}
            </span>
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
          <ResponsiveContainer width="100%" height={260}>
            {chartType === 'pie' ? (
              <PieChart>
                <Pie 
                  data={chartData} 
                  dataKey="value" 
                  nameKey="name" 
                  cx="50%" 
                  cy="50%" 
                  outerRadius={75} 
                  label={renderPieLabel}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(val: any) => [
                    formatCurrency(Number(val) || 0),
                    'Total'
                  ]}
                />
                <Legend />
              </PieChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis 
                  tickFormatter={(val) => `R$ ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                />
                <Tooltip 
                  formatter={(val: any) => [
                    formatCurrency(Number(val) || 0),
                    'Total'
                  ]}
                />
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
