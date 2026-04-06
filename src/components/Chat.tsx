import { useEffect, useState, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, or, where, deleteDoc, doc } from 'firebase/firestore';
import { db, auth, storage } from '../firebase';
import { Send, Trash2, Paperclip, Smile } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface Message {
  id: string;
  text: string;
  senderName: string;
  senderUid: string;
  recipientUid?: string;
  createdAt: any;
  fileUrl?: string;
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
  const [showEmojis, setShowEmojis] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'messages'),
      or(
        where('recipientUid', '==', 'public'),
        where('recipientUid', '==', null),
        where('recipientUid', '==', auth.currentUser.uid),
        where('senderUid', '==', auth.currentUser.uid)
      ),
      orderBy('createdAt', 'asc')
    );
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      console.log('Chat: Mensagens recebidas:', msgs);
      
      // Notificação para novas mensagens privadas
      if (snapshot.docChanges().some(change => change.type === 'added')) {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg.senderUid !== auth.currentUser?.uid && lastMsg.recipientUid === auth.currentUser?.uid && document.hidden) {
          new Notification('Nova mensagem privada', { body: `${lastMsg.senderName}: ${lastMsg.text}` });
        }
      }
      
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

  const handleClearChat = async () => {
    // Removido o confirm() pois ele não funciona dentro do iframe
    
    for (const msg of filteredMessages) {
      await deleteDoc(doc(db, 'messages', msg.id));
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    await deleteDoc(doc(db, 'messages', messageId));
  };

  const handleSendMessage = async (e?: React.FormEvent, fileUrl?: string) => {
    if (e) e.preventDefault();
    if ((!newMessage.trim() && !fileUrl) || !auth.currentUser) return;
    
    console.log('Chat: Enviando mensagem para:', recipientUid);
    const messageData: any = {
      text: newMessage,
      senderName: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Usuário',
      senderUid: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      recipientUid: recipientUid === 'all' ? 'public' : recipientUid,
      fileUrl: fileUrl || null
    };
    
    await addDoc(collection(db, 'messages'), messageData);
    setNewMessage('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    
    const storageRef = ref(storage, `chat/${auth.currentUser.uid}/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    
    await handleSendMessage(undefined, url);
  };

  const filteredMessages = messages.filter(msg => {
    const isPublic = !msg.recipientUid || msg.recipientUid === 'public';
    const isPrivateForMe = msg.recipientUid === auth.currentUser?.uid && msg.senderUid === recipientUid;
    const isPrivateFromMe = msg.senderUid === auth.currentUser?.uid && msg.recipientUid === recipientUid;
    
    if (recipientUid === 'all') return isPublic;
    
    const isMatch = isPrivateForMe || isPrivateFromMe;
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
        <button onClick={handleClearChat} className="mt-2 text-xs text-red-500 hover:underline">Limpar conversa</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredMessages.map(message => (
          <div key={message.id} className={`flex flex-col ${message.senderUid === auth.currentUser?.uid ? 'items-end' : 'items-start'}`}>
            <span className="text-xs text-zinc-500">{message.senderName} {(!message.recipientUid || message.recipientUid === 'public') ? '(Público)' : '(Privado)'}</span>
            <div className={`group relative rounded-xl px-4 py-2 max-w-[80%] ${message.senderUid === auth.currentUser?.uid ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-900'}`}>
              {message.text}
              {message.fileUrl && (
                <a href={message.fileUrl} target="_blank" rel="noopener noreferrer" className="block mt-2 text-blue-500 underline">
                  {message.fileUrl.includes('image') ? <img src={message.fileUrl} alt="Imagem" className="max-w-xs rounded-lg" /> : 'Ver arquivo'}
                </a>
              )}
              {message.senderUid === auth.currentUser?.uid && (
                <button 
                  onClick={() => handleDeleteMessage(message.id)}
                  className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className="border-t border-zinc-200 p-4 flex gap-2">
        <button type="button" onClick={() => setShowEmojis(!showEmojis)} className="text-zinc-500 hover:text-zinc-900"><Smile size={20} /></button>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="text-zinc-500 hover:text-zinc-900"><Paperclip size={20} /></button>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
        <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Digite sua mensagem..." className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 outline-none" />
        {showEmojis && (
          <div className="absolute bottom-16 left-4 bg-white border border-zinc-200 rounded-lg p-2 shadow-lg flex gap-2">
            {['😀', '😂', '😍', '👍', '🙏', '🔥'].map(emoji => (
              <button key={emoji} onClick={() => { setNewMessage(newMessage + emoji); setShowEmojis(false); }} className="text-xl hover:bg-zinc-100 p-1 rounded">{emoji}</button>
            ))}
          </div>
        )}
        <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800">
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}
