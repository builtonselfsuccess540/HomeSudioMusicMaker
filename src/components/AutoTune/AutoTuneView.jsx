import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getCtx } from '../../audio/audioEngine'

// ── Music helpers ─────────────────────────────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

const freqToMidi  = (f) => f > 0 ? 69 + 12 * Math.log2(f / 440) : 0
const midiToFreq  = (m) => 440 * Math.pow(2, (m - 69) / 12)
const midiToName  = (m) => NOTE_NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(m / 12) - 1)
const centsDiff   = (f, tgtMidi) => (freqToMidi(f) - tgtMidi) * 100

const SCALES = {
  'Chromatic':     [0,1,2,3,4,5,6,7,8,9,10,11],
  'Major':         [0,2,4,5,7,9,11],
  'Minor':         [0,2,3,5,7,8,10],
  'Pentatonic Maj':[0,2,4,7,9],
  'Pentatonic Min':[0,3,5,7,10],
  'Blues':         [0,3,5,6,7,10],
  'Dorian':        [0,2,3,5,7,9,10],
  'Mixolydian':    [0,2,4,5,7,9,10],
  'Harmonic Min':  [0,2,3,5,7,8,11],
}
const ROOT_NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

function getScaleNotes(root, intervals) {
  const r = ROOT_NOTES.indexOf(root)
  return intervals.map(i => (r + i) % 12)
}

function nearestScaleNote(midiFloat, scaleNotes) {
  const mod = ((midiFloat % 12) + 12) % 12
  let best = scaleNotes[0], bestDist = Infinity
  for (const n of scaleNotes) {
    const d = Math.min(Math.abs(mod - n), 12 - Math.abs(mod - n))
    if (d < bestDist) { bestDist = d; best = n }
  }
  return Math.floor(midiFloat / 12) * 12 + best
}

// ── YIN pitch detector ────────────────────────────────────────────────────────
// Much more accurate than autocorrelation, avoids octave errors
function detectPitch(buf, sr) {
  const N = buf.length
  let rms = 0
  for (let i = 0; i < N; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / N)
  if (rms < 0.002) return -1  // silence

  const minLag = Math.floor(sr / 900)
  const maxLag = Math.floor(sr / 60)
  const d = new Float32Array(maxLag + 1)

  for (let t = minLag; t <= maxLag; t++) {
    let sum = 0
    for (let i = 0; i < N - t; i++) {
      const diff = buf[i] - buf[i + t]
      sum += diff * diff
    }
    d[t] = sum
  }

  // Cumulative mean normalized difference
  const dp = new Float32Array(maxLag + 1)
  dp[0] = 1
  let cum = 0
  for (let t = 1; t <= maxLag; t++) {
    cum += d[t]
    dp[t] = cum > 0 ? d[t] * t / cum : 1
  }

  const THRESH = 0.12
  for (let t = minLag + 1; t < maxLag - 1; t++) {
    if (dp[t] < THRESH && dp[t] < dp[t - 1] && dp[t] <= dp[t + 1]) {
      // Parabolic interpolation for sub-sample accuracy
      const den = 2 * dp[t] - dp[t-1] - dp[t+1]
      const t2 = den > 0 ? t + 0.5 * (dp[t+1] - dp[t-1]) / den : t
      return sr / t2
    }
  }

  // Fallback: global minimum
  let bT = minLag, bV = Infinity
  for (let t = minLag; t <= maxLag; t++) if (dp[t] < bV) { bV = dp[t]; bT = t }
  return bV < 0.3 ? sr / bT : -1
}

// ── OLA Pitch Shifter ─────────────────────────────────────────────────────────
// Proper overlap-add pitch shifting: advance the analysis read pointer by
// HOP * ratio per grain while the synthesis write pointer advances by HOP.
// ratio > 1  → reads through input faster → pitch UP  ✓
// ratio < 1  → reads through input slower → pitch DOWN ✓
// No in-grain resampling — adjacent grains stay phase-coherent at boundaries.
function createOLAShifter() {
  const RING  = 32768
  const MASK  = RING - 1
  const GRAIN = 2048   // larger grain = better quality on lower voices
  const HOP   = 512    // 75% overlap

  const WIN = new Float32Array(GRAIN)
  for (let i = 0; i < GRAIN; i++) WIN[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (GRAIN - 1)))

  const inRing  = new Float32Array(RING)
  const outAcc  = new Float32Array(RING)
  const outWgt  = new Float32Array(RING)

  let inWrite  = GRAIN   // pre-fill with silence so first read is valid
  let inRead   = 0.0     // float so fractional hops accumulate correctly
  let outWrite = 0
  let outRead  = 0
  let ratio    = 1.0

  return {
    setRatio: (r) => { ratio = Math.max(0.25, Math.min(4, r)) },

    process: (input, output) => {
      const N = input.length

      for (let i = 0; i < N; i++) inRing[(inWrite + i) & MASK] = input[i]
      inWrite += N

      while (outWrite - outRead < N + GRAIN) {
        const rp = Math.floor(inRead)
        if (rp + GRAIN > inWrite) break  // not enough buffered input yet

        for (let k = 0; k < GRAIN; k++) {
          const s  = WIN[k] * inRing[(rp + k) & MASK]
          const oi = (outWrite + k) & MASK
          outAcc[oi] += s
          outWgt[oi] += WIN[k]
        }

        inRead   += HOP * ratio   // analysis hop: larger ratio = reads more input = pitch UP
        outWrite += HOP            // synthesis hop: always constant
      }

      for (let i = 0; i < N; i++) {
        const oi = (outRead + i) & MASK
        output[i] = outWgt[oi] > 1e-6 ? outAcc[oi] / outWgt[oi] : 0
        outAcc[oi] = 0
        outWgt[oi] = 0
      }
      outRead += N
    },
  }
}

// ── Pitch display canvas ──────────────────────────────────────────────────────
function PitchDisplay({ detectedFreq, cents, noteName, targetName }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    const w = c.width, h = c.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#050510'
    ctx.fillRect(0, 0, w, h)

    // Grid lines
    ;[-50,-25,0,25,50].forEach(v => {
      const x = w / 2 + (v / 60) * (w * 0.72)
      ctx.strokeStyle = v === 0 ? '#00ff9d33' : '#141426'
      ctx.lineWidth = v === 0 ? 1.5 : 0.5
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h - 16); ctx.stroke()
      ctx.fillStyle = '#3a3a5a'
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(v === 0 ? '0¢' : `${v > 0 ? '+' : ''}${v}¢`, x, h - 4)
    })

    if (detectedFreq > 0) {
      const clamp = Math.max(-60, Math.min(60, cents))
      const x = w / 2 + (clamp / 60) * (w * 0.72)
      const col = Math.abs(cents) < 8 ? '#00ff9d' : Math.abs(cents) < 25 ? '#ffe600' : '#ff2d55'

      // Glow bar
      ctx.shadowColor = col; ctx.shadowBlur = 12
      ctx.fillStyle = col
      ctx.fillRect(x - 3, 10, 6, h - 30)
      ctx.shadowBlur = 0

      // Labels
      ctx.font = 'bold 20px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = col
      ctx.fillText(noteName, w / 2 - 50, h / 2 + 6)

      ctx.fillStyle = '#00ff9d'
      ctx.font = 'bold 20px monospace'
      ctx.fillText('→', w / 2, h / 2 + 6)

      ctx.fillStyle = '#00e5ff'
      ctx.fillText(targetName || noteName, w / 2 + 50, h / 2 + 6)

      ctx.fillStyle = '#445'
      ctx.font = '10px monospace'
      ctx.fillText(`${detectedFreq.toFixed(1)} Hz  ·  ${cents > 0 ? '+' : ''}${Math.round(cents)}¢`, w / 2, h - 20)
    } else {
      ctx.fillStyle = '#334'
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Sing or speak into your mic…', w / 2, h / 2)
    }
  }, [detectedFreq, cents, noteName, targetName])
  return <canvas ref={ref} width={480} height={90} style={{ borderRadius: 6, border: '1px solid #1a1a2e', display: 'block', width: '100%' }} />
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AutoTuneView() {
  const [active,       setActive]       = useState(false)
  const [scale,        setScale]        = useState('Major')
  const [root,         setRoot]         = useState('C')
  const [mode,         setMode]         = useState('scale')
  const [manualNote,   setManualNote]   = useState(60)
  const [speed,        setSpeed]        = useState(100)
  const [wet,          setWet]          = useState(1.0)
  const [formant,      setFormant]      = useState(0)
  const [bypass,       setBypass]       = useState(false)
  const [detectedHz,   setDetectedHz]   = useState(0)
  const [detectedNote, setDetectedNote] = useState('')
  const [targetNote,   setTargetNote]   = useState('')
  const [cents,        setCents]        = useState(0)
  const [pitchHistory, setPitchHistory] = useState([])
  const [errorMsg,     setErrorMsg]     = useState('')
  const [headphones,   setHeadphones]   = useState(false)

  // ── MIDI keyboard control (Mode 2) ────────────────────────────────────────
  const [midiReady,   setMidiReady]   = useState(false)
  const [midiError,   setMidiError]   = useState('')
  const [midiDevices, setMidiDevices] = useState([])
  const [heldNotes,   setHeldNotes]   = useState(new Set())

  // ── Refs for audio params (updated live without restart) ──────────────────
  const modeRef      = useRef(mode)
  const speedRef     = useRef(speed)
  const wetRef       = useRef(wet)
  const bypassRef    = useRef(bypass)
  const manualNoteRef = useRef(manualNote)
  const shiftRef     = useRef(0)   // current pitch shift in semitones (smoothed)

  const scaleNotes = useMemo(() => getScaleNotes(root, SCALES[scale] || SCALES.Major), [root, scale])
  const scaleNotesRef = useRef(scaleNotes)

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => { wetRef.current = wet }, [wet])
  useEffect(() => { bypassRef.current = bypass }, [bypass])
  useEffect(() => { manualNoteRef.current = manualNote }, [manualNote])
  useEffect(() => { scaleNotesRef.current = scaleNotes }, [scaleNotes])

  // ── Audio nodes ───────────────────────────────────────────────────────────
  const streamRef    = useRef(null)
  const analyserRef  = useRef(null)
  const scriptRef    = useRef(null)
  const sourceRef    = useRef(null)
  const formantRef   = useRef(null)
  const frameRef     = useRef(null)
  const heldNotesRef = useRef(new Set())  // used inside onaudioprocess (no stale closure)
  const midiAccessRef = useRef(null)

  // ── MIDI init ─────────────────────────────────────────────────────────────
  const initMidi = useCallback(async () => {
    if (!navigator.requestMIDIAccess) {
      setMidiError('Web MIDI is not supported in this environment.')
      return
    }
    try {
      const access = await navigator.requestMIDIAccess()
      midiAccessRef.current = access
      setMidiReady(true)
      setMidiError('')

      const wireInputs = () => {
        const inputs = [...access.inputs.values()]
        setMidiDevices(inputs.map(i => ({ id: i.id, name: i.name })))
        inputs.forEach(input => {
          input.onmidimessage = (e) => {
            const [status, note, velocity] = e.data
            const type = status & 0xF0
            if (type === 0x90 && velocity > 0) {
              heldNotesRef.current = new Set(heldNotesRef.current).add(note)
            } else if (type === 0x80 || (type === 0x90 && velocity === 0)) {
              const s = new Set(heldNotesRef.current); s.delete(note)
              heldNotesRef.current = s
            }
            setHeldNotes(new Set(heldNotesRef.current))
          }
        })
      }

      wireInputs()
      access.onstatechange = wireInputs
    } catch (_) {
      setMidiError('MIDI access denied — check browser/OS settings.')
      setMidiReady(false)
    }
  }, [])

  // Cleanup MIDI listeners on unmount
  useEffect(() => () => {
    if (midiAccessRef.current) {
      ;[...midiAccessRef.current.inputs.values()].forEach(i => { i.onmidimessage = null })
    }
  }, [])

  // ── Start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    try {
      // Headphones break the physical feedback loop so echo cancellation isn't needed.
      // Without headphones, speakers feed back into the mic — echo cancellation prevents that.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: !headphones,
          noiseSuppression: !headphones,
          autoGainControl:  !headphones,
        },
        video: false,
      })
      streamRef.current = stream
      const ctx = getCtx()
      if (ctx.state === 'suspended') await ctx.resume()

      const source   = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.0

      // Formant / eq shaper
      const formantNode = ctx.createBiquadFilter()
      formantNode.type = 'peaking'
      formantNode.frequency.value = 1200
      formantNode.Q.value = 1.5
      formantNode.gain.value = formant
      formantRef.current = formantNode

      // OLA pitch shifter (stateful, created once)
      const shifter = createOLAShifter()
      const pitchBuf = new Float32Array(analyser.fftSize)
      let smoothedShift = 0

      const BUF = 2048
      const script = ctx.createScriptProcessor(BUF, 1, 1)

      script.onaudioprocess = (ev) => {
        const inp = ev.inputBuffer.getChannelData(0)
        const out = ev.outputBuffer.getChannelData(0)

        // Bypass: pass through cleanly
        if (bypassRef.current) { out.set(inp); return }

        // --- Pitch detection (runs on every block) ---
        analyser.getFloatTimeDomainData(pitchBuf)
        const freq = detectPitch(pitchBuf, ctx.sampleRate)

        if (freq > 55 && freq < 1800) {
          const midiF = freqToMidi(freq)
          let targetMidi = midiF

          const m = modeRef.current
          if (m === 'scale') {
            targetMidi = nearestScaleNote(midiF, scaleNotesRef.current)
          } else if (m === 'manual') {
            targetMidi = manualNoteRef.current
          } else if (m === 'midi') {
            // Snap to the nearest held MIDI key (pitch-class match, correct octave)
            const held = heldNotesRef.current
            if (held.size > 0) {
              let bestPc = -1, bestDist = Infinity
              for (const n of held) {
                const pc  = n % 12
                const mod = ((midiF % 12) + 12) % 12
                const d   = Math.min(Math.abs(mod - pc), 12 - Math.abs(mod - pc))
                if (d < bestDist) { bestDist = d; bestPc = pc }
              }
              if (bestPc >= 0) {
                const oct = Math.round((midiF - bestPc) / 12)
                targetMidi = oct * 12 + bestPc
              }
            }
            // No keys held → pass through unchanged (targetMidi stays = midiF)
          } else {
            // free: snap to nearest chromatic semitone
            targetMidi = Math.round(midiF)
          }

          // Smooth toward target (speed controls attack)
          const spd = speedRef.current / 100
          // Low speed = slow glide (natural). High speed = instant snap (T-Pain).
          const attackCoeff = 1 - Math.pow(1 - spd, BUF / ctx.sampleRate * 60)
          const semDiff = targetMidi - midiF
          smoothedShift = smoothedShift + (semDiff - smoothedShift) * Math.max(0.01, attackCoeff)
          shiftRef.current = smoothedShift
        } else {
          // No signal: glide back to 0
          smoothedShift *= 0.97
          shiftRef.current = smoothedShift
        }

        // --- OLA pitch shift ---
        const ratio = Math.pow(2, shiftRef.current / 12)
        shifter.setRatio(ratio)
        const shifted = new Float32Array(BUF)
        shifter.process(inp, shifted)

        // --- Wet/dry mix ---
        const w = wetRef.current
        for (let i = 0; i < BUF; i++) {
          out[i] = shifted[i] * w + inp[i] * (1 - w)
        }
      }

      source.connect(analyser)
      source.connect(script)
      script.connect(formantNode)
      formantNode.connect(ctx.destination)

      sourceRef.current  = source
      analyserRef.current = analyser
      scriptRef.current  = script

      setActive(true)
      setErrorMsg('')
    } catch (e) {
      setErrorMsg(e.message?.includes('denied') ? 'Microphone access denied — check your browser settings.' : (e.message || 'Could not start microphone'))
    }
  }, [formant, headphones])

  // ── Stop ─────────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    try { scriptRef.current?.disconnect() }   catch {}
    try { sourceRef.current?.disconnect() }   catch {}
    try { formantRef.current?.disconnect() }  catch {}
    streamRef.current?.getTracks().forEach(t => t.stop())
    cancelAnimationFrame(frameRef.current)
    shiftRef.current = 0
    setActive(false)
    setDetectedHz(0); setDetectedNote(''); setTargetNote(''); setCents(0)
  }, [])

  // ── Formant update while running ──────────────────────────────────────────
  useEffect(() => {
    if (formantRef.current) formantRef.current.gain.value = formant
  }, [formant])

  // ── Pitch meter display loop ──────────────────────────────────────────────
  useEffect(() => {
    if (!active) return
    const tick = () => {
      const an = analyserRef.current
      if (!an) { frameRef.current = requestAnimationFrame(tick); return }
      const buf = new Float32Array(an.fftSize)
      an.getFloatTimeDomainData(buf)
      const freq = detectPitch(buf, getCtx().sampleRate)
      if (freq > 55 && freq < 1800) {
        const midi    = freqToMidi(freq)
        const tgt     = mode === 'scale' ? nearestScaleNote(midi, scaleNotes)
                      : mode === 'manual' ? manualNote
                      : mode === 'midi' ? (() => {
                          const held = heldNotesRef.current
                          if (held.size > 0) {
                            let bestPc = -1, bestDist = Infinity
                            for (const n of held) {
                              const pc  = n % 12
                              const mod = ((midi % 12) + 12) % 12
                              const d   = Math.min(Math.abs(mod - pc), 12 - Math.abs(mod - pc))
                              if (d < bestDist) { bestDist = d; bestPc = pc }
                            }
                            if (bestPc >= 0) return Math.round((midi - bestPc) / 12) * 12 + bestPc
                          }
                          return Math.round(midi)
                        })()
                      : Math.round(midi)
        const c       = centsDiff(freq, tgt)
        setDetectedHz(freq)
        setDetectedNote(midiToName(Math.round(midi)))
        setTargetNote(midiToName(tgt))
        setCents(c)
        setPitchHistory(h => [...h.slice(-99), { midi, tgt }])
      } else {
        setDetectedHz(0)
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [active, mode, scaleNotes, manualNote])

  useEffect(() => () => stop(), [])

  const inTune = Math.abs(cents) < 10

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#080810' }}>

      {/* ── Left: controls ── */}
      <div className="flex flex-col gap-4 p-4 border-r border-studio-border shrink-0 overflow-y-auto" style={{ width: 250 }}>
        <div className="flex items-center justify-between">
          <span className="font-display text-xs tracking-widest uppercase"
            style={{ background: 'linear-gradient(90deg,#b44fff,#00e5ff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            Auto-Tune
          </span>
          <button onClick={active ? stop : start}
            className="px-3 py-1 rounded text-xs font-mono font-bold transition-all"
            style={{ background: active ? '#ff2d5522' : '#00e5ff22', border: `1px solid ${active ? '#ff2d55' : '#00e5ff'}`, color: active ? '#ff2d55' : '#00e5ff' }}>
            {active ? 'STOP' : 'START'}
          </button>
        </div>

        {/* Status dot */}
        <div className="flex items-center gap-2">
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#00ff9d' : '#333', boxShadow: active ? '0 0 8px #00ff9d' : 'none', transition: 'all 0.3s' }} />
          <span className="font-mono text-xs" style={{ color: active ? '#00ff9d' : '#445' }}>
            {active ? 'Live — pitch correction active' : 'Standby'}
          </span>
        </div>

        {/* Headphones toggle — controls echo cancellation */}
        <button
          onClick={() => { const next = !headphones; setHeadphones(next); if (active) { stop(); setTimeout(start, 100) } }}
          className="flex items-center gap-2 px-3 py-2 rounded text-xs font-mono transition-all w-full text-left"
          style={{
            background: headphones ? '#00ff9d18' : '#ff2d5514',
            border: `1px solid ${headphones ? '#00ff9d55' : '#ff2d5540'}`,
            color: headphones ? '#00ff9d' : '#ff8099',
          }}>
          <span style={{ fontSize: 14 }}>{headphones ? '🎧' : '🔊'}</span>
          <div>
            <div className="font-semibold">{headphones ? 'Headphones mode' : 'Speaker mode (echo cancel ON)'}</div>
            <div style={{ fontSize: 9, marginTop: 1, color: headphones ? '#00cc7a' : '#cc4455', lineHeight: 1.4 }}>
              {headphones
                ? 'Echo cancel OFF — best quality. Requires headphones to prevent feedback.'
                : 'Echo cancel ON — prevents mic feedback from speakers. Toggle if using headphones.'}
            </div>
          </div>
        </button>

        {!headphones && (
          <div className="text-xs font-mono px-2 py-1.5 rounded" style={{ background: '#ffe60010', color: '#ffe600aa', border: '1px solid #ffe60030', lineHeight: 1.5 }}>
            Using speakers? Echo cancel is protecting you from feedback. Switch to Headphones mode for better pitch quality.
          </div>
        )}

        {errorMsg && (
          <div className="text-xs font-mono p-2 rounded" style={{ background: '#ff2d5514', color: '#ff8099', border: '1px solid #ff2d5540' }}>
            {errorMsg}
          </div>
        )}

        {/* Mode */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Mode</div>
          <div className="flex flex-col gap-1">
            {[
              ['scale',  'Mode 1 · Scale Snap'],
              ['free',   'Mode 1 · Free (Chromatic)'],
              ['manual', 'Mode 1 · Lock to Note'],
              ['midi',   'Mode 2 · MIDI Keyboard'],
            ].map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)}
                className="px-2 py-1.5 rounded text-xs font-mono font-semibold text-left transition-all"
                style={{
                  background: mode===m ? (m==='midi'?'#ff950022':'#b44fff22') : '#ffffff0a',
                  border: `1px solid ${mode===m ? (m==='midi'?'#ff9500':'#b44fff') : '#333'}`,
                  color: mode===m ? (m==='midi'?'#ff9500':'#b44fff') : '#888',
                }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Scale + Root (only in scale mode) */}
        {mode === 'scale' && (
          <div className="flex flex-col gap-2">
            <div>
              <div className="font-mono text-xs text-studio-dim mb-1 uppercase tracking-wider">Root</div>
              <div className="grid grid-cols-4 gap-1">
                {ROOT_NOTES.map(n => (
                  <button key={n} onClick={() => setRoot(n)}
                    className="py-1 rounded text-xs font-mono font-bold transition-all"
                    style={{ background: root===n?'#b44fff33':'#ffffff0a', border:`1px solid ${root===n?'#b44fff':'#333'}`, color: root===n?'#b44fff':'#888' }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="font-mono text-xs text-studio-dim mb-1 uppercase tracking-wider">Scale</div>
              <select value={scale} onChange={e => setScale(e.target.value)}
                className="w-full bg-studio-void border border-studio-border rounded px-2 py-1 text-xs font-mono text-studio-text focus:outline-none focus:border-studio-purple">
                {Object.keys(SCALES).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Manual note lock */}
        {mode === 'manual' && (
          <div>
            <div className="font-mono text-xs text-studio-dim mb-1 uppercase tracking-wider">Lock to Note</div>
            <div className="grid grid-cols-3 gap-1 max-h-48 overflow-y-auto">
              {Array.from({ length: 37 }, (_, i) => i + 36).map(m => (
                <button key={m} onClick={() => setManualNote(m)}
                  className="py-1 rounded text-xs font-mono transition-all"
                  style={{ background: manualNote===m?'#00e5ff22':'#ffffff0a', border:`1px solid ${manualNote===m?'#00e5ff':'#333'}`, color: manualNote===m?'#00e5ff':'#888' }}>
                  {midiToName(m)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MIDI mode controls */}
        {mode === 'midi' && (
          <div className="flex flex-col gap-2">
            <div className="font-mono text-xs uppercase tracking-wider" style={{ color: '#ff9500' }}>MIDI Keyboard Control</div>

            {!midiReady ? (
              <button onClick={initMidi}
                className="px-3 py-2 rounded text-xs font-mono font-bold transition-all"
                style={{ background: '#ff950022', border: '1px solid #ff9500', color: '#ff9500' }}>
                Connect MIDI Device
              </button>
            ) : (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: '#ff950012', border: '1px solid #ff950044' }}>
                <div className="w-2 h-2 rounded-full" style={{ background: '#ff9500', boxShadow: '0 0 6px #ff9500' }} />
                <span className="font-mono text-xs" style={{ color: '#ff9500' }}>MIDI ready</span>
              </div>
            )}

            {midiError && (
              <div className="font-mono text-xs px-2 py-1.5 rounded" style={{ background: '#ff2d5514', color: '#ff8099', border: '1px solid #ff2d5540' }}>
                {midiError}
              </div>
            )}

            {midiDevices.length > 0 && (
              <div className="flex flex-col gap-1">
                {midiDevices.map(d => (
                  <div key={d.id} className="font-mono text-xs px-2 py-1 rounded flex items-center gap-2" style={{ background: '#ffffff08', border: '1px solid #2a2a3e' }}>
                    <span style={{ color: '#ff9500', fontSize: 10 }}>♪</span>
                    <span style={{ color: '#888', fontSize: 10 }}>{d.name}</span>
                  </div>
                ))}
              </div>
            )}

            {midiDevices.length === 0 && midiReady && (
              <div className="font-mono text-xs" style={{ color: '#445' }}>
                No MIDI devices found. Plug in a keyboard and click Connect again.
              </div>
            )}

            {heldNotes.size > 0 && (
              <div className="px-2 py-1.5 rounded" style={{ background: '#ff950015', border: '1px solid #ff950055' }}>
                <div className="font-mono text-xs mb-1" style={{ color: '#ff9500' }}>Holding:</div>
                <div className="flex gap-1 flex-wrap">
                  {[...heldNotes].sort((a,b) => a-b).map(n => (
                    <span key={n} className="font-mono font-bold" style={{ fontSize: 10, color: '#fff', background: '#ff950033', padding: '1px 5px', borderRadius: 4 }}>
                      {midiToName(n)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="font-mono text-xs" style={{ color: '#334', lineHeight: 1.6 }}>
              Hold any key(s) on your MIDI keyboard — your voice snaps to those exact notes. Release a key to let that note go. Sing and play chords for harmony locking.
            </div>
          </div>
        )}

        {/* Quick presets */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Quick Presets</div>
          <div className="grid grid-cols-3 gap-1">
            {[
              { label: 'Natural',  speed: 15,  wet: 0.8,  desc: 'Subtle, transparent' },
              { label: 'T-Pain',   speed: 100, wet: 1.0,  desc: 'Hard snap, robotic' },
              { label: 'Subtle',   speed: 40,  wet: 0.85, desc: 'Gentle correction'  },
            ].map(p => (
              <button key={p.label}
                onClick={() => { setSpeed(p.speed); setWet(p.wet) }}
                className="flex flex-col items-center py-2 rounded text-xs font-mono font-semibold transition-all"
                style={{ background: '#ffffff08', border: '1px solid #2a2a3e', color: '#aaa' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#b44fff'; e.currentTarget.style.color='#b44fff' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#2a2a3e'; e.currentTarget.style.color='#aaa' }}>
                <span>{p.label}</span>
                <span style={{ fontSize: 8, color: '#445', marginTop: 2 }}>{p.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Retune Speed */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="font-mono text-xs text-studio-dim uppercase tracking-wider">Retune Speed</span>
            <span className="font-mono text-xs" style={{ color: '#00e5ff' }}>{speed}%</span>
          </div>
          <input type="range" min={1} max={100} value={speed} onChange={e => setSpeed(Number(e.target.value))} className="w-full" />
          <div className="flex justify-between font-mono mt-0.5" style={{ fontSize: 9, color: '#445' }}>
            <span>Natural</span><span>Hard (T-Pain)</span>
          </div>
        </div>

        {/* Wet/Dry */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="font-mono text-xs text-studio-dim uppercase tracking-wider">Wet Mix</span>
            <span className="font-mono text-xs" style={{ color: '#b44fff' }}>{Math.round(wet * 100)}%</span>
          </div>
          <input type="range" min={0} max={1} step={0.01} value={wet} onChange={e => setWet(Number(e.target.value))} className="w-full" />
          <div className="flex justify-between font-mono mt-0.5" style={{ fontSize: 9, color: '#445' }}>
            <span>Dry (original)</span><span>Full corrected</span>
          </div>
        </div>

        {/* Formant */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="font-mono text-xs text-studio-dim uppercase tracking-wider">Formant Shape</span>
            <span className="font-mono text-xs" style={{ color: '#ff9500' }}>{formant > 0 ? '+' : ''}{formant} dB</span>
          </div>
          <input type="range" min={-12} max={12} step={1} value={formant} onChange={e => setFormant(Number(e.target.value))} className="w-full" />
          <div className="flex justify-between font-mono mt-0.5" style={{ fontSize: 9, color: '#445' }}>
            <span>Warmer</span><span>Brighter</span>
          </div>
        </div>

        {/* Bypass */}
        <button onClick={() => setBypass(v => !v)}
          className="px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all"
          style={{ background: bypass?'#ffe60022':'#ffffff0a', border:`1px solid ${bypass?'#ffe600':'#333'}`, color: bypass?'#ffe600':'#888' }}>
          {bypass ? '⚡ BYPASS ON (dry pass-through)' : 'BYPASS OFF'}
        </button>
      </div>

      {/* ── Right: meters + display ── */}
      <div className="flex-1 flex flex-col gap-4 p-4 overflow-y-auto">

        {/* Stat bar */}
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { label: 'Detected', val: detectedNote || '—', color: '#b44fff' },
            { label: 'Target',   val: targetNote   || '—', color: '#00ff9d' },
            { label: 'Offset',   val: detectedHz > 0 ? `${cents > 0?'+':''}${Math.round(cents)}¢` : '—',
              color: inTune ? '#00ff9d' : Math.abs(cents) < 25 ? '#ffe600' : '#ff2d55' },
            { label: 'Shift',    val: active ? `${shiftRef.current > 0?'+':''}${shiftRef.current.toFixed(2)}st` : '—', color: '#00e5ff' },
          ].map(s => (
            <div key={s.label} style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:'6px 14px', textAlign:'center', minWidth:80 }}>
              <div className="font-mono font-bold text-base" style={{ color: s.color }}>{s.val}</div>
              <div className="font-mono" style={{ fontSize: 9, color: '#445' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Live correction meter */}
        {active && (
          <div style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:'10px 14px' }}>
            <div className="flex justify-between mb-2">
              <span className="font-mono text-xs text-studio-dim uppercase tracking-wider">Live Correction</span>
              <span className="font-mono text-xs" style={{ color: Math.abs(shiftRef.current) > 0.05 ? '#00ff9d' : '#334' }}>
                {Math.abs(shiftRef.current) > 0.05 ? '● ACTIVE' : '○ no signal / in tune'}
              </span>
            </div>
            <div style={{ position:'relative', height:10, borderRadius:6, background:'#111' }}>
              <div style={{ position:'absolute', left:'50%', top:0, width:1, height:'100%', background:'#333' }} />
              {(() => {
                const st = Math.max(-6, Math.min(6, shiftRef.current))
                const w = Math.abs(st) / 6 * 50
                const left = st < 0 ? `${50 - w}%` : '50%'
                const col = Math.abs(st) > 2 ? '#ff2d55' : Math.abs(st) > 0.5 ? '#ffe600' : '#00ff9d'
                return <div style={{ position:'absolute', top:1, bottom:1, left, width:`${w}%`, background:col, borderRadius:4, transition:'all 0.05s', boxShadow:`0 0 6px ${col}88` }} />
              })()}
            </div>
            <div className="flex justify-between font-mono mt-1" style={{ fontSize:8, color:'#334' }}>
              <span>−6st</span><span>0</span><span>+6st</span>
            </div>
            {!detectedHz && (
              <div className="font-mono mt-2 text-center" style={{ fontSize:9, color:'#445' }}>
                Sing or hum clearly into your mic — the bar will move when a pitch is detected
              </div>
            )}
          </div>
        )}

        {/* Pitch display */}
        <PitchDisplay detectedFreq={detectedHz} cents={cents} noteName={detectedNote} targetName={targetNote} />

        {/* Pitch history scatter */}
        <div style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:12, height:130, position:'relative', overflow:'hidden' }}>
          <div className="font-mono text-xs text-studio-dim mb-1">Pitch History (detected · → · corrected)</div>
          <div style={{ position:'absolute', inset:'26px 12px 8px' }}>
            {pitchHistory.map((p, i) => {
              const pct = i / pitchHistory.length
              const y1 = Math.max(0, Math.min(100, ((84 - p.midi) / 36) * 100))
              const y2 = Math.max(0, Math.min(100, ((84 - p.tgt) / 36) * 100))
              return (
                <React.Fragment key={i}>
                  <div style={{ position:'absolute', left:`${pct*100}%`, top:`${y1}%`, width:2, height:2, borderRadius:'50%', background:'#b44fff88' }} />
                  <div style={{ position:'absolute', left:`${pct*100}%`, top:`${y2}%`, width:2, height:2, borderRadius:'50%', background:'#00ff9d99' }} />
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* Scale notes chips */}
        {mode === 'scale' && (
          <div style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:12 }}>
            <div className="font-mono text-xs text-studio-dim mb-2">{root} {scale}</div>
            <div className="flex gap-1">
              {NOTE_NAMES.map((n, i) => {
                const on = scaleNotes.includes(i)
                return (
                  <div key={n} style={{ flex:1, padding:'5px 0', borderRadius:4, textAlign:'center', background: on?'#b44fff22':'#ffffff05', border:`1px solid ${on?'#b44fff44':'#1a1a2e'}` }}>
                    <span className="font-mono font-bold" style={{ fontSize:9, color: on?'#b44fff':'#2a2a3a' }}>{n}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* MIDI keyboard visualizer */}
        {mode === 'midi' && (
          <div style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:12 }}>
            <div className="font-mono text-xs text-studio-dim mb-3">
              MIDI Target Keys — <span style={{ color: '#ff9500' }}>{heldNotes.size > 0 ? `${heldNotes.size} key${heldNotes.size > 1 ? 's' : ''} held` : 'no keys held — voice passes through'}</span>
            </div>
            {/* 2-octave keyboard C3–B4 (MIDI 48–71) */}
            {(() => {
              const START = 48, END = 71
              const BLACK = new Set([1,3,6,8,10]) // pitch classes that are black keys
              const whites = [], blacks = []
              for (let n = START; n <= END; n++) {
                const pc = n % 12
                if (BLACK.has(pc)) blacks.push(n)
                else whites.push(n)
              }
              const held = heldNotes
              return (
                <div style={{ position:'relative', height:64 }}>
                  {/* White keys */}
                  <div className="flex" style={{ height:64, gap:1 }}>
                    {whites.map(n => {
                      const isHeld = held.has(n)
                      return (
                        <div key={n} style={{
                          flex:1, borderRadius:'0 0 4px 4px', border:`1px solid ${isHeld?'#ff9500':'#2a2a3e'}`,
                          background: isHeld ? '#ff950044' : '#1a1a2e',
                          boxShadow: isHeld ? '0 0 8px #ff950066' : 'none',
                          display:'flex', alignItems:'flex-end', justifyContent:'center', paddingBottom:2,
                        }}>
                          <span className="font-mono" style={{ fontSize:7, color: isHeld?'#ff9500':'#334' }}>
                            {n % 12 === 0 ? NOTE_NAMES[0] + Math.floor(n/12)-1 : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {/* Black keys overlaid */}
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:38, display:'flex', pointerEvents:'none' }}>
                    {whites.map((wn, wi) => {
                      const nextPc = (wn + 1) % 12
                      const blackN = wn + 1
                      if (!BLACK.has(nextPc) || blackN > END) return <div key={wn} style={{ flex:1 }} />
                      const isHeld = held.has(blackN)
                      return (
                        <div key={wn} style={{ flex:1, position:'relative' }}>
                          <div style={{
                            position:'absolute', right:'-35%', width:'70%', height:'100%', zIndex:10,
                            borderRadius:'0 0 3px 3px', border:`1px solid ${isHeld?'#ff9500':'#3a3a5a'}`,
                            background: isHeld ? '#ff950066' : '#0d0d1e',
                            boxShadow: isHeld ? '0 0 8px #ff950088' : 'none',
                          }} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Tips */}
        <div style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:12 }}>
          <div className="font-display text-xs tracking-widest uppercase text-studio-dim mb-2">Tips for Best Quality</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {[
              ['Speed 5–30%',   'Natural, transparent correction. Sounds like a pro tuned vocal.'],
              ['Speed 90–100%', 'Hard snap (T-Pain). Deliberately robotic sound.'],
              ['Wet 70–85%',    'Blend some dry signal for more warmth and less processing.'],
              ['Wet 100%',      'Full processed signal. Needed for the hard T-Pain sound.'],
              ['Scale Snap',    'Best for singing melodies. Keeps you in key.'],
              ['Formant ±0–4',  'Subtle shaping. Large values sound unnatural.'],
            ].map(([t,d]) => (
              <div key={t} className="flex gap-2 mb-0.5">
                <span className="font-mono font-bold shrink-0" style={{ fontSize:9, color:'#b44fff', minWidth:76 }}>{t}</span>
                <span className="font-mono" style={{ fontSize:9, color:'#445', lineHeight:1.5 }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
