import {
  collection, doc, setDoc, getDoc, getDocs,
  deleteDoc, onSnapshot, query, where,
  orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db, auth, firebaseReady } from './config'

const ALL_STORE_KEYS = [
  'hs-beats','hs-chords','hs-lyrics','hs-mixer','hs-patterns',
  'hs-instruments','hs-effects','hs-busroute','hs-arpeggio',
  'hsmm_mixer','hsmm_arrangement','hsmm_automation',
  'hsmm_patterns','hsmm_song_patterns','hsmm_piano_roll',
  'hsmm_lyrics_draft','hsmm_saved_songs','hsmm_ai_songs',
  'hsmm_style_profile','hsmm_folders',
]

function collectProjectData() {
  const data = {}
  ALL_STORE_KEYS.forEach(k => {
    const v = localStorage.getItem(k)
    if (v !== null) {
      try { data[k] = JSON.parse(v) } catch { data[k] = v }
    }
  })
  return data
}

function applyProjectData(data) {
  ALL_STORE_KEYS.forEach(k => {
    if (data[k] !== undefined) {
      localStorage.setItem(k, typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k]))
    }
  })
}

// ─── Projects ──────────────────────────────────────────────────────

export async function saveProjectCloud(name) {
  if (!firebaseReady) throw new Error('Firebase not configured')
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  const id = `${user.uid}_${Date.now()}`
  await setDoc(doc(db, 'projects', id), {
    id,
    userId:    user.uid,
    name:      name || 'Untitled Project',
    data:      collectProjectData(),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  })
  return id
}

export async function updateProjectCloud(projectId, name) {
  if (!firebaseReady) throw new Error('Firebase not configured')
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  await setDoc(doc(db, 'projects', projectId), {
    id:        projectId,
    userId:    user.uid,
    name:      name || 'Untitled Project',
    data:      collectProjectData(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function listProjects() {
  if (!firebaseReady) throw new Error('Firebase not configured')
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  const q = query(
    collection(db, 'projects'),
    where('userId', '==', user.uid),
    orderBy('updatedAt', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...d.data(), id: d.id, updatedAt: d.data().updatedAt?.toDate?.() }))
}

export async function loadProjectCloud(projectId) {
  if (!firebaseReady) throw new Error('Firebase not configured')
  const snap = await getDoc(doc(db, 'projects', projectId))
  if (!snap.exists()) throw new Error('Project not found')
  applyProjectData(snap.data().data || {})
  return snap.data()
}

export async function deleteProjectCloud(projectId) {
  if (!firebaseReady) throw new Error('Firebase not configured')
  await deleteDoc(doc(db, 'projects', projectId))
}

// ─── Real-time collaboration rooms ─────────────────────────────────

export async function createRoom(name) {
  if (!firebaseReady) throw new Error('Firebase not configured')
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  const roomId = Math.random().toString(36).slice(2, 9).toUpperCase()
  await setDoc(doc(db, 'rooms', roomId), {
    name:      name || 'Collab Session',
    owner:     user.uid,
    ownerName: user.displayName || user.email,
    data:      collectProjectData(),
    members:   [{ uid: user.uid, name: user.displayName || user.email, joinedAt: new Date().toISOString() }],
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  })
  return roomId
}

export async function joinRoom(roomId) {
  if (!firebaseReady) throw new Error('Firebase not configured')
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  const snap = await getDoc(doc(db, 'rooms', roomId))
  if (!snap.exists()) throw new Error('Room not found')
  return snap.data()
}

export function subscribeRoom(roomId, onUpdate) {
  if (!firebaseReady) return () => {}
  return onSnapshot(doc(db, 'rooms', roomId), (snap) => {
    if (snap.exists()) onUpdate(snap.data())
  })
}

export async function pushRoomUpdate(roomId) {
  if (!firebaseReady) throw new Error('Firebase not configured')
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  await setDoc(doc(db, 'rooms', roomId), {
    data:       collectProjectData(),
    lastEditBy: user.displayName || user.email,
    updatedAt:  serverTimestamp(),
  }, { merge: true })
}

export async function applyRoomData(roomData) {
  applyProjectData(roomData.data || {})
}
