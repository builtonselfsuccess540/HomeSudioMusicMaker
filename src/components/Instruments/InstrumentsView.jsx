import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useStudioStore } from '../../store/useStudioStore'
import { getCtx, playDrum } from '../../audio/audioEngine'

// ─── Note data ───────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const BLACK_KEYS = new Set([1, 3, 6, 8, 10])

// Computer keyboard → [noteIndex, octaveOffset]
// Layout overview:
//   Lower  (base−1): white keys only  c , . /   (C D E F)
//   Middle (base  ): full 12 notes    a w s e d f t g y h u j
//   Upper  (base+1): full 12 notes    k o l p [ ] \ ; ' 9 0 -
const KEY_MAP = {
  // ── Lower octave (baseOctave − 1) — white keys ──────────────────
  'c':   [0, -1],   // C
  ',':   [2, -1],   // D
  '.':   [4, -1],   // E
  '/':   [5, -1],   // F
  // black keys for lower octave: use Z to shift down, then middle-row black keys

  // ── Middle octave (baseOctave) ───────────────────────────────────
  'a':  [0,  0],  'w':  [1,  0],  's':  [2,  0],  'e':  [3,  0],
  'd':  [4,  0],  'f':  [5,  0],  't':  [6,  0],  'g':  [7,  0],
  'y':  [8,  0],  'h':  [9,  0],  'u':  [10, 0],  'j':  [11, 0],

  // ── Upper octave (baseOctave + 1) — full 12 notes ────────────────
  'k':  [0,  1],   // C
  'o':  [1,  1],   // C#
  'l':  [2,  1],   // D
  'p':  [3,  1],   // D#
  '[':  [4,  1],   // E
  ']':  [5,  1],   // F
  '\\': [6,  1],   // F#
  ';':  [7,  1],   // G
  "'":  [8,  1],   // G#
  '9':  [9,  1],   // A
  '0':  [10, 1],   // A#
  '-':  [11, 1],   // B
}

// noteKey = `${note}-${octave}` for tracking active notes
function noteKey(note, octave) { return `${note}-${octave}` }

// Which keyboard letter maps to which note+octave (for display on keys)
function buildKeyLabels(baseOctave) {
  const map = {}
  for (const [k, [note, octAdd]] of Object.entries(KEY_MAP)) {
    map[noteKey(note, baseOctave + octAdd)] = k.toUpperCase()
  }
  return map
}

// ─── Beat pads ───────────────────────────────────────────────────

const PAD_NAMES  = ['Kick','Snare','HH-C','HH-O','Clap','Tom-H','Tom-M','Tom-L','Perc1','Perc2','FX1','FX2','Pad A','Pad B','Pad C','Pad D']
const PAD_COLORS = ['#ff2d55','#b44fff','#00e5ff','#00ff9d','#ffe600','#ff9500','#b44fff','#00e5ff','#00ff9d','#ff2d55','#ffe600','#ff9500','#00e5ff','#b44fff','#00ff9d','#ff2d55']

// Keyboard shortcuts for pads — all different from piano keys (a w s e d f t g y h u j k o l p z x)
const PAD_KEYS = ['1','2','3','4','5','6','7','8','q','r','i','`','v','b','n','m']

// Reverse map: key → pad name
const PAD_KEY_MAP = {}
PAD_NAMES.forEach((name, i) => { PAD_KEY_MAP[PAD_KEYS[i]] = name })

// ─── Step Sequencer data ─────────────────────────────────────────

const SEQ_ROWS = [
  { name: 'Kick',  color: '#ff2d55', drum: 'Kick'  },
  { name: 'Snare', color: '#b44fff', drum: 'Snare' },
  { name: 'HH-C',  color: '#00e5ff', drum: 'HH-C'  },
  { name: 'HH-O',  color: '#00ff9d', drum: 'HH-O'  },
  { name: 'Clap',  color: '#ffe600', drum: 'Clap'  },
]
const STEP_COUNT = 16

// ─── Chord Generator data ────────────────────────────────────────

const CHORD_NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const CHORD_SCALES = {
  'Major':      { intervals:[0,2,4,5,7,9,11], types:['maj','min','min','maj','maj','min','dim'] },
  'Minor':      { intervals:[0,2,3,5,7,8,10], types:['min','dim','maj','min','min','maj','maj'] },
  'Dorian':     { intervals:[0,2,3,5,7,9,10], types:['min','min','maj','maj','min','dim','maj'] },
  'Mixolydian': { intervals:[0,2,4,5,7,9,10], types:['maj','min','dim','maj','min','min','maj'] },
}
const CHORD_PROGRESSIONS = {
  'I – IV – V – I':    [0,3,4,0],
  'I – V – vi – IV':   [0,4,5,3],
  'ii – V – I':        [1,4,0],
  'I – vi – IV – V':   [0,5,3,4],
  'I – iii – IV – V':  [0,2,3,4],
  'i – VII – VI – VII':[0,6,5,6],
  'i – iv – v – i':    [0,3,4,0],
}
const ROMANS = ['I','II','III','IV','V','VI','VII']

function playChordAudio(semitones) {
  const c = getCtx()
  const now = c.currentTime
  semitones.forEach((s, i) => {
    const freq = 440 * Math.pow(2, (60 + s - 69) / 12)
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    osc.connect(gain); gain.connect(c.destination)
    const d = i * 0.025
    gain.gain.setValueAtTime(0, now + d)
    gain.gain.linearRampToValueAtTime(0.18, now + d + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, now + d + 1.4)
    osc.start(now + d)
    osc.stop(now + d + 1.45)
  })
}

function BeatPad({ name, color, hotkey, isActive, onTrigger }) {
  return (
    <button
      onMouseDown={onTrigger}
      onTouchStart={(e) => { e.preventDefault(); onTrigger() }}
      className="rounded-lg font-ui font-semibold text-sm tracking-wide select-none relative flex flex-col items-center justify-center gap-1"
      style={{
        height: 72,
        background: isActive ? `${color}33` : '#1c1c30',
        border: `1.5px solid ${isActive ? color : '#252540'}`,
        boxShadow: isActive ? `0 0 18px ${color}70, inset 0 0 10px ${color}20` : 'none',
        color: isActive ? color : '#888899',
        transform: isActive ? 'scale(0.94)' : 'scale(1)',
        transition: 'transform 0.05s, box-shadow 0.05s',
      }}
    >
      <span className="text-sm leading-none">{name}</span>
      <span
        className="font-mono leading-none px-1.5 py-0.5 rounded"
        style={{
          fontSize: 10,
          background: isActive ? `${color}30` : '#252540',
          color: isActive ? color : '#666',
          border: `1px solid ${isActive ? color + '60' : '#333'}`,
        }}
      >{hotkey === '`' ? '`' : hotkey.toUpperCase()}</span>
    </button>
  )
}

// ─── Piano Key ───────────────────────────────────────────────────

function PianoKey({ note, octave, isBlack, isActive, inScale, keyLabel, onNoteOn, onNoteOff }) {
  const handleMouseDown = (e) => { e.preventDefault(); onNoteOn(note, octave) }
  const handleMouseUp   = (e) => { e.preventDefault(); onNoteOff(note, octave) }
  const handleMouseEnter = (e) => { if (e.buttons === 1) onNoteOn(note, octave) }
  const handleMouseLeave = (e) => { if (e.buttons === 1) onNoteOff(note, octave) }

  if (isBlack) {
    return (
      <div
        className="absolute z-10 top-0 rounded-b cursor-pointer select-none flex flex-col items-center justify-end pb-1"
        style={{
          width: 26, height: 76,
          background: isActive
            ? 'linear-gradient(to bottom, #1a3a5c, #0a1a2e)'
            : inScale
            ? 'linear-gradient(to bottom, #2a1a3a, #14082a)'
            : 'linear-gradient(to bottom, #1a1a2e, #080810)',
          border: `1px solid ${isActive ? '#00e5ff' : inScale ? '#b44fff66' : '#333'}`,
          boxShadow: isActive
            ? '0 0 14px rgba(0,229,255,0.7), inset 0 2px 4px rgba(0,0,0,.8)'
            : inScale ? '0 0 6px rgba(180,79,255,0.3), inset 0 2px 4px rgba(0,0,0,.6)'
            : 'inset 0 2px 4px rgba(0,0,0,.6)',
          transition: 'all 0.04s',
          transform: isActive ? 'scaleY(0.97)' : 'scaleY(1)',
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={(e) => { e.preventDefault(); onNoteOn(note, octave) }}
        onTouchEnd={(e)   => { e.preventDefault(); onNoteOff(note, octave) }}
      >
        {keyLabel && (
          <span style={{ fontSize: 8, color: isActive ? '#00e5ff' : '#555', fontFamily: 'monospace', lineHeight: 1 }}>
            {keyLabel}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className="relative rounded-b cursor-pointer select-none flex flex-col items-center justify-end pb-1.5"
      style={{
        width: 38, height: 128,
        background: isActive
          ? 'linear-gradient(to bottom, #b8d4ff, #8aaad8)'
          : inScale
          ? 'linear-gradient(to bottom, #f0e8ff, #d8c8f0)'
          : 'linear-gradient(to bottom, #e8e8f0, #c8c8d8)',
        border: `1px solid ${isActive ? '#00e5ff' : inScale ? '#b44fff88' : '#666'}`,
        boxShadow: isActive
          ? '0 0 12px rgba(0,229,255,0.5), inset 0 3px 8px rgba(0,0,0,.2)'
          : inScale ? '0 0 8px rgba(180,79,255,0.25), inset 0 -2px 6px rgba(0,0,0,.1)'
          : 'inset 0 -2px 6px rgba(0,0,0,.1), 2px 4px 6px rgba(0,0,0,.4)',
        transition: 'all 0.04s',
        transform: isActive ? 'scaleY(0.985)' : 'scaleY(1)',
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={(e) => { e.preventDefault(); onNoteOn(note, octave) }}
      onTouchEnd={(e)   => { e.preventDefault(); onNoteOff(note, octave) }}
    >
      <div className="flex flex-col items-center gap-0.5">
        {keyLabel && (
          <span style={{ fontSize: 9, color: isActive ? '#1a4a7a' : '#999', fontFamily: 'monospace', fontWeight: 'bold' }}>
            {keyLabel}
          </span>
        )}
        <span style={{ fontSize: 8, color: isActive ? '#1a4a7a' : inScale ? '#8855cc' : '#bbb', fontFamily: 'monospace' }}>
          {NOTE_NAMES[note]}{octave}
        </span>
      </div>
    </div>
  )
}

// ─── Piano ───────────────────────────────────────────────────────

function Piano({ activeNotes, keyLabels, onNoteOn, onNoteOff, octaves, scaleNotes }) {
  return (
    <div className="flex overflow-x-auto pb-2 select-none" onMouseLeave={(e) => {}}>
      {octaves.map((oct) => (
        <div key={oct} className="relative flex shrink-0">
          {/* White keys */}
          {NOTE_NAMES.map((_, i) => {
            if (BLACK_KEYS.has(i)) return null
            const nk = noteKey(i, oct)
            return (
              <PianoKey
                key={i}
                note={i} octave={oct}
                isBlack={false}
                isActive={activeNotes.has(nk)}
                inScale={scaleNotes ? scaleNotes[i] : false}
                keyLabel={keyLabels[nk]}
                onNoteOn={onNoteOn}
                onNoteOff={onNoteOff}
              />
            )
          })}
          {/* Black keys overlaid */}
          <div className="absolute top-0 left-0 pointer-events-none" style={{ width: '100%' }}>
            {(() => {
              let whites = 0
              return NOTE_NAMES.map((_, i) => {
                if (!BLACK_KEYS.has(i)) { whites++; return null }
                const left = (whites - 1) * 38 + 25
                const nk = noteKey(i, oct)
                return (
                  <div key={i} className="absolute pointer-events-auto" style={{ left }}>
                    <PianoKey
                      note={i} octave={oct}
                      isBlack={true}
                      isActive={activeNotes.has(nk)}
                      inScale={scaleNotes ? scaleNotes[i] : false}
                      keyLabel={keyLabels[nk]}
                      onNoteOn={onNoteOn}
                      onNoteOff={onNoteOff}
                    />
                  </div>
                )
              })
            })()}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Step Sequencer ──────────────────────────────────────────────

function StepSequencer({ bpm }) {
  const [steps, setSteps] = useState(() => SEQ_ROWS.map(() => Array(STEP_COUNT).fill(false)))
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const stepsRef = useRef(steps)
  const currentStepRef = useRef(0)

  // Playback engine — restarts cleanly when bpm or isPlaying changes
  useEffect(() => {
    if (!isPlaying) { setCurrentStep(-1); return }
    const stepMs = 60000 / (bpm * 4)
    const id = setInterval(() => {
      const step = currentStepRef.current
      setCurrentStep(step)
      SEQ_ROWS.forEach((row, rowIdx) => {
        if (stepsRef.current[rowIdx][step]) playDrum(row.drum)
      })
      currentStepRef.current = (step + 1) % STEP_COUNT
    }, stepMs)
    return () => clearInterval(id)
  }, [bpm, isPlaying])

  const toggleStep = (row, col) => {
    setSteps(prev => {
      const next = prev.map(r => [...r])
      next[row][col] = !next[row][col]
      stepsRef.current = next
      return next
    })
  }

  const exportMidi = () => {
    // MIDI note numbers for each drum row (GM standard percussion channel)
    const MIDI_NOTES = { Kick: 36, Snare: 38, 'HH-C': 42, 'HH-O': 46, Clap: 39 }
    const ticksPerBeat = 480
    const tempo = Math.round(60000000 / bpm)

    const writeVarLen = (n) => {
      const bytes = []
      bytes.push(n & 0x7f)
      n >>= 7
      while (n > 0) { bytes.unshift((n & 0x7f) | 0x80); n >>= 7 }
      return bytes
    }

    const events = []
    SEQ_ROWS.forEach((row, rowIdx) => {
      stepsRef.current[rowIdx].forEach((on, stepIdx) => {
        if (!on) return
        const tick = Math.round(stepIdx * ticksPerBeat / 4)
        const note = MIDI_NOTES[row.drum] || 36
        events.push({ tick, type: 0x99, note, vel: 100 })
        events.push({ tick: tick + Math.round(ticksPerBeat / 8), type: 0x89, note, vel: 0 })
      })
    })
    events.sort((a, b) => a.tick - b.tick)

    const trackBytes = []
    // Tempo meta event
    trackBytes.push(0x00, 0xFF, 0x51, 0x03,
      (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff)

    let lastTick = 0
    events.forEach(({ tick, type, note, vel }) => {
      const delta = tick - lastTick
      lastTick = tick
      writeVarLen(delta).forEach((b) => trackBytes.push(b))
      trackBytes.push(type, note, vel)
    })
    // End of track
    trackBytes.push(0x00, 0xFF, 0x2F, 0x00)

    const header = [
      0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
      0x00, 0x00, 0x00, 0x01,
      (ticksPerBeat >> 8) & 0xff, ticksPerBeat & 0xff,
    ]
    const trackLen = trackBytes.length
    const trackHeader = [
      0x4D, 0x54, 0x72, 0x6B,
      (trackLen >> 24) & 0xff, (trackLen >> 16) & 0xff,
      (trackLen >> 8) & 0xff, trackLen & 0xff,
    ]
    const bytes = new Uint8Array([...header, ...trackHeader, ...trackBytes])
    const blob = new Blob([bytes], { type: 'audio/midi' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `beat_${bpm}bpm.mid`; a.click()
    URL.revokeObjectURL(url)
  }

  const clearAll = () => {
    const empty = SEQ_ROWS.map(() => Array(STEP_COUNT).fill(false))
    stepsRef.current = empty
    setSteps(empty)
  }

  const loadPreset = (preset) => {
    const e = SEQ_ROWS.map(() => Array(STEP_COUNT).fill(false))
    if (preset === 'boom-bap') {
      ;[0,4,8,12].forEach(i => { e[0][i] = true })
      e[1][4] = true; e[1][12] = true
      for (let i = 0; i < 16; i += 2) e[2][i] = true
    } else if (preset === 'trap') {
      ;[0,2,8,10].forEach(i => { e[0][i] = true })
      e[1][4] = true; e[1][12] = true
      for (let i = 0; i < 16; i++) e[2][i] = true
      e[3][6] = true; e[3][14] = true
    } else if (preset === 'gospel') {
      ;[0,6,8,14].forEach(i => { e[0][i] = true })
      ;[2,4,10,12].forEach(i => { e[1][i] = true })
      for (let i = 0; i < 16; i += 2) e[2][i] = true
      e[4][4] = true; e[4][12] = true
    }
    stepsRef.current = e
    setSteps(e)
  }

  return (
    <div className="bg-studio-panel border border-studio-border rounded-xl p-4">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="font-ui font-semibold text-studio-text">Step Sequencer</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              if (!isPlaying) currentStepRef.current = 0
              setIsPlaying(p => !p)
            }}
            className="px-3 py-1 rounded text-xs font-ui font-semibold border transition-all"
            style={{
              borderColor: isPlaying ? '#00e5ff' : '#252540',
              color: isPlaying ? '#00e5ff' : '#888899',
              background: isPlaying ? 'rgba(0,229,255,0.1)' : 'transparent',
            }}
          >
            {isPlaying ? '■ Stop' : '▶ Play'}
          </button>
          <button
            onClick={clearAll}
            className="px-3 py-1 rounded text-xs font-ui border border-studio-border text-studio-dim hover:text-studio-red hover:border-studio-red transition-colors"
          >
            Clear
          </button>
          <button
            onClick={exportMidi}
            className="px-3 py-1 rounded text-xs font-ui border border-studio-border text-studio-dim hover:text-studio-green hover:border-studio-green transition-colors"
            title="Export pattern as MIDI file"
          >
            ↓ MIDI
          </button>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs font-mono text-studio-dim">Load:</span>
          {[['Boom-Bap','boom-bap'],['Trap','trap'],['Gospel','gospel']].map(([label,key]) => (
            <button key={key} onClick={() => loadPreset(key)}
              className="px-2 py-0.5 rounded text-xs font-mono border border-studio-border text-studio-dim hover:text-studio-text transition-colors">
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {/* Beat number header */}
        <div className="flex gap-2">
          <div className="w-14 shrink-0" />
          {[0,4,8,12].map(g => (
            <div key={g} className="flex gap-1 flex-1">
              {[0,1,2,3].map(i => (
                <div key={i} className="flex-1 text-center select-none"
                  style={{ fontSize: 9, fontFamily: 'monospace', color: currentStep === g+i ? '#00e5ff' : '#333355' }}>
                  {i === 0 ? `${g/4+1}` : '·'}
                </div>
              ))}
            </div>
          ))}
        </div>

        {SEQ_ROWS.map((row, rowIdx) => (
          <div key={row.name} className="flex items-center gap-2">
            <div className="w-14 shrink-0 text-xs font-ui font-semibold text-right pr-1 select-none"
              style={{ color: row.color }}>
              {row.name}
            </div>
            {[0,4,8,12].map(g => (
              <div key={g} className="flex gap-1 flex-1">
                {[0,1,2,3].map(i => {
                  const col = g + i
                  const active = steps[rowIdx][col]
                  const isCurrent = currentStep === col
                  return (
                    <button key={col} onClick={() => toggleStep(rowIdx, col)}
                      className="flex-1 rounded transition-all"
                      style={{
                        height: 26,
                        background: active ? row.color + '2a' : isCurrent ? '#252540' : '#141428',
                        border: `1.5px solid ${
                          active && isCurrent ? row.color
                          : active ? row.color + '99'
                          : isCurrent ? '#333355'
                          : '#1e1e36'
                        }`,
                        boxShadow: active && isCurrent ? `0 0 8px ${row.color}60` : 'none',
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-2 text-xs font-mono text-studio-dim">
        {bpm} BPM · 16th notes ·{' '}
        <span style={{ color: isPlaying ? '#00e5ff' : '#555' }}>
          {isPlaying ? `playing — step ${(currentStep >= 0 ? currentStep : 0) + 1}/16` : 'stopped'}
        </span>
      </div>
    </div>
  )
}

// ─── Chord Generator ─────────────────────────────────────────────

function ChordGenerator({ onScaleChange }) {
  const [rootNote, setRootNote] = useState(0)
  const [scaleName, setScaleName] = useState('Major')
  const [progKey, setProgKey] = useState('I – IV – V – I')

  useEffect(() => {
    if (!onScaleChange) return
    const scale = CHORD_SCALES[scaleName]
    const inScale = Array(12).fill(false)
    scale.intervals.forEach((interval) => { inScale[(rootNote + interval) % 12] = true })
    onScaleChange(inScale)
  }, [rootNote, scaleName, onScaleChange])
  const [playingIdx, setPlayingIdx] = useState(-1)

  const scale = CHORD_SCALES[scaleName]
  const degrees = CHORD_PROGRESSIONS[progKey]

  const chords = degrees.map(degree => {
    const root = rootNote + scale.intervals[degree]
    const type = scale.types[degree]
    const third = type === 'maj' ? 4 : 3
    const fifth = type === 'dim' ? 6 : 7
    const name = CHORD_NOTES[root % 12] + (type === 'min' ? 'm' : type === 'dim' ? '°' : '')
    const roman = type === 'maj' ? ROMANS[degree]
      : type === 'min' ? ROMANS[degree].toLowerCase()
      : ROMANS[degree].toLowerCase() + '°'
    const noteNames = [root, root+third, root+fifth].map(s => CHORD_NOTES[s % 12])
    return { name, roman, semitones: [root, root+third, root+fifth], noteNames }
  })

  const playIdx = (i) => {
    playChordAudio(chords[i].semitones)
    setPlayingIdx(i)
    setTimeout(() => setPlayingIdx(p => p === i ? -1 : p), 1300)
  }

  const playAll = () => {
    chords.forEach((_, i) => setTimeout(() => playIdx(i), i * 1500))
  }

  const COLORS = ['#00e5ff','#b44fff','#00ff9d','#ffe600','#ff9500']
  const sel = "bg-studio-void border border-studio-border rounded px-2 py-0.5 font-mono text-sm text-studio-text focus:outline-none focus:border-studio-cyan"

  return (
    <div className="bg-studio-panel border border-studio-border rounded-xl p-4">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="font-ui font-semibold text-studio-text">Chord Generator</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-studio-dim">KEY</span>
          <select value={rootNote} onChange={e => setRootNote(Number(e.target.value))}
            className={sel + ' text-studio-cyan w-16'}>
            {CHORD_NOTES.map((n,i) => <option key={i} value={i}>{n}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-studio-dim">SCALE</span>
          <select value={scaleName} onChange={e => setScaleName(e.target.value)} className={sel}>
            {Object.keys(CHORD_SCALES).map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-studio-dim">PROG</span>
          <select value={progKey} onChange={e => setProgKey(e.target.value)} className={sel + ' text-xs'}>
            {Object.keys(CHORD_PROGRESSIONS).map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <button onClick={playAll}
          className="ml-auto px-3 py-1 rounded text-xs font-ui font-semibold border border-studio-cyan/50 text-studio-cyan hover:border-studio-cyan hover:bg-studio-cyan/10 transition-colors">
          ▶ Play All
        </button>
      </div>

      <div className="flex gap-2">
        {chords.map((chord, i) => {
          const color = COLORS[i % COLORS.length]
          const active = playingIdx === i
          return (
            <button key={i} onClick={() => playIdx(i)}
              className="flex-1 rounded-lg p-3 text-center transition-all"
              style={{
                border: `1.5px solid ${active ? color : '#252540'}`,
                background: active ? color + '15' : '#141428',
                boxShadow: active ? `0 0 14px ${color}44` : 'none',
              }}
            >
              <div className="text-xs font-mono text-studio-dim mb-0.5">{chord.roman}</div>
              <div className="font-display font-semibold text-base leading-none mb-1.5"
                style={{ color: active ? color : '#e0e0f0' }}>
                {chord.name}
              </div>
              <div className="text-xs font-mono" style={{ color: active ? color + 'cc' : '#555570' }}>
                {chord.noteNames.join(' · ')}
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-2 text-xs font-mono text-studio-dim">
        Click a chord to hear it · Play All sequences the full progression
      </div>
    </div>
  )
}

// ─── Arpeggiator ─────────────────────────────────────────────────

const ARP_PATTERNS = { Up: 'up', Down: 'down', Bounce: 'bounce', Random: 'random' }
const ARP_SPEEDS = { '1/8': 2, '1/16': 4, '1/32': 8 }

function Arpeggiator({ bpm }) {
  const [rootNote, setRootNote] = useState(0)
  const [chordType, setChordType] = useState('maj')
  const [pattern, setPattern] = useState('up')
  const [speed, setSpeed] = useState(4)
  const [octaveRange, setOctaveRange] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(-1)

  const idxRef = useRef(0)
  const dirRef = useRef(1)
  const isPlayingRef = useRef(false)

  const buildNotes = () => {
    const thirds = { maj: 4, min: 3, dom7: 4 }
    const fifths = { maj: 7, min: 7, dom7: 7 }
    const sevenths = { dom7: 10 }
    const third = thirds[chordType], fifth = fifths[chordType]
    const base = [rootNote, rootNote + third, rootNote + fifth]
    if (sevenths[chordType]) base.push(rootNote + sevenths[chordType])
    const notes = []
    for (let oct = 0; oct < octaveRange; oct++)
      base.forEach((n) => notes.push(n + oct * 12))
    return notes
  }

  const playArpNote = (semitone) => {
    const c = getCtx()
    const freq = 440 * Math.pow(2, (60 + semitone - 69) / 12)
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    osc.connect(gain); gain.connect(c.destination)
    const now = c.currentTime
    const dur = 60 / (bpm * speed) * 0.8
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur)
    osc.start(now); osc.stop(now + dur + 0.01)
  }

  useEffect(() => {
    isPlayingRef.current = isPlaying
    if (!isPlaying) { setCurrentIdx(-1); return }
    const notes = buildNotes()
    idxRef.current = 0; dirRef.current = 1
    const ms = 60000 / (bpm * speed)

    const id = setInterval(() => {
      const notes2 = buildNotes()
      if (!notes2.length) return
      let idx = idxRef.current
      setCurrentIdx(idx)
      playArpNote(notes2[idx])

      if (pattern === 'up') {
        idxRef.current = (idx + 1) % notes2.length
      } else if (pattern === 'down') {
        idxRef.current = (idx - 1 + notes2.length) % notes2.length
      } else if (pattern === 'bounce') {
        idx += dirRef.current
        if (idx >= notes2.length) { idx = notes2.length - 2; dirRef.current = -1 }
        if (idx < 0) { idx = 1; dirRef.current = 1 }
        idxRef.current = Math.max(0, Math.min(notes2.length - 1, idx))
      } else {
        idxRef.current = Math.floor(Math.random() * notes2.length)
      }
    }, ms)
    return () => clearInterval(id)
  }, [isPlaying, bpm, rootNote, chordType, pattern, speed, octaveRange])

  const notes = buildNotes()
  const sel = "bg-studio-void border border-studio-border rounded px-2 py-0.5 font-mono text-sm text-studio-text focus:outline-none focus:border-studio-cyan"

  return (
    <div className="bg-studio-panel border border-studio-border rounded-xl p-4">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="font-ui font-semibold text-studio-text">Arpeggiator</span>

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-studio-dim">ROOT</span>
          <select value={rootNote} onChange={(e) => setRootNote(Number(e.target.value))} className={sel + ' text-studio-cyan w-16'}>
            {CHORD_NOTES.map((n, i) => <option key={i} value={i}>{n}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-studio-dim">TYPE</span>
          <select value={chordType} onChange={(e) => setChordType(e.target.value)} className={sel}>
            <option value="maj">Major</option>
            <option value="min">Minor</option>
            <option value="dom7">Dom 7</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-studio-dim">PATTERN</span>
          <div className="flex gap-1">
            {Object.entries(ARP_PATTERNS).map(([label, val]) => (
              <button key={val} onClick={() => setPattern(val)}
                className="px-2 py-0.5 rounded text-xs font-mono transition-colors"
                style={{
                  background: pattern === val ? '#b44fff22' : 'transparent',
                  color: pattern === val ? '#b44fff' : '#555570',
                  border: `1px solid ${pattern === val ? '#b44fff60' : '#252540'}`,
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-studio-dim">SPEED</span>
          <div className="flex gap-1">
            {Object.entries(ARP_SPEEDS).map(([label, val]) => (
              <button key={val} onClick={() => setSpeed(val)}
                className="px-2 py-0.5 rounded text-xs font-mono transition-colors"
                style={{
                  background: speed === val ? '#00e5ff22' : 'transparent',
                  color: speed === val ? '#00e5ff' : '#555570',
                  border: `1px solid ${speed === val ? '#00e5ff60' : '#252540'}`,
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-studio-dim">OCTAVES</span>
          <div className="flex gap-1">
            {[1, 2, 3].map((v) => (
              <button key={v} onClick={() => setOctaveRange(v)}
                className="w-7 py-0.5 rounded text-xs font-mono transition-colors"
                style={{
                  background: octaveRange === v ? '#00ff9d22' : 'transparent',
                  color: octaveRange === v ? '#00ff9d' : '#555570',
                  border: `1px solid ${octaveRange === v ? '#00ff9d60' : '#252540'}`,
                }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setIsPlaying((p) => !p)}
          className="ml-auto px-3 py-1 rounded text-xs font-ui font-semibold border transition-all"
          style={{
            borderColor: isPlaying ? '#b44fff' : '#252540',
            color: isPlaying ? '#b44fff' : '#888899',
            background: isPlaying ? 'rgba(180,79,255,0.1)' : 'transparent',
          }}
        >
          {isPlaying ? '■ Stop' : '▶ Play'}
        </button>
      </div>

      {/* Note dots */}
      <div className="flex gap-1.5 items-center">
        {notes.map((n, i) => {
          const isCurrent = currentIdx === i
          return (
            <div key={i}
              className="flex-1 h-6 rounded flex items-center justify-center text-xs font-mono transition-all"
              style={{
                background: isCurrent ? '#b44fff22' : '#141428',
                border: `1.5px solid ${isCurrent ? '#b44fff' : '#1e1e36'}`,
                color: isCurrent ? '#b44fff' : '#333355',
                boxShadow: isCurrent ? '0 0 8px rgba(180,79,255,0.5)' : 'none',
                fontSize: 9,
              }}>
              {CHORD_NOTES[n % 12]}
            </div>
          )
        })}
      </div>
      <div className="mt-2 text-xs font-mono text-studio-dim">
        {bpm} BPM · {Object.keys(ARP_SPEEDS).find((k) => ARP_SPEEDS[k] === speed)} · {notes.length} notes
      </div>
    </div>
  )
}

// ─── Main View ───────────────────────────────────────────────────

export default function InstrumentsView() {
  const { bpm } = useStudioStore()

  const [oscType, setOscType]   = useState('sine')
  const [attack,  setAttack]    = useState(0.01)
  const [decay,   setDecay]     = useState(0.2)
  const [sustain, setSustain]   = useState(0.6)
  const [release, setRelease]   = useState(0.5)
  const [reverbAmt, setReverbAmt] = useState(0)
  const [delayAmt,  setDelayAmt]  = useState(0)
  const [baseOctave, setBaseOctave] = useState(4)
  const [activeNotes, setActiveNotes] = useState(new Set())
  const [activePads, setActivePads]   = useState(new Set())
  const [scaleNotes, setScaleNotes]   = useState(null)

  // Refs so audio callbacks always have fresh values without stale closures
  const oscRef        = useRef(oscType)
  const attackRef     = useRef(attack)
  const decayRef      = useRef(decay)
  const sustainRef    = useRef(sustain)
  const releaseRef    = useRef(release)
  const reverbAmtRef  = useRef(reverbAmt)
  const delayAmtRef   = useRef(delayAmt)
  const baseOctaveRef = useRef(baseOctave)
  useEffect(() => { oscRef.current = oscType },           [oscType])
  useEffect(() => { attackRef.current = attack },         [attack])
  useEffect(() => { decayRef.current = decay },           [decay])
  useEffect(() => { sustainRef.current = sustain },       [sustain])
  useEffect(() => { releaseRef.current = release },       [release])
  useEffect(() => { reverbAmtRef.current = reverbAmt },   [reverbAmt])
  useEffect(() => { delayAmtRef.current = delayAmt },     [delayAmt])
  useEffect(() => { baseOctaveRef.current = baseOctave }, [baseOctave])

  // FX chain — reverb convolver + delay nodes, created once
  const fxRef = useRef(null)
  useEffect(() => {
    const c = getCtx()
    const sr = c.sampleRate
    const convolver = c.createConvolver()
    const buf = c.createBuffer(2, sr * 2, sr)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4)
    }
    convolver.buffer = buf
    const reverbWet = c.createGain()
    reverbWet.gain.value = 0
    convolver.connect(reverbWet); reverbWet.connect(c.destination)

    const delayNode = c.createDelay(1.0)
    delayNode.delayTime.value = 0.22
    const feedback = c.createGain()
    feedback.gain.value = 0.3
    delayNode.connect(feedback); feedback.connect(delayNode)
    const delayWet = c.createGain()
    delayWet.gain.value = 0
    delayNode.connect(delayWet); delayWet.connect(c.destination)

    fxRef.current = { convolver, reverbWet, delayNode, delayWet }
  }, [])

  useEffect(() => { if (fxRef.current) fxRef.current.reverbWet.gain.value = reverbAmt / 100 * 0.5 }, [reverbAmt])
  useEffect(() => { if (fxRef.current) fxRef.current.delayWet.gain.value = delayAmt / 100 * 0.4 }, [delayAmt])

  // Active oscillators map: noteKey → { osc, gain, stop }
  const activeOscsRef = useRef({})

  const startNote = useCallback((note, octave) => {
    const nk = noteKey(note, octave)
    // Already playing — skip
    if (activeOscsRef.current[nk]) return

    const c = getCtx()
    const freq = 440 * Math.pow(2, ((octave - 4) * 12 + note - 9) / 12)
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = oscRef.current
    o.frequency.value = freq
    o.connect(g); g.connect(c.destination)

    const now = c.currentTime
    const atk = attackRef.current
    const dec = decayRef.current
    const sus = sustainRef.current

    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(0.5, now + atk)
    g.gain.linearRampToValueAtTime(0.5 * sus, now + atk + dec)

    o.start(now)

    // Route through FX sends
    if (fxRef.current && reverbAmtRef.current > 0) g.connect(fxRef.current.convolver)
    if (fxRef.current && delayAmtRef.current > 0) g.connect(fxRef.current.delayNode)

    const stopFn = () => {
      const c2 = getCtx()
      const t = c2.currentTime
      const rel = releaseRef.current
      try {
        g.gain.cancelScheduledValues(t)
        g.gain.setValueAtTime(g.gain.value, t)
        g.gain.linearRampToValueAtTime(0, t + rel)
        o.stop(t + rel + 0.01)
      } catch {}
      delete activeOscsRef.current[nk]
    }

    activeOscsRef.current[nk] = { o, g, stop: stopFn }
    setActiveNotes((prev) => new Set([...prev, nk]))
  }, [])

  const stopNote = useCallback((note, octave) => {
    const nk = noteKey(note, octave)
    if (activeOscsRef.current[nk]) {
      activeOscsRef.current[nk].stop()
    }
    setActiveNotes((prev) => { const s = new Set(prev); s.delete(nk); return s })
  }, [])

  const stopAllNotes = useCallback(() => {
    Object.values(activeOscsRef.current).forEach((n) => n.stop())
    activeOscsRef.current = {}
    setActiveNotes(new Set())
  }, [])

  const triggerPad = useCallback((name) => {
    playDrum(name)
    setActivePads((p) => new Set([...p, name]))
    setTimeout(() => setActivePads((p) => { const s = new Set(p); s.delete(name); return s }), 130)
  }, [])

  // Pad keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key === '`' ? '`' : e.key.toLowerCase()
      if (PAD_KEY_MAP[k]) triggerPad(PAD_KEY_MAP[k])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [triggerPad])

  // Computer keyboard input — reads baseOctaveRef directly, never stale
  useEffect(() => {
    const onKeyDown = (e) => {
      // Ignore if user is typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()

      if (k === 'z') {
        const next = Math.max(1, baseOctaveRef.current - 1)
        baseOctaveRef.current = next
        setBaseOctave(next)
        stopAllNotes()
        return
      }
      if (k === 'x') {
        const next = Math.min(7, baseOctaveRef.current + 1)
        baseOctaveRef.current = next
        setBaseOctave(next)
        stopAllNotes()
        return
      }

      if (KEY_MAP[k]) {
        const [note, octAdd] = KEY_MAP[k]
        startNote(note, baseOctaveRef.current + octAdd)
      }
    }

    const onKeyUp = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const k = e.key.toLowerCase()
      if (KEY_MAP[k]) {
        const [note, octAdd] = KEY_MAP[k]
        stopNote(note, baseOctaveRef.current + octAdd)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup',   onKeyUp)
      stopAllNotes()
    }
  }, [startNote, stopNote, stopAllNotes])

  // Stop all notes when ADSR changes to avoid stuck notes
  useEffect(() => { stopAllNotes() }, [oscType])

  const keyLabels = buildKeyLabels(baseOctave)
  const octaves   = [baseOctave - 1, baseOctave, baseOctave + 1].filter((o) => o >= 0 && o <= 8)

  return (
    <div className="flex flex-col h-full bg-studio-void overflow-auto">
      <div className="flex items-center gap-3 px-4 py-2 bg-studio-panel border-b border-studio-border">
        <span className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase">Instruments</span>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-5">

        {/* Piano */}
        <div className="bg-studio-panel border border-studio-border rounded-xl p-4">
          {/* Controls row */}
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            <span className="font-ui font-semibold text-studio-text">Virtual Keyboard</span>

            {/* Oscillator */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-studio-dim font-mono">OSC</span>
              {['sine','square','triangle','sawtooth'].map((t) => (
                <button key={t} onClick={() => setOscType(t)}
                  className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                    oscType === t ? 'bg-studio-cyan text-black shadow-cyan' : 'bg-studio-surface border border-studio-border text-studio-dim hover:text-white'
                  }`}>{t}</button>
              ))}
            </div>

            {/* Octave shift */}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs text-studio-dim font-mono">OCT</span>
              <button onClick={() => { setBaseOctave((o) => Math.max(1, o - 1)); stopAllNotes() }}
                className="w-6 h-6 rounded bg-studio-surface border border-studio-border text-studio-dim hover:text-studio-cyan hover:border-studio-cyan transition-colors text-sm flex items-center justify-center"
                title="Octave down (Z)">−</button>
              <span className="font-mono text-sm text-studio-cyan w-4 text-center">{baseOctave}</span>
              <button onClick={() => { setBaseOctave((o) => Math.min(7, o + 1)); stopAllNotes() }}
                className="w-6 h-6 rounded bg-studio-surface border border-studio-border text-studio-dim hover:text-studio-cyan hover:border-studio-cyan transition-colors text-sm flex items-center justify-center"
                title="Octave up (X)">+</button>
            </div>
          </div>

          {/* Scale highlight legend */}
          {scaleNotes && (
            <div className="flex items-center gap-2 mb-2 text-xs font-mono text-studio-dim">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#f0e8ff', border: '1px solid #b44fff88' }} />
              <span>Scale highlight active — set in Chord Generator</span>
              <button onClick={() => setScaleNotes(null)} className="ml-auto text-studio-dim hover:text-studio-red transition-colors">Clear</button>
            </div>
          )}

          {/* Keyboard shortcuts hint */}
          <div className="flex flex-col gap-1 mb-2 text-xs text-studio-dim font-mono">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-studio-dim">OCT−1:</span>
              <span><span className="text-studio-orange">C , . / ; ' [ ]</span> = white &nbsp;·&nbsp; <span className="text-studio-red">9 0 - = [</span> = black</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-studio-dim">OCT 0:</span>
              <span><span className="text-studio-cyan">A S D F G H J</span> = white &nbsp;·&nbsp; <span className="text-studio-purple">W E T Y U</span> = black</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-studio-dim">OCT+1:</span>
              <span><span className="text-studio-green">K L</span> = white &nbsp;·&nbsp; <span className="text-studio-green">O P</span> = black &nbsp;·&nbsp;</span>
              <span className="ml-auto"><span className="text-studio-yellow">Z</span> shift oct− &nbsp;·&nbsp; <span className="text-studio-yellow">X</span> shift oct+</span>
            </div>
          </div>

          {/* Piano keys */}
          <div className="overflow-x-auto rounded-lg bg-[#111] p-2"
            onMouseUp={() => {
              // Release any notes where mouse was released outside a key
              Object.values(activeOscsRef.current).forEach((n) => n.stop())
              activeOscsRef.current = {}
              setActiveNotes(new Set())
            }}
          >
            <Piano
              activeNotes={activeNotes}
              keyLabels={keyLabels}
              onNoteOn={startNote}
              onNoteOff={stopNote}
              octaves={octaves}
              scaleNotes={scaleNotes}
            />
          </div>

          {/* Active note display */}
          <div className="mt-2 h-5 flex items-center gap-2">
            {activeNotes.size > 0 ? (
              [...activeNotes].map((nk) => {
                const [n, o] = nk.split('-').map(Number)
                return (
                  <span key={nk} className="px-2 py-0.5 rounded bg-studio-cyan/20 border border-studio-cyan/40 font-mono text-xs text-studio-cyan">
                    {NOTE_NAMES[n]}{o}
                  </span>
                )
              })
            ) : (
              <span className="font-mono text-xs text-studio-muted">Click keys or use keyboard</span>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          {/* Beat pads */}
          <div className="flex-1 bg-studio-panel border border-studio-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-ui font-semibold text-studio-text">Beat Pads</span>
              <span className="text-xs text-studio-dim font-mono">{bpm} BPM</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PAD_NAMES.map((name, i) => (
                <BeatPad
                  key={name}
                  name={name}
                  color={PAD_COLORS[i]}
                  hotkey={PAD_KEYS[i]}
                  isActive={activePads.has(name)}
                  onTrigger={() => triggerPad(name)}
                />
              ))}
            </div>
          </div>

          {/* ADSR */}
          <div className="w-56 bg-studio-panel border border-studio-border rounded-xl p-4 shrink-0">
            <span className="font-ui font-semibold text-studio-text block mb-3">Synth — ADSR</span>
            <div className="flex flex-col gap-3">
              {[
                { label: 'Attack',  val: attack,     set: setAttack,    min: 0.001, max: 2,   step: 0.001 },
                { label: 'Decay',   val: decay,      set: setDecay,     min: 0.01,  max: 2,   step: 0.01  },
                { label: 'Sustain', val: sustain,    set: setSustain,   min: 0,     max: 1,   step: 0.01  },
                { label: 'Release', val: release,    set: setRelease,   min: 0.01,  max: 4,   step: 0.01  },
                { label: 'Reverb',  val: reverbAmt,  set: setReverbAmt, min: 0,     max: 100, step: 1     },
                { label: 'Delay',   val: delayAmt,   set: setDelayAmt,  min: 0,     max: 100, step: 1     },
              ].map(({ label, val, set, min, max, step }) => (
                <div key={label} className="flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="text-xs text-studio-dim font-mono">{label}</span>
                    <span className="text-xs text-studio-cyan font-mono">{val.toFixed(2)}</span>
                  </div>
                  <input type="range" min={min} max={max} step={step} value={val}
                    onChange={(e) => set(Number(e.target.value))} className="w-full" />
                </div>
              ))}
            </div>

            {/* ADSR curve */}
            <div className="mt-4 bg-studio-void rounded border border-studio-border overflow-hidden" style={{ height: 48 }}>
              <svg className="w-full h-full" viewBox="0 0 120 40" preserveAspectRatio="none">
                <path
                  d={`M0,40 L${Math.min(attack*20,30)},0 L${Math.min(attack*20+decay*15,80)},${(1-sustain)*40} L${Math.min(attack*20+decay*15+20,100)},${(1-sustain)*40} L${Math.min(attack*20+decay*15+20+release*12,120)},40`}
                  stroke="#00e5ff" strokeWidth="1.5" fill="none"
                />
                <path
                  d={`M0,40 L${Math.min(attack*20,30)},0 L${Math.min(attack*20+decay*15,80)},${(1-sustain)*40} L${Math.min(attack*20+decay*15+20,100)},${(1-sustain)*40} L${Math.min(attack*20+decay*15+20+release*12,120)},40 Z`}
                  fill="#00e5ff" fillOpacity="0.1"
                />
              </svg>
            </div>
          </div>
        </div>

        <StepSequencer bpm={bpm} />
        <ChordGenerator onScaleChange={setScaleNotes} />
        <Arpeggiator bpm={bpm} />

      </div>
    </div>
  )
}
