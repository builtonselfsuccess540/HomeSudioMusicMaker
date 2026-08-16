import React, { useState, useRef, useEffect, useCallback } from 'react'
import { getCtx } from '../../audio/audioEngine'

const PAD_COLORS = [
  '#00e5ff','#00ff9d','#ffe600','#ff9500',
  '#ff2d55','#b44fff','#ff6b35','#78e4ff',
  '#a8ff78','#ffdc78','#ff8cba','#c4a4ff',
  '#78b4ff','#ff78a0','#78ffdc','#deff78',
]

function detectTransients(buffer, sensitivity) {
  const data  = buffer.getChannelData(0)
  const sr    = buffer.sampleRate
  const hop   = Math.floor(sr * 0.005)
  const win   = Math.floor(sr * 0.02)
  const minDist = Math.floor(sr * (0.08 + (1 - sensitivity) * 0.12))

  const slices = [0]
  let prevEnergy = 0
  let lastPeak = 0

  for (let i = win; i < data.length - win; i += hop) {
    let energy = 0
    for (let j = i; j < i + win && j < data.length; j++) energy += data[j] * data[j]
    energy /= win
    const flux = Math.max(0, energy - prevEnergy)
    if (flux > sensitivity * 0.005 && i - lastPeak >= minDist) {
      slices.push(i / data.length)
      lastPeak = i
    }
    prevEnergy = energy * 0.6 + prevEnergy * 0.4
  }
  return slices.slice(0, 16)
}

function WaveformSlicer({ buffer, slices, onSlicesChange, activeSlice }) {
  const ref = useRef(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const W = cv.width, H = cv.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#050510'
    ctx.fillRect(0, 0, W, H)

    if (!buffer) {
      ctx.fillStyle = '#1a1a2e'; ctx.fillRect(20, H/2-1, W-40, 2)
      ctx.fillStyle = '#334'; ctx.font = '12px monospace'; ctx.textAlign = 'center'
      ctx.fillText('Drop an audio file or click to load', W/2, H/2+20)
      return
    }

    const data = buffer.getChannelData(0)
    const step = data.length / W
    ctx.strokeStyle = '#00e5ff44'; ctx.lineWidth = 1; ctx.beginPath()
    for (let i = 0; i < W; i++) {
      const s = Math.floor(i * step)
      const y = (1 - (data[s] + 1) / 2) * H
      i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
    }
    ctx.stroke()

    // Color bands between slices
    const allBounds = [...slices, 1]
    for (let s = 0; s < slices.length; s++) {
      const x1 = slices[s] * W
      const x2 = allBounds[s + 1] * W
      const col = PAD_COLORS[s % PAD_COLORS.length]
      ctx.fillStyle = activeSlice === s ? col + '22' : col + '0a'
      ctx.fillRect(x1, 0, x2 - x1, H)
    }

    // Slice markers
    slices.forEach((pos, i) => {
      const x = pos * W
      const col = PAD_COLORS[i % PAD_COLORS.length]
      ctx.strokeStyle = col; ctx.lineWidth = i === 0 ? 1 : 1.5
      ctx.shadowColor = col; ctx.shadowBlur = 4
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      ctx.shadowBlur = 0
      ctx.fillStyle = col
      ctx.font = 'bold 9px monospace'
      ctx.fillText(i + 1, x + 2, 10)
    })
  }, [buffer, slices, activeSlice])

  const handleClick = (e) => {
    if (!buffer) return
    const rect = ref.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    if (slices.some(s => Math.abs(s - x) < 0.015)) {
      onSlicesChange(slices.filter(s => Math.abs(s - x) >= 0.015))
    } else {
      onSlicesChange([...slices, x].sort((a, b) => a - b).slice(0, 16))
    }
  }

  return (
    <canvas ref={ref} width={700} height={110}
      onClick={handleClick}
      style={{ borderRadius: 6, border: '1px solid #1a1a2e', display:'block', width:'100%', cursor:'crosshair' }} />
  )
}

function playSlice(buffer, start, end, col) {
  const ctx = getCtx()
  const dur = (end - start) * buffer.duration
  if (dur <= 0) return
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const env = ctx.createGain()
  src.connect(env); env.connect(ctx.destination)
  env.gain.setValueAtTime(0, ctx.currentTime)
  env.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.005)
  env.gain.setValueAtTime(0.9, ctx.currentTime + Math.max(0.01, dur - 0.01))
  env.gain.linearRampToValueAtTime(0, ctx.currentTime + dur)
  src.start(ctx.currentTime, start * buffer.duration, dur + 0.01)
  src.stop(ctx.currentTime + dur + 0.01)
}

export default function SampleSlicerView() {
  const [buffer,      setBuffer]      = useState(null)
  const [fileName,    setFileName]    = useState('')
  const [slices,      setSlices]      = useState([0])
  const [sensitivity, setSensitivity] = useState(0.5)
  const [activeSlice, setActiveSlice] = useState(null)
  const [padOrder,    setPadOrder]    = useState([])
  const [msg,         setMsg]         = useState('')
  const fileRef = useRef(null)

  const loadFile = async (file) => {
    if (!file) return
    const ctx = getCtx()
    const ab = await file.arrayBuffer()
    const decoded = await ctx.decodeAudioData(ab)
    setBuffer(decoded)
    setFileName(file.name)
    setSlices([0])
    setPadOrder([])
    setActiveSlice(null)
  }

  const autoDetect = useCallback(() => {
    if (!buffer) return
    const detected = detectTransients(buffer, sensitivity)
    setSlices(detected)
    setPadOrder(detected.map((_, i) => i))
    setMsg(`Detected ${detected.length} slices`)
    setTimeout(() => setMsg(''), 2000)
  }, [buffer, sensitivity])

  const triggerPad = (sliceIdx) => {
    if (!buffer) return
    const allBounds = [...slices, 1]
    const start = slices[sliceIdx]
    const end   = allBounds[sliceIdx + 1]
    setActiveSlice(sliceIdx)
    playSlice(buffer, start, end, PAD_COLORS[sliceIdx % PAD_COLORS.length])
    setTimeout(() => setActiveSlice(null), Math.min(800, (end - start) * buffer.duration * 1000))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('audio/')) loadFile(file)
  }

  const pads = slices.map((_, i) => i)

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 gap-5" style={{ background: '#080810' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-display text-xs tracking-widest uppercase"
          style={{ background:'linear-gradient(90deg,#ff2d55,#ff9500)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Sample Slicer
        </span>
        <div className="flex items-center gap-2">
          {msg && <span className="font-mono text-xs" style={{ color:'#00ff9d' }}>{msg}</span>}
          <button
            onClick={() => fileRef.current?.click()}
            className="px-3 py-1 rounded text-xs font-mono font-semibold"
            style={{ background:'#ffffff0a', border:'1px solid #333', color:'#888' }}>
            Load File
          </button>
          <input ref={fileRef} type="file" accept="audio/*" style={{ display:'none' }} onChange={e => loadFile(e.target.files[0])} />
        </div>
      </div>

      {/* Waveform */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xs text-studio-dim">{fileName || 'Drop audio file here'}</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-studio-dim">Sensitivity</span>
              <input type="range" min={0.1} max={1} step={0.05} value={sensitivity}
                onChange={e => setSensitivity(Number(e.target.value))} className="w-24" />
              <span className="font-mono text-xs" style={{ color:'#ff9500' }}>{Math.round(sensitivity*100)}%</span>
            </div>
            <button onClick={autoDetect} disabled={!buffer}
              className="px-3 py-1 rounded text-xs font-mono font-semibold transition-all disabled:opacity-30"
              style={{ background:'#ff950022', border:'1px solid #ff9500', color:'#ff9500' }}>
              Auto-Detect
            </button>
          </div>
        </div>
        <WaveformSlicer buffer={buffer} slices={slices} onSlicesChange={setSlices} activeSlice={activeSlice} />
        <p className="font-mono mt-1" style={{ fontSize:9, color:'#334' }}>
          Click on waveform to add/remove slice markers · {slices.length} slices
        </p>
      </div>

      {/* MPC Pads */}
      <div>
        <div className="font-mono text-xs text-studio-dim mb-3 uppercase tracking-wider">Pads — Click to Trigger</div>
        <div className="grid grid-cols-8 gap-2">
          {Array.from({ length: 16 }, (_, i) => {
            const hasSlice = i < pads.length
            const col = PAD_COLORS[i % PAD_COLORS.length]
            const isActive = activeSlice === i
            return (
              <button
                key={i}
                onClick={() => hasSlice && triggerPad(i)}
                disabled={!hasSlice || !buffer}
                className="aspect-square rounded-xl flex flex-col items-center justify-center transition-all select-none"
                style={{
                  background: isActive ? col + '55' : hasSlice ? col + '18' : '#0d0d1e',
                  border: `2px solid ${isActive ? col : hasSlice ? col + '44' : '#1a1a2e'}`,
                  boxShadow: isActive ? `0 0 20px ${col}66` : 'none',
                  cursor: hasSlice && buffer ? 'pointer' : 'not-allowed',
                  transform: isActive ? 'scale(0.93)' : 'scale(1)',
                }}>
                {hasSlice ? (
                  <>
                    <span className="font-mono font-bold" style={{ fontSize:18, color: isActive ? '#fff' : col }}>{i+1}</span>
                    {buffer && <span className="font-mono" style={{ fontSize:8, color: col + '88' }}>
                      {Math.round((([...slices,1][i+1] || 1) - slices[i]) * buffer.duration * 10) / 10}s
                    </span>}
                  </>
                ) : (
                  <span className="font-mono" style={{ fontSize:10, color:'#223' }}>—</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Info */}
      <div style={{ background:'#0a0a1a', border:'1px solid #1a1a2e', borderRadius:8, padding:14 }}>
        <div className="font-display text-xs tracking-widest uppercase text-studio-dim mb-2">How to Use</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {[
            ['Load a loop', 'Drag & drop any audio file onto the waveform, or use Load File.'],
            ['Auto-Detect', 'Click Auto-Detect to find beat transients automatically. Adjust sensitivity if it finds too many or too few slices.'],
            ['Manual slices', 'Click anywhere on the waveform to add a slice marker. Click an existing marker to remove it.'],
            ['Play pads', 'Each numbered pad triggers that slice. Great for rearranging drum loops or creating chops.'],
          ].map(([t,d]) => (
            <div key={t} className="flex gap-2">
              <span className="font-mono font-bold shrink-0" style={{ fontSize:10, color:'#ff9500', minWidth:90 }}>{t}</span>
              <span className="font-mono" style={{ fontSize:10, color:'#445', lineHeight:1.5 }}>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
