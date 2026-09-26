import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';
import { app } from './firebase.js';

// Firestore is the client data layer for public content and user-owned drafts.
// Payment state and privileged booking changes remain server-authoritative.
export const db = getFirestore(app);

export async function saveUserProfile(uid, profile) {
  if (!uid) throw new Error('A signed-in account is required.');
  const allowed = { displayName: String(profile.displayName || '').slice(0, 80), photoURL: String(profile.photoURL || '').slice(0, 500), city: String(profile.city || '').slice(0, 80), travelStyle: String(profile.travelStyle || '').slice(0, 80), bio: String(profile.bio || '').slice(0, 400), updatedAt: serverTimestamp() };
  await setDoc(doc(db, 'users', uid), allowed, { merge: true });
}

export async function getUserProfile(uid) {
  if (!uid) return null;
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function createTripDraft(uid, draft) {
  if (!uid) throw new Error('A signed-in account is required.');
  return addDoc(collection(db, 'users', uid, 'tripDrafts'), { destination: String(draft.destination || '').slice(0, 120), startDate: String(draft.startDate || '').slice(0, 30), endDate: String(draft.endDate || '').slice(0, 30), travellers: Math.max(1, Math.min(30, Number(draft.travellers) || 1)), notes: String(draft.notes || '').slice(0, 2000), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function listTripDrafts(uid) {
  if (!uid) return [];
  const snapshot = await getDocs(query(collection(db, 'users', uid, 'tripDrafts'), orderBy('updatedAt', 'desc'), limit(50)));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function listPublishedStories() {
  const snapshot = await getDocs(query(collection(db, 'stories'), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(30)));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
