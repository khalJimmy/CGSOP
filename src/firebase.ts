import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAnHBrtIev7zXWa6bSEM_eNs3wRTMgn87A",
  authDomain: "auxapp-d977e.firebaseapp.com",
  projectId: "auxapp-d977e",
  storageBucket: "auxapp-d977e.firebasestorage.app",
  messagingSenderId: "372826168673",
  appId: "1:372826168673:web:914b3e17d6f3def389f920",
  measurementId: "G-Z26BEVE8LY"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
