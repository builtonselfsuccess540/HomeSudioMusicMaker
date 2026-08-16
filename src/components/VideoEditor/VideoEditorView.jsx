import React, { useState, useRef, useEffect, useCallback } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_W = 1920
const CANVAS_H = 1080
const TRACK_H = 44
const RULER_H = 26
const HEADER_W = 76

const INITIAL_TRACKS = [
  { id: 'v3', label: 'V3', type: 'video', color: '#b44fff', muted: false, locked: false, visible: true },
  { id: 'v2', label: 'V2', type: 'video', color: '#00e5ff', muted: false, locked: false, visible: true },
  { id: 'v1', label: 'V1', type: 'video', color: '#00ff9d', muted: false, locked: false, visible: true },
  { id: 'a1', label: 'A1', type: 'audio', color: '#ffe600', muted: false, locked: false, visible: true },
  { id: 'a2', label: 'A2', type: 'audio', color: '#ff9500', muted: false, locked: false, visible: true },
]

const TRANSITIONS = ['None', 'Fade', 'Dissolve', 'Wipe ←', 'Wipe →', 'Zoom In', 'Zoom Out', 'Slide Up', 'Slide Down']
const FONT_FAMILIES = ['Arial', 'Impact', 'Georgia', 'Courier New', 'Verdana', 'Trebuchet MS', 'Comic Sans MS']
const BLEND_MODES_GL = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'difference']
const BLEND_LABELS   = ['Normal',        'Multiply', 'Screen', 'Overlay', 'Darken', 'Lighten', 'Color Dodge', 'Color Burn', 'Difference']

// ─── Utilities ────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function formatTC(s) {
  if (!isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const f = Math.floor((s % 1) * 30)
  return [h, m, sec, f].map(n => String(n).padStart(2, '0')).join(':')
}

function formatShort(s) {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

// ─── Canvas Renderer ──────────────────────────────────────────────────────────

function renderFrame(canvas, t, clips, tracks, mediaEls, textLayers) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  for (const trackId of ['v1', 'v2', 'v3']) {
    const track = tracks.find(tr => tr.id === trackId)
    if (!track || !track.visible) continue

    for (const clip of clips) {
      if (clip.trackId !== trackId) continue
      if (t < clip.start || t >= clip.start + clip.duration) continue
      const el = mediaEls[clip.mediaId]
      if (!el) continue

      ctx.save()

      // Opacity + transitions
      let alpha = clip.opacity ?? 1
      const rel = t - clip.start, rem = clip.duration - rel
      if (clip.transIn !== 'None' && rel < (clip.transInDur || 0.5)) alpha *= rel / (clip.transInDur || 0.5)
      if (clip.transOut !== 'None' && rem < (clip.transOutDur || 0.5)) alpha *= rem / (clip.transOutDur || 0.5)
      ctx.globalAlpha = clamp(alpha, 0, 1)

      // Blend mode
      if (clip.blendMode) ctx.globalCompositeOperation = BLEND_MODES_GL[BLEND_LABELS.indexOf(clip.blendMode)] || 'source-over'

      // CSS filters
      const fArr = []
      if ((clip.brightness ?? 100) !== 100) fArr.push(`brightness(${clip.brightness}%)`)
      if ((clip.contrast   ?? 100) !== 100) fArr.push(`contrast(${clip.contrast}%)`)
      if ((clip.saturation ?? 100) !== 100) fArr.push(`saturate(${clip.saturation}%)`)
      if ((clip.hue  ?? 0) !== 0)           fArr.push(`hue-rotate(${clip.hue}deg)`)
      if ((clip.blur ?? 0) > 0)             fArr.push(`blur(${clip.blur}px)`)
      if (clip.grayscale)                   fArr.push('grayscale(100%)')
      if (clip.sepia)                       fArr.push('sepia(80%)')
      if (clip.invert)                      fArr.push('invert(100%)')
      if (fArr.length) ctx.filter = fArr.join(' ')

      // Transform
      const sc = clip.scale ?? 1
      const cx = W / 2 + ((clip.x ?? 0) / 100) * W
      const cy = H / 2 + ((clip.y ?? 0) / 100) * H
      const dw = W * sc, dh = H * sc
      if (clip.rotation) {
        ctx.translate(cx, cy)
        ctx.rotate((clip.rotation * Math.PI) / 180)
        ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh)
      } else {
        ctx.drawImage(el, cx - dw / 2, cy - dh / 2, dw, dh)
      }

      // Vignette
      if (clip.vignette) {
        const grad = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.8)
        grad.addColorStop(0, 'rgba(0,0,0,0)')
        grad.addColorStop(1, 'rgba(0,0,0,0.65)')
        ctx.globalAlpha = 1; ctx.filter = 'none'
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)
      }

      ctx.restore()
    }
  }

  // Text overlays
  for (const tl of textLayers) {
    if (t < tl.start || t >= tl.start + tl.dur) continue
    ctx.save()
    let alpha = 1
    const rel = t - tl.start, rem = tl.dur - rel
    if (tl.animIn === 'Fade In'  && rel < 0.5) alpha = rel / 0.5
    if (tl.animOut === 'Fade Out' && rem < 0.5) alpha = rem / 0.5
    ctx.globalAlpha = alpha

    const px = (tl.x / 100) * W, py = (tl.y / 100) * H
    ctx.font = `${tl.italic ? 'italic ' : ''}${tl.bold ? 'bold ' : ''}${tl.fontSize}px "${tl.fontFamily}", sans-serif`
    ctx.textAlign = tl.align ?? 'center'
    ctx.textBaseline = 'middle'

    if (tl.bg && tl.bg !== 'transparent') {
      const m = ctx.measureText(tl.text)
      const pad = 14
      ctx.fillStyle = tl.bg
      const bx = tl.align === 'center' ? px - m.width / 2 - pad : px - pad
      ctx.fillRect(bx, py - tl.fontSize * 0.7 - pad / 2, m.width + pad * 2, tl.fontSize * 1.4 + pad)
    }
    if ((tl.outlineW ?? 0) > 0) {
      ctx.strokeStyle = tl.outlineColor ?? '#000'
      ctx.lineWidth = tl.outlineW * 2
      ctx.lineJoin = 'round'
      ctx.strokeText(tl.text, px, py)
    }
    if (tl.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 10; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2 }
    ctx.fillStyle = tl.color ?? '#fff'
    ctx.fillText(tl.text, px, py)
    ctx.restore()
  }
}

// ─── Default object factories ─────────────────────────────────────────────────

function defaultClip(mediaItem, trackId, start) {
  return {
    id: uid(), mediaId: mediaItem.id, trackId,
    start, duration: mediaItem.duration ?? 5,
    opacity: 1, volume: 1, speed: 1,
    brightness: 100, contrast: 100, saturation: 100,
    hue: 0, blur: 0, scale: 1,
    x: 0, y: 0, rotation: 0,
    grayscale: false, sepia: false, invert: false, vignette: false,
    blendMode: 'Normal',
    transIn: 'None', transInDur: 0.5,
    transOut: 'None', transOutDur: 0.5,
  }
}

function defaultText(start = 0) {
  return {
    id: uid(), text: 'Your Text Here',
    x: 50, y: 85,
    fontSize: 64, fontFamily: 'Arial',
    bold: true, italic: false,
    color: '#ffffff', outlineColor: '#000000', outlineW: 3,
    bg: 'transparent', shadow: true,
    align: 'center',
    animIn: 'Fade In', animOut: 'Fade Out',
    start, dur: 5,
  }
}

// ─── PropSlider ───────────────────────────────────────────────────────────────

function PropSlider({ label, value, min, max, step = 1, onChange, unit = '', color = '#00e5ff', disabled }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className={disabled ? 'opacity-40' : ''}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs font-mono text-studio-dim">{label}</span>
        <span className="text-xs font-mono" style={{ color }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} disabled={disabled}
        className="w-full h-1 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: color, background: `linear-gradient(to right, ${color} ${pct}%, #252540 0%)` }}
      />
    </div>
  )
}

// ─── Export Modal ─────────────────────────────────────────────────────────────

function ExportModal({ totalDuration, onExport, onClose }) {
  const [fmt, setFmt]   = useState('webm')
  const [fps, setFps]   = useState(30)
  const [qual, setQual] = useState('high')
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-studio-panel border border-studio-border rounded-2xl p-6 w-96 shadow-2xl"
        onClick={e => e.stopPropagation()} style={{ borderTop: '3px solid #00ff9d' }}>
        <div className="font-display text-sm font-semibold text-studio-green mb-1">Export Video</div>
        <div className="text-xs text-studio-dim font-ui mb-5">
          Duration: {formatShort(totalDuration)} · Canvas renders in real-time
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <div className="text-xs font-mono text-studio-dim mb-2 uppercase tracking-wider">Format</div>
            <div className="flex gap-2">
              {[['webm','WebM (VP9)'],['mp4','MP4 (H.264)']].map(([v,l]) => (
                <button key={v} onClick={() => setFmt(v)}
                  className="flex-1 py-2 rounded-xl text-xs font-ui font-semibold border transition-all"
                  style={{ borderColor: fmt===v ? '#00ff9d' : '#252540', color: fmt===v ? '#00ff9d' : '#888899', background: fmt===v ? 'rgba(0,255,157,0.1)' : 'transparent' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-mono text-studio-dim mb-2 uppercase tracking-wider">Frame Rate</div>
            <div className="flex gap-2">
              {[24,30,60].map(f => (
                <button key={f} onClick={() => setFps(f)}
                  className="flex-1 py-2 rounded-xl text-xs font-ui font-semibold border transition-all"
                  style={{ borderColor: fps===f ? '#00e5ff' : '#252540', color: fps===f ? '#00e5ff' : '#888899', background: fps===f ? 'rgba(0,229,255,0.1)' : 'transparent' }}>
                  {f} fps
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-mono text-studio-dim mb-2 uppercase tracking-wider">Quality</div>
            <div className="flex gap-2">
              {[['low','Draft'],['medium','Standard'],['high','High']].map(([v,l]) => (
                <button key={v} onClick={() => setQual(v)}
                  className="flex-1 py-2 rounded-xl text-xs font-ui font-semibold border transition-all"
                  style={{ borderColor: qual===v ? '#b44fff' : '#252540', color: qual===v ? '#b44fff' : '#888899', background: qual===v ? 'rgba(180,79,255,0.1)' : 'transparent' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-studio-void rounded-xl px-4 py-3 text-xs font-mono text-studio-dim">
            Output: 1920×1080 · {fps}fps · {qual === 'high' ? '~10' : qual === 'medium' ? '~5' : '~2'} Mbps
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-ui border border-studio-border text-studio-dim hover:text-white transition-colors">Cancel</button>
          <button onClick={() => onExport(fmt, fps, qual)}
            className="flex-1 py-2 rounded-xl text-sm font-ui font-semibold text-black transition-all"
            style={{ background: 'linear-gradient(135deg,#00ff9d,#00e5ff)', boxShadow: '0 0 16px rgba(0,255,157,0.3)' }}>
            ▶ Render & Export
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VideoEditorView() {

  // ── Project ──────────────────────────────────────────────────────────────
  const [projectName, setProjectName] = useState('Untitled Project')

  // ── Media library ─────────────────────────────────────────────────────────
  const [media, setMedia] = useState([])

  // ── Timeline ──────────────────────────────────────────────────────────────
  const [tracks, setTracks] = useState(INITIAL_TRACKS)
  const [clips,  setClips]  = useState([])
  const [textLayers, setTextLayers] = useState([])
  const [zoom,   setZoom]   = useState(80) // px per second

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selClip, setSelClip] = useState(null)
  const [selText, setSelText] = useState(null)

  // ── Playback ──────────────────────────────────────────────────────────────
  const [playhead, setPlayhead] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const playheadRef    = useRef(0)
  const isPlayingRef   = useRef(false)
  const animRef        = useRef(null)
  const playStartRef   = useRef(null)
  const playPosRef     = useRef(0)
  const totalDurRef    = useRef(10)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [propTab,    setPropTab]    = useState('clip')
  const [mediaTab,   setMediaTab]   = useState('all')
  const [showExport, setShowExport] = useState(false)
  const [exporting,  setExporting]  = useState(false)
  const [exportPct,  setExportPct]  = useState(0)
  const [draggingMedia, setDraggingMedia] = useState(null)
  const [tlHeight,   setTlHeight]   = useState(240)
  const [editingName, setEditingName] = useState(false)
  const [nameInput,   setNameInput]   = useState('Untitled Project')

  // ── Refs ──────────────────────────────────────────────────────────────────
  const canvasRef    = useRef(null)
  const mediaEls     = useRef({})
  const fileInputRef = useRef(null)
  const tlBodyRef    = useRef(null)
  const clipsRef     = useRef(clips)
  const tracksRef    = useRef(tracks)
  const textRef      = useRef(textLayers)

  useEffect(() => { clipsRef.current = clips },       [clips])
  useEffect(() => { tracksRef.current = tracks },     [tracks])
  useEffect(() => { textRef.current = textLayers },   [textLayers])

  // ── Derived ───────────────────────────────────────────────────────────────
  const totalDuration = Math.max(10,
    ...clips.map(c => c.start + c.duration),
    ...textLayers.map(t => t.start + t.dur)
  )
  useEffect(() => { totalDurRef.current = totalDuration }, [totalDuration])

  const selectedClip = clips.find(c => c.id === selClip) ?? null
  const selectedText = textLayers.find(t => t.id === selText) ?? null

  // ── Media import ──────────────────────────────────────────────────────────

  const importFile = useCallback(async (file) => {
    const id  = uid()
    const src = URL.createObjectURL(file)
    const name = file.name
    const isVideo = file.type.startsWith('video/')
    const isAudio = file.type.startsWith('audio/')
    const isImage = file.type.startsWith('image/')

    if (isVideo) {
      const vid = document.createElement('video')
      vid.src = src; vid.preload = 'auto'; vid.crossOrigin = 'anonymous'
      await new Promise(res => { vid.onloadedmetadata = res; vid.onerror = res })
      let thumbnail = ''
      try {
        const tc = document.createElement('canvas'); tc.width = 320; tc.height = 180
        vid.currentTime = Math.min(0.5, vid.duration * 0.05)
        await new Promise(res => { vid.onseeked = res; setTimeout(res, 800) })
        tc.getContext('2d').drawImage(vid, 0, 0, 320, 180)
        thumbnail = tc.toDataURL(); vid.currentTime = 0
      } catch {}
      mediaEls.current[id] = vid
      setMedia(prev => [...prev, { id, name, type: 'video', src, thumbnail, duration: vid.duration || 10, width: vid.videoWidth || 1920, height: vid.videoHeight || 1080 }])
    } else if (isAudio) {
      const aud = document.createElement('audio'); aud.src = src; aud.preload = 'auto'
      await new Promise(res => { aud.onloadedmetadata = res; aud.onerror = res })
      mediaEls.current[id] = aud
      setMedia(prev => [...prev, { id, name, type: 'audio', src, thumbnail: '', duration: aud.duration || 30 }])
    } else if (isImage) {
      const img = new Image(); img.src = src
      await new Promise(res => { img.onload = res; img.onerror = res })
      mediaEls.current[id] = img
      setMedia(prev => [...prev, { id, name, type: 'image', src, thumbnail: src, duration: 5, width: img.width, height: img.height }])
    }
  }, [])

  const handleFiles = useCallback((files) => {
    Array.from(files).forEach(importFile)
  }, [importFile])

  // ── Playback engine ───────────────────────────────────────────────────────

  const doRender = useCallback((t) => {
    renderFrame(canvasRef.current, t, clipsRef.current, tracksRef.current, mediaEls.current, textRef.current)
  }, [])

  const syncVideoEls = useCallback((t) => {
    for (const clip of clipsRef.current) {
      if (clip.trackId.startsWith('a')) continue
      const el = mediaEls.current[clip.mediaId]
      if (!(el instanceof HTMLVideoElement)) continue
      if (t >= clip.start && t < clip.start + clip.duration) {
        const target = t - clip.start
        if (Math.abs(el.currentTime - target) > 0.15) el.currentTime = target
      }
    }
  }, [])

  const seek = useCallback((t) => {
    t = clamp(t, 0, totalDurRef.current)
    playheadRef.current = t
    setPlayhead(t)
    syncVideoEls(t)
    doRender(t)
  }, [doRender, syncVideoEls])

  const pause = useCallback(() => {
    isPlayingRef.current = false
    setIsPlaying(false)
    cancelAnimationFrame(animRef.current)
    Object.values(mediaEls.current).forEach(el => {
      if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) el.pause()
    })
  }, [])

  const play = useCallback(() => {
    isPlayingRef.current = true
    setIsPlaying(true)
    playStartRef.current = performance.now()
    playPosRef.current = playheadRef.current

    // Start relevant video/audio clips
    for (const clip of clipsRef.current) {
      const t = playheadRef.current
      if (t >= clip.start && t < clip.start + clip.duration) {
        const el = mediaEls.current[clip.mediaId]
        if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
          el.currentTime = t - clip.start
          el.play().catch(() => {})
        }
      }
    }

    const loop = () => {
      if (!isPlayingRef.current) return
      const elapsed = (performance.now() - playStartRef.current) / 1000
      const t = clamp(playPosRef.current + elapsed, 0, totalDurRef.current)
      playheadRef.current = t
      setPlayhead(t)
      renderFrame(canvasRef.current, t, clipsRef.current, tracksRef.current, mediaEls.current, textRef.current)
      if (t >= totalDurRef.current) { pause(); return }
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
  }, [pause])

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) pause(); else play()
  }, [play, pause])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      if (e.code === 'ArrowLeft') { e.preventDefault(); seek(Math.max(0, playheadRef.current - 1/30)) }
      if (e.code === 'ArrowRight') { e.preventDefault(); seek(Math.min(totalDurRef.current, playheadRef.current + 1/30)) }
      if (e.code === 'Home') { e.preventDefault(); seek(0) }
      if (e.code === 'End') { e.preventDefault(); seek(totalDurRef.current) }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selClip || selText)) {
        e.preventDefault()
        if (selClip) { setClips(p => p.filter(c => c.id !== selClip)); setSelClip(null) }
        if (selText) { setTextLayers(p => p.filter(t => t.id !== selText)); setSelText(null) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [togglePlay, seek, selClip, selText])

  // initial render
  useEffect(() => { doRender(0) }, [doRender])

  // ── Clip update helpers ───────────────────────────────────────────────────

  const updateClip = useCallback((id, patch) => {
    setClips(p => p.map(c => c.id === id ? { ...c, ...patch } : c))
  }, [])

  const updateText = useCallback((id, patch) => {
    setTextLayers(p => p.map(t => t.id === id ? { ...t, ...patch } : t))
  }, [])

  // ── Timeline interaction ──────────────────────────────────────────────────

  const onTimelineClick = useCallback((e) => {
    if (!tlBodyRef.current) return
    const rect = tlBodyRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - HEADER_W + (tlBodyRef.current.scrollLeft || 0)
    seek(Math.max(0, x / zoom))
  }, [seek, zoom])

  const onClipMouseDown = useCallback((e, clipId) => {
    e.stopPropagation()
    setSelClip(clipId); setSelText(null)
    const clip = clipsRef.current.find(c => c.id === clipId)
    if (!clip) return
    const startX = e.clientX, startStart = clip.start
    const isLocked = tracksRef.current.find(t => t.id === clip.trackId)?.locked

    if (isLocked) return

    const onMove = (me) => {
      const dt = (me.clientX - startX) / zoom
      const newStart = Math.max(0, startStart + dt)
      setClips(p => p.map(c => c.id === clipId ? { ...c, start: newStart } : c))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [zoom])

  const onRightTrimMouseDown = useCallback((e, clipId) => {
    e.stopPropagation()
    const clip = clipsRef.current.find(c => c.id === clipId)
    if (!clip) return
    const startX = e.clientX, startDur = clip.duration
    const med = media.find(m => m.id === clip.mediaId)
    const maxDur = med?.duration ?? 9999

    const onMove = (me) => {
      const dt = (me.clientX - startX) / zoom
      const newDur = clamp(startDur + dt, 0.5, maxDur)
      setClips(p => p.map(c => c.id === clipId ? { ...c, duration: newDur } : c))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [zoom, media])

  const onDropToTrack = useCallback((e, trackId) => {
    e.preventDefault()
    if (!draggingMedia) return
    const mediaItem = media.find(m => m.id === draggingMedia)
    if (!mediaItem) return

    // Validate media type vs track type
    const track = tracks.find(t => t.id === trackId)
    if (!track) return
    const isAudioMedia = mediaItem.type === 'audio'
    const isAudioTrack = track.type === 'audio'
    if (isAudioMedia !== isAudioTrack && mediaItem.type !== 'image') return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const start = Math.max(0, x / zoom)
    setClips(p => [...p, defaultClip(mediaItem, trackId, start)])
    setDraggingMedia(null)
    doRender(playheadRef.current)
  }, [draggingMedia, media, tracks, zoom, doRender])

  const onRulerClick = useCallback((e) => {
    if (!tlBodyRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    seek(Math.max(0, x / zoom))
  }, [seek, zoom])

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async (fmt, fps, qual) => {
    setShowExport(false)
    setExporting(true)
    setExportPct(0)
    pause()

    try {
      const canvas = canvasRef.current
      const stream = canvas.captureStream(fps)

      // Add audio from audio clips via Web Audio
      const audioBits = qual === 'high' ? 192000 : qual === 'medium' ? 128000 : 64000
      const videoBits = qual === 'high' ? 8000000 : qual === 'medium' ? 4000000 : 1500000
      const mimeType = fmt === 'mp4' ? 'video/mp4;codecs=mp4a.40.2,avc1.42e01e' : 'video/webm;codecs=vp9,opus'
      const mime = MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm'

      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: videoBits, audioBitsPerSecond: audioBits })
      const chunks = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mime })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${projectName.replace(/[^a-z0-9]/gi,'_')}.${fmt === 'mp4' ? 'webm' : 'webm'}`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setExporting(false); setExportPct(0)
      }

      recorder.start(100)

      // Drive playback frame by frame
      let t = 0
      const dur = totalDurRef.current
      const frameTime = 1 / fps

      const renderLoop = () => {
        if (t > dur) { recorder.stop(); return }
        renderFrame(canvas, t, clipsRef.current, tracksRef.current, mediaEls.current, textRef.current)
        setExportPct(Math.min(99, Math.round((t / dur) * 100)))
        t += frameTime
        setTimeout(renderLoop, 0)
      }
      renderLoop()
    } catch (err) {
      alert(`Export failed: ${err.message}`)
      setExporting(false)
    }
  }, [pause, projectName])

  // ── Timeline ruler ticks ──────────────────────────────────────────────────

  const rulerTicks = useCallback((dur, zoomPx) => {
    const total = Math.ceil(dur) + 5
    // Choose interval based on zoom
    const intervals = [0.5, 1, 2, 5, 10, 15, 30, 60, 120]
    const minPx = 60
    const interval = intervals.find(i => i * zoomPx >= minPx) || 120
    const ticks = []
    for (let s = 0; s <= total; s += interval) {
      ticks.push({ s, px: s * zoomPx, label: formatShort(s) })
    }
    return ticks
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  const filteredMedia = mediaTab === 'all' ? media
    : media.filter(m => m.type === mediaTab)

  const trackBodyWidth = Math.max(totalDuration * zoom + 400, 800)

  return (
    <div className="flex flex-col h-full bg-studio-void overflow-hidden select-none">

      {/* ─── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-studio-panel border-b border-studio-border shrink-0 flex-wrap">
        {/* Project name */}
        {editingName ? (
          <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)}
            onBlur={() => { setProjectName(nameInput || 'Untitled'); setEditingName(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { setProjectName(nameInput); setEditingName(false) } }}
            className="bg-studio-void border border-studio-cyan rounded px-2 py-0.5 text-sm font-display font-semibold text-studio-text focus:outline-none w-44"
          />
        ) : (
          <button onClick={() => { setNameInput(projectName); setEditingName(true) }}
            className="font-display text-sm font-semibold text-studio-text hover:text-studio-cyan transition-colors">
            {projectName} ✎
          </button>
        )}

        <div className="w-px h-4 bg-studio-border" />

        {/* Import */}
        <button onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:border-studio-cyan hover:text-studio-cyan transition-colors">
          ↑ Import
        </button>
        <input ref={fileInputRef} type="file" multiple accept="video/*,audio/*,image/*"
          className="hidden" onChange={e => handleFiles(e.target.files)} />

        <div className="w-px h-4 bg-studio-border" />

        {/* Tool buttons */}
        {[
          { icon: '✦', label: 'Add Text', action: () => { const tl = defaultText(playheadRef.current); setTextLayers(p => [...p, tl]); setSelText(tl.id); setSelClip(null); setPropTab('text') } },
        ].map(btn => (
          <button key={btn.label} onClick={btn.action}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:border-studio-purple hover:text-studio-purple transition-colors">
            {btn.icon} {btn.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Zoom */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => setZoom(z => Math.max(10, z / 1.5))} className="w-6 h-6 rounded border border-studio-border text-studio-dim hover:text-white flex items-center justify-center text-xs">−</button>
          <span className="text-xs font-mono text-studio-dim w-14 text-center">{zoom}px/s</span>
          <button onClick={() => setZoom(z => Math.min(400, z * 1.5))} className="w-6 h-6 rounded border border-studio-border text-studio-dim hover:text-white flex items-center justify-center text-xs">+</button>
        </div>

        <div className="w-px h-4 bg-studio-border" />

        {exporting ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded border border-studio-green text-studio-green text-xs font-mono">
            <div className="w-3 h-3 rounded-full border-2 border-studio-green border-t-transparent animate-spin" />
            {exportPct}%
          </div>
        ) : (
          <button onClick={() => setShowExport(true)}
            className="px-4 py-1.5 rounded text-xs font-ui font-semibold text-black transition-all"
            style={{ background: 'linear-gradient(135deg,#00ff9d,#00e5ff)', boxShadow: '0 0 12px rgba(0,255,157,0.2)' }}>
            ▶ Export
          </button>
        )}
      </div>

      {/* ─── Main area ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Media Browser ─────────────────────────────────────────────── */}
        <div className="w-52 shrink-0 flex flex-col border-r border-studio-border bg-studio-panel">
          <div className="px-3 pt-2 pb-1 border-b border-studio-border">
            <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">Media Browser</div>
            <div className="flex gap-1 flex-wrap">
              {[['all','All'],['video','Video'],['audio','Audio'],['image','Image']].map(([v,l]) => (
                <button key={v} onClick={() => setMediaTab(v)}
                  className="px-2 py-0.5 rounded text-xs font-ui font-semibold border transition-all"
                  style={{
                    borderColor: mediaTab===v ? '#00e5ff' : '#252540',
                    color: mediaTab===v ? '#00e5ff' : '#888899',
                    background: mediaTab===v ? 'rgba(0,229,255,0.1)' : 'transparent',
                  }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
            {filteredMedia.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-2 opacity-40">
                <div className="text-3xl">🎬</div>
                <div className="text-xs font-ui text-studio-dim">Import media to start</div>
              </div>
            )}
            {filteredMedia.map(m => (
              <div key={m.id}
                draggable
                onDragStart={() => setDraggingMedia(m.id)}
                onDragEnd={() => setDraggingMedia(null)}
                className="rounded-lg border border-studio-border hover:border-studio-cyan/60 overflow-hidden cursor-grab active:cursor-grabbing transition-all hover:bg-studio-cyan/5"
              >
                {m.thumbnail ? (
                  <div className="relative">
                    <img src={m.thumbnail} alt={m.name} className="w-full aspect-video object-cover" style={{ maxHeight: 72 }} />
                    {m.type === 'video' && (
                      <div className="absolute bottom-1 right-1 px-1 rounded text-xs font-mono bg-black/70 text-studio-cyan">{formatShort(m.duration)}</div>
                    )}
                    {m.type === 'audio' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-studio-void/80">
                        <div className="text-2xl">🎵</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full flex items-center justify-center bg-studio-void" style={{ height: 48 }}>
                    <span className="text-xl">{m.type === 'audio' ? '🎵' : '📄'}</span>
                  </div>
                )}
                <div className="px-2 py-1">
                  <div className="text-xs font-ui text-studio-text truncate">{m.name}</div>
                  <div className="text-xs font-mono text-studio-dim">{m.type} · {formatShort(m.duration)}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-2 border-t border-studio-border">
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 rounded-lg border border-dashed border-studio-border text-xs font-ui text-studio-dim hover:border-studio-cyan hover:text-studio-cyan transition-colors text-center">
              + Import Media
            </button>
          </div>
        </div>

        {/* ── Preview Monitor ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-black border-r border-studio-border">
          {/* Canvas */}
          <div className="flex-1 min-h-0 flex items-center justify-center bg-black p-2">
            <div className="relative w-full" style={{ maxHeight: '100%', aspectRatio: '16/9' }}>
              <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
                className="w-full h-full object-contain"
                style={{ display: 'block', background: '#000' }}
              />
              {/* Timecode overlay */}
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded font-mono text-xs bg-black/70 text-studio-cyan"
                style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatTC(playhead)}
              </div>
            </div>
          </div>

          {/* Transport */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-t border-studio-border bg-studio-panel">
            {/* Timecode */}
            <div className="font-mono text-sm text-studio-cyan mr-2" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 100 }}>
              {formatTC(playhead)}
            </div>

            {/* Controls */}
            <button onClick={() => seek(0)} className="w-7 h-7 flex items-center justify-center rounded text-studio-dim hover:text-white transition-colors text-sm">⏮</button>
            <button onClick={() => seek(Math.max(0, playheadRef.current - 1/30))} className="w-7 h-7 flex items-center justify-center rounded text-studio-dim hover:text-white transition-colors text-sm">◀</button>
            <button onClick={togglePlay}
              className="w-9 h-9 flex items-center justify-center rounded-full text-black font-bold text-base transition-all"
              style={{ background: isPlaying ? '#ff2d55' : 'linear-gradient(135deg,#00e5ff,#b44fff)', boxShadow: '0 0 12px rgba(0,229,255,0.3)' }}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button onClick={() => seek(Math.min(totalDuration, playheadRef.current + 1/30))} className="w-7 h-7 flex items-center justify-center rounded text-studio-dim hover:text-white transition-colors text-sm">▶</button>
            <button onClick={() => seek(totalDuration)} className="w-7 h-7 flex items-center justify-center rounded text-studio-dim hover:text-white transition-colors text-sm">⏭</button>

            {/* Mini progress bar */}
            <div className="flex-1 mx-2">
              <div className="relative h-1.5 bg-studio-border rounded-full cursor-pointer"
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  seek((e.clientX - rect.left) / rect.width * totalDuration)
                }}>
                <div className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-studio-cyan to-studio-purple"
                  style={{ width: `${(playhead / totalDuration) * 100}%` }} />
              </div>
            </div>

            <div className="font-mono text-xs text-studio-dim" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatTC(totalDuration)}
            </div>

            {/* Speed */}
            <select className="bg-studio-void border border-studio-border rounded px-2 py-1 text-xs font-mono text-studio-dim focus:outline-none ml-2"
              onChange={e => {
                // Apply speed to selected clip
                if (selClip) updateClip(selClip, { speed: Number(e.target.value) })
              }}
              value={selectedClip?.speed ?? 1}>
              {[0.25,0.5,0.75,1,1.25,1.5,2,4].map(s => (
                <option key={s} value={s}>{s}×</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Properties Panel ───────────────────────────────────────────── */}
        <div className="w-64 shrink-0 flex flex-col border-l border-studio-border bg-studio-panel overflow-y-auto">
          {/* Tab bar */}
          <div className="flex border-b border-studio-border shrink-0 overflow-x-auto">
            {[
              { id: 'clip', label: 'Clip', icon: '▦' },
              { id: 'color', label: 'Color', icon: '◉' },
              { id: 'effects', label: 'FX', icon: '✦' },
              { id: 'text', label: 'Text', icon: 'T' },
            ].map(t => (
              <button key={t.id} onClick={() => setPropTab(t.id)}
                className="flex items-center gap-1 px-3 py-2 text-xs font-ui font-semibold transition-colors whitespace-nowrap"
                style={{
                  color: propTab === t.id ? '#00e5ff' : '#888899',
                  borderBottom: propTab === t.id ? '2px solid #00e5ff' : '2px solid transparent',
                }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 p-3 flex flex-col gap-4 overflow-y-auto">

            {/* ── Clip tab ─────────────────────────────────── */}
            {propTab === 'clip' && (
              <>
                {selectedClip ? (
                  <>
                    <div>
                      <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">Position</div>
                      <div className="flex flex-col gap-2.5">
                        <PropSlider label="X" value={selectedClip.x ?? 0} min={-50} max={50} step={0.5} unit="%" color="#00e5ff"
                          onChange={v => updateClip(selClip, { x: v })} />
                        <PropSlider label="Y" value={selectedClip.y ?? 0} min={-50} max={50} step={0.5} unit="%" color="#00e5ff"
                          onChange={v => updateClip(selClip, { y: v })} />
                        <PropSlider label="Scale" value={Math.round((selectedClip.scale ?? 1) * 100)} min={10} max={300} unit="%" color="#b44fff"
                          onChange={v => updateClip(selClip, { scale: v / 100 })} />
                        <PropSlider label="Rotation" value={selectedClip.rotation ?? 0} min={-180} max={180} unit="°" color="#ffe600"
                          onChange={v => updateClip(selClip, { rotation: v })} />
                        <PropSlider label="Opacity" value={Math.round((selectedClip.opacity ?? 1) * 100)} min={0} max={100} unit="%" color="#00ff9d"
                          onChange={v => updateClip(selClip, { opacity: v / 100 })} />
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">Transitions</div>
                      <div className="flex flex-col gap-2">
                        <div>
                          <div className="text-xs font-mono text-studio-dim mb-1">In</div>
                          <select value={selectedClip.transIn} onChange={e => updateClip(selClip, { transIn: e.target.value })}
                            className="w-full bg-studio-void border border-studio-border rounded-lg px-2 py-1.5 text-xs font-ui text-studio-text focus:outline-none focus:border-studio-cyan">
                            {TRANSITIONS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        {selectedClip.transIn !== 'None' && (
                          <PropSlider label="In Duration" value={selectedClip.transInDur ?? 0.5} min={0.1} max={3} step={0.1} unit="s" color="#00e5ff"
                            onChange={v => updateClip(selClip, { transInDur: v })} />
                        )}
                        <div>
                          <div className="text-xs font-mono text-studio-dim mb-1">Out</div>
                          <select value={selectedClip.transOut} onChange={e => updateClip(selClip, { transOut: e.target.value })}
                            className="w-full bg-studio-void border border-studio-border rounded-lg px-2 py-1.5 text-xs font-ui text-studio-text focus:outline-none focus:border-studio-cyan">
                            {TRANSITIONS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        {selectedClip.transOut !== 'None' && (
                          <PropSlider label="Out Duration" value={selectedClip.transOutDur ?? 0.5} min={0.1} max={3} step={0.1} unit="s" color="#b44fff"
                            onChange={v => updateClip(selClip, { transOutDur: v })} />
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">Blend Mode</div>
                      <select value={selectedClip.blendMode ?? 'Normal'} onChange={e => updateClip(selClip, { blendMode: e.target.value })}
                        className="w-full bg-studio-void border border-studio-border rounded-lg px-2 py-1.5 text-xs font-ui text-studio-text focus:outline-none focus:border-studio-cyan">
                        {BLEND_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">Timing</div>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-studio-dim">Start</span>
                          <span className="text-studio-cyan">{formatShort(selectedClip.start)}</span>
                        </div>
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-studio-dim">Duration</span>
                          <span className="text-studio-cyan">{formatShort(selectedClip.duration)}</span>
                        </div>
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-studio-dim">End</span>
                          <span className="text-studio-cyan">{formatShort(selectedClip.start + selectedClip.duration)}</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => { setClips(p => p.filter(c => c.id !== selClip)); setSelClip(null) }}
                      className="w-full py-2 rounded-xl border border-studio-red/40 text-studio-red text-xs font-ui font-semibold hover:bg-studio-red/10 transition-colors">
                      ✕ Delete Clip
                    </button>
                  </>
                ) : (
                  <div className="text-xs font-ui text-studio-dim text-center py-6 opacity-50">Select a clip to edit properties</div>
                )}
              </>
            )}

            {/* ── Color tab ─────────────────────────────────── */}
            {propTab === 'color' && (
              <>
                {selectedClip ? (
                  <>
                    <div className="flex flex-col gap-2.5">
                      <PropSlider label="Brightness" value={selectedClip.brightness ?? 100} min={0} max={200} color="#ffe600"
                        onChange={v => { updateClip(selClip, { brightness: v }); doRender(playheadRef.current) }} />
                      <PropSlider label="Contrast" value={selectedClip.contrast ?? 100} min={0} max={200} color="#ff9500"
                        onChange={v => { updateClip(selClip, { contrast: v }); doRender(playheadRef.current) }} />
                      <PropSlider label="Saturation" value={selectedClip.saturation ?? 100} min={0} max={300} color="#00ff9d"
                        onChange={v => { updateClip(selClip, { saturation: v }); doRender(playheadRef.current) }} />
                      <PropSlider label="Hue Rotate" value={selectedClip.hue ?? 0} min={-180} max={180} unit="°" color="#b44fff"
                        onChange={v => { updateClip(selClip, { hue: v }); doRender(playheadRef.current) }} />
                      <PropSlider label="Blur" value={selectedClip.blur ?? 0} min={0} max={20} step={0.5} unit="px" color="#00e5ff"
                        onChange={v => { updateClip(selClip, { blur: v }); doRender(playheadRef.current) }} />
                    </div>
                    {/* Presets */}
                    <div>
                      <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">LUT Presets</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { name: 'Cinematic', patch: { contrast: 120, saturation: 85, brightness: 95 } },
                          { name: 'Warm', patch: { hue: 15, saturation: 120, brightness: 105 } },
                          { name: 'Cold', patch: { hue: -20, saturation: 90, brightness: 105 } },
                          { name: 'Vintage', patch: { saturation: 70, contrast: 110, sepia: true } },
                          { name: 'B&W', patch: { grayscale: true, contrast: 115 } },
                          { name: 'Pop', patch: { saturation: 160, contrast: 115, brightness: 105 } },
                          { name: 'Matte', patch: { contrast: 90, brightness: 108, saturation: 90 } },
                          { name: 'Reset', patch: { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, grayscale: false, sepia: false, invert: false } },
                        ].map(p => (
                          <button key={p.name}
                            onClick={() => { updateClip(selClip, p.patch); doRender(playheadRef.current) }}
                            className="py-1.5 rounded border border-studio-border text-xs font-ui text-studio-dim hover:border-studio-yellow hover:text-studio-yellow transition-colors">
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-xs font-ui text-studio-dim text-center py-6 opacity-50">Select a video clip to color grade</div>
                )}
              </>
            )}

            {/* ── Effects tab ───────────────────────────────── */}
            {propTab === 'effects' && (
              <>
                {selectedClip ? (
                  <>
                    <div>
                      <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">Visual Effects</div>
                      <div className="flex flex-col gap-2">
                        {[
                          { key: 'grayscale', label: 'Grayscale', color: '#888899' },
                          { key: 'sepia',     label: 'Sepia',     color: '#c0a060' },
                          { key: 'invert',    label: 'Invert',    color: '#b44fff' },
                          { key: 'vignette',  label: 'Vignette',  color: '#444460' },
                        ].map(fx => (
                          <button key={fx.key}
                            onClick={() => { updateClip(selClip, { [fx.key]: !selectedClip[fx.key] }); doRender(playheadRef.current) }}
                            className="flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-xs font-ui font-semibold"
                            style={{
                              borderColor: selectedClip[fx.key] ? fx.color : '#252540',
                              background: selectedClip[fx.key] ? fx.color + '15' : 'transparent',
                              color: selectedClip[fx.key] ? fx.color : '#888899',
                            }}>
                            {fx.label}
                            <span style={{ opacity: 0.6 }}>{selectedClip[fx.key] ? 'ON' : 'OFF'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">Motion</div>
                      <div className="flex flex-col gap-2.5">
                        <PropSlider label="Speed" value={selectedClip.speed ?? 1} min={0.1} max={4} step={0.05} unit="×" color="#ff9500"
                          onChange={v => updateClip(selClip, { speed: v })} />
                        <PropSlider label="Volume" value={Math.round((selectedClip.volume ?? 1) * 100)} min={0} max={150} unit="%" color="#ffe600"
                          onChange={v => updateClip(selClip, { volume: v / 100 })} />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-xs font-ui text-studio-dim text-center py-6 opacity-50">Select a clip to apply effects</div>
                )}
              </>
            )}

            {/* ── Text tab ─────────────────────────────────── */}
            {propTab === 'text' && (
              <>
                <div>
                  <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">Text Presets</div>
                  <div className="flex flex-col gap-1">
                    {[
                      { name: '🎬 Big Title',    props: { fontSize: 96, bold: true, y: 50, outlineW: 4 } },
                      { name: '📺 Lower Third',  props: { fontSize: 36, bold: true, y: 85, bg: 'rgba(0,0,0,0.65)', outlineW: 0 } },
                      { name: '💬 Subtitle',     props: { fontSize: 42, bold: false, y: 88, outlineW: 2 } },
                      { name: '⬛ Caption',      props: { fontSize: 28, bold: false, y: 92, bg: 'rgba(0,0,0,0.75)', outlineW: 0 } },
                      { name: '🌊 Watermark',    props: { fontSize: 24, bold: false, color: 'rgba(255,255,255,0.35)', outlineW: 0, shadow: false } },
                    ].map(p => (
                      <button key={p.name}
                        onClick={() => {
                          const tl = { ...defaultText(playheadRef.current), ...p.props }
                          setTextLayers(prev => [...prev, tl])
                          setSelText(tl.id); setSelClip(null)
                        }}
                        className="text-left px-3 py-2 rounded-lg border border-studio-border text-xs font-ui text-studio-dim hover:border-studio-purple hover:text-studio-text transition-colors">
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedText && (
                  <>
                    <div className="border-t border-studio-border pt-3">
                      <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">Edit Text</div>
                      <textarea rows={2} value={selectedText.text}
                        onChange={e => updateText(selText, { text: e.target.value })}
                        className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2 text-sm font-ui text-studio-text focus:outline-none focus:border-studio-purple resize-none" />
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <PropSlider label="Font Size" value={selectedText.fontSize} min={12} max={200} color="#b44fff"
                        onChange={v => updateText(selText, { fontSize: v })} />
                      <PropSlider label="X Position" value={selectedText.x} min={0} max={100} unit="%" color="#00e5ff"
                        onChange={v => updateText(selText, { x: v })} />
                      <PropSlider label="Y Position" value={selectedText.y} min={0} max={100} unit="%" color="#00e5ff"
                        onChange={v => updateText(selText, { y: v })} />
                      <PropSlider label="Outline" value={selectedText.outlineW ?? 0} min={0} max={12} color="#888899"
                        onChange={v => updateText(selText, { outlineW: v })} />
                      <PropSlider label="Duration" value={selectedText.dur} min={0.5} max={60} step={0.5} unit="s" color="#ffe600"
                        onChange={v => updateText(selText, { dur: v })} />
                    </div>
                    <div>
                      <div className="text-xs font-mono text-studio-dim mb-1">Font</div>
                      <select value={selectedText.fontFamily} onChange={e => updateText(selText, { fontFamily: e.target.value })}
                        className="w-full bg-studio-void border border-studio-border rounded-lg px-2 py-1.5 text-xs font-ui text-studio-text focus:outline-none focus:border-studio-purple mb-2">
                        {FONT_FAMILIES.map(f => <option key={f}>{f}</option>)}
                      </select>
                      <div className="flex gap-2">
                        {[['bold','B','bold'],['italic','I','italic']].map(([k,l,css]) => (
                          <button key={k} onClick={() => updateText(selText, { [k]: !selectedText[k] })}
                            className="flex-1 py-1.5 rounded border text-xs font-semibold transition-all"
                            style={{
                              borderColor: selectedText[k] ? '#b44fff' : '#252540',
                              color: selectedText[k] ? '#b44fff' : '#888899',
                              background: selectedText[k] ? 'rgba(180,79,255,0.12)' : 'transparent',
                              fontStyle: css === 'italic' ? 'italic' : 'normal',
                            }}>
                            {l}
                          </button>
                        ))}
                        {['left','center','right'].map(a => (
                          <button key={a} onClick={() => updateText(selText, { align: a })}
                            className="flex-1 py-1.5 rounded border text-xs transition-all"
                            style={{
                              borderColor: selectedText.align === a ? '#00e5ff' : '#252540',
                              color: selectedText.align === a ? '#00e5ff' : '#888899',
                              background: selectedText.align === a ? 'rgba(0,229,255,0.1)' : 'transparent',
                            }}>
                            {a === 'left' ? '⬤' : a === 'center' ? '◉' : '⬤'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <div>
                        <div className="text-xs font-mono text-studio-dim mb-1">Color</div>
                        <input type="color" value={selectedText.color} onChange={e => updateText(selText, { color: e.target.value })}
                          className="w-10 h-8 rounded border border-studio-border cursor-pointer bg-transparent" />
                      </div>
                      <div>
                        <div className="text-xs font-mono text-studio-dim mb-1">Outline</div>
                        <input type="color" value={selectedText.outlineColor ?? '#000000'} onChange={e => updateText(selText, { outlineColor: e.target.value })}
                          className="w-10 h-8 rounded border border-studio-border cursor-pointer bg-transparent" />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-mono text-studio-dim mb-1">Animation In</div>
                        <select value={selectedText.animIn} onChange={e => updateText(selText, { animIn: e.target.value })}
                          className="w-full bg-studio-void border border-studio-border rounded px-2 py-1 text-xs font-ui text-studio-text focus:outline-none">
                          {['None','Fade In','Slide Up','Slide Down','Scale In'].map(a => <option key={a}>{a}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateText(selText, { shadow: !selectedText.shadow })}
                        className="flex-1 py-1.5 rounded border text-xs font-ui font-semibold transition-all"
                        style={{ borderColor: selectedText.shadow ? '#888899' : '#252540', color: selectedText.shadow ? '#e0e0f0' : '#888899' }}>
                        {selectedText.shadow ? '◉' : '○'} Shadow
                      </button>
                      <button onClick={() => { setTextLayers(p => p.filter(t => t.id !== selText)); setSelText(null) }}
                        className="flex-1 py-1.5 rounded border border-studio-red/40 text-studio-red text-xs font-ui font-semibold hover:bg-studio-red/10 transition-colors">
                        ✕ Delete
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── Timeline ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-col border-t-2 border-studio-border bg-studio-panel"
        style={{ height: tlHeight }}>
        {/* Timeline toolbar */}
        <div className="flex items-center gap-2 px-3 py-1 border-b border-studio-border shrink-0">
          <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">Timeline</span>
          <div className="flex-1" />
          <button onClick={() => setTlHeight(h => Math.min(500, h + 40))} className="w-5 h-5 rounded border border-studio-border text-studio-dim hover:text-white text-xs flex items-center justify-center">↑</button>
          <button onClick={() => setTlHeight(h => Math.max(120, h - 40))} className="w-5 h-5 rounded border border-studio-border text-studio-dim hover:text-white text-xs flex items-center justify-center">↓</button>
        </div>

        <div ref={tlBodyRef} className="flex flex-1 min-h-0 overflow-auto" style={{ overflowX: 'auto', overflowY: 'auto' }}>
          {/* Track headers column */}
          <div className="shrink-0 flex flex-col" style={{ width: HEADER_W }}>
            <div style={{ height: RULER_H }} className="border-b border-studio-border bg-studio-deep" />
            {tracks.map(track => (
              <div key={track.id} className="flex items-center justify-between px-1.5 border-b border-studio-border/50 bg-studio-deep shrink-0"
                style={{ height: TRACK_H }}>
                <span className="text-xs font-mono font-bold" style={{ color: track.color }}>{track.label}</span>
                <div className="flex gap-0.5">
                  <button onClick={() => setTracks(p => p.map(t => t.id === track.id ? { ...t, muted: !t.muted } : t))}
                    className="w-4 h-4 flex items-center justify-center rounded text-xs transition-colors"
                    style={{ color: track.muted ? '#ff2d55' : '#888899' }}
                    title={track.muted ? 'Unmute' : 'Mute'}>
                    {track.muted ? 'M' : 'm'}
                  </button>
                  <button onClick={() => setTracks(p => p.map(t => t.id === track.id ? { ...t, locked: !t.locked } : t))}
                    className="w-4 h-4 flex items-center justify-center rounded text-xs transition-colors"
                    style={{ color: track.locked ? '#ffe600' : '#888899' }}
                    title={track.locked ? 'Unlock' : 'Lock'}>
                    {track.locked ? '🔒' : '🔓'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Scrollable track body */}
          <div className="flex-1 relative" style={{ minWidth: trackBodyWidth }}>
            {/* Time ruler */}
            <div className="relative bg-studio-deep border-b border-studio-border cursor-pointer"
              style={{ height: RULER_H }} onClick={onRulerClick}>
              {rulerTicks(totalDuration, zoom).map(tick => (
                <div key={tick.s} className="absolute top-0 flex flex-col items-start" style={{ left: tick.px }}>
                  <div className="h-2 w-px bg-studio-border" />
                  <span className="text-xs font-mono text-studio-dim ml-1" style={{ fontSize: 9 }}>{tick.label}</span>
                </div>
              ))}
              {/* Playhead on ruler */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-studio-red z-10 pointer-events-none"
                style={{ left: playhead * zoom }}>
                <div className="w-2 h-2 bg-studio-red rounded-full" style={{ marginLeft: -3 }} />
              </div>
            </div>

            {/* Tracks */}
            {tracks.map(track => (
              <div key={track.id}
                className="relative border-b border-studio-border/50 transition-colors"
                style={{ height: TRACK_H, background: track.muted ? '#0a0a14' : '#0d0d18' }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => onDropToTrack(e, track.id)}
                onClick={e => {
                  setSelClip(null); setSelText(null)
                  const rect = e.currentTarget.getBoundingClientRect()
                  seek(Math.max(0, (e.clientX - rect.left) / zoom))
                }}
              >
                {/* Lane stripe */}
                <div className="absolute inset-y-0 left-0 right-0 opacity-5" style={{ background: track.color }} />

                {/* Beat grid lines */}
                {rulerTicks(totalDuration, zoom).map(tick => (
                  <div key={tick.s} className="absolute top-0 bottom-0 w-px"
                    style={{ left: tick.px, background: '#252540', opacity: 0.4 }} />
                ))}

                {/* Clips on this track */}
                {clips.filter(c => c.trackId === track.id).map(clip => {
                  const med = media.find(m => m.id === clip.mediaId)
                  const isSelected = clip.id === selClip
                  return (
                    <div key={clip.id}
                      className="absolute top-1 bottom-1 rounded overflow-hidden cursor-pointer select-none group"
                      style={{
                        left: clip.start * zoom,
                        width: Math.max(8, clip.duration * zoom),
                        background: isSelected
                          ? `linear-gradient(135deg, ${track.color}55, ${track.color}33)`
                          : `${track.color}28`,
                        border: `1px solid ${isSelected ? track.color : track.color + '66'}`,
                        boxShadow: isSelected ? `0 0 8px ${track.color}55` : 'none',
                        zIndex: isSelected ? 2 : 1,
                      }}
                      onMouseDown={e => onClipMouseDown(e, clip.id)}
                    >
                      {/* Thumbnail strip for video */}
                      {med?.thumbnail && clip.trackId.startsWith('v') && (
                        <img src={med.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none" />
                      )}
                      {/* Audio waveform placeholder */}
                      {clip.trackId.startsWith('a') && (
                        <div className="absolute inset-0 flex items-center px-1 overflow-hidden opacity-60">
                          {Array.from({ length: Math.floor(clip.duration * zoom / 3) }, (_, i) => (
                            <div key={i} className="shrink-0 mx-px rounded-full"
                              style={{ width: 2, height: `${30 + Math.sin(i * 1.7) * 20}%`, background: track.color }} />
                          ))}
                        </div>
                      )}
                      {/* Label */}
                      <div className="absolute top-0 left-0 right-4 px-1.5 truncate text-xs font-mono font-semibold"
                        style={{ color: track.color, textShadow: '0 1px 3px rgba(0,0,0,0.8)', paddingTop: 2, fontSize: 10 }}>
                        {med?.name ?? 'clip'}
                      </div>
                      {/* Transition in indicator */}
                      {clip.transIn !== 'None' && (
                        <div className="absolute top-0 left-0 bottom-0 opacity-60 pointer-events-none"
                          style={{ width: clip.transInDur * zoom, background: `linear-gradient(to right, #000, transparent)` }} />
                      )}
                      {/* Transition out indicator */}
                      {clip.transOut !== 'None' && (
                        <div className="absolute top-0 right-4 bottom-0 opacity-60 pointer-events-none"
                          style={{ width: clip.transOutDur * zoom, background: `linear-gradient(to left, #000, transparent)` }} />
                      )}
                      {/* Right trim handle */}
                      <div className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: track.color + '33' }}
                        onMouseDown={e => onRightTrimMouseDown(e, clip.id)}>
                        <div className="w-0.5 h-4 rounded" style={{ background: track.color }} />
                      </div>
                    </div>
                  )
                })}

                {/* Text layer indicators on track (shown on V2) */}
                {track.id === 'v2' && textLayers.map(tl => (
                  <div key={tl.id}
                    className="absolute top-0 bottom-0 border-l border-r cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
                    style={{
                      left: tl.start * zoom,
                      width: Math.max(4, tl.dur * zoom),
                      borderColor: selText === tl.id ? '#b44fff' : '#b44fff88',
                      background: selText === tl.id ? 'rgba(180,79,255,0.25)' : 'rgba(180,79,255,0.08)',
                    }}
                    onClick={e => { e.stopPropagation(); setSelText(tl.id); setSelClip(null); setPropTab('text') }}
                  >
                    <span className="absolute top-0 left-1 text-xs font-mono" style={{ color: '#b44fff', fontSize: 9, lineHeight: '14px' }}>T</span>
                  </div>
                ))}
              </div>
            ))}

            {/* Global playhead line */}
            <div className="absolute top-0 bottom-0 w-0.5 pointer-events-none z-20"
              style={{ left: playhead * zoom, background: '#ff2d55', boxShadow: '0 0 6px #ff2d55' }}>
              <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '8px solid #ff2d55', marginLeft: -4.5 }} />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Export Modal ─────────────────────────────────────────────────── */}
      {showExport && (
        <ExportModal totalDuration={totalDuration} onExport={handleExport} onClose={() => setShowExport(false)} />
      )}
    </div>
  )
}
