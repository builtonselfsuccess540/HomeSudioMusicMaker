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

export default function DeEsserView() {
  const [active,        setActive]        = useState(false)
  const [inputLevel,    setInputLevel]    = useState(0)
  const [outputLevel,   setOutputLevel]   = useState(0)
  const [gainReduction, setGainReduction] = useState(0)
  const [ssDetected,    setSsDetected]    = useState(false)

  const [threshold, setThreshold] = useState(-28)
  const [frequency, setFrequency] = useState(7000)
  const [bandwidth, setBandwidth] = useState(2.0)
  const [ratio,     setRatio]     = useState(6)
  const [attack,    setAttack]    = useState(2)
  const [release,   setRelease]   = useState(40)
  const [listen,    setListen]    = useState(false)
  const [mode,      setMode]      = useState('broadband')
  const [activePreset, setActivePreset] = useState('vocal')

  const nodesRef       = useRef({})
  const streamRef      = useRef(null)
  const animRef        = useRef(null)
  const analyserInRef  = useRef(null)
  const analyserOutRef = useRef(null)
  const sibilanceRef   = useRef(null)
  const grRef          = useRef(0)

  const stopChain = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    try { nodesRef.current.src?.disconnect() } catch (_) {}
    nodesRef.current = {}
    analyserInRef.current  = null
    analyserOutRef.current = null
    sibilanceRef.current   = null
    setActive(false)
    setInputLevel(0); setOutputLevel(0); setGainReduction(0); setSsDetected(false)
  }, [])

  const buildChain = useCallback(async () => {
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
    streamRef.current = stream

    const src = ctx.createMediaStreamSource(stream)

    const analyserIn = ctx.createAnalyser(); analyserIn.fftSize = 512
    analyserInRef.current = analyserIn

    // Sidechain: bandpass around the sibilance frequency
    const hpfSide = ctx.createBiquadFilter()
    hpfSide.type = 'bandpass'; hpfSide.frequency.value = frequency; hpfSide.Q.value = bandwidth

    // Sibilance energy analyser (drives the GR meter and detection dot)
    const sibilanceAnalyser = ctx.createAnalyser(); sibilanceAnalyser.fftSize = 256
    sibilanceRef.current = sibilanceAnalyser

    // The compressor that reduces gain when sibilance is detected
    const deessComp = ctx.createDynamicsCompressor()
    deessComp.threshold.value = threshold; deessComp.knee.value = 2
    deessComp.ratio.value     = ratio
    deessComp.attack.value    = attack / 1000; deessComp.release.value = release / 1000

    const dryGain = ctx.createGain(); dryGain.gain.value = 1
    const wetGain = ctx.createGain(); wetGain.gain.value = 0.3
    const outMix  = ctx.createGain()

    const analyserOut = ctx.createAnalyser(); analyserOut.fftSize = 512
    analyserOutRef.current = analyserOut

    // Wire
    src.connect(analyserIn)
    src.connect(hpfSide)
    hpfSide.connect(sibilanceAnalyser)
    hpfSide.connect(deessComp)

    if (listen) {
      // Listen mode: hear only the sibilance band so you can dial in the frequency
      hpfSide.connect(analyserOut)
      hpfSide.connect(ctx.destination)
    } else {
      src.connect(dryGain)
      deessComp.connect(wetGain)
      dryGain.connect(outMix); wetGain.connect(outMix)
      outMix.connect(analyserOut)
      outMix.connect(ctx.destination)
    }

    nodesRef.current = { src, hpfSide, sibilanceAnalyser, deessComp, dryGain, wetGain, outMix }

    const tick = () => {
      const readRms = an => {
        const d = new Uint8Array(an.frequencyBinCount)
        an.getByteTimeDomainData(d)
        const rms = Math.sqrt(d.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) / d.length)
        return Math.min(100, rms * 300)
      }
      if (analyserInRef.current)  setInputLevel(readRms(analyserInRef.current))
      if (analyserOutRef.current) setOutputLevel(readRms(analyserOutRef.current))
      if (sibilanceRef.current) {
        const d = new Uint8Array(sibilanceRef.current.frequencyBinCount)
        sibilanceRef.current.getByteFrequencyData(d)
        const avg = d.reduce((s, v) => s + v, 0) / d.length
        const detected = avg > 30
        setSsDetected(detected)
        const targetGR = detected ? Math.min(100, avg / 2) : 0
        grRef.current = grRef.current * 0.85 + targetGR * 0.15
        setGainReduction(Math.round(grRef.current))
      }
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    setActive(true)
  }, [threshold, frequency, bandwidth, ratio, attack, release, listen])

  // Live parameter updates
  useEffect(() => {
    const n = nodesRef.current
    if (!n.hpfSide) return
    n.hpfSide.frequency.value    = frequency
    n.hpfSide.Q.value            = bandwidth
    n.deessComp.threshold.value  = threshold
    n.deessComp.ratio.value      = ratio
    n.deessComp.attack.value     = attack / 1000
    n.deessComp.release.value    = release / 1000
  }, [threshold, frequency, bandwidth, ratio, attack, release])

  useEffect(() => () => stopChain(), [stopChain])

  const applyPreset = (p) => {
    setActivePreset(p)
    if (p === 'vocal')  { setThreshold(-28); setFrequency(7000); setBandwidth(2.0); setRatio(6);  setAttack(2); setRelease(40) }
    if (p === 'harsh')  { setThreshold(-24); setFrequency(6000); setBandwidth(1.5); setRatio(8);  setAttack(1); setRelease(30) }
    if (p === 'rap')    { setThreshold(-22); setFrequency(8000); setBandwidth(2.5); setRatio(10); setAttack(1); setRelease(25) }
    if (p === 'subtle') { setThreshold(-32); setFrequency(7500); setBandwidth(1.8); setRatio(4);  setAttack(3); setRelease(60) }
  }

  // Frequency visualizer — shows where the sibilance detector is focused
  const freqPct = (frequency - 2000) / (16000 - 2000)
  const bandPct = Math.min(30, bandwidth * 8)

  const PRESETS = [
    { id: 'vocal',  label: 'Vocal',  color: '#ff2d55' },
    { id: 'harsh',  label: 'Harsh',  color: '#ff9500' },
    { id: 'rap',    label: 'Rap',    color: '#b44fff' },
    { id: 'subtle', label: 'Subtle', color: '#00ff9d' },
  ]

  return (
    <div className="h-full overflow-y-auto p-5" style={{ background: '#080810' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <span className="font-display text-xs tracking-widest uppercase"
              style={{ background: 'linear-gradient(90deg,#ff2d55,#ff9500)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              De-Esser
            </span>
            <div className="font-mono mt-0.5" style={{ fontSize: 10, color: '#445' }}>
              Tames harsh sibilance on S, T, and SH sounds
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-3 items-end">
              <Meter level={inputLevel}    label="IN" color="#00ff9d" />
              <Meter level={gainReduction} label="GR" color="#ff9500" />
              <Meter level={outputLevel}   label="OUT" color="#ff2d55" />
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
          <div className="w-2 h-2 rounded-full" style={{ background: ssDetected ? '#ff9500' : active ? '#00ff9d' : '#333', boxShadow: ssDetected ? '0 0 6px #ff9500' : active ? '0 0 6px #00ff9d' : 'none' }} />
          <span className="font-mono text-xs" style={{ color: ssDetected ? '#ff9500' : active ? '#00ff9d' : '#445' }}>
            {ssDetected ? 'Sibilance detected — reducing now' : active ? 'Listening — no sibilance detected' : 'Click Start Mic to activate the de-esser'}
          </span>
          {listen && <span className="font-mono text-xs ml-auto" style={{ color: '#ff9500' }}>LISTEN MODE — hearing sibilance band only</span>}
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

        {/* Frequency visualizer */}
        <div className="mb-3 rounded-lg px-4 py-3" style={{ border: '1px solid #1a1a2e', background: '#0a0a1a' }}>
          <div className="font-mono font-bold uppercase tracking-widest mb-2" style={{ fontSize: 10, color: '#445' }}>
            Frequency Detector — {frequency.toLocaleString()} Hz
          </div>
          <div style={{ position: 'relative', width: '100%', height: 52, background: '#050510', borderRadius: 6, overflow: 'hidden' }}>
            {/* Bandwidth highlight */}
            <div style={{ position: 'absolute', left: `${freqPct * 100}%`, top: 0, bottom: 0, width: `${bandPct}%`, transform: 'translateX(-50%)', background: ssDetected ? '#ff2d5540' : '#ff2d5518', transition: 'all 0.1s', borderRadius: 4 }} />
            {/* Center line */}
            <div style={{ position: 'absolute', left: `${freqPct * 100}%`, top: 0, bottom: 0, width: 2, background: '#ff2d55', transform: 'translateX(-50%)', transition: 'left 0.1s', boxShadow: ssDetected ? '0 0 8px #ff2d55' : 'none' }} />
            {/* Frequency labels */}
            {['2k', '5.5k', '9k', '16k'].map((label, i) => (
              <span key={label} className="font-mono" style={{ position: 'absolute', bottom: 4, left: `${i * 33}%`, fontSize: 9, color: '#334' }}>{label}</span>
            ))}
            {ssDetected && (
              <div className="font-mono font-bold" style={{ position: 'absolute', top: 6, right: 10, fontSize: 9, color: '#ff9500', background: '#ff950022', padding: '1px 6px', borderRadius: 4 }}>
                sibilance ▲
              </div>
            )}
          </div>
        </div>

        {/* Controls — 3 columns */}
        <div className="grid grid-cols-3 gap-3 mb-3">

          {/* Detection */}
          <div style={{ border: '1px solid #ff2d5544', borderRadius: 8, padding: '12px 14px', background: '#ff2d5508' }}>
            <div className="font-mono font-bold uppercase tracking-widest mb-3" style={{ fontSize: 10, color: '#ff2d55' }}>Detection</div>
            <div className="flex gap-3 justify-center">
              <Knob label="Freq"  value={frequency} min={2000} max={16000} step={100} onChange={setFrequency} unit=" Hz" color="#ff2d55" />
              <Knob label="Width" value={bandwidth} min={0.5}  max={5}     step={0.1} onChange={setBandwidth}           color="#ff2d55" />
            </div>
          </div>

          {/* Reduction */}
          <div style={{ border: '1px solid #ff950044', borderRadius: 8, padding: '12px 14px', background: '#ff950008' }}>
            <div className="font-mono font-bold uppercase tracking-widest mb-3" style={{ fontSize: 10, color: '#ff9500' }}>Reduction</div>
            <div className="flex gap-3 justify-center">
              <Knob label="Threshold" value={threshold} min={-48} max={0}  onChange={setThreshold} unit=" dB" color="#ff9500" />
              <Knob label="Ratio"     value={ratio}     min={2}   max={20} onChange={setRatio}     unit=":1"  color="#ff9500" />
            </div>
          </div>

          {/* Timing */}
          <div style={{ border: '1px solid #1a1a2e', borderRadius: 8, padding: '12px 14px' }}>
            <div className="font-mono font-bold uppercase tracking-widest mb-3" style={{ fontSize: 10, color: '#445' }}>Timing</div>
            <div className="flex gap-3 justify-center">
              <Knob label="Attack"  value={attack}  min={1}  max={20}  onChange={setAttack}  unit=" ms" color="#888799" />
              <Knob label="Release" value={release} min={10} max={200} onChange={setRelease} unit=" ms" color="#888799" />
            </div>
          </div>
        </div>

        {/* Mode + Listen */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg mb-3" style={{ border: '1px solid #1a1a2e', background: '#0a0a1a' }}>
          <span className="font-mono font-bold uppercase tracking-widest" style={{ fontSize: 10, color: '#445' }}>Mode</span>
          <div className="flex gap-2">
            {['broadband', 'split-band'].map(m => (
              <button key={m} onClick={() => setMode(m)}
                className="font-mono transition-all"
                style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: `1px solid ${mode === m ? '#ff2d55' : '#2a2a3e'}`, background: mode === m ? '#ff2d5522' : 'transparent', color: mode === m ? '#ff2d55' : '#445', cursor: 'pointer' }}>
                {m}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono" style={{ fontSize: 10, color: '#445' }}>Listen mode</span>
            <button onClick={() => setListen(!listen)}
              className="font-mono transition-all"
              style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: `1px solid ${listen ? '#ff9500' : '#2a2a3e'}`, background: listen ? '#ff950022' : 'transparent', color: listen ? '#ff9500' : '#445', cursor: 'pointer' }}>
              {listen ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Pro tip */}
        <div className="px-4 py-3 rounded-lg" style={{ background: '#0a0a1a', border: '1px solid #1a1a2e' }}>
          <span className="font-mono font-bold" style={{ fontSize: 10, color: '#ff2d55' }}>Pro tip · </span>
          <span className="font-mono" style={{ fontSize: 10, color: '#445', lineHeight: 1.7 }}>
            Turn on Listen mode to hear only the sibilance band, then move the Freq knob until the harshness is loudest — that's your target. Turn Listen off, then set Threshold until just the harsh S sounds get caught. For rap, set frequency higher (8–9 kHz) and ratio harder (8–10:1). The GR meter shows how hard it's working.
          </span>
        </div>

      </div>
    </div>
  )
}
