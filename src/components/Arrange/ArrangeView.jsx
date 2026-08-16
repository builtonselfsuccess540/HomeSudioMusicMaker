import React, { useRef, useState, useEffect } from 'react'
import { useStudioStore } from '../../store/useStudioStore'
import { useAudio } from '../../hooks/useAudio'
import { playRecording, stopPlayback } from '../../audio/audioEngine'
import AutoCurveCanvas, { lerpCurve } from '../shared/AutoCurveCanvas'

function WaveformCanvas({ waveformData }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = '#00e5ff'
    ctx.lineWidth = 1.5
    ctx.shadowColor = 'rgba(0,229,255,0.6)'
    ctx.shadowBlur = 4
    ctx.beginPath()
    const step = w / waveformData.length
    waveformData.forEach((v, i) => {
      const x = i * step
      const y = (1 + v) * h / 2
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.stroke()
  }, [waveformData])

  return <canvas ref={canvasRef} className="w-full h-6" />
}

const RULER_WIDTH = 180
const BEAT_WIDTH  = 40
const BEATS       = 32
const AUTO_LANE_H = 56

const AUTO_PARAMS = [
  'volume', 'pan',
  'reverb-send', 'delay-send',
  'eq-low', 'eq-mid', 'eq-high',
  'comp-threshold',
]

const AUTO_LABELS = {
  'volume':         'Volume',
  'pan':            'Pan',
  'reverb-send':    'Reverb Send',
  'delay-send':     'Delay Send',
  'eq-low':         'EQ Low',
  'eq-mid':         'EQ Mid',
  'eq-high':        'EQ High',
  'comp-threshold': 'Comp Threshold',
}

// Default curve value (0-1 normalized) for each param
const AUTO_DEFAULTS = {
  'volume':         1.0,
  'pan':            0.5,
  'reverb-send':    0,
  'delay-send':     0,
  'eq-low':         0.5,
  'eq-mid':         0.5,
  'eq-high':        0.5,
  'comp-threshold': 0.667, // maps to -20 dB
}

// Group params by category for the add-lane menu
const AUTO_GROUPS = [
  { label: 'Levels',     params: ['volume', 'pan'] },
  { label: 'Sends',      params: ['reverb-send', 'delay-send'] },
  { label: 'EQ',         params: ['eq-low', 'eq-mid', 'eq-high'] },
  { label: 'Dynamics',   params: ['comp-threshold'] },
]

// Beat marker x-positions (0-1) for each bar boundary
const BAR_MARKERS = Array.from({ length: BEATS / 4 }, (_, i) => i / (BEATS / 4))

function AutoLaneRow({ trackId, param, points, onChange, color, playheadX }) {
  const TOTAL_W = BEATS * BEAT_WIDTH
  return (
    <div className="flex items-stretch border-b border-studio-border/60" style={{ height: AUTO_LANE_H }}>
      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-1.5 px-2 border-r border-studio-border"
        style={{ width: RULER_WIDTH, background: '#0a0a16' }}
      >
        <div className="w-1 self-stretch" style={{ background: color + '55' }} />
        <div className="flex flex-col flex-1 min-w-0">
          <span className="font-mono uppercase text-studio-dim" style={{ fontSize: 8 }}>
            {AUTO_LABELS[param] || param}
          </span>
          <span className="font-mono text-studio-muted" style={{ fontSize: 7 }}>automation</span>
        </div>
        <button
          onClick={() => onChange(param, null)}
          className="text-studio-muted hover:text-studio-red transition-colors ml-auto"
          style={{ fontSize: 10 }}
          title="Remove lane"
        >×</button>
      </div>
      {/* Curve */}
      <div style={{ width: TOTAL_W, flexShrink: 0 }}>
        <AutoCurveCanvas
          points={points}
          onChange={(pts) => onChange(param, pts)}
          color={color}
          width={TOTAL_W}
          height={AUTO_LANE_H}
          playheadX={playheadX}
          defaultValue={AUTO_DEFAULTS[param] ?? 0.5}
          label={AUTO_LABELS[param] || param}
          beatMarkers={BAR_MARKERS}
        />
      </div>
    </div>
  )
}

function TrackLane({ track, onMute, onSolo, onRemove, onRemoveClip, onMoveClip, onAutoAdd, hasAuto, onDropSample }) {
  const cols = BEATS
  const [playingClipId, setPlayingClipId] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [showAutoMenu, setShowAutoMenu] = useState(false)
  const laneRef = useRef(null)

  const handleClipPlay = (clip) => {
    if (!clip.url) return
    if (playingClipId === clip.id) {
      stopPlayback()
      setPlayingClipId(null)
    } else {
      const audio = playRecording(clip.url)
      setPlayingClipId(clip.id)
      audio.onended = () => setPlayingClipId(null)
    }
  }

  const handleDragStart = (e, clip) => {
    e.preventDefault()
    const laneRect = laneRef.current.getBoundingClientRect()
    const mouseXInLane = e.clientX - laneRect.left
    setDragging({
      clipId: clip.id,
      startMouseX: e.clientX,
      startBeat: clip.start,
      currentBeat: clip.start,
      offsetX: mouseXInLane - clip.start * BEAT_WIDTH, // where within the clip user grabbed
    })
  }

  const handleMouseMove = (e) => {
    if (!dragging || !laneRef.current) return
    const laneRect = laneRef.current.getBoundingClientRect()
    const mouseXInLane = e.clientX - laneRect.left
    const rawBeat = (mouseXInLane - dragging.offsetX) / BEAT_WIDTH
    // Snap to nearest beat
    const snapped = Math.max(0, Math.round(rawBeat))
    setDragging((d) => ({ ...d, currentBeat: snapped }))
  }

  const handleMouseUp = () => {
    if (!dragging) return
    onMoveClip(track.id, dragging.clipId, dragging.currentBeat)
    setDragging(null)
  }

  return (
    <div className="flex items-stretch h-14 border-b border-studio-border group">
      {/* Track header */}
      <div
        className="flex items-center gap-2 px-3 shrink-0 border-r border-studio-border"
        style={{ width: RULER_WIDTH, background: '#111120' }}
      >
        <div className="w-2 h-full shrink-0 rounded-sm" style={{ background: track.color }} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-ui font-semibold text-studio-text truncate">{track.name}</div>
          <div className="text-xs text-studio-dim font-mono uppercase">{track.type}</div>
        </div>
        {/* Automation button — always visible so users can find it */}
        <div className="relative">
          <button
            onClick={() => setShowAutoMenu((v) => !v)}
            className={`w-5 h-5 rounded text-xs font-bold transition-colors ${
              hasAuto ? 'bg-studio-cyan text-black' : 'bg-studio-surface text-studio-dim hover:text-studio-cyan'
            }`}
            title="Add / manage automation lanes (volume, pan, EQ, FX)"
          >A</button>
          {showAutoMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowAutoMenu(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 bg-studio-panel border border-studio-border rounded-lg shadow-xl py-1 w-40">
                {AUTO_GROUPS.map((grp) => (
                  <div key={grp.label}>
                    <div className="px-3 pt-2 pb-0.5 text-xs font-mono text-studio-muted uppercase tracking-wider" style={{ fontSize: 8 }}>{grp.label}</div>
                    {grp.params.map((p) => (
                      <button
                        key={p}
                        onClick={() => { onAutoAdd(track.id, p); setShowAutoMenu(false) }}
                        className="w-full text-left px-3 py-1 text-xs font-ui hover:bg-white/5 text-studio-text"
                      >{AUTO_LABELS[p]}</button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* M / S / remove — visible on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onMute(track.id)}
            className={`w-5 h-5 rounded text-xs font-bold transition-colors ${
              track.muted ? 'bg-studio-orange text-black' : 'bg-studio-surface text-studio-dim hover:text-white'
            }`}
            title="Mute"
          >M</button>
          <button
            onClick={() => onSolo(track.id)}
            className={`w-5 h-5 rounded text-xs font-bold transition-colors ${
              track.solo ? 'bg-studio-yellow text-black' : 'bg-studio-surface text-studio-dim hover:text-white'
            }`}
            title="Solo"
          >S</button>
          <button
            onClick={() => onRemove(track.id)}
            className="w-5 h-5 rounded text-xs text-studio-dim hover:text-studio-red transition-colors bg-studio-surface"
            title="Remove"
          >✕</button>
        </div>
      </div>

      {/* Clip area */}
      <div
        ref={laneRef}
        className="flex-1 relative overflow-hidden select-none"
        style={{ background: '#0d0d18', cursor: dragging ? 'grabbing' : 'default' }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
        onDrop={(e) => {
          e.preventDefault()
          const sampleId = e.dataTransfer.getData('sampleId')
          const sampleName = e.dataTransfer.getData('sampleName')
          if (!sampleId || !laneRef.current) return
          const laneRect = laneRef.current.getBoundingClientRect()
          const beatPos = Math.max(0, Math.round((e.clientX - laneRect.left) / BEAT_WIDTH))
          onDropSample(track.id, sampleId, sampleName, beatPos)
        }}
      >
        {/* Beat grid lines */}
        <div className="absolute inset-0 flex pointer-events-none">
          {Array.from({ length: cols }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 border-r"
              style={{
                width: BEAT_WIDTH,
                borderColor: i % 4 === 3 ? '#252540' : '#161626',
              }}
            />
          ))}
        </div>

        {/* Clip blocks */}
        {track.clips.map((clip) => {
          const isDraggingThis = dragging?.clipId === clip.id
          const displayBeat = isDraggingThis ? dragging.currentBeat : clip.start
          const clipWidth = clip.length * BEAT_WIDTH

          return (
            <div
              key={clip.id}
              className="absolute top-1 bottom-1 rounded overflow-hidden group/clip"
              style={{
                left: displayBeat * BEAT_WIDTH,
                width: clipWidth,
                background: `${track.color}22`,
                border: `1.5px solid ${
                  isDraggingThis ? track.color : playingClipId === clip.id ? track.color : track.color + '55'
                }`,
                boxShadow: isDraggingThis
                  ? `0 0 16px ${track.color}80`
                  : playingClipId === clip.id
                  ? `0 0 10px ${track.color}60`
                  : 'none',
                cursor: dragging ? 'grabbing' : 'grab',
                opacity: isDraggingThis ? 0.85 : 1,
                zIndex: isDraggingThis ? 20 : 1,
                transition: isDraggingThis ? 'none' : 'left 0.05s',
              }}
              onMouseDown={(e) => handleDragStart(e, clip)}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Waveform */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 24">
                <path
                  d="M0,12 Q10,4 20,12 Q30,20 40,12 Q50,4 60,12 Q70,20 80,12 Q90,4 100,12"
                  stroke={track.color}
                  strokeWidth="1.5"
                  fill="none"
                  opacity={playingClipId === clip.id ? 0.9 : 0.5}
                />
              </svg>

              {/* Clip label */}
              <span
                className="absolute left-1 top-0.5 font-mono text-white/60 pointer-events-none"
                style={{ fontSize: 8 }}
              >{clip.name}</span>

              {/* Beat position indicator while dragging */}
              {isDraggingThis && (
                <div className="absolute bottom-0.5 right-1 font-mono text-white/80 pointer-events-none" style={{ fontSize: 8 }}>
                  bar {Math.floor(displayBeat / 4) + 1}.{(displayBeat % 4) + 1}
                </div>
              )}

              {/* Controls on hover */}
              <div
                className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover/clip:opacity-100 bg-black/50 transition-opacity"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {clip.url && (
                  <button
                    onClick={() => handleClipPlay(clip)}
                    className="w-5 h-5 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/40 text-white"
                    style={{ fontSize: 8 }}
                  >
                    {playingClipId === clip.id ? '■' : '▶'}
                  </button>
                )}
                <button
                  onClick={() => onRemoveClip(track.id, clip.id)}
                  className="w-5 h-5 rounded-full flex items-center justify-center bg-white/20 hover:bg-red-500/60 text-white"
                  style={{ fontSize: 8 }}
                >✕</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ArrangeView() {
  const {
    tracks, isPlaying, addTrack, removeTrack, toggleTrackMute, toggleTrackSolo,
    addClipToTrack, removeClipFromTrack, updateClipStart,
    automation, setTrackAutomation,
    setChannelVolume, setChannelPan, setChannelSend, updateChannelInsert,
  } = useStudioStore()

  const [showAddMenu, setShowAddMenu] = useState(false)
  const [trackPicker, setTrackPicker] = useState(null)
  // autoOpen: { [trackId]: string[] } — which params have visible lanes
  const [autoOpen, setAutoOpen] = useState({})

  const TRACK_PRESETS = [
    { name: 'Vocal',   type: 'audio', color: '#b44fff' },
    { name: 'Beat',    type: 'midi',  color: '#00e5ff' },
    { name: 'Bass',    type: 'audio', color: '#00ff9d' },
    { name: 'Guitar',  type: 'audio', color: '#ff9500' },
    { name: 'Keys',    type: 'midi',  color: '#ffe600' },
    { name: 'FX',      type: 'audio', color: '#ff2d55' },
    { name: 'Custom',  type: 'audio', color: '#888899' },
  ]

  const { waveformData, isRecording, recordings, playingId, playRecording, stopPlayback, deleteRecording, downloadRecording } = useAudio()
  const [showRecordings, setShowRecordings] = useState(false)
  const playheadRef = useRef(null)
  const [playheadX, setPlayheadX] = useState(0)
  const frameRef = useRef(null)
  const startTimeRef = useRef(null)

  useEffect(() => {
    const totalWidth = BEATS * BEAT_WIDTH
    if (isPlaying) {
      startTimeRef.current = performance.now() - playheadX * 8
      const animate = (now) => {
        const elapsed = now - startTimeRef.current
        const x = (elapsed / 8) % totalWidth
        setPlayheadX(x)
        frameRef.current = requestAnimationFrame(animate)
      }
      frameRef.current = requestAnimationFrame(animate)
    } else {
      cancelAnimationFrame(frameRef.current)
      if (!isPlaying) setPlayheadX(0)
    }
    return () => cancelAnimationFrame(frameRef.current)
  }, [isPlaying])

  // Apply automation to mixer channels as playhead moves
  useEffect(() => {
    if (!isPlaying) return
    const x = playheadX / (BEATS * BEAT_WIDTH)
    const { automation: auto, mixerChannels } = useStudioStore.getState()
    tracks.forEach((track) => {
      const ta = auto.tracks[track.id] || {}
      const ch = mixerChannels.find((c) => c.trackId === track.id)
      if (!ch) return

      // Volume (0-1 → 0-100)
      const volPts = ta['volume']
      if (volPts?.length > 0)
        setChannelVolume(ch.id, Math.round(lerpCurve(volPts, x, 1.0) * 100))

      // Pan (0-1 → -100 to +100)
      const panPts = ta['pan']
      if (panPts?.length > 0)
        setChannelPan(ch.id, Math.round((lerpCurve(panPts, x, 0.5) - 0.5) * 200))

      // Reverb send (0-1 → 0-100)
      const revPts = ta['reverb-send']
      if (revPts?.length > 0)
        setChannelSend(ch.id, 'reverb', Math.round(lerpCurve(revPts, x, 0) * 100))

      // Delay send (0-1 → 0-100)
      const dlyPts = ta['delay-send']
      if (dlyPts?.length > 0)
        setChannelSend(ch.id, 'delay', Math.round(lerpCurve(dlyPts, x, 0) * 100))

      // EQ band automation — targets first active EQ3 insert
      const eq3 = ch.inserts?.find((i) => i.type === 'EQ3' && !i.bypass)
      if (eq3) {
        let eqChanged = false
        const newParams = { ...eq3.params }
        ;['low', 'mid', 'high'].forEach((band) => {
          const pts = ta[`eq-${band}`]
          if (pts?.length > 0) {
            newParams[band] = Math.round((lerpCurve(pts, x, 0.5) - 0.5) * 24) // -12 to +12 dB
            eqChanged = true
          }
        })
        if (eqChanged) updateChannelInsert(ch.id, eq3.id, { params: newParams })
      }

      // Compressor threshold automation — targets first active Compressor insert
      const comp = ch.inserts?.find((i) => i.type === 'Compressor' && !i.bypass)
      if (comp) {
        const thPts = ta['comp-threshold']
        if (thPts?.length > 0) {
          const threshold = Math.round(lerpCurve(thPts, x, 0.667) * 60 - 60) // -60 to 0 dB
          updateChannelInsert(ch.id, comp.id, { params: { ...comp.params, threshold } })
        }
      }
    })
  }, [playheadX])

  const handleDropSample = (trackId, sampleId, sampleName, beatPos) => {
    const url = window.__sampleURLs?.[sampleId]
    if (!url) return
    addClipToTrack(trackId, {
      id: `sample-${sampleId}-${Date.now()}`,
      name: sampleName,
      url,
      start: beatPos,
      length: 8,
    })
  }

  // Listen for loop-library-add events and place clip on first track
  useEffect(() => {
    const handler = (e) => {
      const { sampleId, sampleName } = e.detail
      const url = window.__sampleURLs?.[sampleId]
      if (!url) return
      const { tracks: currentTracks } = useStudioStore.getState()
      if (!currentTracks.length) return
      const target = currentTracks[0]
      addClipToTrack(target.id, {
        id: `lib-${sampleId}-${Date.now()}`,
        name: sampleName,
        url,
        start: target.clips.length * 8,
        length: 8,
      })
    }
    window.addEventListener('loop-library-add', handler)
    return () => window.removeEventListener('loop-library-add', handler)
  }, [addClipToTrack])

  const handleAutoAdd = (trackId, param) => {
    setAutoOpen((prev) => {
      const cur = prev[trackId] || []
      if (cur.includes(param)) return prev
      return { ...prev, [trackId]: [...cur, param] }
    })
  }

  const handleAutoChange = (trackId, param, points) => {
    if (points === null) {
      // Remove lane
      setAutoOpen((prev) => ({
        ...prev,
        [trackId]: (prev[trackId] || []).filter((p) => p !== param),
      }))
      const { automation: auto } = useStudioStore.getState()
      const trackData = { ...(auto.tracks[trackId] || {}) }
      delete trackData[param]
      useStudioStore.setState((s) => {
        const tracks = { ...s.automation.tracks, [trackId]: trackData }
        const automation = { ...s.automation, tracks }
        return { automation }
      })
    } else {
      setTrackAutomation(trackId, param, points)
    }
  }

  // Close menus on outside click
  useEffect(() => {
    const close = () => { setShowAddMenu(false); setTrackPicker(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="flex flex-col h-full bg-studio-void">

      {/* Fixed-position track picker — rendered outside all overflow containers */}
      {trackPicker && (
        <div
          className="fixed z-[9999] bg-studio-panel border border-studio-border rounded-xl shadow-2xl overflow-hidden"
          style={{
            right: window.innerWidth - trackPicker.x + 4,
            bottom: window.innerHeight - trackPicker.y + 4,
            minWidth: 200,
            maxHeight: '50vh',
            overflowY: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-xs font-mono text-studio-dim border-b border-studio-border uppercase tracking-wider">
            Add "{trackPicker.rec.name}" to:
          </div>
          {tracks.length === 0 && (
            <div className="px-3 py-3 text-xs text-studio-dim font-ui">
              No tracks yet — use + Add Track first.
            </div>
          )}
          {tracks.map((t) => (
            <button
              key={t.id}
              onMouseDown={(e) => {
                e.stopPropagation()
                addClipToTrack(t.id, {
                  id: `${trackPicker.rec.id}-${Date.now()}`,
                  name: trackPicker.rec.name,
                  url: trackPicker.rec.url,
                  start: t.clips.length * 4,
                  length: 8,
                })
                setTrackPicker(null)
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-studio-surface text-left transition-colors"
            >
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: t.color, boxShadow: `0 0 6px ${t.color}80` }} />
              <span className="text-sm font-ui font-semibold text-studio-text">{t.name}</span>
              <span className="text-xs font-mono text-studio-dim ml-auto">{t.type}</span>
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-studio-panel border-b border-studio-border">
        {/* Add Track dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowAddMenu((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm font-ui font-semibold transition-colors ${
              showAddMenu
                ? 'bg-studio-cyan/10 border-studio-cyan text-studio-cyan'
                : 'bg-studio-surface border-studio-border text-studio-dim hover:border-studio-cyan hover:text-studio-cyan'
            }`}
          >
            <span className="text-base leading-none">+</span> Add Track
            <span className="text-xs opacity-60">▾</span>
          </button>

          {showAddMenu && (
            <div className="absolute top-full left-0 mt-1 bg-studio-panel border border-studio-border rounded-xl shadow-xl z-50 overflow-hidden min-w-44" onMouseDown={(e) => e.stopPropagation()}>
              <div className="px-3 py-2 text-xs font-mono text-studio-dim border-b border-studio-border uppercase tracking-wider">
                Track Type
              </div>
              {TRACK_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => {
                    addTrack(preset.name === 'Custom' ? null : preset)
                    setShowAddMenu(false)
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-studio-surface transition-colors text-left group/preset"
                >
                  <div
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ background: preset.color, boxShadow: `0 0 6px ${preset.color}80` }}
                  />
                  <span className="font-ui font-semibold text-sm text-studio-text">{preset.name}</span>
                  <span className="font-mono text-xs text-studio-dim ml-auto">{preset.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 ml-2">
          <span className="text-studio-dim text-xs font-mono">SNAP</span>
          <select className="bg-studio-void border border-studio-border rounded px-2 py-0.5 text-xs font-mono text-studio-text focus:outline-none focus:border-studio-cyan">
            {['1/4', '1/8', '1/16', '1/1'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div className="flex-1" />
        {isRecording && (
          <div className="flex items-center gap-1.5 text-studio-red text-xs font-mono rec-blink">
            <div className="w-2 h-2 rounded-full bg-studio-red" />
            RECORDING
          </div>
        )}
        <button
          onClick={() => setShowRecordings((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-ui font-semibold border transition-colors ${
            showRecordings
              ? 'bg-studio-purple/20 border-studio-purple text-studio-purple'
              : 'bg-studio-surface border-studio-border text-studio-dim hover:text-white hover:border-studio-purple'
          }`}
        >
          ▶ Recordings {recordings.length > 0 && <span className="bg-studio-purple text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">{recordings.length}</span>}
        </button>
        <span className="text-studio-dim text-xs font-mono">{tracks.length} tracks</span>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-auto relative">
        {/* Ruler */}
        <div className="sticky top-0 z-10 flex" style={{ background: '#111120', borderBottom: '1px solid #252540' }}>
          <div style={{ width: RULER_WIDTH, minWidth: RULER_WIDTH }} className="shrink-0 border-r border-studio-border" />
          <div className="flex" style={{ minWidth: BEATS * BEAT_WIDTH }}>
            {Array.from({ length: BEATS }).map((_, i) => (
              <div
                key={i}
                className="shrink-0 border-r border-studio-border flex items-end pb-0.5 pl-1"
                style={{ width: BEAT_WIDTH }}
              >
                {i % 4 === 0 && (
                  <span className="font-mono text-xs text-studio-dim">{Math.floor(i / 4) + 1}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Track lanes */}
        <div className="relative" style={{ minWidth: RULER_WIDTH + BEATS * BEAT_WIDTH }}>
          {tracks.map((track) => (
            <React.Fragment key={track.id}>
              <TrackLane
                track={track}
                onMute={toggleTrackMute}
                onSolo={toggleTrackSolo}
                onRemove={removeTrack}
                onRemoveClip={removeClipFromTrack}
                onMoveClip={updateClipStart}
                onAutoAdd={handleAutoAdd}
                hasAuto={!!(autoOpen[track.id]?.length)}
                onDropSample={handleDropSample}
              />
              {(autoOpen[track.id] || []).map((param) => (
                <AutoLaneRow
                  key={param}
                  trackId={track.id}
                  param={param}
                  points={(automation.tracks[track.id] || {})[param] || []}
                  onChange={(p, pts) => handleAutoChange(track.id, p, pts)}
                  color={track.color}
                  playheadX={isPlaying ? playheadX : -1}
                />
              ))}
            </React.Fragment>
          ))}

          {tracks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-studio-dim">
              <div className="text-4xl mb-3 opacity-30">♪</div>
              <div className="font-ui text-sm">No tracks yet. Click + Add Track to get started.</div>
            </div>
          )}

          {/* Playhead */}
          {isPlaying && (
            <div
              className="absolute top-0 bottom-0 w-0.5 z-20 pointer-events-none"
              style={{
                left: RULER_WIDTH + playheadX,
                background: 'linear-gradient(to bottom, #00e5ff, rgba(0,229,255,0.2))',
                boxShadow: '0 0 6px rgba(0,229,255,0.7)',
              }}
            />
          )}
        </div>
      </div>

      {/* Recordings panel */}
      {showRecordings && (
        <div className="border-t border-studio-border bg-studio-panel" style={{ maxHeight: 220, overflowY: 'auto' }}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-studio-border">
            <span className="font-display text-xs font-semibold text-studio-purple tracking-widest uppercase">Recordings</span>
            <span className="text-xs text-studio-dim font-mono">{recordings.length} take{recordings.length !== 1 ? 's' : ''}</span>
          </div>
          {recordings.length === 0 ? (
            <div className="px-4 py-6 text-center text-studio-dim text-xs font-ui">
              No recordings yet. Hit the record button to capture your voice.
            </div>
          ) : (
            <div className="flex flex-col">
              {recordings.map((rec) => {
                const isPlaying = playingId === rec.id
                return (
                  <div
                    key={rec.id}
                    className="flex items-center gap-3 px-4 py-2 border-b border-studio-border/50 hover:bg-studio-surface/50 group"
                  >
                    {/* Play / Stop button */}
                    <button
                      onClick={() => isPlaying ? stopPlayback() : playRecording(rec.id, rec.url)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        isPlaying
                          ? 'bg-studio-cyan text-black shadow-cyan'
                          : 'bg-studio-surface border border-studio-border text-studio-dim hover:border-studio-cyan hover:text-studio-cyan'
                      }`}
                    >
                      {isPlaying ? (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                          <rect x="1" y="1" width="3" height="8"/>
                          <rect x="6" y="1" width="3" height="8"/>
                        </svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                          <polygon points="2,1 9,5 2,9"/>
                        </svg>
                      )}
                    </button>

                    {/* Waveform bar (decorative) */}
                    <div className="flex-1 h-6 bg-studio-void rounded overflow-hidden relative">
                      <div
                        className="absolute inset-0 flex items-center"
                        style={{ padding: '0 4px' }}
                      >
                        <svg className="w-full h-full" viewBox="0 0 200 20" preserveAspectRatio="none">
                          <path
                            d="M0,10 Q20,2 40,10 Q60,18 80,10 Q100,2 120,10 Q140,18 160,10 Q180,2 200,10"
                            stroke={isPlaying ? '#00e5ff' : '#b44fff'}
                            strokeWidth="1.5"
                            fill="none"
                            opacity={isPlaying ? 1 : 0.5}
                          />
                        </svg>
                      </div>
                      {isPlaying && (
                        <div className="absolute inset-0 bg-studio-cyan/5 animate-pulse" />
                      )}
                    </div>

                    {/* Name + time */}
                    <div className="flex flex-col items-end shrink-0">
                      <span className="font-ui text-xs font-semibold text-studio-text">{rec.name}</span>
                      <span className="font-mono text-xs text-studio-dim">{rec.timestamp}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {/* Add to Track — opens fixed-position picker to escape overflow clipping */}
                      <button
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          if (trackPicker?.rec?.id === rec.id) {
                            setTrackPicker(null)
                            return
                          }
                          const rect = e.currentTarget.getBoundingClientRect()
                          setTrackPicker({ rec, x: rect.right, y: rect.top })
                          // y is stored as distance from bottom so picker opens upward
                        }}
                        className="px-2 py-1 rounded text-xs font-ui font-semibold border border-studio-cyan/40 text-studio-cyan bg-studio-cyan/10 hover:bg-studio-cyan/20 transition-colors whitespace-nowrap"
                      >
                        + Track
                      </button>
                      <button
                        onClick={() => downloadRecording(rec.id)}
                        className="w-7 h-7 rounded flex items-center justify-center bg-studio-surface border border-studio-border text-studio-dim hover:text-studio-green hover:border-studio-green transition-colors text-xs opacity-0 group-hover:opacity-100"
                        title="Download"
                      >↓</button>
                      <button
                        onClick={() => deleteRecording(rec.id)}
                        className="w-7 h-7 rounded flex items-center justify-center bg-studio-surface border border-studio-border text-studio-dim hover:text-studio-red hover:border-studio-red transition-colors text-xs opacity-0 group-hover:opacity-100"
                        title="Delete"
                      >✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Waveform monitor (shows during recording) */}
      {isRecording && (
        <div className="h-16 bg-studio-panel border-t border-studio-border px-4 py-2">
          <div className="text-xs font-mono text-studio-red mb-1 flex items-center gap-1.5">
            <span className="rec-blink">●</span> LIVE INPUT
          </div>
          <WaveformCanvas waveformData={waveformData} />
        </div>
      )}
    </div>
  )
}
