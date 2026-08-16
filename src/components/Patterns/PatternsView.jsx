import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useStudioStore } from '../../store/useStudioStore'
import { playDrum, getCtx, loadSample, getSampleName } from '../../audio/audioEngine'
import AutoCurveCanvas, { lerpCurve } from '../shared/AutoCurveCanvas'

/* ── Constants ─────────────────────────────────────────────────────── */
const INSTRUMENTS = [
  'Kick', 'Snare', 'HH-C', 'HH-O', 'Clap',
  'Tom-H', 'Tom-M', 'Tom-L',
  'Perc1', 'Perc2',
  'FX1', 'FX2',
  'Pad A', 'Pad B',
  'Smpl 1', 'Smpl 2',
]

const INST_COLORS = {
  Kick: '#00e5ff', Snare: '#ff2d55', 'HH-C': '#ffe600', 'HH-O': '#ff9500',
  Clap: '#b44fff',
  'Tom-H': '#00ff9d', 'Tom-M': '#00cc78', 'Tom-L': '#009955',
  Perc1: '#aaaacc', Perc2: '#7777aa',
  FX1: '#ff2d55', FX2: '#ccccee',
  'Pad A': '#b44fff', 'Pad B': '#8833bb',
  'Smpl 1': '#ffe600', 'Smpl 2': '#ff9500',
}

// Short display labels for narrow label column
const INST_LABEL = {
  'Tom-H': 'TomH', 'Tom-M': 'TomM', 'Tom-L': 'TomL',
  'Perc1': 'Prc1', 'Perc2': 'Prc2',
  'FX1': 'Laser', 'FX2': 'Crash',
  'Pad A': 'PadA', 'Pad B': 'PadB',
  'Smpl 1': 'Smp1', 'Smpl 2': 'Smp2',
}

const PAT_COLORS = ['#00e5ff', '#b44fff', '#00ff9d', '#ffe600', '#ff2d55', '#ff9500']
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const MEL_PITCHES = []
for (let oct = 5; oct >= 3; oct--) for (let n = 11; n >= 0; n--) MEL_PITCHES.push(oct * 12 + n)

const ROW_COLORS = ['#00e5ff', '#00ff9d', '#b44fff', '#ffe600', '#ff9500', '#ff2d55']
const ROW_NAMES  = ['Drums', 'Bass', 'Melody', 'Keys', 'Pad', 'Synth']

const isBlack = (m) => [1, 3, 6, 8, 10].includes(m % 12)
const mName   = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1)
const mFreq   = (m) => 440 * 2 ** ((m - 69) / 12)

let _ci = 0
const nextColor = () => PAT_COLORS[_ci++ % PAT_COLORS.length]

/* ── Beat editor ───────────────────────────────────────────────────── */
function BeatEditor({ pattern, currentStep, onToggle, onSetVelocity, showVelocity, loadedSamples, onLoadSample }) {
  const totalSteps = pattern.bars * 16
  const dragRef = useRef(null)

  const getVel = (inst, i) => ((pattern.velocities || {})[inst] || [])[i] ?? 80

  const handleMouseDown = (inst, i, e) => {
    e.preventDefault()
    const isOn = (pattern.steps[inst] || [])[i] ?? false

    if (!showVelocity || !isOn) {
      onToggle(inst, i)
      return
    }

    // Velocity drag on an active step
    const startY = e.clientY
    const startVel = getVel(inst, i)
    dragRef.current = { moved: false }

    const onMove = (me) => {
      const dy = startY - me.clientY
      if (Math.abs(dy) > 2) dragRef.current.moved = true
      onSetVelocity(inst, i, Math.max(1, Math.min(100, startVel + dy)))
    }
    const onUp = () => {
      if (dragRef.current && !dragRef.current.moved) onToggle(inst, i)
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const STEP_H = showVelocity ? 28 : 18

  return (
    <div className="flex flex-col gap-0.5">
      {INSTRUMENTS.map((inst) => {
        const raw   = pattern.steps[inst] || []
        const steps = Array(totalSteps).fill(false).map((_, i) => raw[i] ?? false)
        const col   = INST_COLORS[inst]
        const label = INST_LABEL[inst] || inst
        const isSample = inst === 'Smpl 1' || inst === 'Smpl 2'
        const sampleFile = loadedSamples[inst] || null

        return (
          <div key={inst} className="flex items-center gap-1">
            {/* Label */}
            <div className="shrink-0 flex items-center" style={{ width: 52 }}>
              {isSample ? (
                <label
                  className="flex items-center gap-0.5 cursor-pointer w-full"
                  title={sampleFile ? sampleFile : `Click 📁 to load a sample for ${inst}`}
                >
                  <input
                    type="file" accept="audio/*" className="hidden"
                    onChange={(e) => e.target.files[0] && onLoadSample(inst, e.target.files[0])}
                  />
                  <span className="font-mono truncate" style={{ fontSize: 8, color: sampleFile ? col : '#444466', width: 36 }}>
                    {sampleFile ? sampleFile.split('.')[0].slice(0, 6) : label}
                  </span>
                  <span style={{ fontSize: 9, color: sampleFile ? col : '#333355' }}>📁</span>
                </label>
              ) : (
                <button
                  className="text-right font-mono text-studio-dim hover:text-white transition-colors w-full"
                  style={{ fontSize: 9 }}
                  onClick={() => playDrum(inst)}
                  title={`Preview ${inst}`}
                >
                  {label}
                </button>
              )}
            </div>

            {/* Step buttons */}
            <div className="flex gap-px">
              {steps.map((on, i) => {
                const barDiv  = i > 0 && i % 16 === 0
                const beatDiv = i > 0 && i % 4 === 0 && !barDiv
                const isCur   = currentStep === i
                const vel     = getVel(inst, i)

                return (
                  <React.Fragment key={i}>
                    {barDiv  && <div className="w-px self-stretch bg-studio-border mx-0.5" />}
                    {beatDiv && <div className="w-px self-stretch bg-studio-border/40 mx-px" />}
                    <button
                      onMouseDown={(e) => handleMouseDown(inst, i, e)}
                      style={{
                        width: 18, height: STEP_H, borderRadius: 3,
                        position: 'relative', overflow: 'hidden', padding: 0, flexShrink: 0,
                        background: on
                          ? showVelocity ? '#0c0c1c' : (isCur ? '#ffffff' : col)
                          : (isCur ? '#222240' : '#161628'),
                        border: `1px solid ${on ? col + '99' : '#1e1e38'}`,
                        boxShadow: on && !showVelocity ? `0 0 5px ${col}60` : 'none',
                        cursor: showVelocity && on ? 'ns-resize' : 'pointer',
                        transition: 'background 80ms',
                      }}
                    >
                      {on && showVelocity && (
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0,
                          height: `${vel}%`,
                          background: isCur ? '#ffffff' : col,
                          boxShadow: `0 0 4px ${col}60`,
                        }} />
                      )}
                    </button>
                  </React.Fragment>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Melody editor ─────────────────────────────────────────────────── */
function MelodyEditor({ pattern, currentStep, onToggle }) {
  const totalSteps = pattern.bars * 16
  const notes = pattern.melodyNotes || []
  const hasNote = (pitch, step) => notes.some((n) => n.pitch === pitch && n.step === step)

  return (
    <div className="flex flex-col">
      {MEL_PITCHES.map((pitch) => {
        const black = isBlack(pitch)
        const isC   = pitch % 12 === 0
        const hue   = (pitch % 12) * 30
        return (
          <div key={pitch} className="flex items-center" style={{ height: 13 }}>
            <div
              className="shrink-0 flex items-center justify-end pr-0.5 border-r border-studio-border/40"
              style={{ width: 52, background: black ? '#080814' : (isC ? '#1a1a32' : '#101020') }}
            >
              <span className="font-mono" style={{ fontSize: 7, color: isC ? '#00e5ff' : black ? '#1e1e38' : '#333355' }}>
                {isC ? mName(pitch) : (black ? '♯' : '')}
              </span>
            </div>
            <div className="flex gap-px">
              {Array(totalSteps).fill(0).map((_, i) => {
                const barDiv  = i > 0 && i % 16 === 0
                const beatDiv = i > 0 && i % 4 === 0 && !barDiv
                const active  = hasNote(pitch, i)
                const isCur   = currentStep === i
                return (
                  <React.Fragment key={i}>
                    {barDiv  && <div className="w-px self-stretch bg-studio-border mx-0.5" />}
                    {beatDiv && <div className="w-px self-stretch bg-studio-border/30 mx-px" />}
                    <button
                      onClick={() => onToggle(pitch, i)}
                      style={{
                        width: 16, height: 12, borderRadius: 1,
                        background: active
                          ? isCur ? '#fff' : `hsl(${hue},62%,38%)`
                          : isCur ? '#1a1a34' : (black ? '#0c0c1c' : '#101022'),
                        border: `1px solid ${active ? `hsl(${hue},70%,52%)` : '#161630'}`,
                        boxShadow: active ? `0 0 4px hsl(${hue},70%,40%)` : 'none',
                      }}
                    />
                  </React.Fragment>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Song arrangement timeline ─────────────────────────────────────── */
const TOTAL_BARS = 32
const BAR_W      = 52
const ROW_H      = 38

function SongTimeline({ patterns, arrangement, selectedPatternId, onPlace, onRemove, onAddRow, onRemoveRow }) {
  const { blocks, rows } = arrangement

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-shrink-0 flex flex-col border-r border-studio-border" style={{ width: 96 }}>
        <div className="h-5 bg-studio-panel border-b border-studio-border" />
        <div className="flex-1 overflow-y-auto">
          {(rows || []).map((row) => (
            <div key={row.id}
              className="flex items-center gap-1.5 px-2 border-b border-studio-border bg-studio-panel"
              style={{ height: ROW_H }}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
              <span className="flex-1 font-mono text-studio-dim truncate" style={{ fontSize: 9 }}>{row.name}</span>
              <button
                onClick={() => onRemoveRow(row.id)}
                className="text-studio-muted hover:text-studio-red transition-colors"
                style={{ fontSize: 10, lineHeight: 1 }}
              >×</button>
            </div>
          ))}
          <div className="border-b border-studio-border bg-studio-panel px-2 py-1.5" style={{ height: ROW_H }}>
            <button
              onClick={onAddRow}
              className="w-full font-mono border border-dashed border-studio-border rounded px-1 py-0.5 text-studio-muted hover:text-white hover:border-studio-muted transition-colors"
              style={{ fontSize: 9 }}
            >+ Add Row</button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <div className="flex sticky top-0 z-10 h-5 bg-studio-panel border-b border-studio-border" style={{ minWidth: TOTAL_BARS * BAR_W }}>
          {Array(TOTAL_BARS).fill(0).map((_, i) => (
            <div key={i}
              className="flex items-center justify-center border-r border-studio-border/40 flex-shrink-0"
              style={{ width: BAR_W, background: i % 4 === 0 ? '#0e0e1e' : 'transparent' }}
            >
              {(i % 4 === 0 || i < 4) && (
                <span className="font-mono text-studio-muted" style={{ fontSize: 8 }}>{i + 1}</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ minWidth: TOTAL_BARS * BAR_W }}>
          {(rows || []).map((row) => {
            const rowBlocks = blocks.filter((b) => b.rowId === row.id)
            return (
              <div key={row.id} className="relative border-b border-studio-border" style={{ height: ROW_H }}>
                <div className="flex h-full absolute inset-0">
                  {Array(TOTAL_BARS).fill(0).map((_, bar) => (
                    <div
                      key={bar}
                      className="flex-shrink-0 h-full border-r cursor-pointer transition-colors hover:bg-studio-surface/25"
                      style={{ width: BAR_W, background: bar % 4 === 0 ? '#0d0d1c' : 'transparent', borderColor: '#1a1a30' }}
                      onClick={() => selectedPatternId && onPlace(selectedPatternId, row.id, bar)}
                    />
                  ))}
                </div>
                {rowBlocks.map((block) => {
                  const pat = patterns.find((p) => p.id === block.patternId)
                  if (!pat) return null
                  return (
                    <div
                      key={block.id}
                      className="absolute top-1 rounded flex items-center overflow-hidden cursor-pointer"
                      style={{
                        left: block.startBar * BAR_W + 1, width: pat.bars * BAR_W - 3, height: ROW_H - 8,
                        background: pat.color + '28', border: `1px solid ${pat.color}88`,
                      }}
                      onContextMenu={(e) => { e.preventDefault(); onRemove(block.id) }}
                      title={`${pat.name} — right-click to remove`}
                    >
                      <div className="w-1 h-full flex-shrink-0" style={{ background: pat.color }} />
                      <span className="font-mono text-white truncate px-1" style={{ fontSize: 8 }}>{pat.name}</span>
                      <span className="ml-auto mr-1 font-mono text-studio-muted flex-shrink-0" style={{ fontSize: 7 }}>
                        {pat.type === 'beats' ? '♩' : '♪'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
          <div className="flex border-b border-studio-border/30" style={{ height: ROW_H }}>
            {Array(TOTAL_BARS).fill(0).map((_, i) => (
              <div key={i} className="flex-shrink-0 h-full border-r border-studio-border/20" style={{ width: BAR_W, background: i % 4 === 0 ? '#0d0d1c' : 'transparent' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main view ─────────────────────────────────────────────────────── */
export default function PatternsView() {
  const {
    songPatterns, addSongPattern, deleteSongPattern, updateSongPattern,
    songArrangement, addArrangementBlock, removeArrangementBlock,
    addArrangementRow, removeArrangementRow,
    bpm, automation, setPatternAutomation,
  } = useStudioStore()

  const [selectedId,   setSelectedId]   = useState(null)
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [currentStep,  setCurrentStep]  = useState(-1)
  const [newName,      setNewName]      = useState('')
  const [renaming,     setRenaming]     = useState(null)
  const [showVelocity,  setShowVelocity]  = useState(false)
  const [showAutoPanel, setShowAutoPanel] = useState(false)
  const [loadedSamples, setLoadedSamples] = useState({})

  const timerRef      = useRef(null)
  const stepRef       = useRef(0)
  const selectedRef   = useRef(selectedId)
  const isPlayingRef  = useRef(false)
  const scheduleRef   = useRef(null)

  useEffect(() => { selectedRef.current = selectedId }, [selectedId])

  const selectedPattern = songPatterns.find((p) => p.id === selectedId)

  /* ── Playback — setTimeout chain with per-pattern swing ─────────── */
  useEffect(() => {
    clearTimeout(timerRef.current)
    if (!isPlaying) {
      isPlayingRef.current = false
      setCurrentStep(-1)
      return
    }
    isPlayingRef.current = true
    stepRef.current = 0

    const scheduleNext = () => {
      if (!isPlayingRef.current) return
      const { songPatterns: pats, bpm: liveBpm } = useStudioStore.getState()
      const pat = pats.find((p) => p.id === selectedRef.current)
      if (!pat) return

      const step  = stepRef.current
      const total = pat.bars * 16

      // Fire this step
      if (pat.type === 'beats') {
        const { automation: auto } = useStudioStore.getState()
        const volPts = (auto.patterns?.[pat.id] || {})['volume'] || []
        const autoVol = volPts.length > 0 ? lerpCurve(volPts, step / total, 1.0) : 1.0
        INSTRUMENTS.forEach((inst) => {
          if ((pat.steps[inst] || [])[step]) {
            const vel = ((pat.velocities || {})[inst] || [])[step] ?? 80
            playDrum(inst, (vel / 100) * autoVol)
          }
        })
      } else {
        const actx = getCtx()
        const stepMs = (60 / liveBpm / 4) * 1000
        ;(pat.melodyNotes || [])
          .filter((n) => n.step === step)
          .forEach(({ pitch }) => {
            const osc = actx.createOscillator()
            const env = actx.createGain()
            osc.connect(env); env.connect(actx.destination)
            osc.type = 'triangle'
            osc.frequency.value = mFreq(pitch)
            env.gain.setValueAtTime(0.18, actx.currentTime)
            env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + stepMs / 1000 * 0.88)
            osc.start(); osc.stop(actx.currentTime + stepMs / 1000)
          })
      }

      setCurrentStep(step)
      stepRef.current = (step + 1) % total

      // Swing timing: even steps hold longer, odd steps snap back
      // At swing=100 → classic triplet feel (4/3 / 2/3 of base step)
      const S       = (pat.swing || 0) / 100
      const baseMs  = (60 / liveBpm / 4) * 1000
      const delay   = step % 2 === 0
        ? baseMs * (1 + S * 0.333)
        : Math.max(10, baseMs * (1 - S * 0.333))

      timerRef.current = setTimeout(scheduleRef.current, delay)
    }

    scheduleRef.current = scheduleNext
    scheduleNext()

    return () => {
      isPlayingRef.current = false
      clearTimeout(timerRef.current)
    }
  }, [isPlaying])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  /* ── Keyboard spacebar ───────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space') return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      e.preventDefault()
      setIsPlaying((v) => (v ? false : !!selectedRef.current))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ── Pattern edits ───────────────────────────────────────────────── */
  const toggleStep = (inst, i) => {
    if (!selectedPattern) return
    const total = selectedPattern.bars * 16
    const cur   = selectedPattern.steps[inst] || []
    const arr   = Array(total).fill(false).map((_, j) => cur[j] ?? false)
    arr[i] = !arr[i]
    updateSongPattern(selectedId, { steps: { ...selectedPattern.steps, [inst]: arr } })
  }

  const setStepVelocity = (inst, i, vel) => {
    if (!selectedPattern) return
    const total  = selectedPattern.bars * 16
    const cur    = (selectedPattern.velocities || {})[inst] || []
    const arr    = Array(total).fill(80).map((_, j) => cur[j] ?? 80)
    arr[i] = Math.round(vel)
    updateSongPattern(selectedId, {
      velocities: { ...(selectedPattern.velocities || {}), [inst]: arr },
    })
  }

  const toggleMelody = (pitch, step) => {
    if (!selectedPattern) return
    const notes = selectedPattern.melodyNotes || []
    const has   = notes.some((n) => n.pitch === pitch && n.step === step)
    updateSongPattern(selectedId, {
      melodyNotes: has
        ? notes.filter((n) => !(n.pitch === pitch && n.step === step))
        : [...notes, { pitch, step }],
    })
  }

  const changeBars = (bars) => {
    if (!selectedPattern) return
    const newTotal = bars * 16
    const steps = {}
    const velocities = {}
    INSTRUMENTS.forEach((inst) => {
      const cs = selectedPattern.steps[inst] || []
      steps[inst] = Array(newTotal).fill(false).map((_, i) => cs[i] ?? false)
      const cv = (selectedPattern.velocities || {})[inst] || []
      velocities[inst] = Array(newTotal).fill(80).map((_, i) => cv[i] ?? 80)
    })
    const melodyNotes = (selectedPattern.melodyNotes || []).filter((n) => n.step < newTotal)
    updateSongPattern(selectedId, { bars, steps, velocities, melodyNotes })
    stepRef.current = 0
  }

  const handleAdd = (type) => {
    const name = newName.trim() || `${type === 'beats' ? '♩' : '♪'} Pat ${songPatterns.length + 1}`
    const id = addSongPattern(name, nextColor(), type)
    setSelectedId(id)
    setNewName('')
    setIsPlaying(false)
  }

  const handleLoadSample = async (slot, file) => {
    try {
      const name = await loadSample(slot, file)
      setLoadedSamples((prev) => ({ ...prev, [slot]: name }))
    } catch {}
  }

  const handleAddRow = () => {
    const idx = (songArrangement.rows?.length || 0) % ROW_NAMES.length
    addArrangementRow(ROW_NAMES[idx], ROW_COLORS[idx])
  }

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full bg-studio-void select-none overflow-hidden">

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-studio-panel border-b border-studio-border flex-shrink-0 flex-wrap">
        <span className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase">Patterns</span>
        <div className="w-px h-5 bg-studio-border" />

        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd('beats')}
          placeholder="Pattern name…"
          className="bg-studio-void border border-studio-border rounded px-2 py-0.5 text-xs font-mono text-studio-text placeholder-studio-muted focus:outline-none focus:border-studio-cyan w-32"
        />
        <button onClick={() => handleAdd('beats')}
          className="px-2 py-0.5 rounded text-xs font-mono border border-studio-border bg-studio-surface text-studio-dim hover:border-studio-cyan hover:text-studio-cyan transition-colors"
        >♩ Beats</button>
        <button onClick={() => handleAdd('melody')}
          className="px-2 py-0.5 rounded text-xs font-mono border border-studio-border bg-studio-surface text-studio-dim hover:border-studio-purple hover:text-studio-purple transition-colors"
        >♪ Melody</button>

        {selectedPattern && (
          <>
            <div className="w-px h-5 bg-studio-border" />

            {/* Play/Stop */}
            <button
              onClick={() => setIsPlaying((v) => !v)}
              className={`w-8 h-7 rounded flex items-center justify-center border transition-all ${
                isPlaying ? 'bg-studio-cyan border-studio-cyan text-black' : 'bg-studio-surface border-studio-border text-white hover:border-studio-cyan'
              }`}
              title="Play / Stop (Space)"
            >
              {isPlaying
                ? <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="3" height="8"/><rect x="6" y="1" width="3" height="8"/></svg>
                : <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9"/></svg>
              }
            </button>

            <div className="w-px h-5 bg-studio-border" />

            {/* Bars */}
            <div className="flex items-center gap-1">
              <span className="text-studio-dim text-xs font-mono">Bars:</span>
              {[1, 2, 4].map((b) => (
                <button key={b} onClick={() => changeBars(b)}
                  className={`w-6 h-6 rounded text-xs font-mono border transition-colors ${
                    selectedPattern.bars === b
                      ? 'bg-studio-surface border-studio-cyan text-studio-cyan'
                      : 'bg-studio-void border-studio-border text-studio-dim hover:text-white'
                  }`}
                >{b}</button>
              ))}
            </div>

            {/* Type */}
            {['beats', 'melody'].map((t) => (
              <button key={t}
                onClick={() => { setIsPlaying(false); updateSongPattern(selectedId, { type: t }) }}
                className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
                  selectedPattern.type === t
                    ? t === 'beats' ? 'bg-studio-cyan border-studio-cyan text-black' : 'bg-studio-purple border-studio-purple text-white'
                    : 'bg-studio-void border-studio-border text-studio-dim hover:text-white'
                }`}
              >{t === 'beats' ? '♩ Beats' : '♪ Melody'}</button>
            ))}

            {selectedPattern.type === 'beats' && (
              <>
                <div className="w-px h-5 bg-studio-border" />

                {/* Velocity toggle */}
                <button
                  onClick={() => setShowVelocity((v) => !v)}
                  className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
                    showVelocity
                      ? 'border-studio-yellow text-studio-yellow bg-studio-yellow/10'
                      : 'border-studio-border text-studio-dim hover:text-white'
                  }`}
                  title="Toggle velocity bars — drag up/down on any lit step"
                >
                  VEL
                </button>

                {/* Swing slider */}
                <div className="flex items-center gap-1.5">
                  <span className="text-studio-dim text-xs font-mono">Swing</span>
                  <input
                    type="range" min={0} max={100}
                    value={selectedPattern.swing ?? 0}
                    onChange={(e) => updateSongPattern(selectedId, { swing: Number(e.target.value) })}
                    className="w-20 accent-studio-cyan"
                    title="Swing amount — 0% straight, 100% full triplet feel"
                  />
                  <span className="font-mono text-studio-cyan" style={{ fontSize: 9, minWidth: 24 }}>
                    {selectedPattern.swing ?? 0}%
                  </span>
                </div>

                {/* Pattern automation toggle */}
                <button
                  onClick={() => setShowAutoPanel((v) => !v)}
                  className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
                    showAutoPanel
                      ? 'border-studio-green text-studio-green bg-studio-green/10'
                      : 'border-studio-border text-studio-dim hover:text-white'
                  }`}
                  title="Show / hide per-pattern automation curves"
                >≈ Auto</button>
              </>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isPlaying && (
            <span className="font-mono text-studio-cyan animate-pulse" style={{ fontSize: 9 }}>● PLAYING</span>
          )}
          <span className="text-studio-muted text-xs font-mono">
            {songPatterns.length} patterns · {(songArrangement.blocks || []).length} blocks
          </span>
        </div>
      </div>

      {/* ── Bank + Editor ─────────────────────────────────────────── */}
      <div className="flex min-h-0" style={{ flex: '1 1 0', minHeight: 0 }}>

        {/* Pattern bank */}
        <div className="flex flex-col bg-studio-panel border-r border-studio-border overflow-y-auto flex-shrink-0" style={{ width: 162 }}>
          <div className="px-2 py-1 border-b border-studio-border">
            <span className="font-mono text-studio-muted tracking-widest uppercase" style={{ fontSize: 7 }}>Pattern Bank</span>
          </div>

          {songPatterns.length === 0
            ? (
              <div className="flex-1 flex items-center justify-center p-3 text-center">
                <span className="text-studio-muted font-mono text-xs italic">No patterns yet.<br />Create one above ↑</span>
              </div>
            )
            : songPatterns.map((pat) => (
                <div
                  key={pat.id}
                  onClick={() => { setSelectedId(pat.id); setIsPlaying(false) }}
                  className={`group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer border-b border-studio-border/50 transition-colors ${
                    selectedId === pat.id ? 'bg-studio-surface' : 'hover:bg-studio-surface/40'
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: pat.color, boxShadow: selectedId === pat.id ? `0 0 5px ${pat.color}` : 'none' }}
                  />
                  {renaming === pat.id ? (
                    <input
                      autoFocus
                      defaultValue={pat.name}
                      onBlur={(e) => { updateSongPattern(pat.id, { name: e.target.value || pat.name }); setRenaming(null) }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur() }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-studio-void border border-studio-border rounded px-1 text-xs font-mono text-white focus:outline-none"
                    />
                  ) : (
                    <span className="flex-1 font-mono truncate" style={{ fontSize: 10, color: selectedId === pat.id ? '#fff' : '#7788aa' }}>
                      <span className="mr-0.5" style={{ color: pat.color }}>{pat.type === 'beats' ? '♩' : '♪'}</span>
                      {pat.name}
                    </span>
                  )}
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenaming(pat.id) }}
                      className="text-studio-muted hover:text-white transition-colors" style={{ fontSize: 9 }}
                    >✎</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (selectedId === pat.id) setSelectedId(null); deleteSongPattern(pat.id) }}
                      className="text-studio-muted hover:text-studio-red transition-colors" style={{ fontSize: 10 }}
                    >×</button>
                  </div>
                </div>
              ))
          }
        </div>

        {/* Pattern editor */}
        <div className="flex-1 overflow-auto p-3" style={{ minWidth: 0 }}>
          {!selectedPattern
            ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                <span className="text-4xl">♩</span>
                <span className="text-studio-dim font-mono text-sm">No pattern selected</span>
                <span className="text-studio-muted font-mono text-xs">Create a pattern above or click one in the bank</span>
              </div>
            )
            : (
              <div className="flex flex-col gap-3">
                {/* Pattern info */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="w-3 h-3 rounded-full" style={{ background: selectedPattern.color }} />
                  <span className="font-mono text-white">{selectedPattern.name}</span>
                  <span className="text-studio-dim font-mono text-xs">
                    {selectedPattern.bars} bar{selectedPattern.bars !== 1 ? 's' : ''} · {selectedPattern.bars * 16} steps · {bpm} BPM
                  </span>
                  {selectedPattern.type === 'beats' && showVelocity && (
                    <span className="text-studio-yellow font-mono text-xs">VEL — drag up/down on active steps</span>
                  )}
                  {selectedPattern.type === 'melody' && (
                    <span className="text-studio-muted font-mono text-xs">
                      {(selectedPattern.melodyNotes || []).length} note{(selectedPattern.melodyNotes || []).length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Playhead indicator */}
                {isPlaying && (
                  <div className="flex gap-0.5">
                    {Array(selectedPattern.bars * 16).fill(0).map((_, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && i % 16 === 0 && <div className="w-px bg-studio-border mx-0.5" />}
                        <div
                          className="rounded-full transition-all duration-75"
                          style={{
                            width: 4, height: 4,
                            background: currentStep === i ? '#00e5ff' : (i % 4 === 0 ? '#252545' : '#181830'),
                            boxShadow: currentStep === i ? '0 0 4px #00e5ff' : 'none',
                          }}
                        />
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {selectedPattern.type === 'beats'
                  ? (
                    <>
                      <BeatEditor
                        pattern={selectedPattern}
                        currentStep={isPlaying ? currentStep : -1}
                        onToggle={toggleStep}
                        onSetVelocity={setStepVelocity}
                        showVelocity={showVelocity}
                        loadedSamples={loadedSamples}
                        onLoadSample={handleLoadSample}
                      />
                      {showAutoPanel && (() => {
                        const total = selectedPattern.bars * 16
                        const stepW = 19
                        const autoW = total * stepW
                        const barMarkers = Array.from(
                          { length: selectedPattern.bars - 1 },
                          (_, i) => (i + 1) / selectedPattern.bars
                        )
                        return (
                          <div className="flex flex-col gap-2 mt-2 border-t border-studio-border/50 pt-2">
                            <span className="font-mono text-studio-dim tracking-widest uppercase" style={{ fontSize: 9 }}>
                              Pattern Automation
                            </span>
                            {['volume', 'pan'].map((param) => {
                              const pts = (automation.patterns?.[selectedId] || {})[param] || []
                              const phX = isPlaying ? currentStep * stepW : -1
                              return (
                                <div key={param} className="flex items-center gap-2">
                                  <span
                                    className="font-mono text-studio-dim uppercase shrink-0 text-right"
                                    style={{ fontSize: 9, width: 28 }}
                                  >{param === 'volume' ? 'Vol' : 'Pan'}</span>
                                  <AutoCurveCanvas
                                    points={pts}
                                    onChange={(p) => setPatternAutomation(selectedId, param, p)}
                                    color={selectedPattern.color}
                                    width={autoW}
                                    height={52}
                                    playheadX={phX}
                                    defaultValue={param === 'volume' ? 1.0 : 0.5}
                                    label={param}
                                    beatMarkers={barMarkers}
                                  />
                                </div>
                              )
                            })}
                            <span className="font-mono text-studio-muted" style={{ fontSize: 8 }}>
                              Click to add point · Right-click to delete · Drag to move
                            </span>
                          </div>
                        )
                      })()}
                    </>
                  )
                  : (
                    <MelodyEditor
                      pattern={selectedPattern}
                      currentStep={isPlaying ? currentStep : -1}
                      onToggle={toggleMelody}
                    />
                  )
                }
              </div>
            )
          }
        </div>
      </div>

      {/* ── Song arrangement ──────────────────────────────────────── */}
      <div className="flex flex-col border-t border-studio-border flex-shrink-0" style={{ height: 210 }}>
        <div className="flex items-center gap-3 px-4 py-1.5 bg-studio-panel border-b border-studio-border flex-shrink-0">
          <span className="font-mono text-xs font-semibold text-studio-dim tracking-widest uppercase">Song Arrangement</span>
          <div className="w-px h-4 bg-studio-border" />
          {selectedId
            ? <span className="text-studio-cyan text-xs font-mono">↓ Click bar to place <span style={{ color: songPatterns.find(p => p.id === selectedId)?.color }}>"{songPatterns.find(p => p.id === selectedId)?.name}"</span></span>
            : <span className="text-studio-muted text-xs font-mono">← Select a pattern to place it</span>
          }
          <span className="ml-auto text-studio-muted text-xs font-mono">Right-click block to remove</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <SongTimeline
            patterns={songPatterns}
            arrangement={songArrangement}
            selectedPatternId={selectedId}
            onPlace={addArrangementBlock}
            onRemove={removeArrangementBlock}
            onAddRow={handleAddRow}
            onRemoveRow={removeArrangementRow}
          />
        </div>
      </div>
    </div>
  )
}
