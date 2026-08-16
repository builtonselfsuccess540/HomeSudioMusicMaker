import React, { useState, useRef, useEffect, useCallback } from 'react'
import { getCtx } from '../../audio/audioEngine'

// ─── WAV encoder ─────────────────────────────────────────────────

function encodeWav(buf) {
  const nCh = buf.numberOfChannels
  const sr  = buf.sampleRate
  const len = buf.length
  const pcm = new Float32Array(len * nCh)
  for (let ch = 0; ch < nCh; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) pcm[i * nCh + ch] = d[i]
  }
  const ab   = new ArrayBuffer(44 + pcm.length * 2)
  const view = new DataView(ab)
  const s4   = (o, s) => { for (let i = 0; i < 4; i++) view.setUint8(o + i, s.charCodeAt(i)) }
  s4(0,'RIFF'); view.setUint32(4, 36 + pcm.length*2, true); s4(8,'WAVE')
  s4(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true)
  view.setUint16(22,nCh,true); view.setUint32(24,sr,true)
  view.setUint32(28,sr*nCh*2,true); view.setUint16(32,nCh*2,true); view.setUint16(34,16,true)
  s4(36,'data'); view.setUint32(40,pcm.length*2,true)
  for (let i = 0; i < pcm.length; i++) view.setInt16(44+i*2, Math.max(-1,Math.min(1,pcm[i]))*32767, true)
  return new Blob([ab], { type:'audio/wav' })
}

// ─── Audio helpers ────────────────────────────────────────────────

function generatePeaks(buf, pts = 1200) {
  const data  = buf.getChannelData(0)
  const block = Math.floor(data.length / pts)
  const peaks = []
  for (let i = 0; i < pts; i++) {
    let max = 0
    for (let j = 0; j < block; j++) { const v = Math.abs(data[i*block+j]); if (v > max) max = v }
    peaks.push(max)
  }
  return peaks
}

function applyLoopCrossfade(buf, loopStartSec, loopEndSec, xfadeSec) {
  const sr       = buf.sampleRate
  const fadeLen  = Math.floor(xfadeSec * sr)
  const lsIdx    = Math.floor(loopStartSec * sr)
  const leIdx    = Math.floor(loopEndSec   * sr)
  const regionLen = leIdx - lsIdx
  if (regionLen <= 0) return buf

  const out = getCtx().createBuffer(buf.numberOfChannels, regionLen, sr)
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src  = buf.getChannelData(ch)
    const dest = out.getChannelData(ch)
    // Copy loop region
    for (let i = 0; i < regionLen; i++) dest[i] = src[lsIdx + i]
    if (fadeLen > 0 && fadeLen * 2 < regionLen) {
      // Crossfade: end of region blends into beginning
      for (let i = 0; i < fadeLen; i++) {
        const t  = i / fadeLen
        // Fade out at end, mix in tail from after loop start
        const endIdx   = regionLen - fadeLen + i
        const tailIdx  = i
        dest[endIdx]   = dest[endIdx]  * (1 - t) + dest[tailIdx] * t
        // Fade in at beginning using tail from end
        dest[tailIdx]  = dest[tailIdx] * (1 - t) + src[leIdx - fadeLen + i] * t
      }
    }
  }
  return out
}

function extractRegion(buf, loopStartSec, loopEndSec) {
  const sr  = buf.sampleRate
  const lsI = Math.floor(loopStartSec * sr)
  const leI = Math.min(Math.floor(loopEndSec * sr), buf.length)
  const len = leI - lsI
  if (len <= 0) return null
  const out = getCtx().createBuffer(buf.numberOfChannels, len, sr)
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    out.getChannelData(ch).set(buf.getChannelData(ch).subarray(lsI, leI))
  }
  return out
}

function fmtTime(secs) {
  const m  = Math.floor(secs / 60)
  const s  = Math.floor(secs % 60)
  const ms = Math.floor((secs % 1) * 1000)
  return `${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`
}

function snapToBeat(ratio, duration, bpm) {
  const beatDur   = 60 / bpm
  const timeSec   = ratio * duration
  const snappedSec = Math.round(timeSec / beatDur) * beatDur
  return Math.max(0, Math.min(1, snappedSec / duration))
}

// ─── Waveform canvas ──────────────────────────────────────────────

function WaveformCanvas({ peaks, loopStart, loopEnd, playhead, duration, bpm, snapBeats, onLoopChange, zoom, panOffset }) {
  const canvasRef  = useRef(null)
  const dragging   = useRef(null)
  const dragAnchor = useRef(0)

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width; const H = canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0d0d1a'
    ctx.fillRect(0, 0, W, H)

    if (!peaks || !peaks.length) {
      ctx.fillStyle = '#333'
      ctx.font = '13px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Load an audio file to begin', W/2, H/2)
      return
    }

    // Visible window in ratio space: [panOffset, panOffset + 1/zoom]
    const visStart = panOffset
    const visEnd   = panOffset + 1 / zoom
    const visLen   = visEnd - visStart

    // Beat grid
    if (snapBeats && duration > 0 && bpm > 0) {
      const beatDur = 60 / bpm
      const beatRatio = beatDur / duration
      ctx.strokeStyle = '#1e1e3a'
      ctx.lineWidth   = 1
      let bt = Math.floor(visStart / beatRatio) * beatRatio
      while (bt <= visEnd) {
        const x = (bt - visStart) / visLen * W
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
        bt += beatRatio
      }
      // Bar lines (4 beats per bar)
      const barRatio = beatRatio * 4
      ctx.strokeStyle = '#2a2a4a'
      let bar = Math.floor(visStart / barRatio) * barRatio
      while (bar <= visEnd) {
        const x = (bar - visStart) / visLen * W
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
        bar += barRatio
      }
    }

    // Waveform
    const barsStart = Math.floor(visStart * peaks.length)
    const barsEnd   = Math.ceil(visEnd   * peaks.length)
    const wBW       = W / (barsEnd - barsStart)

    for (let i = barsStart; i < barsEnd; i++) {
      const p     = peaks[i] || 0
      const bH    = Math.max(1, p * (H - 4))
      const ratio = i / peaks.length
      const inLoop = ratio >= loopStart && ratio <= loopEnd
      ctx.fillStyle = inLoop ? '#00e5ffaa' : '#00e5ff33'
      ctx.fillRect((i - barsStart) * wBW, (H - bH)/2, Math.max(1, wBW - 0.3), bH)
    }

    // Loop region highlight
    const lsX = (loopStart - visStart) / visLen * W
    const leX = (loopEnd   - visStart) / visLen * W
    ctx.fillStyle = 'rgba(0,229,255,0.07)'
    ctx.fillRect(lsX, 0, leX - lsX, H)

    // Loop start marker
    ctx.strokeStyle = '#00ff9d'
    ctx.lineWidth   = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(lsX, 0); ctx.lineTo(lsX, H); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#00ff9d'
    ctx.fillRect(lsX - 5, 0, 10, 16)
    ctx.fillStyle = '#000'
    ctx.font = '9px monospace'; ctx.textAlign = 'center'
    ctx.fillText('S', lsX, 11)

    // Loop end marker
    ctx.strokeStyle = '#ff9500'
    ctx.lineWidth   = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(leX, 0); ctx.lineTo(leX, H); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#ff9500'
    ctx.fillRect(leX - 5, 0, 10, 16)
    ctx.fillStyle = '#000'
    ctx.font = '9px monospace'; ctx.textAlign = 'center'
    ctx.fillText('E', leX, 11)

    // Playhead
    if (playhead >= 0) {
      const phX = (playhead - visStart) / visLen * W
      if (phX >= 0 && phX <= W) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth   = 1.5
        ctx.setLineDash([])
        ctx.beginPath(); ctx.moveTo(phX, 0); ctx.lineTo(phX, H); ctx.stroke()
        ctx.fillStyle = '#fff'
        ctx.beginPath(); ctx.arc(phX, 4, 4, 0, Math.PI*2); ctx.fill()
      }
    }
  }, [peaks, loopStart, loopEnd, playhead, duration, bpm, snapBeats, zoom, panOffset])

  // Mouse interaction
  const ratioAt = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const x    = (e.clientX - rect.left) / rect.width
    const vis  = 1 / zoom
    return Math.max(0, Math.min(1, panOffset + x * vis))
  }, [zoom, panOffset])

  const onMouseDown = useCallback((e) => {
    const ratio = ratioAt(e)
    const rect  = canvasRef.current.getBoundingClientRect()
    const pxPerRatio = rect.width * zoom
    const startPx    = (loopStart - panOffset) * pxPerRatio
    const endPx      = (loopEnd   - panOffset) * pxPerRatio
    const clickPx    = (ratio - panOffset) * pxPerRatio

    if (Math.abs(clickPx - startPx) < 10) {
      dragging.current = 'start'
    } else if (Math.abs(clickPx - endPx) < 10) {
      dragging.current = 'end'
    } else {
      dragging.current = 'region'
      dragAnchor.current = ratio
      onLoopChange(ratio, ratio + 0.01)
    }
  }, [ratioAt, loopStart, loopEnd, panOffset, zoom, onLoopChange])

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return
    let r = ratioAt(e)
    if (snapBeats && duration > 0) r = snapToBeat(r, duration, bpm)

    if (dragging.current === 'start') {
      onLoopChange(Math.min(r, loopEnd - 0.001), loopEnd)
    } else if (dragging.current === 'end') {
      onLoopChange(loopStart, Math.max(r, loopStart + 0.001))
    } else {
      const s = Math.min(dragAnchor.current, r)
      const e2 = Math.max(dragAnchor.current, r)
      onLoopChange(s, Math.max(e2, s + 0.001))
    }
  }, [ratioAt, snapBeats, duration, bpm, loopStart, loopEnd, onLoopChange])

  const onMouseUp = () => { dragging.current = null }

  return (
    <canvas
      ref={canvasRef}
      width={1200} height={160}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ display:'block', width:'100%', height:160, cursor:'crosshair' }}
    />
  )
}

// ─── Main view ────────────────────────────────────────────────────

export default function RegionLoopView() {
  const [audioBuf,  setAudioBuf]  = useState(null)
  const [peaks,     setPeaks]     = useState(null)
  const [fileName,  setFileName]  = useState('')
  const [loopStart, setLoopStart] = useState(0.1)
  const [loopEnd,   setLoopEnd]   = useState(0.9)
  const [crossfade, setCrossfade] = useState(0)       // ms
  const [bpm,       setBpm]       = useState(120)
  const [snapBeats, setSnapBeats] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playhead,  setPlayhead]  = useState(-1)
  const [loopCount, setLoopCount] = useState(0)
  const [zoom,      setZoom]      = useState(1)
  const [panOffset, setPanOffset] = useState(0)
  const [status,    setStatus]    = useState('')
  const [volume,    setVolume]    = useState(0.85)

  const srcRef   = useRef(null)
  const gainRef  = useRef(null)
  const rafRef   = useRef(null)
  const playStartRef  = useRef(0)   // ctx.currentTime when play started
  const loopStartRef  = useRef(loopStart)
  const loopEndRef    = useRef(loopEnd)
  const audioBufRef   = useRef(null)
  const loopCountRef  = useRef(0)

  useEffect(() => { loopStartRef.current = loopStart }, [loopStart])
  useEffect(() => { loopEndRef.current   = loopEnd   }, [loopEnd])
  useEffect(() => { audioBufRef.current  = audioBuf  }, [audioBuf])

  // ── Load file ─────────────────────────────────────────────────
  const loadFile = useCallback(async (file) => {
    if (!file) return
    setStatus('Decoding…')
    const ab = await file.arrayBuffer()
    const c  = getCtx()
    c.decodeAudioData(ab, (buf) => {
      setAudioBuf(buf)
      setFileName(file.name)
      setPeaks(generatePeaks(buf))
      setLoopStart(0.0)
      setLoopEnd(1.0)
      setPlayhead(-1)
      setLoopCount(0)
      setStatus('')
    }, () => setStatus('Decode failed'))
  }, [])

  // ── Playback ──────────────────────────────────────────────────
  const stopLoop = useCallback(() => {
    if (srcRef.current) { try { srcRef.current.stop() } catch {} srcRef.current = null }
    if (gainRef.current) { gainRef.current.disconnect(); gainRef.current = null }
    cancelAnimationFrame(rafRef.current)
    setIsPlaying(false)
    setPlayhead(-1)
  }, [])

  const startLoop = useCallback(() => {
    if (!audioBufRef.current) return
    stopLoop()
    const c   = getCtx()
    const buf = audioBufRef.current
    const ls  = loopStartRef.current
    const le  = loopEndRef.current
    const lsT = ls * buf.duration
    const leT = le * buf.duration

    // Optionally bake crossfade for smoother loops
    let loopBuf = buf
    if (crossfade > 0) {
      loopBuf = applyLoopCrossfade(buf, lsT, leT, crossfade / 1000)
    }

    const gain = c.createGain()
    gain.gain.value = volume
    gain.connect(c.destination)
    gainRef.current = gain

    const src = c.createBufferSource()
    src.buffer      = loopBuf
    src.loop        = true
    src.loopStart   = crossfade > 0 ? 0 : lsT
    src.loopEnd     = crossfade > 0 ? loopBuf.duration : leT
    src.connect(gain)
    src.start(0, crossfade > 0 ? 0 : lsT)
    srcRef.current = src

    playStartRef.current = c.currentTime
    loopCountRef.current = 0
    setLoopCount(0)
    setIsPlaying(true)

    const loopDur = leT - lsT

    const tick = () => {
      const elapsed  = c.currentTime - playStartRef.current
      const loops    = Math.floor(elapsed / loopDur)
      const posInLoop = (elapsed % loopDur) / loopDur
      const phRatio  = ls + posInLoop * (le - ls)

      if (loops !== loopCountRef.current) {
        loopCountRef.current = loops
        setLoopCount(loops)
      }
      setPlayhead(phRatio)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [crossfade, volume, stopLoop])

  useEffect(() => { if (gainRef.current) gainRef.current.gain.value = volume }, [volume])

  const togglePlay = () => { if (isPlaying) stopLoop(); else startLoop() }

  useEffect(() => () => stopLoop(), [stopLoop])

  // ── Loop region change ────────────────────────────────────────
  const handleLoopChange = useCallback((s, e) => {
    setLoopStart(s); setLoopEnd(e)
    // If playing, update source loop points in real-time
    if (srcRef.current && audioBufRef.current) {
      const dur = audioBufRef.current.duration
      try {
        srcRef.current.loopStart = s * dur
        srcRef.current.loopEnd   = e * dur
      } catch {}
    }
  }, [])

  // ── Crossfade bake ────────────────────────────────────────────
  const bakeCrossfade = () => {
    if (!audioBuf || crossfade <= 0) return
    const ls = loopStart * audioBuf.duration
    const le = loopEnd   * audioBuf.duration
    const baked = applyLoopCrossfade(audioBuf, ls, le, crossfade / 1000)
    setAudioBuf(baked)
    setPeaks(generatePeaks(baked))
    setLoopStart(0); setLoopEnd(1)
    setStatus('Crossfade baked ✓')
    setTimeout(() => setStatus(''), 2000)
  }

  // ── Export loop region ────────────────────────────────────────
  const exportLoop = () => {
    if (!audioBuf) return
    const region = crossfade > 0
      ? applyLoopCrossfade(audioBuf, loopStart*audioBuf.duration, loopEnd*audioBuf.duration, crossfade/1000)
      : extractRegion(audioBuf, loopStart*audioBuf.duration, loopEnd*audioBuf.duration)
    if (!region) return
    const blob = encodeWav(region)
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${fileName.replace(/\.[^.]+$/,'')}_loop.wav`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Derived values ────────────────────────────────────────────
  const duration   = audioBuf?.duration ?? 0
  const lsTime     = loopStart * duration
  const leTime     = loopEnd   * duration
  const loopLength = leTime - lsTime
  const loopLenBeats = bpm > 0 ? (loopLength / (60 / bpm)).toFixed(2) : '—'

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background:'#09090f', color:'#e0e0e0' }}>

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 flex-wrap"
           style={{ borderColor:'#1a1a2e', background:'#0d0d1a' }}>
        <span className="font-display text-sm tracking-widest uppercase"
              style={{ background:'linear-gradient(90deg,#00ff9d,#00e5ff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Region Loop
        </span>
        <div className="w-px h-4 shrink-0" style={{ background:'#1a1a2e' }} />

        {/* Load */}
        <label className="text-xs px-3 py-1 rounded font-ui cursor-pointer transition-all shrink-0"
               style={{ background:'#1a1a2e', border:'1px solid #2a2a3e', color:'#00ff9d' }}>
          + Load Audio
          <input type="file" accept="audio/*" className="hidden" onChange={e => loadFile(e.target.files[0])} />
        </label>

        {fileName && (
          <span className="text-xs font-mono truncate max-w-48" style={{ color:'#555' }}>{fileName}</span>
        )}

        <div className="w-px h-4 shrink-0" style={{ background:'#1a1a2e' }} />

        {/* BPM */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs font-mono" style={{ color:'#555' }}>BPM</span>
          <input type="number" min={20} max={300} value={bpm}
                 onChange={e => setBpm(Number(e.target.value))}
                 className="w-14 text-xs text-center px-1 py-1 rounded font-mono"
                 style={{ background:'#1a1a2e', border:'1px solid #2a2a3e', color:'#ffe600' }} />
        </div>

        {/* Snap */}
        <button onClick={() => setSnapBeats(v => !v)}
                className="text-xs px-2 py-1 rounded font-ui shrink-0 transition-all"
                style={{ background: snapBeats ? '#ffe60022' : 'transparent',
                         border:`1px solid ${snapBeats ? '#ffe600' : '#1e1e2e'}`,
                         color: snapBeats ? '#ffe600' : '#555' }}>
          ⊞ Snap
        </button>

        {/* Crossfade */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs font-mono" style={{ color:'#555' }}>XFade</span>
          <input type="range" min={0} max={200} step={1} value={crossfade}
                 onChange={e => setCrossfade(Number(e.target.value))}
                 className="w-20" style={{ accentColor:'#b44fff' }} />
          <span className="text-xs font-mono w-10" style={{ color:'#b44fff' }}>{crossfade}ms</span>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs font-mono" style={{ color:'#555' }}>Vol</span>
          <input type="range" min={0} max={1} step={0.01} value={volume}
                 onChange={e => setVolume(Number(e.target.value))}
                 className="w-16" style={{ accentColor:'#00e5ff' }} />
        </div>

        <div className="flex-1" />

        {/* Zoom */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => { setZoom(1); setPanOffset(0) }}
                  className="text-xs px-1.5 py-0.5 rounded font-mono"
                  style={{ background:'#1a1a2e', border:'1px solid #1e1e2e', color:'#555' }}>1×</button>
          {[2,4,8].map(z => (
            <button key={z} onClick={() => { setZoom(z); setPanOffset(Math.max(0, loopStart - 0.1)) }}
                    className="text-xs px-1.5 py-0.5 rounded font-mono transition-all"
                    style={{ background: zoom===z ? '#00e5ff22' : '#1a1a2e',
                             border:`1px solid ${zoom===z ? '#00e5ff' : '#1e1e2e'}`,
                             color: zoom===z ? '#00e5ff' : '#555' }}>{z}×</button>
          ))}
        </div>

        {status && <span className="text-xs font-mono" style={{ color:'#00ff9d' }}>{status}</span>}
      </div>

      {/* Waveform canvas */}
      <div className="px-4 pt-3 pb-0 shrink-0" style={{ background:'#0c0c1a' }}>
        <div className="rounded-lg overflow-hidden" style={{ border:'1px solid #1a1a2e' }}>
          <WaveformCanvas
            peaks={peaks}
            loopStart={loopStart}
            loopEnd={loopEnd}
            playhead={playhead}
            duration={duration}
            bpm={bpm}
            snapBeats={snapBeats}
            onLoopChange={handleLoopChange}
            zoom={zoom}
            panOffset={panOffset}
          />
        </div>
        {/* Pan slider for zoomed view */}
        {zoom > 1 && (
          <input type="range" min={0} max={1 - 1/zoom} step={0.001} value={panOffset}
                 onChange={e => setPanOffset(Number(e.target.value))}
                 className="w-full mt-1" style={{ accentColor:'#00e5ff' }} />
        )}
      </div>

      {/* Loop info bar */}
      <div className="flex items-center gap-6 px-4 py-2 border-t border-b shrink-0"
           style={{ borderColor:'#1a1a2e', background:'#0a0a14' }}>
        <InfoCell label="Loop Start" value={fmtTime(lsTime)} color="#00ff9d" />
        <InfoCell label="Loop End"   value={fmtTime(leTime)} color="#ff9500" />
        <InfoCell label="Length"     value={fmtTime(loopLength)} color="#00e5ff" />
        <InfoCell label="Beats"      value={loopLenBeats} color="#ffe600" />
        <InfoCell label="Loops"      value={loopCount.toString()} color="#b44fff" />
        <div className="flex-1" />
        {isPlaying && (
          <div className="flex gap-1 items-center">
            {[0,1,2,3].map(i => (
              <div key={i} className="w-1 rounded-full animate-pulse"
                   style={{ height: 8 + i * 4, background:'#00ff9d', animationDelay:`${i*0.1}s` }} />
            ))}
            <span className="text-xs font-mono ml-1" style={{ color:'#00ff9d' }}>LOOPING</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0 flex-wrap"
           style={{ background:'#0d0d1a' }}>

        {/* Play/Stop */}
        <button onClick={togglePlay} disabled={!audioBuf}
                className="text-sm px-5 py-2 rounded font-ui font-bold transition-all"
                style={{
                  background: isPlaying ? 'rgba(0,229,255,0.12)' : 'rgba(0,255,157,0.15)',
                  border:`1px solid ${isPlaying ? '#00e5ff' : '#00ff9d'}`,
                  color: !audioBuf ? '#333' : isPlaying ? '#00e5ff' : '#00ff9d',
                  boxShadow: isPlaying ? '0 0 12px rgba(0,255,157,0.3)' : 'none',
                }}>
          {isPlaying ? '■ Stop Loop' : '▶ Play Loop'}
        </button>

        {/* Select all */}
        <button onClick={() => { setLoopStart(0); setLoopEnd(1) }} disabled={!audioBuf}
                className="text-xs px-3 py-2 rounded font-ui transition-all"
                style={{ background:'#1a1a2e', border:'1px solid #2a2a3e', color: audioBuf ? '#888' : '#333' }}>
          Select All
        </button>

        {/* Set start / end at playhead */}
        <button onClick={() => playhead >= 0 && setLoopStart(Math.min(playhead, loopEnd - 0.001))}
                disabled={!isPlaying}
                className="text-xs px-3 py-2 rounded font-ui transition-all"
                style={{ background:'#00ff9d11', border:'1px solid #00ff9d44', color: isPlaying ? '#00ff9d' : '#333' }}>
          Set Start Here
        </button>
        <button onClick={() => playhead >= 0 && setLoopEnd(Math.max(playhead, loopStart + 0.001))}
                disabled={!isPlaying}
                className="text-xs px-3 py-2 rounded font-ui transition-all"
                style={{ background:'#ff950011', border:'1px solid #ff950044', color: isPlaying ? '#ff9500' : '#333' }}>
          Set End Here
        </button>

        {/* Bake crossfade */}
        <button onClick={bakeCrossfade} disabled={!audioBuf || crossfade <= 0}
                className="text-xs px-3 py-2 rounded font-ui transition-all"
                style={{ background:'#b44fff11', border:'1px solid #b44fff44', color: audioBuf && crossfade > 0 ? '#b44fff' : '#333' }}>
          Bake Crossfade
        </button>

        {/* Export */}
        <button onClick={exportLoop} disabled={!audioBuf}
                className="text-xs px-3 py-2 rounded font-ui transition-all"
                style={{ background:'#ffe60011', border:'1px solid #ffe60044', color: audioBuf ? '#ffe600' : '#333' }}>
          Export Loop (.wav)
        </button>

        <div className="flex-1" />

        {/* Tip */}
        <span className="text-xs font-mono" style={{ color:'#333' }}>
          Drag on waveform to set loop region · Green = Start · Orange = End
        </span>
      </div>
    </div>
  )
}

function InfoCell({ label, value, color }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-mono" style={{ color:'#444', fontSize:9 }}>{label}</span>
      <span className="text-sm font-mono font-bold" style={{ color }}>{value}</span>
    </div>
  )
}
