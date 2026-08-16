import React, { useState, useRef, useEffect, useCallback } from 'react'
import { getCtx } from '../../audio/audioEngine'

const ROOT_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const CHORDS = {
  'Major':   [0,4,7],   'Minor':   [0,3,7],
  'Maj7':    [0,4,7,11],'Min7':    [0,3,7,10],
  'Dom7':    [0,4,7,10],'Sus4':    [0,5,7],
  'Power':   [0,7],     'Octave':  [0,12],
  'Maj9':    [0,4,7,11,14],'Min9': [0,3,7,10,14],
}

const NUM_BANDS = 16
const BAND_FREQS = Array.from({ length: NUM_BANDS }, (_, i) =>
  80 * Math.pow(8000 / 80, i / (NUM_BANDS - 1))
)

const PRESETS = [
  { name: 'Daft Punk', oscType: 'sawtooth', root: 0, chord: 'Minor',   octave: 3, wet: 0.95, bands: 16 },
  { name: 'Robot',     oscType: 'square',   root: 0, chord: 'Power',   octave: 3, wet: 1.0,  bands: 12 },
  { name: 'T-Pain',    oscType: 'sawtooth', root: 0, chord: 'Maj7',    octave: 4, wet: 0.85, bands: 16 },
  { name: 'Choir',     oscType: 'sine',     root: 5, chord: 'Major',   octave: 4, wet: 0.9,  bands: 12 },
  { name: 'Talkbox',   oscType: 'sawtooth', root: 0, chord: 'Dom7',    octave: 3, wet: 0.8,  bands: 8  },
]

export default function VocoderView() {
  const [active,    setActive]    = useState(false)
  const [root,      setRoot]      = useState(0)
  const [chord,     setChord]     = useState('Minor')
  const [octave,    setOctave]    = useState(3)
  const [oscType,   setOscType]   = useState('sawtooth')
  const [wet,       setWet]       = useState(0.9)
  const [bandLevels,setBandLevels] = useState(Array(NUM_BANDS).fill(0))
  const [status,    setStatus]    = useState('idle')

  const nodeRefs  = useRef({ bands: [], oscs: [], animFrame: null, mic: null })
  const analyserUpdateRef = useRef(null)
  const paramsRef = useRef({})

  useEffect(() => {
    paramsRef.current = { root, chord, octave, oscType, wet }
  }, [root, chord, octave, oscType, wet])

  const stop = useCallback(() => {
    const r = nodeRefs.current
    cancelAnimationFrame(r.animFrame)
    clearInterval(analyserUpdateRef.current)
    r.oscs.forEach(o => { try { o.stop() } catch (_) {} })
    if (r.mic) { try { r.mic.getTracks().forEach(t => t.stop()) } catch (_) {} }
    r.bands.forEach(b => {
      try { b.modBPF.disconnect(); b.modAn.disconnect() } catch (_) {}
      try { b.carrBPF.disconnect(); b.carrGain.disconnect() } catch (_) {}
    })
    r.bands = []; r.oscs = []; r.mic = null
    setActive(false)
    setStatus('idle')
    setBandLevels(Array(NUM_BANDS).fill(0))
  }, [])

  const start = useCallback(async () => {
    stop()
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    let micStream
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      setStatus('running')
    } catch (_) {
      setStatus('mic-denied')
      return
    }

    const r = nodeRefs.current
    r.mic = micStream
    const micSource = ctx.createMediaStreamSource(micStream)
    const output    = ctx.createGain()
    output.gain.value = wet
    output.connect(ctx.destination)

    // Build carrier oscillators for the chord
    const ivs = CHORDS[chord] || [0]
    ivs.forEach(iv => {
      const midi = (octave + 1) * 12 + root + iv
      const freq = 440 * Math.pow(2, (midi - 69) / 12)
      const osc  = ctx.createOscillator()
      osc.type = oscType
      osc.frequency.value = freq
      osc.start()
      r.oscs.push(osc)
    })

    // Carrier mix (sum all oscs)
    const carrierMix = ctx.createGain()
    carrierMix.gain.value = 1 / Math.max(1, r.oscs.length)
    r.oscs.forEach(o => o.connect(carrierMix))

    // Build vocoder bands
    r.bands = BAND_FREQS.map((freq, i) => {
      const Q = 4 + i * 0.5

      const modBPF  = ctx.createBiquadFilter()
      modBPF.type = 'bandpass'; modBPF.frequency.value = freq; modBPF.Q.value = Q

      const modAn   = ctx.createAnalyser()
      modAn.fftSize = 256

      const carrBPF = ctx.createBiquadFilter()
      carrBPF.type = 'bandpass'; carrBPF.frequency.value = freq; carrBPF.Q.value = Q

      const carrGain = ctx.createGain()
      carrGain.gain.value = 0

      micSource.connect(modBPF)
      modBPF.connect(modAn)
      carrierMix.connect(carrBPF)
      carrBPF.connect(carrGain)
      carrGain.connect(output)

      return { modAn, carrGain }
    })

    // Modulator → carrier gain update loop
    const buf = new Float32Array(256)
    analyserUpdateRef.current = setInterval(() => {
      const levels = r.bands.map(b => {
        b.modAn.getFloatTimeDomainData(buf)
        let rms = 0
        for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i]
        rms = Math.sqrt(rms / buf.length)
        const targetGain = Math.min(4, rms * 10)
        b.carrGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.02)
        return Math.min(1, rms * 8)
      })
      setBandLevels(levels)
    }, 20)

    setActive(true)
  }, [stop, root, chord, octave, oscType, wet])

  useEffect(() => () => stop(), [stop])

  const applyPreset = (p) => {
    setOscType(p.oscType); setRoot(p.root); setChord(p.chord)
    setOctave(p.octave); setWet(p.wet)
  }

  const chordNotes = (CHORDS[chord] || [0]).map(iv => ROOT_NAMES[(root + iv) % 12])

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#080810' }}>

      {/* ── Left: controls ── */}
      <div className="flex flex-col gap-4 p-5 border-r border-studio-border shrink-0 overflow-y-auto" style={{ width: 270 }}>
        <div className="flex items-center justify-between">
          <span className="font-display text-xs tracking-widest uppercase"
            style={{ background:'linear-gradient(90deg,#b44fff,#00e5ff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            Vocoder
          </span>
          <button onClick={active ? stop : start}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-bold transition-all"
            style={{
              background: active ? '#ff2d5522':'#00e5ff22',
              border: `1px solid ${active ? '#ff2d55':'#00e5ff'}`,
              color: active ? '#ff2d55':'#00e5ff',
            }}>
            {active ? '■ Stop' : '▶ Start'}
          </button>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background:'#0a0a1a', border:'1px solid #1a1a2e' }}>
          <div className="w-2 h-2 rounded-full" style={{ background: status==='running'?'#00ff9d':status==='mic-denied'?'#ff2d55':'#333', boxShadow: status==='running'?'0 0 6px #00ff9d':'none' }} />
          <span className="font-mono text-xs" style={{ color: status==='running'?'#00ff9d':status==='mic-denied'?'#ff2d55':'#445' }}>
            {status === 'running' ? 'Microphone active — speak or sing' : status === 'mic-denied' ? 'Mic access denied — check browser settings' : 'Click Start and speak into your mic'}
          </span>
        </div>

        {/* Carrier chord */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Carrier Chord</div>
          <div className="grid grid-cols-4 gap-1 mb-2">
            {ROOT_NAMES.map((n, i) => (
              <button key={i} onClick={() => setRoot(i)}
                className="py-1 rounded text-xs font-mono font-bold transition-all"
                style={{
                  background: root===i?'#b44fff33':'#ffffff08',
                  border:`1px solid ${root===i?'#b44fff':'#2a2a3e'}`,
                  color: root===i?'#b44fff':'#555',
                }}>{n}</button>
            ))}
          </div>
          <select value={chord} onChange={e => setChord(e.target.value)}
            className="w-full bg-studio-void border border-studio-border rounded px-2 py-1 text-xs font-mono text-studio-text">
            {Object.keys(CHORDS).map(c => <option key={c}>{c}</option>)}
          </select>
          <div className="mt-1.5 font-mono text-xs" style={{ color:'#445' }}>
            Notes: <span style={{ color:'#b44fff' }}>{chordNotes.join(' · ')}</span>
          </div>
        </div>

        {/* Octave */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-studio-dim">Octave</span>
          <button onClick={() => setOctave(v => Math.max(1,v-1))} className="w-6 h-6 rounded bg-studio-surface border border-studio-border text-xs text-studio-dim">−</button>
          <span className="font-mono text-xs" style={{ color:'#b44fff' }}>{octave}</span>
          <button onClick={() => setOctave(v => Math.min(6,v+1))} className="w-6 h-6 rounded bg-studio-surface border border-studio-border text-xs text-studio-dim">+</button>
        </div>

        {/* Oscillator type */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Carrier Wave</div>
          <div className="grid grid-cols-2 gap-1">
            {['sawtooth','square','triangle','sine'].map(t => (
              <button key={t} onClick={() => setOscType(t)}
                className="py-1 rounded text-xs font-mono transition-all"
                style={{
                  background: oscType===t?'#00e5ff22':'#ffffff08',
                  border:`1px solid ${oscType===t?'#00e5ff':'#2a2a3e'}`,
                  color: oscType===t?'#00e5ff':'#555',
                }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Wet mix */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="font-mono text-xs text-studio-dim uppercase tracking-wider">Wet Mix</span>
            <span className="font-mono text-xs" style={{ color:'#00e5ff' }}>{Math.round(wet*100)}%</span>
          </div>
          <input type="range" min={0} max={1} step={0.01} value={wet}
            onChange={e => setWet(Number(e.target.value))} className="w-full" />
        </div>

        {/* Presets */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Presets</div>
          <div className="flex flex-col gap-1">
            {PRESETS.map(p => (
              <button key={p.name} onClick={() => { applyPreset(p); if (active) { stop(); setTimeout(start, 100) } }}
                className="flex items-center gap-2 px-3 py-2 rounded text-xs font-mono font-semibold transition-all text-left"
                style={{ background:'#ffffff08', border:'1px solid #2a2a3e', color:'#888' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#b44fff'; e.currentTarget.style.color='#b44fff' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#2a2a3e'; e.currentTarget.style.color='#888' }}>
                <span>{p.name}</span>
                <span className="ml-auto font-mono" style={{ fontSize:9, color:'#445' }}>{p.oscType} · {ROOT_NAMES[p.root]}{p.chord}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: band visualizer ── */}
      <div className="flex-1 p-5 flex flex-col gap-4">
        <div className="font-display text-xs tracking-widest uppercase text-studio-dim">Band Activity</div>

        {/* Band bars */}
        <div className="flex items-end gap-1" style={{ height: 160 }}>
          {bandLevels.map((level, i) => {
            const freq = BAND_FREQS[i]
            const label = freq >= 1000 ? `${(freq/1000).toFixed(1)}k` : `${Math.round(freq)}`
            const h = Math.max(2, level * 150)
            const hue = (i / NUM_BANDS) * 280
            const col = `hsl(${hue},80%,55%)`
            return (
              <div key={i} className="flex flex-col items-center gap-0.5 flex-1" style={{ height: 160 }}>
                <div className="w-full rounded-sm transition-all" style={{ height: h, background: col, boxShadow: level > 0.1 ? `0 0 8px ${col}88` : 'none', marginTop: 'auto' }} />
                <span className="font-mono" style={{ fontSize: 7, color: '#334', writingMode:'vertical-rl', transform:'rotate(180deg)', lineHeight:1 }}>{label}</span>
              </div>
            )
          })}
        </div>

        {/* Info boxes */}
        <div className="grid grid-cols-2 gap-4 mt-2">
          <div style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:14 }}>
            <div className="font-display text-xs tracking-widest uppercase text-studio-dim mb-3">How Vocoder Works</div>
            {[
              ['Modulator', 'Your voice from the microphone. It provides the moving frequency shape.'],
              ['Carrier', 'A synth chord playing the notes you choose. It provides the pitched tone.'],
              ['Bands', `${NUM_BANDS} bandpass filters analyze the voice and control matching bands in the synth.`],
              ['Result', 'The synth speaks with your mouth movements — classic vocoder / robot voice effect.'],
            ].map(([t,d]) => (
              <div key={t} className="flex gap-2 mb-1.5">
                <span className="font-mono font-bold shrink-0" style={{ fontSize:9, color:'#b44fff', minWidth:64 }}>{t}</span>
                <span className="font-mono" style={{ fontSize:9, color:'#445', lineHeight:1.5 }}>{d}</span>
              </div>
            ))}
          </div>

          <div style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:14 }}>
            <div className="font-display text-xs tracking-widest uppercase text-studio-dim mb-3">Tips for Best Sound</div>
            {[
              'Use sawtooth or square wave for the most classic vocoder tone',
              'Sing or speak clearly and closely into your mic',
              'Lower octaves (2-3) give that deep robotic effect',
              'Higher octaves (4-5) create more transparent/angelic sounds',
              'Major7 or Minor9 chords give a lush, harmonic result',
              'Increase Wet Mix to 100% for full vocoder, lower for subtle effect',
            ].map((tip, i) => (
              <div key={i} className="flex gap-2 mb-1">
                <span style={{ color:'#b44fff', fontSize:9 }}>→</span>
                <span className="font-mono" style={{ fontSize:9, color:'#445', lineHeight:1.5 }}>{tip}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
