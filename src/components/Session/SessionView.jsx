import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getCtx, getRecordings, onClipsChange, getRecordingBuffer, startRecording, stopRecording } from '../../audio/audioEngine'

/* ── Layout constants ─────────────────────────────────────────────────── */
const TRACK_W  = 148   // px per track column
const SCENE_H  = 54    // px per scene row
const LABEL_W  = 36    // scene number column
const LAUNCH_W = 80    // scene launch button column

const PALETTE = [
  '#b44fff','#00e5ff','#00ff9d','#ff9500',
  '#ffe600','#ff2d55','#a78bfa','#34d399','#f97316','#06b6d4',
]

/* ── ID factory ───────────────────────────────────────────────────────── */
let _seq = 200
const uid = () => String(++_seq)

/* ── Data factories ───────────────────────────────────────────────────── */
function mkTrack(name, idx) {
  return {
    id: uid(), name,
    color: PALETTE[idx % PALETTE.length],
    volume: 80, muted: false, solo: false, armed: false,
  }
}
function mkScene(n) { return { id: uid(), name: `Scene ${n}` } }

const INIT_TRACKS = ['Vocal','Beat','Bass','Keys'].map((n, i) => mkTrack(n, i))
const INIT_SCENES = [1, 2, 3, 4, 5, 6].map(mkScene)

/* ── Mini VU meter (animated when clip is playing) ────────────────────── */
function MiniVU({ active, color }) {
  const [bars, setBars] = useState([0.2, 0.3, 0.15, 0.25])
  const rafRef = useRef(null)

  useEffect(() => {
    if (!active) { setBars([0.1, 0.1, 0.1, 0.1]); return }
    const tick = () => {
      setBars([
        Math.random() * 0.7 + 0.2,
        Math.random() * 0.9 + 0.1,
        Math.random() * 0.6 + 0.3,
        Math.random() * 0.8 + 0.1,
      ])
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active])

  return (
    <div className="flex items-end gap-px shrink-0" style={{ width: 18, height: 16 }}>
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{
            height: `${Math.round(h * 100)}%`,
            background: active ? color : '#252545',
            transition: active ? 'height 60ms linear' : 'height 200ms',
          }}
        />
      ))}
    </div>
  )
}

/* ── Main SessionView ─────────────────────────────────────────────────── */
export default function SessionView() {
  const [tracks,    setTracks]    = useState(INIT_TRACKS)
  const [scenes,    setScenes]    = useState(INIT_SCENES)
  // clips: { [sceneId]: { [trackId]: { id, name, bufId } | null } }
  const [clips,     setClips]     = useState({})
  // playingSet: Set of strings "${trackId}:${clipId}" for render-time checks
  const [playingSet, setPlayingSet] = useState(new Set())
  const [recordings, setRecordings] = useState(() => getRecordings())
  const [picker, setPicker]  = useState(null)  // { sceneId, trackId, x, y }
  const [editName, setEditName] = useState(null) // { type, id, value }
  const [recordingSlot, setRecordingSlot] = useState(null) // { sceneId, trackId } | null
  const pendingSlotRef = useRef(null) // mirrors recordingSlot without stale-closure risk

  // Audio refs — keyed by trackId
  const sourcesRef  = useRef({})   // trackId → AudioBufferSourceNode
  const clipIdRef   = useRef({})   // trackId → currently playing clipId
  const gainRef     = useRef({})   // trackId → GainNode

  useEffect(() => onClipsChange((recs) => {
    setRecordings(recs)
    // If we were recording into a slot, auto-load the newest clip into it
    if (pendingSlotRef.current && recs.length > 0) {
      const newest = recs[recs.length - 1]
      const { sceneId, trackId } = pendingSlotRef.current
      const clip = { id: uid(), name: newest.name, bufId: newest.id }
      setClips(prev => ({
        ...prev,
        [sceneId]: { ...(prev[sceneId] || {}), [trackId]: clip },
      }))
      pendingSlotRef.current = null
      setRecordingSlot(null)
    }
  }), [])

  /* ── Track gain node (lazy create) ─────────────────────────────────── */
  const getGain = useCallback((trackId) => {
    if (!gainRef.current[trackId]) {
      const c = getCtx()
      const g = c.createGain()
      g.connect(c.destination)
      gainRef.current[trackId] = g
    }
    return gainRef.current[trackId]
  }, [])

  /* sync gain when mute/solo/volume changes */
  useEffect(() => {
    const soloOn = tracks.some(t => t.solo)
    tracks.forEach(t => {
      const g = gainRef.current[t.id]
      if (!g) return
      const silenced = t.muted || (soloOn && !t.solo)
      g.gain.value = silenced ? 0 : t.volume / 100
    })
  }, [tracks])

  /* ── Stop a track ───────────────────────────────────────────────────── */
  const stopTrack = useCallback((trackId) => {
    const src = sourcesRef.current[trackId]
    if (src) { try { src.stop() } catch {} }
    const clipId = clipIdRef.current[trackId]
    delete sourcesRef.current[trackId]
    delete clipIdRef.current[trackId]
    if (clipId) {
      setPlayingSet(prev => {
        const n = new Set(prev)
        n.delete(`${trackId}:${clipId}`)
        return n
      })
    }
  }, [])

  /* ── Start a clip on a track (loops) ────────────────────────────────── */
  const startClip = useCallback(async (clip, trackId) => {
    stopTrack(trackId)
    if (!clip?.bufId) return
    const buf = await getRecordingBuffer(clip.bufId)
    if (!buf) return
    const c   = getCtx()
    const src = c.createBufferSource()
    src.buffer = buf
    src.loop   = true
    src.connect(getGain(trackId))
    src.start()
    sourcesRef.current[trackId] = src
    clipIdRef.current[trackId]  = clip.id
    setPlayingSet(prev => new Set([...prev, `${trackId}:${clip.id}`]))
    src.onended = () => {
      if (clipIdRef.current[trackId] === clip.id) {
        delete sourcesRef.current[trackId]
        delete clipIdRef.current[trackId]
        setPlayingSet(prev => {
          const n = new Set(prev); n.delete(`${trackId}:${clip.id}`); return n
        })
      }
    }
  }, [stopTrack, getGain])

  /* ── Toggle a clip slot ─────────────────────────────────────────────── */
  const toggleClip = useCallback((clip, trackId) => {
    if (clipIdRef.current[trackId] === clip.id) stopTrack(trackId)
    else startClip(clip, trackId)
  }, [startClip, stopTrack])

  /* ── Launch entire scene ────────────────────────────────────────────── */
  const launchScene = useCallback((sceneId) => {
    tracks.forEach(track => {
      const clip = clips[sceneId]?.[track.id]
      if (clip) startClip(clip, track.id)
      else stopTrack(track.id)
    })
  }, [tracks, clips, startClip, stopTrack])

  /* ── Stop all clips ─────────────────────────────────────────────────── */
  const stopAll = useCallback(() => {
    Object.keys(sourcesRef.current).forEach(trackId => stopTrack(trackId))
  }, [stopTrack])

  useEffect(() => () => {
    // Directly stop all refs on unmount — avoids stale closure over `tracks`
    Object.values(sourcesRef.current).forEach(src => { try { src.stop() } catch {} })
    sourcesRef.current = {}
    clipIdRef.current  = {}
  }, [])

  /* ── Load recording into slot ───────────────────────────────────────── */
  const loadIntoSlot = useCallback((sceneId, trackId, rec) => {
    const clip = { id: uid(), name: rec.name, bufId: rec.id }
    setClips(prev => ({
      ...prev,
      [sceneId]: { ...(prev[sceneId] || {}), [trackId]: clip },
    }))
    setPicker(null)
  }, [])

  /* ── Clear a slot ───────────────────────────────────────────────────── */
  const clearSlot = useCallback((sceneId, trackId) => {
    const clip = clips[sceneId]?.[trackId]
    if (clip && clipIdRef.current[trackId] === clip.id) stopTrack(trackId)
    setClips(prev => ({
      ...prev,
      [sceneId]: { ...(prev[sceneId] || {}), [trackId]: null },
    }))
  }, [clips, stopTrack])

  /* ── Empty slot click — arm-to-record or show picker ───────────────── */
  const handleEmptySlotClick = useCallback((e, sceneId, trackId) => {
    const track = tracks.find(t => t.id === trackId)
    if (track?.armed) {
      const isRecordingHere = recordingSlot?.sceneId === sceneId && recordingSlot?.trackId === trackId
      if (isRecordingHere) {
        // Second click on the same slot → stop recording; onClipsChange will auto-load
        stopRecording()
      } else {
        // First click on armed slot → start recording
        startRecording().then(err => {
          if (err) {
            setRecordingSlot(null)
            pendingSlotRef.current = null
          }
        })
        setRecordingSlot({ sceneId, trackId })
        pendingSlotRef.current = { sceneId, trackId }
      }
    } else {
      // Track not armed — open the recording picker as before
      const r = e.currentTarget.getBoundingClientRect()
      setPicker({ sceneId, trackId, x: r.left, y: r.bottom + 4 })
    }
  }, [tracks, recordingSlot])

  /* ── Track management ───────────────────────────────────────────────── */
  const addTrack = () =>
    setTracks(prev => [...prev, mkTrack(`Track ${prev.length + 1}`, prev.length)])

  const removeTrack = (id) => {
    stopTrack(id)
    setTracks(prev => prev.filter(t => t.id !== id))
  }

  const updateTrack = (id, patch) =>
    setTracks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))

  /* ── Scene management ───────────────────────────────────────────────── */
  const addScene = () => setScenes(prev => [...prev, mkScene(prev.length + 1)])

  const removeScene = (id) => {
    tracks.forEach(t => {
      const c = clips[id]?.[t.id]
      if (c && clipIdRef.current[t.id] === c.id) stopTrack(t.id)
    })
    setScenes(prev => prev.filter(s => s.id !== id))
    setClips(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  /* ── Name editing ───────────────────────────────────────────────────── */
  const commitEdit = useCallback(() => {
    if (!editName) return
    const val = editName.value.trim() || editName.value
    if (editName.type === 'track') updateTrack(editName.id, { name: val })
    else setScenes(prev => prev.map(s => s.id === editName.id ? { ...s, name: val } : s))
    setEditName(null)
  }, [editName])

  /* close picker on outside click */
  useEffect(() => {
    if (!picker) return
    const h = (e) => { if (!e.target.closest('[data-picker]')) setPicker(null) }
    setTimeout(() => document.addEventListener('mousedown', h), 0)
    return () => document.removeEventListener('mousedown', h)
  }, [picker])

  const anyPlaying = playingSet.size > 0
  const soloOn     = tracks.some(t => t.solo)
  const totalW     = LABEL_W + tracks.length * TRACK_W + LAUNCH_W

  return (
    <div className="flex flex-col h-full bg-studio-void overflow-hidden">

      {/* ── Title bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-studio-panel border-b border-studio-border shrink-0">
        <span
          className="font-display text-sm font-semibold tracking-widest uppercase"
          style={{ color: '#00ff9d', textShadow: '0 0 10px #00ff9d55' }}
        >Session View</span>
        <span className="font-mono text-xs text-studio-dim">Clip Launcher</span>
        <div className="flex-1" />
        {anyPlaying && (
          <button
            onClick={stopAll}
            className="flex items-center gap-1.5 px-3 h-7 rounded text-xs font-mono border border-studio-red text-studio-red bg-studio-red/10 hover:bg-studio-red/20 transition-colors"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><rect width="8" height="8" /></svg>
            Stop All
          </button>
        )}
        <button
          onClick={addTrack}
          className="px-2.5 h-7 rounded text-xs font-mono border border-studio-border text-studio-dim hover:border-studio-cyan hover:text-studio-cyan transition-colors"
        >+ Track</button>
        <button
          onClick={addScene}
          className="px-2.5 h-7 rounded text-xs font-mono border border-studio-border text-studio-dim hover:border-studio-green hover:text-studio-green transition-colors"
        >+ Scene</button>
      </div>

      {/* ── Main grid ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <div style={{ minWidth: totalW }}>

          {/* ── Track headers (sticky) ──────────────────────────────────── */}
          <div
            className="sticky top-0 z-20 flex"
            style={{ background: '#090916', borderBottom: '2px solid #1a1a30' }}
          >
            {/* Scene label spacer */}
            <div style={{ width: LABEL_W, minWidth: LABEL_W, borderRight: '1px solid #1a1a30' }} />

            {/* Track columns */}
            {tracks.map((track) => {
              const silenced = track.muted || (soloOn && !track.solo)
              const isPlaying = [...playingSet].some(k => k.startsWith(`${track.id}:`))
              return (
                <div
                  key={track.id}
                  className="flex flex-col items-stretch pt-0 pb-1.5 relative group/th"
                  style={{ width: TRACK_W, minWidth: TRACK_W, borderRight: '1px solid #1a1a30' }}
                >
                  {/* Color accent top bar */}
                  <div
                    className="h-0.5 shrink-0"
                    style={{ background: silenced ? '#252545' : track.color, boxShadow: isPlaying && !silenced ? `0 0 6px ${track.color}` : 'none' }}
                  />

                  {/* Track name */}
                  <div className="flex items-center gap-1 px-2 pt-1.5 pb-0.5">
                    {editName?.type === 'track' && editName.id === track.id ? (
                      <input
                        autoFocus
                        value={editName.value}
                        onChange={e => setEditName(p => ({ ...p, value: e.target.value }))}
                        onBlur={commitEdit}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditName(null) }}
                        className="flex-1 bg-transparent border-b border-studio-cyan text-studio-text text-xs font-ui outline-none"
                      />
                    ) : (
                      <span
                        className="flex-1 text-xs font-ui font-semibold truncate cursor-pointer hover:text-studio-cyan transition-colors"
                        style={{ color: silenced ? '#44445a' : '#e0e0f0' }}
                        onDoubleClick={() => setEditName({ type: 'track', id: track.id, value: track.name })}
                        title="Double-click to rename"
                      >{track.name}</span>
                    )}
                    <button
                      onClick={() => removeTrack(track.id)}
                      className="opacity-0 group-hover/th:opacity-100 text-studio-muted hover:text-studio-red transition-all text-xs"
                      title="Remove track"
                    >✕</button>
                  </div>

                  {/* VU + Volume slider */}
                  <div className="flex items-center gap-1.5 px-2 pb-1">
                    <MiniVU active={isPlaying && !silenced} color={track.color} />
                    <input
                      type="range" min={0} max={100} value={track.volume}
                      onChange={e => updateTrack(track.id, { volume: Number(e.target.value) })}
                      className="flex-1 h-1"
                      style={{ accentColor: track.color }}
                      title={`Volume: ${track.volume}%`}
                    />
                    <span className="font-mono text-studio-muted shrink-0" style={{ fontSize: 8, minWidth: 18 }}>
                      {track.volume}
                    </span>
                  </div>

                  {/* M / S / Arm */}
                  <div className="flex items-center justify-center gap-1 px-1">
                    <button
                      onClick={() => updateTrack(track.id, { muted: !track.muted })}
                      className={`flex-1 h-5 rounded text-xs font-bold transition-colors ${
                        track.muted
                          ? 'bg-orange-500 text-black'
                          : 'bg-studio-surface text-studio-dim hover:bg-orange-500/20 hover:text-orange-400'
                      }`}
                      title="Mute"
                    >M</button>
                    <button
                      onClick={() => updateTrack(track.id, { solo: !track.solo })}
                      className={`flex-1 h-5 rounded text-xs font-bold transition-colors ${
                        track.solo
                          ? 'bg-studio-yellow text-black'
                          : 'bg-studio-surface text-studio-dim hover:bg-studio-yellow/20 hover:text-studio-yellow'
                      }`}
                      title="Solo"
                    >S</button>
                    <button
                      onClick={() => updateTrack(track.id, { armed: !track.armed })}
                      className={`flex-1 h-5 rounded text-xs font-bold transition-colors ${
                        track.armed
                          ? 'bg-studio-red text-white animate-pulse'
                          : 'bg-studio-surface text-studio-dim hover:bg-studio-red/20 hover:text-studio-red'
                      }`}
                      title="Arm for recording"
                    >●</button>
                  </div>
                </div>
              )
            })}

            {/* Launch column header */}
            <div
              className="flex items-end justify-center pb-1.5"
              style={{ width: LAUNCH_W, minWidth: LAUNCH_W, borderLeft: '1px solid #1a1a30' }}
            >
              <span className="font-mono text-studio-muted" style={{ fontSize: 8 }}>LAUNCH</span>
            </div>
          </div>

          {/* ── Scene rows ──────────────────────────────────────────────── */}
          {scenes.map((scene, si) => (
            <div
              key={scene.id}
              className="flex items-stretch group/scene"
              style={{ height: SCENE_H, borderBottom: '1px solid #111120' }}
            >
              {/* Scene number */}
              <div
                className="flex items-center justify-center shrink-0"
                style={{ width: LABEL_W, minWidth: LABEL_W, borderRight: '1px solid #1a1a30', background: '#07070f' }}
              >
                <span
                  className="font-mono text-studio-muted cursor-pointer hover:text-studio-text transition-colors select-none"
                  style={{ fontSize: 10 }}
                  title={`Scene ${si + 1}: ${scene.name}`}
                >{si + 1}</span>
              </div>

              {/* Clip slots — one per track */}
              {tracks.map((track) => {
                const clip    = clips[scene.id]?.[track.id]
                const isActive = clip ? playingSet.has(`${track.id}:${clip.id}`) : false

                return (
                  <div
                    key={track.id}
                    className="relative flex items-center justify-center"
                    style={{ width: TRACK_W, minWidth: TRACK_W, borderRight: '1px solid #111120', background: '#0b0b16' }}
                  >
                    {clip ? (
                      /* ── Filled slot ───────────────────────────────────── */
                      <button
                        onClick={() => toggleClip(clip, track.id)}
                        className="absolute inset-2 rounded flex items-center gap-1.5 px-2 text-left transition-all group/clip"
                        style={{
                          background: isActive ? `${track.color}22` : `${track.color}0e`,
                          border: `1.5px solid ${isActive ? track.color : track.color + '44'}`,
                          boxShadow: isActive ? `0 0 14px ${track.color}44, inset 0 0 8px ${track.color}12` : 'none',
                        }}
                        title={`${isActive ? 'Stop' : 'Play'}: ${clip.name}`}
                      >
                        {/* Play / Pause icon */}
                        <div
                          className="shrink-0 flex items-center justify-center rounded-full transition-all"
                          style={{
                            width: 18, height: 18,
                            background: isActive ? track.color : `${track.color}33`,
                          }}
                        >
                          {isActive
                            ? <svg width="8" height="9" viewBox="0 0 8 9" fill="black"><rect x="0" y="0" width="2.5" height="9"/><rect x="5.5" y="0" width="2.5" height="9"/></svg>
                            : <svg width="7" height="8" viewBox="0 0 7 8" fill={track.color}><polygon points="0,0 7,4 0,8"/></svg>
                          }
                        </div>

                        {/* Clip name */}
                        <span
                          className="flex-1 font-mono truncate pointer-events-none"
                          style={{ fontSize: 9, color: isActive ? '#e0e0f0' : '#888898', lineHeight: 1.3 }}
                        >{clip.name}</span>

                        {/* Remove on hover */}
                        <button
                          onClick={e => { e.stopPropagation(); clearSlot(scene.id, track.id) }}
                          className="opacity-0 group-hover/clip:opacity-100 text-studio-muted hover:text-studio-red transition-all shrink-0"
                          style={{ fontSize: 11, lineHeight: 1 }}
                          title="Remove clip"
                        >✕</button>
                      </button>
                    ) : (() => {
                      const isRecHere = recordingSlot?.sceneId === scene.id && recordingSlot?.trackId === track.id
                      return (
                        /* ── Empty slot ──────────────────────────────────── */
                        <button
                          onClick={e => { e.stopPropagation(); handleEmptySlotClick(e, scene.id, track.id) }}
                          className="absolute inset-2 rounded flex items-center justify-center border transition-all group/empty"
                          style={{
                            borderColor: isRecHere ? '#ff2d55' : track.armed ? '#ff2d5540' : '#181830',
                            borderStyle: isRecHere ? 'solid' : 'dashed',
                            background: isRecHere ? '#ff2d5518' : track.armed ? '#ff2d5508' : 'transparent',
                            boxShadow: isRecHere ? '0 0 10px #ff2d5544' : 'none',
                          }}
                          title={
                            isRecHere
                              ? 'Click to stop recording'
                              : track.armed
                              ? 'Click to record into this slot'
                              : `Add clip to ${track.name} — ${scene.name}`
                          }
                        >
                          {isRecHere ? (
                            <span className="flex items-center gap-1.5 font-mono animate-pulse" style={{ fontSize: 9, color: '#ff2d55' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff2d55', display: 'inline-block' }} />
                              REC
                            </span>
                          ) : track.armed ? (
                            <span className="font-mono" style={{ fontSize: 9, color: '#ff2d5588' }}>● REC</span>
                          ) : (
                            <span
                              className="text-studio-muted opacity-0 group-hover/empty:opacity-100 transition-opacity"
                              style={{ fontSize: 18, lineHeight: 1, marginTop: -2 }}
                            >+</span>
                          )}
                        </button>
                      )
                    })()}
                  </div>
                )
              })}

              {/* Scene launch + remove */}
              <div
                className="flex items-center justify-center gap-1"
                style={{ width: LAUNCH_W, minWidth: LAUNCH_W, borderLeft: '1px solid #1a1a30', background: '#08080e' }}
              >
                <button
                  onClick={() => launchScene(scene.id)}
                  className="flex items-center gap-1 px-2.5 h-8 rounded text-xs font-ui font-semibold transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: '#00ff9d16',
                    border: '1.5px solid #00ff9d44',
                    color: '#00ff9d',
                    boxShadow: '0 0 8px #00ff9d14',
                  }}
                  title={`Launch ${scene.name} — fires all clips in this row`}
                >
                  <svg width="7" height="8" viewBox="0 0 7 8" fill="currentColor"><polygon points="0,0 7,4 0,8"/></svg>
                  <span>{si + 1}</span>
                </button>
                <button
                  onClick={() => removeScene(scene.id)}
                  className="w-5 h-5 rounded text-studio-muted hover:text-studio-red transition-colors opacity-0 group-hover/scene:opacity-100"
                  style={{ fontSize: 10 }}
                  title="Remove scene"
                >✕</button>
              </div>
            </div>
          ))}

          {/* Add scene footer row */}
          <div className="flex items-center justify-center py-4" style={{ minWidth: totalW }}>
            <button
              onClick={addScene}
              className="flex items-center gap-1.5 px-5 h-7 rounded-full text-xs font-mono border transition-colors"
              style={{ borderColor: '#1a1a30', color: '#44445a' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#00ff9d55'; e.currentTarget.style.color = '#00ff9d' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a1a30'; e.currentTarget.style.color = '#44445a' }}
            >+ Add Scene</button>
          </div>
        </div>
      </div>

      {/* ── Recordings picker popup ──────────────────────────────────────── */}
      {picker && (
        <div
          data-picker
          className="fixed z-50 bg-studio-panel border border-studio-border rounded-xl shadow-2xl overflow-hidden"
          style={{
            left:      Math.min(picker.x, window.innerWidth  - 228),
            top:       Math.min(picker.y, window.innerHeight - 260),
            width:     220,
            maxHeight: 260,
            overflowY: 'auto',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-xs font-mono text-studio-dim border-b border-studio-border uppercase tracking-wider sticky top-0 bg-studio-panel">
            Load Recording
          </div>
          {recordings.length === 0 ? (
            <div className="px-3 py-5 text-xs text-studio-dim text-center font-ui leading-relaxed">
              No recordings yet.<br />
              Record audio in Arrange or Edison first.
            </div>
          ) : (
            recordings.map(rec => (
              <button
                key={rec.id}
                onClick={() => loadIntoSlot(picker.sceneId, picker.trackId, rec)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-studio-surface text-left transition-colors"
              >
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#b44fff' }} />
                <span className="text-xs font-ui text-studio-text flex-1 truncate">{rec.name}</span>
                <span className="text-xs font-mono text-studio-muted shrink-0">
                  {(rec.size / 1024).toFixed(0)} KB
                </span>
              </button>
            ))
          )}
          <button
            onClick={() => setPicker(null)}
            className="w-full py-1.5 text-xs font-mono text-studio-muted hover:text-studio-text border-t border-studio-border transition-colors"
          >Cancel</button>
        </div>
      )}
    </div>
  )
}
