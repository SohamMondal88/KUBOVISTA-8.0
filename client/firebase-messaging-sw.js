import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging/sw';
import { firebaseConfig } from './firebase-config.js';
// FCM displays notification payloads while the page is in the background.
// Do not add a second showNotification handler (it would duplicate notifications).
getMessaging(initializeApp(firebaseConfig));
