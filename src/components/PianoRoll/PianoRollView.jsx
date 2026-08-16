import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { useStudioStore } from '../../store/useStudioStore'
import { getCtx } from '../../audio/audioEngine'

/* ── Music / layout constants ────────────────────────────────────── */
const NOTES   = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const NOTE_MIN = 24    // C1
const NOTE_MAX = 107   // B7  (84 rows total)
const KEY_W    = 56    // piano-keys panel width
const ROW_H    = 14    // px per semitone
const VEL_H    = 72    // velocity lane height
const HDR_H    = 22    // time-ruler height

const isBlack  = (m) => [1,3,6,8,10].includes(m % 12)
const mName    = (m) => NOTES[m % 12] + (Math.floor(m / 12) - 1)
const mFreq    = (m) => 440 * 2 ** ((m - 69) / 12)

const CHORDS = {
  Maj:  [0,4,7],  Min:  [0,3,7],
  Maj7: [0,4,7,11], Min7: [0,3,7,10],
  Dom7: [0,4,7,10], Sus2: [0,2,7],
  Sus4: [0,5,7],  Dim:  [0,3,6], Aug: [0,4,8],
}
const QUANTS = { '1/4':1, '1/8':0.5, '1/16':0.25, '1/32':0.125 }

const SCALE_INTERVALS = {
  'Off':           null,
  'Major':         [0,2,4,5,7,9,11],
  'Minor':         [0,2,3,5,7,8,10],
  'Dorian':        [0,2,3,5,7,9,10],
  'Phrygian':      [0,1,3,5,7,8,10],
  'Lydian':        [0,2,4,6,7,9,11],
  'Mixolydian':    [0,2,4,5,7,9,10],
  'Harmonic Min':  [0,2,3,5,7,8,11],
  'Pentatonic Maj':[0,2,4,7,9],
  'Pentatonic Min':[0,3,5,7,10],
  'Blues':         [0,3,5,6,7,10],
}
const ROOT_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

let _nid = Date.now()
const genId = () => ++_nid

/* ── Canvas draw helpers ─────────────────────────────────────────── */
function drawKeys(ctx, W, H, scrollY, inKeySet) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, W, H)
  for (let m = NOTE_MIN; m <= NOTE_MAX; m++) {
    const y = (NOTE_MAX - m) * ROW_H - scrollY
    if (y + ROW_H < 0 || y > H) continue
    const inKey = inKeySet ? inKeySet.has(m % 12) : false
    if (!isBlack(m)) {
      ctx.fillStyle = inKey ? '#1a2240' : (m % 12 === 0 ? '#1e1e38' : '#16162a')
      ctx.fillRect(0, y, W, ROW_H)
      ctx.strokeStyle = '#252545'
      ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(0, y + ROW_H - 0.5); ctx.lineTo(W, y + ROW_H - 0.5); ctx.stroke()
      if (m % 12 === 0) {
        ctx.fillStyle = '#00e5ff'
        ctx.font = 'bold 9px monospace'
        ctx.fillText(mName(m), 4, y + ROW_H - 3)
      }
      if (inKey) {
        ctx.fillStyle = '#00ff9d'
        ctx.beginPath(); ctx.arc(W - 6, y + ROW_H / 2, 2.5, 0, Math.PI * 2); ctx.fill()
      }
    } else {
      ctx.fillStyle = inKey ? '#101c30' : '#080814'
      ctx.fillRect(0, y, W * 0.65, ROW_H)
      if (inKey) {
        ctx.fillStyle = '#00ff9d88'
        ctx.fillRect(1, y + 1, 3, ROW_H - 2)
      }
    }
  }
  // Right border
  ctx.strokeStyle = '#252545'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(W - 0.5, 0); ctx.lineTo(W - 0.5, H); ctx.stroke()
}

function drawRuler(ctx, W, scrollX, beatWidth, totalBeats) {
  ctx.clearRect(0, 0, W, HDR_H)
  ctx.fillStyle = '#0e0e1e'
  ctx.fillRect(0, 0, W, HDR_H)
  const s0 = Math.max(0, Math.floor(scrollX / beatWidth))
  const s1 = Math.min(totalBeats + 1, Math.ceil((scrollX + W) / beatWidth) + 1)
  for (let b = s0; b <= s1; b++) {
    const x = b * beatWidth - scrollX
    const isBar = b % 4 === 0
    if (isBar) {
      ctx.fillStyle = '#151530'
      ctx.fillRect(x, 0, beatWidth, HDR_H)
      ctx.fillStyle = '#7788aa'
      ctx.font = 'bold 9px monospace'
      ctx.fillText(`${Math.floor(b / 4) + 1}`, x + 3, HDR_H - 4)
    } else {
      ctx.fillStyle = '#555577'
      ctx.font = '8px monospace'
      ctx.fillText(`${(b % 4) + 1}`, x + 2, HDR_H - 4)
    }
    ctx.strokeStyle = isBar ? '#353568' : '#1e1e3a'
    ctx.lineWidth = isBar ? 1 : 0.5
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HDR_H); ctx.stroke()
  }
  // Bottom border
  ctx.strokeStyle = '#252545'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, HDR_H - 0.5); ctx.lineTo(W, HDR_H - 0.5); ctx.stroke()
}

function drawGrid(ctx, W, H, scrollX, scrollY, beatWidth, totalBeats, notes, playheadBeat, inKeySet) {
  ctx.clearRect(0, 0, W, H)
  // Row backgrounds
  for (let m = NOTE_MIN; m <= NOTE_MAX; m++) {
    const y = (NOTE_MAX - m) * ROW_H - scrollY
    if (y + ROW_H < 0 || y > H) continue
    const inKey = inKeySet ? inKeySet.has(m % 12) : null
    if (inKey === true) {
      ctx.fillStyle = isBlack(m) ? '#0f1228' : '#141530'
    } else if (inKey === false) {
      ctx.fillStyle = isBlack(m) ? '#080810' : '#0e0e1e'
    } else {
      ctx.fillStyle = isBlack(m) ? '#0d0d1e' : (m % 12 === 0 ? '#16162e' : '#121226')
    }
    ctx.fillRect(0, y, W, ROW_H)
    if (m % 12 === 0) {
      ctx.fillStyle = '#1e1e3a'
      ctx.fillRect(0, y, W, 1)
    }
    // In-key row: faint left-edge stripe
    if (inKey) {
      ctx.fillStyle = '#00ff9d18'
      ctx.fillRect(0, y, 2, ROW_H)
    }
  }
  // Beat grid
  const s0 = Math.max(0, Math.floor(scrollX / beatWidth))
  const s1 = Math.min(totalBeats + 1, Math.ceil((scrollX + W) / beatWidth) + 1)
  for (let b = s0; b <= s1; b++) {
    const x = b * beatWidth - scrollX
    const isBar = b % 4 === 0
    ctx.strokeStyle = isBar ? '#282850' : '#181830'
    ctx.lineWidth = isBar ? 1 : 0.5
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    // 16th subdivisions
    if (beatWidth > 40) {
      for (let sub = 1; sub < 4; sub++) {
        const sx = x + (sub / 4) * beatWidth
        if (sx > W) break
        ctx.strokeStyle = '#101025'
        ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke()
      }
    }
  }
  // Notes
  for (const note of notes) {
    const x  = note.start * beatWidth - scrollX
    const nw = Math.max(4, note.duration * beatWidth - 1)
    const y  = (NOTE_MAX - note.pitch) * ROW_H - scrollY
    if (x + nw < 0 || x > W || y + ROW_H < 0 || y > H) continue
    const hue = (note.pitch % 12) * 30
    const brightness = 32 + (note.velocity / 127) * 20
    // Note body
    ctx.fillStyle = `hsl(${hue},62%,${brightness}%)`
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x, y + 1, nw, ROW_H - 2, 2)
    else ctx.rect(x, y + 1, nw, ROW_H - 2)
    ctx.fill()
    // Border
    ctx.strokeStyle = `hsl(${hue},75%,${brightness + 22}%)`
    ctx.lineWidth = 1
    ctx.stroke()
    // Resize handle (right edge)
    ctx.fillStyle = `hsl(${hue},80%,70%)`
    ctx.fillRect(x + nw - 4, y + 2, 3, ROW_H - 4)
    // Note label
    if (nw > 20) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.font = '8px monospace'
      ctx.fillText(NOTES[note.pitch % 12], x + 3, y + ROW_H - 3)
    }
  }
  // Playhead
  if (playheadBeat >= 0) {
    const px = playheadBeat * beatWidth - scrollX
    if (px >= 0 && px <= W) {
      ctx.save()
      ctx.strokeStyle = '#00e5ff'
      ctx.lineWidth = 1.5
      ctx.shadowColor = '#00e5ff'
      ctx.shadowBlur = 6
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke()
      // Triangle at top
      ctx.fillStyle = '#00e5ff'
      ctx.beginPath(); ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 8); ctx.closePath(); ctx.fill()
      ctx.restore()
    }
  }
}

function drawVelocity(ctx, W, scrollX, beatWidth, notes, hoverId) {
  ctx.clearRect(0, 0, W, VEL_H)
  ctx.fillStyle = '#0a0a14'
  ctx.fillRect(0, 0, W, VEL_H)
  // Guide lines
  for (let v = 1; v <= 3; v++) {
    const gy = VEL_H - (v / 4) * (VEL_H - 4) - 2
    ctx.strokeStyle = '#1a1a30'
    ctx.lineWidth = 0.5
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
    ctx.setLineDash([])
  }
  for (const note of notes) {
    const x   = note.start * beatWidth - scrollX
    const barH = Math.max(2, (note.velocity / 127) * (VEL_H - 6))
    const nw  = Math.max(4, Math.min(20, note.duration * beatWidth - 2))
    if (x + nw < 0 || x > W) continue
    const hue = (note.pitch % 12) * 30
    const lit = note.id === hoverId
    ctx.fillStyle = lit ? `hsl(${hue},80%,60%)` : `hsl(${hue},55%,38%)`
    ctx.fillRect(x, VEL_H - barH - 2, nw - 1, barH)
    if (lit) {
      ctx.fillStyle = '#fff'
      ctx.font = '8px monospace'
      ctx.fillText(note.velocity, x, VEL_H - barH - 4)
    }
  }
  // Label
  ctx.fillStyle = '#444466'
  ctx.font = '8px monospace'
  ctx.fillText('VEL', 2, 10)
}

/* ── Main component ──────────────────────────────────────────────── */
export default function PianoRollView() {
  const {
    pianoRollNotes, addPRNote, removePRNote, updatePRNote, clearPRNotes, setPRNotes,
    patterns, addPattern, deletePattern,
    bpm,
  } = useStudioStore()

  // Canvas refs
  const keysRef   = useRef(null)
  const rulerRef  = useRef(null)
  const gridRef   = useRef(null)
  const velRef    = useRef(null)
  const wrapRef   = useRef(null)   // grid wrapper for sizing

  // Scroll in refs (no re-render on scroll, we redraw manually)
  const scrollRef = useRef({ x: 0, y: (NOTE_MAX - 72) * ROW_H })  // default: show around C4

  // UI state
  const [zoom,       setZoom]       = useState(1)
  const [quantize,   setQuantize]   = useState('1/16')
  const [chordMode,  setChordMode]  = useState(false)
  const [chordType,  setChordType]  = useState('Maj')
  const [chordOct,   setChordOct]   = useState(4)
  const [tool,       setTool]       = useState('draw')
  const [totalBars,  setTotalBars]  = useState(4)
  const [isPlaying,  setIsPlaying]  = useState(false)
  const [playhead,   setPlayhead]   = useState(0)
  const [patternName, setPatternName] = useState('')
  const [showPatterns, setShowPatterns] = useState(false)
  const [velHover,   setVelHover]   = useState(null)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 400 })
  const velDragRef   = useRef(null)
  const [scaleRoot, setScaleRoot] = useState(0)
  const [scaleType, setScaleType] = useState('Off')

  const inKeySet = useMemo(() => {
    const ivs = SCALE_INTERVALS[scaleType]
    if (!ivs) return null
    return new Set(ivs.map(i => (i + scaleRoot) % 12))
  }, [scaleRoot, scaleType])

  const beatWidth  = 80 * zoom
  const totalBeats = totalBars * 4

  // Playback & drag refs
  const playTimerRef = useRef(null)
  const playStartRef = useRef(0)
  const oscRef       = useRef([])
  const dragRef      = useRef(null)
  const rafRef       = useRef(null)

  // ── Resize canvas to container ─────────────────────────────────
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const update = () => setCanvasSize({ w: wrap.clientWidth, h: wrap.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // ── Live notes (store + any in-progress drag overlay) ──────────
  const getLiveNotes = useCallback(() => {
    if (!dragRef.current) return pianoRollNotes
    const { noteId, live } = dragRef.current
    return pianoRollNotes.map((n) => (n.id === noteId ? live : n))
  }, [pianoRollNotes])

  // ── Render all canvases ────────────────────────────────────────
  const renderAll = useCallback(() => {
    const { x: sx, y: sy } = scrollRef.current
    const { w: W, h: H } = canvasSize
    const notes = getLiveNotes()

    if (keysRef.current) drawKeys(keysRef.current.getContext('2d'), KEY_W, H, sy, inKeySet)
    if (rulerRef.current) drawRuler(rulerRef.current.getContext('2d'), W, sx, beatWidth, totalBeats)
    if (gridRef.current) drawGrid(gridRef.current.getContext('2d'), W, H, sx, sy, beatWidth, totalBeats, notes, isPlaying ? playhead : -1, inKeySet)
    if (velRef.current) drawVelocity(velRef.current.getContext('2d'), W, sx, beatWidth, notes, velHover)
  }, [pianoRollNotes, getLiveNotes, canvasSize, beatWidth, totalBeats, isPlaying, playhead, velHover, inKeySet])

  useEffect(() => { renderAll() }, [renderAll])

  // ── Playback ───────────────────────────────────────────────────
  const stopPlay = useCallback(() => {
    oscRef.current.forEach((o) => { try { o.stop() } catch (_) {} })
    oscRef.current = []
    clearInterval(playTimerRef.current)
    setIsPlaying(false)
  }, [])

  const startPlay = useCallback(() => {
    stopPlay()
    const actx = getCtx()
    const beatDur = 60 / bpm
    const t0 = actx.currentTime + 0.05
    const offset = playhead * beatDur

    pianoRollNotes.forEach((note) => {
      const start = t0 + note.start * beatDur - offset
      const dur   = note.duration * beatDur
      if (start < actx.currentTime) return
      const osc = actx.createOscillator()
      const env = actx.createGain()
      osc.connect(env); env.connect(actx.destination)
      osc.type = 'triangle'
      osc.frequency.value = mFreq(note.pitch)
      const vol = (note.velocity / 127) * 0.22
      env.gain.setValueAtTime(0, start)
      env.gain.linearRampToValueAtTime(vol, start + 0.01)
      env.gain.setValueAtTime(vol * 0.8, start + Math.max(0.01, dur - 0.04))
      env.gain.linearRampToValueAtTime(0.0001, start + dur)
      osc.start(start); osc.stop(start + dur + 0.02)
      oscRef.current.push(osc)
    })

    playStartRef.current = performance.now() - playhead * (60000 / bpm)
    setIsPlaying(true)
  }, [pianoRollNotes, bpm, playhead, stopPlay])

  useEffect(() => {
    if (!isPlaying) { clearInterval(playTimerRef.current); return }
    playTimerRef.current = setInterval(() => {
      const beat = (performance.now() - playStartRef.current) / (60000 / bpm)
      if (beat >= totalBeats) { stopPlay(); setPlayhead(0) }
      else setPlayhead(beat)
    }, 30)
    return () => clearInterval(playTimerRef.current)
  }, [isPlaying, bpm, totalBeats, stopPlay])

  // ── Velocity lane interaction ──────────────────────────────────
  const getVelAtY = (gy) => Math.max(1, Math.min(127, Math.round(((VEL_H - 2 - gy) / (VEL_H - 6)) * 126 + 1)))

  const handleVelDown = useCallback((e) => {
    const rect = velRef.current.getBoundingClientRect()
    const gx   = e.clientX - rect.left + scrollRef.current.x
    const beat  = gx / beatWidth
    const hit   = pianoRollNotes.find((n) => beat >= n.start && beat < n.start + n.duration)
    if (!hit) return
    const vel = getVelAtY(e.clientY - rect.top)
    updatePRNote(hit.id, { velocity: vel })
    setVelHover(hit.id)
    velDragRef.current = hit.id
  }, [pianoRollNotes, beatWidth, updatePRNote])

  const handleVelMove = useCallback((e) => {
    const rect = velRef.current?.getBoundingClientRect()
    if (!rect) return
    const gx = e.clientX - rect.left + scrollRef.current.x
    const beat = gx / beatWidth
    if (velDragRef.current) {
      const vel = getVelAtY(e.clientY - rect.top)
      updatePRNote(velDragRef.current, { velocity: vel })
    } else {
      const hit = pianoRollNotes.find((n) => beat >= n.start && beat < n.start + n.duration)
      setVelHover(hit ? hit.id : null)
    }
  }, [pianoRollNotes, beatWidth, updatePRNote])

  const handleVelUp = useCallback(() => { velDragRef.current = null }, [])

  // Space bar shortcut
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space') return
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return
      e.preventDefault()
      if (isPlaying) stopPlay(); else startPlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPlaying, startPlay, stopPlay])

  // ── Single-note preview (piano key click) ──────────────────────
  const previewNote = useCallback((pitch) => {
    const actx = getCtx()
    const osc = actx.createOscillator()
    const env = actx.createGain()
    osc.connect(env); env.connect(actx.destination)
    osc.type = 'triangle'
    osc.frequency.value = mFreq(pitch)
    env.gain.setValueAtTime(0.3, actx.currentTime)
    env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.5)
    osc.start(); osc.stop(actx.currentTime + 0.52)
  }, [])

  // ── Grid position helpers ──────────────────────────────────────
  const gridPos = (e) => {
    const rect = gridRef.current.getBoundingClientRect()
    const gx = e.clientX - rect.left + scrollRef.current.x
    const gy = e.clientY - rect.top  + scrollRef.current.y
    const rawBeat = gx / beatWidth
    const pitch   = NOTE_MAX - Math.floor(gy / ROW_H)
    const q       = QUANTS[quantize]
    const snapped = Math.max(0, Math.round(rawBeat / q) * q)
    return { rawBeat, snapped, pitch, q, clientX: e.clientX }
  }

  const hitNote = (rawBeat, pitch) =>
    pianoRollNotes.find((n) => n.pitch === pitch && rawBeat >= n.start && rawBeat < n.start + n.duration)

  // ── Grid mouse events ──────────────────────────────────────────
  const handleGridDown = (e) => {
    e.preventDefault()
    const { rawBeat, snapped, pitch, q, clientX } = gridPos(e)
    if (pitch < NOTE_MIN || pitch > NOTE_MAX) return

    const hit = hitNote(rawBeat, pitch)

    if (e.button === 2 || tool === 'erase') {
      if (hit) removePRNote(hit.id)
      return
    }

    if (hit) {
      // Check resize zone = last 5px
      const rect = gridRef.current.getBoundingClientRect()
      const endX = hit.start * beatWidth + hit.duration * beatWidth - scrollRef.current.x
      const isResize = endX - (clientX - rect.left) < 7
      dragRef.current = {
        type: isResize ? 'resize' : 'move',
        noteId: hit.id,
        live: { ...hit },
        orig: { ...hit },
        startRawBeat: rawBeat,
        startPitch: pitch,
      }
      return
    }

    // Place new note(s)
    if (chordMode) {
      const ivs = CHORDS[chordType] || [0]
      const base = chordOct * 12 + (pitch % 12)
      ivs.forEach((i) => {
        const p = base + i
        if (p >= NOTE_MIN && p <= NOTE_MAX)
          addPRNote({ id: genId(), pitch: p, start: snapped, duration: q * 4, velocity: 100 })
      })
    } else {
      const newNote = { id: genId(), pitch, start: snapped, duration: q * 4, velocity: 100 }
      addPRNote(newNote)
      previewNote(pitch)
      dragRef.current = { type: 'resize', noteId: newNote.id, live: { ...newNote }, orig: { ...newNote }, startRawBeat: snapped, newNote: true }
    }
  }

  const handleGridMove = (e) => {
    if (!dragRef.current) return
    const d = dragRef.current
    const { rawBeat, snapped, pitch, q } = gridPos(e)

    if (d.type === 'move') {
      const beatDelta  = Math.round((rawBeat - d.orig.start - (d.startRawBeat - d.orig.start)) / q) * q
      const pitchDelta = pitch - d.startPitch
      dragRef.current.live = {
        ...d.orig,
        start: Math.max(0, d.orig.start + beatDelta),
        pitch: Math.max(NOTE_MIN, Math.min(NOTE_MAX, d.orig.pitch + pitchDelta)),
      }
    } else {
      const newDur = Math.max(q, snapped - d.orig.start + q)
      dragRef.current.live = { ...d.orig, duration: newDur }
    }

    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(renderAll)
  }

  const handleGridUp = () => {
    if (!dragRef.current) return
    const { noteId, live } = dragRef.current
    updatePRNote(noteId, live)
    dragRef.current = null
  }

  const handleWheel = (e) => {
    e.preventDefault()
    const maxX = Math.max(0, totalBeats * beatWidth - canvasSize.w + 40)
    const maxY = Math.max(0, (NOTE_MAX - NOTE_MIN + 1) * ROW_H - canvasSize.h)
    if (e.shiftKey) {
      scrollRef.current.x = Math.max(0, Math.min(maxX, scrollRef.current.x + e.deltaY))
    } else {
      scrollRef.current.y = Math.max(0, Math.min(maxY, scrollRef.current.y + e.deltaY))
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(renderAll)
  }

  const handleKeysClick = (e) => {
    const rect = keysRef.current.getBoundingClientRect()
    const gy   = e.clientY - rect.top + scrollRef.current.y
    const pitch = NOTE_MAX - Math.floor(gy / ROW_H)
    if (pitch >= NOTE_MIN && pitch <= NOTE_MAX) previewNote(pitch)
  }

  // ── Pattern save / load ────────────────────────────────────────
  const savePattern = () => {
    if (!patternName.trim() || pianoRollNotes.length === 0) return
    addPattern(patternName.trim(), '#00e5ff', pianoRollNotes)
    setPatternName('')
  }

  const loadPattern = (p) => {
    if (!window.confirm(`Load "${p.name}"? This replaces current notes.`)) return
    setPRNotes(p.notes.map((n) => ({ ...n, id: genId() })))
    setShowPatterns(false)
  }

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full bg-studio-void select-none" onContextMenu={(e) => e.preventDefault()}>

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-studio-panel border-b border-studio-border flex-wrap">
        <span className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase">Piano Roll</span>
        <div className="w-px h-6 bg-studio-border" />

        {/* Transport */}
        <div className="flex gap-1">
          <button
            onClick={() => { stopPlay(); setPlayhead(0) }}
            className="w-7 h-7 rounded flex items-center justify-center bg-studio-surface border border-studio-border text-studio-dim hover:text-white transition-colors"
            title="Return to start"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <rect x="0" y="1" width="2" height="8"/><polygon points="9,1 2,5 9,9"/>
            </svg>
          </button>
          <button
            onClick={() => isPlaying ? stopPlay() : startPlay()}
            className={`w-9 h-7 rounded flex items-center justify-center border transition-all ${
              isPlaying
                ? 'bg-studio-cyan border-studio-cyan text-black'
                : 'bg-studio-surface border-studio-border text-white hover:border-studio-cyan'
            }`}
            title="Play / Pause (Space)"
          >
            {isPlaying ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="1" y="1" width="3" height="8"/><rect x="6" y="1" width="3" height="8"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <polygon points="2,1 9,5 2,9"/>
              </svg>
            )}
          </button>
        </div>

        <div className="w-px h-6 bg-studio-border" />

        {/* Draw / Erase tools */}
        {[['draw','✏ Draw'],['erase','⌫ Erase']].map(([t, lbl]) => (
          <button key={t} onClick={() => setTool(t)}
            className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
              tool === t
                ? 'bg-studio-cyan border-studio-cyan text-black'
                : 'bg-studio-surface border-studio-border text-studio-dim hover:text-white'
            }`}
          >{lbl}</button>
        ))}

        <div className="w-px h-6 bg-studio-border" />

        {/* Quantize */}
        <div className="flex items-center gap-1">
          <span className="text-studio-dim text-xs font-mono">Q:</span>
          <select value={quantize} onChange={(e) => setQuantize(e.target.value)}
            className="bg-studio-void border border-studio-border rounded px-1.5 py-0.5 text-xs font-mono text-studio-text focus:outline-none focus:border-studio-cyan"
          >
            {Object.keys(QUANTS).map((q) => <option key={q}>{q}</option>)}
          </select>
        </div>

        <div className="w-px h-6 bg-studio-border" />

        {/* Chord mode */}
        <button onClick={() => setChordMode((v) => !v)}
          className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
            chordMode
              ? 'bg-studio-purple border-studio-purple text-white'
              : 'bg-studio-surface border-studio-border text-studio-dim hover:text-white'
          }`}
        >♪ Chord</button>

        {chordMode && (
          <div className="flex items-center gap-1">
            <select value={chordType} onChange={(e) => setChordType(e.target.value)}
              className="bg-studio-void border border-studio-border rounded px-1.5 py-0.5 text-xs font-mono text-studio-text focus:outline-none focus:border-studio-purple"
            >
              {Object.keys(CHORDS).map((c) => <option key={c}>{c}</option>)}
            </select>
            <span className="text-studio-dim text-xs font-mono">Oct:</span>
            <button onClick={() => setChordOct((v) => Math.max(1, v - 1))} className="w-5 h-5 rounded bg-studio-surface border border-studio-border text-xs text-studio-dim hover:text-white">−</button>
            <span className="font-mono text-xs text-white w-4 text-center">{chordOct}</span>
            <button onClick={() => setChordOct((v) => Math.min(7, v + 1))} className="w-5 h-5 rounded bg-studio-surface border border-studio-border text-xs text-studio-dim hover:text-white">+</button>
          </div>
        )}

        <div className="w-px h-6 bg-studio-border" />

        {/* Scale / Key Assistant */}
        <div className="flex items-center gap-1">
          <span className="text-studio-dim text-xs font-mono">Key:</span>
          <select value={scaleType} onChange={(e) => setScaleType(e.target.value)}
            className="bg-studio-void border rounded px-1.5 py-0.5 text-xs font-mono text-studio-text focus:outline-none"
            style={{ borderColor: scaleType !== 'Off' ? '#00ff9d66' : '#252545' }}
          >
            {Object.keys(SCALE_INTERVALS).map((s) => <option key={s}>{s}</option>)}
          </select>
          {scaleType !== 'Off' && (
            <select value={scaleRoot} onChange={(e) => setScaleRoot(Number(e.target.value))}
              className="bg-studio-void rounded px-1.5 py-0.5 text-xs font-mono text-studio-text focus:outline-none"
              style={{ border: '1px solid #00ff9d66', color: '#00ff9d' }}
            >
              {ROOT_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
            </select>
          )}
        </div>

        <div className="w-px h-6 bg-studio-border" />

        {/* Bars */}
        <div className="flex items-center gap-1">
          <span className="text-studio-dim text-xs font-mono">Bars:</span>
          <select value={totalBars} onChange={(e) => setTotalBars(Number(e.target.value))}
            className="bg-studio-void border border-studio-border rounded px-1.5 py-0.5 text-xs font-mono text-studio-text focus:outline-none focus:border-studio-cyan"
          >
            {[1,2,4,8,16,32].map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <span className="text-studio-dim text-xs font-mono">Zoom:</span>
          <button onClick={() => setZoom((v) => Math.max(0.25, parseFloat((v - 0.25).toFixed(2))))}
            className="w-5 h-5 rounded bg-studio-surface border border-studio-border text-xs text-studio-dim hover:text-white">−</button>
          <span className="font-mono text-xs text-studio-cyan w-8 text-center">{zoom}x</span>
          <button onClick={() => setZoom((v) => Math.min(4, parseFloat((v + 0.25).toFixed(2))))}
            className="w-5 h-5 rounded bg-studio-surface border border-studio-border text-xs text-studio-dim hover:text-white">+</button>
        </div>

        <div className="flex-1" />

        {/* Save pattern */}
        <div className="flex items-center gap-1">
          <input
            value={patternName}
            onChange={(e) => setPatternName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && savePattern()}
            placeholder="Pattern name…"
            className="bg-studio-void border border-studio-border rounded px-2 py-0.5 text-xs font-mono text-studio-text placeholder-studio-muted focus:outline-none focus:border-studio-yellow w-28"
          />
          <button onClick={savePattern}
            disabled={!patternName.trim() || pianoRollNotes.length === 0}
            className="px-2 py-0.5 rounded text-xs font-mono border border-studio-border bg-studio-surface text-studio-dim hover:border-studio-yellow hover:text-studio-yellow transition-colors disabled:opacity-30"
          >Save</button>
          <button onClick={() => setShowPatterns((v) => !v)}
            className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
              showPatterns
                ? 'border-studio-yellow text-studio-yellow bg-studio-surface'
                : 'border-studio-border bg-studio-surface text-studio-dim hover:text-white'
            }`}
          >Patterns ({patterns.length})</button>
        </div>

        <button
          onClick={() => { if (pianoRollNotes.length && window.confirm('Clear all notes?')) clearPRNotes() }}
          className="px-2 py-0.5 rounded text-xs font-mono border border-studio-border bg-studio-surface text-studio-dim hover:border-studio-red hover:text-studio-red transition-colors"
        >Clear</button>
      </div>

      {/* ── Patterns panel ────────────────────────────────────────── */}
      {showPatterns && (
        <div className="flex items-center gap-2 px-4 py-2 bg-studio-surface/40 border-b border-studio-border flex-wrap">
          {patterns.length === 0
            ? <span className="text-studio-dim text-xs font-mono italic">No saved patterns yet — draw some notes and save.</span>
            : patterns.map((p) => (
                <div key={p.id} className="flex items-center gap-0.5">
                  <button
                    onClick={() => loadPattern(p)}
                    className="px-2 py-0.5 rounded-l text-xs font-mono border border-studio-border text-studio-text hover:text-studio-cyan transition-colors"
                    style={{ borderColor: p.color + '55' }}
                  >{p.name} <span className="text-studio-dim">({p.notes.length}♩)</span></button>
                  <button onClick={() => deletePattern(p.id)}
                    className="w-5 h-5 rounded-r text-studio-red text-xs border border-studio-border border-l-0 hover:bg-studio-red/20 flex items-center justify-center">×</button>
                </div>
              ))
          }
        </div>
      )}

      {/* ── Time ruler ────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0" style={{ height: HDR_H }}>
        <div style={{ width: KEY_W }} className="flex-shrink-0 bg-studio-panel border-r border-studio-border border-b border-studio-border" />
        <div className="flex-1 overflow-hidden">
          <canvas ref={rulerRef} width={canvasSize.w} height={HDR_H} className="block" />
        </div>
      </div>

      {/* ── Keys + Grid ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Piano keys */}
        <canvas
          ref={keysRef}
          width={KEY_W}
          height={canvasSize.h}
          className="flex-shrink-0 cursor-pointer"
          onClick={handleKeysClick}
        />

        {/* Note grid */}
        <div ref={wrapRef} className="flex-1 overflow-hidden">
          <canvas
            ref={gridRef}
            width={canvasSize.w}
            height={canvasSize.h}
            className="block"
            style={{ cursor: tool === 'erase' ? 'cell' : 'crosshair' }}
            onMouseDown={handleGridDown}
            onMouseMove={handleGridMove}
            onMouseUp={handleGridUp}
            onMouseLeave={handleGridUp}
            onWheel={handleWheel}
          />
        </div>
      </div>

      {/* ── Velocity lane ─────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 border-t border-studio-border" style={{ height: VEL_H }}>
        <div
          style={{ width: KEY_W }}
          className="flex items-center justify-center flex-shrink-0 bg-studio-panel border-r border-studio-border"
        >
          <span className="text-studio-dim font-mono"
            style={{ fontSize: 8, writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: 2 }}
          >VEL</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <canvas
            ref={velRef}
            width={canvasSize.w}
            height={VEL_H}
            className="block"
            style={{ cursor: 'ns-resize' }}
            onMouseDown={handleVelDown}
            onMouseMove={handleVelMove}
            onMouseUp={handleVelUp}
            onMouseLeave={() => { handleVelUp(); setVelHover(null) }}
          />
        </div>
      </div>

      {/* ── Status bar ────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-1 bg-studio-panel border-t border-studio-border flex-shrink-0">
        <span className="text-studio-dim text-xs font-mono">
          {pianoRollNotes.length} note{pianoRollNotes.length !== 1 ? 's' : ''}
        </span>
        <span className="text-studio-muted text-xs font-mono">·</span>
        <span className="text-studio-dim text-xs font-mono">Scroll: wheel · Shift+wheel = horizontal</span>
        <span className="text-studio-muted text-xs font-mono">·</span>
        <span className="text-studio-dim text-xs font-mono">Right-click = delete · Drag right edge = resize</span>
        {isPlaying && (
          <>
            <span className="text-studio-muted text-xs font-mono">·</span>
            <span className="text-studio-cyan text-xs font-mono">
              ▶ {Math.floor(playhead / 4) + 1}.{Math.floor(playhead % 4) + 1}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
