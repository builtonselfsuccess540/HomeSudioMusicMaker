import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as Tone from 'tone'

// ─── Constants ────────────────────────────────────────────────────

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const WHITE = ['C','D','E','F','G','A','B']
const IS_BLACK = { 'C#':true,'D#':true,'F#':true,'G#':true,'A#':true }
const BLACK_POS = { 'C#':0.7,'D#':1.7,'F#':3.7,'G#':4.7,'A#':5.7 } // white-key offset

const KEY_MAP = {
  'a':'C4','w':'C#4','s':'D4','e':'D#4','d':'E4',
  'f':'F4','t':'F#4','g':'G4','y':'G#4','h':'A4',
  'u':'A#4','j':'B4','k':'C5','o':'C#5','l':'D5',
  'p':'D#5',';':'E5',"'":'F5',
}

const SYNTH_TYPES = ['Synth','FMSynth','AMSynth','PluckSynth','MonoSynth']
const OSC_TYPES = ['sine','square','sawtooth','triangle','fatsine','fatsquare']
const PRESET_KEY = 'hsmm_tonesynth_presets'

// ─── Keyboard generation (C3 → B5, 3 octaves) ────────────────────

function buildKeys(startOct = 3, octaves = 3) {
  const keys = []
  for (let o = startOct; o < startOct + octaves; o++) {
    for (const n of NOTES) keys.push(`${n}${o}`)
  }
  return keys
}

// ─── Synth factory ────────────────────────────────────────────────

function makeSynth(type, oscType, adsr, effects) {
  const opts = {
    oscillator: { type: oscType },
    envelope: {
      attack:  adsr.attack,
      decay:   adsr.decay,
      sustain: adsr.sustain,
      release: adsr.release,
    },
  }

  let synth
  if (type === 'Synth')     synth = new Tone.PolySynth(Tone.Synth, opts)
  else if (type === 'FMSynth')  synth = new Tone.PolySynth(Tone.FMSynth,  { ...opts, harmonicity: 3, modulationIndex: 10 })
  else if (type === 'AMSynth')  synth = new Tone.PolySynth(Tone.AMSynth,  { ...opts, harmonicity: 2 })
  else if (type === 'MonoSynth')synth = new Tone.PolySynth(Tone.MonoSynth, opts)
  else {
    synth = new Tone.PolySynth(Tone.PluckSynth, { attackNoise: 1, dampening: 4000, resonance: 0.7 })
  }

  // Build effects chain
  const chain = []
  if (effects.filter)    chain.push(new Tone.Filter(effects.filterFreq, 'lowpass'))
  if (effects.chorus)    chain.push(new Tone.Chorus(4, 2.5, 0.5).start())
  if (effects.reverb)    chain.push(new Tone.Reverb({ decay: effects.reverbDecay, wet: effects.reverbWet }))
  if (effects.delay)     chain.push(new Tone.FeedbackDelay(effects.delayTime, effects.delayFeedback))
  if (effects.distortion)chain.push(new Tone.Distortion(effects.distAmount))

  const vol = new Tone.Volume(effects.volume ?? 0)
  synth.chain(...chain, vol, Tone.getDestination())
  return { synth, vol, chain }
}

// ─── Component ────────────────────────────────────────────────────

const DEFAULT_ADSR = { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.8 }
const DEFAULT_FX   = {
  volume: 0,
  filter: false, filterFreq: 4000,
  chorus: false,
  reverb: false, reverbDecay: 1.5, reverbWet: 0.3,
  delay: false, delayTime: '8n', delayFeedback: 0.3,
  distortion: false, distAmount: 0.4,
}

export default function ToneSynthView() {
  const [synthType, setSynthType] = useState('Synth')
  const [oscType, setOscType]     = useState('sine')
  const [adsr, setAdsr]           = useState(DEFAULT_ADSR)
  const [effects, setEffects]     = useState(DEFAULT_FX)
  const [heldNotes, setHeldNotes] = useState(new Set())
  const [octaveShift, setOctaveShift] = useState(0)
  const [presets, setPresets]     = useState(() => { try { return JSON.parse(localStorage.getItem(PRESET_KEY)) || [] } catch { return [] } })
  const [presetName, setPresetName] = useState('')

  const synthRef = useRef(null)
  const keysDown = useRef(new Set())

  const ALL_KEYS = buildKeys(3 + octaveShift, 3)

  // Rebuild synth whenever config changes
  useEffect(() => {
    // Dispose old synth
    if (synthRef.current) {
      synthRef.current.synth.dispose()
      synthRef.current.chain.forEach(n => n.dispose())
      synthRef.current.vol.dispose()
    }
    synthRef.current = makeSynth(synthType, oscType, adsr, effects)
    return () => {
      if (synthRef.current) {
        synthRef.current.synth.dispose()
        synthRef.current.chain.forEach(n => n.dispose())
        synthRef.current.vol.dispose()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synthType, oscType, JSON.stringify(adsr), JSON.stringify(effects)])

  const noteOn = useCallback((note) => {
    if (!synthRef.current) return
    Tone.start()
    synthRef.current.synth.triggerAttack(note, Tone.now())
    setHeldNotes(prev => new Set([...prev, note]))
  }, [])

  const noteOff = useCallback((note) => {
    if (!synthRef.current) return
    synthRef.current.synth.triggerRelease(note, Tone.now())
    setHeldNotes(prev => { const n = new Set(prev); n.delete(note); return n })
  }, [])

  // Computer keyboard support
  useEffect(() => {
    function getNote(key) {
      const mapped = KEY_MAP[key.toLowerCase()]
      if (!mapped) return null
      const noteName = mapped.slice(0, -1)
      const origOct = parseInt(mapped.slice(-1))
      return `${noteName}${origOct + octaveShift}`
    }
    function onKeyDown(e) {
      if (e.repeat || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const note = getNote(e.key)
      if (!note || keysDown.current.has(e.key)) return
      keysDown.current.add(e.key)
      noteOn(note)
    }
    function onKeyUp(e) {
      const note = getNote(e.key)
      if (!note) return
      keysDown.current.delete(e.key)
      noteOff(note)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [noteOn, noteOff, octaveShift])

  const savePreset = () => {
    if (!presetName.trim()) return
    const preset = { name: presetName, synthType, oscType, adsr: { ...adsr }, effects: { ...effects } }
    const updated = [...presets, preset]
    setPresets(updated)
    localStorage.setItem(PRESET_KEY, JSON.stringify(updated))
    setPresetName('')
  }

  const loadPreset = (preset) => {
    setSynthType(preset.synthType)
    setOscType(preset.oscType)
    setAdsr(preset.adsr)
    setEffects(preset.effects)
  }

  const deletePreset = (i) => {
    const updated = presets.filter((_, idx) => idx !== i)
    setPresets(updated)
    localStorage.setItem(PRESET_KEY, JSON.stringify(updated))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#080810' }}>

      {/* ── Top controls ── */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-studio-border shrink-0 flex-wrap">
        <span className="font-display text-xs tracking-widest uppercase"
          style={{ background: 'linear-gradient(90deg,#b44fff,#00e5ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Tone Synth
        </span>

        {/* Synth type */}
        <div className="flex gap-1">
          {SYNTH_TYPES.map(t => (
            <button key={t} onClick={() => setSynthType(t)}
              className="px-2 py-1 rounded text-xs font-semibold transition-all"
              style={{
                background: synthType === t ? '#b44fff22' : 'transparent',
                color: synthType === t ? '#b44fff' : '#8899aa',
                border: `1px solid ${synthType === t ? '#b44fff44' : 'transparent'}`,
              }}>{t}</button>
          ))}
        </div>

        {/* Oscillator type */}
        {synthType !== 'PluckSynth' && (
          <select value={oscType} onChange={e => setOscType(e.target.value)}
            className="bg-studio-panel border border-studio-border rounded px-2 py-1 text-xs text-studio-text focus:outline-none">
            {OSC_TYPES.map(o => <option key={o}>{o}</option>)}
          </select>
        )}

        {/* Octave shift */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-studio-muted">Oct</span>
          <button onClick={() => setOctaveShift(v => Math.max(-2, v - 1))}
            className="w-5 h-5 rounded text-xs font-mono flex items-center justify-center"
            style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#888' }}>−</button>
          <span className="text-xs font-mono w-4 text-center" style={{ color: '#00e5ff' }}>
            {octaveShift >= 0 ? `+${octaveShift}` : octaveShift}
          </span>
          <button onClick={() => setOctaveShift(v => Math.min(2, v + 1))}
            className="w-5 h-5 rounded text-xs font-mono flex items-center justify-center"
            style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#888' }}>+</button>
        </div>
      </div>

      {/* ── Middle: ADSR + FX + Presets ── */}
      <div className="flex gap-0 border-b border-studio-border shrink-0">

        {/* ADSR */}
        <Section title="ENVELOPE" color="#00e5ff" w="w-72">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {[
              { key:'attack',  label:'Attack',  min:0.001, max:2,   step:0.001 },
              { key:'decay',   label:'Decay',   min:0.01,  max:2,   step:0.01  },
              { key:'sustain', label:'Sustain', min:0,     max:1,   step:0.01  },
              { key:'release', label:'Release', min:0.01,  max:4,   step:0.01  },
            ].map(({ key, label, min, max, step }) => (
              <div key={key}>
                <div className="flex justify-between mb-0.5">
                  <span className="text-xs text-studio-dim">{label}</span>
                  <span className="text-xs font-mono" style={{ color: '#00e5ff' }}>{adsr[key].toFixed(2)}</span>
                </div>
                <input type="range" min={min} max={max} step={step} value={adsr[key]}
                  onChange={e => setAdsr(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                  className="w-full h-1 rounded appearance-none cursor-pointer"
                  style={{ accentColor: '#00e5ff' }} />
              </div>
            ))}
          </div>
        </Section>

        {/* Effects */}
        <Section title="EFFECTS" color="#ff9500" w="flex-1">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <FxToggle label="Filter" active={effects.filter} onToggle={v => setEffects(p => ({...p, filter:v}))}>
              <Knob label="Freq" min={100} max={18000} value={effects.filterFreq} step={100}
                onChange={v => setEffects(p => ({...p, filterFreq:v}))} color="#ff9500" fmt={v=>`${Math.round(v/100)/10}k`} />
            </FxToggle>
            <FxToggle label="Chorus" active={effects.chorus} onToggle={v => setEffects(p => ({...p, chorus:v}))} />
            <FxToggle label="Reverb" active={effects.reverb} onToggle={v => setEffects(p => ({...p, reverb:v}))}>
              <Knob label="Decay" min={0.1} max={4} value={effects.reverbDecay} step={0.1}
                onChange={v => setEffects(p => ({...p, reverbDecay:v}))} color="#ff9500" fmt={v=>`${v.toFixed(1)}s`} />
              <Knob label="Wet" min={0} max={1} value={effects.reverbWet} step={0.01}
                onChange={v => setEffects(p => ({...p, reverbWet:v}))} color="#ff9500" fmt={v=>`${Math.round(v*100)}%`} />
            </FxToggle>
            <FxToggle label="Delay" active={effects.delay} onToggle={v => setEffects(p => ({...p, delay:v}))}>
              <Knob label="Feedback" min={0} max={0.95} value={effects.delayFeedback} step={0.01}
                onChange={v => setEffects(p => ({...p, delayFeedback:v}))} color="#ff9500" fmt={v=>`${Math.round(v*100)}%`} />
            </FxToggle>
            <FxToggle label="Distortion" active={effects.distortion} onToggle={v => setEffects(p => ({...p, distortion:v}))}>
              <Knob label="Drive" min={0} max={1} value={effects.distAmount} step={0.01}
                onChange={v => setEffects(p => ({...p, distAmount:v}))} color="#ff9500" fmt={v=>`${Math.round(v*100)}%`} />
            </FxToggle>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-studio-dim">Volume</span>
              <input type="range" min={-30} max={6} step={1} value={effects.volume}
                onChange={e => setEffects(p => ({...p, volume: parseInt(e.target.value)}))}
                className="w-full h-1 rounded appearance-none cursor-pointer"
                style={{ accentColor: '#ff9500' }} />
              <span className="text-xs font-mono text-right" style={{ color: '#ff9500' }}>{effects.volume} dB</span>
            </div>
          </div>
        </Section>

        {/* Presets */}
        <Section title="PRESETS" color="#00ff9d" w="w-52">
          <div className="flex gap-1 mb-2">
            <input value={presetName} onChange={e => setPresetName(e.target.value)}
              placeholder="Preset name…"
              className="flex-1 bg-transparent border border-studio-border rounded px-2 py-0.5 text-xs text-studio-text placeholder-studio-muted focus:outline-none" />
            <button onClick={savePreset}
              className="px-2 py-0.5 rounded text-xs font-semibold transition-all"
              style={{ background: '#00ff9d22', color: '#00ff9d', border: '1px solid #00ff9d44' }}>
              Save
            </button>
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 80 }}>
            {presets.length === 0 && <div className="text-xs text-studio-muted">No presets saved yet</div>}
            {presets.map((p, i) => (
              <div key={i} className="flex items-center gap-1">
                <button onClick={() => loadPreset(p)}
                  className="flex-1 text-left text-xs px-2 py-0.5 rounded transition-all hover:bg-white/5"
                  style={{ color: '#00ff9d' }}>{p.name}</button>
                <button onClick={() => deletePreset(i)} className="text-xs px-1" style={{ color: '#ff2d55' }}>✕</button>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ── Piano keyboard ── */}
      <div className="flex-1 flex items-center justify-center overflow-x-auto px-4 py-4">
        <div className="relative flex" style={{ height: 120 }}>
          {/* White keys */}
          {ALL_KEYS.filter(n => !IS_BLACK[n.slice(0,-1)]).map(note => (
            <PianoKey
              key={note}
              note={note}
              isBlack={false}
              isHeld={heldNotes.has(note)}
              onNoteOn={noteOn}
              onNoteOff={noteOff}
            />
          ))}
          {/* Black keys — positioned absolutely over white keys */}
          {ALL_KEYS.filter(n => IS_BLACK[n.slice(0,-1)]).map(note => {
            const noteName = note.slice(0,-1)
            const oct = parseInt(note.slice(-1))
            // Find white-key index this black key sits after
            const octStart = (oct - (3 + octaveShift)) * 7
            const whiteOffset = octStart + BLACK_POS[noteName]
            return (
              <PianoKey
                key={note}
                note={note}
                isBlack={true}
                isHeld={heldNotes.has(note)}
                onNoteOn={noteOn}
                onNoteOff={noteOff}
                leftOffset={whiteOffset * 30 + 18}
              />
            )
          })}
        </div>
      </div>

      {/* ── Hint bar ── */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-studio-border shrink-0">
        <span className="text-xs text-studio-muted">
          Click keys to play · Computer keyboard: <span className="font-mono" style={{ color: '#8899aa' }}>A S D F G H J K L</span> (white) · <span className="font-mono" style={{ color: '#8899aa' }}>W E T Y U O P</span> (black)
        </span>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────

function PianoKey({ note, isBlack, isHeld, onNoteOn, onNoteOff, leftOffset }) {
  const [mouseDown, setMouseDown] = useState(false)

  function down(e) {
    e.preventDefault()
    setMouseDown(true)
    onNoteOn(note)
  }
  function up(e) {
    e.preventDefault()
    setMouseDown(false)
    onNoteOff(note)
  }

  if (isBlack) {
    return (
      <div
        onMouseDown={down}
        onMouseUp={up}
        onMouseLeave={() => { if (mouseDown) { setMouseDown(false); onNoteOff(note) } }}
        onTouchStart={e => { e.preventDefault(); onNoteOn(note) }}
        onTouchEnd={e => { e.preventDefault(); onNoteOff(note) }}
        className="absolute select-none cursor-pointer z-10 rounded-b transition-all"
        style={{
          left: leftOffset,
          width: 20,
          height: 72,
          top: 0,
          background: isHeld ? '#b44fff' : '#1a1a2e',
          border: '1px solid #000',
          boxShadow: isHeld ? '0 0 10px #b44fff' : '2px 3px 6px rgba(0,0,0,0.5)',
        }}
      />
    )
  }

  return (
    <div
      onMouseDown={down}
      onMouseUp={up}
      onMouseLeave={() => { if (mouseDown) { setMouseDown(false); onNoteOff(note) } }}
      onTouchStart={e => { e.preventDefault(); onNoteOn(note) }}
      onTouchEnd={e => { e.preventDefault(); onNoteOff(note) }}
      className="select-none cursor-pointer rounded-b border border-gray-700 transition-all"
      style={{
        width: 30,
        height: 120,
        background: isHeld ? '#00e5ff33' : '#e8e8e8',
        borderColor: isHeld ? '#00e5ff' : '#ccc',
        boxShadow: isHeld ? '0 0 10px #00e5ff55, inset 0 -3px 8px rgba(0,0,0,0.15)' : 'inset 0 -3px 8px rgba(0,0,0,0.1)',
        transform: isHeld ? 'translateY(2px)' : 'none',
      }}
    />
  )
}

function Section({ title, color, w, children }) {
  return (
    <div className={`${w} border-r border-studio-border p-3 shrink-0`}>
      <div className="text-xs font-semibold tracking-wider mb-2" style={{ color }}>{title}</div>
      {children}
    </div>
  )
}

function FxToggle({ label, active, onToggle, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <button onClick={() => onToggle(!active)}
          className="w-4 h-4 rounded flex items-center justify-center text-xs transition-all"
          style={{ background: active ? '#ff950033' : '#ffffff11', border: `1px solid ${active ? '#ff9500' : '#ffffff22'}`, color: active ? '#ff9500' : '#555' }}>
          {active ? '●' : '○'}
        </button>
        <span className="text-xs" style={{ color: active ? '#ff9500' : '#8899aa' }}>{label}</span>
      </div>
      {active && children && <div className="flex gap-2 pl-6">{children}</div>}
    </div>
  )
}

function Knob({ label, min, max, value, step, onChange, color, fmt }) {
  return (
    <div className="flex flex-col items-center gap-0.5" style={{ minWidth: 48 }}>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-12 h-1 rounded appearance-none cursor-pointer"
        style={{ accentColor: color }} />
      <span className="text-xs font-mono" style={{ color, fontSize: 9 }}>{fmt ? fmt(value) : value}</span>
      <span className="text-xs text-studio-muted" style={{ fontSize: 9 }}>{label}</span>
    </div>
  )
}
