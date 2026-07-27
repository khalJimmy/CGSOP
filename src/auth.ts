import { auth, db } from './firebase.js';
import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, query, limit } from 'firebase/firestore';
import { UserData } from './types.js';
import { S } from './state.js';
import { MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_MINUTES } from './constants.js';

// ── Rate limiting (localStorage) ──
function getLoginAttempts(): { count: number; until: number } {
  try {
    const raw = localStorage.getItem('cg_login_attempts');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { count: 0, until: 0 };
}

function recordLoginAttempt() {
  const data = getLoginAttempts();
  data.count++;
  if (data.count >= MAX_LOGIN_ATTEMPTS) {
    data.until = Date.now() + LOGIN_LOCKOUT_MINUTES * 60 * 1000;
  }
  localStorage.setItem('cg_login_attempts', JSON.stringify(data));
}

function resetLoginAttempts() {
  localStorage.removeItem('cg_login_attempts');
}

function checkLoginLocked(): string | null {
  const data = getLoginAttempts();
  if (data.until > Date.now()) {
    const remaining = Math.ceil((data.until - Date.now()) / 60000);
    return `Too many attempts. Try again in ${remaining} min.`;
  }
  if (data.count >= MAX_LOGIN_ATTEMPTS) {
    resetLoginAttempts(); // expired
  }
  return null;
}

// ── Auth ──
export async function login(email: string, password: string): Promise<string | null> {
  const locked = checkLoginLocked();
  if (locked) return locked;

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    // Fetch user data from Firestore
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (!userDoc.exists()) {
      await fbSignOut(auth);
      return 'User account not configured. Contact admin.';
    }

    S.user = userDoc.data() as UserData;
    resetLoginAttempts();
    return null; // success
  } catch (err: any) {
    recordLoginAttempt();
    const code = err.code || '';
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return 'Invalid email or password.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Account temporarily locked due to many attempts. Try later.';
    }
    return 'Login failed. Check your credentials.';
  }
}

export async function logout() {
  S.user = null;
  await fbSignOut(auth);
}

export function onAuthChange(cb: (user: UserData | null) => void) {
  onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
      if (userDoc.exists()) {
        S.user = userDoc.data() as UserData;
        cb(S.user);
        return;
      }
    }
    S.user = null;
    cb(null);
  });
}

// ── First-run check: does any user exist? ──
export async function isFirstRun(): Promise<boolean> {
  const snap = await getDocs(query(collection(db, 'users'), limit(1)));
  return snap.empty;
}

// ── Create first admin account ──
export async function createFirstAdmin(email: string, password: string, name: string): Promise<string | null> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const userData: UserData = {
      uid: cred.user.uid,
      name,
      username: email.split('@')[0],
      role: 'admin',
      zone: 'All Zones',
      depts: [],
      createdAt: Date.now()
    };
    await setDoc(doc(db, 'users', cred.user.uid), userData);
    S.user = userData;
    return null;
  } catch (err: any) {
    return err.message || 'Failed to create admin account.';
  }
}

// ── Admin creates additional user ──
export async function createUserAccount(email: string, password: string, data: Partial<UserData>): Promise<string | null> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const userData: UserData = {
      uid: cred.user.uid,
      name: data.name || '',
      username: data.username || email.split('@')[0],
      role: (data.role as any) || 'spoc',
      zone: (data.zone as any) || 'Chennai',
      depts: data.depts || [],
      spocMail: data.spocMail || email,
      hodMail: data.hodMail || '',
      createdAt: Date.now()
    };
    await setDoc(doc(db, 'users', cred.user.uid), userData);
    return null;
  } catch (err: any) {
    return err.message || 'Failed to create user.';
  }
}
