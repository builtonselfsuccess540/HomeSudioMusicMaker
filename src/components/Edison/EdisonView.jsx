import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  getCtx, onClipsChange, getRecordings,
  getRecordingBuffer, bufferToWavBlob, bufferToMp3Blob, updateRecordingFromBuffer,
  startRecording, stopRecording,
} from '../../audio/audioEngine'

/* ── Buffer operations (all return a new AudioBuffer, non-destructive) */

function cloneBuf(src) {
  const c = getCtx()
  const out = c.createBuffer(src.numberOfChannels, src.length, src.sampleRate)
  for (let ch = 0; ch < src.numberOfChannels; ch++)
    out.copyToChannel(new Float32Array(src.getChannelData(ch)), ch)
  return out
}

function opNormalize(buf) {
  const out = cloneBuf(buf)
  let peak = 0
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const d = out.getChannelData(ch)
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak) peak = Math.abs(d[i])
  }
  if (peak < 0.001) return out
  const g = 0.99 / peak
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const d = out.getChannelData(ch)
    for (let i = 0; i < d.length; i++) d[i] *= g
  }
  return out
}

function opReverse(buf, s, e) {
  const out = cloneBuf(buf)
  const si = Math.floor(s * out.length), ei = Math.floor(e * out.length)
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const d = out.getChannelData(ch)
    let a = si, b = ei - 1
    while (a < b) { const t = d[a]; d[a++] = d[b]; d[b--] = t }
  }
  return out
}

function opFade(buf, s, e, type) {
  const out = cloneBuf(buf)
  const si = Math.floor(s * out.length), ei = Math.floor(e * out.length)
  const len = ei - si; if (len < 2) return out
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const d = out.getChannelData(ch)
    for (let i = si; i < ei; i++) {
      const t = (i - si) / len
      d[i] *= type === 'in' ? t : 1 - t
    }
  }
  return out
}

function opTrim(buf, s, e) {
  const si = Math.floor(s * buf.length), ei = Math.floor(e * buf.length)
  const len = ei - si; if (len < 2) return buf
  const c = getCtx()
  const out = c.createBuffer(buf.numberOfChannels, len, buf.sampleRate)
  for (let ch = 0; ch < buf.numberOfChannels; ch++)
    out.copyToChannel(buf.getChannelData(ch).slice(si, ei), ch)
  return out
}

function opSilence(buf, s, e) {
  const out = cloneBuf(buf)
  const si = Math.floor(s * out.length), ei = Math.floor(e * out.length)
  for (let ch = 0; ch < out.numberOfChannels; ch++) {
    const d = out.getChannelData(ch)
    for (let i = si; i < ei; i++) d[i] = 0
  }
  return out
}

/* ── Waveform canvas ────────────────────────────────────────────────── */

const CANVAS_H = 160

function WaveformCanvas({ audioBuffer, selection, onSelect, playPos, zoom, width }) {
  const canvasRef = useRef(null)
  const dragRef   = useRef(null)

  /* draw */
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d')
    ctx.clearRect(0, 0, width, CANVAS_H)
    ctx.fillStyle = '#07071a'
    ctx.fillRect(0, 0, width, CANVAS_H)

    // Grid lines
    ctx.strokeStyle = '#0f0f28'; ctx.lineWidth = 1
    ;[0.25, 0.5, 0.75].forEach((v) => {
      const y = v * CANVAS_H
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
    })

    if (!audioBuffer) {
      ctx.fillStyle = '#252545'; ctx.font = '12px monospace'; ctx.textAlign = 'center'
      ctx.fillText('No audio loaded — select a recording below', width / 2, CANVAS_H / 2 + 4)
      return
    }

    // Waveform
    const data  = audioBuffer.getChannelData(0)
    const vSamp = Math.floor(zoom.start * data.length)
    const vLen  = Math.floor((zoom.end - zoom.start) * data.length)
    const spx   = vLen / width

    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1
    ctx.shadowColor = '#00e5ff55'; ctx.shadowBlur = 2
    ctx.beginPath()
    for (let px = 0; px < width; px++) {
      const s = vSamp + Math.floor(px * spx)
      const e = Math.min(vSamp + Math.floor((px + 1) * spx), data.length)
      let mn = 0, mx = 0
      for (let i = s; i < e; i++) {
        if (data[i] < mn) mn = data[i]
        if (data[i] > mx) mx = data[i]
      }
      ctx.moveTo(px + 0.5, (0.5 - mx * 0.45) * CANVAS_H)
      ctx.lineTo(px + 0.5, (0.5 - mn * 0.45) * CANVAS_H)
    }
    ctx.stroke(); ctx.shadowBlur = 0

    // Selection overlay
    if (selection.end > selection.start) {
      const sx = Math.floor(((selection.start - zoom.start) / (zoom.end - zoom.start)) * width)
      const sw = Math.floor(((selection.end - selection.start) / (zoom.end - zoom.start)) * width)
      ctx.fillStyle = '#00e5ff20'; ctx.fillRect(sx, 0, sw, CANVAS_H)
      ctx.strokeStyle = '#00e5ff66'; ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sx, 0); ctx.lineTo(sx, CANVAS_H)
      ctx.moveTo(sx + sw, 0); ctx.lineTo(sx + sw, CANVAS_H)
      ctx.stroke()
    }

    // Playhead
    if (playPos >= 0) {
      const px = ((playPos - zoom.start) / (zoom.end - zoom.start)) * width
      if (px >= 0 && px <= width) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, CANVAS_H); ctx.stroke()
      }
    }
  }, [audioBuffer, selection, playPos, zoom, width])

  /* selection drag */
  const toNorm = useCallback((clientX) => {
    const r = canvasRef.current?.getBoundingClientRect()
    if (!r) return 0
    const x = Math.max(0, Math.min(width, clientX - r.left)) / width
    return zoom.start + x * (zoom.end - zoom.start)
  }, [zoom, width])

  const onMouseDown = useCallback((e) => {
    if (!audioBuffer) return
    e.preventDefault()
    const pos = toNorm(e.clientX)
    dragRef.current = pos
    onSelect({ start: pos, end: pos })
    const onMove = (me) => {
      const p = toNorm(me.clientX)
      onSelect({ start: Math.min(dragRef.current, p), end: Math.max(dragRef.current, p) })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [audioBuffer, toNorm, onSelect])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={CANVAS_H}
      style={{ display: 'block', width: '100%', height: CANVAS_H, cursor: audioBuffer ? 'crosshair' : 'default' }}
      onMouseDown={onMouseDown}
    />
  )
}

/* ── Main view ──────────────────────────────────────────────────────── */

export default function EdisonView() {
  const [recordings, setRecordings] = useState(() => getRecordings())
  const [recId,      setRecId]      = useState(null)
  const [audioBuf,   setAudioBuf]   = useState(null)
  const [undoStack,  setUndoStack]  = useState([])   // history of AudioBuffers
  const [redoStack,  setRedoStack]  = useState([])   // future buffers after undo
  const [sel,        setSel]        = useState({ start: 0, end: 1 })
  const [isPlaying,  setIsPlaying]  = useState(false)
  const [playPos,    setPlayPos]    = useState(-1)
  const [isLooping,  setIsLooping]  = useState(false)
  const [zoom,       setZoom]       = useState({ start: 0, end: 1 })
  const [status,     setStatus]     = useState('')
  const [isRec,      setIsRec]      = useState(false)
  const [canvasW,    setCanvasW]    = useState(860)

  const containerRef  = useRef(null)
  const srcRef        = useRef(null)
  const startTimeRef  = useRef(null)
  const frameRef      = useRef(null)

  useEffect(() => onClipsChange(setRecordings), [])

  /* responsive canvas */
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver((e) => setCanvasW(Math.floor(e[0].contentRect.width) || 860))
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  /* load recording into editor */
  const loadRec = useCallback(async (id) => {
    setRecId(id); setStatus('Loading…')
    const buf = await getRecordingBuffer(id)
    if (!buf) { setStatus('Failed to decode audio'); return }
    setAudioBuf(buf)
    setUndoStack([]); setRedoStack([])
    setSel({ start: 0, end: 1 }); setZoom({ start: 0, end: 1 })
    setStatus(`${buf.duration.toFixed(2)} s  ·  ${buf.sampleRate} Hz  ·  ${buf.numberOfChannels} ch`)
  }, [])

  /* stop playback */
  const stopPlay = useCallback(() => {
    if (srcRef.current) { try { srcRef.current.stop() } catch {} srcRef.current = null }
    cancelAnimationFrame(frameRef.current)
    setIsPlaying(false); setPlayPos(-1)
  }, [])

  /* start playback */
  const startPlay = useCallback(() => {
    if (!audioBuf) return
    stopPlay()
    const c   = getCtx()
    const src = c.createBufferSource()
    src.buffer = audioBuf
    src.loop   = isLooping
    src.connect(c.destination)
    const hasSel   = sel.end > sel.start + 0.001
    const offset   = hasSel ? sel.start * audioBuf.duration : 0
    const duration = hasSel ? (sel.end - sel.start) * audioBuf.duration : undefined
    src.start(0, offset, duration)
    srcRef.current     = src
    startTimeRef.current = c.currentTime - offset
    setIsPlaying(true)
    src.onended = () => { if (!isLooping) { setIsPlaying(false); setPlayPos(-1) } }
    const tick = () => {
      if (!srcRef.current) return
      setPlayPos((c.currentTime - startTimeRef.current) % audioBuf.duration)
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [audioBuf, sel, isLooping, stopPlay])

  useEffect(() => () => stopPlay(), [])

  /* apply an operation — push current buffer onto undo stack */
  const applyOp = useCallback((newBuf) => {
    if (!newBuf || !audioBuf) return
    setUndoStack((s) => [...s, audioBuf])
    setRedoStack([])
    setAudioBuf(newBuf)
    setStatus('Applied ✓')
  }, [audioBuf])

  const handleUndo = useCallback(() => {
    if (!undoStack.length) return
    setRedoStack((s) => [...s, audioBuf])
    const prev = undoStack[undoStack.length - 1]
    setUndoStack((s) => s.slice(0, -1))
    setAudioBuf(prev)
    setStatus('Undone')
  }, [undoStack, audioBuf])

  const handleRedo = useCallback(() => {
    if (!redoStack.length) return
    setUndoStack((s) => [...s, audioBuf])
    const next = redoStack[redoStack.length - 1]
    setRedoStack((s) => s.slice(0, -1))
    setAudioBuf(next)
    setStatus('Redone')
  }, [redoStack, audioBuf])

  const hasSel = sel.end > sel.start + 0.001

  /* record new take */
  const handleRecord = useCallback(async () => {
    if (isRec) {
      stopRecording(); setIsRec(false); setStatus('Recording saved')
    } else {
      const err = await startRecording()
      if (err) { setStatus(`Mic: ${err}`); return }
      setIsRec(true); setStatus('Recording…')
    }
  }, [isRec])

  /* save changes back to the recordings list */
  const saveToRec = useCallback(() => {
    if (!audioBuf || !recId) return
    updateRecordingFromBuffer(recId, audioBuf)
    setUndoStack([]); setRedoStack([])
    setStatus('Saved to recordings ✓')
  }, [audioBuf, recId])

  /* export as WAV */
  const exportWav = useCallback(() => {
    if (!audioBuf) return
    const blob = bufferToWavBlob(audioBuf)
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const rec  = recordings.find((r) => r.id === recId)
    a.href = url; a.download = `${rec?.name ?? 'edison'}.wav`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setStatus('Exported as WAV ✓')
  }, [audioBuf, recId, recordings])

  /* export as MP3 */
  const [exportingMp3, setExportingMp3] = useState(false)
  const exportMp3 = useCallback(async () => {
    if (!audioBuf) return
    setExportingMp3(true)
    setStatus('Encoding MP3…')
    try {
      const blob = await bufferToMp3Blob(audioBuf, 192)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const rec  = recordings.find((r) => r.id === recId)
      a.href = url; a.download = `${rec?.name ?? 'edison'}.mp3`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus('Exported as MP3 ✓')
    } catch (e) {
      setStatus('MP3 export failed: ' + e.message)
    } finally {
      setExportingMp3(false)
    }
  }, [audioBuf, recId, recordings])

  /* zoom: double-click → zoom to sel, right-click → reset */
  const onCanvasDbl = useCallback(() => {
    if (hasSel) setZoom({ start: sel.start, end: sel.end })
  }, [hasSel, sel])
  const onCanvasCtx = useCallback((e) => { e.preventDefault(); setZoom({ start: 0, end: 1 }) }, [])

  const durStr = audioBuf ? `${audioBuf.duration.toFixed(2)} s` : '—'
  const selStr = hasSel && audioBuf
    ? `${(sel.start * audioBuf.duration).toFixed(2)} s – ${(sel.end * audioBuf.duration).toFixed(2)} s`
    : 'full clip'

  const BTNS = [
    { label: 'Normalize',  fn: () => opNormalize(audioBuf) },
    { label: 'Reverse',    fn: () => opReverse(audioBuf, hasSel ? sel.start : 0, hasSel ? sel.end : 1) },
    { label: 'Fade In',    fn: () => opFade(audioBuf, hasSel ? sel.start : 0, hasSel ? sel.end : 1, 'in') },
    { label: 'Fade Out',   fn: () => opFade(audioBuf, hasSel ? sel.start : 0, hasSel ? sel.end : 1, 'out') },
    { label: 'Trim Sel',   fn: () => hasSel ? opTrim(audioBuf, sel.start, sel.end) : null,    disabled: !hasSel },
    { label: 'Silence Sel',fn: () => hasSel ? opSilence(audioBuf, sel.start, sel.end) : null, disabled: !hasSel },
  ]

  return (
    <div className="flex flex-col h-full bg-studio-void overflow-hidden">

      {/* Title bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-studio-panel border-b border-studio-border shrink-0">
        <span
          className="font-display text-sm font-semibold tracking-widest uppercase"
          style={{ color: '#00e5ff', textShadow: '0 0 8px #00e5ff66' }}
        >Edison</span>
        <span className="font-mono text-xs text-studio-dim">Audio Recorder & Editor</span>
        <div className="flex-1" />
        {status && <span className="font-mono text-xs text-studio-dim">{status}</span>}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-4 py-1.5 bg-studio-panel border-b border-studio-border flex-wrap shrink-0">
        {/* Play / Stop */}
        <button
          onClick={() => isPlaying ? stopPlay() : startPlay()}
          disabled={!audioBuf}
          className={`w-8 h-7 rounded flex items-center justify-center border transition-all disabled:opacity-30 ${
            isPlaying ? 'bg-studio-cyan border-studio-cyan text-black' : 'bg-studio-surface border-studio-border text-white hover:border-studio-cyan'
          }`}
          title="Play / Stop"
        >
          {isPlaying
            ? <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="3" height="8"/><rect x="6" y="1" width="3" height="8"/></svg>
            : <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9"/></svg>}
        </button>

        <button
          onClick={() => setIsLooping((v) => !v)} disabled={!audioBuf}
          className={`px-2 h-7 rounded text-xs font-mono border transition-colors disabled:opacity-30 ${
            isLooping ? 'border-studio-yellow text-studio-yellow bg-studio-yellow/10' : 'border-studio-border text-studio-dim hover:text-white'
          }`}
        >🔁 Loop</button>

        <div className="w-px h-5 bg-studio-border mx-1" />

        {/* Record */}
        <button
          onClick={handleRecord}
          className={`flex items-center gap-1.5 px-2 h-7 rounded text-xs font-mono border transition-colors ${
            isRec ? 'border-studio-red text-studio-red bg-studio-red/10 animate-pulse' : 'border-studio-border text-studio-dim hover:border-studio-red hover:text-studio-red'
          }`}
        >● {isRec ? 'Stop Rec' : 'Record'}</button>

        <div className="w-px h-5 bg-studio-border mx-1" />

        {/* Edit operations */}
        {BTNS.map(({ label, fn, disabled }) => (
          <button
            key={label}
            onClick={() => applyOp(fn())}
            disabled={!audioBuf || disabled}
            className="px-2 h-7 rounded text-xs font-mono border border-studio-border text-studio-dim hover:text-white hover:border-studio-cyan disabled:opacity-25 transition-colors"
          >{label}</button>
        ))}

        <div className="w-px h-5 bg-studio-border mx-1" />

        <button
          onClick={handleUndo}
          disabled={!undoStack.length}
          className="px-2 h-7 rounded text-xs font-mono border border-studio-border text-studio-dim hover:text-white disabled:opacity-25 transition-colors"
          title={`Undo (${undoStack.length} available)`}
        >↩ Undo{undoStack.length > 0 ? ` (${undoStack.length})` : ''}</button>

        <button
          onClick={handleRedo}
          disabled={!redoStack.length}
          className="px-2 h-7 rounded text-xs font-mono border border-studio-border text-studio-dim hover:text-white disabled:opacity-25 transition-colors"
          title={`Redo (${redoStack.length} available)`}
        >↪ Redo{redoStack.length > 0 ? ` (${redoStack.length})` : ''}</button>

        <button
          onClick={saveToRec} disabled={!audioBuf || !recId}
          className="px-2 h-7 rounded text-xs font-mono border border-studio-cyan text-studio-cyan hover:bg-studio-cyan/10 disabled:opacity-25 transition-colors"
        >💾 Save</button>

        <button
          onClick={exportWav} disabled={!audioBuf}
          className="px-2 h-7 rounded text-xs font-mono border border-studio-green text-studio-green hover:bg-studio-green/10 disabled:opacity-25 transition-colors"
        >↓ WAV</button>

        <button
          onClick={exportMp3} disabled={!audioBuf || exportingMp3}
          className="px-2 h-7 rounded text-xs font-mono border border-studio-green text-studio-green hover:bg-studio-green/10 disabled:opacity-25 transition-colors"
        >{exportingMp3 ? '⏳ MP3…' : '↓ MP3'}</button>
      </div>

      {/* Waveform */}
      <div
        ref={containerRef}
        className="px-4 pt-3 pb-1 shrink-0"
        onDoubleClick={onCanvasDbl}
        onContextMenu={onCanvasCtx}
      >
        <div className="rounded-xl overflow-hidden border border-studio-border"
          style={{ boxShadow: audioBuf ? '0 0 20px #00e5ff08' : 'none' }}
        >
          <WaveformCanvas
            audioBuffer={audioBuf}
            selection={sel}
            onSelect={setSel}
            playPos={playPos >= 0 && audioBuf ? playPos / audioBuf.duration : -1}
            zoom={zoom}
            width={canvasW}
          />
        </div>
        {audioBuf && (
          <div className="flex items-center gap-5 mt-1 px-1">
            <span className="font-mono text-studio-muted" style={{ fontSize: 9 }}>Duration: {durStr}</span>
            <span className="font-mono text-studio-muted" style={{ fontSize: 9 }}>Selection: {selStr}</span>
            <span className="font-mono text-studio-muted" style={{ fontSize: 9 }}>Zoom: double-click → zoom to selection · right-click → reset</span>
          </div>
        )}
      </div>

      {/* Recordings list */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        <div className="flex items-center gap-2 mb-2 mt-2">
          <span className="font-mono text-xs text-studio-dim uppercase tracking-wider">Recordings</span>
          <span className="font-mono text-xs text-studio-muted">click to open in editor</span>
        </div>
        {recordings.length === 0 ? (
          <p className="font-mono text-xs text-studio-muted py-4 text-center">
            No recordings yet. Press ● Record above or use the transport bar to capture audio.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {recordings.map((rec) => (
              <button
                key={rec.id}
                onClick={() => loadRec(rec.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                  recId === rec.id
                    ? 'border-studio-cyan bg-studio-surface'
                    : 'border-studio-border hover:border-studio-cyan/50 hover:bg-studio-surface/50'
                }`}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: recId === rec.id ? '#00e5ff' : '#333355',
                    boxShadow: recId === rec.id ? '0 0 5px #00e5ff' : 'none',
                  }}
                />
                <span className="font-ui text-sm text-studio-text">{rec.name}</span>
                <span className="font-mono text-xs text-studio-muted">{rec.timestamp}</span>
                <span className="font-mono text-xs text-studio-dim ml-auto">
                  {(rec.size / 1024).toFixed(0)} KB
                </span>
                {recId === rec.id && (
                  <span className="font-mono text-xs text-studio-cyan">← loaded</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
