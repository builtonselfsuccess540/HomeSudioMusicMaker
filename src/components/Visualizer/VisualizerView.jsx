import React, { useEffect, useRef, useState } from 'react'
import { getMasterAnalyser } from '../../audio/audioEngine'

const MODES = ['Bars', 'Waveform', 'Radial']
const THEMES = {
  Cyan:    ['#00e5ff', '#00ff9d'],
  Purple:  ['#b44fff', '#ff2d55'],
  Gold:    ['#ffe600', '#ff9500'],
  Rainbow: null,
}

function rainbowColor(i, total) {
  const hue = (i / total) * 360
  return `hsl(${hue},100%,55%)`
}

export default function VisualizerView() {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const [mode, setMode]   = useState('Bars')
  const [theme, setTheme] = useState('Cyan')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const analyser = getMasterAnalyser()
    const bufLen = analyser.frequencyBinCount

    function resize() {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    function getColor(i, total, y, h) {
      const colors = THEMES[theme]
      if (!colors) return rainbowColor(i, total)
      const grad = ctx.createLinearGradient(0, y + h, 0, y)
      grad.addColorStop(0, colors[0])
      grad.addColorStop(1, colors[1])
      return grad
    }

    function drawBars(data) {
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      const barCount = Math.min(128, bufLen)
      const barW = W / barCount - 1
      for (let i = 0; i < barCount; i++) {
        const v = data[i] / 255
        const bH = v * H * 0.9
        const x = i * (barW + 1)
        const y = H - bH
        ctx.fillStyle = getColor(i, barCount, y, bH)
        ctx.fillRect(x, y, barW, bH)
      }
    }

    function drawWaveform(data) {
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      const colors = THEMES[theme]
      ctx.strokeStyle = colors ? colors[0] : '#00e5ff'
      ctx.lineWidth = 2
      ctx.shadowBlur = 12
      ctx.shadowColor = colors ? colors[0] : '#00e5ff'
      ctx.beginPath()
      for (let i = 0; i < bufLen; i++) {
        const v = data[i] / 128 - 1
        const x = (i / bufLen) * W
        const y = (v * H * 0.4) + H / 2
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    function drawRadial(data) {
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      const cx = W / 2, cy = H / 2
      const radius = Math.min(W, H) * 0.25
      const count = Math.min(128, bufLen)
      for (let i = 0; i < count; i++) {
        const v = data[i] / 255
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2
        const len = v * radius * 1.2
        const x1 = cx + Math.cos(angle) * radius
        const y1 = cy + Math.sin(angle) * radius
        const x2 = cx + Math.cos(angle) * (radius + len)
        const y2 = cy + Math.sin(angle) * (radius + len)
        const colors = THEMES[theme]
        ctx.strokeStyle = colors ? colors[0] : rainbowColor(i, count)
        ctx.lineWidth = 2
        ctx.shadowBlur = 8
        ctx.shadowColor = ctx.strokeStyle
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
      ctx.shadowBlur = 0
    }

    let currentMode = mode
    let currentTheme = theme

    function loop() {
      const freqData  = new Uint8Array(bufLen)
      const timeData  = new Uint8Array(bufLen)
      analyser.getByteFrequencyData(freqData)
      analyser.getByteTimeDomainData(timeData)

      if (currentMode === 'Bars')     drawBars(freqData)
      if (currentMode === 'Waveform') drawWaveform(timeData)
      if (currentMode === 'Radial')   drawRadial(freqData)

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, theme])

  return (
    <div className="flex flex-col h-full" style={{ background: '#080810' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-studio-border shrink-0">
        <span className="font-display text-xs tracking-widest uppercase" style={{ color: '#00e5ff' }}>
          Visualizer
        </span>
        <div className="flex gap-1">
          {MODES.map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-3 py-1 rounded text-xs font-ui font-semibold transition-all"
              style={{
                background: mode === m ? '#00e5ff22' : 'transparent',
                color: mode === m ? '#00e5ff' : '#8899aa',
                border: `1px solid ${mode === m ? '#00e5ff' : 'transparent'}`,
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-studio-border" />
        <span className="text-xs text-studio-dim">Theme:</span>
        <div className="flex gap-1">
          {Object.keys(THEMES).map(t => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className="px-3 py-1 rounded text-xs font-ui font-semibold transition-all"
              style={{
                background: theme === t ? '#ffffff15' : 'transparent',
                color: theme === t ? '#ffffff' : '#8899aa',
                border: `1px solid ${theme === t ? '#ffffff40' : 'transparent'}`,
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-xs text-studio-muted">Play audio to see the visualizer animate</span>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', background: '#080810' }}
        />
        {/* Overlay label */}
        <div className="absolute top-4 left-4 pointer-events-none">
          <span
            className="font-mono text-xs tracking-widest"
            style={{ color: '#ffffff20' }}
          >
            {mode.toUpperCase()} · {theme.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  )
}
