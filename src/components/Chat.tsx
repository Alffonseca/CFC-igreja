import { useEffect, useState, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Send } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  senderName: string;
  senderUid: string;
  recipientUid?: string;
  createdAt: any;
}

interface User {
  uid: string;
  name: string;
  status: 'online' | 'offline';
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [recipientUid, setRecipientUid] = useState<string>('all');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      console.log('Chat: Mensagens recebidas:', msgs);
      setMessages(msgs);
    }, (error) => {
      console.error('Chat: Erro ao ler mensagens:', error);
    });

    const usersQuery = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      console.log('Chat: Usuários recebidos:', snapshot.docs.map(d => ({id: d.id, ...d.data()})));
      const now = new Date().getTime();
      setUsers(snapshot.docs.map(doc => {
        const data = doc.data();
        const lastSeen = data.lastSeen?.toDate().getTime() || 0;
        const isOnline = (now - lastSeen) < 5 * 60 * 1000; // 5 minutos
        return { uid: doc.id, name: data.name, status: isOnline ? 'online' : 'offline' } as User;
      }));
    }, (error) => {
      console.error('Chat: Erro ao ler usuários:', error);
    });

    return () => {
      unsubscribeMessages();
      unsubscribeUsers();
    };
  }, [auth.currentUser]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !auth.currentUser) return;
    
    console.log('Chat: Enviando mensagem para:', recipientUid);
    const messageData: any = {
      text: newMessage,
      senderName: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Usuário',
      senderUid: auth.currentUser.uid,
      createdAt: serverTimestamp()
    };
    
    if (recipientUid !== 'all') {
      messageData.recipientUid = recipientUid;
    }
    
    await addDoc(collection(db, 'messages'), messageData);
    setNewMessage('');
  };

  const filteredMessages = messages.filter(msg => {
    const isPublic = !msg.recipientUid;
    const isPrivateForMe = msg.recipientUid === auth.currentUser?.uid && msg.senderUid === recipientUid;
    const isPrivateFromMe = msg.senderUid === auth.currentUser?.uid && msg.recipientUid === recipientUid;
    
    if (recipientUid === 'all') return isPublic;
    
    const isMatch = isPrivateForMe || isPrivateFromMe;
    if (isMatch) console.log('Chat: Mensagem filtrada (match):', msg);
    return isMatch;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] bg-white rounded-xl shadow-sm ring-1 ring-zinc-200">
      <div className="p-4 border-b border-zinc-200">
        <select value={recipientUid} onChange={(e) => setRecipientUid(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-4 py-2 outline-none">
          <option value="all">Todos (Público)</option>
          {users.filter(u => u.uid !== auth.currentUser?.uid).map(user => (
            <option key={user.uid} value={user.uid}>
              {user.name} {user.status === 'online' ? '🟢' : '🔴'}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredMessages.map(message => (
          <div key={message.id} className={`flex flex-col ${message.senderUid === auth.currentUser?.uid ? 'items-end' : 'items-start'}`}>
            <span className="text-xs text-zinc-500">{message.senderName} {message.recipientUid ? '(Privado)' : ''}</span>
            <div className={`rounded-xl px-4 py-2 max-w-[80%] ${message.senderUid === auth.currentUser?.uid ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-900'}`}>
              {message.text}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className="border-t border-zinc-200 p-4 flex gap-2">
        <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Digite sua mensagem..." className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 outline-none" />
        <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800">
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}
