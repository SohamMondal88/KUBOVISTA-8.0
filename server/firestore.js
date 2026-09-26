import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from './firebase-admin.js';

export function firestoreConfigured() {
  return process.env.FIREBASE_AUTH_ENABLED === 'true' && Boolean(
    (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIREBASE_USE_ADC === 'true'
  );
}

export function firestore() {
  return getFirestore(getFirebaseAdmin());
}

export const newId = () => randomUUID();
export const serverTimestamp = () => FieldValue.serverTimestamp();

export function plain(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  return value;
}

export function snapshotData(snapshot) {
  return snapshot.exists ? { id: snapshot.id, ...plain(snapshot.data()) } : null;
}

export async function list(collectionName, { field, op = '==', value, order = 'created_at', direction = 'desc', limit = 100 } = {}) {
  let ref = firestore().collection(collectionName);
  if (field) ref = ref.where(field, op, value);
  if (order) ref = ref.orderBy(order, direction);
  const snapshot = await ref.limit(limit).get();
  return snapshot.docs.map(snapshotData);
}

export async function addNotification(userId, title, message, kind = 'account', transaction) {
  const ref = firestore().collection('notifications').doc(newId());
  const data = { user_id: userId, title, message, kind, read_at: null, created_at: serverTimestamp() };
  if (transaction) transaction.create(ref, data); else await ref.create(data);
  return ref.id;
}
