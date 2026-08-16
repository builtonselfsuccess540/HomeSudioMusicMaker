import React, { useState, useRef, useEffect, useCallback } from 'react'
import { getCtx } from '../../audio/audioEngine'

const PRESETS = [
  { name: 'Freeze',  position: 0.5, spread: 0.01, size: 400, pitch: 1.0, density: 16, pan: 0.3 },
  { name: 'Shimmer', position: 0.5, spread: 0.2,  size: 120, pitch: 2.0, density: 12, pan: 0.8 },
  { name: 'Texture', position: 0.4, spread: 0.4,  size: 200, pitch: 1.0, density: 8,  pan: 0.6 },
  { name: 'Stutter', position: 0.5, spread: 0.05, size: 40,  pitch: 1.0, density: 20, pan: 0.1 },
  { name: 'Cloud',   position: 0.5, spread: 0.5,  size: 300, pitch: 0.75,density: 10, pan: 1.0 },
  { name: 'Reverse', position: 0.5, spread: 0.2,  size: 200, pitch: -1.0,density: 8,  pan: 0.4 },
]

function Slider({ label, value, min, max, step = 0.01, unit = '', color = '#00e5ff', onChange, fmt }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="font-mono uppercase tracking-wider" style={{ fontSize: 9, color: '#556' }}>{label}</span>
        <span className="font-mono text-xs font-bold" style={{ color }}>{fmt ? fmt(value) : `${value}${unit}`}</span>
      </div>
      <div className="relative h-1.5 rounded-full" style={{ background: '#1a1a2e' }}>
        <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}88` }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-ew-resize h-full" />
      </div>
    </div>
  )
}

function WaveformCanvas({ buffer, position, spread, grainPositions }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const W = cv.width, H = cv.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#050510'
    ctx.fillRect(0, 0, W, H)

    if (buffer) {
      const data = buffer.getChannelData(0)
      const step = data.length / W
      ctx.strokeStyle = '#00e5ff55'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i < W; i++) {
        const s = Math.floor(i * step)
        const y = (1 - (data[s] + 1) / 2) * H
        i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
      }
      ctx.stroke()

      // Spread zone
      const cx = position * W
      const sw = spread * W
      ctx.fillStyle = '#00e5ff0a'
      ctx.fillRect(cx - sw, 0, sw * 2, H)

      // Position line
      ctx.strokeStyle = '#00e5ff'
      ctx.lineWidth = 2
      ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 8
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke()
      ctx.shadowBlur = 0

      // Active grain dots
      grainPositions.forEach(gp => {
        const gx = gp * W
        ctx.fillStyle = '#ff9500cc'
        ctx.shadowColor = '#ff9500'; ctx.shadowBlur = 6
        ctx.beginPath(); ctx.arc(gx, H / 2, 3, 0, Math.PI * 2); ctx.fill()
      })
      ctx.shadowBlur = 0
    } else {
      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(20, H/2 - 1, W - 40, 2)
      ctx.fillStyle = '#334'
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Drop an audio file or click to load', W/2, H/2 + 20)
    }
  }, [buffer, position, spread, grainPositions])

  return <canvas ref={ref} width={500} height={100} style={{ borderRadius: 6, border: '1px solid #1a1a2e', display: 'block', width: '100%' }} />
}

export default function GranularSynthView() {
  const [buffer,   setBuffer]   = useState(null)
  const [fileName, setFileName] = useState('')
  const [playing,  setPlaying]  = useState(false)
  const [position, setPosition] = useState(0.5)
  const [spread,   setSpread]   = useState(0.1)
  const [size,     setSize]     = useState(150)
  const [pitch,    setPitch]    = useState(1.0)
  const [density,  setDensity]  = useState(8)
  const [pan,      setPan]      = useState(0.3)
  const [volume,   setVolume]   = useState(0.75)
  const [grainDots, setGrainDots] = useState([])

  const intervalRef  = useRef(null)
  const paramsRef    = useRef({})
  const fileRef      = useRef(null)

  // Keep params in sync without needing closure re-bind
  useEffect(() => {
    paramsRef.current = { position, spread, size, pitch, density, pan, volume }
  }, [position, spread, size, pitch, density, pan, volume])

  const triggerGrain = useCallback(() => {
    if (!buffer) return
    const ctx = getCtx()
    const p = paramsRef.current
    const jitter  = (Math.random() * 2 - 1) * p.spread
    const pos     = Math.max(0, Math.min(0.995, p.position + jitter))
    const durSec  = p.size / 1000
    const startOff = pos * buffer.duration
    const t       = ctx.currentTime

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = Math.abs(p.pitch)

    const env = ctx.createGain()
    const panner = ctx.createStereoPanner()
    panner.pan.value = (Math.random() * 2 - 1) * p.pan

    const fade = Math.min(durSec * 0.15, 0.02)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(p.volume, t + fade)
    env.gain.setValueAtTime(p.volume, t + durSec - fade)
    env.gain.linearRampToValueAtTime(0, t + durSec)

    src.connect(env); env.connect(panner); panner.connect(ctx.destination)
    src.start(t, startOff, durSec + 0.01)
    src.stop(t + durSec + 0.01)

    setGrainDots(prev => [...prev.slice(-8), pos])
  }, [buffer])

  useEffect(() => {
    if (playing && buffer) {
      const ms = Math.max(30, 1000 / paramsRef.current.density)
      intervalRef.current = setInterval(triggerGrain, ms)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [playing, buffer, triggerGrain, density])

  const loadFile = async (file) => {
    if (!file) return
    const ctx = getCtx()
    const arrayBuffer = await file.arrayBuffer()
    const decoded = await ctx.decodeAudioData(arrayBuffer)
    setBuffer(decoded)
    setFileName(file.name)
    setGrainDots([])
    setPlaying(false)
  }

  const applyPreset = (p) => {
    setPosition(p.position); setSpread(p.spread); setSize(p.size)
    setPitch(p.pitch); setDensity(p.density); setPan(p.pan)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('audio/')) loadFile(file)
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#080810' }}>

      {/* ── Left: controls ── */}
      <div className="flex flex-col gap-4 p-5 border-r border-studio-border shrink-0 overflow-y-auto" style={{ width: 270 }}>
        <div className="flex items-center justify-between">
          <span className="font-display text-xs tracking-widest uppercase"
            style={{ background: 'linear-gradient(90deg,#ff9500,#b44fff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            Granular Synth
          </span>
          <button
            onClick={() => setPlaying(v => !v)}
            disabled={!buffer}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-bold transition-all disabled:opacity-30"
            style={{
              background: playing ? '#ff950022' : '#ffffff0a',
              border: `1px solid ${playing ? '#ff9500' : '#333'}`,
              color: playing ? '#ff9500' : '#555',
            }}>
            {playing ? '■ Stop' : '▶ Play'}
          </button>
        </div>

        {/* File drop zone */}
        <div
          className="flex flex-col items-center justify-center rounded-xl cursor-pointer"
          style={{ border: '1.5px dashed #2a2a3e', minHeight: 60, background: '#0d0d1e', padding: 12 }}
          onClick={() => fileRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}>
          <input ref={fileRef} type="file" accept="audio/*" style={{ display:'none' }} onChange={e => loadFile(e.target.files[0])} />
          <span className="font-mono text-xs" style={{ color: fileName ? '#ff9500' : '#334' }}>
            {fileName || 'Drop audio or click to load'}
          </span>
        </div>

        <Slider label="Position" value={position} min={0} max={1} color="#00e5ff"
          fmt={v => `${Math.round(v*100)}%`} onChange={setPosition} />
        <Slider label="Spread" value={spread} min={0} max={0.5} color="#b44fff"
          fmt={v => `${Math.round(v*100)}%`} onChange={setSpread} />
        <Slider label="Grain Size" value={size} min={10} max={800} step={1} unit="ms" color="#ff9500"
          onChange={setSize} fmt={v => `${v}ms`} />
        <Slider label="Pitch" value={pitch} min={0.25} max={4} step={0.01} color="#ffe600"
          fmt={v => `${v.toFixed(2)}x`} onChange={setPitch} />
        <Slider label="Density" value={density} min={1} max={32} step={1} unit="/s" color="#00ff9d"
          fmt={v => `${v}/s`} onChange={setDensity} />
        <Slider label="Pan Spread" value={pan} min={0} max={1} color="#ff2d55"
          fmt={v => `${Math.round(v*100)}%`} onChange={setPan} />
        <Slider label="Volume" value={volume} min={0} max={1} color="#00e5ff"
          fmt={v => `${Math.round(v*100)}%`} onChange={setVolume} />

        {/* Presets */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Presets</div>
          <div className="grid grid-cols-3 gap-1">
            {PRESETS.map(p => (
              <button key={p.name} onClick={() => applyPreset(p)}
                className="py-1.5 rounded text-xs font-mono font-semibold transition-all"
                style={{ background:'#ffffff08', border:'1px solid #2a2a3e', color:'#aaa' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#ff9500'; e.currentTarget.style.color='#ff9500' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#2a2a3e'; e.currentTarget.style.color='#aaa' }}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: visualization ── */}
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">
        <div className="font-display text-xs tracking-widest uppercase text-studio-dim">Waveform + Grain Position</div>
        <WaveformCanvas buffer={buffer} position={position} spread={spread} grainPositions={grainDots} />

        {/* Live stats */}
        {buffer && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label:'Duration',  val: `${buffer.duration.toFixed(1)}s`,    color:'#00e5ff' },
              { label:'Sample Rate',val:`${(buffer.sampleRate/1000).toFixed(1)}kHz`, color:'#00ff9d' },
              { label:'Grains/s',  val:`${density}`,                          color:'#ff9500' },
              { label:'Grain Size',val:`${size}ms`,                           color:'#b44fff' },
            ].map(s => (
              <div key={s.label} style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                <div className="font-mono font-bold" style={{ fontSize:16, color:s.color }}>{s.val}</div>
                <div className="font-mono" style={{ fontSize:9, color:'#444' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* How it works */}
        <div style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:14 }}>
          <div className="font-display text-xs tracking-widest uppercase text-studio-dim mb-3">How Granular Synthesis Works</div>
          {[
            ['Position', 'Where in the audio file the grains are read from. Drag it to scan through the sample.'],
            ['Spread', 'Randomizes the grain start position around the Position marker. High spread = cloud of sound.'],
            ['Grain Size', 'How long each grain is. Short = glitchy/stuttery. Long = smooth pads.'],
            ['Pitch', 'Playback rate of each grain. 2x = one octave up. Try 0.5x for deep textures.'],
            ['Density', 'How many grains trigger per second. High density = smooth. Low = rhythmic stutters.'],
            ['Pan Spread', 'Randomizes left/right placement of each grain. Creates wide stereo textures.'],
          ].map(([t,d]) => (
            <div key={t} className="flex gap-2 mb-1.5">
              <span className="font-mono font-bold shrink-0" style={{ fontSize:10, color:'#ff9500', minWidth:80 }}>{t}</span>
              <span className="font-mono" style={{ fontSize:10, color:'#556', lineHeight:1.5 }}>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
