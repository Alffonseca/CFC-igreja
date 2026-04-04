import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Clock } from 'lucide-react';
import { cn } from '../lib/utils';

interface LogEntry {
  id: string;
  email: string;
  name?: string;
  role?: string;
  action?: string;
  details?: string;
  timestamp: any;
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDate, setSearchDate] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const logEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LogEntry));
      
      // Fetch user names and roles for all logs
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = usersSnapshot.docs.map(doc => doc.data());
      
      const logsWithNamesAndRoles = logEntries.map((log) => {
        const userData = usersData.find(u => u.email === log.email);
        const userName = userData?.name || log.email.split('@')[0];
        const userRole = userData?.role || 'N/A';
        return { ...log, name: userName, role: userRole };
      });
      
      setLogs(logsWithNamesAndRoles);
    });
    return () => unsubscribe();
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDate = searchDate 
      ? log.timestamp?.toDate().toISOString().split('T')[0] === searchDate
      : true;

    return matchesSearch && matchesDate;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-zinc-900">Logs do Sistema</h1>
        <div className="flex gap-2">
          <input
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 outline-none focus:border-zinc-900"
          />
          <input
            type="text"
            placeholder="Pesquisar logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 outline-none focus:border-zinc-900"
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 scrollbar-hide">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <th className="px-6 py-4 font-semibold">Usuario</th>
              <th className="px-6 py-4 font-semibold">Nivel</th>
              <th className="px-6 py-4 font-semibold">Atividade</th>
              <th className="px-6 py-4 font-semibold">Detalhes</th>
              <th className="px-6 py-4 font-semibold">Data/Hora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filteredLogs.map(log => (
              <tr key={log.id} className="hover:bg-zinc-50/50 transition-colors">
                <td 
                  className="px-6 py-4 text-zinc-900 cursor-pointer hover:text-zinc-600"
                  onClick={() => setSearchTerm(log.email)}
                  title="Clique para ver todos os logs deste usuario"
                >
                  <div className="font-medium">{log.name}</div>
                  <div className="text-xs text-zinc-400">{log.email}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    log.role === 'admin' ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
                  )}>
                    {log.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="font-semibold text-zinc-700">{log.action || 'Login'}</span>
                </td>
                <td className="px-6 py-4 text-zinc-600 max-w-xs truncate" title={log.details}>
                  {log.details || 'Entrou no sistema'}
                </td>
                <td className="px-6 py-4 text-zinc-500 whitespace-nowrap">
                  {log.timestamp?.toDate().toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
