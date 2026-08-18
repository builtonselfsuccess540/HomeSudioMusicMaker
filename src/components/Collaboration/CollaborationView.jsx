import React, { useState, useEffect, useRef, useCallback } from 'react'
import { firebaseReady } from '../../firebase/config'
import { onAuthChange } from '../../firebase/firebaseAuth'
import {
  saveProjectCloud, listProjects, loadProjectCloud, deleteProjectCloud,
  createRoom, joinRoom, subscribeRoom, pushRoomUpdate, applyRoomData,
} from '../../firebase/firebaseDb'
import { useStudioStore } from '../../store/useStudioStore'

const GITHUB_API = 'https://api.github.com'

// GitHub token stays in the Electron main process when running as desktop app.
// In browser dev mode, fall back to the env var.
const isElectron = typeof window !== 'undefined' && !!window.electron?.github

const GH_HEADERS = isElectron ? {} : {
  'Authorization': `Bearer ${import.meta.env.VITE_GITHUB_TOKEN || ''}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
}

const SESSION_FILENAME = 'homestudio-session.json'
const POLL_INTERVAL_MS = 15000

// ── helpers ──────────────────────────────────────────────────────────────────

function buildSessionSnapshot(meta = {}) {
  const keys = [
    // Legacy component keys
    'hs-beats', 'hs-chords', 'hs-lyrics', 'hs-mixer',
    'hs-patterns', 'hs-instruments', 'hs-effects',
    'hs-busroute', 'hs-arpeggio',
    // Zustand store keys
    'hsmm_mixer', 'hsmm_arrangement', 'hsmm_automation',
    'hsmm_patterns', 'hsmm_song_patterns', 'hsmm_piano_roll',
    'hsmm_lyrics_draft', 'hsmm_saved_songs', 'hsmm_ai_songs',
    'hsmm_style_profile', 'hsmm_folders',
  ]
  const data = {}
  keys.forEach(k => {
    const v = localStorage.getItem(k)
    if (v !== null) {
      try { data[k] = JSON.parse(v) } catch { data[k] = v }
    }
  })
  return {
    version: 1,
    app: 'Home Studio Music Maker',
    savedAt: new Date().toISOString(),
    author: meta.author || 'Unknown',
    description: meta.description || '',
    bpm: meta.bpm || 120,
    data,
  }
}

function restoreSessionSnapshot(snapshot) {
  if (!snapshot?.data) return 0
  let count = 0
  Object.entries(snapshot.data).forEach(([k, v]) => {
    try {
      // v may already be a string (raw) or a parsed value — normalize to string
      const stored = typeof v === 'string' ? v : JSON.stringify(v)
      localStorage.setItem(k, stored)
      count++
    } catch {}
  })
  return count
}

async function ghFetch(path, options = {}) {
  if (isElectron) {
    const result = await window.electron.github.request(path, {
      method: options.method,
      body: options.body ? JSON.parse(options.body) : undefined,
    })
    if (!result.ok) throw new Error(result.body?.message || `GitHub API ${result.status}`)
    return result.body
  }
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: { ...GH_HEADERS, ...(options.headers || {}) },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `GitHub API ${res.status}`)
  }
  return res.json()
}

async function createGist(snapshot, description) {
  const body = {
    description: description || `Home Studio Session — ${snapshot.savedAt}`,
    public: false,
    files: {
      [SESSION_FILENAME]: { content: JSON.stringify(snapshot, null, 2) },
    },
  }
  return ghFetch('/gists', { method: 'POST', body: JSON.stringify(body) })
}

async function updateGist(gistId, snapshot) {
  const body = {
    files: {
      [SESSION_FILENAME]: { content: JSON.stringify(snapshot, null, 2) },
    },
  }
  return ghFetch(`/gists/${gistId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

async function fetchGist(gistId) {
  return ghFetch(`/gists/${gistId}`)
}

async function fetchGistCommits(gistId) {
  return ghFetch(`/gists/${gistId}/commits`)
}

async function fetchGistAtCommit(gistId, sha) {
  return ghFetch(`/gists/${gistId}/${sha}`)
}

async function fetchGistComments(gistId) {
  return ghFetch(`/gists/${gistId}/comments`)
}

async function postGistComment(gistId, body) {
  return ghFetch(`/gists/${gistId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

async function listMyGists() {
  return ghFetch('/gists?per_page=30')
}

function parseGistId(input) {
  const trimmed = input.trim()
  const m = trimmed.match(/([a-f0-9]{20,})/)
  return m ? m[1] : null
}

function gistUrl(gistId) {
  return `https://gist.github.com/${gistId}`
}

// ── sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = {
    idle:    { color: '#666', text: 'No Session' },
    loading: { color: '#ffe600', text: 'Loading…' },
    synced:  { color: '#00ff9d', text: 'Synced' },
    dirty:   { color: '#ff9500', text: 'Unsaved Changes' },
    error:   { color: '#ff2d55', text: 'Error' },
    polling: { color: '#00e5ff', text: 'Live Sync On' },
  }
  const { color, text } = cfg[status] || cfg.idle
  return (
    <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color }}>
      <span className="w-2 h-2 rounded-full inline-block" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      {text}
    </span>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button onClick={copy} title="Copy" style={{
      background: copied ? '#00ff9d22' : '#ffffff11',
      border: `1px solid ${copied ? '#00ff9d' : '#333'}`,
      color: copied ? '#00ff9d' : '#aaa',
      borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
    }}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function CommentBubble({ comment, isMe }) {
  return (
    <div className="flex flex-col gap-0.5" style={{ alignItems: isMe ? 'flex-end' : 'flex-start' }}>
      <span style={{ fontSize: 10, color: '#666' }}>{comment.user.login} · {new Date(comment.created_at).toLocaleString()}</span>
      <div style={{
        background: isMe ? '#00e5ff22' : '#ffffff0d',
        border: `1px solid ${isMe ? '#00e5ff44' : '#333'}`,
        borderRadius: 8, padding: '6px 10px', maxWidth: 420,
        color: '#e0e0e0', fontSize: 13,
      }}>
        {comment.body}
      </div>
    </div>
  )
}

function CommitRow({ commit, onRestore }) {
  const d = new Date(commit.committed_at)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #1a1a2e' }}>
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#666', flexShrink: 0 }}>{commit.version}</span>
      <span style={{ fontSize: 12, color: '#aaa', flexGrow: 1 }}>{d.toLocaleString()}</span>
      <span style={{ fontSize: 11, color: '#555', flexShrink: 0 }}>{commit.change_status?.additions ?? ''} additions</span>
      <button onClick={() => onRestore(commit.version)} style={{
        background: '#ffffff0d', border: '1px solid #333', color: '#00e5ff',
        borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', flexShrink: 0,
      }}>Restore</button>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function CollaborationView() {
  const rehydrate = useStudioStore(s => s.rehydrate)
  const [status, setStatus]           = useState('idle')
  const [gistId, setGistId]           = useState(() => localStorage.getItem('hs-collab-gistId') || '')
  const [gistDesc, setGistDesc]       = useState('')
  const [importInput, setImportInput] = useState('')
  const [author, setAuthor]           = useState(() => localStorage.getItem('hs-collab-author') || 'Bulue Berry')
  const [description, setDescription] = useState('')
  const [bpm, setBpm]                 = useState(120)
  const [liveSync, setLiveSync]       = useState(false)
  const [lastSynced, setLastSynced]   = useState(null)
  const [shareUrl, setShareUrl]       = useState('')
  const [myGists, setMyGists]         = useState([])
  const [commits, setCommits]         = useState([])
  const [comments, setComments]       = useState([])
  const [newComment, setNewComment]   = useState('')
  const [errorMsg, setErrorMsg]       = useState('')
  const [activePanel, setActivePanel] = useState('share')
  const [restoreMsg, setRestoreMsg]   = useState('')
  const [myLogin, setMyLogin]         = useState('')

  // Firebase state
  const [fbUser, setFbUser]           = useState(null)
  const [fbProjects, setFbProjects]   = useState([])
  const [fbLoading, setFbLoading]     = useState(false)
  const [fbMsg, setFbMsg]             = useState('')
  const [fbProjectName, setFbProjectName] = useState('My Project')
  const [fbRoomId, setFbRoomId]       = useState('')
  const [fbJoinInput, setFbJoinInput] = useState('')
  const fbUnsubRef                    = useRef(null)
  const [fbRoomData, setFbRoomData]   = useState(null)

  const pollRef   = useRef(null)
  const lastEtag  = useRef(null)

  // Firebase auth listener
  useEffect(() => onAuthChange(setFbUser), [])

  // Firebase handlers
  const fbSave = useCallback(async () => {
    setFbLoading(true); setFbMsg('')
    try {
      const id = await saveProjectCloud(fbProjectName)
      setFbMsg(`Saved! ID: ${id.slice(-8)}`)
      const list = await listProjects()
      setFbProjects(list)
    } catch (e) { setFbMsg(`Error: ${e.message}`) }
    finally { setFbLoading(false) }
  }, [fbProjectName])

  const fbRefreshProjects = useCallback(async () => {
    if (!fbUser) return
    setFbLoading(true)
    try { setFbProjects(await listProjects()) }
    catch (e) { setFbMsg(`Error: ${e.message}`) }
    finally { setFbLoading(false) }
  }, [fbUser])

  const fbLoad = useCallback(async (projectId) => {
    setFbLoading(true); setFbMsg('')
    try {
      await loadProjectCloud(projectId)
      rehydrate()
      setFbMsg('Project loaded!')
    } catch (e) { setFbMsg(`Error: ${e.message}`) }
    finally { setFbLoading(false) }
  }, [])

  const fbDelete = useCallback(async (projectId) => {
    setFbLoading(true); setFbMsg('')
    try {
      await deleteProjectCloud(projectId)
      setFbProjects(p => p.filter(x => x.id !== projectId))
      setFbMsg('Deleted.')
    } catch (e) { setFbMsg(`Error: ${e.message}`) }
    finally { setFbLoading(false) }
  }, [])

  const fbCreateRoom = useCallback(async () => {
    setFbLoading(true); setFbMsg('')
    try {
      const id = await createRoom('Live Session')
      setFbRoomId(id)
      fbUnsubRef.current?.()
      fbUnsubRef.current = subscribeRoom(id, data => setFbRoomData(data))
      setFbMsg(`Room created! Code: ${id}`)
    } catch (e) { setFbMsg(`Error: ${e.message}`) }
    finally { setFbLoading(false) }
  }, [])

  const fbJoinRoom = useCallback(async () => {
    const id = fbJoinInput.trim().toUpperCase()
    if (!id) return
    setFbLoading(true); setFbMsg('')
    try {
      await joinRoom(id)
      setFbRoomId(id)
      fbUnsubRef.current?.()
      fbUnsubRef.current = subscribeRoom(id, data => {
        setFbRoomData(data)
        applyRoomData(data)
      })
      setFbMsg(`Joined room ${id}`)
    } catch (e) { setFbMsg(`Error: ${e.message}`) }
    finally { setFbLoading(false) }
  }, [fbJoinInput])

  const fbPushRoom = useCallback(async () => {
    if (!fbRoomId) return
    setFbLoading(true); setFbMsg('')
    try { await pushRoomUpdate(fbRoomId); setFbMsg('Pushed your changes to the room.') }
    catch (e) { setFbMsg(`Error: ${e.message}`) }
    finally { setFbLoading(false) }
  }, [fbRoomId])

  const fbLeaveRoom = useCallback(() => {
    fbUnsubRef.current?.()
    fbUnsubRef.current = null
    setFbRoomId(''); setFbRoomData(null)
  }, [])

  useEffect(() => () => fbUnsubRef.current?.(), [])

  // fetch github username once
  useEffect(() => {
    ghFetch('/user').then(u => setMyLogin(u.login)).catch(() => {})
  }, [])

  // restore gistId from local storage
  useEffect(() => {
    if (gistId) {
      setShareUrl(gistUrl(gistId))
      setStatus('synced')
    }
  }, [])

  // persist author
  useEffect(() => { localStorage.setItem('hs-collab-author', author) }, [author])

  // live sync polling
  useEffect(() => {
    if (!liveSync || !gistId) return
    setStatus('polling')
    pollRef.current = setInterval(async () => {
      try {
        const g = await fetchGist(gistId)
        const content = g.files[SESSION_FILENAME]?.content
        if (!content) return
        const snapshot = JSON.parse(content)
        const serverTime = g.updated_at
        if (serverTime !== lastEtag.current) {
          lastEtag.current = serverTime
          restoreSessionSnapshot(snapshot)
          setLastSynced(new Date())
        }
      } catch {}
    }, POLL_INTERVAL_MS)
    return () => clearInterval(pollRef.current)
  }, [liveSync, gistId])

  useEffect(() => {
    if (!liveSync && gistId) setStatus('synced')
    if (!liveSync && !gistId) setStatus('idle')
  }, [liveSync])

  const clearError = () => setErrorMsg('')

  // ── create new session ────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    setStatus('loading'); clearError()
    try {
      const snapshot = buildSessionSnapshot({ author, description, bpm })
      const g = await createGist(snapshot, description || `Home Studio Session by ${author}`)
      const id = g.id
      setGistId(id)
      localStorage.setItem('hs-collab-gistId', id)
      setShareUrl(gistUrl(id))
      setLastSynced(new Date())
      setStatus('synced')
    } catch (e) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }, [author, description, bpm])

  // ── push update ───────────────────────────────────────────────────────────
  const handlePush = useCallback(async () => {
    if (!gistId) return
    setStatus('loading'); clearError()
    try {
      const snapshot = buildSessionSnapshot({ author, description, bpm })
      await updateGist(gistId, snapshot)
      setLastSynced(new Date())
      setStatus(liveSync ? 'polling' : 'synced')
    } catch (e) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }, [gistId, author, description, bpm, liveSync])

  // ── pull from cloud ───────────────────────────────────────────────────────
  const handlePull = useCallback(async () => {
    if (!gistId) return
    setStatus('loading'); clearError()
    try {
      const g = await fetchGist(gistId)
      const content = g.files[SESSION_FILENAME]?.content
      if (!content) throw new Error('Session file not found in Gist')
      const snapshot = JSON.parse(content)
      const count = restoreSessionSnapshot(snapshot)
      setLastSynced(new Date())
      setStatus(liveSync ? 'polling' : 'synced')
      rehydrate()
      setRestoreMsg(`Loaded ${count} data stores from cloud.`)
    } catch (e) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }, [gistId, liveSync])

  // ── import by URL / ID ────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    const id = parseGistId(importInput)
    if (!id) { setErrorMsg('Invalid Gist URL or ID'); setStatus('error'); return }
    setStatus('loading'); clearError()
    try {
      const g = await fetchGist(id)
      const content = g.files[SESSION_FILENAME]?.content
      if (!content) throw new Error('No session file found in this Gist')
      const snapshot = JSON.parse(content)
      const count = restoreSessionSnapshot(snapshot)
      setGistId(id)
      localStorage.setItem('hs-collab-gistId', id)
      setShareUrl(gistUrl(id))
      setLastSynced(new Date())
      setStatus('synced')
      rehydrate()
      setRestoreMsg(`Imported session (${count} stores).`)
      setImportInput('')
    } catch (e) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }, [importInput])

  // ── load my gists ─────────────────────────────────────────────────────────
  const handleLoadMyGists = useCallback(async () => {
    clearError()
    try {
      const list = await listMyGists()
      const sessions = list.filter(g => g.files[SESSION_FILENAME])
      setMyGists(sessions)
    } catch (e) { setErrorMsg(e.message) }
  }, [])

  // ── load commits ──────────────────────────────────────────────────────────
  const handleLoadCommits = useCallback(async () => {
    if (!gistId) return
    clearError()
    try {
      const list = await fetchGistCommits(gistId)
      setCommits(list)
    } catch (e) { setErrorMsg(e.message) }
  }, [gistId])

  // ── restore at commit ─────────────────────────────────────────────────────
  const handleRestoreCommit = useCallback(async (sha) => {
    clearError()
    try {
      const g = await fetchGistAtCommit(gistId, sha)
      const content = g.files[SESSION_FILENAME]?.content
      if (!content) throw new Error('No session data at this revision')
      const snapshot = JSON.parse(content)
      const count = restoreSessionSnapshot(snapshot)
      rehydrate()
      setRestoreMsg(`Restored revision ${sha.slice(0,7)} (${count} stores).`)
    } catch (e) { setErrorMsg(e.message) }
  }, [gistId])

  // ── comments ──────────────────────────────────────────────────────────────
  const handleLoadComments = useCallback(async () => {
    if (!gistId) return
    clearError()
    try {
      const list = await fetchGistComments(gistId)
      setComments(list)
    } catch (e) { setErrorMsg(e.message) }
  }, [gistId])

  const handleSendComment = useCallback(async () => {
    if (!gistId || !newComment.trim()) return
    clearError()
    try {
      const c = await postGistComment(gistId, newComment.trim())
      setComments(prev => [...prev, c])
      setNewComment('')
    } catch (e) { setErrorMsg(e.message) }
  }, [gistId, newComment])

  // ── disconnect ────────────────────────────────────────────────────────────
  const handleDisconnect = () => {
    setLiveSync(false)
    clearInterval(pollRef.current)
    setGistId('')
    localStorage.removeItem('hs-collab-gistId')
    setShareUrl('')
    setCommits([])
    setComments([])
    setStatus('idle')
  }

  // ─────────────────────────────────────────────────────────────────────────
  const panelBorder = (id) => ({
    padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: activePanel === id ? '#ffffff15' : 'transparent',
    border: `1px solid ${activePanel === id ? '#333' : 'transparent'}`,
    borderRadius: 6, color: activePanel === id ? '#e0e0e0' : '#666',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#080810', color: '#e0e0e0', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', background: '#0d0d1a', borderBottom: '1px solid #1a1a2e', flexShrink: 0 }}>
        <span style={{ fontSize: 18 }}>☁</span>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: 1, background: 'linear-gradient(90deg, #00e5ff, #b44fff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Collaboration Hub
        </span>
        <div style={{ flexGrow: 1 }} />
        <StatusBadge status={status} />
        {lastSynced && (
          <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>
            last sync {lastSynced.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* ── Error banner ── */}
      {errorMsg && (
        <div style={{ background: '#ff2d5522', border: '1px solid #ff2d55', color: '#ff8099', fontSize: 12, padding: '6px 16px', flexShrink: 0 }}>
          {errorMsg}
          <button onClick={clearError} style={{ float: 'right', background: 'none', border: 'none', color: '#ff8099', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      )}
      {restoreMsg && (
        <div style={{ background: '#00ff9d22', border: '1px solid #00ff9d', color: '#00ff9d', fontSize: 12, padding: '6px 16px', flexShrink: 0 }}>
          {restoreMsg}
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>

        {/* ── Left sidebar ── */}
        <div style={{ width: 280, background: '#0a0a18', borderRight: '1px solid #1a1a2e', display: 'flex', flexDirection: 'column', padding: 16, gap: 16, overflowY: 'auto', flexShrink: 0 }}>

          {/* Session meta */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Session Info</span>
            <label style={{ fontSize: 11, color: '#888' }}>Author Name
              <input value={author} onChange={e => setAuthor(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 3, background: '#ffffff0a', border: '1px solid #2a2a3e', borderRadius: 4, color: '#e0e0e0', padding: '4px 8px', fontSize: 12, boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: 11, color: '#888' }}>Session Description
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                style={{ display: 'block', width: '100%', marginTop: 3, resize: 'none', background: '#ffffff0a', border: '1px solid #2a2a3e', borderRadius: 4, color: '#e0e0e0', padding: '4px 8px', fontSize: 12, boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: 11, color: '#888' }}>BPM
              <input type="number" value={bpm} onChange={e => setBpm(Number(e.target.value))} min={40} max={300}
                style={{ display: 'block', width: '100%', marginTop: 3, background: '#ffffff0a', border: '1px solid #2a2a3e', borderRadius: 4, color: '#e0e0e0', padding: '4px 8px', fontSize: 12, boxSizing: 'border-box' }} />
            </label>
          </div>

          {/* Share URL */}
          {shareUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Share Link</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ fontSize: 10, color: '#00e5ff', wordBreak: 'break-all', flexGrow: 1, background: '#00e5ff0a', padding: '4px 6px', borderRadius: 4 }}>
                  {shareUrl}
                </code>
                <CopyButton text={shareUrl} />
              </div>
              {gistId && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: '#555' }}>Gist ID:</span>
                  <code style={{ fontSize: 10, color: '#888', flexGrow: 1, wordBreak: 'break-all' }}>{gistId}</code>
                  <CopyButton text={gistId} />
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {!gistId ? (
              <button onClick={handleCreate} style={{ background: 'linear-gradient(135deg, #00e5ff22, #b44fff22)', border: '1px solid #00e5ff55', color: '#00e5ff', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                ☁ Create Cloud Session
              </button>
            ) : (
              <>
                <button onClick={handlePush} style={{ background: '#00ff9d15', border: '1px solid #00ff9d44', color: '#00ff9d', borderRadius: 6, padding: '7px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                  ↑ Push to Cloud
                </button>
                <button onClick={handlePull} style={{ background: '#00e5ff15', border: '1px solid #00e5ff44', color: '#00e5ff', borderRadius: 6, padding: '7px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                  ↓ Pull from Cloud
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                  <button
                    onClick={() => setLiveSync(v => !v)}
                    style={{
                      background: liveSync ? '#00ff9d22' : '#ffffff0a',
                      border: `1px solid ${liveSync ? '#00ff9d' : '#333'}`,
                      color: liveSync ? '#00ff9d' : '#888',
                      borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    }}
                  >
                    {liveSync ? '⏸ Stop Sync' : '⟳ Live Sync'}
                  </button>
                  {liveSync && (
                    <span style={{ fontSize: 10, color: '#555' }}>polls every {POLL_INTERVAL_MS / 1000}s</span>
                  )}
                </div>
                <button onClick={handleDisconnect} style={{ background: '#ff2d5510', border: '1px solid #ff2d5533', color: '#ff8099', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11 }}>
                  ✕ Disconnect
                </button>
              </>
            )}
          </div>

          {/* Import */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Import Session</span>
            <input
              value={importInput} onChange={e => setImportInput(e.target.value)}
              placeholder="Paste Gist URL or ID…"
              style={{ background: '#ffffff0a', border: '1px solid #2a2a3e', borderRadius: 4, color: '#e0e0e0', padding: '5px 8px', fontSize: 11, boxSizing: 'border-box', width: '100%' }}
            />
            <button onClick={handleImport} disabled={!importInput.trim()} style={{ background: '#b44fff22', border: '1px solid #b44fff55', color: '#b44fff', borderRadius: 6, padding: '6px 12px', cursor: importInput.trim() ? 'pointer' : 'default', fontSize: 12, fontWeight: 700, opacity: importInput.trim() ? 1 : 0.4 }}>
              Import
            </button>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Panel tabs */}
          <div style={{ display: 'flex', gap: 4, padding: '8px 16px', background: '#0a0a18', borderBottom: '1px solid #1a1a2e', flexShrink: 0 }}>
            <button onClick={() => setActivePanel('share')} style={panelBorder('share')}>Share</button>
            <button onClick={() => { setActivePanel('history'); if (gistId) handleLoadCommits() }} style={panelBorder('history')}>History</button>
            <button onClick={() => { setActivePanel('comments'); if (gistId) handleLoadComments() }} style={panelBorder('comments')}>Comments</button>
            <button onClick={() => { setActivePanel('mysessions'); handleLoadMyGists() }} style={panelBorder('mysessions')}>My Sessions</button>
            <button onClick={() => { setActivePanel('firebase'); fbUser && fbRefreshProjects() }}
              style={{ ...panelBorder('firebase'), color: activePanel === 'firebase' ? '#00e5ff' : '#666', borderColor: activePanel === 'firebase' ? '#00e5ff55' : 'transparent' }}>
              ☁ Cloud DB {fbUser ? `· ${fbUser.displayName || fbUser.email?.split('@')[0]}` : ''}
            </button>
          </div>

          {/* Panel content */}
          <div style={{ flexGrow: 1, overflow: 'auto', padding: 20 }}>

            {/* ── Share panel ── */}
            {activePanel === 'share' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#e0e0e0' }}>How Cloud Sync Works</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      ['☁ Create Session', 'Saves your current project data to a private GitHub Gist.'],
                      ['↑ Push to Cloud', 'Sends your latest changes to the cloud. Anyone with the link can pull.'],
                      ['↓ Pull from Cloud', 'Downloads the latest session from the cloud and restores it locally.'],
                      ['⟳ Live Sync', `Automatically pulls updates every ${POLL_INTERVAL_MS / 1000} seconds. Great for real-time collaboration.`],
                      ['Import', 'Load any session by pasting a Gist URL or ID (e.g. a link from a collaborator).'],
                    ].map(([t, d]) => (
                      <div key={t} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: '#ffffff06', borderRadius: 6, border: '1px solid #1a1a2e' }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#00e5ff', minWidth: 120, flexShrink: 0 }}>{t}</span>
                        <span style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>{d}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {!gistId && (
                  <div style={{ padding: 20, background: '#ffffff06', borderRadius: 8, border: '1px dashed #333', textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>☁</div>
                    <div style={{ fontSize: 14, color: '#888', marginBottom: 12 }}>No active cloud session. Create one to start collaborating.</div>
                    <button onClick={handleCreate} style={{ background: 'linear-gradient(135deg, #00e5ff33, #b44fff33)', border: '1px solid #00e5ff55', color: '#00e5ff', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                      ☁ Create Cloud Session
                    </button>
                  </div>
                )}

                {gistId && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ padding: 16, background: '#00ff9d08', borderRadius: 8, border: '1px solid #00ff9d22' }}>
                      <div style={{ fontSize: 12, color: '#00ff9d', fontWeight: 700, marginBottom: 6 }}>Active Session</div>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Share this link with your collaborators:</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <code style={{ fontSize: 12, color: '#00e5ff', background: '#00e5ff0a', padding: '6px 10px', borderRadius: 4, flexGrow: 1, wordBreak: 'break-all' }}>{shareUrl}</code>
                        <CopyButton text={shareUrl} />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {[
                        { label: 'Author', value: author || '—' },
                        { label: 'BPM', value: bpm },
                        { label: 'Last Sync', value: lastSynced ? lastSynced.toLocaleTimeString() : 'never' },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ padding: '10px 14px', background: '#ffffff06', borderRadius: 6, border: '1px solid #1a1a2e' }}>
                          <div style={{ fontSize: 10, color: '#555', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
                          <div style={{ fontSize: 13, color: '#e0e0e0', fontWeight: 600 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── History panel ── */}
            {activePanel === 'history' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Version History</h3>
                  <button onClick={handleLoadCommits} disabled={!gistId} style={{ background: '#ffffff0d', border: '1px solid #333', color: '#aaa', borderRadius: 4, padding: '3px 10px', cursor: gistId ? 'pointer' : 'default', fontSize: 11, opacity: gistId ? 1 : 0.4 }}>Refresh</button>
                </div>
                {!gistId && <div style={{ color: '#555', fontSize: 12 }}>No active session. Create one to see history.</div>}
                {gistId && commits.length === 0 && <div style={{ color: '#555', fontSize: 12 }}>No commits yet, or click Refresh to load.</div>}
                {commits.map((c, i) => (
                  <CommitRow key={c.version || i} commit={c} onRestore={handleRestoreCommit} />
                ))}
              </div>
            )}

            {/* ── Comments panel ── */}
            {activePanel === 'comments' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Session Comments</h3>
                  <button onClick={handleLoadComments} disabled={!gistId} style={{ background: '#ffffff0d', border: '1px solid #333', color: '#aaa', borderRadius: 4, padding: '3px 10px', cursor: gistId ? 'pointer' : 'default', fontSize: 11, opacity: gistId ? 1 : 0.4 }}>Refresh</button>
                </div>
                {!gistId && <div style={{ color: '#555', fontSize: 12 }}>No active session.</div>}
                <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {comments.length === 0 && gistId && (
                    <div style={{ color: '#555', fontSize: 12 }}>No comments yet. Start a conversation!</div>
                  )}
                  {comments.map(c => (
                    <CommentBubble key={c.id} comment={c} isMe={c.user.login === myLogin} />
                  ))}
                </div>
                {gistId && (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <input
                      value={newComment} onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment() } }}
                      placeholder="Write a comment… (Enter to send)"
                      style={{ flexGrow: 1, background: '#ffffff0a', border: '1px solid #2a2a3e', borderRadius: 6, color: '#e0e0e0', padding: '7px 10px', fontSize: 12 }}
                    />
                    <button onClick={handleSendComment} disabled={!newComment.trim()} style={{ background: '#00e5ff22', border: '1px solid #00e5ff55', color: '#00e5ff', borderRadius: 6, padding: '7px 14px', cursor: newComment.trim() ? 'pointer' : 'default', fontWeight: 700, fontSize: 12, opacity: newComment.trim() ? 1 : 0.4 }}>
                      Send
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── My Sessions panel ── */}
            {activePanel === 'mysessions' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>My Cloud Sessions</h3>
                  <button onClick={handleLoadMyGists} style={{ background: '#ffffff0d', border: '1px solid #333', color: '#aaa', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>Refresh</button>
                </div>
                {myGists.length === 0 && (
                  <div style={{ color: '#555', fontSize: 12 }}>No saved sessions found. Click Refresh to load from GitHub.</div>
                )}
                {myGists.map(g => {
                  const isActive = g.id === gistId
                  return (
                    <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 6, background: isActive ? '#00e5ff0a' : '#ffffff06', border: `1px solid ${isActive ? '#00e5ff44' : '#1a1a2e'}`, borderRadius: 6 }}>
                      <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description || 'Untitled Session'}</div>
                        <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                          {new Date(g.updated_at).toLocaleString()} · ID: {g.id.slice(0, 10)}…
                        </div>
                      </div>
                      {isActive && <span style={{ fontSize: 10, color: '#00e5ff', fontWeight: 700, flexShrink: 0 }}>ACTIVE</span>}
                      {!isActive && (
                        <button
                          onClick={() => {
                            setGistId(g.id)
                            localStorage.setItem('hs-collab-gistId', g.id)
                            setShareUrl(gistUrl(g.id))
                            setStatus('synced')
                          }}
                          style={{ background: '#ffffff0d', border: '1px solid #333', color: '#aaa', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
                        >
                          Open
                        </button>
                      )}
                      <CopyButton text={gistUrl(g.id)} />
                    </div>
                  )
                })}
              </div>
            )}
            {/* ── Firebase Cloud DB panel ── */}
            {activePanel === 'firebase' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {!firebaseReady ? (
                  <div style={{ padding: 20, background: '#ffffff06', borderRadius: 8, border: '1px dashed #333' }}>
                    <div style={{ fontSize: 14, color: '#ffe600', fontWeight: 700, marginBottom: 8 }}>Firebase Not Configured</div>
                    <div style={{ fontSize: 12, color: '#888', lineHeight: 1.8 }}>
                      To enable real accounts + cloud save:<br />
                      1. Go to <span style={{ color: '#00e5ff', fontFamily: 'monospace' }}>firebase.google.com</span> → Create Project<br />
                      2. Add a Web app and copy the config values<br />
                      3. Open your <span style={{ color: '#ffe600', fontFamily: 'monospace' }}>.env</span> file and paste the values next to the <span style={{ fontFamily: 'monospace' }}>VITE_FIREBASE_*</span> keys<br />
                      4. Restart the app — this panel becomes fully active
                    </div>
                  </div>
                ) : !fbUser ? (
                  <div style={{ padding: 20, background: '#ffffff06', borderRadius: 8, border: '1px dashed #333', textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
                    <div style={{ fontSize: 14, color: '#888', marginBottom: 12 }}>Sign in to save projects to the cloud and join live collaboration rooms.</div>
                    <div style={{ fontSize: 12, color: '#555' }}>Click the user icon in the transport bar or go to the Account tab to sign in.</div>
                  </div>
                ) : (
                  <>
                    {/* Cloud Save */}
                    <div>
                      <div style={{ fontSize: 12, color: '#00e5ff', fontWeight: 700, marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Cloud Save</div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <input value={fbProjectName} onChange={e => setFbProjectName(e.target.value)}
                          placeholder="Project name…"
                          style={{ flexGrow: 1, background: '#ffffff0a', border: '1px solid #2a2a3e', borderRadius: 4, color: '#e0e0e0', padding: '5px 8px', fontSize: 12 }} />
                        <button onClick={fbSave} disabled={fbLoading}
                          style={{ background: '#00e5ff22', border: '1px solid #00e5ff44', color: '#00e5ff', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 12, opacity: fbLoading ? 0.6 : 1 }}>
                          ↑ Save
                        </button>
                        <button onClick={fbRefreshProjects} disabled={fbLoading}
                          style={{ background: '#ffffff0d', border: '1px solid #333', color: '#aaa', borderRadius: 4, padding: '5px 10px', cursor: 'pointer', fontSize: 11 }}>
                          Refresh
                        </button>
                      </div>
                      {fbMsg && <div style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, marginBottom: 8, background: fbMsg.startsWith('Error') ? '#ff2d5520' : '#00ff9d20', color: fbMsg.startsWith('Error') ? '#ff8099' : '#00ff9d' }}>{fbMsg}</div>}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {fbProjects.length === 0 && <div style={{ color: '#555', fontSize: 12 }}>No cloud projects yet. Click Save to create one.</div>}
                        {fbProjects.map(p => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#ffffff06', border: '1px solid #1a1a2e', borderRadius: 6 }}>
                            <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>{p.name}</div>
                              <div style={{ fontSize: 10, color: '#555' }}>{p.updatedAt ? new Date(p.updatedAt).toLocaleString() : 'Saved'}</div>
                            </div>
                            <button onClick={() => fbLoad(p.id)} disabled={fbLoading}
                              style={{ background: '#00ff9d15', border: '1px solid #00ff9d44', color: '#00ff9d', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>Load</button>
                            <button onClick={() => fbDelete(p.id)} disabled={fbLoading}
                              style={{ background: '#ff2d5510', border: '1px solid #ff2d5533', color: '#ff8099', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Live Room */}
                    <div>
                      <div style={{ fontSize: 12, color: '#b44fff', fontWeight: 700, marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Real-Time Collaboration Room</div>
                      {fbRoomId ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ padding: 12, background: '#b44fff11', border: '1px solid #b44fff33', borderRadius: 8 }}>
                            <div style={{ fontSize: 12, color: '#b44fff', fontWeight: 700, marginBottom: 4 }}>In Room: {fbRoomId}</div>
                            {fbRoomData?.lastEditBy && <div style={{ fontSize: 11, color: '#888' }}>Last edit by: {fbRoomData.lastEditBy}</div>}
                            <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Share this code with collaborators so they can join</div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={fbPushRoom} disabled={fbLoading}
                              style={{ flex: 1, background: '#00ff9d15', border: '1px solid #00ff9d44', color: '#00ff9d', borderRadius: 6, padding: '7px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                              ↑ Push My Changes
                            </button>
                            <button onClick={fbLeaveRoom}
                              style={{ background: '#ff2d5510', border: '1px solid #ff2d5533', color: '#ff8099', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 12 }}>
                              Leave
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <button onClick={fbCreateRoom} disabled={fbLoading}
                            style={{ background: '#b44fff22', border: '1px solid #b44fff44', color: '#b44fff', borderRadius: 6, padding: '8px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                            + Create Room
                          </button>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input value={fbJoinInput} onChange={e => setFbJoinInput(e.target.value.toUpperCase())}
                              placeholder="Room code (e.g. AB3X9F7)"
                              style={{ flexGrow: 1, background: '#ffffff0a', border: '1px solid #2a2a3e', borderRadius: 4, color: '#e0e0e0', padding: '5px 8px', fontSize: 12, fontFamily: 'monospace', letterSpacing: 2 }} />
                            <button onClick={fbJoinRoom} disabled={fbLoading || !fbJoinInput.trim()}
                              style={{ background: '#b44fff22', border: '1px solid #b44fff44', color: '#b44fff', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 12, opacity: fbJoinInput.trim() ? 1 : 0.4 }}>
                              Join
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
