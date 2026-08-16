import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getCtx } from '../../audio/audioEngine'
import { GoogleGenerativeAI } from '../../utils/gemini-compat'

// ─── Music theory data ────────────────────────────────────────────

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const NOTE_DISPLAY = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']

const SCALES = {
  'Major':          [0,2,4,5,7,9,11],
  'Natural Minor':  [0,2,3,5,7,8,10],
  'Harmonic Minor': [0,2,3,5,7,8,11],
  'Melodic Minor':  [0,2,3,5,7,9,11],
  'Dorian':         [0,2,3,5,7,9,10],
  'Phrygian':       [0,1,3,5,7,8,10],
  'Lydian':         [0,2,4,6,7,9,11],
  'Mixolydian':     [0,2,4,5,7,9,10],
}

const ROMAN = ['I','II','III','IV','V','VI','VII']

const DEGREE_COLORS = [
  '#00e5ff','#5577ff','#b44fff','#00ff9d','#ffe600','#ff9500','#ff2d55',
]

// Borrowed chord definitions relative to major scale (common chromatic substitutions)
const BORROWED = [
  { label: '♭VII', intervals: [0,4,7],    rootOffset: 10, name: 'bVII' },
  { label: '♭VI',  intervals: [0,4,7],    rootOffset: 8,  name: 'bVI'  },
  { label: 'iv',   intervals: [0,3,7],    rootOffset: 5,  name: 'iv'   },
  { label: '♭III', intervals: [0,4,7],    rootOffset: 3,  name: 'bIII' },
  { label: 'II',   intervals: [0,4,7,10], rootOffset: 2,  name: 'II7'  }, // dom II (secondary dominant of V)
  { label: 'V/IV', intervals: [0,4,7,10], rootOffset: 7,  name: 'V/IV' }, // secondary dominant
]

function detectQuality(thirdInt, fifthInt) {
  if (thirdInt === 4 && fifthInt === 7) return 'maj'
  if (thirdInt === 3 && fifthInt === 7) return 'min'
  if (thirdInt === 3 && fifthInt === 6) return 'dim'
  if (thirdInt === 4 && fifthInt === 8) return 'aug'
  return 'maj'
}

function qualityLabel(q) {
  if (q === 'min') return 'm'
  if (q === 'dim') return '°'
  if (q === 'aug') return '+'
  return ''
}

function qualityRoman(q, roman) {
  if (q === 'maj' || q === 'aug') return roman.toUpperCase()
  return roman.toLowerCase()
}

function getDiatonicChords(rootName, scaleName, withSeventh) {
  const intervals = SCALES[scaleName]
  const rootIdx = NOTES.indexOf(rootName)
  return intervals.map((semis, deg) => {
    const chordRootIdx = (rootIdx + semis) % 12
    const thirdInt = (intervals[(deg + 2) % 7] - semis + 12) % 12
    const fifthInt = (intervals[(deg + 4) % 7] - semis + 12) % 12
    const sevInt = withSeventh ? (intervals[(deg + 6) % 7] - semis + 12) % 12 : null
    const q = detectQuality(thirdInt, fifthInt)
    const semiOffsets = sevInt !== null ? [0, thirdInt, fifthInt, sevInt] : [0, thirdInt, fifthInt]
    const roman = qualityRoman(q, ROMAN[deg]) + (q === 'dim' ? '°' : q === 'aug' ? '+' : '')
    const noteNames = semiOffsets.map((s) => NOTES[(chordRootIdx + s) % 12])
    return {
      id: `diatonic-${deg}`,
      degree: deg,
      roman: withSeventh ? roman + (q === 'maj' ? '7' : q === 'min' ? '7' : q === 'dim' ? '7' : '7') : roman,
      root: NOTES[chordRootIdx],
      quality: q,
      semiOffsets,
      noteNames,
      color: DEGREE_COLORS[deg],
      borrowed: false,
    }
  })
}

function getBorrowedChords(rootName, scaleName, withSeventh) {
  const rootIdx = NOTES.indexOf(rootName)
  return BORROWED.map((b, i) => {
    const chordRootIdx = (rootIdx + b.rootOffset) % 12
    const semiOffsets = withSeventh && b.intervals.length < 4
      ? [...b.intervals, b.intervals[2] + 10 > 12 ? b.intervals[2] + 10 - 12 : b.intervals[2] + 10]
      : b.intervals
    const q = detectQuality(semiOffsets[1], semiOffsets[2])
    const noteNames = semiOffsets.map((s) => NOTES[(chordRootIdx + s) % 12])
    return {
      id: `borrowed-${i}`,
      degree: -1,
      roman: b.label,
      root: NOTES[chordRootIdx],
      quality: q,
      semiOffsets,
      noteNames,
      color: '#888',
      borrowed: true,
    }
  })
}

// ─── Audio synthesis ──────────────────────────────────────────────

function noteToFreq(noteName, oct) {
  const idx = NOTES.indexOf(noteName)
  const midi = (oct + 1) * 12 + idx
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function getChordFreqs(chord, baseOct, voicing) {
  const rootIdx = NOTES.indexOf(chord.root)
  return chord.semiOffsets.map((s, i) => {
    const noteIdx = (rootIdx + s) % 12
    const octShift = Math.floor(s / 12)
    let oct = baseOct + octShift
    if (voicing === 'open' && i === 1) oct -= 1        // drop 3rd an octave
    if (voicing === 'spread' && i >= 2) oct += 1       // push upper notes up
    return noteToFreq(NOTES[noteIdx], Math.max(1, oct))
  })
}

function playChordAudio(freqs, durationSecs, velocity = 0.65) {
  const c = getCtx()
  const now = c.currentTime
  const master = c.createGain()
  master.gain.value = (velocity / freqs.length) * 1.8
  master.connect(c.destination)

  freqs.forEach((freq) => {
    const osc1 = c.createOscillator()  // fundamental
    const osc2 = c.createOscillator()  // 2nd harmonic
    const osc3 = c.createOscillator()  // 3rd harmonic
    const env = c.createGain()
    const g2 = c.createGain()
    const g3 = c.createGain()

    osc1.type = 'triangle'
    osc2.type = 'sine'
    osc3.type = 'sine'
    osc1.frequency.value = freq
    osc2.frequency.value = freq * 2
    osc3.frequency.value = freq * 3
    g2.gain.value = 0.25
    g3.gain.value = 0.08

    osc1.connect(env)
    osc2.connect(g2); g2.connect(env)
    osc3.connect(g3); g3.connect(env)
    env.connect(master)

    const att = 0.012
    const dec = 0.28
    const sus = 0.35
    const rel = 0.4

    env.gain.setValueAtTime(0.001, now)
    env.gain.linearRampToValueAtTime(1, now + att)
    env.gain.exponentialRampToValueAtTime(sus, now + att + dec)
    if (durationSecs > att + dec + rel) {
      env.gain.setValueAtTime(sus, now + durationSecs - rel)
      env.gain.exponentialRampToValueAtTime(0.001, now + durationSecs)
    } else {
      env.gain.exponentialRampToValueAtTime(0.001, now + durationSecs)
    }

    osc1.start(now); osc1.stop(now + durationSecs)
    osc2.start(now); osc2.stop(now + durationSecs)
    osc3.start(now); osc3.stop(now + durationSecs)
  })
}

// ─── Component ────────────────────────────────────────────────────

const SLOT_COUNT = 8
const EMPTY_SLOTS = Array(SLOT_COUNT).fill(null)

export default function ChordProgressionView() {
  const [rootNote, setRootNote]     = useState('C')
  const [scaleName, setScaleName]   = useState('Major')
  const [withSeventh, setWithSeventh] = useState(false)
  const [voicing, setVoicing]       = useState('close')
  const [octave, setOctave]         = useState(4)
  const [bpm, setBpm]               = useState(90)
  const [bars, setBars]             = useState(1)          // beats per slot
  const [looping, setLooping]       = useState(true)
  const [showBorrowed, setShowBorrowed] = useState(false)
  const [aiOpen, setAiOpen]   = useState(false)
  const [aiGenre, setAiGenre] = useState('Pop')
  const [aiMood, setAiMood]   = useState('Happy')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSugs, setAiSugs]   = useState([])
  const [aiError, setAiError] = useState('')

  const [progression, setProgression] = useState(EMPTY_SLOTS)
  const [playing, setPlaying]       = useState(false)
  const [currentSlot, setCurrentSlot] = useState(-1)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [dragChord, setDragChord]   = useState(null)     // chord being dragged from palette
  const [dragFromSlot, setDragFromSlot] = useState(null) // slot index being dragged

  const timerRef    = useRef(null)
  const slotRef     = useRef(-1)
  const progRef     = useRef(progression)
  const bpmRef      = useRef(bpm)
  const barsRef     = useRef(bars)
  const voicingRef  = useRef(voicing)
  const octaveRef   = useRef(octave)
  const loopingRef  = useRef(looping)

  useEffect(() => { progRef.current = progression },   [progression])
  useEffect(() => { bpmRef.current = bpm },             [bpm])
  useEffect(() => { barsRef.current = bars },           [bars])
  useEffect(() => { voicingRef.current = voicing },     [voicing])
  useEffect(() => { octaveRef.current = octave },       [octave])
  useEffect(() => { loopingRef.current = looping },     [looping])

  const diatonicChords = getDiatonicChords(rootNote, scaleName, withSeventh)
  const borrowedChords = getBorrowedChords(rootNote, scaleName, withSeventh)
  const paletteChords  = showBorrowed ? [...diatonicChords, ...borrowedChords] : diatonicChords

  // ─── Playback ──────────────────────────────────────────────────
  const stopPlay = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = null
    setPlaying(false)
    setCurrentSlot(-1)
    slotRef.current = -1
  }, [])

  const scheduleNext = useCallback(() => {
    const prog = progRef.current
    const filled = prog.filter(Boolean)
    if (!filled.length) { stopPlay(); return }

    // Find next non-null slot
    let next = slotRef.current
    let tries = 0
    do {
      next = (next + 1) % prog.length
      tries++
    } while (!prog[next] && tries <= prog.length)

    if (!prog[next]) { stopPlay(); return }

    slotRef.current = next
    setCurrentSlot(next)

    const chord = prog[next]
    const barDur = (60 / bpmRef.current) * 4 * barsRef.current
    const freqs = getChordFreqs(chord, octaveRef.current, voicingRef.current)
    playChordAudio(freqs, barDur * 0.97, 0.65)

    // Schedule next chord
    timerRef.current = setTimeout(() => {
      // Check if we're at the end
      let nextIdx = next
      let t = 0
      do {
        nextIdx = (nextIdx + 1) % prog.length
        t++
      } while (!prog[nextIdx] && t <= prog.length)

      if (!prog[nextIdx] || (nextIdx <= next && !loopingRef.current)) {
        stopPlay()
      } else {
        scheduleNext()
      }
    }, barDur * 1000)
  }, [stopPlay])

  const startPlay = useCallback(() => {
    if (timerRef.current) return
    slotRef.current = -1
    scheduleNext()
    setPlaying(true)
  }, [scheduleNext])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  // ─── AI suggestions ────────────────────────────────────────────
  const generateAI = useCallback(async () => {
    setAiLoading(true); setAiError(''); setAiSugs([])
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) throw new Error('VITE_GEMINI_API_KEY not set')
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
      const prompt = `You are a music theory expert. Suggest 4 chord progressions for ${aiGenre} music with a ${aiMood} mood in the key of ${rootNote} ${scaleName}.

Return ONLY valid JSON like this:
[
  { "name": "Classic I-IV-V-I", "degrees": [0,3,4,0], "description": "The most timeless progression" },
  { "name": "Emotional vi-IV-I-V", "degrees": [5,3,0,4], "description": "Melancholic and powerful" }
]

The "degrees" array contains 0-based diatonic scale degree indices (0=I, 1=II, 2=III, 3=IV, 4=V, 5=VI, 6=VII). Return exactly 4 progressions.`

      const result = await model.generateContent(prompt)
      const text = result.response.text().trim()
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('Invalid AI response format')
      const parsed = JSON.parse(jsonMatch[0])
      setAiSugs(parsed)
    } catch (err) {
      setAiError(err.message || 'AI request failed')
    } finally {
      setAiLoading(false)
    }
  }, [aiGenre, aiMood, rootNote, scaleName])

  const applyAISuggestion = useCallback((degrees) => {
    const chords = getDiatonicChords(rootNote, scaleName, withSeventh)
    const newProg = [...EMPTY_SLOTS]
    degrees.forEach((deg, i) => {
      if (i < newProg.length && deg >= 0 && deg < chords.length) {
        newProg[i] = chords[deg]
      }
    })
    setProgression(newProg)
    setSelectedSlot(null)
  }, [rootNote, scaleName, withSeventh])

  // ─── Audition (single chord preview) ──────────────────────────
  const auditionChord = useCallback((chord) => {
    const freqs = getChordFreqs(chord, octave, voicing)
    playChordAudio(freqs, 1.5, 0.65)
  }, [octave, voicing])

  // ─── Progression editing ───────────────────────────────────────
  const placeChord = (chord, slotIdx) => {
    setProgression((prev) => {
      const next = [...prev]
      next[slotIdx] = chord
      return next
    })
    setSelectedSlot(slotIdx)
  }

  const removeSlot = (slotIdx) => {
    setProgression((prev) => {
      const next = [...prev]
      next[slotIdx] = null
      return next
    })
    if (selectedSlot === slotIdx) setSelectedSlot(null)
  }

  const clearProgression = () => {
    setProgression(EMPTY_SLOTS)
    setSelectedSlot(null)
  }

  // ─── Drag from palette ──────────────────────────────────────────
  const onPaletteDragStart = (chord) => setDragChord(chord)
  const onPaletteDragEnd   = () => setDragChord(null)

  const onSlotDragStart = (idx) => {
    if (progression[idx]) { setDragFromSlot(idx); setDragChord(progression[idx]) }
  }
  const onSlotDragEnd = () => { setDragFromSlot(null); setDragChord(null) }

  const onSlotDrop = (idx) => {
    if (!dragChord) return
    setProgression((prev) => {
      const next = [...prev]
      if (dragFromSlot !== null && dragFromSlot !== idx) {
        // swap
        const temp = next[dragFromSlot]
        next[dragFromSlot] = next[idx]
        next[idx] = temp
      } else {
        next[idx] = dragChord
      }
      return next
    })
    setSelectedSlot(idx)
    setDragChord(null)
    setDragFromSlot(null)
  }

  // ─── Analysis helpers ───────────────────────────────────────────
  const filledSlots = progression.filter(Boolean)
  const selectedChord = selectedSlot !== null ? progression[selectedSlot] : null

  const getIntervalName = (semis) => {
    const names = ['','m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7','Oct']
    return names[semis % 13] || semis
  }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#09090f', color: '#e0e0e0' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 flex-wrap"
           style={{ borderColor: '#1a1a2e', background: '#0d0d1a' }}>
        <span className="font-display text-sm tracking-widest uppercase shrink-0"
              style={{ background: 'linear-gradient(90deg,#00e5ff,#b44fff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Chord Builder
        </span>
        <div className="w-px h-4 shrink-0" style={{ background: '#1a1a2e' }} />

        {/* Root */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono" style={{ color: '#555' }}>Key</span>
          <select value={rootNote} onChange={(e) => setRootNote(e.target.value)}
                  className="text-xs px-2 py-1 rounded font-ui"
                  style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#00e5ff' }}>
            {NOTES.map((n, i) => <option key={n} value={n}>{NOTE_DISPLAY[i]}</option>)}
          </select>
        </div>

        {/* Scale */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono" style={{ color: '#555' }}>Scale</span>
          <select value={scaleName} onChange={(e) => setScaleName(e.target.value)}
                  className="text-xs px-2 py-1 rounded font-ui"
                  style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#b44fff' }}>
            {Object.keys(SCALES).map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="w-px h-4 shrink-0" style={{ background: '#1a1a2e' }} />

        {/* Options */}
        <ToggleBtn active={withSeventh} onClick={() => setWithSeventh((v) => !v)} color="#ffe600">7ths</ToggleBtn>
        <ToggleBtn active={showBorrowed} onClick={() => setShowBorrowed((v) => !v)} color="#ff9500">Borrowed</ToggleBtn>

        <div className="w-px h-4 shrink-0" style={{ background: '#1a1a2e' }} />

        {/* Voicing */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono" style={{ color: '#555' }}>Voicing</span>
          {['close','open','spread'].map((v) => (
            <button key={v} onClick={() => setVoicing(v)}
                    className="text-xs px-2 py-0.5 rounded font-ui capitalize transition-all"
                    style={{ background: voicing === v ? '#1e1e3e' : 'transparent',
                             border: `1px solid ${voicing === v ? '#5577ff' : '#1e1e2e'}`,
                             color: voicing === v ? '#5577ff' : '#555' }}>
              {v}
            </button>
          ))}
        </div>

        {/* Octave */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono" style={{ color: '#555' }}>Oct</span>
          <button onClick={() => setOctave((o) => Math.max(1, o - 1))}
                  className="w-5 h-5 rounded text-xs font-mono flex items-center justify-center"
                  style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#888' }}>−</button>
          <span className="text-xs font-mono w-4 text-center" style={{ color: '#00e5ff' }}>{octave}</span>
          <button onClick={() => setOctave((o) => Math.min(7, o + 1))}
                  className="w-5 h-5 rounded text-xs font-mono flex items-center justify-center"
                  style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#888' }}>+</button>
        </div>

        <div className="flex-1" />

        {/* BPM */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono" style={{ color: '#555' }}>BPM</span>
          <input type="number" min={40} max={240} value={bpm}
                 onChange={(e) => setBpm(Number(e.target.value))}
                 className="w-14 text-xs text-center px-1 py-1 rounded font-mono"
                 style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#ffe600' }} />
        </div>

        {/* Bars per chord */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono" style={{ color: '#555' }}>Bars/chord</span>
          {[1,2,4].map((b) => (
            <button key={b} onClick={() => setBars(b)}
                    className="text-xs px-2 py-0.5 rounded font-ui transition-all"
                    style={{ background: bars === b ? '#ffe60022' : 'transparent',
                             border: `1px solid ${bars === b ? '#ffe600' : '#1e1e2e'}`,
                             color: bars === b ? '#ffe600' : '#555' }}>{b}</button>
          ))}
        </div>

        <ToggleBtn active={looping} onClick={() => setLooping((v) => !v)} color="#00ff9d">Loop</ToggleBtn>
        <ToggleBtn active={aiOpen} onClick={() => setAiOpen((v) => !v)} color="#b44fff">✦ AI</ToggleBtn>

        {/* Transport */}
        <button onClick={playing ? stopPlay : startPlay}
                className="text-sm px-4 py-1 rounded font-ui font-bold transition-all shrink-0"
                style={{ background: playing ? 'rgba(0,229,255,0.12)' : 'rgba(0,255,157,0.12)',
                         border: `1px solid ${playing ? '#00e5ff' : '#00ff9d'}`,
                         color: playing ? '#00e5ff' : '#00ff9d',
                         boxShadow: playing ? '0 0 10px rgba(0,229,255,0.25)' : 'none' }}>
          {playing ? '■ Stop' : '▶ Play'}
        </button>
      </div>

      {/* ── AI Panel ── */}
      {aiOpen && (
        <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: '#1a1a2e', background: '#0d0d1a' }}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-ui font-semibold tracking-wider" style={{ color: '#b44fff' }}>✦ AI SUGGESTIONS</span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-mono" style={{ color: '#555' }}>Genre</span>
              <select value={aiGenre} onChange={e => setAiGenre(e.target.value)}
                className="text-xs px-2 py-1 rounded font-ui"
                style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#b44fff' }}>
                {['Pop','R&B','Jazz','Hip-Hop','Electronic','Rock','Gospel','Lo-Fi','Latin'].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-mono" style={{ color: '#555' }}>Mood</span>
              <select value={aiMood} onChange={e => setAiMood(e.target.value)}
                className="text-xs px-2 py-1 rounded font-ui"
                style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#b44fff' }}>
                {['Happy','Sad','Epic','Mysterious','Romantic','Tense','Chill','Energetic'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <button
              onClick={generateAI}
              disabled={aiLoading}
              className="px-3 py-1 rounded text-xs font-semibold transition-all"
              style={{ background: '#b44fff22', color: '#b44fff', border: '1px solid #b44fff44', opacity: aiLoading ? 0.6 : 1 }}
            >
              {aiLoading ? 'Generating…' : 'Generate'}
            </button>
            {aiError && <span className="text-xs" style={{ color: '#ff2d55' }}>{aiError}</span>}
          </div>
          {aiSugs.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {aiSugs.map((sug, i) => (
                <div key={i} className="rounded p-2 cursor-pointer transition-all hover:opacity-90"
                  style={{ background: '#b44fff11', border: '1px solid #b44fff33', maxWidth: 220 }}
                  onClick={() => applyAISuggestion(sug.degrees)}
                  title="Click to apply to progression"
                >
                  <div className="text-xs font-semibold mb-0.5" style={{ color: '#b44fff' }}>{sug.name}</div>
                  <div className="text-xs font-mono mb-1" style={{ color: '#8899aa' }}>
                    {sug.degrees.map(d => ['I','II','III','IV','V','VI','VII'][d] || '?').join(' → ')}
                  </div>
                  <div className="text-xs" style={{ color: '#666', fontSize: 10 }}>{sug.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Palette ── */}
        <div className="flex flex-col gap-1 p-3 border-r overflow-y-auto shrink-0"
             style={{ width: 180, borderColor: '#1a1a2e', background: '#0b0b16' }}>
          <div className="text-xs font-ui font-semibold mb-1 tracking-wider"
               style={{ color: '#444' }}>DIATONIC</div>

          {diatonicChords.map((chord) => (
            <PaletteCard
              key={chord.id}
              chord={chord}
              onAudition={() => auditionChord(chord)}
              onDragStart={() => onPaletteDragStart(chord)}
              onDragEnd={onPaletteDragEnd}
              onClick={() => auditionChord(chord)}
            />
          ))}

          {showBorrowed && (
            <>
              <div className="text-xs font-ui font-semibold mt-2 mb-1 tracking-wider"
                   style={{ color: '#444' }}>BORROWED</div>
              {borrowedChords.map((chord) => (
                <PaletteCard
                  key={chord.id}
                  chord={chord}
                  onAudition={() => auditionChord(chord)}
                  onDragStart={() => onPaletteDragStart(chord)}
                  onDragEnd={onPaletteDragEnd}
                  onClick={() => auditionChord(chord)}
                />
              ))}
            </>
          )}
        </div>

        {/* ── Center: progression + analysis ── */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Progression timeline */}
          <div className="p-4 border-b" style={{ borderColor: '#1a1a2e' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-ui font-semibold tracking-wider" style={{ color: '#444' }}>
                PROGRESSION — {filledSlots.length} chord{filledSlots.length !== 1 ? 's' : ''}
              </span>
              <button onClick={clearProgression}
                      className="text-xs px-2 py-0.5 rounded font-ui transition-all"
                      style={{ background: 'transparent', border: '1px solid #1e1e2e', color: '#444' }}>
                Clear
              </button>
            </div>

            <div className="flex gap-2 flex-wrap">
              {progression.map((chord, idx) => (
                <ProgressionSlot
                  key={idx}
                  idx={idx}
                  chord={chord}
                  isActive={currentSlot === idx}
                  isSelected={selectedSlot === idx}
                  onSelect={() => setSelectedSlot(chord ? idx : null)}
                  onRemove={() => removeSlot(idx)}
                  onDrop={() => onSlotDrop(idx)}
                  onDragStart={() => onSlotDragStart(idx)}
                  onDragEnd={onSlotDragEnd}
                  hasDragOver={!!dragChord}
                />
              ))}
            </div>

            {/* Hint */}
            {filledSlots.length === 0 && (
              <div className="mt-3 text-xs font-mono text-center" style={{ color: '#333' }}>
                Drag chords from the palette → or click palette then click a slot
              </div>
            )}
          </div>

          {/* Chord detail / analysis */}
          <div className="flex-1 overflow-y-auto p-4">
            {selectedChord ? (
              <ChordDetail chord={selectedChord} octave={octave} voicing={voicing} onAudition={() => auditionChord(selectedChord)} />
            ) : (
              <ProgressionSummary progression={progression} />
            )}
          </div>
        </div>

        {/* ── Right: scale reference ── */}
        <div className="flex flex-col p-3 border-l shrink-0 overflow-y-auto"
             style={{ width: 200, borderColor: '#1a1a2e', background: '#0b0b16' }}>
          <div className="text-xs font-ui font-semibold mb-2 tracking-wider" style={{ color: '#444' }}>
            SCALE REFERENCE
          </div>
          <ScaleReference root={rootNote} scale={scaleName} />

          <div className="h-px my-3" style={{ background: '#1a1a2e' }} />
          <div className="text-xs font-ui font-semibold mb-2 tracking-wider" style={{ color: '#444' }}>
            COMMON PATTERNS
          </div>
          <CommonPatterns
            chords={diatonicChords}
            onPlace={(chords) => {
              setProgression((prev) => {
                const next = [...prev]
                chords.forEach((c, i) => { if (i < next.length) next[i] = c })
                return next
              })
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────

function ToggleBtn({ active, onClick, color, children }) {
  return (
    <button onClick={onClick}
            className="text-xs px-2 py-0.5 rounded font-ui transition-all shrink-0"
            style={{ background: active ? `${color}22` : 'transparent',
                     border: `1px solid ${active ? color : '#1e1e2e'}`,
                     color: active ? color : '#555' }}>
      {children}
    </button>
  )
}

function PaletteCard({ chord, onAudition, onDragStart, onDragEnd, onClick }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing select-none transition-all hover:scale-105"
      style={{
        background: `${chord.color}18`,
        border: `1px solid ${chord.color}44`,
      }}
      title="Drag to progression or click to audition"
    >
      <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: chord.color }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-ui font-bold" style={{ color: chord.color }}>
          {chord.roman}
        </div>
        <div className="text-xs font-mono truncate" style={{ color: '#666', fontSize: 10 }}>
          {chord.root}{qualityLabel(chord.quality)}
          {chord.noteNames.join('–')}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onAudition() }}
        className="shrink-0 text-xs opacity-50 hover:opacity-100 transition-opacity"
        style={{ color: chord.color }}
        title="Audition"
      >♪</button>
    </div>
  )
}

function ProgressionSlot({ idx, chord, isActive, isSelected, onSelect, onRemove, onDrop, onDragStart, onDragEnd, hasDragOver }) {
  const [isDragOver, setIsDragOver] = useState(false)

  return (
    <div
      draggable={!!chord}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop() }}
      onClick={onSelect}
      className="relative flex flex-col items-center justify-center rounded-lg cursor-pointer select-none transition-all"
      style={{
        width: 90,
        height: 80,
        background: chord
          ? isActive
            ? `${chord.color}33`
            : isSelected
            ? `${chord.color}22`
            : `${chord.color}11`
          : isDragOver
          ? '#1e1e3e'
          : '#111120',
        border: `2px solid ${
          chord
            ? isActive ? chord.color : isSelected ? `${chord.color}99` : `${chord.color}44`
            : isDragOver ? '#5577ff' : '#1a1a2a'
        }`,
        boxShadow: isActive ? `0 0 18px ${chord?.color}66` : 'none',
      }}
    >
      {/* Slot number */}
      <div className="absolute top-1 left-2 text-xs font-mono" style={{ color: '#333', fontSize: 9 }}>
        {idx + 1}
      </div>

      {chord ? (
        <>
          {/* Remove button */}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity text-xs"
            style={{ background: '#ff2d5522', border: '1px solid #ff2d5566', color: '#ff2d55' }}
          >×</button>

          <div className="text-base font-ui font-bold" style={{ color: chord.color }}>{chord.roman}</div>
          <div className="text-xs font-ui mt-0.5" style={{ color: `${chord.color}cc` }}>
            {chord.root}{qualityLabel(chord.quality)}
          </div>
          <div className="text-xs font-mono mt-1" style={{ color: '#555', fontSize: 9 }}>
            {chord.noteNames.join(' ')}
          </div>
          {isActive && (
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                 style={{ background: chord.color, boxShadow: `0 0 6px ${chord.color}` }} />
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-lg" style={{ color: isDragOver ? '#5577ff' : '#222' }}>+</span>
          <span className="text-xs font-mono" style={{ color: isDragOver ? '#5577ff' : '#1a1a2a', fontSize: 9 }}>drop here</span>
        </div>
      )}
    </div>
  )
}

function ChordDetail({ chord, octave, voicing, onAudition }) {
  const freqs = getChordFreqs(chord, octave, voicing)

  const intervalNames = {
    0: 'Root', 1: 'Minor 2nd', 2: 'Major 2nd', 3: 'Minor 3rd', 4: 'Major 3rd',
    5: 'Perfect 4th', 6: 'Tritone', 7: 'Perfect 5th', 8: 'Minor 6th',
    9: 'Major 6th', 10: 'Minor 7th', 11: 'Major 7th',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="text-2xl font-display font-bold" style={{ color: chord.color }}>
          {chord.roman}
        </div>
        <div>
          <div className="text-base font-ui font-semibold" style={{ color: '#e0e0e0' }}>
            {chord.root}{qualityLabel(chord.quality)}
            {chord.quality === 'maj' ? ' Major' : chord.quality === 'min' ? ' Minor' : chord.quality === 'dim' ? ' Diminished' : ' Augmented'}
          </div>
          <div className="text-xs font-mono" style={{ color: '#555' }}>
            {chord.borrowed ? 'Borrowed chord' : `Degree ${chord.degree + 1} of scale`}
          </div>
        </div>
        <button onClick={onAudition}
                className="ml-auto text-sm px-3 py-1 rounded font-ui transition-all"
                style={{ background: `${chord.color}22`, border: `1px solid ${chord.color}66`, color: chord.color }}>
          ♪ Audition
        </button>
      </div>

      {/* Notes */}
      <div>
        <div className="text-xs font-ui font-semibold mb-2 tracking-wider" style={{ color: '#444' }}>NOTES</div>
        <div className="flex gap-2">
          {chord.noteNames.map((note, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center text-sm font-ui font-bold"
                   style={{ background: `${chord.color}22`, border: `1px solid ${chord.color}55`, color: chord.color }}>
                {NOTE_DISPLAY[NOTES.indexOf(note)] || note}
              </div>
              <div className="text-xs font-mono text-center" style={{ color: '#555', fontSize: 9 }}>
                {intervalNames[chord.semiOffsets[i]] || `+${chord.semiOffsets[i]}st`}
              </div>
              <div className="text-xs font-mono text-center" style={{ color: '#333', fontSize: 9 }}>
                {freqs[i] ? `${freqs[i].toFixed(1)} Hz` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Intervals */}
      <div>
        <div className="text-xs font-ui font-semibold mb-2 tracking-wider" style={{ color: '#444' }}>INTERVALS</div>
        <div className="flex gap-1 flex-wrap">
          {chord.semiOffsets.slice(1).map((s, i) => (
            <span key={i} className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#888' }}>
              {intervalNames[s] || `+${s}st`} ({s})
            </span>
          ))}
        </div>
      </div>

      {/* Function hint */}
      <div>
        <div className="text-xs font-ui font-semibold mb-2 tracking-wider" style={{ color: '#444' }}>FUNCTION</div>
        <div className="text-xs font-mono" style={{ color: '#666' }}>
          {chord.degree === 0 && 'Tonic — home, resolution, rest'}
          {chord.degree === 1 && 'Supertonic — mild tension, often moves to V'}
          {chord.degree === 2 && 'Mediant — ambiguous, color chord'}
          {chord.degree === 3 && 'Subdominant — pre-dominant, movement away from tonic'}
          {chord.degree === 4 && 'Dominant — highest tension, wants to resolve to I'}
          {chord.degree === 5 && 'Submediant — relative major/minor, deceptive cadence target'}
          {chord.degree === 6 && 'Leading tone — diminished, very high tension'}
          {chord.degree === -1 && 'Borrowed chord — chromatic color from parallel key'}
        </div>
      </div>
    </div>
  )
}

function ProgressionSummary({ progression }) {
  const filled = progression.filter(Boolean)
  if (!filled.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: '#333' }}>
        <div className="text-4xl">♩</div>
        <div className="text-sm font-mono text-center">
          Build your progression above.<br />
          Drag chords from the palette into the slots.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-ui font-semibold mb-2 tracking-wider" style={{ color: '#444' }}>
          PROGRESSION OVERVIEW
        </div>
        <div className="text-lg font-ui font-bold tracking-wider" style={{ color: '#e0e0e0' }}>
          {filled.map((c, i) => (
            <span key={i}>
              <span style={{ color: c.color }}>{c.roman}</span>
              {i < filled.length - 1 && <span style={{ color: '#333' }}> – </span>}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-ui font-semibold mb-2 tracking-wider" style={{ color: '#444' }}>
          ALL NOTES USED
        </div>
        <div className="flex gap-1 flex-wrap">
          {[...new Set(filled.flatMap((c) => c.noteNames))].map((n) => (
            <span key={n} className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', color: '#888' }}>
              {NOTE_DISPLAY[NOTES.indexOf(n)] || n}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-ui font-semibold mb-2 tracking-wider" style={{ color: '#444' }}>
          CHORD NOTES (per slot)
        </div>
        <div className="space-y-1.5">
          {progression.map((chord, i) => chord && (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs font-mono w-4 text-right" style={{ color: '#333' }}>{i+1}</span>
              <span className="text-xs font-ui font-bold w-12" style={{ color: chord.color }}>{chord.roman}</span>
              <span className="text-xs font-mono" style={{ color: '#666' }}>
                {chord.noteNames.map((n) => NOTE_DISPLAY[NOTES.indexOf(n)] || n).join(' – ')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ScaleReference({ root, scale }) {
  const intervals = SCALES[scale]
  const rootIdx = NOTES.indexOf(root)
  const scaleNotes = intervals.map((s) => NOTES[(rootIdx + s) % 12])

  return (
    <div className="space-y-1">
      {scaleNotes.map((note, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-5 text-xs font-mono text-right" style={{ color: '#333' }}>{i + 1}</div>
          <div className="flex-1 px-2 py-0.5 rounded text-xs font-ui"
               style={{ background: `${DEGREE_COLORS[i]}18`, border: `1px solid ${DEGREE_COLORS[i]}33`, color: DEGREE_COLORS[i] }}>
            {NOTE_DISPLAY[NOTES.indexOf(note)] || note}
          </div>
          <div className="text-xs font-mono" style={{ color: '#333', fontSize: 9 }}>
            {ROMAN[i]}
          </div>
        </div>
      ))}
    </div>
  )
}

const PATTERNS = [
  { name: 'I–IV–V',       degrees: [0,3,4,0] },
  { name: 'I–V–vi–IV',    degrees: [0,4,5,3] },
  { name: 'I–vi–IV–V',    degrees: [0,5,3,4] },
  { name: 'ii–V–I',       degrees: [1,4,0,0] },
  { name: 'I–IV–vi–V',    degrees: [0,3,5,4] },
  { name: 'vi–IV–I–V',    degrees: [5,3,0,4] },
  { name: 'I–iii–IV–V',   degrees: [0,2,3,4] },
  { name: '12-Bar Blues',  degrees: [0,0,0,0,3,3,0,0,4,3,0,4] },
]

function CommonPatterns({ chords, onPlace }) {
  return (
    <div className="space-y-1">
      {PATTERNS.map((p) => (
        <button
          key={p.name}
          onClick={() => onPlace(p.degrees.slice(0, 8).map((d) => chords[d] || null))}
          className="w-full text-left px-2 py-1.5 rounded text-xs font-ui transition-all hover:brightness-150"
          style={{ background: '#111120', border: '1px solid #1a1a2e', color: '#666' }}
        >
          <div style={{ color: '#888' }}>{p.name}</div>
          <div className="font-mono mt-0.5" style={{ color: '#555', fontSize: 9 }}>
            {p.degrees.slice(0,8).map((d) => ROMAN[d]).join(' – ')}
          </div>
        </button>
      ))}
    </div>
  )
}
