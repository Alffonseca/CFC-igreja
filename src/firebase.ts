import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, getDoc, doc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);
export { app };

// Teste de conexão inicial
async function testConnection() {
  try {
    await getDoc(doc(db, 'settings', 'church'));
    console.log('Conexão com Firestore estabelecida com sucesso.');
  } catch (error: any) {
    console.error("Erro detalhado na conexão com Firebase:", error);
    if (error.message?.includes('the client is offline')) {
      console.error("Erro de conexão: O cliente está offline ou a configuração do Firebase está incorreta.");
    }
  }
}
testConnection();
