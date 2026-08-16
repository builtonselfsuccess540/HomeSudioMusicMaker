import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getCtx } from '../../audio/audioEngine'

// ─── Music theory ─────────────────────────────────────────────────

const NOTE_NAMES  = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const BLACK_SEMIS = new Set([1,3,6,8,10])
const isBlack = (midi) => BLACK_SEMIS.has(midi % 12)
const noteLabel = (midi) => NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1)
const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12)

// 3 octaves: C3(48) – B5(83)
const PIANO_LOW  = 48
const PIANO_HIGH = 83
const ALL_KEYS   = Array.from({ length: PIANO_HIGH - PIANO_LOW + 1 }, (_, i) => PIANO_LOW + i)

// QWERTY → MIDI
const KEY_MIDI = {
  'z':48,'s':49,'x':50,'d':51,'c':52,'v':53,'g':54,'b':55,'h':56,'n':57,'j':58,'m':59,
  'q':60,'2':61,'w':62,'3':63,'e':64,'r':65,'5':66,'t':67,'6':68,'y':69,'7':70,'u':71,
  'i':72,'9':73,'o':74,'0':75,'p':76,
}

// ─── Rate definitions ─────────────────────────────────────────────

const RATES = {
  '1/1':4, '1/2':2, '1/4':1, '1/8':0.5, '1/16':0.25, '1/32':0.125,
  '1/8T':1/3, '1/16T':1/6,
}
const RATE_KEYS = Object.keys(RATES)

// ─── Patterns ────────────────────────────────────────────────────

const PATTERNS = ['Up','Down','Up-Down','Random','As Played','Chord']

function buildSequence(notes, orderedNotes, pattern, octRange) {
  if (!notes.size) return []
  const sorted = [...notes].sort((a, b) => a - b)
  let base = []
  for (let o = 0; o < octRange; o++) sorted.forEach(m => base.push(m + o * 12))

  switch (pattern) {
    case 'Up':       return base
    case 'Down':     return [...base].reverse()
    case 'Up-Down':  return base.length < 2 ? base : [...base, ...[...base].reverse().slice(1, -1)]
    case 'Random':   return base
    case 'As Played':{
      let ordered = []
      for (let o = 0; o < octRange; o++) orderedNotes.forEach(m => ordered.push(m + o * 12))
      return ordered
    }
    case 'Chord':    return [base]   // array of arrays = play all simultaneously
    default:         return base
  }
}

// ─── Synth ────────────────────────────────────────────────────────

function playNote(midi, startTime, gateSecs, velocity) {
  const c = getCtx()
  const freq = midiToFreq(midi)

  const osc1  = c.createOscillator()
  const osc2  = c.createOscillator()
  const filt  = c.createBiquadFilter()
  const env   = c.createGain()
  const sub   = c.createGain()

  osc1.type = 'sawtooth'; osc1.frequency.value = freq
  osc2.type = 'sine';     osc2.frequency.value = freq / 2
  sub.gain.value = 0.25
  osc2.connect(sub); sub.connect(filt)
  osc1.connect(filt)

  filt.type = 'lowpass'
  filt.Q.value = 3
  filt.frequency.setValueAtTime(Math.min(freq * 5, 8000), startTime)
  filt.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.2, 200), startTime + gateSecs * 0.5)

  filt.connect(env)
  env.connect(c.destination)

  const att = 0.006
  const rel = Math.min(0.08, gateSecs * 0.25)
  const sus = velocity * 0.38

  env.gain.setValueAtTime(0, startTime)
  env.gain.linearRampToValueAtTime(velocity * 0.5, startTime + att)
  env.gain.exponentialRampToValueAtTime(sus, startTime + att + 0.04)
  env.gain.setValueAtTime(sus, startTime + gateSecs - rel)
  env.gain.linearRampToValueAtTime(0, startTime + gateSecs)

  osc1.start(startTime); osc1.stop(startTime + gateSecs + 0.02)
  osc2.start(startTime); osc2.stop(startTime + gateSecs + 0.02)
}

// ─── Main component ───────────────────────────────────────────────

export default function ArpeggiatorView() {
  const [heldNotes,    setHeldNotes]    = useState(new Set())
  const [orderedNotes, setOrderedNotes] = useState([])
  const [pattern,  setPattern]  = useState('Up')
  const [rate,     setRate]     = useState('1/8')
  const [octRange, setOctRange] = useState(2)
  const [gate,     setGate]     = useState(0.8)
  const [velocity, setVelocity] = useState(0.75)
  const [bpm,      setBpm]      = useState(120)
  const [holding,  setHolding]  = useState(false)
  const [playing,  setPlaying]  = useState(false)
  const [arpStep,  setArpStep]  = useState(-1)
  const [activeMidi, setActiveMidi] = useState(null)

  // Refs for scheduler (avoid stale closures)
  const heldRef    = useRef(heldNotes)
  const ordRef     = useRef(orderedNotes)
  const patRef     = useRef(pattern)
  const rateRef    = useRef(rate)
  const octRef     = useRef(octRange)
  const gateRef    = useRef(gate)
  const velRef     = useRef(velocity)
  const bpmRef     = useRef(bpm)
  const holdRef    = useRef(holding)

  useEffect(() => { heldRef.current  = heldNotes    }, [heldNotes])
  useEffect(() => { ordRef.current   = orderedNotes }, [orderedNotes])
  useEffect(() => { patRef.current   = pattern      }, [pattern])
  useEffect(() => { rateRef.current  = rate         }, [rate])
  useEffect(() => { octRef.current   = octRange     }, [octRange])
  useEffect(() => { gateRef.current  = gate         }, [gate])
  useEffect(() => { velRef.current   = velocity     }, [velocity])
  useEffect(() => { bpmRef.current   = bpm          }, [bpm])
  useEffect(() => { holdRef.current  = holding      }, [holding])

  const schedRef     = useRef(null)
  const nextTimeRef  = useRef(0)
  const arpStepRef   = useRef(0)
  const seqRef       = useRef([])

  // ── Note triggering ────────────────────────────────────────────
  const pressNote = useCallback((midi) => {
    setHeldNotes(prev => new Set([...prev, midi]))
    setOrderedNotes(prev => prev.includes(midi) ? prev : [...prev, midi])
  }, [])

  const releaseNote = useCallback((midi) => {
    if (holdRef.current) return
    setHeldNotes(prev => { const n = new Set(prev); n.delete(midi); return n })
  }, [])

  // ── Scheduler ─────────────────────────────────────────────────
  const stopArp = useCallback(() => {
    clearTimeout(schedRef.current)
    schedRef.current = null
    setPlaying(false)
    setArpStep(-1)
    setActiveMidi(null)
    arpStepRef.current = 0
  }, [])

  const startArp = useCallback(() => {
    if (schedRef.current) return
    nextTimeRef.current = getCtx().currentTime + 0.05
    arpStepRef.current  = 0

    const tick = () => {
      const c = getCtx()
      const ahead = 0.12

      while (nextTimeRef.current < c.currentTime + ahead) {
        const t        = nextTimeRef.current
        const stepSecs = RATES[rateRef.current] * (60 / bpmRef.current)
        const gateSecs = stepSecs * Math.min(gateRef.current, 0.98)

        const seq = buildSequence(heldRef.current, ordRef.current, patRef.current, octRef.current)
        seqRef.current = seq

        if (seq.length > 0) {
          const item = seq[arpStepRef.current % seq.length]
          if (Array.isArray(item)) {
            // Chord mode — play all notes simultaneously
            item.forEach(m => playNote(m, t, gateSecs, velRef.current))
            setTimeout(() => setActiveMidi(item[0]), Math.max(0, (t - c.currentTime) * 1000))
          } else {
            if (patRef.current === 'Random') {
              const pick = seq[Math.floor(Math.random() * seq.length)]
              playNote(pick, t, gateSecs, velRef.current)
              setTimeout(() => setActiveMidi(pick), Math.max(0, (t - c.currentTime) * 1000))
            } else {
              playNote(item, t, gateSecs, velRef.current)
              setTimeout(() => setActiveMidi(item), Math.max(0, (t - c.currentTime) * 1000))
            }
          }
          const si = arpStepRef.current % seq.length
          setTimeout(() => setArpStep(si), Math.max(0, (t - c.currentTime) * 1000))
          arpStepRef.current++
        }

        nextTimeRef.current += stepSecs
      }

      schedRef.current = setTimeout(tick, 25)
    }

    tick()
    setPlaying(true)
  }, [stopArp])

  const togglePlay = useCallback(() => {
    if (playing) stopArp()
    else startArp()
  }, [playing, startArp, stopArp])

  useEffect(() => () => stopArp(), [stopArp])

  // ── Keyboard input ────────────────────────────────────────────
  useEffect(() => {
    const down = (e) => {
      if (e.repeat || e.target.tagName === 'INPUT') return
      const midi = KEY_MIDI[e.key.toLowerCase()]
      if (midi !== undefined) pressNote(midi)
      if (e.key === ' ') { e.preventDefault(); togglePlay() }
    }
    const up = (e) => {
      const midi = KEY_MIDI[e.key.toLowerCase()]
      if (midi !== undefined) releaseNote(midi)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [pressNote, releaseNote, togglePlay])

  // ── Hold mode ─────────────────────────────────────────────────
  const toggleHold = () => {
    if (holding) {
      setHolding(false)
      setHeldNotes(new Set())
      setOrderedNotes([])
    } else {
      setHolding(true)
    }
  }

  // ── White/black key counts for rendering ──────────────────────
  const whiteKeys = ALL_KEYS.filter(m => !isBlack(m))
  const seq = buildSequence(heldNotes, orderedNotes, pattern, octRange)
  const flatSeq = seq.flat ? seq.flat() : seq

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background:'#09090f', color:'#e0e0e0' }}>

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 flex-wrap"
           style={{ borderColor:'#1a1a2e', background:'#0d0d1a' }}>
        <span className="font-display text-sm tracking-widest uppercase"
              style={{ background:'linear-gradient(90deg,#b44fff,#00e5ff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Arpeggiator
        </span>
        <div className="w-px h-4 shrink-0" style={{ background:'#1a1a2e' }} />

        {/* Pattern */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono shrink-0" style={{ color:'#555' }}>Pattern</span>
          <select value={pattern} onChange={e => setPattern(e.target.value)}
                  className="text-xs px-2 py-1 rounded font-ui"
                  style={{ background:'#1a1a2e', border:'1px solid #2a2a3e', color:'#b44fff' }}>
            {PATTERNS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>

        {/* Rate */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono shrink-0" style={{ color:'#555' }}>Rate</span>
          <div className="flex gap-0.5">
            {RATE_KEYS.map(r => (
              <button key={r} onClick={() => setRate(r)}
                      className="text-xs px-1.5 py-0.5 rounded font-mono transition-all"
                      style={{ background: rate===r ? '#00e5ff22' : 'transparent',
                               border:`1px solid ${rate===r ? '#00e5ff' : '#1e1e2e'}`,
                               color: rate===r ? '#00e5ff' : '#555', fontSize:10 }}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Oct range */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono shrink-0" style={{ color:'#555' }}>Octaves</span>
          {[1,2,3,4].map(o => (
            <button key={o} onClick={() => setOctRange(o)}
                    className="w-6 h-6 rounded text-xs font-ui font-bold transition-all"
                    style={{ background: octRange===o ? '#b44fff33' : 'transparent',
                             border:`1px solid ${octRange===o ? '#b44fff' : '#1e1e2e'}`,
                             color: octRange===o ? '#b44fff' : '#555' }}>
              {o}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* BPM */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono" style={{ color:'#555' }}>BPM</span>
          <input type="number" min={40} max={300} value={bpm}
                 onChange={e => setBpm(Number(e.target.value))}
                 className="w-14 text-xs text-center px-1 py-1 rounded font-mono"
                 style={{ background:'#1a1a2e', border:'1px solid #2a2a3e', color:'#ffe600' }} />
        </div>

        {/* Hold */}
        <button onClick={toggleHold}
                className="text-xs px-3 py-1 rounded font-ui font-semibold transition-all"
                style={{ background: holding ? '#ff950033' : '#1a1a2e',
                         border:`1px solid ${holding ? '#ff9500' : '#2a2a3e'}`,
                         color: holding ? '#ff9500' : '#666',
                         boxShadow: holding ? '0 0 8px rgba(255,149,0,0.4)' : 'none' }}>
          {holding ? '⊡ Hold On' : '⊡ Hold'}
        </button>

        {/* Play */}
        <button onClick={togglePlay}
                className="text-sm px-4 py-1 rounded font-ui font-bold transition-all"
                style={{ background: playing ? 'rgba(0,229,255,0.12)' : 'rgba(0,255,157,0.12)',
                         border:`1px solid ${playing ? '#00e5ff' : '#00ff9d'}`,
                         color: playing ? '#00e5ff' : '#00ff9d',
                         boxShadow: playing ? '0 0 10px rgba(0,229,255,0.3)' : 'none' }}>
          {playing ? '■ Stop' : '▶ Play'}
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Gate + Velocity sliders */}
        <div className="flex gap-6 px-6 py-3 border-b shrink-0"
             style={{ borderColor:'#1a1a2e', background:'#0c0c1a' }}>
          <SliderRow label="Gate" value={gate} min={0.05} max={2.0} step={0.01}
                     display={`${Math.round(gate*100)}%`} color="#00e5ff"
                     onChange={setGate} />
          <SliderRow label="Velocity" value={velocity} min={0.05} max={1} step={0.01}
                     display={`${Math.round(velocity*100)}%`} color="#b44fff"
                     onChange={setVelocity} />
          <div className="flex-1" />
          {/* Current note indicator */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono" style={{ color:'#444' }}>Playing</span>
            <div className="w-14 h-8 flex items-center justify-center rounded font-ui font-bold text-sm"
                 style={{ background: activeMidi !== null ? '#b44fff22' : '#111120',
                          border:`1px solid ${activeMidi !== null ? '#b44fff' : '#1a1a2e'}`,
                          color: '#b44fff' }}>
              {activeMidi !== null ? noteLabel(activeMidi) : '—'}
            </div>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono" style={{ color:'#444' }}>Step</span>
            <div className="w-10 h-8 flex items-center justify-center rounded font-mono text-xs"
                 style={{ background:'#111120', border:'1px solid #1a1a2e', color:'#555' }}>
              {arpStep >= 0 ? arpStep + 1 : '—'}
            </div>
          </div>
        </div>

        {/* Sequence preview */}
        {flatSeq.length > 0 && (
          <div className="flex items-center gap-1 px-6 py-2 shrink-0 overflow-x-auto"
               style={{ borderBottom:'1px solid #1a1a2e', background:'#0a0a14' }}>
            <span className="text-xs font-mono shrink-0 mr-2" style={{ color:'#444' }}>Seq:</span>
            {flatSeq.map((m, i) => (
              <div key={i}
                   className="shrink-0 flex items-center justify-center rounded text-xs font-mono transition-all"
                   style={{
                     width: 32, height: 22,
                     background: arpStep === i && playing ? '#b44fff33' : '#111120',
                     border:`1px solid ${arpStep === i && playing ? '#b44fff' : '#1a1a2e'}`,
                     color: arpStep === i && playing ? '#b44fff' : '#555',
                     fontSize:9,
                   }}>
                {noteLabel(m)}
              </div>
            ))}
          </div>
        )}

        {/* Piano keyboard */}
        <div className="flex-1 flex flex-col items-center justify-center overflow-auto p-4">

          {heldNotes.size === 0 && !playing && (
            <div className="mb-4 text-xs font-mono text-center" style={{ color:'#444' }}>
              Click keys below or use keyboard: Z–M (C3–B3) · Q–U (C4–B4) · I–P (C5–E5)<br/>
              Space = Play/Stop
            </div>
          )}

          {/* Piano */}
          <div className="relative select-none" style={{ height: 140 }}>
            {/* White keys */}
            <div className="flex">
              {whiteKeys.map((midi) => {
                const held  = heldNotes.has(midi)
                const inSeq = flatSeq.includes(midi)
                const isAct = activeMidi === midi && playing
                return (
                  <div
                    key={midi}
                    onMouseDown={() => pressNote(midi)}
                    onMouseUp={() => releaseNote(midi)}
                    onMouseLeave={() => { if (!holding) releaseNote(midi) }}
                    className="relative cursor-pointer transition-all"
                    style={{
                      width: 32, height: 120,
                      background: isAct ? '#b44fff88'
                                : held  ? '#b44fff55'
                                : inSeq ? '#b44fff22'
                                : '#e8e0f0',
                      border:'1px solid #1a1a2e',
                      borderRadius:'0 0 4px 4px',
                      marginRight: 1,
                      boxShadow: held ? '0 0 8px #b44fff88' : 'none',
                    }}
                  >
                    <div className="absolute bottom-1 w-full text-center font-mono"
                         style={{ color: held ? '#b44fff' : '#555', fontSize:8 }}>
                      {midi % 12 === 0 ? noteLabel(midi) : ''}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Black keys overlay */}
            <div className="absolute top-0 left-0 flex pointer-events-none"
                 style={{ height: 80 }}>
              {whiteKeys.map((wMidi, wIdx) => {
                const rightBlack = (() => {
                  const semi = wMidi % 12
                  if (semi === 0 || semi === 2 || semi === 5 || semi === 7 || semi === 9) {
                    return wMidi + 1
                  }
                  return null
                })()
                return (
                  <React.Fragment key={wMidi}>
                    <div style={{ width: 33, position:'relative', height:80, pointerEvents:'none' }}>
                      {rightBlack && rightBlack <= PIANO_HIGH && (
                        <div
                          onMouseDown={(e) => { e.stopPropagation(); pressNote(rightBlack) }}
                          onMouseUp={(e) => { e.stopPropagation(); releaseNote(rightBlack) }}
                          onMouseLeave={() => { if (!holding) releaseNote(rightBlack) }}
                          className="absolute cursor-pointer transition-all"
                          style={{
                            width: 21, height: 70,
                            right: -11, top: 0,
                            background: heldNotes.has(rightBlack) ? '#b44fff'
                                      : activeMidi === rightBlack && playing ? '#b44fff'
                                      : flatSeq.includes(rightBlack) ? '#2a1a4a'
                                      : '#1a1a2a',
                            border: '1px solid #111',
                            borderRadius:'0 0 3px 3px',
                            zIndex: 2,
                            pointerEvents:'all',
                            boxShadow: heldNotes.has(rightBlack) ? '0 0 8px #b44fff' : 'none',
                          }}
                        />
                      )}
                    </div>
                  </React.Fragment>
                )
              })}
            </div>
          </div>

          {/* Held notes display */}
          {heldNotes.size > 0 && (
            <div className="flex gap-2 mt-4 flex-wrap justify-center">
              {[...heldNotes].sort((a,b)=>a-b).map(m => (
                <div key={m} className="px-2 py-1 rounded text-xs font-mono"
                     style={{ background:'#b44fff22', border:'1px solid #b44fff55', color:'#b44fff' }}>
                  {noteLabel(m)}
                </div>
              ))}
              <button onClick={() => { setHeldNotes(new Set()); setOrderedNotes([]) }}
                      className="px-2 py-1 rounded text-xs font-mono transition-all"
                      style={{ background:'transparent', border:'1px solid #ff2d5544', color:'#ff2d5566' }}>
                clear
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SliderRow({ label, value, min, max, step, display, color, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <span className="text-xs font-ui shrink-0 w-14" style={{ color:'#555' }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={e => onChange(Number(e.target.value))}
             className="flex-1" style={{ accentColor:color }} />
      <span className="text-xs font-mono w-10 text-right" style={{ color }}>{display}</span>
    </div>
  )
}
