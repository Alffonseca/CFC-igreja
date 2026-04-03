import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

export async function logAction(action: string, details: string) {
  if (!auth.currentUser) return;

  try {
    await addDoc(collection(db, 'logs'), {
      email: auth.currentUser.email,
      userId: auth.currentUser.uid,
      action,
      details,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error('Error logging action:', err);
  }
}
