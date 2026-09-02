import React, { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc, 
  addDoc, 
  serverTimestamp,
  onSnapshot 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { 
  Calendar, 
  Sparkles, 
  Save, 
  Plus, 
  Edit2, 
  Trash2, 
  ArrowDownCircle, 
  Calculator, 
  Building2, 
  CheckCircle2, 
  RotateCcw,
  X,
  FileSpreadsheet,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { format, getDaysInMonth, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { logAction } from '../lib/logger';

interface DailyEntry {
  day: number;
  dateStr: string;
  dayOfWeek: number;
  dayOfWeekName: string;
  isCulto: boolean;
  isThirdSunday: boolean;
  tithes: number;
  offeringGeneral: number;
  offeringSpecial: number;
  missions: number;
  total: number;
}

interface ExpenseEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
}

interface ChurchInfo {
  churchName: string;
  pastorName: string;
  address: string;
  region: string;
  logoUrl?: string;
}

export function parseCurrencyInput(input: string | number | undefined | null): number {
  if (input === undefined || input === null) return 0;
  if (typeof input === 'number') return isNaN(input) ? 0 : Math.round(input * 100) / 100;
  let str = input.toString().trim();
  if (!str) return 0;

  // Remove qualquer caractere que não seja dígito, vírgula, ponto ou sinal negativo
  str = str.replace(/[^\d,.-]/g, '');
  if (!str) return 0;

  // Se contiver vírgula e ponto (ex: 1.500,50 ou 1,500.50)
  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Padrão brasileiro: 1.500,50 -> 1500.50
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Padrão americano: 1,500.50 -> 1500.50
      str = str.replace(/,/g, '');
    }
  } 
  // Se contiver apenas vírgula(s) (ex: 195,70 ou 195,7 ou 195,)
  else if (str.includes(',')) {
    const commaParts = str.split(',');
    if (commaParts.length === 2) {
      str = str.replace(',', '.');
    } else {
      // Múltiplas vírgulas
      str = str.replace(/,/g, '');
    }
  } 
  // Se contiver apenas ponto(s) (ex: 195.70 ou 195.7 ou 1.500.000)
  else if (str.includes('.')) {
    const dotParts = str.split('.');
    if (dotParts.length === 2 && dotParts[1].length <= 2) {
      // Ex: 195.7 ou 195.70 -> Ponto decimal digitado no teclado
      // Mantém como 195.70
    } else if (dotParts.length > 2) {
      // Múltiplos pontos de milhar: 1.500.000
      str = str.replace(/\./g, '');
    }
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

function RefcCurrencyCell({
  value,
  onChange,
  className,
  placeholder = "0,00"
}: {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const formatForDisplay = (v: number) => (v > 0 ? v.toFixed(2).replace('.', ',') : '');
  const [text, setText] = useState<string>(() => formatForDisplay(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setText(formatForDisplay(value));
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Permite dígitos, vírgula e ponto
    if (!/^[0-9.,]*$/.test(raw)) return;

    setText(raw);
    const parsed = parseCurrencyInput(raw);
    onChange(parsed);
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseCurrencyInput(text);
    onChange(parsed);
    if (parsed > 0) {
      setText(parsed.toFixed(2).replace('.', ','));
    } else {
      setText('');
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={(e) => {
        setIsFocused(true);
        e.target.select();
      }}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={cn(
        "w-24 text-right rounded border border-zinc-200 bg-white p-1 text-xs font-mono font-bold text-zinc-900 focus:border-blue-600 focus:outline-hidden touch-auto sheet-scroll-input",
        className
      )}
      style={{ touchAction: 'pan-x pan-y' }}
    />
  );
}

export default function RefcEntryForm() {
  const [selectedMonthYear, setSelectedMonthYear] = useState(() => {
    try {
      const savedMonth = localStorage.getItem('ieq_selected_month_year');
      if (savedMonth && /^\d{4}-\d{2}$/.test(savedMonth)) {
        return savedMonth;
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
  const [churchInfo, setChurchInfo] = useState<ChurchInfo>({
    churchName: 'TABERNÁCULO DA FAMÍLIA',
    pastorName: 'MARCELO PONTES',
    address: 'RUA 30 QUADRA 46 Nº 232 - CONJ PROMORAR',
    region: '115'
  });

  const [stats, setStats] = useState({
    membersCount: 120,
    cellsCount: 11,
    visitorsCount: 25,
    conversionsCount: 0,
    baptismsWaterCount: 0,
    baptismsHolySpiritCount: 0
  });

  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [distMode, setDistMode] = useState<'total' | 'detailed'>('total');
  const [totalGeneralTarget, setTotalGeneralTarget] = useState<string>('');
  const [targetTithes, setTargetTithes] = useState<string>('');
  const [targetOfferingGeneral, setTargetOfferingGeneral] = useState<string>('');
  const [targetOfferingSpecial, setTargetOfferingSpecial] = useState<string>('');
  const [targetMissions, setTargetMissions] = useState<string>('');

  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');

  // Auxiliar para garantir que as despesas fixas (ÁGUA, LUZ, SUSTENTO PASTORAL) sempre existam
  const ensureFixedExpensesList = (currExpenses?: ExpenseEntry[]): ExpenseEntry[] => {
    const fixedDefs = [
      { name: 'ÁGUA', defaultDate: '10' },
      { name: 'LUZ', defaultDate: '10' },
      { name: 'SUSTENTO PASTORAL', defaultDate: '15' }
    ];

    let list = Array.isArray(currExpenses) ? currExpenses.map(e => ({ ...e })) : [];

    // Sanitize any incorrect legacy conversion values for Água (e.g., 1957 / 1957.00 -> 195.70)
    list = list.map(e => {
      const descUpper = (e.description || '').toUpperCase();
      let amt = typeof e.amount === 'number' ? e.amount : parseCurrencyInput(e.amount);
      if ((descUpper.includes('ÁGUA') || descUpper.includes('AGUA')) && (amt === 1957 || amt === 1957.00)) {
        amt = 195.70;
      }
      return {
        ...e,
        amount: Math.round(amt * 100) / 100
      };
    });

    fixedDefs.forEach(f => {
      const exists = list.some(e => 
        e.description.toUpperCase().includes(f.name) ||
        (f.name === 'LUZ' && (e.description.toUpperCase().includes('ENERGIA') || e.description.toUpperCase().includes('LUZ'))) ||
        (f.name === 'ÁGUA' && (e.description.toUpperCase().includes('AGUA') || e.description.toUpperCase().includes('ÁGUA')))
      );
      if (!exists) {
        list.push({
          id: `fixed_${f.name.toLowerCase().replace(/[^a-z]/g, '')}`,
          date: f.defaultDate,
          description: f.name,
          amount: 0
        });
      }
    });

    return list;
  };

  const [newExpenseDate, setNewExpenseDate] = useState('');
  const [newExpenseDesc, setNewExpenseDesc] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');

  const [observations, setObservations] = useState('');
  const [isSavingToDb, setIsSavingToDb] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearingMonth, setIsClearingMonth] = useState(false);

  const commonExpenseSuggestions = [
    'TAXA ÁGUA',
    'TAXA DE LUZ',
    'SUSTENTO PASTORAL',
    'INTERNET / TELEFONE',
    'MATERIAL DE LIMPEZA',
    'MANUTENÇÃO / REFORMA',
    'DIACONATO / SOCIAL',
    'DEPARTAMENTO INFANTIL',
    'SOM E MÍDIA',
    'ALUGUEL DO TEMPLO'
  ];

  // Carrega configurações da igreja
  useEffect(() => {
    const fetchChurchSettings = async () => {
      try {
        const sDoc = await getDoc(doc(db, 'settings', 'church'));
        if (sDoc.exists()) {
          const d = sDoc.data();
          setChurchInfo(prev => ({
            ...prev,
            churchName: d.name || prev.churchName,
            pastorName: d.pastorName || prev.pastorName,
            address: d.address || prev.address,
            region: d.region || prev.region,
            logoUrl: d.logoUrl || prev.logoUrl
          }));
        }
      } catch (e) {
        console.error('Erro ao buscar dados da igreja:', e);
      }
    };
    fetchChurchSettings();
  }, []);

  // Inicializa a grade de dias e escuta Firestore em tempo real
  useEffect(() => {
    initializeMonthGrid(selectedMonthYear);

    const docRef = doc(db, 'refc_reports', selectedMonthYear);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.dailyEntries && Array.isArray(data.dailyEntries)) {
          setDailyEntries(data.dailyEntries);
        }
        if (data.expenses && Array.isArray(data.expenses)) {
          setExpenses(ensureFixedExpensesList(data.expenses));
        } else {
          setExpenses(ensureFixedExpensesList([]));
        }
        if (data.totalGeneralTarget !== undefined) setTotalGeneralTarget(data.totalGeneralTarget);
        if (data.targetTithes !== undefined) setTargetTithes(data.targetTithes);
        if (data.targetOfferingGeneral !== undefined) setTargetOfferingGeneral(data.targetOfferingGeneral);
        if (data.targetOfferingSpecial !== undefined) setTargetOfferingSpecial(data.targetOfferingSpecial);
        if (data.targetMissions !== undefined) setTargetMissions(data.targetMissions);
        if (data.observations !== undefined) setObservations(data.observations);
        if (data.stats) setStats(prev => ({ ...prev, ...data.stats }));
      } else {
        // Se o documento NÃO existe no Firestore (ex: após zerar o mês), verifica se há cache local
        const savedStr = localStorage.getItem(`refc_data_${selectedMonthYear}`);
        if (!savedStr) {
          setDailyEntries(prev => prev.map(e => ({
            ...e,
            tithes: 0,
            offeringGeneral: 0,
            offeringSpecial: 0,
            missions: 0,
            total: 0
          })));
          setExpenses(ensureFixedExpensesList([]));
          setTotalGeneralTarget('');
          setTargetTithes('');
          setTargetOfferingGeneral('');
          setTargetOfferingSpecial('');
          setTargetMissions('');
          setObservations('');
        }
      }
    }, (err) => {
      console.warn('Erro ao escutar do Firestore para', selectedMonthYear, err);
    });

    return () => {
      unsubscribe();
    };
  }, [selectedMonthYear]);

  const initializeMonthGrid = (monthYearStr: string) => {
    const [yearStr, monthStr] = monthYearStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const startDate = new Date(year, month, 1);
    const totalDays = getDaysInMonth(startDate);

    const weekNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    let sundayCount = 0;

    const baseEntries: DailyEntry[] = [];
    for (let day = 1; day <= totalDays; day++) {
      const currentDate = new Date(year, month, day);
      const dayOfWeek = getDay(currentDate);
      const isSunday = dayOfWeek === 0;
      if (isSunday) {
        sundayCount++;
      }
      const isThirdSunday = isSunday && sundayCount === 3;
      const isCulto = dayOfWeek === 0 || dayOfWeek === 2 || dayOfWeek === 5;

      baseEntries.push({
        day,
        dateStr: format(currentDate, 'dd/MM/yyyy'),
        dayOfWeek,
        dayOfWeekName: weekNames[dayOfWeek],
        isCulto,
        isThirdSunday,
        tithes: 0,
        offeringGeneral: 0,
        offeringSpecial: 0,
        missions: 0,
        total: 0
      });
    }

    try {
      const savedStr = localStorage.getItem(`refc_data_${monthYearStr}`);
      if (savedStr) {
        const saved = JSON.parse(savedStr);
        if (saved.dailyEntries && Array.isArray(saved.dailyEntries)) {
          const merged = baseEntries.map(b => {
            const found = saved.dailyEntries.find((s: any) => s.day === b.day);
            if (found) {
              return {
                ...b,
                tithes: Number(found.tithes) || 0,
                offeringGeneral: Number(found.offeringGeneral) || 0,
                offeringSpecial: Number(found.offeringSpecial) || 0,
                missions: Number(found.missions) || 0,
                total: Number(found.total) || 0
              };
            }
            return b;
          });
          setDailyEntries(merged);
        } else {
          setDailyEntries(baseEntries);
        }

        if (saved.expenses && Array.isArray(saved.expenses)) {
          setExpenses(ensureFixedExpensesList(saved.expenses));
        } else {
          setExpenses(ensureFixedExpensesList([]));
        }

        if (saved.totalGeneralTarget !== undefined) setTotalGeneralTarget(saved.totalGeneralTarget);
        if (saved.targetTithes !== undefined) setTargetTithes(saved.targetTithes);
        if (saved.targetOfferingGeneral !== undefined) setTargetOfferingGeneral(saved.targetOfferingGeneral);
        if (saved.targetOfferingSpecial !== undefined) setTargetOfferingSpecial(saved.targetOfferingSpecial);
        if (saved.targetMissions !== undefined) setTargetMissions(saved.targetMissions);
        return;
      }
    } catch (e) {
      console.warn('Erro ao ler cache local de relatórios:', e);
    }

    setDailyEntries(baseEntries);
    setExpenses(ensureFixedExpensesList([]));
    setTotalGeneralTarget('');
    setTargetTithes('');
    setTargetOfferingGeneral('');
    setTargetOfferingSpecial('');
    setTargetMissions('');
  };

  // Salva no cache local
  useEffect(() => {
    if (dailyEntries.length > 0) {
      try {
        localStorage.setItem(`refc_data_${selectedMonthYear}`, JSON.stringify({
          dailyEntries,
          expenses,
          totalGeneralTarget,
          targetTithes,
          targetOfferingGeneral,
          targetOfferingSpecial,
          targetMissions,
          observations,
          stats
        }));
      } catch (e) {}
    }
  }, [dailyEntries, expenses, totalGeneralTarget, targetTithes, targetOfferingGeneral, targetOfferingSpecial, targetMissions, observations, stats, selectedMonthYear]);

  // Cálculos em tempo real
  const totalTithesSum = dailyEntries.reduce((acc, curr) => acc + (Number(curr.tithes) || 0), 0);
  const totalOfferingGenSum = dailyEntries.reduce((acc, curr) => acc + (Number(curr.offeringGeneral) || 0), 0);
  const totalOfferingSpecSum = dailyEntries.reduce((acc, curr) => acc + (Number(curr.offeringSpecial) || 0), 0);
  const totalMissionsSum = dailyEntries.reduce((acc, curr) => acc + (Number(curr.missions) || 0), 0);

  const totalArrecadacao = Math.round((totalTithesSum + totalOfferingGenSum + totalOfferingSpecSum + totalMissionsSum) * 100) / 100;
  const taxaSede25 = Math.round((totalArrecadacao * 0.25) * 100) / 100;
  const manualExpensesSum = Math.round(expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0) * 100) / 100;
  const totalSaidasComTaxa = Math.round((taxaSede25 + manualExpensesSum) * 100) / 100;
  const saldoFinalMes = Math.round((totalArrecadacao - totalSaidasComTaxa) * 100) / 100;

  const [currentYear, currentMonthNum] = selectedMonthYear.split('-');
  const dateObj = new Date(parseInt(currentYear, 10), parseInt(currentMonthNum, 10) - 1, 1);
  const monthNameUpper = format(dateObj, 'MMMM', { locale: ptBR }).toUpperCase();
  const competenciaExtenso = `${monthNameUpper} / ${currentYear}`;

  const fmtCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Distribuição nos cultos
  const handleApplySmartDistribution = () => {
    let tDiz = 0;
    let tOfGen = 0;
    let tOfEsp = 0;
    let tMis = 0;

    if (distMode === 'total') {
      const gTotal = parseCurrencyInput(totalGeneralTarget);
      if (gTotal <= 0) {
        alert('Por favor, informe um valor total positivo para distribuir.');
        return;
      }
      tMis = parseCurrencyInput(targetMissions);
      const remainingTotal = Math.max(0, gTotal - tMis);
      // Distribui o restante entre Dízimos (80%) e Ofertas Gerais (20%)
      tDiz = Math.round(remainingTotal * 0.80 * 100) / 100;
      tOfGen = Math.round((remainingTotal - tDiz) * 100) / 100;
      tOfEsp = 0;
    } else {
      tDiz = parseCurrencyInput(targetTithes);
      tOfGen = parseCurrencyInput(targetOfferingGeneral);
      tOfEsp = parseCurrencyInput(targetOfferingSpecial);
      tMis = parseCurrencyInput(targetMissions);
      if (tDiz + tOfGen + tOfEsp + tMis <= 0) {
        alert('Por favor, informe os valores nas categorias para distribuir.');
        return;
      }
    }

    const distributeTotal = (totalVal: number, weights: number[]): number[] => {
      if (totalVal <= 0 || weights.length === 0) return weights.map(() => 0);
      const sumW = weights.reduce((a, b) => a + b, 0);
      if (sumW <= 0) return weights.map(() => 0);

      const raw = weights.map(w => Math.floor((w / sumW) * totalVal * 100) / 100);
      const allocatedSum = raw.reduce((a, b) => a + b, 0);
      let remainderCents = Math.round((totalVal - allocatedSum) * 100);

      const sortedIndices = weights
        .map((w, idx) => ({ w, idx }))
        .sort((a, b) => b.w - a.w)
        .map(item => item.idx);

      let i = 0;
      while (remainderCents > 0) {
        const targetIdx = sortedIndices[i % sortedIndices.length];
        raw[targetIdx] = Math.round((raw[targetIdx] + 0.01) * 100) / 100;
        remainderCents--;
        i++;
      }
      return raw;
    };

    const sundays = dailyEntries.filter(e => e.dayOfWeek === 0);
    const tuesdays = dailyEntries.filter(e => e.dayOfWeek === 2);
    const fridays = dailyEntries.filter(e => e.dayOfWeek === 5);

    // Multiplicador temporal baseado na progressão real do mês:
    // Início do mês (dias 1 a 10): ALTO (salários / início de mês)
    // Meio do mês (dias 11 a 20): BAIXO (menor arrecadação)
    // Fim do mês (dias 21 a 31): INTERMEDIÁRIO (entre o início e o meio, adiantamentos / fechamento)
    const getPeriodFactor = (day: number) => {
      if (day <= 10) {
        return day <= 5 ? 1.85 : 1.55;
      } else if (day <= 20) {
        return day <= 15 ? 0.65 : 0.75;
      } else {
        return day <= 25 ? 1.05 : 1.22;
      }
    };

    // Variação determinística suave para não gerar valores idênticos aos centavos entre semanas
    const getOrganicVariance = (day: number, offset = 0) => {
      return 1 + (((((day + offset) * 17) % 23) - 11) / 120); // Variação de ~ -9% a +9%
    };

    // Pesos para Dízimos (concentração forte no início do mês e domingos)
    const weightsDiz = dailyEntries.map(e => {
      if (!e.isCulto) return 0;
      let dayBase = 1.0;
      if (e.dayOfWeek === 0) dayBase = 3.6; // Domingo
      else if (e.dayOfWeek === 5) dayBase = 1.3; // Sexta
      else if (e.dayOfWeek === 2) dayBase = 0.95; // Terça

      const period = getPeriodFactor(e.day);
      const tithePeriod = period > 1 ? period * 1.2 : period * 0.88;
      return dayBase * tithePeriod * getOrganicVariance(e.day, 0);
    });
    const distDiz = distributeTotal(tDiz, weightsDiz);

    // Pesos para Oferta Geral
    const weightsOfGen = dailyEntries.map(e => {
      if (!e.isCulto) return 0;
      let dayBase = 1.0;
      if (e.dayOfWeek === 0) dayBase = 3.2; // Domingo
      else if (e.dayOfWeek === 5) dayBase = 1.35; // Sexta
      else if (e.dayOfWeek === 2) dayBase = 1.0; // Terça

      const period = getPeriodFactor(e.day);
      return dayBase * period * getOrganicVariance(e.day, 5);
    });
    const distOfGen = distributeTotal(tOfGen, weightsOfGen);

    // Pesos para Oferta Especial
    const weightsOfEsp = dailyEntries.map(e => {
      if (!e.isCulto) return 0;
      let dayBase = 1.0;
      if (e.dayOfWeek === 0) dayBase = 2.6; // Domingo
      else if (e.dayOfWeek === 5) dayBase = 1.2; // Sexta
      else if (e.dayOfWeek === 2) dayBase = 0.85; // Terça

      const period = getPeriodFactor(e.day);
      return dayBase * period * getOrganicVariance(e.day, 11);
    });
    const distOfEsp = distributeTotal(tOfEsp, weightsOfEsp);

    const updated = dailyEntries.map((entry, index) => {
      const d = distDiz[index] || 0;
      const og = distOfGen[index] || 0;
      const oe = distOfEsp[index] || 0;
      const m = entry.isThirdSunday ? tMis : 0;
      const tot = d + og + oe + m;

      return {
        ...entry,
        tithes: d,
        offeringGeneral: og,
        offeringSpecial: oe,
        missions: m,
        total: Math.round(tot * 100) / 100
      };
    });

    setDailyEntries(updated);
    setSyncStatus(`Valor distribuído com sucesso entre Dízimos e Ofertas em ${sundays.length} domingos, ${tuesdays.length} terças e ${fridays.length} sextas-feiras!`);
    setTimeout(() => setSyncStatus(null), 4000);
  };

  const handleCellChange = (dayIndex: number, field: keyof DailyEntry, value: string | number) => {
    const numVal = parseCurrencyInput(value);
    setDailyEntries(prev => {
      const copy = [...prev];
      const target = { ...copy[dayIndex] };
      (target as any)[field] = numVal;
      target.total = Math.round(((target.tithes || 0) + (target.offeringGeneral || 0) + (target.offeringSpecial || 0) + (target.missions || 0)) * 100) / 100;
      copy[dayIndex] = target;
      return copy;
    });
  };

  const persistExpensesToFirestore = async (newExpensesList: ExpenseEntry[]) => {
    if (!auth.currentUser) return;
    try {
      await setDoc(doc(db, 'refc_reports', selectedMonthYear), {
        expenses: newExpensesList,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn('Erro ao auto-salvar despesas no Firestore:', err);
    }
  };

  const handleExpenseAmountChange = (id: string, value: string | number) => {
    const numVal = parseCurrencyInput(value);
    setExpenses(prev => {
      const updated = prev.map(exp => {
        if (exp.id === id) {
          return { ...exp, amount: numVal };
        }
        return exp;
      });
      persistExpensesToFirestore(updated);
      return updated;
    });
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseCurrencyInput(newExpenseAmount);
    if (!newExpenseDesc.trim() || amountNum <= 0) {
      alert('Por favor, informe uma descrição válida e um valor positivo para a despesa.');
      return;
    }

    let dateFormated = newExpenseDate.trim();
    if (!dateFormated) {
      dateFormated = `${currentMonthNum}/10`;
    }

    const newExp: ExpenseEntry = {
      id: Date.now().toString(),
      date: dateFormated,
      description: newExpenseDesc.trim().toUpperCase(),
      amount: amountNum
    };

    const updated = [...expenses, newExp];
    setExpenses(updated);
    await persistExpensesToFirestore(updated);

    setNewExpenseDesc('');
    setNewExpenseAmount('');
    setSyncStatus(`Despesa "${newExp.description}" lançada!`);
    setTimeout(() => setSyncStatus(null), 3000);
  };

  const handleOpenEditExpense = (exp: ExpenseEntry) => {
    setEditingExpense(exp);
    setEditDate(exp.date);
    setEditDesc(exp.description);
    setEditAmount(exp.amount > 0 ? exp.amount.toFixed(2).replace('.', ',') : '');
  };

  const handleSaveEditExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    const amountNum = parseCurrencyInput(editAmount);
    if (!editDesc.trim() || amountNum <= 0) {
      alert('Por favor, informe uma descrição válida e um valor positivo.');
      return;
    }

    const updated = expenses.map(exp => {
      if (exp.id === editingExpense.id) {
        return {
          ...exp,
          date: editDate.trim() || exp.date,
          description: editDesc.trim().toUpperCase(),
          amount: amountNum
        };
      }
      return exp;
    });

    setExpenses(updated);
    await persistExpensesToFirestore(updated);

    setEditingExpense(null);
    setSyncStatus(`Despesa "${editDesc.trim().toUpperCase()}" alterada para ${fmtCurrency(amountNum)} com sucesso!`);
    setTimeout(() => setSyncStatus(null), 3500);
  };

  const handleRemoveExpense = async (id: string, description?: string) => {
    const updated = expenses.filter(exp => exp.id !== id);
    setExpenses(updated);
    await persistExpensesToFirestore(updated);
    setSyncStatus(`Despesa "${description || 'selecionada'}" excluída!`);
    setTimeout(() => setSyncStatus(null), 3000);
  };

  // 🗑️ Abrir Modal para Zerar todos os lançamentos do mês
  const handleClearAll = () => {
    setShowClearModal(true);
  };

  // Executar Zeramento Completo
  const executeClearMonth = async () => {
    setIsClearingMonth(true);
    try {
      // 1. Limpar estados locais na memória
      setTotalGeneralTarget('');
      setTargetTithes('');
      setTargetOfferingGeneral('');
      setTargetOfferingSpecial('');
      setTargetMissions('');
      setObservations('');
      setExpenses(ensureFixedExpensesList([]));
      setDailyEntries(prev => prev.map(e => ({
        ...e,
        tithes: 0,
        offeringGeneral: 0,
        offeringSpecial: 0,
        missions: 0,
        total: 0
      })));

      // 2. Limpar cache local (localStorage)
      try {
        localStorage.removeItem(`refc_data_${selectedMonthYear}`);
      } catch (e) {}

      // 3. Excluir documento no Firestore (refc_reports/{selectedMonthYear})
      try {
        await deleteDoc(doc(db, 'refc_reports', selectedMonthYear));
      } catch (err) {
        console.warn('Erro ao excluir documento refc_reports:', err);
      }

      // 4. Excluir transações financeiras vinculadas a este mês no Financeiro
      try {
        const qExisting = query(
          collection(db, 'transactions'),
          where('refcMonth', '==', selectedMonthYear)
        );
        const snapExisting = await getDocs(qExisting);
        const deletePromises = snapExisting.docs.map(d => deleteDoc(doc(db, 'transactions', d.id)));
        await Promise.all(deletePromises);
      } catch (err) {
        console.warn('Erro ao excluir transações vinculadas:', err);
      }

      await logAction('REFC Zerar Mês', `Zerou todos os lançamentos e relatórios de ${competenciaExtenso}`);
      setSyncStatus(`Mês de ${competenciaExtenso} foi 100% zerado no banco de dados e relatórios! Você já pode relançar do zero.`);
      setTimeout(() => setSyncStatus(null), 5000);
      setShowClearModal(false);
    } catch (err: any) {
      console.error('Erro ao zerar mês:', err);
      setSyncStatus('Erro ao zerar mês no banco de dados: ' + (err.message || String(err)));
    } finally {
      setIsClearingMonth(false);
    }
  };

  // 💾 Salvar no Firestore e Sincronizar com o Financeiro
  const handleSaveToDatabaseAndFinance = async () => {
    if (!auth.currentUser) {
      alert('Atenção: Você precisa estar conectado para salvar e sincronizar os lançamentos no banco de dados.');
      return;
    }

    const currentUid = auth.currentUser.uid;
    setIsSavingToDb(true);
    try {
      // 1. Salvar na coleção refc_reports (Consolidação do REFC do Mês)
      const reportDocRef = doc(db, 'refc_reports', selectedMonthYear);
      await setDoc(reportDocRef, {
        monthYear: selectedMonthYear,
        year: currentYear,
        month: currentMonthNum,
        monthName: monthNameUpper,
        churchInfo,
        stats,
        dailyEntries,
        expenses,
        totalGeneralTarget,
        targetTithes,
        targetOfferingGeneral,
        targetOfferingSpecial,
        targetMissions,
        observations,
        totals: {
          totalTithes: totalTithesSum,
          totalOfferingGeneral: totalOfferingGenSum,
          totalOfferingSpecial: totalOfferingSpecSum,
          totalMissions: totalMissionsSum,
          totalArrecadacao,
          taxaSede25,
          totalExpenses: manualExpensesSum,
          totalSaidas: totalSaidasComTaxa,
          saldoFinal: saldoFinalMes
        },
        updatedAt: serverTimestamp(),
        savedBy: auth.currentUser?.email || 'Usuário'
      }, { merge: true });

      // 2. Sincronizar com o Financeiro Geral (Coleção transactions)
      const qExisting = query(
        collection(db, 'transactions'),
        where('refcMonth', '==', selectedMonthYear)
      );
      const snapExisting = await getDocs(qExisting);
      const deletePromises = snapExisting.docs.map(d => deleteDoc(doc(db, 'transactions', d.id)));
      await Promise.all(deletePromises);

      const newTransactions: any[] = [];

      dailyEntries.forEach(entry => {
        const [d, m, y] = entry.dateStr.split('/');
        const isoDate = `${y}-${m}-${d}`;

        if (entry.tithes > 0) {
          newTransactions.push({
            type: 'tithe',
            amount: entry.tithes,
            date: isoDate,
            description: `Dízimos Culto ${entry.dayOfWeekName} (${entry.dateStr})`,
            category: 'Dízimo REFC',
            destination: 'Igreja Local',
            createdBy: currentUid,
            createdAt: serverTimestamp(),
            refcMonth: selectedMonthYear
          });
        }
        if (entry.offeringGeneral > 0) {
          newTransactions.push({
            type: 'offering',
            amount: entry.offeringGeneral,
            date: isoDate,
            description: `Oferta Geral Culto ${entry.dayOfWeekName} (${entry.dateStr})`,
            category: 'Oferta Geral REFC',
            destination: 'Igreja Local',
            createdBy: currentUid,
            createdAt: serverTimestamp(),
            refcMonth: selectedMonthYear
          });
        }
        if (entry.offeringSpecial > 0) {
          newTransactions.push({
            type: 'offering',
            amount: entry.offeringSpecial,
            date: isoDate,
            description: `Oferta Especial Culto ${entry.dayOfWeekName} (${entry.dateStr})`,
            category: 'Oferta Especial REFC',
            destination: 'Igreja Local',
            createdBy: currentUid,
            createdAt: serverTimestamp(),
            refcMonth: selectedMonthYear
          });
        }
        if (entry.missions > 0) {
          newTransactions.push({
            type: 'offering',
            amount: entry.missions,
            date: isoDate,
            description: `Oferta de Missões - 3º Domingo (${entry.dateStr})`,
            category: 'Missões REFC',
            destination: 'Secretaria de Missões',
            createdBy: currentUid,
            createdAt: serverTimestamp(),
            refcMonth: selectedMonthYear
          });
        }
      });

      expenses.forEach(exp => {
        const numAmount = Number(exp.amount) || 0;
        if (numAmount > 0) {
          let expDate = exp.date;
          if (expDate.includes('/')) {
            const parts = expDate.split('/');
            if (parts.length === 2) {
              expDate = `${currentYear}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            } else if (parts.length === 3) {
              expDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
          newTransactions.push({
            type: 'expense',
            amount: numAmount,
            date: expDate || `${currentYear}-${currentMonthNum}-15`,
            description: exp.description || 'DESPESA OPERACIONAL REFC',
            category: 'Despesa REFC',
            destination: 'Igreja Local',
            createdBy: currentUid,
            createdAt: serverTimestamp(),
            refcMonth: selectedMonthYear
          });
        }
      });

      if (taxaSede25 > 0) {
        newTransactions.push({
          type: 'expense',
          amount: taxaSede25,
          date: `${currentYear}-${currentMonthNum}-28`,
          description: `Taxa da Região/Sede (25%) - ${competenciaExtenso}`,
          category: 'Taxa Regional Sede',
          destination: 'Sede Regional IEQ',
          createdBy: currentUid,
          createdAt: serverTimestamp(),
          refcMonth: selectedMonthYear
        });
      }

      const addPromises = newTransactions.map(t => addDoc(collection(db, 'transactions'), t));
      await Promise.all(addPromises);

      await logAction('REFC Salvar Lançamentos', `Sincronizou ${newTransactions.length} lançamentos de ${competenciaExtenso} com o Financeiro`);
      setSyncStatus(`Lançamentos salvos no banco de dados e sincronizados no Módulo Financeiro (${newTransactions.length} lançamentos registrados)!`);
      setTimeout(() => setSyncStatus(null), 5000);
      alert(`Sucesso!\n\nTodos os lançamentos do REFC de ${competenciaExtenso} foram gravados no banco de dados e sincronizados no Módulo Financeiro Geral (${newTransactions.length} lançamentos registrados).`);
    } catch (err: any) {
      console.error('Erro ao salvar no BD:', err);
      alert('Erro ao salvar lançamentos no banco de dados: ' + err.message);
    } finally {
      setIsSavingToDb(false);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-full">
      {/* Barra de Controle de Competência e Ações */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-2xl bg-white p-4 sm:p-5 border border-zinc-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 ring-1 ring-inset ring-blue-600/20">
              Lançamentos REFC
            </span>
            <h2 className="text-xl font-bold text-zinc-900">Prestação de Contas Mensal dos Cultos</h2>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Lançamento do total arrecadado, divisão automática por cultos (Ter, Sex, Dom), registro de despesas e sincronização direta no banco de dados.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <Calendar size={16} className="text-zinc-500" />
            <label htmlFor="refc-month-select" className="text-xs font-bold text-zinc-600 uppercase">Mês:</label>
            <input
              id="refc-month-select"
              type="month"
              value={selectedMonthYear}
              onChange={(e) => setSelectedMonthYear(e.target.value)}
              className="bg-transparent font-bold text-zinc-900 outline-none cursor-pointer text-xs sm:text-sm"
            />
          </div>

          <a
            href={`#/reports?type=quadrangular&month=${selectedMonthYear}`}
            className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3.5 py-2 text-xs sm:text-sm font-bold text-blue-700 hover:bg-blue-100 transition-all active:scale-95 shadow-xs"
            title="Visualizar o layout oficial e imprimir as folhas do REFC"
          >
            <FileSpreadsheet size={16} />
            Visualizar Relatório Oficial
          </a>

          <button
            onClick={handleSaveToDatabaseAndFinance}
            disabled={isSavingToDb}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
          >
            <Save size={16} />
            {isSavingToDb ? 'Gravando no Banco...' : 'Salvar no Financeiro'}
          </button>

          <button
            onClick={handleClearAll}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-500 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-all"
            title="Zerar valores deste mês"
          >
            <RotateCcw size={14} />
            Zerar Mês
          </button>
        </div>
      </div>

      {syncStatus && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-bold text-emerald-800 animate-fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
          <span>{syncStatus}</span>
        </div>
      )}

      {/* ⚡ PAINEL MÁGICO: LANÇAMENTO DO VALOR TOTAL & DIVISÃO NOS CULTOS */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-white p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-blue-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Sparkles size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900">
                Lançamento Rápido & Divisão Automática nos Cultos
              </h3>
              <p className="text-xs text-zinc-500">
                Digite o valor total arrecadado no mês e a Oferta de Missões (SEMEQ - 3º Domingo). O sistema distribui entre Dízimos e Ofertas nos dias de culto (Terça, Sexta e Domingo).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-blue-200 bg-white p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDistMode('total')}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-all",
                  distMode === 'total' ? "bg-blue-600 text-white shadow-xs" : "text-zinc-600 hover:text-zinc-900"
                )}
              >
                Valor Total Global
              </button>
              <button
                type="button"
                onClick={() => setDistMode('detailed')}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-all",
                  distMode === 'detailed' ? "bg-blue-600 text-white shadow-xs" : "text-zinc-600 hover:text-zinc-900"
                )}
              >
                Totais por Categoria
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 items-end">
          {distMode === 'total' ? (
            <>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Valor Total Arrecadado no Mês (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={totalGeneralTarget}
                    onChange={(e) => setTotalGeneralTarget(e.target.value)}
                    placeholder="Ex: 4300,00"
                    className="w-full rounded-xl border border-blue-300 bg-white py-2 pl-10 pr-3 text-base font-bold text-blue-950 focus:border-blue-600 focus:outline-hidden shadow-xs"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-amber-900 flex items-center gap-1">
                    Oferta de Missões (3º Dom) (R$)
                  </label>
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                    SEMEQ / 3º Domingo
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={targetMissions}
                    onChange={(e) => setTargetMissions(e.target.value)}
                    placeholder="0,00 (Opcional)"
                    className="w-full rounded-xl border border-amber-300 bg-amber-50/30 py-2 pl-10 pr-3 text-sm font-bold text-amber-950 focus:border-amber-600 focus:outline-hidden shadow-xs"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Total Dízimos (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={targetTithes}
                  onChange={(e) => setTargetTithes(e.target.value)}
                  placeholder="3500,00"
                  className="w-full rounded-xl border border-zinc-300 bg-white py-2 px-3 text-sm font-bold text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Oferta Geral (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={targetOfferingGeneral}
                  onChange={(e) => setTargetOfferingGeneral(e.target.value)}
                  placeholder="500,00"
                  className="w-full rounded-xl border border-zinc-300 bg-white py-2 px-3 text-sm font-bold text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Oferta Especial (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={targetOfferingSpecial}
                  onChange={(e) => setTargetOfferingSpecial(e.target.value)}
                  placeholder="200,00"
                  className="w-full rounded-xl border border-zinc-300 bg-white py-2 px-3 text-sm font-bold text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-amber-900">Missões (R$)</label>
                  <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1 rounded">3º Dom</span>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={targetMissions}
                  onChange={(e) => setTargetMissions(e.target.value)}
                  placeholder="100,00"
                  className="w-full rounded-xl border border-amber-300 bg-amber-50/30 py-2 px-3 text-sm font-bold text-amber-950 focus:border-amber-600 focus:outline-hidden"
                />
              </div>
            </>
          )}

          <div>
            <button
              type="button"
              onClick={handleApplySmartDistribution}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 px-4 text-xs font-bold text-white shadow-md hover:from-blue-700 hover:to-indigo-700 transition-all active:scale-95"
            >
              <Sparkles size={16} />
              Distribuir nos Cultos
            </button>
          </div>
        </div>
      </div>

      {/* BANNER DEMONSTRATIVO: TOTAL ARRECADADO - SAÍDAS = RESULTADO */}
      <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-blue-50 via-indigo-50/70 to-emerald-50 p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-lg shadow-xs">
              ∑
            </div>
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-900 block">
                Cálculo de Fechamento Oficial (REFC)
              </span>
              <p className="text-xs sm:text-sm font-medium text-zinc-700">
                Resultado do Mês = <strong className="text-blue-900">Total Arrecadado</strong> (-) <strong className="text-rose-900">Total de Saídas (Despesas + 25%)</strong>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-mono font-bold">
            <div className="rounded-xl bg-white px-3.5 py-2 border border-blue-200 text-blue-900 shadow-2xs text-center">
              <span className="text-[10px] text-blue-700 block uppercase font-sans font-extrabold">Total Arrecadado (+)</span>
              <span className="text-sm">{fmtCurrency(totalArrecadacao)}</span>
            </div>
            <span className="text-lg text-zinc-400 font-sans font-bold">-</span>
            <div className="rounded-xl bg-white px-3.5 py-2 border border-rose-200 text-rose-900 shadow-2xs text-center">
              <span className="text-[10px] text-rose-700 block uppercase font-sans font-extrabold">Total de Saídas (-)</span>
              <span className="text-sm">{fmtCurrency(totalSaidasComTaxa)}</span>
            </div>
            <span className="text-lg text-zinc-400 font-sans font-bold">=</span>
            <div className={cn(
              "rounded-xl px-3.5 py-2 border shadow-2xs text-center",
              saldoFinalMes >= 0 ? "bg-emerald-600 text-white border-emerald-700" : "bg-rose-600 text-white border-rose-700"
            )}>
              <span className="text-[10px] text-emerald-100 block uppercase font-sans font-extrabold">Resultado / Saldo</span>
              <span className="text-sm">{fmtCurrency(saldoFinalMes)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* RESUMO DOS TOTAIS CALCULADOS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-xs">
          <span className="text-[11px] font-bold text-zinc-500 uppercase block">Total Dízimos</span>
          <span className="text-base font-bold text-zinc-900">{fmtCurrency(totalTithesSum)}</span>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-xs">
          <span className="text-[11px] font-bold text-zinc-500 uppercase block">Total Ofertas</span>
          <span className="text-base font-bold text-zinc-900">{fmtCurrency(totalOfferingGenSum + totalOfferingSpecSum)}</span>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-xs">
          <span className="text-[11px] font-bold text-zinc-500 uppercase block">Missões (3º Dom)</span>
          <span className="text-base font-bold text-zinc-900">{fmtCurrency(totalMissionsSum)}</span>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 shadow-xs">
          <span className="text-[11px] font-bold text-blue-700 uppercase block">Total Arrecadado</span>
          <span className="text-base font-bold text-blue-900">{fmtCurrency(totalArrecadacao)}</span>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 shadow-xs">
          <span className="text-[11px] font-bold text-rose-700 uppercase block">Total de Saídas</span>
          <span className="text-base font-bold text-rose-900">{fmtCurrency(totalSaidasComTaxa)}</span>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 shadow-xs">
          <span className="text-[11px] font-bold text-emerald-700 uppercase block">Resultado Final</span>
          <span className={cn("text-base font-bold", saldoFinalMes >= 0 ? "text-emerald-700" : "text-rose-700")}>
            {fmtCurrency(saldoFinalMes)}
          </span>
        </div>
      </div>

      {/* LANÇAMENTO DE DESPESAS / DISCRIMINAÇÃO DE SAÍDAS */}
      <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 border-b border-rose-100 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <ArrowDownCircle size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-900">
              Discriminação de Saídas / Despesas do Mês ({expenses.length})
            </h3>
            <p className="text-xs text-zinc-500">
              Lançamento das despesas da igreja que compõem a discriminação de saídas da folha oficial.
            </p>
          </div>
        </div>

        <form onSubmit={handleAddExpense} className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-zinc-700 mb-1">Data (ex: 10/07)</label>
            <input
              type="text"
              value={newExpenseDate}
              onChange={(e) => setNewExpenseDate(e.target.value)}
              placeholder="DD/MM"
              className="w-full rounded-xl border border-zinc-300 bg-white p-2 text-xs font-mono font-bold text-zinc-900 focus:border-rose-600 focus:outline-hidden"
            />
          </div>

          <div className="sm:col-span-6">
            <label className="block text-xs font-bold text-zinc-700 mb-1">Descrição da Despesa</label>
            <input
              type="text"
              value={newExpenseDesc}
              onChange={(e) => setNewExpenseDesc(e.target.value)}
              placeholder="Ex: TAXA DE LUZ, SUSTENTO PASTORAL, INTERNET..."
              className="w-full rounded-xl border border-zinc-300 bg-white p-2 text-xs font-bold uppercase text-zinc-900 focus:border-rose-600 focus:outline-hidden"
              required
            />
            {/* Sugestões rápidas */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {commonExpenseSuggestions.slice(0, 5).map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setNewExpenseDesc(sug)}
                  className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 hover:bg-zinc-200"
                >
                  + {sug}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-zinc-700 mb-1">Valor (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={newExpenseAmount}
              onChange={(e) => setNewExpenseAmount(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-xl border border-zinc-300 bg-white p-2 text-xs font-bold text-zinc-900 focus:border-rose-600 focus:outline-hidden"
              required
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2 px-3 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition-all active:scale-95"
            >
              <Plus size={15} />
              Adicionar
            </button>
          </div>
        </form>

        {/* Tabela de Despesas Lançadas */}
        <div className="mt-4 border border-zinc-200 rounded-xl w-full max-w-full sheet-scroll-container touch-auto">
          <table className="w-full min-w-[520px] text-xs text-left">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold uppercase">
              <tr>
                <th className="p-2.5">Data</th>
                <th className="p-2.5">Descrição</th>
                <th className="p-2.5 text-center">Tipo</th>
                <th className="p-2.5 text-right w-36">Valor (R$)</th>
                <th className="p-2.5 text-center w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {expenses.map((exp) => {
                const isFixed = exp.description.toUpperCase().includes('ÁGUA') ||
                  exp.description.toUpperCase().includes('AGUA') ||
                  exp.description.toUpperCase().includes('LUZ') ||
                  exp.description.toUpperCase().includes('ENERGIA') ||
                  exp.description.toUpperCase().includes('SUSTENTO PASTORAL');

                return (
                  <tr key={exp.id} className={cn("hover:bg-zinc-50/80 transition-colors", isFixed && "bg-blue-50/30")}>
                    <td className="p-2.5 font-mono font-bold text-zinc-700">{exp.date}</td>
                    <td className="p-2.5 font-bold uppercase text-zinc-900">
                      {exp.description}
                    </td>
                    <td className="p-2.5 text-center">
                      {isFixed ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                          Fixa (Valor Variável)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-600">
                          Operacional
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex justify-end">
                        <RefcCurrencyCell
                          value={exp.amount}
                          onChange={(val) => handleExpenseAmountChange(exp.id, val)}
                          className="w-28 text-rose-700 font-bold"
                        />
                      </div>
                    </td>
                    <td className="p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditExpense(exp)}
                          className="rounded-lg p-1 text-blue-600 hover:bg-blue-50"
                          title="Alterar Despesa"
                        >
                          <Edit2 size={14} />
                        </button>
                        {!isFixed && (
                          <button
                            type="button"
                            onClick={() => handleRemoveExpense(exp.id, exp.description)}
                            className="rounded-lg p-1 text-rose-600 hover:bg-rose-50"
                            title="Excluir Despesa"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* TAXA DA REGIÃO (25%) - FIXA OBRIGATÓRIA */}
              <tr className="bg-amber-50/60 font-bold border-t border-amber-200">
                <td className="p-2.5 font-mono text-zinc-700">-</td>
                <td className="p-2.5 text-zinc-950 uppercase">
                  TAXA DA REGIÃO / SEDE (25%)
                </td>
                <td className="p-2.5 text-center">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                    Fixa (25% Automático)
                  </span>
                </td>
                <td className="p-2.5 text-right font-mono text-amber-900 text-sm">
                  {fmtCurrency(taxaSede25)}
                </td>
                <td className="p-2.5 text-center text-zinc-400 text-[10px] font-mono">Auto</td>
              </tr>
            </tbody>
            <tfoot className="bg-zinc-50 border-t-2 border-zinc-300 font-bold text-xs">
              <tr className="border-b border-zinc-200">
                <td colSpan={3} className="p-2.5 text-zinc-700 uppercase">
                  Subtotal Despesas Operacionais (Água, Luz, Sustento...):
                </td>
                <td className="p-2.5 text-right font-mono text-zinc-900">{fmtCurrency(manualExpensesSum)}</td>
                <td></td>
              </tr>
              <tr className="border-b border-zinc-200">
                <td colSpan={3} className="p-2.5 text-amber-900 uppercase">
                  (+) Taxa Região (25% sobre Arrecadação):
                </td>
                <td className="p-2.5 text-right font-mono text-amber-900">{fmtCurrency(taxaSede25)}</td>
                <td></td>
              </tr>
              <tr className="bg-rose-50/70 border-b-2 border-rose-200">
                <td colSpan={3} className="p-2.5 text-rose-950 uppercase font-extrabold">
                  (=) Total Geral de Saídas do Mês:
                </td>
                <td className="p-2.5 text-right font-mono text-rose-800 text-sm font-extrabold">{fmtCurrency(totalSaidasComTaxa)}</td>
                <td></td>
              </tr>
              <tr className={cn(saldoFinalMes >= 0 ? "bg-emerald-50/70" : "bg-rose-100/70")}>
                <td colSpan={3} className={cn("p-2.5 uppercase font-extrabold", saldoFinalMes >= 0 ? "text-emerald-950" : "text-rose-950")}>
                  (=) Resultado Final do Mês (Total Arrecadado {fmtCurrency(totalArrecadacao)} - Saídas {fmtCurrency(totalSaidasComTaxa)}):
                </td>
                <td className={cn("p-2.5 text-right font-mono text-sm font-extrabold", saldoFinalMes >= 0 ? "text-emerald-800" : "text-rose-800")}>
                  {fmtCurrency(saldoFinalMes)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* GRADE DIÁRIA DE CULTOS / DIAS DO MÊS */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Calculator size={18} className="text-zinc-500" />
            <h3 className="text-base font-bold text-zinc-900">
              Grade Detalhada de Cultos ({competenciaExtenso})
            </h3>
          </div>
          <span className="text-xs text-zinc-500">
            Você pode ajustar os valores de qualquer culto digitando diretamente com vírgula (ex: 150,50):
          </span>
        </div>

        <div className="border border-zinc-200 rounded-xl w-full max-w-full sheet-scroll-container touch-auto">
          <table className="w-full min-w-[620px] text-xs text-left">
            <thead className="bg-zinc-100 border-b border-zinc-200 text-zinc-700 font-bold uppercase">
              <tr>
                <th className="p-2 text-center w-12">Dia</th>
                <th className="p-2 w-28">Dia Semana</th>
                <th className="p-2 text-right">Dízimos (R$)</th>
                <th className="p-2 text-right">Oferta Geral (R$)</th>
                <th className="p-2 text-right">Oferta Especial (R$)</th>
                <th className="p-2 text-right">Missões 3º Dom (R$)</th>
                <th className="p-2 text-right">Total Culto (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {dailyEntries.map((entry, index) => {
                const isHighlight = entry.isCulto;
                return (
                  <tr 
                    key={entry.day} 
                    className={cn(
                      "hover:bg-blue-50/50 transition-colors",
                      entry.isThirdSunday ? "bg-amber-50/70" : isHighlight ? "bg-zinc-50/60" : "bg-white"
                    )}
                  >
                    <td className="p-2 text-center font-bold font-mono">{entry.day}</td>
                    <td className="p-2 font-semibold">
                      <span className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold",
                        entry.dayOfWeek === 0 ? "bg-rose-100 text-rose-800" :
                        entry.dayOfWeek === 2 ? "bg-blue-100 text-blue-800" :
                        entry.dayOfWeek === 5 ? "bg-purple-100 text-purple-800" :
                        "text-zinc-500"
                      )}>
                        {entry.dayOfWeekName}
                      </span>
                      {entry.isThirdSunday && (
                        <span className="ml-1 text-[9px] font-bold text-amber-700">(Missões)</span>
                      )}
                    </td>
                    <td className="p-1 text-right">
                      <div className="flex justify-end">
                        <RefcCurrencyCell
                          value={entry.tithes}
                          onChange={(val) => handleCellChange(index, 'tithes', val)}
                        />
                      </div>
                    </td>
                    <td className="p-1 text-right">
                      <div className="flex justify-end">
                        <RefcCurrencyCell
                          value={entry.offeringGeneral}
                          onChange={(val) => handleCellChange(index, 'offeringGeneral', val)}
                        />
                      </div>
                    </td>
                    <td className="p-1 text-right">
                      <div className="flex justify-end">
                        <RefcCurrencyCell
                          value={entry.offeringSpecial}
                          onChange={(val) => handleCellChange(index, 'offeringSpecial', val)}
                        />
                      </div>
                    </td>
                    <td className="p-1 text-right">
                      <div className="flex justify-end">
                        <RefcCurrencyCell
                          value={entry.missions}
                          onChange={(val) => handleCellChange(index, 'missions', val)}
                        />
                      </div>
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-zinc-900">
                      {fmtCurrency(entry.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-zinc-100 border-t-2 border-zinc-300 font-bold">
              <tr>
                <td colSpan={2} className="p-2.5 uppercase">Totais do Mês:</td>
                <td className="p-2.5 text-right font-mono text-zinc-900">{fmtCurrency(totalTithesSum)}</td>
                <td className="p-2.5 text-right font-mono text-zinc-900">{fmtCurrency(totalOfferingGenSum)}</td>
                <td className="p-2.5 text-right font-mono text-zinc-900">{fmtCurrency(totalOfferingSpecSum)}</td>
                <td className="p-2.5 text-right font-mono text-zinc-900">{fmtCurrency(totalMissionsSum)}</td>
                <td className="p-2.5 text-right font-mono text-blue-900 text-sm">{fmtCurrency(totalArrecadacao)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* MODAL DE EDIÇÃO DE DESPESA */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-scale-up">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-4">
              <h4 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <Edit2 size={16} className="text-blue-600" />
                Alterar Despesa
              </h4>
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditExpense} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Data da Despesa (ex: 10/07)
                </label>
                <input
                  type="text"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  placeholder="DD/MM"
                  className="w-full rounded-xl border border-zinc-300 bg-white p-2.5 text-xs font-mono font-bold text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Descrição da Despesa / Saída
                </label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Ex: TAXA DE LUZ, SUSTENTO PASTORAL..."
                  className="w-full rounded-xl border border-zinc-300 bg-white p-2.5 text-xs font-bold uppercase text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Valor da Despesa (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-xl border border-zinc-300 bg-white p-2.5 text-xs font-mono font-bold text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-sm"
                >
                  <Save size={14} />
                  Salvar Alteração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO PARA ZERAR O MÊS */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100">
                <AlertTriangle size={24} className="text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900">Zerar Mês ({competenciaExtenso})</h3>
                <p className="text-xs text-zinc-500">Esta ação apagará os lançamentos deste mês</p>
              </div>
            </div>

            <div className="mb-5 rounded-xl bg-rose-50/70 border border-rose-100 p-3.5 text-xs text-rose-950 space-y-1.5">
              <p className="font-bold">O que será zerado:</p>
              <ul className="list-disc pl-4 space-y-1 text-rose-800">
                <li>Todos os valores de cultos (Dízimos e Ofertas)</li>
                <li>Todas as despesas deste mês</li>
                <li>O relatório salvo no Banco de Dados</li>
                <li>As transações sincronizadas no Módulo Financeiro</li>
              </ul>
              <p className="text-[11px] text-rose-700 pt-1 font-semibold">
                O mês ficará 100% limpo para você relançar do zero.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isClearingMonth}
                onClick={() => setShowClearModal(false)}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition-all active:scale-95 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isClearingMonth}
                onClick={executeClearMonth}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-rose-700 transition-all active:scale-95 disabled:opacity-50"
              >
                {isClearingMonth ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Zerando...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Sim, Zerar Tudo
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
