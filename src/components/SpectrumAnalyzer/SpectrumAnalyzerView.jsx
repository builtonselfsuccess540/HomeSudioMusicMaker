import React, { useRef, useEffect, useState, useCallback } from 'react'
import { getSpectrumAnalyser } from '../../audio/audioEngine'

const FLOOR_DB  = -90
const CEIL_DB   = 0
const PEAK_HOLD = 120  // frames before peak falls

const MODES  = ['Bars', 'Line', 'Mirror']
const THEMES = [
  { name: 'Cyan',     lo: '#001a2e', hi: '#00e5ff', peak: '#ffffff' },
  { name: 'Neon',     lo: '#0a0a1a', hi: '#b44fff', peak: '#ff2d55' },
  { name: 'Gold',     lo: '#1a1000', hi: '#ffe600', peak: '#ff9500' },
  { name: 'Rainbow',  lo: null,      hi: null,      peak: '#ffffff' },
]

function freqToX(freq, w, nyquist) {
  return Math.log10(freq / 20) / Math.log10(nyquist / 20) * w
}

const LABEL_FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

function labelHz(f) {
  return f >= 1000 ? `${f / 1000}k` : `${f}`
}

function rainbowColor(ratio) {
  const hue = (1 - ratio) * 240
  return `hsl(${hue},100%,55%)`
}

export default function SpectrumAnalyzerView() {
  const canvasRef  = useRef(null)
  const frameRef   = useRef(null)
  const peaksRef   = useRef([])
  const peakHoldRef= useRef([])
  const analyserRef= useRef(null)

  const [mode,      setMode]      = useState('Bars')
  const [themeIdx,  setThemeIdx]  = useState(0)
  const [smoothing, setSmoothing] = useState(0.75)
  const [floorDb,   setFloorDb]   = useState(-80)
  const [peakHoldOn,setPeakHoldOn]= useState(true)
  const [avgDb,     setAvgDb]     = useState(null)
  const [peakDb,    setPeakDb]    = useState(null)

  // update analyser smoothing when user changes it
  useEffect(() => {
    const an = getSpectrumAnalyser()
    analyserRef.current = an
    an.smoothingTimeConstant = smoothing
  }, [smoothing])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const an = analyserRef.current || getSpectrumAnalyser()
    analyserRef.current = an

    const ctx  = canvas.getContext('2d')
    const W    = canvas.width
    const H    = canvas.height - 24   // reserve bottom for freq labels
    const bins = an.frequencyBinCount
    const data = new Float32Array(bins)
    an.getFloatFrequencyData(data)

    const nyquist = (getSpectrumAnalyser().context || an.context).sampleRate / 2
    const theme   = THEMES[themeIdx]
    const dbRange = CEIL_DB - floorDb

    ctx.clearRect(0, 0, W, canvas.height)

    // Background
    ctx.fillStyle = '#050510'
    ctx.fillRect(0, 0, W, canvas.height)

    // Grid lines (dB)
    for (let db = floorDb; db <= 0; db += 10) {
      const y = H - ((db - floorDb) / dbRange) * H
      ctx.strokeStyle = db === 0 ? '#333' : '#1a1a2e'
      ctx.lineWidth   = db === 0 ? 1.5 : 0.5
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      ctx.fillStyle = '#333'
      ctx.font = '9px monospace'
      ctx.fillText(`${db}`, 2, y - 2)
    }

    // Frequency grid lines
    LABEL_FREQS.forEach(f => {
      if (f < 20 || f > nyquist) return
      const x = freqToX(f, W, nyquist)
      ctx.strokeStyle = '#1a1a2e'
      ctx.lineWidth   = 0.5
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    })

    // Init peaks arrays
    if (peaksRef.current.length !== bins) {
      peaksRef.current   = new Float32Array(bins).fill(floorDb)
      peakHoldRef.current= new Array(bins).fill(0)
    }

    // Draw spectrum
    if (mode === 'Bars') {
      const barW = Math.max(1, W / 320)
      for (let i = 1; i < bins; i++) {
        const freq = (i / bins) * nyquist
        if (freq < 20) continue
        const x   = freqToX(freq, W, nyquist)
        const db  = Math.max(floorDb, data[i])
        const ratio = (db - floorDb) / dbRange
        const barH  = ratio * H

        const color = theme.lo === null ? rainbowColor(ratio) : theme.hi
        ctx.fillStyle = color
        ctx.globalAlpha = 0.85
        ctx.fillRect(x, H - barH, barW, barH)
        ctx.globalAlpha = 1
      }
    } else if (mode === 'Line' || mode === 'Mirror') {
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      if (theme.lo === null) {
        grad.addColorStop(0, '#ff2d55'); grad.addColorStop(0.4, '#ffe600')
        grad.addColorStop(0.7, '#00e5ff'); grad.addColorStop(1, '#b44fff')
      } else {
        grad.addColorStop(0, theme.hi); grad.addColorStop(1, theme.lo)
      }

      ctx.beginPath()
      let first = true
      for (let i = 1; i < bins; i++) {
        const freq = (i / bins) * nyquist
        if (freq < 20) continue
        const x   = freqToX(freq, W, nyquist)
        const db  = Math.max(floorDb, data[i])
        const y   = H - ((db - floorDb) / dbRange) * H
        first ? (ctx.moveTo(x, y), first = false) : ctx.lineTo(x, y)
      }
      ctx.strokeStyle = grad
      ctx.lineWidth   = 2
      ctx.shadowColor = theme.hi || '#00e5ff'
      ctx.shadowBlur  = 6
      ctx.stroke()
      ctx.shadowBlur  = 0

      if (mode === 'Mirror') {
        ctx.beginPath(); first = true
        for (let i = 1; i < bins; i++) {
          const freq = (i / bins) * nyquist
          if (freq < 20) continue
          const x   = freqToX(freq, W, nyquist)
          const db  = Math.max(floorDb, data[i])
          const barH= ((db - floorDb) / dbRange) * H
          const y   = H + barH * 0.5
          first ? (ctx.moveTo(x, y), first = false) : ctx.lineTo(x, y)
        }
        ctx.strokeStyle = grad; ctx.lineWidth = 1; ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1
      }
    }

    // Peak hold
    if (peakHoldOn) {
      for (let i = 1; i < bins; i++) {
        const freq = (i / bins) * nyquist
        if (freq < 20) continue
        const x = freqToX(freq, W, nyquist)
        if (data[i] > peaksRef.current[i]) {
          peaksRef.current[i]    = data[i]
          peakHoldRef.current[i] = PEAK_HOLD
        } else if (peakHoldRef.current[i] > 0) {
          peakHoldRef.current[i]--
        } else {
          peaksRef.current[i] = Math.max(floorDb, peaksRef.current[i] - 0.3)
        }
        const py = H - ((Math.max(floorDb, peaksRef.current[i]) - floorDb) / dbRange) * H
        ctx.fillStyle = theme.peak
        ctx.globalAlpha = 0.7
        ctx.fillRect(x, py - 1, Math.max(1, W / 320), 1.5)
        ctx.globalAlpha = 1
      }
    }

    // Freq labels
    LABEL_FREQS.forEach(f => {
      if (f < 20 || f > nyquist) return
      const x = freqToX(f, W, nyquist)
      ctx.fillStyle = '#556'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(labelHz(f), x, H + 16)
      ctx.textAlign = 'left'
    })

    // Live avg / peak readout
    let sum = 0, pMax = -Infinity, cnt = 0
    for (let i = 1; i < bins; i++) {
      if (data[i] > FLOOR_DB) { sum += data[i]; cnt++; if (data[i] > pMax) pMax = data[i] }
    }
    if (cnt > 0) {
      setAvgDb(Math.round(sum / cnt))
      setPeakDb(Math.round(pMax))
    }

    frameRef.current = requestAnimationFrame(draw)
  }, [mode, themeIdx, floorDb, peakHoldOn])

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (canvasRef.current) ro.observe(canvasRef.current)
    frameRef.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(frameRef.current); ro.disconnect() }
  }, [draw])

  const theme = THEMES[themeIdx]

  return (
    <div className="flex flex-col h-full" style={{ background: '#050510' }}>
      {/* Header controls */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-studio-border shrink-0 flex-wrap">
        <span className="font-display text-xs tracking-widest uppercase" style={{ background: 'linear-gradient(90deg,#00e5ff,#b44fff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Spectrum Analyzer
        </span>

        <div className="w-px h-4 bg-studio-border" />

        {/* Mode */}
        <div className="flex gap-1">
          {MODES.map(m => (
            <button key={m} onClick={() => setMode(m)}
              className="px-2 py-0.5 rounded text-xs font-mono font-semibold transition-all"
              style={{ background: mode===m ? '#00e5ff22':'#ffffff0a', border:`1px solid ${mode===m?'#00e5ff':'#333'}`, color: mode===m?'#00e5ff':'#556' }}>
              {m}
            </button>
          ))}
        </div>

        {/* Theme */}
        <div className="flex gap-1">
          {THEMES.map((t,i) => (
            <button key={t.name} onClick={() => setThemeIdx(i)}
              className="px-2 py-0.5 rounded text-xs font-mono font-semibold transition-all"
              style={{ background: themeIdx===i ? '#ffffff15':'#ffffff0a', border:`1px solid ${themeIdx===i?'#666':'#333'}`, color: themeIdx===i?'#ddd':'#556' }}>
              {t.name}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-studio-border" />

        {/* Smoothing */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-studio-dim">SMOOTH</span>
          <input type="range" min="0" max="0.95" step="0.05" value={smoothing}
            onChange={e => setSmoothing(Number(e.target.value))} className="w-20" />
          <span className="text-xs font-mono text-studio-dim w-7">{Math.round(smoothing*100)}%</span>
        </div>

        {/* Floor */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-studio-dim">FLOOR</span>
          <select value={floorDb} onChange={e => setFloorDb(Number(e.target.value))}
            className="bg-studio-void border border-studio-border rounded px-1 py-0.5 text-xs font-mono text-studio-text focus:outline-none">
            {[-40,-50,-60,-70,-80,-90].map(v => <option key={v} value={v}>{v} dB</option>)}
          </select>
        </div>

        {/* Peak hold */}
        <button onClick={() => setPeakHoldOn(v => !v)}
          className="px-2 py-0.5 rounded text-xs font-mono font-semibold transition-all"
          style={{ background: peakHoldOn?'#ffe60022':'#ffffff0a', border:`1px solid ${peakHoldOn?'#ffe600':'#333'}`, color: peakHoldOn?'#ffe600':'#556' }}>
          PEAK HOLD
        </button>

        <div className="flex-1" />

        {/* Live readout */}
        <div className="flex gap-3 font-mono text-xs">
          <span style={{ color: '#00e5ff' }}>AVG <span style={{ color: '#ddd' }}>{avgDb ?? '—'} dB</span></span>
          <span style={{ color: '#ff2d55' }}>PEAK <span style={{ color: '#ddd' }}>{peakDb ?? '—'} dB</span></span>
        </div>
      </div>

      {/* Canvas */}
      <canvas ref={canvasRef} className="flex-1 w-full" style={{ display:'block' }} />
    </div>
  )
}
