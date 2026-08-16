import React, { useRef, useState, useEffect, useCallback } from 'react'
import { getCtx } from '../../audio/audioEngine'

// ─── Constants ────────────────────────────────────────────────────

const COLORS = {
  waveform:   '#00e5ff',
  waveformBg: 'rgba(0,229,255,0.08)',
  cursor:     '#ffe600',
  loopA:      'rgba(0,255,157,0.3)',
  loopB:      'rgba(0,255,157,0.7)',
  grid:       'rgba(255,255,255,0.05)',
  label:      'rgba(255,255,255,0.4)',
}

// ─── Waveform painter ─────────────────────────────────────────────

function drawWaveform(canvas, audioBuffer, zoom = 1, scrollX = 0, loopRegion = null, playPos = null) {
  if (!canvas || !audioBuffer) return
  const ctx   = canvas.getContext('2d')
  const W     = canvas.width
  const H     = canvas.height
  const sr    = audioBuffer.sampleRate
  const total = audioBuffer.length
  const data  = audioBuffer.getChannelData(0)

  ctx.clearRect(0, 0, W, H)

  // Background
  ctx.fillStyle = '#080810'
  ctx.fillRect(0, 0, W, H)

  // Grid lines
  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 1
  for (let i = 0; i <= 10; i++) {
    const y = (H / 10) * i
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  // Time markers
  const duration = total / sr
  const pixelsPerSec = (W * zoom) / duration
  const secStep = Math.max(0.1, Math.pow(10, Math.floor(Math.log10(W / pixelsPerSec / 8))))
  ctx.fillStyle = COLORS.label
  ctx.font = '9px monospace'
  for (let t = 0; t <= duration; t += secStep) {
    const x = t * pixelsPerSec - scrollX
    if (x < 0 || x > W) continue
    ctx.fillRect(x, 0, 1, 6)
    ctx.fillText(`${t.toFixed(1)}s`, x + 2, 14)
  }

  // Loop region highlight
  if (loopRegion) {
    const { a, b } = loopRegion
    const la = (a / total) * W * zoom - scrollX
    const lb = (b / total) * W * zoom - scrollX
    ctx.fillStyle = COLORS.loopA
    ctx.fillRect(Math.min(la, lb), 16, Math.abs(lb - la), H - 16)
    ctx.strokeStyle = COLORS.loopB
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(Math.min(la, lb), 16); ctx.lineTo(Math.min(la, lb), H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(Math.max(la, lb), 16); ctx.lineTo(Math.max(la, lb), H); ctx.stroke()
  }

  // Waveform — downsampled for performance
  const viewStart = Math.floor((scrollX / (W * zoom)) * total)
  const viewEnd   = Math.min(total, Math.floor(((scrollX + W) / (W * zoom)) * total))
  const samplesPerPx = Math.max(1, Math.floor((viewEnd - viewStart) / W))

  ctx.fillStyle = COLORS.waveformBg
  ctx.fillRect(0, H / 2 - 2, W, 4)

  ctx.strokeStyle = COLORS.waveform
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let px = 0; px < W; px++) {
    let min = 1, max = -1
    const startSample = viewStart + px * samplesPerPx
    const endSample   = Math.min(total - 1, startSample + samplesPerPx)
    for (let s = startSample; s <= endSample; s++) {
      const v = data[s] || 0
      if (v < min) min = v
      if (v > max) max = v
    }
    const yMin = ((1 - max) / 2) * (H - 16) + 16
    const yMax = ((1 - min) / 2) * (H - 16) + 16
    if (px === 0) ctx.moveTo(px, (yMin + yMax) / 2)
    else {
      ctx.lineTo(px, yMin)
      ctx.lineTo(px, yMax)
    }
  }
  ctx.stroke()

  // Playback cursor
  if (playPos !== null) {
    const cx = (playPos / total) * W * zoom - scrollX
    if (cx >= 0 && cx <= W) {
      ctx.strokeStyle = COLORS.cursor
      ctx.lineWidth = 2
      ctx.shadowBlur = 8
      ctx.shadowColor = COLORS.cursor
      ctx.beginPath(); ctx.moveTo(cx, 16); ctx.lineTo(cx, H); ctx.stroke()
      ctx.shadowBlur = 0
    }
  }
}

// ─── Component ────────────────────────────────────────────────────

export default function WaveformView() {
  const canvasRef    = useRef(null)
  const sourceRef    = useRef(null)
  const startTimeRef = useRef(0)
  const startSampleRef = useRef(0)
  const rafRef       = useRef(null)
  const dragStartRef = useRef(null)

  const [audioBuffer, setAudioBuffer] = useState(null)
  const [fileName, setFileName]       = useState('')
  const [playing, setPlaying]         = useState(false)
  const [playPos, setPlayPos]         = useState(null)
  const [zoom, setZoom]               = useState(1)
  const [scrollX, setScrollX]         = useState(0)
  const [loopRegion, setLoopRegion]   = useState(null)
  const [looping, setLooping]         = useState(false)
  const [dragging, setDragging]       = useState(false)
  const [waveReady, setWaveReady]     = useState(false)

  // ── Load file ──────────────────────────────────────────────────
  async function loadFile(file) {
    if (!file) return
    const ctx = getCtx()
    const ab = await file.arrayBuffer()
    const buf = await ctx.decodeAudioData(ab)
    setAudioBuffer(buf)
    setFileName(file.name)
    setZoom(1); setScrollX(0); setPlayPos(null); setLoopRegion(null)
    setWaveReady(true)
    stopAudio()
  }

  function onFileInput(e) { if (e.target.files[0]) loadFile(e.target.files[0]) }

  function onDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('audio/')) loadFile(file)
  }

  // ── Playback ───────────────────────────────────────────────────
  function startAudio(fromSample = 0) {
    if (!audioBuffer) return
    const c = getCtx()
    if (sourceRef.current) { try { sourceRef.current.stop() } catch {} }
    const src = c.createBufferSource()
    src.buffer = audioBuffer

    if (looping && loopRegion) {
      src.loopStart  = loopRegion.a / audioBuffer.sampleRate
      src.loopEnd    = loopRegion.b / audioBuffer.sampleRate
      src.loop       = true
    }

    src.connect(c.destination)
    const offset = fromSample / audioBuffer.sampleRate
    src.start(0, offset)
    src.onended = () => { if (!looping) { setPlaying(false); setPlayPos(null); cancelAnimationFrame(rafRef.current) } }
    sourceRef.current = src
    startTimeRef.current = c.currentTime - offset
    startSampleRef.current = fromSample
    setPlaying(true)

    function tick() {
      const elapsed = getCtx().currentTime - startTimeRef.current
      const pos = Math.min(audioBuffer.length - 1, Math.floor(elapsed * audioBuffer.sampleRate))
      setPlayPos(pos)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function stopAudio() {
    if (sourceRef.current) { try { sourceRef.current.stop() } catch {} sourceRef.current = null }
    cancelAnimationFrame(rafRef.current)
    setPlaying(false)
    setPlayPos(null)
  }

  function togglePlay() {
    if (playing) stopAudio()
    else startAudio(0)
  }

  // ── Redraw ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !audioBuffer) return
    canvas.width  = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    drawWaveform(canvas, audioBuffer, zoom, scrollX, loopRegion, playPos)
  }, [audioBuffer, zoom, scrollX, loopRegion, playPos])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      if (audioBuffer) drawWaveform(canvas, audioBuffer, zoom, scrollX, loopRegion, playPos)
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBuffer, zoom, scrollX, loopRegion, playPos])

  // ── Canvas mouse — loop region selection ───────────────────────
  function canvasMouseDown(e) {
    if (!audioBuffer) return
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const px     = e.clientX - rect.left
    const sample = Math.floor(((px + scrollX) / (canvas.width * zoom)) * audioBuffer.length)
    dragStartRef.current = sample
    setDragging(true)
    setLoopRegion({ a: sample, b: sample })
  }

  function canvasMouseMove(e) {
    if (!dragging || !audioBuffer) return
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const px     = e.clientX - rect.left
    const sample = Math.max(0, Math.min(audioBuffer.length, Math.floor(((px + scrollX) / (canvas.width * zoom)) * audioBuffer.length)))
    const a = Math.min(dragStartRef.current, sample)
    const b = Math.max(dragStartRef.current, sample)
    setLoopRegion({ a, b })
  }

  function canvasMouseUp() { setDragging(false) }

  function canvasClick(e) {
    if (!audioBuffer || dragging) return
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const px     = e.clientX - rect.left
    const sample = Math.floor(((px + scrollX) / (canvas.width * zoom)) * audioBuffer.length)
    if (playing) stopAudio()
    startAudio(sample)
  }

  // ── Zoom + scroll ───────────────────────────────────────────────
  function onWheel(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setZoom(z => Math.max(1, Math.min(50, z * (e.deltaY > 0 ? 0.9 : 1.1))))
    } else {
      setScrollX(s => Math.max(0, s + e.deltaX))
    }
  }

  // ── Download ────────────────────────────────────────────────────
  function downloadCurrent() {
    if (!audioBuffer) return
    const sr  = audioBuffer.sampleRate
    const nc  = audioBuffer.numberOfChannels
    const len = audioBuffer.length
    const pcm = new Int16Array(len * nc)
    for (let i = 0; i < len; i++)
      for (let ch = 0; ch < nc; ch++) {
        const s = audioBuffer.getChannelData(ch)[i]
        pcm[i * nc + ch] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)))
      }
    const dLen = pcm.byteLength
    const buf  = new ArrayBuffer(44 + dLen)
    const v    = new DataView(buf)
    const ws   = (off, str) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)) }
    ws(0,'RIFF'); v.setUint32(4, 36 + dLen, true)
    ws(8,'WAVE'); ws(12,'fmt ')
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,nc,true)
    v.setUint32(24,sr,true); v.setUint32(28,sr*nc*2,true)
    v.setUint16(32,nc*2,true); v.setUint16(34,16,true)
    ws(36,'data'); v.setUint32(40,dLen,true)
    new Int16Array(buf,44).set(pcm)
    const blob = new Blob([buf], { type: 'audio/wav' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName.replace(/\.[^.]+$/, '') + '_edited.wav'
    a.click()
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#080810' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-studio-border shrink-0 flex-wrap">
        <span className="font-display text-xs tracking-widest uppercase" style={{ color: '#00e5ff' }}>
          Waveform
        </span>

        <label className="cursor-pointer px-3 py-1 rounded text-xs font-semibold transition-all"
          style={{ background: '#00e5ff22', color: '#00e5ff', border: '1px solid #00e5ff44' }}>
          Load File
          <input type="file" accept="audio/*" className="hidden" onChange={onFileInput} />
        </label>

        {audioBuffer && (
          <>
            <button onClick={togglePlay}
              className="px-4 py-1 rounded text-xs font-bold transition-all"
              style={{
                background: playing ? '#ffe60022' : '#00ff9d22',
                color:      playing ? '#ffe600'   : '#00ff9d',
                border:     `1px solid ${playing ? '#ffe60044' : '#00ff9d44'}`,
              }}>
              {playing ? '■ Stop' : '▶ Play'}
            </button>

            <button onClick={() => setLooping(l => !l)}
              className="px-3 py-1 rounded text-xs font-semibold transition-all"
              style={{
                background: looping ? '#b44fff22' : 'transparent',
                color:      looping ? '#b44fff'   : '#8899aa',
                border:     `1px solid ${looping ? '#b44fff44' : 'transparent'}`,
              }}>
              ⟳ Loop {loopRegion ? 'Region' : 'File'}
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs text-studio-muted">Zoom</span>
              <button onClick={() => setZoom(z => Math.max(1, z / 1.5))} className="text-xs px-2 py-0.5 rounded" style={{ background: '#ffffff11', color: '#aaa' }}>−</button>
              <span className="text-xs font-mono" style={{ color: '#00e5ff' }}>{zoom.toFixed(1)}×</span>
              <button onClick={() => setZoom(z => Math.min(50, z * 1.5))} className="text-xs px-2 py-0.5 rounded" style={{ background: '#ffffff11', color: '#aaa' }}>+</button>
              <button onClick={() => { setZoom(1); setScrollX(0) }} className="text-xs px-2 py-0.5 rounded" style={{ background: '#ffffff11', color: '#aaa' }}>Reset</button>
            </div>

            {loopRegion && (
              <button onClick={() => setLoopRegion(null)}
                className="px-2 py-1 rounded text-xs transition-all"
                style={{ color: '#ff2d55' }}>
                Clear Loop
              </button>
            )}

            <button onClick={downloadCurrent}
              className="ml-auto px-3 py-1 rounded text-xs font-semibold transition-all"
              style={{ background: '#00ff9d22', color: '#00ff9d', border: '1px solid #00ff9d44' }}>
              ↓ Download WAV
            </button>
          </>
        )}

        {fileName && <span className="text-xs text-studio-muted truncate max-w-xs">{fileName}</span>}
      </div>

      {/* Canvas area */}
      <div
        className="flex-1 relative overflow-hidden"
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onWheel={onWheel}
      >
        {!audioBuffer ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="text-5xl" style={{ opacity: 0.3 }}>〜</div>
            <div className="text-sm text-studio-dim">Drop an audio file here or click Load File</div>
            <div className="text-xs text-studio-muted">Supports WAV, MP3, OGG, FLAC and more</div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            onMouseDown={canvasMouseDown}
            onMouseMove={canvasMouseMove}
            onMouseUp={canvasMouseUp}
            onMouseLeave={canvasMouseUp}
            onClick={e => { if (Math.abs((loopRegion?.a ?? 0) - (loopRegion?.b ?? 0)) < 100) canvasClick(e) }}
          />
        )}
      </div>

      {/* Info bar */}
      {audioBuffer && (
        <div className="flex items-center gap-4 px-4 py-1 border-t border-studio-border shrink-0 text-xs text-studio-muted">
          <span>{audioBuffer.numberOfChannels === 1 ? 'Mono' : 'Stereo'}</span>
          <span>{audioBuffer.sampleRate / 1000} kHz</span>
          <span>{audioBuffer.duration.toFixed(2)}s</span>
          <span>{Math.round(audioBuffer.length / audioBuffer.sampleRate * 1000)} ms</span>
          {loopRegion && <span style={{ color: '#00ff9d' }}>
            Loop: {((loopRegion.b - loopRegion.a) / audioBuffer.sampleRate).toFixed(3)}s
          </span>}
          <div className="flex-1" />
          <span className="text-studio-muted">Ctrl+scroll to zoom · Drag canvas to select loop region · Click to scrub</span>
        </div>
      )}
    </div>
  )
}
