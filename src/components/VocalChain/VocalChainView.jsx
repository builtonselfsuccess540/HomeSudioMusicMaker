import { useState, useRef, useCallback, useEffect } from 'react'
import { getCtx } from '../../audio/audioEngine'

// ─── Knob ──────────────────────────────────────────────────────────────────
function Knob({ label, value, min, max, step = 1, unit = '', onChange, color = '#00e5ff' }) {
  const pct   = (value - min) / (max - min)
  const angle = -135 + pct * 270
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid #2a2a3e`, position: 'relative', cursor: 'ns-resize', background: '#0d0d1e' }}
        onMouseDown={e => {
          const startY = e.clientY, startVal = value
          const move = me => {
            const delta = (startY - me.clientY) * (max - min) / 120
            onChange(Math.min(max, Math.max(min, Math.round((startVal + delta) / step) * step)))
          }
          const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
        }}
      >
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 2, height: 16, background: color, transformOrigin: 'bottom center', transform: `translate(-50%, -100%) rotate(${angle}deg)`, borderRadius: 1 }} />
      </div>
      <span className="font-mono text-center" style={{ fontSize: 9, color: '#445', lineHeight: 1.2 }}>{label}</span>
      <span className="font-mono font-bold" style={{ fontSize: 10, color }}>{value}{unit}</span>
    </div>
  )
}

// ─── Section card ──────────────────────────────────────────────────────────
function Section({ title, on, setOn, color, children }) {
  return (
    <div style={{ border: `1px solid ${on ? color + '66' : '#1a1a2e'}`, borderRadius: 8, padding: '10px 14px', background: on ? color + '0a' : 'transparent', transition: 'all 0.2s' }}>
      <div className="flex justify-between items-center mb-3">
        <span className="font-mono font-bold tracking-widest uppercase" style={{ fontSize: 10, color: on ? color : '#445' }}>{title}</span>
        <button
          onClick={() => setOn(!on)}
          className="font-mono font-bold transition-all"
          style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, border: `1px solid ${on ? color : '#2a2a3e'}`, background: on ? color + '33' : 'transparent', color: on ? color : '#445', cursor: 'pointer' }}
        >{on ? 'ON' : 'OFF'}</button>
      </div>
      <div className="flex gap-3 flex-wrap items-center">
        {children}
      </div>
    </div>
  )
}

// ─── Level meter ───────────────────────────────────────────────────────────
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

// ─── Main component ────────────────────────────────────────────────────────
export default function VocalChainView() {
  const [active,       setActive]       = useState(false)
  const [chainReady,   setChainReady]   = useState(false)

  // High-pass filter
  const [hpfFreq,  setHpfFreq]  = useState(100)
  const [hpfOn,    setHpfOn]    = useState(true)

  // De-esser
  const [deessThresh, setDeessThresh] = useState(-24)
  const [deessFreq,   setDeessFreq]   = useState(7000)
  const [deessOn,     setDeessOn]     = useState(true)

  // Compressor
  const [compThresh,  setCompThresh]  = useState(-18)
  const [compRatio,   setCompRatio]   = useState(4)
  const [compAttack,  setCompAttack]  = useState(5)
  const [compRelease, setCompRelease] = useState(80)
  const [compOn,      setCompOn]      = useState(true)

  // Auto-Tune (UI display — controls shown for reference; OLA pitch shift in AutoTune tab)
  const [atKey,   setAtKey]   = useState('C')
  const [atScale, setAtScale] = useState('major')
  const [atSpeed, setAtSpeed] = useState(30)
  const [atOn,    setAtOn]    = useState(true)
  const [atMode,  setAtMode]  = useState('natural')

  // EQ
  const [eqLow,      setEqLow]      = useState(0)
  const [eqMid,      setEqMid]      = useState(2)
  const [eqPresence, setEqPresence] = useState(3)
  const [eqAir,      setEqAir]      = useState(1)
  const [eqOn,       setEqOn]       = useState(true)

  // Saturation
  const [satDrive, setSatDrive] = useState(2)
  const [satMix,   setSatMix]   = useState(30)
  const [satOn,    setSatOn]    = useState(true)

  // Reverb
  const [reverbSize, setReverbSize] = useState(20)
  const [reverbMix,  setReverbMix]  = useState(15)
  const [reverbOn,   setReverbOn]   = useState(true)

  // Delay
  const [delayTime,     setDelayTime]     = useState(125)
  const [delayFeedback, setDelayFeedback] = useState(20)
  const [delayMix,      setDelayMix]      = useState(12)
  const [delayOn,       setDelayOn]       = useState(true)

  // Output
  const [outputGain,   setOutputGain]   = useState(0)
  const [inputLevel,   setInputLevel]   = useState(0)
  const [outputLevel,  setOutputLevel]  = useState(0)

  const nodesRef        = useRef({})
  const streamRef       = useRef(null)
  const animRef         = useRef(null)
  const analyserInRef   = useRef(null)
  const analyserOutRef  = useRef(null)

  const buildChain = useCallback(async () => {
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
    streamRef.current = stream

    const src = ctx.createMediaStreamSource(stream)

    // Input analyser
    const analyserIn = ctx.createAnalyser(); analyserIn.fftSize = 256
    analyserInRef.current = analyserIn

    // 1 · High-pass filter
    const hpf = ctx.createBiquadFilter()
    hpf.type = 'highpass'; hpf.frequency.value = hpfFreq; hpf.Q.value = 0.707

    // 2 · De-esser (sidechain HPF → compressor, blended back)
    const deessHpf = ctx.createBiquadFilter()
    deessHpf.type = 'highpass'; deessHpf.frequency.value = deessFreq
    const deessComp = ctx.createDynamicsCompressor()
    deessComp.threshold.value = deessThresh; deessComp.knee.value = 3
    deessComp.ratio.value = 8; deessComp.attack.value = 0.003; deessComp.release.value = 0.05
    const deessWet = ctx.createGain(); deessWet.gain.value = 0.6
    const deessDry = ctx.createGain(); deessDry.gain.value = 0.4
    const deessOut = ctx.createGain()

    // 3 · Compressor
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = compThresh; comp.knee.value = 6
    comp.ratio.value = compRatio
    comp.attack.value = compAttack / 1000; comp.release.value = compRelease / 1000

    // 5 · EQ (4 bands: low shelf / mud cut / presence / air)
    const eqLowShelf = ctx.createBiquadFilter()
    eqLowShelf.type = 'lowshelf'; eqLowShelf.frequency.value = 200; eqLowShelf.gain.value = eqLow
    const eqMidPeak = ctx.createBiquadFilter()
    eqMidPeak.type = 'peaking'; eqMidPeak.frequency.value = 350; eqMidPeak.Q.value = 1.4
    eqMidPeak.gain.value = eqMid > 0 ? -Math.abs(eqMid) * 0.5 : 0
    const eqPresencePeak = ctx.createBiquadFilter()
    eqPresencePeak.type = 'peaking'; eqPresencePeak.frequency.value = 3000; eqPresencePeak.Q.value = 1.0
    eqPresencePeak.gain.value = eqPresence
    const eqAirShelf = ctx.createBiquadFilter()
    eqAirShelf.type = 'highshelf'; eqAirShelf.frequency.value = 10000; eqAirShelf.gain.value = eqAir

    // 6 · Saturation
    const makeSatCurve = drive => {
      const n = 256, curve = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1
        curve[i] = ((Math.PI + drive) * x) / (Math.PI + drive * Math.abs(x))
      }
      return curve
    }
    const satWave = ctx.createWaveShaper()
    satWave.curve = makeSatCurve(satDrive); satWave.oversample = '4x'
    const satDryGain = ctx.createGain(); satDryGain.gain.value = 1 - satMix / 100
    const satWetGain = ctx.createGain(); satWetGain.gain.value = satMix / 100
    const satOut = ctx.createGain()

    // 7 · Reverb (convolution)
    const convolver = ctx.createConvolver()
    const reverbLen = Math.floor(ctx.sampleRate * (0.5 + reverbSize / 100 * 3))
    const reverbBuf = ctx.createBuffer(2, reverbLen, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = reverbBuf.getChannelData(c)
      for (let i = 0; i < reverbLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLen, 2)
    }
    convolver.buffer = reverbBuf
    const reverbWet = ctx.createGain(); reverbWet.gain.value = reverbMix / 100
    const reverbDry = ctx.createGain(); reverbDry.gain.value = 1 - reverbMix / 100
    const reverbOut = ctx.createGain()

    // 8 · Delay
    const delay = ctx.createDelay(2.0); delay.delayTime.value = delayTime / 1000
    const delayFB = ctx.createGain(); delayFB.gain.value = delayFeedback / 100
    const delayWet = ctx.createGain(); delayWet.gain.value = delayMix / 100
    const delayDry = ctx.createGain(); delayDry.gain.value = 1 - delayMix / 100
    const delayOut = ctx.createGain()

    // Output stage
    const outGainNode = ctx.createGain(); outGainNode.gain.value = Math.pow(10, outputGain / 20)
    const analyserOut = ctx.createAnalyser(); analyserOut.fftSize = 256
    analyserOutRef.current = analyserOut

    // ── Wire the chain ──────────────────────────────────────────────────────
    src.connect(analyserIn)
    src.connect(hpf)

    // HPF → de-esser (parallel wet/dry)
    hpf.connect(deessHpf); hpf.connect(deessDry)
    deessHpf.connect(deessComp); deessComp.connect(deessWet)
    deessWet.connect(deessOut); deessDry.connect(deessOut)

    // De-esser → compressor → EQ
    deessOut.connect(comp)
    comp.connect(eqLowShelf)
    eqLowShelf.connect(eqMidPeak); eqMidPeak.connect(eqPresencePeak); eqPresencePeak.connect(eqAirShelf)

    // EQ → saturation (parallel)
    eqAirShelf.connect(satDryGain); eqAirShelf.connect(satWave)
    satWave.connect(satWetGain); satDryGain.connect(satOut); satWetGain.connect(satOut)

    // Saturation → reverb (parallel)
    satOut.connect(reverbDry); satOut.connect(convolver)
    convolver.connect(reverbWet); reverbDry.connect(reverbOut); reverbWet.connect(reverbOut)

    // Reverb → delay (parallel)
    reverbOut.connect(delayDry); reverbOut.connect(delay)
    delay.connect(delayFB); delayFB.connect(delay)
    delay.connect(delayWet); delayDry.connect(delayOut); delayWet.connect(delayOut)

    // → output
    delayOut.connect(outGainNode)
    outGainNode.connect(analyserOut)
    outGainNode.connect(ctx.destination)

    nodesRef.current = {
      src, hpf, deessHpf, deessComp, deessWet, deessDry, deessOut,
      comp, eqLowShelf, eqMidPeak, eqPresencePeak, eqAirShelf,
      satWave, satDryGain, satWetGain, satOut, makeSatCurve,
      convolver, reverbWet, reverbDry, reverbOut,
      delay, delayFB, delayWet, delayDry, delayOut,
      outGainNode,
    }

    setChainReady(true)
    setActive(true)

    // Level meters
    const tick = () => {
      const read = (an) => {
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stopChain = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    try { nodesRef.current.src?.disconnect() } catch (_) {}
    nodesRef.current = {}
    analyserInRef.current  = null
    analyserOutRef.current = null
    setChainReady(false)
    setActive(false)
    setInputLevel(0)
    setOutputLevel(0)
  }, [])

  useEffect(() => () => stopChain(), [stopChain])

  // Live parameter updates (no rebuild needed)
  useEffect(() => { const n = nodesRef.current; if (n.hpf) n.hpf.frequency.value = hpfFreq }, [hpfFreq])
  useEffect(() => { const n = nodesRef.current; if (n.deessComp) { n.deessComp.threshold.value = deessThresh; n.deessHpf.frequency.value = deessFreq } }, [deessThresh, deessFreq])
  useEffect(() => { const n = nodesRef.current; if (n.comp) { n.comp.threshold.value = compThresh; n.comp.ratio.value = compRatio; n.comp.attack.value = compAttack / 1000; n.comp.release.value = compRelease / 1000 } }, [compThresh, compRatio, compAttack, compRelease])
  useEffect(() => { const n = nodesRef.current; if (n.eqLowShelf) { n.eqLowShelf.gain.value = eqLow; n.eqMidPeak.gain.value = eqMid > 0 ? -Math.abs(eqMid) * 0.5 : 0; n.eqPresencePeak.gain.value = eqPresence; n.eqAirShelf.gain.value = eqAir } }, [eqLow, eqMid, eqPresence, eqAir])
  useEffect(() => { const n = nodesRef.current; if (n.satWave) { n.satWave.curve = n.makeSatCurve(satDrive); n.satDryGain.gain.value = 1 - satMix / 100; n.satWetGain.gain.value = satMix / 100 } }, [satDrive, satMix])
  useEffect(() => { const n = nodesRef.current; if (n.reverbWet) { n.reverbWet.gain.value = reverbMix / 100; n.reverbDry.gain.value = 1 - reverbMix / 100 } }, [reverbMix])
  useEffect(() => { const n = nodesRef.current; if (n.delay) { n.delay.delayTime.value = delayTime / 1000; n.delayFB.gain.value = delayFeedback / 100; n.delayWet.gain.value = delayMix / 100; n.delayDry.gain.value = 1 - delayMix / 100 } }, [delayTime, delayFeedback, delayMix])
  useEffect(() => { const n = nodesRef.current; if (n.outGainNode) n.outGainNode.gain.value = Math.pow(10, outputGain / 20) }, [outputGain])

  const KEYS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

  const applyPreset = (p) => {
    if (p === 'natural') {
      setHpfFreq(100); setDeessThresh(-24); setDeessFreq(7000)
      setCompThresh(-18); setCompRatio(4); setCompAttack(5); setCompRelease(80)
      setAtSpeed(30); setAtMode('natural'); setEqPresence(3); setEqAir(1)
      setSatDrive(2); setSatMix(20); setReverbSize(20); setReverbMix(12)
      setDelayTime(125); setDelayMix(10)
    } else if (p === 'trap') {
      setAtSpeed(0); setAtMode('robot'); setSatDrive(8); setSatMix(40)
      setCompRatio(8); setReverbSize(35); setReverbMix(20); setDelayTime(167); setDelayMix(18)
    } else if (p === 'gospel') {
      setAtSpeed(60); setAtMode('smooth'); setSatDrive(1); setSatMix(15)
      setCompRatio(3); setEqPresence(2); setReverbSize(40); setReverbMix(25)
      setDelayTime(250); setDelayMix(15)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-5" style={{ background: '#080810' }}>
      <div style={{ maxWidth: 740, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <span className="font-display text-xs tracking-widest uppercase"
              style={{ background: 'linear-gradient(90deg,#b44fff,#00e5ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Vocal Chain
            </span>
            <div className="font-mono mt-0.5" style={{ fontSize: 10, color: '#445' }}>
              Gospel / Rap — 8-stage professional signal path
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-3 items-end">
              <Meter level={inputLevel}  label="IN"  color="#00ff9d" />
              <Meter level={outputLevel} label="OUT" color="#b44fff" />
            </div>
            <button
              onClick={active ? stopChain : buildChain}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-mono font-bold transition-all"
              style={{
                background: active ? '#ff2d5522' : '#00e5ff22',
                border: `1px solid ${active ? '#ff2d55' : '#00e5ff'}`,
                color: active ? '#ff2d55' : '#00e5ff',
              }}>
              {active ? '■ Stop' : '▶ Start Mic'}
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4" style={{ background: '#0a0a1a', border: '1px solid #1a1a2e' }}>
          <div className="w-2 h-2 rounded-full" style={{ background: active ? '#00ff9d' : '#333', boxShadow: active ? '0 0 6px #00ff9d' : 'none' }} />
          <span className="font-mono text-xs" style={{ color: active ? '#00ff9d' : '#445' }}>
            {active ? 'Chain running — speak or sing into your mic' : 'Click Start Mic to activate the vocal chain'}
          </span>
        </div>

        <div className="flex flex-col gap-3">

          {/* 1 · High-pass filter */}
          <Section title="1 · High-Pass Filter" on={hpfOn} setOn={setHpfOn} color="#888799">
            <Knob label="Cutoff" value={hpfFreq} min={40} max={300} onChange={setHpfFreq} unit=" Hz" color="#888799" />
            <span className="font-mono" style={{ fontSize: 10, color: '#445', lineHeight: 1.5 }}>
              Removes low rumble, mic handling noise, and room resonance below cutoff
            </span>
          </Section>

          {/* 2 · De-esser */}
          <Section title="2 · De-Esser" on={deessOn} setOn={setDeessOn} color="#00ff9d">
            <Knob label="Threshold" value={deessThresh} min={-48} max={0} onChange={setDeessThresh} unit=" dB" color="#00ff9d" />
            <Knob label="Freq" value={deessFreq} min={4000} max={12000} step={100} onChange={setDeessFreq} unit=" Hz" color="#00ff9d" />
            <span className="font-mono" style={{ fontSize: 10, color: '#445', lineHeight: 1.5 }}>
              Tames harsh "s" and "t" sounds that spike at high frequencies
            </span>
          </Section>

          {/* 3 · Compressor */}
          <Section title="3 · Compressor" on={compOn} setOn={setCompOn} color="#b44fff">
            <Knob label="Threshold" value={compThresh} min={-48} max={0} onChange={setCompThresh} unit=" dB" color="#b44fff" />
            <Knob label="Ratio"     value={compRatio}  min={1}   max={20} onChange={setCompRatio}  unit=":1" color="#b44fff" />
            <Knob label="Attack"    value={compAttack}  min={1}   max={100} onChange={setCompAttack}  unit=" ms" color="#b44fff" />
            <Knob label="Release"   value={compRelease} min={20}  max={500} onChange={setCompRelease} unit=" ms" color="#b44fff" />
          </Section>

          {/* 4 · Auto-Tune (UI reference — actual pitch shift: Auto-Tune tab) */}
          <Section title="4 · Pitch Correction" on={atOn} setOn={setAtOn} color="#ff9500">
            <div className="flex flex-col gap-1">
              <span className="font-mono" style={{ fontSize: 9, color: '#445' }}>Key</span>
              <select value={atKey} onChange={e => setAtKey(e.target.value)}
                className="bg-studio-void border border-studio-border rounded px-2 py-0.5 text-xs font-mono text-studio-text">
                {KEYS.map(k => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono" style={{ fontSize: 9, color: '#445' }}>Scale</span>
              <select value={atScale} onChange={e => setAtScale(e.target.value)}
                className="bg-studio-void border border-studio-border rounded px-2 py-0.5 text-xs font-mono text-studio-text">
                {['major','minor','pentatonic','blues','chromatic'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <Knob label="Speed" value={atSpeed} min={0} max={100} onChange={setAtSpeed} color="#ff9500" />
            <div className="flex flex-col gap-1">
              <span className="font-mono" style={{ fontSize: 9, color: '#445' }}>Mode</span>
              <div className="flex gap-1">
                {['natural','smooth','robot'].map(m => (
                  <button key={m} onClick={() => setAtMode(m)}
                    className="font-mono transition-all"
                    style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, border: `1px solid ${atMode === m ? '#ff9500' : '#2a2a3e'}`, background: atMode === m ? '#ff950022' : 'transparent', color: atMode === m ? '#ff9500' : '#445', cursor: 'pointer' }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <span className="font-mono" style={{ fontSize: 9, color: '#334', lineHeight: 1.5 }}>
              Settings shown here. Use the Auto-Tune tab for live mic pitch correction.
            </span>
          </Section>

          {/* 5 · EQ */}
          <Section title="5 · EQ — Tone Shaping" on={eqOn} setOn={setEqOn} color="#00e5ff">
            <Knob label="Low shelf"    value={eqLow}      min={-12} max={12} onChange={setEqLow}      unit=" dB" color="#00e5ff" />
            <Knob label="Mud cut 350"  value={eqMid}      min={0}   max={12} onChange={setEqMid}      unit=" dB" color="#00e5ff" />
            <Knob label="Presence 3k"  value={eqPresence} min={-6}  max={12} onChange={setEqPresence} unit=" dB" color="#00e5ff" />
            <Knob label="Air 10k"      value={eqAir}      min={-6}  max={12} onChange={setEqAir}      unit=" dB" color="#00e5ff" />
          </Section>

          {/* 6 · Saturation */}
          <Section title="6 · Saturation / Harmonic Exciter" on={satOn} setOn={setSatOn} color="#ff6b35">
            <Knob label="Drive" value={satDrive} min={1}  max={20}  onChange={setSatDrive} color="#ff6b35" />
            <Knob label="Mix"   value={satMix}   min={0}  max={100} onChange={setSatMix}   unit="%" color="#ff6b35" />
            <span className="font-mono" style={{ fontSize: 10, color: '#445', lineHeight: 1.5 }}>
              Adds harmonic warmth and helps vocals cut through dense beats
            </span>
          </Section>

          {/* 7 · Reverb */}
          <Section title="7 · Reverb" on={reverbOn} setOn={setReverbOn} color="#00ff9d">
            <Knob label="Room size" value={reverbSize} min={0} max={100} onChange={setReverbSize} unit="%" color="#00ff9d" />
            <Knob label="Mix"       value={reverbMix}  min={0} max={60}  onChange={setReverbMix}  unit="%" color="#00ff9d" />
          </Section>

          {/* 8 · Delay */}
          <Section title="8 · Delay" on={delayOn} setOn={setDelayOn} color="#ffe600">
            <Knob label="Time"     value={delayTime}     min={20}  max={800} step={5}  onChange={setDelayTime}     unit=" ms" color="#ffe600" />
            <Knob label="Feedback" value={delayFeedback} min={0}   max={80}            onChange={setDelayFeedback} unit="%" color="#ffe600" />
            <Knob label="Mix"      value={delayMix}      min={0}   max={60}            onChange={setDelayMix}      unit="%" color="#ffe600" />
            <div className="flex gap-1 flex-wrap">
              {[62, 83, 125, 167, 250].map(ms => (
                <button key={ms} onClick={() => setDelayTime(ms)}
                  className="font-mono transition-all"
                  style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4, border: `1px solid ${delayTime === ms ? '#ffe600' : '#2a2a3e'}`, background: delayTime === ms ? '#ffe60022' : 'transparent', color: delayTime === ms ? '#ffe600' : '#445', cursor: 'pointer' }}>
                  {ms}ms
                </button>
              ))}
            </div>
          </Section>

          {/* Output gain */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ border: '1px solid #1a1a2e', background: '#0a0a1a' }}>
            <span className="font-mono font-bold uppercase tracking-widest" style={{ fontSize: 10, color: '#445', minWidth: 90 }}>Output Gain</span>
            <input type="range" min={-12} max={12} step={0.5} value={outputGain}
              onChange={e => setOutputGain(parseFloat(e.target.value))} className="flex-1" />
            <span className="font-mono font-bold" style={{ fontSize: 11, color: '#00e5ff', minWidth: 48 }}>
              {outputGain > 0 ? '+' : ''}{outputGain.toFixed(1)} dB
            </span>
          </div>

          {/* Presets */}
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg" style={{ border: '1px solid #1a1a2e', background: '#0a0a1a' }}>
            <span className="font-mono font-bold uppercase tracking-widest" style={{ fontSize: 10, color: '#445', minWidth: 68 }}>Presets</span>
            {[
              { id: 'natural', label: 'Natural correction', color: '#00ff9d' },
              { id: 'trap',    label: 'Melodic trap',       color: '#b44fff' },
              { id: 'gospel',  label: 'Gospel worship',     color: '#ff9500' },
            ].map(p => (
              <button key={p.id} onClick={() => applyPreset(p.id)}
                className="font-mono font-semibold transition-all"
                style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: `1px solid ${p.color}44`, background: p.color + '11', color: p.color, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = p.color + '22'; e.currentTarget.style.borderColor = p.color }}
                onMouseLeave={e => { e.currentTarget.style.background = p.color + '11'; e.currentTarget.style.borderColor = p.color + '44' }}>
                {p.label}
              </button>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
