import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  getCtx, getRecordings, onClipsChange,
  getRecordingBuffer, bufferToWavBlob, updateRecordingFromBuffer,
} from '../../audio/audioEngine'

/* ═══════════════════════════════════════════════════════════════════════════
   AUDIO PROCESSING
   ═══════════════════════════════════════════════════════════════════════════ */

/* Algorithm window/hop presets */
const ALGO_PARAMS = {
  Polyphonic: { WS: 2048, HOP: 512 },
  Monophonic: { WS: 1024, HOP: 256 },
  Rhythmic:   { WS: 512,  HOP: 128 },
}

/* OLA (Overlap-Add) time-stretch core.
   ratio > 1 = slower/longer, ratio < 1 = faster/shorter.
   Returns a new Float32Array of length ≈ data.length * ratio. */
function olaStretch(data, ratio, algoKey = 'Polyphonic') {
  const { WS, HOP } = ALGO_PARAMS[algoKey] || ALGO_PARAMS.Polyphonic
  const HI = Math.max(1, Math.round(HOP / ratio))

  const outLen = Math.round(data.length * ratio)
  const output = new Float32Array(outLen + WS)
  const sumW   = new Float32Array(outLen + WS)

  const win = new Float32Array(WS)
  for (let i = 0; i < WS; i++)
    win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (WS - 1)))

  let inPos = 0, outPos = 0
  while (inPos + WS <= data.length && outPos + WS <= output.length) {
    for (let i = 0; i < WS; i++) {
      const w = win[i]
      output[outPos + i] += w * data[inPos + i]
      sumW[outPos + i]   += w * w
    }
    inPos  += HI
    outPos += HOP
  }

  const result = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++)
    result[i] = sumW[i] > 0.001 ? output[i] / sumW[i] : output[i]
  return result
}

/* Linear interpolation resample — used inside pitchShift */
function linearResample(data, ratio) {
  const outLen = Math.round(data.length / ratio)
  const result = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const lo  = Math.floor(src)
    const frac = src - lo
    result[i] = lo + 1 < data.length
      ? (1 - frac) * data[lo] + frac * data[lo + 1]
      : data[Math.min(lo, data.length - 1)]
  }
  return result
}

/* Time-stretch AudioBuffer by ratio. Pitch is preserved. */
function timeStretchBuffer(buf, ratio, algoKey) {
  const c    = getCtx()
  const data = buf.getChannelData(0)
  const out  = olaStretch(data, ratio, algoKey)
  const outBuf = c.createBuffer(1, out.length, buf.sampleRate)
  outBuf.copyToChannel(out, 0)
  return outBuf
}

/* Pitch-shift AudioBuffer by semitones. Duration is preserved.
   Technique: resample (changes pitch+duration) → stretch back to original length. */
function pitchShiftBuffer(buf, semitones, algoKey) {
  const c     = getCtx()
  const ratio = Math.pow(2, semitones / 12)
  const data  = buf.getChannelData(0)

  const resampled   = linearResample(data, ratio)              // pitch shifted + duration changed
  const backRatio   = data.length / resampled.length           // stretch factor to restore duration
  const stretched   = olaStretch(resampled, backRatio, algoKey)

  const final = new Float32Array(buf.length)
  final.set(stretched.subarray(0, Math.min(buf.length, stretched.length)))

  const outBuf = c.createBuffer(1, buf.length, buf.sampleRate)
  outBuf.copyToChannel(final, 0)
  return outBuf
}

/* Varispeed — pitch AND tempo change together (like tape speed). */
function varispeedBuffer(buf, semitones) {
  const c     = getCtx()
  const ratio = Math.pow(2, semitones / 12)
  const data  = buf.getChannelData(0)
  const out   = linearResample(data, ratio)
  const outBuf = c.createBuffer(1, out.length, buf.sampleRate)
  outBuf.copyToChannel(out, 0)
  return outBuf
}

/* Warp-marker stretch — applies per-segment OLA between markers.
   markers: [{ id, origPos, outPos }]  (both in 0-1 normalized space)
   origPos = where the marker is anchored in the source audio
   outPos  = where that moment should land in the output */
function applyWarpStretch(buf, markers, algoKey) {
  const c    = getCtx()
  const data = buf.getChannelData(0)

  const anchors = [
    { origPos: 0, outPos: 0 },
    ...markers.filter(m => m.origPos > 0 && m.origPos < 1),
    { origPos: 1, outPos: 1 },
  ].sort((a, b) => a.origPos - b.origPos)

  let totalOut = 0
  const segs = []
  for (let i = 0; i < anchors.length - 1; i++) {
    const a0 = anchors[i], a1 = anchors[i + 1]
    const inStart = Math.floor(a0.origPos * data.length)
    const inEnd   = Math.floor(a1.origPos * data.length)
    const outLen  = Math.max(1, Math.round((a1.outPos - a0.outPos) * buf.length))
    const inLen   = inEnd - inStart
    if (inLen < 2) { totalOut += outLen; segs.push({ skip: true, outLen }); continue }
    const ratio = outLen / inLen
    segs.push({ inStart, inLen, outLen, ratio })
    totalOut += outLen
  }

  if (totalOut < 2) return buf
  const output = new Float32Array(totalOut)
  let writePos = 0
  for (const seg of segs) {
    if (seg.skip) { writePos += seg.outLen; continue }
    const slice    = data.slice(seg.inStart, seg.inStart + seg.inLen)
    const stretched = Math.abs(seg.ratio - 1) < 0.002 ? slice : olaStretch(slice, seg.ratio, algoKey)
    const take = Math.min(stretched.length, seg.outLen)
    output.set(stretched.subarray(0, take), writePos)
    writePos += seg.outLen
  }

  const outBuf = c.createBuffer(1, totalOut, buf.sampleRate)
  outBuf.copyToChannel(output, 0)
  return outBuf
}

/* ═══════════════════════════════════════════════════════════════════════════
   WAVEFORM CANVAS WITH WARP MARKERS
   ═══════════════════════════════════════════════════════════════════════════ */

const CANVAS_H = 180

function ElasticCanvas({ sourceBuf, resultBuf, markers, onMarkers, playPos, zoom, width }) {
  const canvasRef  = useRef(null)
  const dragRef    = useRef(null)    // { markerId }
  const markersRef = useRef(markers) // always-current ref for drag callbacks

  useEffect(() => { markersRef.current = markers }, [markers])

  /* draw */
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d')
    ctx.clearRect(0, 0, width, CANVAS_H)
    ctx.fillStyle = '#06060f'
    ctx.fillRect(0, 0, width, CANVAS_H)

    // Subtle grid
    ctx.strokeStyle = '#0d0d20'; ctx.lineWidth = 1
    ;[0.25, 0.5, 0.75].forEach(v => {
      ctx.beginPath(); ctx.moveTo(0, v * CANVAS_H); ctx.lineTo(width, v * CANVAS_H); ctx.stroke()
    })

    if (!sourceBuf) {
      ctx.fillStyle = '#252545'; ctx.font = '12px monospace'; ctx.textAlign = 'center'
      ctx.fillText('No audio loaded — select a recording below', width / 2, CANVAS_H / 2 + 4)
      return
    }

    function drawWaveform(buf, color, alpha) {
      const d = buf.getChannelData(0)
      const vs = Math.floor(zoom.start * d.length)
      const vl = Math.floor((zoom.end - zoom.start) * d.length)
      const spx = vl / width
      ctx.globalAlpha = alpha
      ctx.strokeStyle = color; ctx.lineWidth = 1
      ctx.shadowColor = color + '44'; ctx.shadowBlur = 3
      ctx.beginPath()
      for (let px = 0; px < width; px++) {
        const s = vs + Math.floor(px * spx)
        const e = Math.min(vs + Math.floor((px + 1) * spx), d.length)
        let mn = 0, mx = 0
        for (let i = s; i < e; i++) {
          if (d[i] < mn) mn = d[i]
          if (d[i] > mx) mx = d[i]
        }
        ctx.moveTo(px + 0.5, (0.5 - mx * 0.45) * CANVAS_H)
        ctx.lineTo(px + 0.5, (0.5 - mn * 0.45) * CANVAS_H)
      }
      ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1
    }

    drawWaveform(sourceBuf, '#00e5ff', resultBuf ? 0.28 : 0.88)
    if (resultBuf) drawWaveform(resultBuf, '#00ff9d', 0.85)

    /* Warp marker segment labels */
    const sorted = [...markers].sort((a, b) => a.outPos - b.outPos)
    const anchors = [
      { origPos: 0, outPos: 0 },
      ...sorted,
      { origPos: 1, outPos: 1 },
    ]
    ctx.font = '8px monospace'; ctx.textAlign = 'center'
    for (let i = 0; i < anchors.length - 1; i++) {
      const a0 = anchors[i], a1 = anchors[i + 1]
      if (a1.origPos - a0.origPos < 0.001) continue
      const ratio    = (a1.outPos - a0.outPos) / (a1.origPos - a0.origPos)
      const x0px     = ((a0.outPos - zoom.start) / (zoom.end - zoom.start)) * width
      const x1px     = ((a1.outPos - zoom.start) / (zoom.end - zoom.start)) * width
      const cx       = (x0px + x1px) / 2
      const hue      = ratio > 1.05 ? '#ffe600' : ratio < 0.95 ? '#ff9500' : '#00e5ff'
      ctx.fillStyle  = hue + 'bb'
      ctx.fillText(`${ratio.toFixed(2)}×`, cx, 13)
    }

    /* Warp marker lines and handles */
    sorted.forEach(m => {
      const ox  = ((m.origPos - zoom.start) / (zoom.end - zoom.start)) * width
      const px  = ((m.outPos  - zoom.start) / (zoom.end - zoom.start)) * width

      // Original-position tick (white, fixed)
      if (ox >= 0 && ox <= width) {
        ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 1; ctx.setLineDash([2, 3])
        ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, 22); ctx.stroke()
        ctx.setLineDash([])
      }

      // Arrow origPos → outPos at top
      if (Math.abs(px - ox) > 3 && ox >= 0 && ox <= width && px >= 0 && px <= width) {
        ctx.strokeStyle = '#ffe60055'; ctx.lineWidth = 1; ctx.setLineDash([])
        ctx.beginPath(); ctx.moveTo(ox, 10); ctx.lineTo(px, 10); ctx.stroke()
        // arrowhead
        const dir = px > ox ? 1 : -1
        ctx.beginPath(); ctx.moveTo(px, 10); ctx.lineTo(px - dir * 5, 7); ctx.lineTo(px - dir * 5, 13); ctx.closePath()
        ctx.fillStyle = '#ffe600aa'; ctx.fill()
      }

      if (px < -5 || px > width + 5) return

      // Output-position line (yellow, draggable)
      ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3])
      ctx.shadowColor = '#ffe60055'; ctx.shadowBlur = 4
      ctx.beginPath(); ctx.moveTo(px, 22); ctx.lineTo(px, CANVAS_H); ctx.stroke()
      ctx.setLineDash([]); ctx.shadowBlur = 0

      // Diamond drag handle
      ctx.fillStyle = '#ffe600'
      ctx.shadowColor = '#ffe60099'; ctx.shadowBlur = 6
      ctx.beginPath()
      ctx.moveTo(px,      22)
      ctx.lineTo(px + 7,  31)
      ctx.lineTo(px,      40)
      ctx.lineTo(px - 7,  31)
      ctx.closePath()
      ctx.fill(); ctx.shadowBlur = 0
    })

    // Playhead
    if (playPos >= 0) {
      const px = ((playPos - zoom.start) / (zoom.end - zoom.start)) * width
      if (px >= 0 && px <= width) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, CANVAS_H); ctx.stroke()
      }
    }
  }, [sourceBuf, resultBuf, markers, playPos, zoom, width])

  /* coordinate helpers */
  const toNorm = useCallback((clientX) => {
    const r = canvasRef.current?.getBoundingClientRect()
    if (!r) return 0
    const x = Math.max(0, Math.min(width, clientX - r.left)) / width
    return zoom.start + x * (zoom.end - zoom.start)
  }, [zoom, width])

  const findMarker = useCallback((pos) => {
    const thresh = 0.014 * (zoom.end - zoom.start)
    return markersRef.current.find(m => Math.abs(m.outPos - pos) < thresh)
  }, [zoom])

  const onMouseDown = useCallback((e) => {
    if (!sourceBuf) return
    e.preventDefault()
    const pos = toNorm(e.clientX)
    const hit = findMarker(pos)

    let id
    if (hit) {
      id = hit.id
    } else {
      id = String(Date.now())
      const created = { id, origPos: pos, outPos: pos }
      markersRef.current = [...markersRef.current, created]
      onMarkers(markersRef.current)
    }
    dragRef.current = id

    const onMove = (me) => {
      if (!dragRef.current) return
      const np = Math.max(0.005, Math.min(0.995, toNorm(me.clientX)))
      markersRef.current = markersRef.current.map(m =>
        m.id === dragRef.current ? { ...m, outPos: np } : m
      )
      onMarkers([...markersRef.current])
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sourceBuf, toNorm, findMarker, onMarkers])

  const onDblClick = useCallback((e) => {
    if (!sourceBuf) return
    const pos = toNorm(e.clientX)
    const hit = findMarker(pos)
    if (hit) {
      const updated = markersRef.current.filter(m => m.id !== hit.id)
      markersRef.current = updated
      onMarkers(updated)
    }
  }, [sourceBuf, toNorm, findMarker, onMarkers])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={CANVAS_H}
      style={{ display: 'block', width: '100%', height: CANVAS_H, cursor: sourceBuf ? 'crosshair' : 'default' }}
      onMouseDown={onMouseDown}
      onDoubleClick={onDblClick}
    />
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN VIEW
   ═══════════════════════════════════════════════════════════════════════════ */

export default function ElasticAudioView() {
  const [recordings,   setRecordings]   = useState(() => getRecordings())
  const [recId,        setRecId]        = useState(null)
  const [audioBuf,     setAudioBuf]     = useState(null)
  const [resultBuf,    setResultBuf]    = useState(null)
  const [undoStack,    setUndoStack]    = useState([])
  const [redoStack,    setRedoStack]    = useState([])
  const [warpMarkers,  setWarpMarkers]  = useState([])
  const [stretchRatio, setStretchRatio] = useState(1.0)
  const [pitchSemi,    setPitchSemi]    = useState(0)
  const [algorithm,    setAlgorithm]    = useState('Polyphonic')
  const [isProcessing, setIsProcessing] = useState(false)
  const [status,       setStatus]       = useState('')
  const [zoom,         setZoom]         = useState({ start: 0, end: 1 })
  const [playPos,      setPlayPos]      = useState(-1)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [canvasW,      setCanvasW]      = useState(800)

  const containerRef = useRef(null)
  const previewRef   = useRef(null)
  const startRef     = useRef(null)
  const rafRef       = useRef(null)

  useEffect(() => onClipsChange(setRecordings), [])

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(e => setCanvasW(Math.floor(e[0].contentRect.width) || 800))
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  /* ── Load recording ──────────────────────────────────────────────────── */
  const loadRec = useCallback(async (id) => {
    setRecId(id); setStatus('Loading…')
    const buf = await getRecordingBuffer(id)
    if (!buf) { setStatus('Failed to decode audio'); return }
    setAudioBuf(buf); setResultBuf(null)
    setWarpMarkers([])
    setUndoStack([]); setRedoStack([])
    setStretchRatio(1.0); setPitchSemi(0)
    setZoom({ start: 0, end: 1 })
    setStatus(`${buf.duration.toFixed(2)} s  ·  ${buf.sampleRate} Hz  ·  ${buf.numberOfChannels} ch`)
  }, [])

  /* ── Playback ────────────────────────────────────────────────────────── */
  const stopPreview = useCallback(() => {
    if (previewRef.current) { try { previewRef.current.stop() } catch {} previewRef.current = null }
    cancelAnimationFrame(rafRef.current)
    setIsPreviewing(false); setPlayPos(-1)
  }, [])

  const startPreview = useCallback((buf) => {
    if (!buf) return
    stopPreview()
    const c   = getCtx()
    const src = c.createBufferSource()
    src.buffer = buf; src.connect(c.destination); src.start()
    previewRef.current = src
    startRef.current   = c.currentTime
    setIsPreviewing(true)
    src.onended = () => { previewRef.current = null; setIsPreviewing(false); setPlayPos(-1); cancelAnimationFrame(rafRef.current) }
    const tick = () => {
      if (!previewRef.current) return
      setPlayPos((c.currentTime - startRef.current) / buf.duration)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [stopPreview])

  useEffect(() => () => stopPreview(), [stopPreview])

  /* ── Core: run a synchronous operation on the working buffer ─────────── */
  const runOp = useCallback((fn, label) => {
    if (!audioBuf) return
    setIsProcessing(true); setStatus(label + '…')
    stopPreview()
    setTimeout(() => {
      try {
        const out = fn(audioBuf)
        setResultBuf(out)
        const diff = out.duration - audioBuf.duration
        const sign = diff >= 0 ? '+' : ''
        setStatus(`${label} — ${out.duration.toFixed(2)} s (${sign}${diff.toFixed(2)} s)`)
      } catch (err) {
        setStatus(`Error: ${err.message}`)
      }
      setIsProcessing(false)
    }, 16)
  }, [audioBuf, stopPreview])

  /* ── Commit result to working buffer (undo-able) ─────────────────────── */
  const commit = useCallback((buf) => {
    if (!buf || !audioBuf) return
    setUndoStack(s => [...s, audioBuf])
    setRedoStack([])
    setAudioBuf(buf); setResultBuf(null)
    setWarpMarkers([]); setStretchRatio(1.0); setPitchSemi(0)
    setStatus('Applied ✓')
  }, [audioBuf])

  /* ── Undo / Redo ──────────────────────────────────────────────────────── */
  const handleUndo = useCallback(() => {
    if (!undoStack.length) return
    setRedoStack(s => [...s, audioBuf])
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(s => s.slice(0, -1))
    setAudioBuf(prev); setResultBuf(null); setStatus('Undone')
  }, [undoStack, audioBuf])

  const handleRedo = useCallback(() => {
    if (!redoStack.length) return
    setUndoStack(s => [...s, audioBuf])
    const next = redoStack[redoStack.length - 1]
    setRedoStack(s => s.slice(0, -1))
    setAudioBuf(next); setResultBuf(null); setStatus('Redone')
  }, [redoStack, audioBuf])

  /* ── Operations ───────────────────────────────────────────────────────── */
  const applyStretch = () => {
    if (Math.abs(stretchRatio - 1) < 0.001) return setStatus('Ratio is 1.0 — no change')
    runOp(buf => timeStretchBuffer(buf, stretchRatio, algorithm), `Stretch ${stretchRatio.toFixed(3)}×`)
  }

  const applyPitch = () => {
    if (Math.abs(pitchSemi) < 0.01) return setStatus('Pitch is 0 — no change')
    if (algorithm === 'Varispeed') {
      runOp(buf => varispeedBuffer(buf, pitchSemi),
        `Varispeed ${pitchSemi > 0 ? '+' : ''}${pitchSemi} st`)
    } else {
      runOp(buf => pitchShiftBuffer(buf, pitchSemi, algorithm),
        `Pitch ${pitchSemi > 0 ? '+' : ''}${pitchSemi} st`)
    }
  }

  const applyBoth = () => {
    const hasP = Math.abs(pitchSemi) >= 0.01
    const hasS = Math.abs(stretchRatio - 1) >= 0.001
    if (!hasP && !hasS) return setStatus('No changes set')
    runOp(buf => {
      let b = buf
      if (hasS) b = timeStretchBuffer(b, stretchRatio, algorithm)
      if (hasP) b = algorithm === 'Varispeed' ? varispeedBuffer(b, pitchSemi) : pitchShiftBuffer(b, pitchSemi, algorithm)
      return b
    }, `Elastic (${hasS ? stretchRatio.toFixed(2) + '× ' : ''}${hasP ? (pitchSemi > 0 ? '+' : '') + pitchSemi + 'st' : ''})`)
  }

  const applyWarp = () => {
    if (!warpMarkers.length) return setStatus('Click the waveform to place warp markers first')
    const hasWarp = warpMarkers.some(m => Math.abs(m.outPos - m.origPos) > 0.004)
    if (!hasWarp) return setStatus('Drag markers to offset them from their anchors')
    runOp(buf => applyWarpStretch(buf, warpMarkers, algorithm), 'Warp Stretch')
  }

  /* ── Save / Export ────────────────────────────────────────────────────── */
  const saveToRec = useCallback(() => {
    const buf = resultBuf || audioBuf
    if (!buf || !recId) return
    updateRecordingFromBuffer(recId, buf)
    if (resultBuf) commit(resultBuf)
    else { setUndoStack([]); setRedoStack([]) }
    setStatus('Saved to recordings ✓')
  }, [resultBuf, audioBuf, recId, commit])

  const exportWav = useCallback(() => {
    const buf = resultBuf || audioBuf
    if (!buf) return
    const blob = bufferToWavBlob(buf)
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const rec  = recordings.find(r => r.id === recId)
    a.href = url; a.download = `${rec?.name ?? 'elastic'}-processed.wav`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setStatus('Exported WAV ✓')
  }, [resultBuf, audioBuf, recId, recordings])

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  const clearWarp  = () => setWarpMarkers([])
  const resetWarp  = () => setWarpMarkers(ms => ms.map(m => ({ ...m, outPos: m.origPos })))
  const durLabel   = audioBuf  ? `${audioBuf.duration.toFixed(2)} s`  : '—'
  const resDurLabel = resultBuf ? `→ ${resultBuf.duration.toFixed(2)} s` : ''
  const semiLabel  = pitchSemi === 0 ? '0 st' : `${pitchSemi > 0 ? '+' : ''}${pitchSemi} st`
  const hasWarpOffset = warpMarkers.some(m => Math.abs(m.outPos - m.origPos) > 0.004)

  return (
    <div className="flex flex-col h-full bg-studio-void overflow-hidden">

      {/* ── Title bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-studio-panel border-b border-studio-border shrink-0">
        <span
          className="font-display text-sm font-semibold tracking-widest uppercase"
          style={{ color: '#ff9500', textShadow: '0 0 10px #ff950055' }}
        >Elastic Audio</span>
        <span className="font-mono text-xs text-studio-dim">Time-Stretch & Pitch Manipulation</span>
        <div className="flex-1" />
        {status && <span className="font-mono text-xs text-studio-dim">{status}</span>}
        {durLabel !== '—' && (
          <span className="font-mono text-xs" style={{ color: '#ff9500' }}>
            {durLabel}{resDurLabel && <span style={{ color: '#00ff9d' }}> {resDurLabel}</span>}
          </span>
        )}
      </div>

      {/* ── Algorithm selector + global controls ──────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-studio-panel border-b border-studio-border flex-wrap shrink-0">

        {/* Algorithm */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-studio-dim">Algorithm</span>
          <select
            value={algorithm}
            onChange={e => setAlgorithm(e.target.value)}
            className="bg-studio-void border border-studio-border rounded px-2 py-0.5 text-xs font-mono text-studio-text focus:outline-none"
            style={{ borderColor: '#ff9500', color: '#ff9500' }}
          >
            {['Polyphonic','Monophonic','Rhythmic','Varispeed'].map(a => <option key={a}>{a}</option>)}
          </select>
        </div>

        <div className="w-px h-5 bg-studio-border" />

        {/* Time Stretch ratio */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-studio-dim">Stretch</span>
          <input
            type="range" min={0.25} max={4.0} step={0.01} value={stretchRatio}
            onChange={e => setStretchRatio(Number(e.target.value))}
            className="w-28" style={{ accentColor: '#ff9500' }}
            title="Time stretch ratio (1.0 = no change)"
          />
          <span
            className="font-mono text-xs cursor-pointer hover:text-white"
            style={{ color: Math.abs(stretchRatio - 1) < 0.01 ? '#555570' : '#ff9500', minWidth: 38 }}
            onClick={() => setStretchRatio(1.0)}
            title="Click to reset"
          >{stretchRatio.toFixed(2)}×</span>
        </div>

        {/* Pitch shift */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-studio-dim">Pitch</span>
          <input
            type="range" min={-24} max={24} step={0.5} value={pitchSemi}
            onChange={e => setPitchSemi(Number(e.target.value))}
            className="w-24" style={{ accentColor: '#b44fff' }}
            title="Pitch shift in semitones"
          />
          <span
            className="font-mono text-xs cursor-pointer hover:text-white"
            style={{ color: Math.abs(pitchSemi) < 0.01 ? '#555570' : '#b44fff', minWidth: 36 }}
            onClick={() => setPitchSemi(0)}
            title="Click to reset"
          >{semiLabel}</span>
        </div>

        <div className="w-px h-5 bg-studio-border" />

        {/* Action buttons */}
        <button
          onClick={applyStretch}
          disabled={!audioBuf || isProcessing}
          className="px-2.5 h-7 rounded text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:border-orange-400 hover:text-orange-400 disabled:opacity-25 transition-colors"
        >Stretch</button>

        <button
          onClick={applyPitch}
          disabled={!audioBuf || isProcessing}
          className="px-2.5 h-7 rounded text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:border-studio-purple hover:text-studio-purple disabled:opacity-25 transition-colors"
        >Pitch</button>

        <button
          onClick={applyBoth}
          disabled={!audioBuf || isProcessing}
          className="px-2.5 h-7 rounded text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:border-studio-cyan hover:text-studio-cyan disabled:opacity-25 transition-colors"
        >Both</button>

        <div className="w-px h-5 bg-studio-border" />

        {/* Playback */}
        <button
          onClick={() => isPreviewing ? stopPreview() : startPreview(resultBuf || audioBuf)}
          disabled={!audioBuf}
          className={`px-2.5 h-7 rounded text-xs font-mono border transition-colors disabled:opacity-25 ${
            isPreviewing ? 'border-studio-cyan text-studio-cyan bg-studio-cyan/10' : 'border-studio-border text-studio-dim hover:border-studio-cyan'
          }`}
        >{isPreviewing ? '■ Stop' : resultBuf ? '▶ Preview Result' : '▶ Preview'}</button>

        {/* Commit / Discard result */}
        {resultBuf && (
          <>
            <button
              onClick={() => commit(resultBuf)}
              className="px-2.5 h-7 rounded text-xs font-ui font-semibold border border-studio-green text-studio-green hover:bg-studio-green/10 transition-colors"
            >✓ Commit</button>
            <button
              onClick={() => { setResultBuf(null); setStatus('Discarded') }}
              className="px-2 h-7 rounded text-xs font-mono border border-studio-border text-studio-muted hover:text-white transition-colors"
            >✕ Discard</button>
          </>
        )}

        <div className="flex-1" />

        {/* Undo / Redo */}
        <button onClick={handleUndo} disabled={!undoStack.length} className="px-2 h-7 rounded text-xs font-mono border border-studio-border text-studio-dim hover:text-white disabled:opacity-25 transition-colors" title={`Undo (${undoStack.length})`}>
          ↩{undoStack.length > 0 ? ` ${undoStack.length}` : ''}
        </button>
        <button onClick={handleRedo} disabled={!redoStack.length} className="px-2 h-7 rounded text-xs font-mono border border-studio-border text-studio-dim hover:text-white disabled:opacity-25 transition-colors" title={`Redo (${redoStack.length})`}>
          ↪{redoStack.length > 0 ? ` ${redoStack.length}` : ''}
        </button>

        <button onClick={saveToRec}  disabled={!audioBuf || !recId} className="px-2.5 h-7 rounded text-xs font-mono border border-studio-cyan text-studio-cyan hover:bg-studio-cyan/10 disabled:opacity-25 transition-colors">💾 Save</button>
        <button onClick={exportWav}  disabled={!audioBuf}           className="px-2.5 h-7 rounded text-xs font-mono border border-studio-green text-studio-green hover:bg-studio-green/10 disabled:opacity-25 transition-colors">↓ WAV</button>
      </div>

      {/* ── Warp markers toolbar ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-1.5 bg-studio-void border-b border-studio-border/40 shrink-0">
        <span className="font-mono text-xs text-studio-dim uppercase tracking-wider">Warp Markers</span>
        <span className="font-mono text-xs text-studio-muted">Click waveform to place  ·  Drag to offset  ·  Double-click to remove</span>
        <span className="font-mono text-xs" style={{ color: warpMarkers.length ? '#ffe600' : '#333355' }}>
          {warpMarkers.length} marker{warpMarkers.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={applyWarp}
          disabled={!audioBuf || isProcessing || !hasWarpOffset}
          className="px-2.5 h-6 rounded text-xs font-ui font-semibold border border-studio-yellow/50 text-studio-yellow hover:bg-studio-yellow/10 disabled:opacity-25 transition-colors"
        >Apply Warp</button>
        {warpMarkers.length > 0 && (
          <>
            <button onClick={resetWarp} className="px-2 h-6 rounded text-xs font-mono border border-studio-border text-studio-muted hover:text-white transition-colors">Reset Offsets</button>
            <button onClick={clearWarp} className="px-2 h-6 rounded text-xs font-mono border border-studio-border text-studio-muted hover:text-studio-red transition-colors">Clear All</button>
          </>
        )}
      </div>

      {/* ── Processing progress ────────────────────────────────────────────── */}
      {isProcessing && (
        <div className="px-4 py-1.5 shrink-0">
          <div className="h-1 bg-studio-surface rounded-full overflow-hidden">
            <div className="h-full bg-orange-400 animate-pulse rounded-full w-full" />
          </div>
        </div>
      )}

      {/* ── Waveform canvas ────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="px-4 pt-3 pb-1 shrink-0"
        onDoubleClick={(e) => {
          // Double-click empty space to zoom to cursor ± 10%
          if (e.target === e.currentTarget) {
            const r = e.currentTarget.getBoundingClientRect()
            const norm = (e.clientX - r.left) / r.width
            const pos = zoom.start + norm * (zoom.end - zoom.start)
            const span = 0.2
            setZoom({ start: Math.max(0, pos - span / 2), end: Math.min(1, pos + span / 2) })
          }
        }}
        onContextMenu={(e) => { e.preventDefault(); setZoom({ start: 0, end: 1 }) }}
      >
        <div
          className="rounded-xl overflow-hidden border border-studio-border"
          style={{ boxShadow: audioBuf ? '0 0 24px #ff950010' : 'none' }}
        >
          <ElasticCanvas
            sourceBuf={audioBuf}
            resultBuf={resultBuf}
            markers={warpMarkers}
            onMarkers={setWarpMarkers}
            playPos={playPos}
            zoom={zoom}
            width={canvasW - 32}
          />
        </div>

        {/* Canvas legend */}
        <div className="flex items-center gap-5 mt-1 px-1">
          {audioBuf && (
            <>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5" style={{ background: '#00e5ff' }} />
                <span className="font-mono text-studio-muted" style={{ fontSize: 8 }}>Original</span>
              </div>
              {resultBuf && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5" style={{ background: '#00ff9d' }} />
                  <span className="font-mono text-studio-muted" style={{ fontSize: 8 }}>Result (preview)</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5" style={{ background: '#ffe600' }} />
                <span className="font-mono text-studio-muted" style={{ fontSize: 8 }}>Warp marker (output position)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5" style={{ background: '#ffffff44', borderTop: '1px dashed #ffffff66' }} />
                <span className="font-mono text-studio-muted" style={{ fontSize: 8 }}>Anchor (original position)</span>
              </div>
              <span className="font-mono text-studio-muted ml-auto" style={{ fontSize: 8 }}>Right-click → zoom reset · Double-click space → zoom in</span>
            </>
          )}
        </div>
      </div>

      {/* ── Recordings list ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        <div className="flex items-center gap-2 mb-2 mt-2">
          <span className="font-mono text-xs text-studio-dim uppercase tracking-wider">Recordings</span>
          <span className="font-mono text-xs text-studio-muted">click to open</span>
        </div>
        {recordings.length === 0 ? (
          <p className="font-mono text-xs text-studio-muted py-4 text-center">
            No recordings yet. Record audio in Arrange or Edison first.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {recordings.map(rec => (
              <button
                key={rec.id}
                onClick={() => loadRec(rec.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                  recId === rec.id
                    ? 'border-orange-400 bg-studio-surface'
                    : 'border-studio-border hover:border-orange-400/50 hover:bg-studio-surface/50'
                }`}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{
                  background: recId === rec.id ? '#ff9500' : '#333355',
                  boxShadow: recId === rec.id ? '0 0 5px #ff9500' : 'none',
                }} />
                <span className="font-ui text-sm text-studio-text">{rec.name}</span>
                <span className="font-mono text-xs text-studio-muted">{rec.timestamp}</span>
                <span className="font-mono text-xs text-studio-dim ml-auto">{(rec.size / 1024).toFixed(0)} KB</span>
                {recId === rec.id && <span className="font-mono text-xs" style={{ color: '#ff9500' }}>← loaded</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
