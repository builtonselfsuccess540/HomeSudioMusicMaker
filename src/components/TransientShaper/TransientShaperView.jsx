import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  initMasteringChain, masteringState, onMasteringChange,
  setTransientEnabled, setTransientParam, getLufsAnalyser,
} from '../../audio/audioEngine'

function Knob({ value, min, max, step = 1, label, unit = '', color = '#00e5ff', onChange, size = 64 }) {
  const drag = useRef(null)
  const pct  = (value - min) / (max - min)
  const startAngle = -135, endAngle = 135
  const angle = startAngle + pct * (endAngle - startAngle)
  const r = size / 2 - 5, cx = size / 2, cy = size / 2
  const rad = d => d * Math.PI / 180
  const kx = cx + r * Math.sin(rad(angle))
  const ky = cy - r * Math.cos(rad(angle))
  const sa = startAngle, ea = angle
  const large = (ea - sa) > 180 ? 1 : 0
  const sx = cx + r * Math.sin(rad(sa)), sy = cy - r * Math.cos(rad(sa))

  const onPD = useCallback((e) => {
    drag.current = { startY: e.clientY, startVal: value }
    const mm = (ev) => {
      if (!drag.current) return
      const delta = (drag.current.startY - ev.clientY) / 150 * (max - min)
      const next = Math.round((drag.current.startVal + delta) / step) * step
      onChange(Math.max(min, Math.min(max, next)))
    }
    const mu = () => { drag.current = null; window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', mu) }
    window.addEventListener('pointermove', mm)
    window.addEventListener('pointerup', mu)
    e.preventDefault()
  }, [value, min, max, step, onChange])

  return (
    <div className="flex flex-col items-center gap-1 select-none cursor-ns-resize" onPointerDown={onPD}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a2e" strokeWidth={4} />
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${kx} ${ky}`}
          fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" />
        <circle cx={kx} cy={ky} r={4} fill={color} />
        <text x={cx} y={cy + 5} textAnchor="middle" fill="#e0e0e0" fontSize={11} fontFamily="monospace" fontWeight="bold">
          {value > 0 ? '+' : ''}{value}{unit}
        </text>
      </svg>
      <span className="font-mono uppercase tracking-wider" style={{ fontSize: 9, color: '#556' }}>{label}</span>
    </div>
  )
}

function WaveCanvas({ analyser, label, color }) {
  const ref = useRef(null)
  const fr  = useRef(null)
  useEffect(() => {
    const draw = () => {
      const c = ref.current
      if (!c || !analyser) { fr.current = requestAnimationFrame(draw); return }
      const ctx = c.getContext('2d')
      const w = c.width, h = c.height
      const buf = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(buf)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#050510'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.shadowColor = color; ctx.shadowBlur = 4
      ctx.beginPath()
      const sliceW = w / buf.length
      for (let i = 0; i < buf.length; i++) {
        const x = i * sliceW
        const y = ((1 - (buf[i] + 1) / 2)) * h
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
      fr.current = requestAnimationFrame(draw)
    }
    fr.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(fr.current)
  }, [analyser, color])
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono uppercase" style={{ fontSize: 9, color: '#556' }}>{label}</span>
      <canvas ref={ref} width={200} height={60} style={{ borderRadius: 4, border: '1px solid #1a1a2e', display: 'block' }} />
    </div>
  )
}

// Transient shape visualizer — shows attack/sustain envelope curve
function EnvelopeViz({ attack, sustain }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#050510'
    ctx.fillRect(0, 0, w, h)

    const att = attack / 100   // -1 to 1
    const sus = sustain / 100  // -1 to 1

    // Attack peak (boosted or cut)
    const peakH    = h * 0.5 * (1 + att * 0.6)
    const sustainH = h * 0.3 * (1 + sus * 0.5)

    const grad = ctx.createLinearGradient(0, 0, w, 0)
    grad.addColorStop(0, '#ff9500')
    grad.addColorStop(0.3, '#ff2d55')
    grad.addColorStop(1,   '#b44fff')

    ctx.strokeStyle = grad
    ctx.lineWidth   = 2
    ctx.shadowColor = '#ff9500'; ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.moveTo(0, h)
    ctx.lineTo(w * 0.05, h - peakH)
    ctx.lineTo(w * 0.18, h - sustainH)
    ctx.lineTo(w * 0.6,  h - sustainH * 0.7)
    ctx.lineTo(w,        h)
    ctx.stroke()
    ctx.shadowBlur = 0

    // Zero line
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth   = 1
    ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5); ctx.stroke()
  }, [attack, sustain])
  return <canvas ref={ref} width={240} height={80} style={{ borderRadius: 6, border: '1px solid #1a1a2e' }} />
}

const PRESETS = [
  { name: 'Punch',    attack: 60,  sustain: -30, sensitivity: 0.6 },
  { name: 'Tight',    attack: 80,  sustain: -50, sensitivity: 0.8 },
  { name: 'Soft',     attack: -40, sustain: 20,  sensitivity: 0.4 },
  { name: 'Slapback', attack: 100, sustain: -60, sensitivity: 0.9 },
  { name: 'Sustain',  attack: -20, sustain: 60,  sensitivity: 0.5 },
  { name: 'Off',      attack: 0,   sustain: 0,   sensitivity: 0.5 },
]

export default function TransientShaperView() {
  const [ts, setTs]   = useState({ ...masteringState.transient })
  const [an, setAn]   = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    initMasteringChain()
    setAn(getLufsAnalyser())
    return onMasteringChange(() => setTs({ ...masteringState.transient }))
  }, [])

  const applyPreset = (p) => {
    setTransientParam('attack',      p.attack)
    setTransientParam('sustain',     p.sustain)
    setTransientParam('sensitivity', p.sensitivity)
    if (!masteringState.transient.enabled) setTransientEnabled(true)
    setMsg(`Loaded: ${p.name}`)
    setTimeout(() => setMsg(''), 2000)
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#080810' }}>

      {/* ── Left: controls ── */}
      <div className="flex flex-col gap-4 p-5 border-r border-studio-border shrink-0" style={{ width: 280 }}>
        <div className="flex items-center justify-between">
          <span className="font-display text-xs tracking-widest uppercase" style={{ background: 'linear-gradient(90deg,#ff9500,#ff2d55)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            Transient Shaper
          </span>
          <button onClick={() => setTransientEnabled(!ts.enabled)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono font-semibold transition-all"
            style={{ background: ts.enabled?'#ff950022':'#ffffff0a', border:`1px solid ${ts.enabled?'#ff9500':'#333'}`, color: ts.enabled?'#ff9500':'#556' }}>
            <span style={{ width:8,height:8,borderRadius:'50%',background:ts.enabled?'#ff9500':'#333',display:'inline-block',boxShadow:ts.enabled?'0 0 6px #ff9500':'none' }} />
            {ts.enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Big knobs */}
        <div className="flex justify-around">
          <Knob value={ts.attack} min={-100} max={100} label="Attack" color="#ff9500"
            onChange={v => setTransientParam('attack', v)} size={80} />
          <Knob value={ts.sustain} min={-100} max={100} label="Sustain" color="#b44fff"
            onChange={v => setTransientParam('sustain', v)} size={80} />
        </div>

        {/* Sensitivity */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between">
            <span className="font-mono text-xs text-studio-dim uppercase tracking-wider">Sensitivity</span>
            <span className="font-mono text-xs" style={{ color: '#00e5ff' }}>{Math.round(ts.sensitivity * 100)}%</span>
          </div>
          <input type="range" min={0} max={1} step={0.01} value={ts.sensitivity}
            onChange={e => setTransientParam('sensitivity', Number(e.target.value))} className="w-full" />
          <div className="flex justify-between font-mono" style={{ fontSize: 9, color: '#444' }}>
            <span>Soft</span><span>Medium</span><span>Hard</span>
          </div>
        </div>

        {/* Envelope preview */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Envelope Shape</div>
          <EnvelopeViz attack={ts.attack} sustain={ts.sustain} />
        </div>

        {/* Presets */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Presets</div>
          <div className="grid grid-cols-3 gap-1.5">
            {PRESETS.map(p => (
              <button key={p.name} onClick={() => applyPreset(p)}
                className="py-1.5 rounded text-xs font-mono font-semibold transition-all"
                style={{ background: '#ffffff0a', border: '1px solid #2a2a3e', color: '#aaa' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#ff9500'; e.currentTarget.style.color='#ff9500' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#2a2a3e'; e.currentTarget.style.color='#aaa' }}>
                {p.name}
              </button>
            ))}
          </div>
          {msg && <div className="mt-2 text-xs font-mono text-center" style={{ color: '#ff9500' }}>{msg}</div>}
        </div>
      </div>

      {/* ── Right: info + waveform ── */}
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">
        <div className="font-display text-xs tracking-widest uppercase text-studio-dim">Live Output</div>
        {an && <WaveCanvas analyser={an} label="Master Output (K-Weighted)" color="#ff9500" />}

        <div style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', borderRadius: 8, padding: 14 }}>
          <div className="font-display text-xs tracking-widest uppercase text-studio-dim mb-3">How It Works</div>
          {[
            ['Attack (+)',  'Boosts the initial transient hit — makes drums crack and snap harder. Great for punchy trap/hip-hop.'],
            ['Attack (−)',  'Softens the attack — tames harsh drum hits or makes sounds sit back in the mix.'],
            ['Sustain (+)', 'Extends the body/tail of sounds. Adds "room" feel and warmth to the mix.'],
            ['Sustain (−)', 'Cuts the decay — tightens bass-heavy mixes, removes muddiness, adds definition.'],
            ['Sensitivity', 'Controls what level of transient triggers the shaper. Higher = responds to quieter hits.'],
          ].map(([t,d]) => (
            <div key={t} className="flex gap-2 mb-1.5">
              <span className="font-mono font-bold shrink-0" style={{ fontSize: 10, color: '#ff9500', minWidth: 80 }}>{t}</span>
              <span className="font-mono" style={{ fontSize: 10, color: '#556', lineHeight: 1.5 }}>{d}</span>
            </div>
          ))}
        </div>

        <div style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', borderRadius: 8, padding: 14 }}>
          <div className="font-display text-xs tracking-widest uppercase text-studio-dim mb-2">Current Settings</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Attack',      val: `${ts.attack > 0 ? '+' : ''}${ts.attack}`,  color: '#ff9500' },
              { label: 'Sustain',     val: `${ts.sustain > 0 ? '+' : ''}${ts.sustain}`, color: '#b44fff' },
              { label: 'Sensitivity', val: `${Math.round(ts.sensitivity * 100)}%`,       color: '#00e5ff' },
            ].map(s => (
              <div key={s.label} style={{ background: '#050510', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                <div className="font-mono font-bold" style={{ fontSize: 16, color: s.color }}>{s.val}</div>
                <div className="font-mono" style={{ fontSize: 9, color: '#444' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
