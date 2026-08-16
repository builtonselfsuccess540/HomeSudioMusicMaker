import { useState, useRef, useEffect, useCallback } from 'react'
import { getCtx } from '../../audio/audioEngine'

function Knob({ label, value, min, max, step = 1, unit = '', onChange, color = '#ff2d55' }) {
  const pct   = (value - min) / (max - min)
  const angle = -135 + pct * 270
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid #2a2a3e', position: 'relative', cursor: 'ns-resize', background: '#0d0d1e' }}
        onMouseDown={e => {
          const startY = e.clientY, startVal = value
          const move = me => onChange(Math.min(max, Math.max(min, Math.round((startVal + (startY - me.clientY) * (max - min) / 120) / step) * step)))
          const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
          window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
        }}
      >
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 2, height: 16, background: color, transformOrigin: 'bottom center', transform: `translate(-50%, -100%) rotate(${angle}deg)`, borderRadius: 1 }} />
      </div>
      <span className="font-mono text-center" style={{ fontSize: 9, color: '#445', lineHeight: 1.2 }}>{label}</span>
      <span className="font-mono font-bold" style={{ fontSize: 10, color }}>{value}{unit}</span>
    </div>
  )
}

function Meter({ level, label, color }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ width: 8, height: 80, background: '#0d0d1e', borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ width: '100%', height: `${level}%`, background: level > 80 ? '#ff2d55' : level > 60 ? '#ff9500' : color, borderRadius: 4, transition: 'height 0.05s' }} />
      </div>
      <span className="font-mono" style={{ fontSize: 9, color: '#445' }}>{label}</span>
    </div>
  )
}

export default function VocalDoublerView() {
  const [active,      setActive]      = useState(false)
  const [inputLevel,  setInputLevel]  = useState(0)
  const [outputLevel, setOutputLevel] = useState(0)

  const [detuneL,    setDetuneL]    = useState(-8)
  const [detuneR,    setDetuneR]    = useState(8)
  const [delayL,     setDelayL]     = useState(18)
  const [delayR,     setDelayR]     = useState(23)
  const [widthL,     setWidthL]     = useState(-1)
  const [widthR,     setWidthR]     = useState(1)
  const [mix,        setMix]        = useState(50)
  const [dryGainVal, setDryGainVal] = useState(80)
  const [activePreset, setActivePreset] = useState('subtle')

  const nodesRef       = useRef({})
  const streamRef      = useRef(null)
  const animRef        = useRef(null)
  const analyserInRef  = useRef(null)
  const analyserOutRef = useRef(null)

  const stopChain = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    try { nodesRef.current.src?.disconnect() } catch (_) {}
    nodesRef.current = {}
    analyserInRef.current  = null
    analyserOutRef.current = null
    setActive(false)
    setInputLevel(0)
    setOutputLevel(0)
  }, [])

  const buildChain = useCallback(async () => {
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
    streamRef.current = stream

    const src = ctx.createMediaStreamSource(stream)

    const analyserIn = ctx.createAnalyser(); analyserIn.fftSize = 256
    analyserInRef.current = analyserIn

    // Dry path
    const dryGain = ctx.createGain(); dryGain.gain.value = dryGainVal / 100

    // Left double: delay → allpass (subtle comb = simulated detune) → pan L → wet gain
    const delNodeL = ctx.createDelay(0.2); delNodeL.delayTime.value = delayL / 1000
    const pitchShiftL = ctx.createBiquadFilter()
    pitchShiftL.type = 'allpass'; pitchShiftL.frequency.value = 200 + detuneL * 10
    const panL = ctx.createStereoPanner(); panL.pan.value = widthL
    const wetGainL = ctx.createGain(); wetGainL.gain.value = mix / 100 * 0.7

    // Right double
    const delNodeR = ctx.createDelay(0.2); delNodeR.delayTime.value = delayR / 1000
    const pitchShiftR = ctx.createBiquadFilter()
    pitchShiftR.type = 'allpass'; pitchShiftR.frequency.value = 200 + detuneR * 10
    const panR = ctx.createStereoPanner(); panR.pan.value = widthR
    const wetGainR = ctx.createGain(); wetGainR.gain.value = mix / 100 * 0.7

    const masterOut = ctx.createGain(); masterOut.gain.value = 1.0
    const analyserOut = ctx.createAnalyser(); analyserOut.fftSize = 256
    analyserOutRef.current = analyserOut

    // Wire
    src.connect(analyserIn)
    src.connect(dryGain)
    src.connect(delNodeL); delNodeL.connect(pitchShiftL); pitchShiftL.connect(wetGainL); wetGainL.connect(panL)
    src.connect(delNodeR); delNodeR.connect(pitchShiftR); pitchShiftR.connect(wetGainR); wetGainR.connect(panR)
    dryGain.connect(masterOut)
    panL.connect(masterOut)
    panR.connect(masterOut)
    masterOut.connect(analyserOut)
    masterOut.connect(ctx.destination)

    nodesRef.current = { src, dryGain, delNodeL, delNodeR, pitchShiftL, pitchShiftR, wetGainL, wetGainR, panL, panR, masterOut }

    // Meters
    const tick = () => {
      const read = an => {
        const d = new Uint8Array(an.frequencyBinCount)
        an.getByteTimeDomainData(d)
        const rms = Math.sqrt(d.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) / d.length)
        return Math.min(100, rms * 300)
      }
      if (analyserInRef.current)  setInputLevel(read(analyserInRef.current))
      if (analyserOutRef.current) setOutputLevel(read(analyserOutRef.current))
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    setActive(true)
  }, [detuneL, detuneR, delayL, delayR, widthL, widthR, mix, dryGainVal])

  // Live parameter updates
  useEffect(() => {
    const n = nodesRef.current
    if (!n.delNodeL) return
    n.delNodeL.delayTime.value     = delayL / 1000
    n.delNodeR.delayTime.value     = delayR / 1000
    n.pitchShiftL.frequency.value  = 200 + detuneL * 10
    n.pitchShiftR.frequency.value  = 200 + detuneR * 10
    n.panL.pan.value               = widthL
    n.panR.pan.value               = widthR
    n.wetGainL.gain.value          = mix / 100 * 0.7
    n.wetGainR.gain.value          = mix / 100 * 0.7
    n.dryGain.gain.value           = dryGainVal / 100
  }, [detuneL, detuneR, delayL, delayR, widthL, widthR, mix, dryGainVal])

  useEffect(() => () => stopChain(), [stopChain])

  const applyPreset = (p) => {
    setActivePreset(p)
    if (p === 'subtle')       { setDetuneL(-5);  setDetuneR(5);   setDelayL(12); setDelayR(16); setWidthL(-0.6); setWidthR(0.6); setMix(35); setDryGainVal(90) }
    if (p === 'thick')        { setDetuneL(-12); setDetuneR(12);  setDelayL(20); setDelayR(28); setWidthL(-1);   setWidthR(1);   setMix(60); setDryGainVal(80) }
    if (p === 'wide')         { setDetuneL(-18); setDetuneR(18);  setDelayL(30); setDelayR(38); setWidthL(-1);   setWidthR(1);   setMix(70); setDryGainVal(75) }
    if (p === 'gospel-choir') { setDetuneL(-10); setDetuneR(14);  setDelayL(22); setDelayR(35); setWidthL(-0.8); setWidthR(0.9); setMix(55); setDryGainVal(85) }
  }

  // Stereo field visualizer
  const dotLx  = `${((widthL + 1) / 2) * 100}%`
  const dotRx  = `${((widthR + 1) / 2) * 100}%`

  const PRESETS = [
    { id: 'subtle',       label: 'Subtle',       color: '#00ff9d' },
    { id: 'thick',        label: 'Thick',        color: '#b44fff' },
    { id: 'wide',         label: 'Wide',         color: '#00e5ff' },
    { id: 'gospel-choir', label: 'Gospel Choir', color: '#ff9500' },
  ]

  return (
    <div className="h-full overflow-y-auto p-5" style={{ background: '#080810' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <span className="font-display text-xs tracking-widest uppercase"
              style={{ background: 'linear-gradient(90deg,#ff2d55,#00e5ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Vocal Doubler
            </span>
            <div className="font-mono mt-0.5" style={{ fontSize: 10, color: '#445' }}>
              Thickens vocals with stereo pitch + delay offsets
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-3 items-end">
              <Meter level={inputLevel}  label="IN"  color="#00ff9d" />
              <Meter level={outputLevel} label="OUT" color="#ff2d55" />
            </div>
            <button
              onClick={active ? stopChain : buildChain}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-mono font-bold transition-all"
              style={{ background: active ? '#ff2d5522' : '#ff2d5522', border: `1px solid ${active ? '#ff2d55' : '#ff2d55'}`, color: active ? '#ff2d55' : '#ff2d55' }}>
              {active ? '■ Stop' : '▶ Start Mic'}
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4" style={{ background: '#0a0a1a', border: '1px solid #1a1a2e' }}>
          <div className="w-2 h-2 rounded-full" style={{ background: active ? '#00ff9d' : '#333', boxShadow: active ? '0 0 6px #00ff9d' : 'none' }} />
          <span className="font-mono text-xs" style={{ color: active ? '#00ff9d' : '#445' }}>
            {active ? 'Doubler active — your voice now has two stereo copies' : 'Click Start Mic to activate vocal doubling'}
          </span>
        </div>

        {/* Presets */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className="font-mono font-semibold transition-all"
              style={{ fontSize: 10, padding: '4px 12px', borderRadius: 20, border: `1px solid ${activePreset === p.id ? p.color : '#2a2a3e'}`, background: activePreset === p.id ? p.color + '22' : 'transparent', color: activePreset === p.id ? p.color : '#445', cursor: 'pointer' }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* L / R voice panels */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Left voice */}
          <div style={{ border: '1px solid #ff2d5544', borderRadius: 8, padding: '12px 14px', background: '#ff2d5508' }}>
            <div className="font-mono font-bold uppercase tracking-widest mb-3" style={{ fontSize: 10, color: '#ff2d55' }}>Left Voice</div>
            <div className="flex gap-4 justify-center">
              <Knob label="Detune" value={detuneL} min={-50} max={0}   onChange={setDetuneL} unit=" c"  color="#ff2d55" />
              <Knob label="Delay"  value={delayL}  min={1}   max={80}  onChange={setDelayL}  unit=" ms" color="#ff2d55" />
              <Knob label="Pan"    value={Math.round(widthL * 100)} min={-100} max={0} onChange={v => setWidthL(v / 100)} color="#ff2d55" />
            </div>
          </div>

          {/* Right voice */}
          <div style={{ border: '1px solid #00e5ff44', borderRadius: 8, padding: '12px 14px', background: '#00e5ff08' }}>
            <div className="font-mono font-bold uppercase tracking-widest mb-3" style={{ fontSize: 10, color: '#00e5ff' }}>Right Voice</div>
            <div className="flex gap-4 justify-center">
              <Knob label="Detune" value={detuneR} min={0}  max={50}  onChange={setDetuneR} unit=" c"  color="#00e5ff" />
              <Knob label="Delay"  value={delayR}  min={1}  max={80}  onChange={setDelayR}  unit=" ms" color="#00e5ff" />
              <Knob label="Pan"    value={Math.round(widthR * 100)} min={0} max={100} onChange={v => setWidthR(v / 100)} color="#00e5ff" />
            </div>
          </div>
        </div>

        {/* Stereo field visualizer */}
        <div className="mb-3 rounded-lg px-4 py-3" style={{ border: '1px solid #1a1a2e', background: '#0a0a1a' }}>
          <div className="font-mono font-bold uppercase tracking-widest mb-2" style={{ fontSize: 10, color: '#445' }}>Stereo Field</div>
          <div style={{ position: 'relative', width: '100%', height: 52, background: '#050510', borderRadius: 6, overflow: 'hidden' }}>
            {/* Center line */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#1a1a2e', transform: 'translateX(-50%)' }} />
            {/* Left dot */}
            <div style={{ position: 'absolute', top: '50%', left: dotLx, transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: '#ff2d55', boxShadow: '0 0 8px #ff2d5588', transition: 'left 0.1s' }} />
            {/* Right dot */}
            <div style={{ position: 'absolute', top: '50%', left: dotRx, transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: '#00e5ff', boxShadow: '0 0 8px #00e5ff88', transition: 'left 0.1s' }} />
            <span className="font-mono" style={{ position: 'absolute', bottom: 4, left: 6, fontSize: 9, color: '#334' }}>L</span>
            <span className="font-mono" style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: '#334' }}>C</span>
            <span className="font-mono" style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 9, color: '#334' }}>R</span>
          </div>
        </div>

        {/* Mix sliders */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="px-4 py-3 rounded-lg" style={{ border: '1px solid #1a1a2e', background: '#0a0a1a' }}>
            <div className="flex justify-between mb-2">
              <span className="font-mono font-bold uppercase tracking-widest" style={{ fontSize: 10, color: '#445' }}>Wet Mix</span>
              <span className="font-mono font-bold" style={{ fontSize: 10, color: '#ff2d55' }}>{mix}%</span>
            </div>
            <input type="range" min={0} max={100} value={mix} onChange={e => setMix(Number(e.target.value))} className="w-full" />
          </div>
          <div className="px-4 py-3 rounded-lg" style={{ border: '1px solid #1a1a2e', background: '#0a0a1a' }}>
            <div className="flex justify-between mb-2">
              <span className="font-mono font-bold uppercase tracking-widest" style={{ fontSize: 10, color: '#445' }}>Dry Level</span>
              <span className="font-mono font-bold" style={{ fontSize: 10, color: '#00e5ff' }}>{dryGainVal}%</span>
            </div>
            <input type="range" min={0} max={100} value={dryGainVal} onChange={e => setDryGainVal(Number(e.target.value))} className="w-full" />
          </div>
        </div>

        {/* Info */}
        <div className="px-4 py-3 rounded-lg" style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', fontSize: 10 }}>
          <span className="font-mono font-bold" style={{ color: '#ff2d55' }}>How it works · </span>
          <span className="font-mono" style={{ color: '#445', lineHeight: 1.7 }}>
            Two copies of your voice are created — one panned left with a slight detune and delay, one panned right. The tiny timing and pitch differences make it sound like two singers, which widens and thickens the vocal. Higher detune = more obvious doubling. Higher delay = wider stereo spread.
          </span>
        </div>

      </div>
    </div>
  )
}
