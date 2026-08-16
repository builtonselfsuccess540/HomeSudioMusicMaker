import React, { useState, useEffect, useRef, useCallback } from 'react'
import { playDrum } from '../../audio/audioEngine'

// ─── Kit presets ──────────────────────────────────────────────────
const DRUM_TYPES = [
  'Kick','Snare','HH-C','HH-O','Clap','Tom-H','Tom-M','Tom-L',
  'Perc1','Perc2','FX1','FX2','Pad A','Pad B','Pad C','Pad D',
]

const KITS = {
  '808 Classic': [
    { pitchSt: -3, decayMult: 1.8, pan: 0 },
    { pitchSt:  0, decayMult: 1.0, pan: 0 },
    { pitchSt:  2, decayMult: 0.6, pan:-0.3},
    { pitchSt:  0, decayMult: 2.5, pan: 0.3},
    { pitchSt: -1, decayMult: 1.2, pan: 0 },
    { pitchSt:  3, decayMult: 0.8, pan:-0.5},
    { pitchSt:  0, decayMult: 0.9, pan: 0 },
    { pitchSt: -3, decayMult: 1.5, pan: 0.5},
    { pitchSt:  5, decayMult: 0.5, pan:-0.2},
    { pitchSt: -2, decayMult: 0.7, pan: 0.2},
    { pitchSt:  7, decayMult: 0.4, pan:-0.4},
    { pitchSt: -5, decayMult: 1.0, pan: 0.4},
    { pitchSt: -12,decayMult: 2.0, pan: 0 },
    { pitchSt: -7, decayMult: 1.5, pan:-0.3},
    { pitchSt: -5, decayMult: 1.2, pan: 0.3},
    { pitchSt: -3, decayMult: 1.0, pan: 0 },
  ],
  'Trap': [
    { pitchSt: -6, decayMult: 2.5, pan: 0 },
    { pitchSt:  2, decayMult: 0.6, pan: 0 },
    { pitchSt:  5, decayMult: 0.3, pan:-0.4},
    { pitchSt:  3, decayMult: 3.0, pan: 0.4},
    { pitchSt:  1, decayMult: 0.5, pan: 0 },
    { pitchSt:  5, decayMult: 0.4, pan:-0.6},
    { pitchSt:  2, decayMult: 0.6, pan: 0 },
    { pitchSt: -4, decayMult: 1.2, pan: 0.6},
    { pitchSt:  7, decayMult: 0.3, pan:-0.3},
    { pitchSt:  4, decayMult: 0.4, pan: 0.3},
    { pitchSt: 12, decayMult: 0.2, pan:-0.5},
    { pitchSt: -3, decayMult: 0.8, pan: 0.5},
    { pitchSt: -5, decayMult: 1.5, pan: 0 },
    { pitchSt: -3, decayMult: 1.2, pan:-0.2},
    { pitchSt:  0, decayMult: 1.0, pan: 0.2},
    { pitchSt:  2, decayMult: 0.8, pan: 0 },
  ],
  'Lo-Fi': [
    { pitchSt: -2, decayMult: 1.0, pan: 0 },
    { pitchSt: -1, decayMult: 1.4, pan: 0.1},
    { pitchSt:  1, decayMult: 0.8, pan:-0.2},
    { pitchSt:  0, decayMult: 1.8, pan: 0.2},
    { pitchSt:  0, decayMult: 1.6, pan: 0 },
    { pitchSt:  2, decayMult: 1.1, pan:-0.4},
    { pitchSt:  1, decayMult: 1.0, pan: 0 },
    { pitchSt: -1, decayMult: 1.3, pan: 0.4},
    { pitchSt:  3, decayMult: 0.7, pan:-0.1},
    { pitchSt:  1, decayMult: 0.9, pan: 0.1},
    { pitchSt:  4, decayMult: 0.6, pan:-0.3},
    { pitchSt: -2, decayMult: 1.2, pan: 0.3},
    { pitchSt: -3, decayMult: 1.8, pan: 0 },
    { pitchSt: -2, decayMult: 1.4, pan:-0.2},
    { pitchSt:  0, decayMult: 1.2, pan: 0.2},
    { pitchSt:  1, decayMult: 1.0, pan: 0 },
  ],
  'Electronic': [
    { pitchSt:  0, decayMult: 1.2, pan: 0 },
    { pitchSt:  5, decayMult: 0.7, pan: 0 },
    { pitchSt:  7, decayMult: 0.4, pan:-0.3},
    { pitchSt:  5, decayMult: 2.0, pan: 0.3},
    { pitchSt:  3, decayMult: 0.8, pan: 0 },
    { pitchSt:  7, decayMult: 0.6, pan:-0.5},
    { pitchSt:  5, decayMult: 0.7, pan: 0 },
    { pitchSt:  2, decayMult: 1.0, pan: 0.5},
    { pitchSt: 10, decayMult: 0.4, pan:-0.2},
    { pitchSt:  7, decayMult: 0.5, pan: 0.2},
    { pitchSt: 14, decayMult: 0.3, pan:-0.4},
    { pitchSt:  2, decayMult: 0.9, pan: 0.4},
    { pitchSt:  0, decayMult: 1.0, pan: 0 },
    { pitchSt:  4, decayMult: 0.8, pan:-0.2},
    { pitchSt:  7, decayMult: 0.7, pan: 0.2},
    { pitchSt:  9, decayMult: 0.6, pan: 0 },
  ],
}

const KIT_NAMES = Object.keys(KITS)

// Keyboard mapping: rows Q-R, A-F, Z-V, 1-4
const KEY_MAP = {
  'q':0,'w':1,'e':2,'r':3,
  'a':4,'s':5,'d':6,'f':7,
  'z':8,'x':9,'c':10,'v':11,
  '1':12,'2':13,'3':14,'4':15,
}
const KEY_LABELS = ['Q','W','E','R','A','S','D','F','Z','X','C','V','1','2','3','4']

const PAD_COLORS = [
  '#ff2d55','#ff6b35','#ffe600','#00ff9d',
  '#00e5ff','#b44fff','#ff9500','#a8ff78',
  '#ff2d55','#ff6b35','#ffe600','#00ff9d',
  '#00e5ff','#b44fff','#ff9500','#a8ff78',
]

const STEPS = 16
const DEFAULT_BPM = 128

function makePadDefaults() {
  return Array.from({ length: 16 }, (_, i) => ({
    pitchSt: 0,
    decayMult: 1.0,
    volume: 0.8,
    pan: 0,
    muted: false,
  }))
}

function makeEmptySeq(bars = 1) {
  return Array.from({ length: 16 }, () =>
    Array.from({ length: bars * STEPS }, () => ({ on: false, vel: 0.8 }))
  )
}

// ─── Main component ───────────────────────────────────────────────
export default function BeatMakerView() {
  const [kit, setKit] = useState('808 Classic')
  const [bpm, setBpm] = useState(DEFAULT_BPM)
  const [bars, setBars] = useState(1)
  const [swing, setSwing] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(-1)
  const [seq, setSeq] = useState(() => makeEmptySeq(1))
  const [padDefs, setPadDefs] = useState(makePadDefaults)
  const [selectedPad, setSelectedPad] = useState(0)
  const [activeKeys, setActiveKeys] = useState(new Set())
  const [recording, setRecording] = useState(false)

  // Refs for scheduler
  const intervalRef = useRef(null)
  const stepRef = useRef(-1)
  const seqRef = useRef(seq)
  const padDefsRef = useRef(padDefs)
  const bpmRef = useRef(bpm)
  const swingRef = useRef(swing)
  const barsRef = useRef(bars)
  const recordingRef = useRef(recording)

  useEffect(() => { seqRef.current = seq }, [seq])
  useEffect(() => { padDefsRef.current = padDefs }, [padDefs])
  useEffect(() => { bpmRef.current = bpm }, [bpm])
  useEffect(() => { swingRef.current = swing }, [swing])
  useEffect(() => { barsRef.current = bars }, [bars])
  useEffect(() => { recordingRef.current = recording }, [recording])

  // ─── Pad triggering ─────────────────────────────────────────────
  const triggerPad = useCallback((padIdx, vel = 0.9) => {
    const pd = padDefsRef.current[padIdx]
    if (pd.muted) return
    const kitDef = KITS[kit][padIdx]
    playDrum(DRUM_TYPES[padIdx], vel * pd.volume, {
      pitchSt: kitDef.pitchSt + pd.pitchSt,
      decayMult: kitDef.decayMult * pd.decayMult,
      pan: Math.max(-1, Math.min(1, kitDef.pan + pd.pan)),
    })
  }, [kit])

  // ─── Sequencer scheduler ────────────────────────────────────────
  const startSeq = useCallback(() => {
    if (intervalRef.current) return
    stepRef.current = -1
    const tick = () => {
      const totalSteps = barsRef.current * STEPS
      const nextStep = (stepRef.current + 1) % totalSteps
      stepRef.current = nextStep
      setStep(nextStep)

      // Play all active pads on this step
      const s = seqRef.current
      for (let p = 0; p < 16; p++) {
        const cell = s[p]?.[nextStep]
        if (cell?.on) triggerPad(p, cell.vel)
      }
    }

    // Swing-aware scheduling
    const schedule = () => {
      const totalSteps = barsRef.current * STEPS
      const nextStep = (stepRef.current + 1) % totalSteps
      const base = (60000 / bpmRef.current) / 4
      const isOdd = nextStep % 2 === 1
      const delay = isOdd ? base * (1 + swingRef.current * 0.5) : base * (1 - swingRef.current * 0.25)
      stepRef.current = nextStep
      setStep(nextStep)
      const s = seqRef.current
      for (let p = 0; p < 16; p++) {
        const cell = s[p]?.[nextStep]
        if (cell?.on) triggerPad(p, cell.vel)
      }
      intervalRef.current = setTimeout(schedule, delay)
    }

    stepRef.current = -1
    intervalRef.current = setTimeout(schedule, 0)
  }, [triggerPad])

  const stopSeq = useCallback(() => {
    clearTimeout(intervalRef.current)
    intervalRef.current = null
    setStep(-1)
    stepRef.current = -1
  }, [])

  const togglePlay = useCallback(() => {
    if (playing) { stopSeq(); setPlaying(false) }
    else { startSeq(); setPlaying(true) }
  }, [playing, startSeq, stopSeq])

  useEffect(() => () => stopSeq(), [stopSeq])

  // ─── Bars change — resize seq ────────────────────────────────────
  useEffect(() => {
    setSeq((prev) => {
      const newLen = bars * STEPS
      return prev.map((row) => {
        if (row.length === newLen) return row
        if (row.length > newLen) return row.slice(0, newLen)
        return [...row, ...Array.from({ length: newLen - row.length }, () => ({ on: false, vel: 0.8 }))]
      })
    })
  }, [bars])

  // ─── Keyboard input ─────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e) => {
      if (e.repeat || e.target.tagName === 'INPUT') return
      const padIdx = KEY_MAP[e.key.toLowerCase()]
      if (padIdx === undefined) return
      setActiveKeys((s) => new Set([...s, padIdx]))
      triggerPad(padIdx, 0.9)

      // Real-time record: stamp into nearest step
      if (recordingRef.current && stepRef.current >= 0) {
        const cur = stepRef.current
        setSeq((prev) => {
          const next = prev.map((r) => r.map((c) => ({ ...c })))
          next[padIdx][cur] = { on: true, vel: 0.9 }
          return next
        })
      }
    }
    const onUp = (e) => {
      const padIdx = KEY_MAP[e.key.toLowerCase()]
      if (padIdx !== undefined) setActiveKeys((s) => { const n = new Set(s); n.delete(padIdx); return n })
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [triggerPad])

  // ─── Seq cell toggle ────────────────────────────────────────────
  const toggleCell = (padIdx, stepIdx) => {
    setSeq((prev) => {
      const next = prev.map((r) => r.map((c) => ({ ...c })))
      const cell = next[padIdx][stepIdx]
      next[padIdx][stepIdx] = cell.on ? { on: false, vel: 0.8 } : { on: true, vel: 0.8 }
      return next
    })
  }

  const clearAll = () => setSeq(makeEmptySeq(bars))

  const updatePad = (field, value, idx = selectedPad) => {
    setPadDefs((prev) => {
      const next = prev.map((p) => ({ ...p }))
      next[idx][field] = value
      return next
    })
  }

  const pd = padDefs[selectedPad]
  const kitDef = KITS[kit][selectedPad]
  const totalSteps = bars * STEPS

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#0a0a14', color: '#e0e0e0' }}>
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0" style={{ borderColor: '#1e1e2e', background: '#0d0d1a' }}>
        <span className="font-display text-sm tracking-widest uppercase" style={{ background: 'linear-gradient(90deg,#ff2d55,#ff9500)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Beat Maker
        </span>
        <div className="w-px h-4" style={{ background: '#1e1e2e' }} />

        {/* Kit */}
        <select
          value={kit}
          onChange={(e) => setKit(e.target.value)}
          className="text-xs px-2 py-1 rounded font-ui"
          style={{ background: '#1a1a2e', border: '1px solid #2e2e4e', color: '#e0e0e0' }}
        >
          {KIT_NAMES.map((k) => <option key={k}>{k}</option>)}
        </select>

        {/* BPM */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono" style={{ color: '#666' }}>BPM</span>
          <input
            type="number" min={60} max={240} value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-14 text-xs text-center px-1 py-1 rounded font-mono"
            style={{ background: '#1a1a2e', border: '1px solid #2e2e4e', color: '#ffe600' }}
          />
        </div>

        {/* Bars */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono" style={{ color: '#666' }}>Bars</span>
          {[1, 2].map((b) => (
            <button
              key={b}
              onClick={() => setBars(b)}
              className="text-xs px-2 py-1 rounded font-ui transition-all"
              style={{ background: bars === b ? '#ff2d55' : '#1a1a2e', border: '1px solid #2e2e4e', color: bars === b ? '#fff' : '#999' }}
            >{b}</button>
          ))}
        </div>

        {/* Swing */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono" style={{ color: '#666' }}>Swing</span>
          <input
            type="range" min={0} max={1} step={0.01} value={swing}
            onChange={(e) => setSwing(Number(e.target.value))}
            className="w-20 accent-orange-400"
          />
          <span className="text-xs font-mono w-8" style={{ color: '#ff9500' }}>{Math.round(swing * 100)}%</span>
        </div>

        <div className="flex-1" />

        {/* Record */}
        <button
          onClick={() => setRecording((r) => !r)}
          className="text-xs px-3 py-1 rounded font-ui font-semibold transition-all"
          style={{
            background: recording ? 'rgba(255,45,85,0.3)' : '#1a1a2e',
            border: `1px solid ${recording ? '#ff2d55' : '#2e2e4e'}`,
            color: recording ? '#ff2d55' : '#666',
            boxShadow: recording ? '0 0 8px rgba(255,45,85,0.4)' : 'none',
          }}
        >
          {recording ? '⏺ REC' : '⏺ REC'}
        </button>

        {/* Clear */}
        <button
          onClick={clearAll}
          className="text-xs px-3 py-1 rounded font-ui transition-all"
          style={{ background: '#1a1a2e', border: '1px solid #2e2e4e', color: '#666' }}
        >
          Clear
        </button>

        {/* Play/Stop */}
        <button
          onClick={togglePlay}
          className="text-sm px-4 py-1 rounded font-ui font-bold transition-all"
          style={{
            background: playing ? 'rgba(0,229,255,0.15)' : 'rgba(0,255,157,0.15)',
            border: `1px solid ${playing ? '#00e5ff' : '#00ff9d'}`,
            color: playing ? '#00e5ff' : '#00ff9d',
            boxShadow: playing ? '0 0 10px rgba(0,229,255,0.3)' : 'none',
          }}
        >
          {playing ? '■ Stop' : '▶ Play'}
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Pad grid ── */}
        <div className="flex flex-col justify-center p-4 gap-2 shrink-0" style={{ width: 260 }}>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            {Array.from({ length: 16 }, (_, i) => {
              const isActive = activeKeys.has(i)
              const isSelected = selectedPad === i
              const color = PAD_COLORS[i]
              return (
                <button
                  key={i}
                  onMouseDown={() => { setSelectedPad(i); triggerPad(i, 0.9) }}
                  className="relative flex flex-col items-center justify-center rounded-lg font-ui font-bold select-none transition-all"
                  style={{
                    height: 56,
                    background: isActive
                      ? `${color}55`
                      : isSelected
                      ? `${color}22`
                      : '#111120',
                    border: `2px solid ${isSelected ? color : isActive ? color : '#1e1e3e'}`,
                    boxShadow: isActive ? `0 0 14px ${color}88` : isSelected ? `0 0 6px ${color}44` : 'none',
                    color: isActive ? '#fff' : color,
                    fontSize: 11,
                  }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }}>{KEY_LABELS[i]}</span>
                  <span style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>{DRUM_TYPES[i]}</span>
                  {padDefs[i].muted && (
                    <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: '#ff2d55' }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Keyboard hint */}
          <div className="text-center mt-1">
            <span className="font-mono text-xs" style={{ color: '#333' }}>keyboard: Q-R / A-F / Z-V / 1-4</span>
          </div>
        </div>

        {/* ── Center: sequencer ── */}
        <div className="flex-1 flex flex-col overflow-hidden py-2 px-2">
          {/* Beat numbers */}
          <div className="flex items-center mb-1 shrink-0" style={{ paddingLeft: 72 }}>
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className="flex items-center justify-center font-mono shrink-0"
                style={{
                  width: `calc(${100 / totalSteps}%)`,
                  fontSize: 9,
                  color: i % 4 === 0 ? '#555' : '#333',
                  borderLeft: i % 4 === 0 ? '1px solid #1e1e2e' : 'none',
                  height: 14,
                }}
              >
                {i % 4 === 0 ? i / 4 + 1 : ''}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-px">
            {DRUM_TYPES.map((type, padIdx) => {
              const color = PAD_COLORS[padIdx]
              const isSel = selectedPad === padIdx
              return (
                <div key={padIdx} className="flex items-center shrink-0" style={{ height: 26 }}>
                  {/* Label */}
                  <button
                    onClick={() => setSelectedPad(padIdx)}
                    className="font-ui text-xs shrink-0 text-right pr-2 hover:opacity-100 transition-opacity"
                    style={{ width: 56, color: isSel ? color : '#555', opacity: isSel ? 1 : 0.7 }}
                  >
                    {type}
                  </button>
                  {/* Mute button */}
                  <button
                    onClick={() => updatePad('muted', !padDefs[padIdx].muted, padIdx)}
                    className="shrink-0 w-4 h-4 rounded-sm flex items-center justify-center mr-1 font-mono text-xs"
                    style={{
                      background: padDefs[padIdx].muted ? '#ff2d5533' : 'transparent',
                      border: `1px solid ${padDefs[padIdx].muted ? '#ff2d55' : '#1e1e2e'}`,
                      color: padDefs[padIdx].muted ? '#ff2d55' : '#333',
                      fontSize: 8,
                    }}
                    title="Mute"
                  >M</button>
                  {/* Steps */}
                  <div className="flex flex-1">
                    {Array.from({ length: totalSteps }, (_, sIdx) => {
                      const cell = seq[padIdx]?.[sIdx]
                      const isOn = cell?.on
                      const isCur = step === sIdx
                      const isGroup = Math.floor(sIdx / 4) % 2 === 0
                      return (
                        <button
                          key={sIdx}
                          onClick={() => toggleCell(padIdx, sIdx)}
                          className="flex-1 transition-all rounded-sm mx-px"
                          style={{
                            height: 22,
                            background: isCur && playing
                              ? isOn ? color : `${color}33`
                              : isOn
                              ? `${color}cc`
                              : isGroup ? '#131320' : '#0f0f1c',
                            border: `1px solid ${isOn ? `${color}66` : '#1a1a2a'}`,
                            boxShadow: isOn && isCur ? `0 0 6px ${color}` : 'none',
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right: per-pad controls ── */}
        <div className="flex flex-col gap-3 px-4 py-3 shrink-0 border-l" style={{ width: 200, borderColor: '#1e1e2e', background: '#0d0d1a' }}>
          <div className="text-xs font-ui font-semibold" style={{ color: PAD_COLORS[selectedPad] }}>
            Pad {selectedPad + 1} — {DRUM_TYPES[selectedPad]}
          </div>

          {/* Pitch */}
          <PadKnob
            label="Pitch"
            unit="st"
            value={pd.pitchSt}
            min={-12} max={12} step={1}
            color={PAD_COLORS[selectedPad]}
            onChange={(v) => updatePad('pitchSt', v)}
            display={`${pd.pitchSt > 0 ? '+' : ''}${pd.pitchSt}`}
          />

          {/* Decay */}
          <PadKnob
            label="Decay"
            unit="×"
            value={pd.decayMult}
            min={0.25} max={4.0} step={0.05}
            color={PAD_COLORS[selectedPad]}
            onChange={(v) => updatePad('decayMult', parseFloat(v.toFixed(2)))}
            display={`${pd.decayMult.toFixed(2)}×`}
          />

          {/* Volume */}
          <PadKnob
            label="Volume"
            unit=""
            value={pd.volume}
            min={0} max={1} step={0.01}
            color={PAD_COLORS[selectedPad]}
            onChange={(v) => updatePad('volume', parseFloat(v.toFixed(2)))}
            display={`${Math.round(pd.volume * 100)}%`}
          />

          {/* Pan */}
          <PadKnob
            label="Pan"
            unit=""
            value={pd.pan}
            min={-1} max={1} step={0.02}
            color={PAD_COLORS[selectedPad]}
            onChange={(v) => updatePad('pan', parseFloat(v.toFixed(2)))}
            display={pd.pan === 0 ? 'C' : pd.pan < 0 ? `L${Math.round(-pd.pan * 100)}` : `R${Math.round(pd.pan * 100)}`}
          />

          <div className="h-px" style={{ background: '#1e1e2e' }} />

          {/* Mute toggle */}
          <button
            onClick={() => updatePad('muted', !pd.muted)}
            className="text-xs py-1.5 rounded font-ui transition-all"
            style={{
              background: pd.muted ? 'rgba(255,45,85,0.2)' : '#1a1a2e',
              border: `1px solid ${pd.muted ? '#ff2d55' : '#2e2e4e'}`,
              color: pd.muted ? '#ff2d55' : '#666',
            }}
          >
            {pd.muted ? 'Muted' : 'Mute'}
          </button>

          {/* Reset pad */}
          <button
            onClick={() => {
              setPadDefs((prev) => {
                const next = prev.map((p) => ({ ...p }))
                next[selectedPad] = { pitchSt: 0, decayMult: 1.0, volume: 0.8, pan: 0, muted: false }
                return next
              })
            }}
            className="text-xs py-1.5 rounded font-ui transition-all"
            style={{ background: '#1a1a2e', border: '1px solid #2e2e4e', color: '#555' }}
          >
            Reset Pad
          </button>

          <div className="h-px" style={{ background: '#1e1e2e' }} />

          {/* Kit offset preview */}
          <div className="text-xs font-mono space-y-0.5" style={{ color: '#444' }}>
            <div>Kit pitch: {kitDef.pitchSt > 0 ? '+' : ''}{kitDef.pitchSt}st</div>
            <div>Kit decay: {kitDef.decayMult.toFixed(2)}×</div>
            <div>Kit pan: {kitDef.pan === 0 ? 'C' : kitDef.pan < 0 ? `L${Math.round(-kitDef.pan * 100)}` : `R${Math.round(kitDef.pan * 100)}`}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Reusable slider row ──────────────────────────────────────────
function PadKnob({ label, value, min, max, step, color, onChange, display }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-ui" style={{ color: '#666' }}>{label}</span>
        <span className="text-xs font-mono" style={{ color }}>{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: color }}
      />
    </div>
  )
}
