import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Printer, 
  Download, 
  FileSpreadsheet, 
  Sparkles, 
  Calculator, 
  Calendar, 
  Building2, 
  Save, 
  Plus, 
  Trash2, 
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Info,
  Layers,
  ArrowDownCircle,
  FileText,
  Pencil,
  X,
  Database,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Move,
  Smartphone,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { format, parseISO, getDaysInMonth, startOfMonth, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { printHtmlElements } from '../lib/printUtils';
import { captureElementToPng, downloadPdfFromPngList, openPdfInNewTab } from '../lib/pdfCapture';
import { collection, query, where, getDocs, addDoc, deleteDoc, serverTimestamp, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { logAction } from '../lib/logger';
import AnnualConsolidatedReport from './AnnualConsolidatedReport';
import { parseCurrencyInput } from './RefcEntryForm';

interface DailyEntry {
  day: number;
  dateStr: string;
  dayOfWeek: number; // 0: Dom, 1: Seg, 2: Ter, 3: Qua, 4: Qui, 5: Sex, 6: Sab
  dayOfWeekName: string;
  isCulto: boolean;
  isThirdSunday: boolean;
  tithes: number;
  offeringGeneral: number;
  offeringSpecial: number;
  missions: number; // 3º domingo
  total: number;
}

interface ExpenseEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  isTaxaRegiao?: boolean;
}

interface ChurchInfo {
  churchName: string;
  pastorName: string;
  address: string;
  region: string;
  logoUrl?: string;
}

export default function QuadrangularReport({ role }: { role: string | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // Competência selecionada (pega da URL, do localStorage ou padrão para o mês corrente ex: 2026-08)
  const [selectedMonthYear, setSelectedMonthYear] = useState(() => {
    const urlMonth = searchParams.get('month');
    if (urlMonth && /^\d{4}-\d{2}$/.test(urlMonth)) {
      return urlMonth;
    }
    try {
      const savedMonth = localStorage.getItem('ieq_selected_month_year');
      if (savedMonth && /^\d{4}-\d{2}$/.test(savedMonth)) {
        return savedMonth;
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    return format(new Date(), 'yyyy-MM');
  });

  // Mantém a competência selecionada sempre gravada no localStorage para não resetar ao navegar
  useEffect(() => {
    if (selectedMonthYear && /^\d{4}-\d{2}$/.test(selectedMonthYear)) {
      try {
        localStorage.setItem('ieq_selected_month_year', selectedMonthYear);
      } catch (e) {
        // Ignore localStorage errors
      }
    }
  }, [selectedMonthYear]);
  const [activeTab, setActiveTab] = useState<'refc' | 'entradas' | 'expenses' | 'annual'>('refc');
  const [printMode, setPrintMode] = useState<'refc' | 'entradas' | 'both'>('refc');
  const [isSavingToDb, setIsSavingToDb] = useState(false);
  
  // Informações da Igreja e Liderança
  const [churchInfo, setChurchInfo] = useState<ChurchInfo>({
    churchName: 'TABERNÁCULO DA FAMÍLIA',
    pastorName: 'MARCELO PONTES',
    address: 'RUA 30 QUADRA 46 Nº 232 - CONJ PROMORAR',
    region: '115'
  });

  // Estatísticas do REFC
  const [stats, setStats] = useState({
    membersCount: 120,
    cellsCount: 11,
    visitorsCount: 25,
    conversionsCount: 0,
    baptismsWaterCount: 0,
    baptismsHolySpiritCount: 0
  });

  // Entradas Diárias (1 a 31)
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);

  // Valores de Distribuição Rápida (inicialmente vazios para o usuário lançar)
  const [distMode, setDistMode] = useState<'total' | 'detailed'>('total');
  const [totalGeneralTarget, setTotalGeneralTarget] = useState<string>('');
  const [targetTithes, setTargetTithes] = useState<string>('');
  const [targetOfferingGeneral, setTargetOfferingGeneral] = useState<string>('');
  const [targetOfferingSpecial, setTargetOfferingSpecial] = useState<string>('');
  const [targetMissions, setTargetMissions] = useState<string>('');

  // Saídas / Despesas (inicia zerado para o usuário lançar)
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);

  // Estado para Alteração/Edição de Despesa
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);
  const [editingExpenseIndex, setEditingExpenseIndex] = useState<number | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<{ exp: ExpenseEntry; index: number } | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Novo formulário de inserção rápida de despesa
  const [newExpenseDate, setNewExpenseDate] = useState('');
  const [newExpenseDesc, setNewExpenseDesc] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [isImportingExpenses, setIsImportingExpenses] = useState(false);

  const [observations, setObservations] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfNotification, setPdfNotification] = useState<{
    status: 'generating' | 'ready' | 'error';
    message?: string;
    blobUrl?: string;
    fileName?: string;
  } | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearingMonth, setIsClearingMonth] = useState(false);

  const refcPrintRef = useRef<HTMLDivElement>(null);
  const entradasPrintRef = useRef<HTMLDivElement>(null);
  const bothPrintRef = useRef<HTMLDivElement>(null);

  // Estados para Gestos e Zoom Responsivo Mobile (Android / iOS)
  const [mobileZoomMode, setMobileZoomMode] = useState<'fit' | '100' | 'custom'>('fit');
  const [customZoomScale, setCustomZoomScale] = useState<number>(1);
  const [screenWidth, setScreenWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const sheetScrollWrapperRef = useRef<HTMLDivElement>(null);
  const touchStateRef = useRef<{ startX: number; startY: number; scrollLeft: number; startScrollY: number } | null>(null);

  useEffect(() => {
    const handleWinResize = () => {
      if (sheetScrollWrapperRef.current && sheetScrollWrapperRef.current.clientWidth > 0) {
        setScreenWidth(sheetScrollWrapperRef.current.clientWidth);
      } else {
        setScreenWidth(window.innerWidth);
      }
    };
    handleWinResize();
    window.addEventListener('resize', handleWinResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && sheetScrollWrapperRef.current) {
      ro = new ResizeObserver(() => {
        handleWinResize();
      });
      ro.observe(sheetScrollWrapperRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleWinResize);
      ro?.disconnect();
    };
  }, []);

  const isSmallScreen = screenWidth < 840;
  // A4 largura padrão 794px. Calcula fator para caber 100% na largura da tela mobile
  const calculatedFitScale = Math.min(1, Math.max(0.32, (screenWidth - 28) / 794));
  const currentSheetScale = isSmallScreen
    ? (mobileZoomMode === 'fit' ? calculatedFitScale : (mobileZoomMode === '100' ? 1.0 : customZoomScale))
    : 1.0;

  // Manipulador de toque 2D para permitir arrastar a folha livremente em qualquer direção
  const handleSheetTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && sheetScrollWrapperRef.current) {
      touchStateRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        scrollLeft: sheetScrollWrapperRef.current.scrollLeft,
        startScrollY: window.scrollY
      };
    }
  };

  const handleSheetTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStateRef.current && e.touches.length === 1 && sheetScrollWrapperRef.current) {
      const deltaX = touchStateRef.current.startX - e.touches[0].clientX;
      const deltaY = touchStateRef.current.startY - e.touches[0].clientY;

      // Se a folha estiver maior que a tela (escala 100% ou zoom manual), move horizontalmente
      if (currentSheetScale > calculatedFitScale) {
        sheetScrollWrapperRef.current.scrollLeft = touchStateRef.current.scrollLeft + deltaX;
      }
      // Permite rolagem vertical suave com o dedo
      window.scrollTo({
        top: touchStateRef.current.startScrollY + deltaY,
        behavior: 'auto'
      });
    }
  };

  const handleSheetTouchEnd = () => {
    touchStateRef.current = null;
  };

  // Sugestões comuns de despesas da igreja
  const commonExpenseSuggestions = [
    'TAXA ÁGUA',
    'TAXA DE LUZ',
    'SUSTENTO PASTORAL',
    'INTERNET / TELEFONE',
    'MATERIAL DE LIMPEZA',
    'MANUTENÇÃO DO TEMPLO',
    'MISSÕES REGIONAIS',
    'EQUIPAMENTOS DE SOM',
    'COMBUSTÍVEL / TRANSPORTE',
    'ALUGUEL DO TEMPLO',
    'SECRETARIA / PAPELARIA',
    'ESCOLA BÍBLICA / INFANTIL'
  ];

  // Carrega configurações da igreja ao montar
  useEffect(() => {
    const fetchChurchSettings = async () => {
      try {
        const sDoc = await getDoc(doc(db, 'settings', 'church'));
        if (sDoc.exists()) {
          const data = sDoc.data();
          setChurchInfo(prev => ({
            ...prev,
            churchName: data.name || prev.churchName,
            pastorName: data.pastorName || prev.pastorName,
            address: data.address || prev.address,
            region: data.region || prev.region,
            logoUrl: data.logoUrl || prev.logoUrl
          }));
        }

        // Tentar buscar contagem real de células e membros
        const cellsSnap = await getDocs(collection(db, 'cells'));
        const cellsList = cellsSnap.docs.map(d => d.data());
        if (cellsList.length > 0) {
          const totalMembers = cellsList.reduce((sum, c: any) => sum + (c.memberCount || 0), 0);
          setStats(prev => ({
            ...prev,
            cellsCount: cellsList.length,
            membersCount: totalMembers > 0 ? totalMembers : prev.membersCount
          }));
        }
      } catch (err) {
        console.warn('Erro ao buscar dados da igreja:', err);
      }
    };
    fetchChurchSettings();
  }, []);

  // Inicializa a grade de dias e sincroniza com Firestore em tempo real quando o mês/ano muda
  useEffect(() => {
    // 1. Inicializa a grade básica e carrega localStorage
    initializeMonthGrid(selectedMonthYear);

    // 2. Escuta Firestore em tempo real para carregar dados salvos em nuvem
    const docRef = doc(db, 'refc_reports', selectedMonthYear);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.dailyEntries && Array.isArray(data.dailyEntries)) {
          setDailyEntries(data.dailyEntries);
        }
        if (data.expenses && Array.isArray(data.expenses)) {
          const sanitizedExpenses = data.expenses.map((e: any) => {
            const desc = (e.description || '').toUpperCase();
            let amt = typeof e.amount === 'number' ? e.amount : parseCurrencyInput(e.amount);
            if ((desc.includes('ÁGUA') || desc.includes('AGUA')) && (amt === 1957 || amt === 1957.00)) {
              amt = 195.70;
            }
            return {
              ...e,
              amount: Math.round(amt * 100) / 100
            };
          });
          setExpenses(sanitizedExpenses);
        }
        if (data.totalGeneralTarget !== undefined) setTotalGeneralTarget(data.totalGeneralTarget);
        if (data.targetTithes !== undefined) setTargetTithes(data.targetTithes);
        if (data.targetOfferingGeneral !== undefined) setTargetOfferingGeneral(data.targetOfferingGeneral);
        if (data.targetOfferingSpecial !== undefined) setTargetOfferingSpecial(data.targetOfferingSpecial);
        if (data.targetMissions !== undefined) setTargetMissions(data.targetMissions);
        if (data.observations !== undefined) setObservations(data.observations);
        if (data.stats) setStats(prev => ({ ...prev, ...data.stats }));
      } else {
        // Se o documento NÃO existe no Firestore (ex: após zerar o mês)
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
          setExpenses([]);
          setTotalGeneralTarget('');
          setTargetTithes('');
          setTargetOfferingGeneral('');
          setTargetOfferingSpecial('');
          setTargetMissions('');
          setObservations('');
        }
      }
    }, (err) => {
      console.warn('Erro ao escutar dados do Firestore para', selectedMonthYear, err);
    });

    return () => {
      unsubscribe();
    };
  }, [selectedMonthYear]);

  // Função para criar a lista de dias do mês e carregar dados salvos
  const initializeMonthGrid = (monthYearStr: string) => {
    const [yearStr, monthStr] = monthYearStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed
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
      const isCulto = dayOfWeek === 0 || dayOfWeek === 2 || dayOfWeek === 5; // Dom, Ter, Sex

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
          setExpenses(saved.expenses);
        } else {
          setExpenses([]);
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

    // Padrão limpo e zerado
    setDailyEntries(baseEntries);
    setExpenses([]);
    setTotalGeneralTarget('');
    setTargetTithes('');
    setTargetOfferingGeneral('');
    setTargetOfferingSpecial('');
    setTargetMissions('');
  };

  // Salva automaticamente as alterações no cache local da competência
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
          targetMissions
        }));
      } catch (e) {
        // ignore
      }
    }
  }, [dailyEntries, expenses, totalGeneralTarget, targetTithes, targetOfferingGeneral, targetOfferingSpecial, targetMissions, selectedMonthYear]);

  // ⚡ DIVISÃO AUTOMÁTICA NOS DIAS DE CULTO (Terça, Sexta e Domingo)
  const handleAutoDistribute = () => {
    if (dailyEntries.length === 0) return;

    let tTithes = 0;
    let tOffGen = 0;
    let tOffSpec = 0;
    let tMissions = 0;

    if (distMode === 'total') {
      const total = parseFloat(totalGeneralTarget) || 0;
      if (total <= 0) {
        alert('Por favor, informe um valor total maior que zero para distribuir.');
        return;
      }
      // Distribuição proporcional típica de igreja:
      // 80% Dízimos, 14% Oferta Geral, 4.8% Oferta Especial, 1.2% Missões
      tMissions = Math.min(50, Math.round(total * 0.012));
      const remaining = total - tMissions;
      tTithes = Math.round(remaining * 0.82);
      tOffGen = Math.round(remaining * 0.14);
      tOffSpec = total - (tTithes + tOffGen + tMissions);
    } else {
      tTithes = parseFloat(targetTithes) || 0;
      tOffGen = parseFloat(targetOfferingGeneral) || 0;
      tOffSpec = parseFloat(targetOfferingSpecial) || 0;
      tMissions = parseFloat(targetMissions) || 0;
    }

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

    const getOrganicVariance = (day: number, offset = 0) => {
      return 1 + (((((day + offset) * 17) % 23) - 11) / 120);
    };

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

    // Pesos para Dízimos
    const weightsDiz = dailyEntries.map(e => {
      if (!e.isCulto) return 0;
      let dayBase = 1.0;
      if (e.dayOfWeek === 0) dayBase = 3.6;
      else if (e.dayOfWeek === 5) dayBase = 1.3;
      else if (e.dayOfWeek === 2) dayBase = 0.95;

      const period = getPeriodFactor(e.day);
      const tithePeriod = period > 1 ? period * 1.2 : period * 0.88;
      return dayBase * tithePeriod * getOrganicVariance(e.day, 0);
    });
    const distDiz = distributeTotal(tTithes, weightsDiz);

    // Pesos para Oferta Geral
    const weightsOfGen = dailyEntries.map(e => {
      if (!e.isCulto) return 0;
      let dayBase = 1.0;
      if (e.dayOfWeek === 0) dayBase = 3.2;
      else if (e.dayOfWeek === 5) dayBase = 1.35;
      else if (e.dayOfWeek === 2) dayBase = 1.0;

      const period = getPeriodFactor(e.day);
      return dayBase * period * getOrganicVariance(e.day, 5);
    });
    const distOfGen = distributeTotal(tOffGen, weightsOfGen);

    // Pesos para Oferta Especial
    const weightsOfEsp = dailyEntries.map(e => {
      if (!e.isCulto) return 0;
      let dayBase = 1.0;
      if (e.dayOfWeek === 0) dayBase = 2.6;
      else if (e.dayOfWeek === 5) dayBase = 1.2;
      else if (e.dayOfWeek === 2) dayBase = 0.85;

      const period = getPeriodFactor(e.day);
      return dayBase * period * getOrganicVariance(e.day, 11);
    });
    const distOfEsp = distributeTotal(tOffSpec, weightsOfEsp);

    const newEntries = dailyEntries.map((entry, index) => {
      const d = distDiz[index] || 0;
      const og = distOfGen[index] || 0;
      const oe = distOfEsp[index] || 0;
      const m = entry.isThirdSunday ? tMissions : 0;
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

    setDailyEntries(newEntries);
    setSyncStatus('Distribuição inteligente de cultos (progressão início-meio-fim) concluída com sucesso!');
    setTimeout(() => setSyncStatus(null), 4000);
  };

  // Alterar valor manual em uma célula da tabela
  const handleCellChange = (day: number, field: 'tithes' | 'offeringGeneral' | 'offeringSpecial' | 'missions', valStr: string) => {
    const val = parseCurrencyInput(valStr);
    setDailyEntries(prev => prev.map(entry => {
      if (entry.day === day) {
        const updated = { ...entry, [field]: val };
        updated.total = Math.round((updated.tithes + updated.offeringGeneral + updated.offeringSpecial + updated.missions) * 100) / 100;
        return updated;
      }
      return entry;
    }));
  };

  // Totais Calculados de Entradas
  const totalTithesSum = Math.round(dailyEntries.reduce((sum, d) => sum + (d.tithes || 0), 0) * 100) / 100;
  const totalOfferingGenSum = Math.round(dailyEntries.reduce((sum, d) => sum + (d.offeringGeneral || 0), 0) * 100) / 100;
  const totalOfferingSpecSum = Math.round(dailyEntries.reduce((sum, d) => sum + (d.offeringSpecial || 0), 0) * 100) / 100;
  const totalMissionsSum = Math.round(dailyEntries.reduce((sum, d) => sum + (d.missions || 0), 0) * 100) / 100;
  const totalArrecadacao = Math.round((totalTithesSum + totalOfferingGenSum + totalOfferingSpecSum + totalMissionsSum) * 100) / 100;

  // Taxa da Região / Sede (25% sobre a arrecadação total)
  const taxaSede25 = Math.round((totalArrecadacao * 0.25) * 100) / 100;

  // Total para a Sede no Resumo Diário
  const totalSedeResumo = Math.round((taxaSede25 - totalMissionsSum) * 100) / 100;

  // Totais de Saídas (incluindo a taxa de 25% da região)
  const manualExpensesSum = Math.round(expenses.reduce((sum, e) => sum + (e.amount || 0), 0) * 100) / 100;
  const totalSaidasComTaxa = Math.round((manualExpensesSum + taxaSede25) * 100) / 100;

  // Saldo Final do Mês = Total Arrecadado - Saídas
  const saldoFinalMes = Math.round((totalArrecadacao - totalSaidasComTaxa) * 100) / 100;

  // Manipular Despesas
  const handleAddExpense = () => {
    const newId = Date.now().toString();
    setExpenses(prev => [...prev, { id: newId, date: format(new Date(), 'dd/MM'), description: '', amount: 0 }]);
  };

  const handleQuickAddExpense = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newExpenseDesc.trim()) {
      alert('Por favor, informe a descrição da despesa (ex: Água, Luz, Sustento Pastoral).');
      return;
    }
    const val = parseCurrencyInput(newExpenseAmount);
    if (val <= 0) {
      alert('Por favor, informe um valor maior que zero para a despesa.');
      return;
    }

    let dateFormatted = newExpenseDate.trim();
    if (!dateFormatted) {
      dateFormatted = format(new Date(), 'dd/MM');
    } else if (dateFormatted.includes('-')) {
      const parts = dateFormatted.split('-');
      if (parts.length >= 3) {
        dateFormatted = `${parts[2]}/${parts[1]}`;
      }
    }

    const newExp: ExpenseEntry = {
      id: Date.now().toString(),
      date: dateFormatted,
      description: newExpenseDesc.trim().toUpperCase(),
      amount: val
    };

    setExpenses(prev => [...prev, newExp]);
    setNewExpenseDesc('');
    setNewExpenseAmount('');
    setSyncStatus(`Despesa "${newExp.description}" de ${fmtCurrency(val)} adicionada ao REFC!`);
    setTimeout(() => setSyncStatus(null), 3500);
  };

  // Importar despesas reais registradas no Firestore para o mês selecionado
  const handleImportExpensesFromFirestore = async () => {
    setIsImportingExpenses(true);
    try {
      const transRef = collection(db, 'transactions');
      const q = query(transRef, where('type', '==', 'expense'));
      const snap = await getDocs(q);
      
      const imported: ExpenseEntry[] = [];
      const [selYear, selMonth] = selectedMonthYear.split('-');
      
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const tDate = data.date || '';
        // Verificar se a data pertence ao mês/ano selecionado (ex: "2026-07")
        if (tDate.startsWith(`${selYear}-${selMonth}`) || tDate.includes(`/${selMonth}/${selYear}`) || tDate.includes(`-${selMonth}-`)) {
          let dateStr = '';
          if (tDate.includes('-')) {
            const parts = tDate.split('-');
            if (parts.length >= 3) dateStr = `${parts[2]}/${parts[1]}`;
          } else {
            dateStr = tDate;
          }
          imported.push({
            id: docSnap.id,
            date: dateStr || format(new Date(), 'dd/MM'),
            description: (data.description || data.category || 'DESPESA').toUpperCase(),
            amount: parseFloat(data.amount) || 0
          });
        }
      });

      if (imported.length > 0) {
        setExpenses(imported);
        setSyncStatus(`${imported.length} despesa(s) importada(s) do módulo financeiro!`);
      } else {
        alert(`Nenhuma despesa cadastrada no sistema encontrada especificamente para ${selectedMonthYear}. Você pode cadastrar usando o formulário acima.`);
      }
    } catch (err: any) {
      console.warn('Erro ao importar despesas:', err);
      alert('Erro ao importar despesas do banco de dados: ' + err.message);
    } finally {
      setIsImportingExpenses(false);
      setTimeout(() => setSyncStatus(null), 4000);
    }
  };

  const handleOpenEditExpense = (exp: ExpenseEntry, index: number) => {
    setEditingExpense(exp);
    setEditingExpenseIndex(index);
    setEditDate(exp.date || '');
    setEditDesc(exp.description || '');
    setEditAmount(exp.amount ? exp.amount.toFixed(2).replace('.', ',') : '');
    setEditError(null);
  };

  const handleSaveEditExpense = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingExpense && editingExpenseIndex === null) return;
    if (!editDesc.trim()) {
      setEditError('Por favor, informe a descrição da despesa.');
      return;
    }
    const val = parseCurrencyInput(editAmount);
    if (val <= 0) {
      setEditError('Por favor, informe um valor maior que zero para a despesa.');
      return;
    }

    let updatedList: ExpenseEntry[] = [];
    setExpenses(prev => {
      const existingIdx = prev.findIndex((exp, idx) => 
        (editingExpense?.id && exp.id === editingExpense.id) || idx === editingExpenseIndex
      );

      if (existingIdx >= 0) {
        updatedList = prev.map((exp, idx) => {
          if (idx === existingIdx) {
            return {
              ...exp,
              date: editDate.trim() || format(new Date(), 'dd/MM'),
              description: editDesc.trim().toUpperCase(),
              amount: val
            };
          }
          return exp;
        });
      } else {
        updatedList = [
          ...prev,
          {
            id: editingExpense?.id || Math.random().toString(36).substring(2, 9),
            date: editDate.trim() || format(new Date(), 'dd/MM'),
            description: editDesc.trim().toUpperCase(),
            amount: val
          }
        ];
      }
      return updatedList;
    });

    if (auth.currentUser && updatedList.length > 0) {
      setDoc(doc(db, 'refc_reports', selectedMonthYear), {
        expenses: updatedList,
        updatedAt: serverTimestamp()
      }, { merge: true }).catch(err => console.warn('Erro ao salvar despesa editada no Firestore:', err));
    }

    const savedDesc = editDesc.trim().toUpperCase();
    setEditingExpense(null);
    setEditingExpenseIndex(null);
    setEditError(null);
    setSyncStatus(`Despesa "${savedDesc}" alterada com sucesso!`);
    setTimeout(() => setSyncStatus(null), 3500);
  };

  const handleConfirmDeleteExpense = () => {
    if (!deletingExpense) return;
    const { exp, index } = deletingExpense;
    let filteredList: ExpenseEntry[] = [];
    setExpenses(prev => {
      filteredList = prev.filter((item, idx) => {
        if (exp.id && item.id) {
          return item.id !== exp.id;
        }
        return idx !== index;
      });
      return filteredList;
    });
    if (auth.currentUser) {
      setDoc(doc(db, 'refc_reports', selectedMonthYear), {
        expenses: filteredList,
        updatedAt: serverTimestamp()
      }, { merge: true }).catch(err => console.warn('Erro ao salvar exclusão de despesa:', err));
    }
    const desc = exp.description || 'Despesa';
    setDeletingExpense(null);
    setSyncStatus(`"${desc}" excluída com sucesso do REFC!`);
    setTimeout(() => setSyncStatus(null), 3000);
  };

  // Zerar todos os lançamentos do mês selecionado
  const handleClearAll = () => {
    if (window.confirm(`Deseja ZERAR todos os lançamentos e despesas de ${competenciaExtenso}? Esta ação limpará todos os valores para novos lançamentos.`)) {
      setTotalGeneralTarget('');
      setTargetTithes('');
      setTargetOfferingGeneral('');
      setTargetOfferingSpecial('');
      setTargetMissions('');
      setExpenses([]);
      setDailyEntries(prev => prev.map(e => ({
        ...e,
        tithes: 0,
        offeringGeneral: 0,
        offeringSpecial: 0,
        missions: 0,
        total: 0
      })));
      try {
        localStorage.removeItem(`refc_data_${selectedMonthYear}`);
      } catch (e) {}
      setSyncStatus('Todos os valores foram zerados!');
      setTimeout(() => setSyncStatus(null), 3500);
    }
  };

  // 💾 Salvar Lançamentos no Banco de Dados (Firestore) e Sincronizar com o Financeiro Geral
  const handleSaveToDatabaseAndFinance = async () => {
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
      // Buscar e remover transações antigas geradas pelo REFC deste mês para não duplicar
      const qExisting = query(
        collection(db, 'transactions'),
        where('refcMonth', '==', selectedMonthYear)
      );
      const snapExisting = await getDocs(qExisting);
      const deletePromises = snapExisting.docs.map(d => deleteDoc(doc(db, 'transactions', d.id)));
      await Promise.all(deletePromises);

      // Inserir os lançamentos do REFC no Financeiro
      const newTransactions: any[] = [];
      const currentUid = auth.currentUser?.uid || 'system';

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

      // Inserir Despesas do REFC no Financeiro
      expenses.forEach(exp => {
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
          amount: exp.amount,
          date: expDate || `${currentYear}-${currentMonthNum}-15`,
          description: exp.description || 'DESPESA OPERACIONAL REFC',
          category: 'Despesa REFC',
          destination: 'Igreja Local',
          createdBy: currentUid,
          createdAt: serverTimestamp(),
          refcMonth: selectedMonthYear
        });
      });

      // Inserir Taxa da Região (25%) no Financeiro
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

      // Executar inserção no Firestore
      const addPromises = newTransactions.map(t => addDoc(collection(db, 'transactions'), t));
      await Promise.all(addPromises);

      await logAction('REFC Salvar Lançamentos', `Sincronizou ${newTransactions.length} lançamentos de ${competenciaExtenso} com o Financeiro`);
      setSyncStatus(`Lançamentos salvos no banco de dados e sincronizados no Módulo Financeiro (${newTransactions.length} lançamentos registrados)!`);
      setTimeout(() => setSyncStatus(null), 5000);
      alert(`Sucesso!\n\nTodos os lançamentos do REFC de ${competenciaExtenso} foram gravados no banco de dados e sincronizados no Módulo Financeiro Geral da Igreja (${newTransactions.length} lançamentos registrados).`);
    } catch (err: any) {
      console.error('Erro ao salvar no BD:', err);
      alert('Erro ao salvar lançamentos no banco de dados: ' + err.message);
    } finally {
      setIsSavingToDb(false);
    }
  };

  // 🗑️ Abrir Modal para Zerar todos os lançamentos do mês
  const handleClearMonth = () => {
    setShowClearModal(true);
  };

  // Executar Zeramento Completo
  const executeClearMonth = async () => {
    setIsClearingMonth(true);
    try {
      // 1. Limpar estados locais
      setTotalGeneralTarget('');
      setTargetTithes('');
      setTargetOfferingGeneral('');
      setTargetOfferingSpecial('');
      setTargetMissions('');
      setObservations('');
      setExpenses([]);
      setDailyEntries(prev => prev.map(e => ({
        ...e,
        tithes: 0,
        offeringGeneral: 0,
        offeringSpecial: 0,
        missions: 0,
        total: 0
      })));

      // 2. Limpar cache local
      try {
        localStorage.removeItem(`refc_data_${selectedMonthYear}`);
      } catch (e) {}

      // 3. Excluir documento no Firestore
      try {
        await deleteDoc(doc(db, 'refc_reports', selectedMonthYear));
      } catch (err) {
        console.warn('Erro ao deletar refc_reports:', err);
      }

      // 4. Excluir transações financeiras vinculadas
      try {
        const qExisting = query(
          collection(db, 'transactions'),
          where('refcMonth', '==', selectedMonthYear)
        );
        const snapExisting = await getDocs(qExisting);
        const deletePromises = snapExisting.docs.map(d => deleteDoc(doc(db, 'transactions', d.id)));
        await Promise.all(deletePromises);
      } catch (err) {
        console.warn('Erro ao deletar transactions vinculadas:', err);
      }

      await logAction('REFC Zerar Relatório', `Zerou todos os lançamentos e relatórios de ${competenciaExtenso}`);
      setSyncStatus(`Mês de ${competenciaExtenso} foi 100% zerado no banco de dados e relatórios!`);
      setTimeout(() => setSyncStatus(null), 5000);
      setShowClearModal(false);
    } catch (err: any) {
      console.error('Erro ao zerar mês:', err);
      setSyncStatus('Erro ao zerar mês: ' + (err.message || String(err)));
    } finally {
      setIsClearingMonth(false);
    }
  };

  // Salvar configurações e histórico
  const handleSaveChurchSettings = async () => {
    try {
      await setDoc(doc(db, 'settings', 'church'), {
        name: churchInfo.churchName,
        pastorName: churchInfo.pastorName,
        address: churchInfo.address,
        region: churchInfo.region
      }, { merge: true });
      await logAction('Relatório Quadrangular', 'Atualizou dados do cabeçalho oficial');
      alert('Dados da igreja salvos com sucesso!');
    } catch (err: any) {
      alert('Erro ao salvar dados: ' + err.message);
    }
  };

  // Formatação de Mês e Ano por extenso (ex: "JULHO / 2026")
  const [currentYear, currentMonthNum] = selectedMonthYear.split('-');
  const dateObj = new Date(parseInt(currentYear, 10), parseInt(currentMonthNum, 10) - 1, 1);
  const monthNameUpper = format(dateObj, 'MMMM', { locale: ptBR }).toUpperCase();
  const competenciaExtenso = `${monthNameUpper} / ${currentYear}`;

  // Formatação de Moeda BRL
  const fmtCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Exportar Excel Oficial (.xlsx com as duas abas REFC e Entradas)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // ABA 1: REFC
    const refcData: any[][] = [
      ['', '', 'IGREJA DO EVANGELHO QUADRANGULAR', '', '', '', '', '', '', ''],
      ['', '', 'RELATÓRIO ESTATÍSTICO E FINANCEIRO DE CULTO MENSAL', '', '', '', '', '', '', ''],
      ['', '', churchInfo.churchName, '', '', '', '', '', '', ''],
      ['', '', `PASTOR: ${churchInfo.pastorName}`, '', '', '', '', '', '', ''],
      ['', '', `ENDEREÇO: ${churchInfo.address}`, '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['MÊS / ANO', 'Nº MEMBROS', '', stats.membersCount, 'Nº VISITANTES MÊS', '', '', stats.visitorsCount, '', ''],
      [monthNameUpper, 'Nº CÉLULAS', '', stats.cellsCount, 'Nº ACEITAÇÕES E RECONCILIAÇÕES', '', '', stats.conversionsCount, '', ''],
      [currentYear, 'Nº BATISMOS NAS ÁGUAS', '', stats.baptismsWaterCount, 'Nº BATISMOS C/ ESPÍRITO SANTO', '', '', stats.baptismsHolySpiritCount, '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', 'DEMONSTRATIVO FINANCEIRO', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['ARRECADAÇÃO', '', fmtCurrency(totalArrecadacao), '', 'TOTAL DE SAÍDAS', '', '', fmtCurrency(totalSaidasComTaxa), '', ''],
      ['OFERTA DE MISSÕES', '', fmtCurrency(totalMissionsSum), '', 'SEDE (25%)', '', '', fmtCurrency(taxaSede25), '', ''],
      ['', '', '', '', 'SALDO DO MÊS', '', '', fmtCurrency(saldoFinalMes), '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', 'DESCRIMINAÇÃO DE SAÍDAS', '', '', '', '', '', '', ''],
      ['DATA', 'DESCRIMINAÇÃO', '', '', '', 'VALOR', '', '', '', ''],
    ];

    expenses.forEach(exp => {
      refcData.push([exp.date || '-', exp.description, '', '', '', fmtCurrency(exp.amount), '', '', '', '']);
    });
    refcData.push(['-', 'TAXA REGIÃO (25%)', '', '', '', fmtCurrency(taxaSede25), '', '', '', '']);
    refcData.push(['', 'TOTAL DE SAÍDAS', '', '', '', fmtCurrency(totalSaidasComTaxa), '', '', '', '']);

    const wsRefc = XLSX.utils.aoa_to_sheet(refcData);
    XLSX.utils.book_append_sheet(wb, wsRefc, 'REFC');

    // ABA 2: Entradas
    const entradasData: any[][] = [
      ['RESUMO FINANCEIRO', '', '', '', '', '', '', '', '', ''],
      [churchInfo.churchName, '', '', '', 'REGIÃO:', churchInfo.region, '', 'PASTOR:', churchInfo.pastorName, ''],
      ['ANO:', currentYear, '', '', 'MÊS:', monthNameUpper, '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['DIA', 'Dízimo', 'Oferta Geral', 'Oferta Especial', '3º domingo', 'Total', '', '', '', ''],
    ];

    dailyEntries.forEach(entry => {
      entradasData.push([
        entry.dateStr,
        entry.tithes > 0 ? fmtCurrency(entry.tithes) : 'R$ -',
        entry.offeringGeneral > 0 ? fmtCurrency(entry.offeringGeneral) : 'R$ -',
        entry.offeringSpecial > 0 ? fmtCurrency(entry.offeringSpecial) : 'R$ -',
        entry.missions > 0 ? fmtCurrency(entry.missions) : 'R$ -',
        entry.total > 0 ? fmtCurrency(entry.total) : 'R$ -'
      ]);
    });

    entradasData.push([
      'TOTAL',
      fmtCurrency(totalTithesSum),
      fmtCurrency(totalOfferingGenSum),
      fmtCurrency(totalOfferingSpecSum),
      fmtCurrency(totalMissionsSum),
      fmtCurrency(totalArrecadacao)
    ]);
    entradasData.push(['', '', '', '', '', '']);
    entradasData.push(['SOMA GERAL', '', fmtCurrency(totalArrecadacao), '', '', '']);
    entradasData.push(['TAXA (25%)', '', fmtCurrency(taxaSede25), '', '', '']);
    entradasData.push(['OFERTA MISSÕES', '', fmtCurrency(totalMissionsSum), '', '', '']);
    entradasData.push(['TOTAL SEDE', '', fmtCurrency(totalSedeResumo), '', '', '']);

    const wsEntradas = XLSX.utils.aoa_to_sheet(entradasData);
    XLSX.utils.book_append_sheet(wb, wsEntradas, 'Entradas');

    // Salvar arquivo
    XLSX.writeFile(wb, `RELATORIO_QUADRANGULAR_${monthNameUpper}_${currentYear}.xlsx`);
  };

  // Gerar PDF direto de alta resolução (1 Página A4 para cada Aba ou Completo com 2 Páginas)
  const handleDownloadPdf = async (targetTab: 'refc' | 'entradas' | 'expenses' | 'both') => {
    setIsGeneratingPdf(true);
    const effectiveTab = targetTab === 'expenses' ? 'refc' : targetTab;
    const fileName = `RELATORIO_QUADRANGULAR_${effectiveTab === 'both' ? 'COMPLETO_2PAGS' : effectiveTab.toUpperCase()}_${monthNameUpper}_${currentYear}.pdf`;

    setPdfNotification({
      status: 'generating',
      message: 'Renderizando páginas em alta definição e gerando arquivo PDF...',
      fileName
    });

    try {
      const pngs: (string | null)[] = [];

      if (effectiveTab === 'refc' || effectiveTab === 'both') {
        const pngRefc = await captureElementToPng('print-refc-sheet');
        if (pngRefc) pngs.push(pngRefc);
      }

      if (effectiveTab === 'entradas' || effectiveTab === 'both') {
        const pngEntradas = await captureElementToPng('print-entradas-sheet');
        if (pngEntradas) pngs.push(pngEntradas);
      }

      if (pngs.length === 0) {
        throw new Error('Nenhuma folha encontrada para gerar PDF.');
      }

      const result = await downloadPdfFromPngList(pngs, fileName);

      setPdfNotification({
        status: 'ready',
        message: 'PDF gerado e download iniciado com sucesso!',
        blobUrl: result.blobUrl,
        fileName
      });
      setSyncStatus('PDF baixado com sucesso!');
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (err: any) {
      console.error('Erro ao gerar PDF:', err);
      setPdfNotification({
        status: 'error',
        message: 'Erro ao gerar PDF: ' + (err?.message || 'Falha ao capturar o documento. Tente novamente.')
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Disparar Impressão Oficial do Navegador / Impressora Padrão
  const handlePrint = (mode: 'refc' | 'entradas' | 'both') => {
    setPrintMode(mode);

    try {
      if (mode === 'refc') {
        printHtmlElements(['print-refc-sheet'], {
          title: `REFC - ${competenciaExtenso} - ${churchInfo.churchName}`
        });
      } else if (mode === 'entradas') {
        printHtmlElements(['print-entradas-sheet'], {
          title: `Entradas de Cultos - ${competenciaExtenso} - ${churchInfo.churchName}`
        });
      } else {
        printHtmlElements(['print-refc-sheet', 'print-entradas-sheet'], {
          title: `Relatório Completo - ${competenciaExtenso} - ${churchInfo.churchName}`,
          pageBreakBetween: true
        });
      }
    } catch (err) {
      console.warn('Erro na impressão direta, usando fallback nativo:', err);
      setTimeout(() => {
        window.print();
      }, 50);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-full">
      {/* Barra Superior de Controle */}
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 sm:p-5 border border-zinc-200 shadow-sm print:hidden w-full max-w-full">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Modelo Oficial
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-zinc-900 truncate">
                Relatório Quadrangular (REFC, Entradas & Anual)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
              Lançamentos oficiais de cultos, despesas discriminadas, 25% da Sede e consolidação anual de todos os meses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Seletor de Competência (oculto quando no anual) */}
            {activeTab !== 'annual' && (
              <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <Calendar size={16} className="text-zinc-500" />
                <label htmlFor="competence-select" className="text-xs font-bold text-zinc-600 uppercase">Mês:</label>
                <input
                  id="competence-select"
                  type="month"
                  value={selectedMonthYear}
                  onChange={(e) => setSelectedMonthYear(e.target.value)}
                  className="bg-transparent font-bold text-zinc-900 outline-none cursor-pointer text-xs sm:text-sm"
                />
              </div>
            )}

            {/* Alternador de Abas de Visualização */}
            <div className="flex flex-wrap rounded-xl border border-zinc-200 bg-zinc-100 p-1 gap-1">
              <button
                onClick={() => setActiveTab('refc')}
                className={cn(
                  "rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5",
                  activeTab === 'refc' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                <FileText size={14} />
                1. REFC (Mensal)
              </button>
              <button
                onClick={() => setActiveTab('entradas')}
                className={cn(
                  "rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5",
                  activeTab === 'entradas' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                <Calculator size={14} />
                2. Entradas (Cultos)
              </button>
              <button
                onClick={() => setActiveTab('annual')}
                className={cn(
                  "rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5",
                  activeTab === 'annual' ? "bg-white text-purple-800 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                <Calendar size={14} className="text-purple-600" />
                3. Consolidado Anual (12 Meses)
              </button>
            </div>

            {/* Botões de Ação de Impressão, Download e Link para Lançamentos */}
            {activeTab !== 'annual' && (
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="#/transactions"
                  className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-all active:scale-95 shadow-xs"
                  title="Ir para o menu de Lançamentos para alterar valores ou lançar cultos e despesas"
                >
                  <Sparkles size={14} />
                  Fazer Lançamentos
                </a>

                {/* Grupo de Impressão (REFC / ENTRADAS / 2 PÁGS) */}
                <div className="flex items-center rounded-xl bg-zinc-900 text-white shadow-sm overflow-hidden p-0.5">
                  <button
                    onClick={() => handlePrint('refc')}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold hover:bg-zinc-800 transition-all active:scale-95",
                      activeTab === 'refc' && "text-amber-300"
                    )}
                    title="Imprimir apenas a Folha Oficial do REFC (1 Página)"
                  >
                    <Printer size={14} />
                    Imprimir REFC
                  </button>
                  <div className="h-4 w-px bg-zinc-700"></div>
                  <button
                    onClick={() => handlePrint('entradas')}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold hover:bg-zinc-800 transition-all active:scale-95",
                      activeTab === 'entradas' && "text-amber-300"
                    )}
                    title="Imprimir apenas a Folha de Entradas Diárias dos Cultos (1 Página)"
                  >
                    <Printer size={14} />
                    Imprimir Entradas
                  </button>
                  <div className="h-4 w-px bg-zinc-700"></div>
                  <button
                    onClick={() => handlePrint('both')}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold hover:bg-zinc-800 transition-all active:scale-95 text-zinc-300 hover:text-white"
                    title="Imprime as 2 folhas completas (REFC + Entradas)"
                  >
                    2 Págs
                  </button>
                </div>

                {/* Botão de Salvar PDF Completo (2 Páginas Juntas) */}
                <button
                  onClick={() => handleDownloadPdf('both')}
                  disabled={isGeneratingPdf}
                  className="flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs font-bold text-zinc-800 hover:bg-zinc-100 transition-all active:scale-95 disabled:opacity-50 shadow-xs"
                  title="Baixar arquivo PDF com as 2 páginas completas (REFC + Entradas)"
                >
                  <Download size={14} className="text-blue-600" />
                  {isGeneratingPdf ? 'Gerando...' : 'Salvar PDF (2 Págs)'}
                </button>

                {/* Botão de Zerar Mês */}
                <button
                  onClick={handleClearMonth}
                  disabled={isSavingToDb}
                  className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-500 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-all active:scale-95 shadow-xs disabled:opacity-50"
                  title="Zerar todos os lançamentos e despesas deste mês no banco de dados e no relatório"
                >
                  <RotateCcw size={14} />
                  Zerar Mês
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'annual' ? (
        <AnnualConsolidatedReport 
          churchInfo={churchInfo}
          initialYear={currentYear}
          onSelectMonth={(mKey) => {
            setSelectedMonthYear(mKey);
            setActiveTab('refc');
          }}
        />
      ) : (
        <>
          {/* ========================================================================= */}
          {/* VISUALIZAÇÃO DA FOLHA A4 OFICIAL (LAYOUT DE IMPRESSÃO / PDF)              */}
          {/* ========================================================================= */}

          {/* Barra de Controle de Visualização e Gestos no Celular e Tablet */}
          <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 rounded-2xl bg-white p-3 sm:p-4 border border-zinc-200 shadow-xs lg:hidden print:hidden">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 flex-shrink-0">
                <Smartphone size={18} />
              </span>
              <div>
                <p className="text-xs font-bold text-zinc-900 leading-tight">Visualização Celular / Tablet</p>
                <p className="text-[11px] text-zinc-500">
                  {mobileZoomMode === 'fit' 
                    ? '✨ Modo Ajustado à Tela: centralizado e pronto para visualização' 
                    : `🔍 Zoom ${Math.round(currentSheetScale * 100)}%: arraste em qualquer direção (2D)`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1 sm:pt-0 border-t sm:border-t-0 border-zinc-100">
              <button
                type="button"
                onClick={() => setMobileZoomMode('fit')}
                className={cn(
                  "flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-all active:scale-95",
                  mobileZoomMode === 'fit' ? "bg-blue-600 text-white shadow-xs" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                )}
                title="Ajusta a folha inteira para caber na largura da tela sem cortes"
              >
                <Maximize2 size={13} />
                Ajustar à Tela
              </button>

              <button
                type="button"
                onClick={() => setMobileZoomMode('100')}
                className={cn(
                  "flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-all active:scale-95",
                  mobileZoomMode === '100' ? "bg-blue-600 text-white shadow-xs" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                )}
                title="Tamanho real A4 (100%) para leitura ampliada com arraste 2D"
              >
                <Move size={13} />
                100%
              </button>

              <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setMobileZoomMode('custom');
                    setCustomZoomScale(prev => Math.max(0.3, Number((prev - 0.15).toFixed(2))));
                  }}
                  className="p-1.5 text-zinc-600 hover:text-zinc-900 active:scale-95"
                  title="Diminuir Zoom"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="px-1.5 text-[11px] font-mono font-bold text-zinc-800 min-w-[40px] text-center">
                  {Math.round(currentSheetScale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMobileZoomMode('custom');
                    setCustomZoomScale(prev => Math.min(1.6, Number((prev + 0.15).toFixed(2))));
                  }}
                  className="p-1.5 text-zinc-600 hover:text-zinc-900 active:scale-95"
                  title="Aumentar Zoom"
                >
                  <ZoomIn size={14} />
                </button>
              </div>
            </div>
          </div>

          <div 
            ref={sheetScrollWrapperRef}
            onTouchStart={handleSheetTouchStart}
            onTouchMove={handleSheetTouchMove}
            onTouchEnd={handleSheetTouchEnd}
            className={cn(
              "flex overflow-x-auto pb-12 print:p-0 print:m-0 print:overflow-visible w-full max-w-full sheet-scroll-container touch-auto",
              Math.round(794 * currentSheetScale) > screenWidth ? "justify-start" : "justify-center"
            )}
          >
            {/* Wrapper de escala responsiva para visualização mobile e tablet centralizada sem distorção */}
            <div
              style={{
                width: currentSheetScale === 1 ? 'auto' : `${Math.round(794 * currentSheetScale)}px`,
                minHeight: currentSheetScale === 1 ? 'auto' : `${Math.round(1123 * currentSheetScale)}px`,
                height: currentSheetScale === 1 ? 'auto' : `${Math.round(1123 * currentSheetScale)}px`,
                overflow: currentSheetScale !== 1 ? 'hidden' : 'visible',
                transition: 'width 0.2s ease, height 0.2s ease',
                flexShrink: 0
              }}
              className="print:w-auto print:min-h-0 print:h-auto print:m-0 print:overflow-visible flex flex-col items-center mx-auto"
            >
              {/* CONTAINER DO REFC (PÁGINA 1) */}
              <div
                id="print-refc-sheet"
                ref={refcPrintRef}
                className={cn(
                  "w-[210mm] min-w-[210mm] min-h-[297mm] bg-white p-[8mm] print:p-[6mm] text-zinc-900 font-serif border border-zinc-300 shadow-md",
                  activeTab !== 'refc' ? "hidden" : "block",
                  printMode === 'refc' ? "print:block" : (printMode === 'both' ? "print:block print-page-break" : "print:hidden")
                )}
                style={{
                  boxSizing: 'border-box',
                  transform: currentSheetScale !== 1 ? `scale(${currentSheetScale})` : undefined,
                  transformOrigin: 'top center'
                }}
              >
          {/* Cabeçalho Oficial Quadrangular */}
          <div className="text-center border-b-2 border-black pb-2 mb-3">
            <div className="flex items-center justify-between">
              {/* Emblema / 4 Cores da Quadrangular ou Logo Personalizada */}
              <div className="flex flex-col items-center justify-center w-16 h-16 border border-zinc-800 rounded-lg p-1 bg-zinc-50 overflow-hidden">
                {churchInfo.logoUrl ? (
                  <img 
                    src={churchInfo.logoUrl} 
                    alt="Logo Igreja" 
                    className="max-h-full max-w-full object-contain"
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-0.5 w-8 h-8 mb-0.5">
                      <div className="bg-rose-600 rounded-xs" title="Jesus Salva (Vermelho)"></div>
                      <div className="bg-amber-400 rounded-xs" title="Jesus Batiza c/ Espírito Santo (Amarelo)"></div>
                      <div className="bg-blue-600 rounded-xs" title="Jesus Cura (Azul)"></div>
                      <div className="bg-purple-700 rounded-xs" title="Jesus Voltará (Roxo)"></div>
                    </div>
                    <span className="text-[7px] font-sans font-bold tracking-tighter text-zinc-800 leading-none">IEQ</span>
                  </>
                )}
              </div>

              <div className="flex-1 px-2">
                <h1 className="text-lg font-bold tracking-wider uppercase font-sans text-black">
                  IGREJA DO EVANGELHO QUADRANGULAR
                </h1>
                <h2 className="text-sm font-bold tracking-normal uppercase text-zinc-800 mt-0.5">
                  RELATÓRIO ESTATÍSTICO E FINANCEIRO DE CULTO MENSAL
                </h2>
                <h3 className="text-sm font-bold uppercase text-zinc-900 mt-0.5">
                  {churchInfo.churchName}
                </h3>
                <p className="text-[11px] font-sans text-zinc-700">
                  PASTOR: {churchInfo.pastorName}
                </p>
                <p className="text-[10px] font-sans text-zinc-600">
                  ENDEREÇO: {churchInfo.address}
                </p>
              </div>

              {/* Logo / Selo Sede */}
              <div className="w-16 text-right">
                <span className="text-[10px] font-sans font-bold text-zinc-500 uppercase block">REFC</span>
                <span className="text-xs font-mono font-bold text-zinc-800">Região {churchInfo.region}</span>
              </div>
            </div>
          </div>

          {/* Quadro Mês / Ano e Estatísticas de Membresia */}
          <div className="border border-black mb-3">
            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr className="border-b border-black bg-zinc-100/70 font-sans font-bold">
                  <td className="p-1.5 border-r border-black w-1/4 text-center">MÊS / ANO</td>
                  <td className="p-1.5 border-r border-black w-1/4 text-left">Nº MEMBROS</td>
                  <td className="p-1.5 border-r border-black w-1/6 text-center bg-white font-mono text-sm">{stats.membersCount}</td>
                  <td className="p-1.5 border-r border-black w-1/4 text-left">Nº VISITANTES MÊS</td>
                  <td className="p-1.5 text-center bg-white font-mono text-sm">{stats.visitorsCount}</td>
                </tr>
                <tr className="border-b border-black">
                  <td rowSpan={2} className="p-1.5 border-r border-black text-center font-bold text-sm bg-zinc-50 font-sans">
                    {monthNameUpper}<br /><span className="text-xs font-normal text-zinc-600">{currentYear}</span>
                  </td>
                  <td className="p-1.5 border-r border-black text-left font-semibold">Nº CÉLULAS</td>
                  <td className="p-1.5 border-r border-black text-center font-mono font-bold">{stats.cellsCount}</td>
                  <td className="p-1.5 border-r border-black text-left font-semibold">Nº ACEITAÇÕES E RECONCILIAÇÕES</td>
                  <td className="p-1.5 text-center font-mono font-bold">{stats.conversionsCount}</td>
                </tr>
                <tr>
                  <td className="p-1.5 border-r border-black text-left font-semibold">Nº BATISMOS NAS ÁGUAS</td>
                  <td className="p-1.5 border-r border-black text-center font-mono font-bold">{stats.baptismsWaterCount}</td>
                  <td className="p-1.5 border-r border-black text-left font-semibold">Nº BATISMOS C/ ESPÍRITO SANTO</td>
                  <td className="p-1.5 text-center font-mono font-bold">{stats.baptismsHolySpiritCount}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Demonstrativo Financeiro Resumido */}
          <div className="mb-3">
            <div className="bg-zinc-800 text-white text-center py-1 text-xs font-sans font-bold uppercase tracking-wider">
              DEMONSTRATIVO FINANCEIRO
            </div>
            <table className="w-full text-xs border border-black border-t-0 border-collapse">
              <tbody>
                <tr className="border-b border-black">
                  <td className="p-1.5 font-bold border-r border-black w-1/3 bg-zinc-50">ARRECADAÇÃO</td>
                  <td className="p-1.5 font-bold font-mono text-right border-r border-black w-1/6 text-blue-900 bg-white">
                    {fmtCurrency(totalArrecadacao)}
                  </td>
                  <td className="p-1.5 font-bold border-r border-black w-1/3 bg-zinc-50">TOTAL DE SAÍDAS</td>
                  <td className="p-1.5 font-bold font-mono text-right w-1/6 text-rose-900 bg-white">
                    {fmtCurrency(totalSaidasComTaxa)}
                  </td>
                </tr>
                <tr className="border-b border-black">
                  <td className="p-1.5 font-bold border-r border-black bg-zinc-50">OFERTA DE MISSÕES</td>
                  <td className="p-1.5 font-bold font-mono text-right border-r border-black bg-white">
                    {fmtCurrency(totalMissionsSum)}
                  </td>
                  <td className="p-1.5 font-bold border-r border-black bg-zinc-50">SEDE (25%)</td>
                  <td className="p-1.5 font-bold font-mono text-right bg-white">
                    {fmtCurrency(taxaSede25)}
                  </td>
                </tr>
                <tr className="bg-zinc-100 font-bold">
                  <td colSpan={2} className="p-1.5 border-r border-black text-right uppercase text-[11px] font-sans">
                    SALDO FINAL DO MÊS:
                  </td>
                  <td colSpan={2} className={cn("p-1.5 font-mono text-right text-sm", saldoFinalMes >= 0 ? "text-emerald-800" : "text-amber-800")}>
                    {fmtCurrency(saldoFinalMes)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Discriminação de Saídas */}
          <div className="mb-4">
            <div className="bg-zinc-800 text-white text-center py-1 text-xs font-sans font-bold uppercase tracking-wider">
              DESCRIMINAÇÃO DE SAÍDAS
            </div>
            <table className="w-full text-xs border border-black border-t-0 border-collapse">
              <thead>
                <tr className="bg-zinc-100 border-b border-black font-sans font-bold">
                  <th className="p-1 border-r border-black w-24 text-center">DATA</th>
                  <th className="p-1 border-r border-black text-left">DESCRIMINAÇÃO</th>
                  <th className="p-1 text-right w-36">VALOR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-300">
                {expenses.map((exp, idx) => (
                  <tr key={exp.id || idx} className="hover:bg-zinc-50 group">
                    <td className="p-1 border-r border-black text-center font-mono text-[11px]">
                      {exp.date || '-'}
                    </td>
                    <td className="p-1 border-r border-black font-medium">
                      <div className="flex items-center justify-between">
                        <span>{exp.description}</span>
                        {/* Botões de Alterar e Excluir na visualização em tela */}
                        <div className="hidden group-hover:flex items-center gap-1.5 print:hidden">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditExpense(exp, idx);
                            }}
                            className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 shadow-xs cursor-pointer"
                            title="Alterar valor ou descrição desta despesa"
                          >
                            <Pencil size={11} /> Alterar
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingExpense({ exp, index: idx });
                            }}
                            className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200 text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 shadow-xs cursor-pointer"
                            title="Excluir despesa da folha"
                          >
                            <Trash2 size={11} /> Excluir
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="p-1 text-right font-mono font-bold">
                      {fmtCurrency(exp.amount)}
                    </td>
                  </tr>
                ))}
                {/* Taxa Região (25%) */}
                <tr className="bg-zinc-50 font-bold">
                  <td className="p-1 border-r border-black text-center font-mono text-[11px]">-</td>
                  <td className="p-1 border-r border-black">TAXA REGIÃO (25%)</td>
                  <td className="p-1 text-right font-mono text-indigo-900">{fmtCurrency(taxaSede25)}</td>
                </tr>
                {/* Linhas vazias para preencher folha A4 com elegância */}
                {Array.from({ length: Math.max(0, 6 - expenses.length) }).map((_, i) => (
                  <tr key={`empty-${i}`} className="h-6">
                    <td className="p-1 border-r border-black text-center text-zinc-300">-</td>
                    <td className="p-1 border-r border-black text-zinc-300"></td>
                    <td className="p-1 text-right text-zinc-300 font-mono">R$ -</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black bg-zinc-200 font-bold font-sans">
                  <td colSpan={2} className="p-1.5 border-r border-black text-right uppercase tracking-wider">
                    TOTAL DE SAÍDAS:
                  </td>
                  <td className="p-1.5 text-right font-mono text-sm text-rose-900">
                    {fmtCurrency(totalSaidasComTaxa)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Assinaturas Oficiais no Rodapé */}
          <div className="mt-10 pt-2 grid grid-cols-2 gap-12 text-center text-xs font-sans">
            <div>
              <div className="border-b-2 border-black mb-1.5 h-8"></div>
              <p className="font-bold uppercase text-zinc-900 text-[11px]">{churchInfo.pastorName || 'PASTOR TITULAR'}</p>
              <p className="text-[10px] uppercase font-bold text-zinc-600 tracking-wider">Pastor Titular</p>
            </div>
            <div>
              <div className="border-b-2 border-black mb-1.5 h-8"></div>
              <p className="font-bold uppercase text-zinc-900 text-[11px]">TESOURARIA / SECRETARIA</p>
              <p className="text-[10px] uppercase font-bold text-zinc-600 tracking-wider">Responsável Financeiro</p>
            </div>
          </div>

          <div className="mt-4 text-center text-[9px] font-sans text-zinc-400 uppercase">
            Documento Oficial • Igreja do Evangelho Quadrangular • Gerado em {format(new Date(), 'dd/MM/yyyy HH:mm')}
          </div>
        </div>

        {/* CONTAINER DE ENTRADAS DIÁRIAS (PÁGINA 2) */}
        <div
          id="print-entradas-sheet"
          ref={entradasPrintRef}
          className={cn(
            "w-[210mm] min-w-[210mm] min-h-[297mm] bg-white p-[8mm] print:p-[6mm] text-zinc-900 font-sans border border-zinc-300 shadow-md",
            activeTab !== 'entradas' ? "hidden" : "block",
            printMode === 'entradas' ? "print:block" : (printMode === 'both' ? "print:block" : "print:hidden")
          )}
          style={{
            boxSizing: 'border-box',
            transform: currentSheetScale !== 1 ? `scale(${currentSheetScale})` : undefined,
            transformOrigin: 'top center'
          }}
        >
          {/* Cabeçalho do Resumo Financeiro */}
          <div className="border-b-2 border-black pb-1.5 mb-2">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-sm font-bold tracking-wider uppercase text-black">
                  RESUMO FINANCEIRO — {churchInfo.churchName}
                </h1>
                <div className="flex items-center gap-4 text-xs font-semibold text-zinc-700 mt-0.5">
                  <span>REGIÃO: <strong className="font-bold text-black">{churchInfo.region}</strong></span>
                  <span>PASTOR: <strong className="font-bold text-black">{churchInfo.pastorName}</strong></span>
                </div>
              </div>
              <div className="text-right text-xs">
                <p className="font-bold uppercase text-zinc-800">
                  ANO: <span className="font-mono">{currentYear}</span> | MÊS: <span>{monthNameUpper}</span>
                </p>
                <span className="text-[9px] text-zinc-500 font-mono">Cultos: Terça • Sexta • Domingo</span>
              </div>
            </div>
          </div>

          {/* Tabela de Lançamentos Diários dos Cultos (Dias 1 a 31) */}
          <table className="w-full text-[10px] border border-black border-collapse mb-2">
            <thead>
              <tr className="bg-zinc-800 text-white font-bold text-center">
                <th className="p-1 border-r border-black w-24">DIA</th>
                <th className="p-1 border-r border-black w-24">Dízimo</th>
                <th className="p-1 border-r border-black w-24">Oferta Geral</th>
                <th className="p-1 border-r border-black w-24">Oferta Especial</th>
                <th className="p-1 border-r border-black w-24">3º domingo</th>
                <th className="p-1 w-24">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {dailyEntries.map((entry) => {
                const isCultoDay = entry.isCulto;
                const isSunday = entry.dayOfWeek === 0;
                
                return (
                  <tr 
                    key={entry.day} 
                    className={cn(
                      "h-4.5 hover:bg-yellow-50",
                      isSunday ? "bg-amber-50/50 font-semibold" : (isCultoDay ? "bg-blue-50/30" : "text-zinc-400 bg-white")
                    )}
                  >
                    {/* Dia com Nome da Semana */}
                    <td className="p-0.5 px-1 border-r border-black font-mono text-[9.5px] whitespace-nowrap">
                      <span className="font-bold text-black">{entry.day.toString().padStart(2, '0')}/{currentMonthNum}</span>
                      <span className="ml-1 text-[8px] text-zinc-500 font-sans uppercase">
                        {entry.dayOfWeekName.substring(0, 3)}
                      </span>
                    </td>

                    {/* Dízimo */}
                    <td className="p-0.5 px-1 border-r border-black text-right font-mono">
                      <span className={cn("font-bold", entry.tithes > 0 ? "text-zinc-900" : "text-zinc-300")}>
                        {entry.tithes > 0 ? fmtCurrency(entry.tithes) : 'R$ -'}
                      </span>
                    </td>

                    {/* Oferta Geral */}
                    <td className="p-0.5 px-1 border-r border-black text-right font-mono">
                      <span className={cn("font-bold", entry.offeringGeneral > 0 ? "text-zinc-900" : "text-zinc-300")}>
                        {entry.offeringGeneral > 0 ? fmtCurrency(entry.offeringGeneral) : 'R$ -'}
                      </span>
                    </td>

                    {/* Oferta Especial */}
                    <td className="p-0.5 px-1 border-r border-black text-right font-mono">
                      <span className={cn("font-bold", entry.offeringSpecial > 0 ? "text-zinc-900" : "text-zinc-300")}>
                        {entry.offeringSpecial > 0 ? fmtCurrency(entry.offeringSpecial) : 'R$ -'}
                      </span>
                    </td>

                    {/* 3º Domingo / Missões */}
                    <td className="p-0.5 px-1 border-r border-black text-right font-mono">
                      <span className={cn("font-bold", entry.missions > 0 ? "text-emerald-800" : "text-zinc-300")}>
                        {entry.missions > 0 ? fmtCurrency(entry.missions) : 'R$ -'}
                      </span>
                    </td>

                    {/* Total do Dia */}
                    <td className="p-0.5 px-1 text-right font-mono font-bold text-black bg-zinc-50/50">
                      {entry.total > 0 ? fmtCurrency(entry.total) : 'R$ -'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black bg-zinc-200 font-bold font-mono text-[10.5px]">
                <td className="p-1 border-r border-black text-center font-sans uppercase">TOTAL</td>
                <td className="p-1 border-r border-black text-right">{fmtCurrency(totalTithesSum)}</td>
                <td className="p-1 border-r border-black text-right">{fmtCurrency(totalOfferingGenSum)}</td>
                <td className="p-1 border-r border-black text-right">{fmtCurrency(totalOfferingSpecSum)}</td>
                <td className="p-1 border-r border-black text-right text-emerald-900">{fmtCurrency(totalMissionsSum)}</td>
                <td className="p-1 text-right text-blue-950 font-bold">{fmtCurrency(totalArrecadacao)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Resumo Final de Fechamento da Sede e Observações */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Bloco de Totais e 25% da Sede */}
            <div className="border border-black">
              <table className="w-full border-collapse">
                <tbody>
                  <tr className="border-b border-black bg-zinc-50">
                    <td className="p-1 border-r border-black font-bold uppercase text-[10px]">SOMA GERAL:</td>
                    <td className="p-1 text-right font-mono font-bold text-blue-900">{fmtCurrency(totalArrecadacao)}</td>
                  </tr>
                  <tr className="border-b border-black">
                    <td className="p-1 border-r border-black font-bold uppercase text-[10px]">TAXA (25%):</td>
                    <td className="p-1 text-right font-mono font-bold text-indigo-900">{fmtCurrency(taxaSede25)}</td>
                  </tr>
                  <tr className="border-b border-black bg-zinc-50">
                    <td className="p-1 border-r border-black font-bold uppercase text-[10px]">OFERTA MISSÕES:</td>
                    <td className="p-1 text-right font-mono font-bold text-emerald-900">{fmtCurrency(totalMissionsSum)}</td>
                  </tr>
                  <tr className="bg-zinc-100 font-bold">
                    <td className="p-1 border-r border-black uppercase text-[10px]">TOTAL SEDE:</td>
                    <td className="p-1 text-right font-mono">{fmtCurrency(totalSedeResumo)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Bloco de Observações */}
            <div className="border border-black p-1.5 flex flex-col justify-between text-[9.5px]">
              <div>
                <span className="font-bold uppercase block mb-1">OBSERVAÇÕES:</span>
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Espaço para observações da tesouraria..."
                  rows={2}
                  className="w-full border-none resize-none outline-none bg-transparent font-sans print:hidden"
                />
                <div className="hidden print:block min-h-[30px] font-sans">
                  {observations || '_________________________________________________________________________________'}
                </div>
              </div>
              <div className="border-t border-zinc-400 pt-1 text-[8.5px] text-zinc-500 text-center">
                Igreja do Evangelho Quadrangular • {churchInfo.churchName}
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
      </>
      )}

      {/* MODAL DE EDIÇÃO DE DESPESA */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200 animate-scale-up">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Pencil size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">Alterar Despesa</h3>
                  <p className="text-xs text-zinc-500">Modifique a data, descrição ou valor desta saída</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setEditingExpense(null); setEditingExpenseIndex(null); setEditError(null); }}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEditExpense} className="space-y-4">
              {editError && (
                <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold border border-rose-200 flex items-center gap-1.5">
                  <Info size={16} />
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Data do Comprovante (Dia/Mês)
                </label>
                <input
                  type="text"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  placeholder="Ex: 15/08 ou 15"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Descrição / Discriminação da Saída
                </label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Ex: ENERGIA ELÉTRICA / ÁGUA / MATERIAL DE LIMPEZA"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 uppercase focus:border-blue-600 focus:outline-hidden"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Valor da Despesa (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    placeholder="Ex: 195,70"
                    className="w-full rounded-xl border border-zinc-300 bg-white py-2 pl-10 pr-3 text-base font-bold text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => { setEditingExpense(null); setEditingExpenseIndex(null); setEditError(null); }}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-all active:scale-95 cursor-pointer"
                >
                  <CheckCircle2 size={16} />
                  Salvar Alteração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE DESPESA */}
      {deletingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in print:hidden">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200 text-center animate-scale-up">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-bold text-zinc-900 mb-1">Excluir Despesa?</h3>
            <p className="text-xs text-zinc-600 mb-4">
              Deseja realmente remover a despesa <strong className="text-zinc-900">"{deletingExpense.exp.description}"</strong> no valor de <strong className="text-zinc-900 font-mono">{fmtCurrency(deletingExpense.exp.amount)}</strong>?
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setDeletingExpense(null)}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteExpense}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition-all active:scale-95 cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO PARA ZERAR O MÊS */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in print:hidden">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100">
                <AlertTriangle size={24} className="text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900">Zerar Mês ({competenciaExtenso})</h3>
                <p className="text-xs text-zinc-500">Esta ação apagará os relatórios deste mês</p>
              </div>
            </div>

            <div className="mb-5 rounded-xl bg-rose-50/70 border border-rose-100 p-3.5 text-xs text-rose-950 space-y-1.5">
              <p className="font-bold">O que será zerado:</p>
              <ul className="list-disc pl-4 space-y-1 text-rose-800">
                <li>Todos os valores de cultos (Dízimos e Ofertas)</li>
                <li>Todas as despesas deste mês</li>
                <li>O relatório salvo no Banco de Dados</li>
                <li>As movimentações geradas no Módulo Financeiro</li>
              </ul>
              <p className="text-[11px] text-rose-700 pt-1 font-semibold">
                O relatório ficará 100% limpo para você relançar do zero.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isClearingMonth}
                onClick={() => setShowClearModal(false)}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isClearingMonth}
                onClick={executeClearMonth}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-rose-700 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
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

      {/* MODAL DE STATUS E DOWNLOAD DE PDF */}
      {pdfNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-4">
              <div className="flex items-center gap-2.5">
                {pdfNotification.status === 'generating' && (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 animate-pulse">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                )}
                {pdfNotification.status === 'ready' && (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                    <CheckCircle2 size={22} />
                  </div>
                )}
                {pdfNotification.status === 'error' && (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                    <AlertTriangle size={22} />
                  </div>
                )}
                <div>
                  <h3 className="text-base font-bold text-zinc-900">
                    {pdfNotification.status === 'generating' && 'Gerando Relatório PDF...'}
                    {pdfNotification.status === 'ready' && 'PDF Pronto com Sucesso!'}
                    {pdfNotification.status === 'error' && 'Atenção ao Gerar PDF'}
                  </h3>
                  <p className="text-xs text-zinc-500">Documento Oficial Modelo A4</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPdfNotification(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-zinc-700 font-medium">
                {pdfNotification.message}
              </p>

              {pdfNotification.status === 'ready' && pdfNotification.blobUrl && (
                <div className="space-y-2 pt-2">
                  <a
                    href={pdfNotification.blobUrl}
                    download={pdfNotification.fileName || 'relatorio_quadrangular.pdf'}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-blue-700 transition-all active:scale-95"
                  >
                    <Download size={18} />
                    Baixar Arquivo PDF Novamente
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      if (pdfNotification.blobUrl) {
                        openPdfInNewTab(pdfNotification.blobUrl);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-bold text-zinc-800 hover:bg-zinc-100 transition-all active:scale-95 cursor-pointer"
                  >
                    <Printer size={16} className="text-zinc-600" />
                    Abrir em Nova Aba (Para Visualizar e Imprimir)
                  </button>
                </div>
              )}

              {pdfNotification.status === 'error' && (
                <button
                  type="button"
                  onClick={() => handleDownloadPdf('both')}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-zinc-800 transition-all active:scale-95"
                >
                  <RefreshCw size={16} />
                  Tentar Novamente
                </button>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setPdfNotification(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-50 transition-all cursor-pointer"
              >
                Fechar Janela
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
