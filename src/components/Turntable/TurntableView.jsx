import React, { useState, useRef, useEffect, useCallback } from 'react'
import { getCtx } from '../../audio/audioEngine'

// ── Constants ─────────────────────────────────────────────────────────────────
const SCRATCH_SENSITIVITY = 3.0
const PLATTER_RADIUS      = 130

// ── BPM detection (simple energy-based) ──────────────────────────────────────
function estimateBpm(buffer, sampleRate) {
  const windowSize = Math.round(sampleRate * 0.02)
  const energies   = []
  for (let i = 0; i < buffer.length - windowSize; i += windowSize) {
    let e = 0; for (let j = 0; j < windowSize; j++) e += buffer[i + j] ** 2
    energies.push(e / windowSize)
  }
  const mean = energies.reduce((a, b) => a + b, 0) / energies.length
  let beats = 0, inBeat = false
  for (let e of energies) {
    if (e > mean * 1.5 && !inBeat) { beats++; inBeat = true }
    else if (e < mean) inBeat = false
  }
  const durationSec = buffer.length / sampleRate
  return Math.round((beats / durationSec) * 60)
}

// ── Vinyl platter canvas ───────────────────────────────────────────────────────
function Platter({ spinning, angle, color, onClick, onScratch, label }) {
  const ref    = useRef(null)
  const fr     = useRef(null)
  const angRef = useRef(angle)
  angRef.current = angle

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2, R = PLATTER_RADIUS

    const draw = () => {
      ctx.clearRect(0, 0, W, H)

      // Outer ring
      const grad = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R)
      grad.addColorStop(0, '#111')
      grad.addColorStop(1, '#222')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()

      // Groove lines (rotated)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(angRef.current)
      for (let r = 30; r < R - 8; r += 5) {
        ctx.strokeStyle = r % 10 === 0 ? '#333' : '#222'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
      }
      // Label stripes
      ctx.strokeStyle = color + '66'
      ctx.lineWidth = 2
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * 28, Math.sin(a) * 28)
        ctx.lineTo(Math.cos(a) * 55, Math.sin(a) * 55)
        ctx.stroke()
      }
      ctx.restore()

      // Center label
      ctx.fillStyle = '#0a0a1a'
      ctx.beginPath(); ctx.arc(cx, cy, 55, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = color + '55'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx, cy, 55, 0, Math.PI * 2); ctx.stroke()

      ctx.fillStyle = color
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, cx, cy - 6)
      ctx.fillStyle = '#556'
      ctx.font = '9px monospace'
      ctx.fillText('DECK', cx, cy + 8)

      // Tone arm indicator
      ctx.strokeStyle = color + '88'
      ctx.lineWidth   = 2
      ctx.beginPath()
      ctx.moveTo(cx + R - 5, cy - 8)
      ctx.lineTo(cx + R + 14, cy - 20)
      ctx.stroke()
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(cx + R + 14, cy - 20, 4, 0, Math.PI * 2); ctx.fill()

      fr.current = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(fr.current)
  }, [color, label])

  // Scratch handling
  const dragRef = useRef(null)
  const onPD = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY }
    onScratch?.(0)
    window.addEventListener('pointermove', onPM)
    window.addEventListener('pointerup',   onPU)
    e.preventDefault()
  }
  const onPM = (e) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    dragRef.current = { x: e.clientX, y: e.clientY }
    onScratch?.(dx * SCRATCH_SENSITIVITY)
  }
  const onPU = () => {
    dragRef.current = null
    onScratch?.(null)
    window.removeEventListener('pointermove', onPM)
    window.removeEventListener('pointerup',   onPU)
  }

  return (
    <canvas ref={ref} width={PLATTER_RADIUS * 2 + 40} height={PLATTER_RADIUS * 2 + 40}
      style={{ cursor: 'grab', display: 'block', borderRadius: '50%' }}
      onClick={onClick} onPointerDown={onPD} />
  )
}

// ── EQ strip ─────────────────────────────────────────────────────────────────
function EQKnob({ label, value, color, onChange }) {
  const drag = useRef(null)
  const pct  = (value + 12) / 24
  const angle= -135 + pct * 270
  const r = 20, cx = 24, cy = 24
  const rad = d => d * Math.PI / 180
  const kx = cx + r * Math.sin(rad(angle))
  const ky = cy - r * Math.cos(rad(angle))
  const sx = cx + r * Math.sin(rad(-135)), sy = cy - r * Math.cos(rad(-135))
  const large = angle + 135 > 180 ? 1 : 0

  const onPD = (e) => {
    drag.current = { y: e.clientY, v: value }
    const mm = ev => { if (drag.current) onChange(Math.max(-12, Math.min(12, Math.round(drag.current.v + (drag.current.y - ev.clientY) / 5)))) }
    const mu = () => { drag.current = null; window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', mu) }
    window.addEventListener('pointermove', mm); window.addEventListener('pointerup', mu); e.preventDefault()
  }
  return (
    <div className="flex flex-col items-center gap-0.5 select-none cursor-ns-resize" onPointerDown={onPD}>
      <svg width={48} height={48}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a2e" strokeWidth={3} />
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${kx} ${ky}`} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
        <circle cx={kx} cy={ky} r={3} fill={color} />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#ddd" fontSize={9} fontFamily="monospace">{value > 0 ? '+' : ''}{value}</text>
      </svg>
      <span className="font-mono uppercase" style={{ fontSize: 8, color: '#556' }}>{label}</span>
    </div>
  )
}

// ── Deck ──────────────────────────────────────────────────────────────────────
function Deck({ id, color }) {
  const [loaded,   setLoaded]   = useState(false)
  const [playing,  setPlaying]  = useState(false)
  const [angle,    setAngle]    = useState(0)
  const [speed,    setSpeed]    = useState(1.0)
  const [volume,   setVolume]   = useState(0.8)
  const [pitch,    setPitch]    = useState(0)    // semitones
  const [loop,     setLoop]     = useState(false)
  const [loopA,    setLoopA]    = useState(0)
  const [loopB,    setLoopB]    = useState(0)
  const [trackName,setTrackName]= useState('')
  const [bpm,      setBpm]      = useState(120)
  const [duration, setDuration] = useState(0)
  const [currentT, setCurrentT] = useState(0)
  const [eq,       setEq]       = useState({ low: 0, mid: 0, high: 0 })
  const [cues,     setCues]     = useState([])

  const bufferRef  = useRef(null)
  const sourceRef  = useRef(null)
  const gainRef    = useRef(null)
  const eqRef      = useRef(null)
  const startAtRef = useRef(0)  // audioContext time when play started
  const offsetRef  = useRef(0)  // playback offset when play started
  const frameRef   = useRef(null)
  const scratchRef = useRef(null) // scratch state

  const initNodes = useCallback(() => {
    const c = getCtx()
    if (!gainRef.current) {
      gainRef.current = c.createGain()
      gainRef.current.gain.value = volume
      // EQ chain
      const eqL = c.createBiquadFilter(); eqL.type = 'lowshelf';  eqL.frequency.value = 300;  eqL.gain.value = eq.low
      const eqM = c.createBiquadFilter(); eqM.type = 'peaking';   eqM.frequency.value = 1000; eqM.Q.value = 1; eqM.gain.value = eq.mid
      const eqH = c.createBiquadFilter(); eqH.type = 'highshelf'; eqH.frequency.value = 5000; eqH.gain.value = eq.high
      eqRef.current = { L: eqL, M: eqM, H: eqH }
      gainRef.current.connect(eqL); eqL.connect(eqM); eqM.connect(eqH); eqH.connect(c.destination)
    }
  }, [volume, eq])

  const loadFile = async (file) => {
    const c  = getCtx()
    initNodes()
    const ab = await file.arrayBuffer()
    const buf= await c.decodeAudioData(ab)
    bufferRef.current = buf
    setDuration(buf.duration)
    setTrackName(file.name.replace(/\.[^.]+$/, ''))
    const bpmEst = estimateBpm(buf.getChannelData(0), buf.sampleRate)
    setBpm(Math.max(60, Math.min(200, bpmEst)))
    setLoaded(true)
    setLoopB(buf.duration)
    offsetRef.current = 0
  }

  const play = useCallback(() => {
    if (!bufferRef.current) return
    const c = getCtx()
    initNodes()
    if (sourceRef.current) { try { sourceRef.current.stop() } catch {} }
    const src = c.createBufferSource()
    src.buffer = bufferRef.current
    src.playbackRate.value = speed * Math.pow(2, pitch / 12)
    src.loop    = loop
    src.loopStart = loopA
    src.loopEnd   = loopB
    src.connect(gainRef.current)
    src.start(0, offsetRef.current % bufferRef.current.duration)
    src.onended = () => { if (!loop) setPlaying(false) }
    sourceRef.current = src
    startAtRef.current = c.currentTime
    setPlaying(true)
  }, [speed, pitch, loop, loopA, loopB, initNodes])

  const pause = useCallback(() => {
    if (sourceRef.current) {
      const elapsed = getCtx().currentTime - startAtRef.current
      offsetRef.current = (offsetRef.current + elapsed * speed) % (bufferRef.current?.duration || 1)
      try { sourceRef.current.stop() } catch {}
      sourceRef.current = null
    }
    setPlaying(false)
  }, [speed])

  const seek = useCallback((pct) => {
    const dur = bufferRef.current?.duration || 0
    offsetRef.current = pct * dur
    if (playing) play()
  }, [playing, play])

  const setCue = () => { setCues(prev => [...prev.slice(-3), offsetRef.current]) }
  const jumpCue = (t) => { offsetRef.current = t; if (playing) play() }

  // Scratch
  const onScratch = useCallback((dx) => {
    if (!sourceRef.current) return
    if (dx === null) {
      // Release scratch
      if (sourceRef.current) sourceRef.current.playbackRate.value = playing ? speed * Math.pow(2, pitch / 12) : 0
      scratchRef.current = null
      return
    }
    if (!scratchRef.current) scratchRef.current = { rate: speed * Math.pow(2, pitch / 12) }
    const r = dx / 80
    if (sourceRef.current) sourceRef.current.playbackRate.value = r
  }, [playing, speed, pitch])

  // Update gain
  useEffect(() => { if (gainRef.current) gainRef.current.gain.value = volume }, [volume])

  // Update speed & pitch
  useEffect(() => {
    if (sourceRef.current && playing) sourceRef.current.playbackRate.value = speed * Math.pow(2, pitch / 12)
  }, [speed, pitch, playing])

  // Update EQ
  useEffect(() => {
    if (eqRef.current) {
      eqRef.current.L.gain.value = eq.low
      eqRef.current.M.gain.value = eq.mid
      eqRef.current.H.gain.value = eq.high
    }
  }, [eq])

  // Angle + time display
  useEffect(() => {
    const tick = () => {
      if (playing && bufferRef.current) {
        const elapsed = getCtx().currentTime - startAtRef.current
        const pos = (offsetRef.current + elapsed * speed) % bufferRef.current.duration
        setCurrentT(pos)
        setAngle(a => a + 0.03 * speed)
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [playing, speed])

  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2,'0')}`
  const progress = duration > 0 ? currentT / duration : 0

  return (
    <div className="flex flex-col gap-2" style={{ background: '#0a0a1a', border: `1px solid ${color}33`, borderRadius: 12, padding: 14, width: 320 }}>
      {/* Title + load */}
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-xs flex-1 truncate" style={{ color }}>{trackName || `DECK ${id}`}</span>
        <label style={{ cursor:'pointer', background:`${color}22`, border:`1px solid ${color}44`, borderRadius:4, padding:'2px 8px', fontSize:10, color, fontFamily:'monospace', fontWeight:'bold' }}>
          LOAD <input type="file" accept="audio/*" style={{ display:'none' }} onChange={e => e.target.files[0] && loadFile(e.target.files[0])} />
        </label>
      </div>

      {/* BPM + time */}
      {loaded && (
        <div className="flex gap-3 font-mono text-xs">
          <span style={{ color:'#ffe600' }}>BPM {bpm}</span>
          <span style={{ color:'#556' }}>{fmt(currentT)} / {fmt(duration)}</span>
          <span style={{ color: loop ? color : '#333' }}>LOOP</span>
        </div>
      )}

      {/* Platter */}
      <div className="flex justify-center">
        <Platter spinning={playing} angle={angle} color={color} label={id}
          onClick={() => loaded && (playing ? pause() : play())}
          onScratch={loaded ? onScratch : null} />
      </div>

      {/* Waveform progress bar */}
      <div style={{ height: 6, background:'#1a1a2e', borderRadius:3, overflow:'hidden', cursor:'pointer' }}
        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width) }}>
        <div style={{ height:'100%', width:`${progress*100}%`, background:color, transition:'width 100ms', boxShadow:`0 0 4px ${color}` }} />
      </div>

      {/* Transport */}
      <div className="flex items-center gap-1.5 justify-center">
        <button onClick={() => { offsetRef.current = 0; if (playing) play() }}
          style={{ background:'#ffffff0a', border:'1px solid #333', borderRadius:4, padding:'3px 8px', fontSize:10, color:'#aaa', cursor:'pointer' }}>⏮</button>
        <button onClick={() => loaded && (playing ? pause() : play())}
          style={{ background: playing ? `${color}33` : '#ffffff0a', border:`1px solid ${playing?color:'#333'}`, borderRadius:4, padding:'3px 12px', fontSize:12, color:playing?color:'#aaa', cursor:'pointer', fontWeight:'bold' }}>
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={setCue} style={{ background:'#ffffff0a', border:'1px solid #333', borderRadius:4, padding:'3px 8px', fontSize:10, color:'#ffe600', cursor:'pointer', fontWeight:'bold' }}>CUE</button>
        <button onClick={() => setLoop(v => !v)}
          style={{ background: loop ? `${color}22` : '#ffffff0a', border:`1px solid ${loop?color:'#333'}`, borderRadius:4, padding:'3px 8px', fontSize:10, color:loop?color:'#aaa', cursor:'pointer' }}>
          LOOP
        </button>
      </div>

      {/* Cue points */}
      {cues.length > 0 && (
        <div className="flex gap-1">
          {cues.map((t, i) => (
            <button key={i} onClick={() => jumpCue(t)}
              style={{ flex:1, background:`${color}15`, border:`1px solid ${color}44`, borderRadius:3, padding:'2px 0', fontSize:9, color, fontFamily:'monospace', cursor:'pointer' }}>
              {fmt(t)}
            </button>
          ))}
        </div>
      )}

      {/* Speed + pitch */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-studio-dim w-10">SPEED</span>
          <input type="range" min={0.5} max={2.0} step={0.01} value={speed}
            onChange={e => setSpeed(Number(e.target.value))} className="flex-1" />
          <span className="font-mono text-xs w-10 text-right" style={{ color }}>{speed.toFixed(2)}x</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-studio-dim w-10">PITCH</span>
          <input type="range" min={-12} max={12} step={1} value={pitch}
            onChange={e => setPitch(Number(e.target.value))} className="flex-1" />
          <span className="font-mono text-xs w-10 text-right" style={{ color }}>{pitch > 0 ? '+' : ''}{pitch} st</span>
        </div>
      </div>

      {/* EQ */}
      <div className="flex justify-around pt-1">
        {[['LOW','low'],['MID','mid'],['HIGH','high']].map(([l,k]) => (
          <EQKnob key={k} label={l} value={eq[k]} color={color} onChange={v => setEq(p => ({ ...p, [k]: v }))} />
        ))}
        <div className="flex flex-col items-center gap-0.5">
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => setVolume(Number(e.target.value))}
            style={{ width:48, writingMode:'vertical-lr', direction:'rtl', height:48 }} />
          <span className="font-mono uppercase" style={{ fontSize:8, color:'#556' }}>VOL</span>
        </div>
      </div>
    </div>
  )
}

// ── Crossfader ────────────────────────────────────────────────────────────────
function Crossfader({ value, onChange }) {
  return (
    <div className="flex flex-col items-center gap-2 py-4 px-6" style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8 }}>
      <span className="font-display text-xs tracking-widest uppercase" style={{ color:'#ffe600' }}>CROSSFADER</span>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs font-bold" style={{ color: value < 0.4 ? '#00e5ff' : '#333' }}>A</span>
        <div style={{ position:'relative', width:200, height:20 }}>
          <input type="range" min={0} max={1} step={0.01} value={value} onChange={e => onChange(Number(e.target.value))}
            className="w-full absolute" style={{ top:'50%', transform:'translateY(-50%)', accentColor:'#ffe600' }} />
        </div>
        <span className="font-mono text-xs font-bold" style={{ color: value > 0.6 ? '#ff9500' : '#333' }}>B</span>
      </div>
      <div className="flex gap-4">
        {[0, 0.25, 0.5, 0.75, 1].map(v => (
          <button key={v} onClick={() => onChange(v)}
            style={{ background: Math.abs(value - v) < 0.05 ? '#ffe60033' : '#ffffff0a', border:`1px solid ${Math.abs(value-v)<0.05?'#ffe600':'#333'}`, borderRadius:4, padding:'2px 6px', fontSize:9, color:'#ffe600', cursor:'pointer', fontFamily:'monospace' }}>
            {v === 0 ? 'A' : v === 1 ? 'B' : v === 0.5 ? 'C' : `${Math.round(v*100)}%`}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── FX Buttons ────────────────────────────────────────────────────────────────
function FXPad({ label, color, onTrigger }) {
  const [active, setActive] = useState(false)
  return (
    <button
      onPointerDown={() => { setActive(true); onTrigger?.(true) }}
      onPointerUp={() => { setActive(false); onTrigger?.(false) }}
      onPointerLeave={() => { setActive(false); onTrigger?.(false) }}
      style={{ padding:'10px 0', borderRadius:6, background: active ? `${color}44` : `${color}11`, border:`1px solid ${active?color:color+'44'}`, color, fontSize:10, fontFamily:'monospace', fontWeight:'bold', cursor:'pointer', userSelect:'none', boxShadow: active ? `0 0 12px ${color}` : 'none', transition:'all 0.05s' }}>
      {label}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function TurntableView() {
  const [crossfade, setCrossfade] = useState(0.5)

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ background: '#080810' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-studio-border shrink-0">
        <span className="font-display text-xs tracking-widest uppercase" style={{ background:'linear-gradient(90deg,#00e5ff,#ff9500)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Dual Turntable
        </span>
        <div className="w-px h-4 bg-studio-border" />
        <span className="font-mono text-xs text-studio-dim">Drag the platter to scratch · Click to play/pause · Load any audio file</span>
      </div>

      {/* Decks */}
      <div className="flex-1 flex items-start justify-center gap-6 p-4 overflow-auto">
        {/* Deck A */}
        <Deck id="A" color="#00e5ff" />

        {/* Center mixer column */}
        <div className="flex flex-col gap-3 pt-6" style={{ minWidth: 180 }}>
          <Crossfader value={crossfade} onChange={setCrossfade} />

          {/* FX pads */}
          <div style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:12 }}>
            <div className="font-display text-xs tracking-widest uppercase text-studio-dim mb-2">FX Pads</div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                ['ECHO',   '#00e5ff'],['FLANGER','#b44fff'],['REVERB', '#00ff9d'],
                ['FILTER', '#ffe600'],['BRAKE',  '#ff2d55'],['SPIN UP','#ff9500'],
              ].map(([l, c]) => <FXPad key={l} label={l} color={c} />)}
            </div>
          </div>

          {/* Beat sync indicator */}
          <div style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:10 }}>
            <div className="font-display text-xs tracking-widest uppercase text-studio-dim mb-2">Beat Sync</div>
            <div className="flex gap-2 justify-center">
              {[0,1,2,3].map(i => (
                <div key={i} style={{ width:10, height:10, borderRadius:'50%', background:'#1a1a2e', border:'1px solid #333' }} />
              ))}
            </div>
          </div>
        </div>

        {/* Deck B */}
        <Deck id="B" color="#ff9500" />
      </div>
    </div>
  )
}
