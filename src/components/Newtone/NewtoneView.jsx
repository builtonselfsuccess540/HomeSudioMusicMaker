import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  getCtx, onClipsChange, getRecordings,
  getRecordingBuffer, updateRecordingFromBuffer,
} from '../../audio/audioEngine'

/* ── Music theory helpers ─────────────────────────────────────────── */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const SCALES = {
  'Major':       [0, 2, 4, 5, 7, 9, 11],
  'Minor':       [0, 2, 3, 5, 7, 8, 10],
  'Pentatonic':  [0, 2, 4, 7, 9],
  'Minor Pent':  [0, 3, 5, 7, 10],
  'Blues':       [0, 3, 5, 6, 7, 10],
  'Chromatic':   [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  'Dorian':      [0, 2, 3, 5, 7, 9, 10],
  'Mixolydian':  [0, 2, 4, 5, 7, 9, 10],
}

function isScaleNote(midi, scale, root) {
  const intervals = SCALES[scale] || SCALES['Major']
  const pc = ((midi % 12) + 12) % 12
  return intervals.some((i) => ((i + root) % 12) === pc)
}

function nearestScaleNote(midiExact, scale, root) {
  const intervals = SCALES[scale] || SCALES['Major']
  let best = Math.round(midiExact), bestDist = Infinity
  for (let oct = -1; oct <= 1; oct++) {
    const base = Math.floor(midiExact / 12) * 12
    for (const i of intervals) {
      const candidate = base + ((i + root) % 12) + oct * 12
      const dist = Math.abs(candidate - midiExact)
      if (dist < bestDist) { bestDist = dist; best = candidate }
    }
  }
  return best
}

function centsFromNearest(midiExact, scale, root) {
  const nearest = nearestScaleNote(midiExact, scale, root)
  return (midiExact - nearest) * 100
}

/* ── Pitch detection (autocorrelation, chunked async) ─────────────── */

function analyzeChunk(channelData, offset, windowSize, sampleRate) {
  const minFreq = 60, maxFreq = 1000
  const minP = Math.floor(sampleRate / maxFreq)
  const maxP = Math.floor(sampleRate / minFreq)

  let rms = 0
  for (let i = 0; i < windowSize; i++) rms += channelData[offset + i] ** 2
  rms = Math.sqrt(rms / windowSize)

  if (rms < 0.015) return { freq: null, midi: null, midiExact: null, rms }

  let bestCorr = -Infinity, bestP = -1
  const halfWin = Math.floor(windowSize / 2)
  for (let p = minP; p <= Math.min(maxP, halfWin); p++) {
    let corr = 0
    for (let i = 0; i < halfWin; i++) corr += channelData[offset + i] * channelData[offset + i + p]
    if (corr > bestCorr) { bestCorr = corr; bestP = p }
  }

  if (bestP <= 0 || bestCorr <= 0) return { freq: null, midi: null, midiExact: null, rms }
  const freq      = sampleRate / bestP
  const midiExact = 69 + 12 * Math.log2(freq / 440)
  const midi      = Math.round(midiExact)
  return { freq, midi, midiExact, rms }
}

function detectPitchAsync(audioBuffer, onProgress, onDone) {
  const data       = audioBuffer.getChannelData(0)
  const sr         = audioBuffer.sampleRate
  const hopSize    = 1024
  const windowSize = 2048
  const total      = Math.floor((data.length - windowSize) / hopSize)
  const results    = []
  let frame        = 0

  function processChunk() {
    const end = Math.min(frame + 40, total)
    while (frame < end) {
      const t = (frame * hopSize) / sr
      results.push({ time: t, hopSamples: hopSize, ...analyzeChunk(data, frame * hopSize, windowSize, sr) })
      frame++
    }
    onProgress(frame / total)
    if (frame < total) setTimeout(processChunk, 0)
    else onDone(results)
  }
  setTimeout(processChunk, 0)
}

/* ── Pitch correction ─────────────────────────────────────────────── */

function applyCorrection(audioBuffer, frames, scale, root, strength) {
  const c       = getCtx()
  const sr      = audioBuffer.sampleRate
  const input   = audioBuffer.getChannelData(0)
  const output  = new Float32Array(input.length)
  const hopS    = frames[0]?.hopSamples ?? 1024

  frames.forEach((frame, fi) => {
    const startS = fi * hopS
    const endS   = Math.min(startS + hopS, input.length)

    if (!frame.midiExact) {
      for (let i = startS; i < endS; i++) output[i] = input[i]
      return
    }

    const targetMidi = nearestScaleNote(frame.midiExact, scale, root)
    const semitones  = (targetMidi - frame.midiExact) * (strength / 100)
    const ratio      = Math.pow(2, semitones / 12)   // > 1 = pitch up, < 1 = pitch down

    for (let i = 0; i < hopS; i++) {
      const srcFrac = i / ratio
      const srcFloor = Math.floor(srcFrac)
      const frac     = srcFrac - srcFloor
      const si       = startS + srcFloor
      if (si + 1 < input.length) {
        // Linear interpolation for smoother audio
        output[startS + i] = (1 - frac) * input[si] + frac * input[si + 1]
      }
    }
  })

  const newBuf = c.createBuffer(1, output.length, sr)
  newBuf.copyToChannel(output, 0)
  return newBuf
}

/* ── Canvas (piano roll + pitch blobs) ────────────────────────────── */

const NOTE_H      = 12
const PX_PER_SEC  = 100

function PitchCanvas({ frames, scale, root, corrected, audioBuffer, width }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d')

    // Compute visible MIDI range
    const pitched = frames.filter((f) => f.midiExact !== null)
    const minMidi = pitched.length ? Math.max(24, Math.min(...pitched.map((f) => f.midi)) - 3) : 48
    const maxMidi = pitched.length ? Math.min(96, Math.max(...pitched.map((f) => f.midi)) + 4) : 72
    const numNotes = maxMidi - minMidi + 1
    const H = numNotes * NOTE_H
    cv.height = H

    ctx.clearRect(0, 0, width, H)

    // Piano roll background
    for (let m = minMidi; m <= maxMidi; m++) {
      const y = (maxMidi - m) * NOTE_H
      const isB = [1, 3, 6, 8, 10].includes(m % 12)
      const inScale = isScaleNote(m, scale, root)
      ctx.fillStyle = isB ? '#07070f' : (inScale ? '#0c0c22' : '#090914')
      ctx.fillRect(0, y, width, NOTE_H)
    }

    // Horizontal lines
    ctx.strokeStyle = '#111122'; ctx.lineWidth = 1
    for (let m = minMidi; m <= maxMidi; m++) {
      const y = (maxMidi - m) * NOTE_H
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
    }

    // Bar lines (every second)
    ctx.strokeStyle = '#1a1a35'; ctx.lineWidth = 1
    if (audioBuffer) {
      for (let t = 0; t <= audioBuffer.duration; t++) {
        const x = t * PX_PER_SEC
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      }
    }

    // Note name labels on left
    ctx.font = '7px monospace'
    for (let m = minMidi; m <= maxMidi; m++) {
      if (m % 12 === 0) {
        const y = (maxMidi - m) * NOTE_H
        ctx.fillStyle = '#00e5ff66'
        ctx.fillText(NOTE_NAMES[m % 12] + Math.floor(m / 12 - 1), 2, y + NOTE_H - 3)
      }
    }

    if (!frames.length) return

    const showCorrected = corrected && corrected.length > 0

    // Draw pitch blobs
    frames.forEach((frame, fi) => {
      if (!frame.midiExact) return
      const x = frame.time * PX_PER_SEC
      const blobW = Math.max(2, (frame.hopSamples / (audioBuffer?.sampleRate || 44100)) * PX_PER_SEC - 1)

      // Source blob (original detected pitch)
      const absC = Math.abs(centsFromNearest(frame.midiExact, scale, root))
      const color = absC < 20 ? '#00ff9d' : absC < 60 ? '#ffe600' : '#ff2d55'
      const y = (maxMidi - frame.midiExact) * NOTE_H

      if (!showCorrected) {
        ctx.fillStyle = color + 'cc'
        ctx.fillRect(x, y, blobW, NOTE_H - 1)
      } else {
        // Show original faded
        ctx.fillStyle = '#ffffff22'
        ctx.fillRect(x, y, blobW, NOTE_H - 1)
        // Show corrected position in green
        const corrMidi = nearestScaleNote(frame.midiExact, scale, root)
        const cy = (maxMidi - corrMidi) * NOTE_H
        ctx.fillStyle = '#00ff9dcc'
        ctx.fillRect(x, cy, blobW, NOTE_H - 1)
        // Arrow from original to corrected
        if (Math.abs(corrMidi - frame.midiExact) > 0.3) {
          ctx.strokeStyle = '#ffffff44'; ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x + blobW / 2, y + NOTE_H / 2)
          ctx.lineTo(x + blobW / 2, cy + NOTE_H / 2)
          ctx.stroke()
        }
      }
    })
  }, [frames, scale, root, corrected, audioBuffer, width])

  const dur = audioBuffer?.duration ?? 4
  const H   = frames.length
    ? (Math.max(...frames.filter((f) => f.midi).map((f) => f.midi), 72) - Math.min(...frames.filter((f) => f.midi).map((f) => f.midi), 48) + 8) * NOTE_H
    : 24 * NOTE_H

  return (
    <canvas
      ref={canvasRef}
      width={Math.max(width, Math.ceil(dur * PX_PER_SEC) + 20)}
      height={H}
      style={{ display: 'block', minWidth: '100%', height: H }}
    />
  )
}

/* ── Main view ──────────────────────────────────────────────────────── */

export default function NewtoneView() {
  const [recordings,  setRecordings]  = useState(() => getRecordings())
  const [recId,       setRecId]       = useState(null)
  const [audioBuf,    setAudioBuf]    = useState(null)
  const [corrBuf,     setCorrBuf]     = useState(null)
  const [frames,      setFrames]      = useState([])
  const [progress,    setProgress]    = useState(0)
  const [analyzing,   setAnalyzing]   = useState(false)
  const [scale,       setScale]       = useState('Major')
  const [root,        setRoot]        = useState(0)
  const [strength,    setStrength]    = useState(60)
  const [showCorr,    setShowCorr]    = useState(false)
  const [status,      setStatus]      = useState('')
  const [canvasW,     setCanvasW]     = useState(800)
  const previewSrcRef = useRef(null)
  const [isPreviewing,setIsPreviewing]= useState(false)

  const containerRef = useRef(null)

  useEffect(() => onClipsChange(setRecordings), [])

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver((e) => setCanvasW(Math.floor(e[0].contentRect.width) || 800))
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  /* load and analyze */
  const loadRec = useCallback(async (id) => {
    setRecId(id); setStatus('Loading…'); setFrames([]); setCorrBuf(null); setShowCorr(false)
    const buf = await getRecordingBuffer(id)
    if (!buf) { setStatus('Failed to decode'); return }
    setAudioBuf(buf)
    setStatus(`${buf.duration.toFixed(2)} s loaded — analyzing pitch…`)
    setAnalyzing(true); setProgress(0)

    detectPitchAsync(
      buf,
      (p) => setProgress(Math.round(p * 100)),
      (results) => {
        setFrames(results)
        setAnalyzing(false)
        const pitched = results.filter((f) => f.freq)
        setStatus(`Analysis done — ${pitched.length} pitch frames detected`)
      }
    )
  }, [])

  /* apply correction and create corrected buffer */
  const applyCorrection_ = useCallback(() => {
    if (!audioBuf || !frames.length) return
    setStatus('Applying pitch correction…')
    const corrected = applyCorrection(audioBuf, frames, scale, root, strength)
    setCorrBuf(corrected)
    setShowCorr(true)
    setStatus('Correction applied — preview or save')
  }, [audioBuf, frames, scale, root, strength])

  const stopPreview = useCallback(() => {
    if (previewSrcRef.current) { try { previewSrcRef.current.stop() } catch {} previewSrcRef.current = null }
    setIsPreviewing(false)
  }, [])

  /* preview corrected audio */
  const preview = useCallback(() => {
    const buf = showCorr && corrBuf ? corrBuf : audioBuf
    if (!buf) return
    stopPreview()
    const c   = getCtx()
    const src = c.createBufferSource()
    src.buffer = buf
    src.connect(c.destination)
    src.start()
    src.onended = () => { previewSrcRef.current = null; setIsPreviewing(false) }
    previewSrcRef.current = src
    setIsPreviewing(true)
  }, [showCorr, corrBuf, audioBuf, stopPreview])

  useEffect(() => () => stopPreview(), [stopPreview])

  /* save corrected back to recordings list */
  const saveToRec = useCallback(() => {
    if (!corrBuf || !recId) return
    updateRecordingFromBuffer(recId, corrBuf)
    setAudioBuf(corrBuf); setCorrBuf(null); setShowCorr(false)
    setFrames([]); setStatus('Saved — re-analyze to see changes')
  }, [corrBuf, recId])

  const pitched = frames.filter((f) => f.freq)
  const inTune  = pitched.filter((f) => Math.abs(centsFromNearest(f.midiExact, scale, root)) < 20).length
  const pct     = pitched.length ? Math.round(inTune / pitched.length * 100) : 0

  return (
    <div className="flex flex-col h-full bg-studio-void overflow-hidden">

      {/* Title bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-studio-panel border-b border-studio-border shrink-0">
        <span
          className="font-display text-sm font-semibold tracking-widest uppercase"
          style={{ color: '#b44fff', textShadow: '0 0 8px #b44fff66' }}
        >Newtone</span>
        <span className="font-mono text-xs text-studio-dim">Pitch Correction</span>
        <div className="flex-1" />
        {status && <span className="font-mono text-xs text-studio-dim">{status}</span>}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 px-4 py-2 bg-studio-panel border-b border-studio-border flex-wrap shrink-0">
        {/* Scale */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-studio-dim">Scale</span>
          <select
            value={scale} onChange={(e) => { setScale(e.target.value); setCorrBuf(null); setShowCorr(false) }}
            className="bg-studio-void border border-studio-border rounded px-2 py-0.5 text-xs font-mono text-studio-text focus:outline-none focus:border-studio-purple"
          >
            {Object.keys(SCALES).map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Root */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-studio-dim">Root</span>
          <select
            value={root} onChange={(e) => { setRoot(Number(e.target.value)); setCorrBuf(null); setShowCorr(false) }}
            className="bg-studio-void border border-studio-border rounded px-2 py-0.5 text-xs font-mono text-studio-text focus:outline-none focus:border-studio-purple"
          >
            {NOTE_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
          </select>
        </div>

        <div className="w-px h-5 bg-studio-border" />

        {/* Correction speed */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-studio-dim">Strength</span>
          <input
            type="range" min={0} max={100} value={strength}
            onChange={(e) => { setStrength(Number(e.target.value)); setCorrBuf(null); setShowCorr(false) }}
            className="w-24 accent-studio-purple"
          />
          <span className="font-mono text-studio-purple" style={{ fontSize: 9, minWidth: 26 }}>{strength}%</span>
        </div>

        <div className="w-px h-5 bg-studio-border" />

        {/* Actions */}
        <button
          onClick={applyCorrection_}
          disabled={!frames.length || analyzing}
          className="px-3 h-7 rounded text-xs font-ui font-semibold border border-studio-purple text-studio-purple hover:bg-studio-purple/10 disabled:opacity-30 transition-colors"
        >Apply Correction</button>

        <button
          onClick={() => isPreviewing ? stopPreview() : preview()}
          disabled={!audioBuf}
          className={`px-3 h-7 rounded text-xs font-mono border transition-colors disabled:opacity-30 ${
            isPreviewing ? 'border-studio-cyan text-studio-cyan bg-studio-cyan/10' : 'border-studio-border text-studio-dim hover:border-studio-cyan hover:text-studio-cyan'
          }`}
        >{isPreviewing ? '■ Stop' : `▶ Preview${showCorr ? ' (corrected)' : ''}`}</button>

        {showCorr && corrBuf && (
          <button
            onClick={saveToRec}
            className="px-3 h-7 rounded text-xs font-ui font-semibold border border-studio-green text-studio-green hover:bg-studio-green/10 transition-colors"
          >💾 Save Corrected</button>
        )}

        {showCorr && (
          <button
            onClick={() => { setCorrBuf(null); setShowCorr(false) }}
            className="px-2 h-7 rounded text-xs font-mono border border-studio-border text-studio-muted hover:text-white transition-colors"
          >Reset</button>
        )}

        <div className="flex-1" />

        {/* Pitch stats */}
        {frames.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-studio-dim">{pitched.length} frames</span>
            <span className="font-mono text-xs" style={{ color: pct > 80 ? '#00ff9d' : pct > 50 ? '#ffe600' : '#ff2d55' }}>
              {pct}% in tune
            </span>
          </div>
        )}
      </div>

      {/* Legend */}
      {frames.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-1 bg-studio-void border-b border-studio-border/30 shrink-0">
          {[
            { color: '#00ff9d', label: 'In tune (< 20 ¢)' },
            { color: '#ffe600', label: 'Slightly off (< 60 ¢)' },
            { color: '#ff2d55', label: 'Off (> 60 ¢)' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: color + 'cc' }} />
              <span className="font-mono text-studio-muted" style={{ fontSize: 9 }}>{label}</span>
            </div>
          ))}
          {showCorr && (
            <div className="flex items-center gap-1.5 ml-3">
              <div className="w-3 h-3 rounded-sm bg-white/20" />
              <span className="font-mono text-studio-muted" style={{ fontSize: 9 }}>Original</span>
              <div className="w-3 h-3 rounded-sm ml-2" style={{ background: '#00ff9dcc' }} />
              <span className="font-mono text-studio-muted" style={{ fontSize: 9 }}>Corrected position</span>
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      {analyzing && (
        <div className="px-4 py-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-studio-surface rounded-full overflow-hidden">
              <div className="h-full bg-studio-purple transition-all rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <span className="font-mono text-xs text-studio-purple">{progress}%</span>
          </div>
        </div>
      )}

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 overflow-auto px-4 py-3">
        {!audioBuf ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
            <div className="text-5xl opacity-20">♩</div>
            <p className="font-ui text-sm text-studio-dim">Select a recording below to analyze its pitch</p>
          </div>
        ) : frames.length === 0 && !analyzing ? (
          <div className="h-32 flex items-center justify-center">
            <p className="font-mono text-xs text-studio-muted">No pitch data yet</p>
          </div>
        ) : frames.length > 0 ? (
          <div
            className="rounded-xl overflow-auto border border-studio-border"
            style={{ background: '#06060e', maxHeight: 'calc(100% - 80px)' }}
          >
            <PitchCanvas
              frames={frames}
              scale={scale}
              root={root}
              corrected={showCorr ? frames : []}
              audioBuffer={audioBuf}
              width={canvasW - 32}
            />
          </div>
        ) : null}

        {/* Recordings list */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-xs text-studio-dim uppercase tracking-wider">Recordings</span>
            <span className="font-mono text-xs text-studio-muted">click to analyze</span>
          </div>
          {recordings.length === 0 ? (
            <p className="font-mono text-xs text-studio-muted">No recordings yet. Record a vocal take first.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {recordings.map((rec) => (
                <button
                  key={rec.id}
                  onClick={() => loadRec(rec.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                    recId === rec.id
                      ? 'border-studio-purple bg-studio-surface'
                      : 'border-studio-border hover:border-studio-purple/50 hover:bg-studio-surface/50'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: recId === rec.id ? '#b44fff' : '#333355',
                      boxShadow: recId === rec.id ? '0 0 5px #b44fff' : 'none',
                    }}
                  />
                  <span className="font-ui text-sm text-studio-text">{rec.name}</span>
                  <span className="font-mono text-xs text-studio-muted">{rec.timestamp}</span>
                  <span className="font-mono text-xs text-studio-dim ml-auto">{(rec.size / 1024).toFixed(0)} KB</span>
                  {recId === rec.id && <span className="font-mono text-xs text-studio-purple">← loaded</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
