import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth'
import { auth, firebaseReady } from './config'

export function onAuthChange(cb) {
  if (!firebaseReady) { cb(null); return () => {} }
  return onAuthStateChanged(auth, cb)
}

export async function signUp(email, password, displayName) {
  if (!firebaseReady) throw new Error('Firebase not configured')
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  if (displayName) await updateProfile(cred.user, { displayName })
  return cred.user
}

export async function signIn(email, password) {
  if (!firebaseReady) throw new Error('Firebase not configured')
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function signInWithGoogle() {
  if (!firebaseReady) throw new Error('Firebase not configured')
  const provider = new GoogleAuthProvider()
  const cred = await signInWithPopup(auth, provider)
  return cred.user
}

export async function logOut() {
  if (!firebaseReady) return
  await signOut(auth)
}
