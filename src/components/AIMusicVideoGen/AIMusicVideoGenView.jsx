import React, { useState, useRef, useCallback, useEffect } from 'react'
import { GoogleGenerativeAI } from '../../utils/gemini-compat'
import { useStudioStore } from '../../store/useStudioStore'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '')
const CW = 1280, CH = 720

// ── Constants ─────────────────────────────────────────────────────────────────

const VISUAL_STYLES = [
  { id: 'spectrum',  label: 'Spectrum Bars',  icon: '▇', desc: 'Classic EQ bars' },
  { id: 'mirror',   label: 'Mirror Bars',    icon: '⇆', desc: 'Mirrored spectrum' },
  { id: 'radial',   label: 'Radial Pulse',   icon: '◉', desc: 'Circular visualizer' },
  { id: 'waveform', label: 'Waveform',       icon: '〜', desc: 'Oscilloscope wave' },
  { id: 'particles',label: 'Particles',      icon: '✦', desc: 'Music-reactive particles' },
  { id: 'minimal',  label: 'Minimal Lyrics', icon: '✍', desc: 'Typography + waveform' },
]

const COLOR_THEMES = [
  { id: 'cyber',  label: 'Cyber',  c: ['#00e5ff','#b44fff','#ff2d55'] },
  { id: 'fire',   label: 'Fire',   c: ['#ff2d55','#ff9500','#ffe600'] },
  { id: 'forest', label: 'Forest', c: ['#00ff9d','#00e5ff','#44ff88'] },
  { id: 'gold',   label: 'Gold',   c: ['#ffe600','#ff9500','#ffffff'] },
  { id: 'violet', label: 'Violet', c: ['#b44fff','#ff6b9d','#00e5ff'] },
  { id: 'mono',   label: 'Mono',   c: ['#ffffff','#888888','#333333'] },
]

// ── Module-level helpers ──────────────────────────────────────────────────────

function hexAlpha(hex, a) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${a})`
}

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return '0:00'
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x+r, y)
  ctx.lineTo(x+w-r, y)
  ctx.quadraticCurveTo(x+w, y, x+w, y+r)
  ctx.lineTo(x+w, y+h-r)
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h)
  ctx.lineTo(x+r, y+h)
  ctx.quadraticCurveTo(x, y+h, x, y+h-r)
  ctx.lineTo(x, y+r)
  ctx.quadraticCurveTo(x, y, x+r, y)
  ctx.closePath()
}

function spawnParticles(arr, energy, W, H, colors) {
  const n = Math.floor(energy * 4)
  for (let i = 0; i < n; i++) {
    arr.push({
      x: Math.random() * W,
      y: H * (0.3 + Math.random() * 0.5),
      vx: (Math.random() - 0.5) * energy * 5,
      vy: -(Math.random() * energy * 8 + 0.5),
      size: Math.random() * 4 + 1,
      life: 1,
      decay: 0.007 + Math.random() * 0.014,
      color: colors[Math.floor(Math.random() * colors.length)],
    })
  }
  if (arr.length > 900) arr.splice(0, arr.length - 900)
}

// ── Core render function (all reads come from passed-in values) ───────────────

function renderFrame(canvas, fft, timeData, t, cfg, lyricLines, particles) {
  const ctx  = canvas.getContext('2d')
  const W    = canvas.width
  const H    = canvas.height
  const sens = cfg.sens
  const col  = cfg.colors
  const style = cfg.style

  // Average energy 0-1
  const avg    = fft.reduce((s,v) => s+v, 0) / fft.length / 255
  const energy = Math.min(1, avg * sens * 1.4)
  const bass   = Math.min(1, (fft.slice(0,8).reduce((s,v)=>s+v,0)/8/255) * sens * 2.2)

  // ── Background ──
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cfg.dark ? `rgba(4,4,14,${0.55 + energy*0.2})` : `rgba(240,240,255,${0.65 + energy*0.2})`
  ctx.fillRect(0, 0, W, H)

  // Subtle radial bg tint from bass
  const bgGrd = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*0.65)
  bgGrd.addColorStop(0, hexAlpha(col[0], bass*0.14))
  bgGrd.addColorStop(1,'transparent')
  ctx.fillStyle = bgGrd
  ctx.fillRect(0,0,W,H)

  // ── Visualizer ──
  ctx.save()
  ctx.shadowBlur = 0

  if (style === 'spectrum') {
    const bN = fft.length
    const bW = W / bN
    for (let i = 0; i < bN; i++) {
      const v  = (fft[i]/255) * sens
      const bH = v * H * 0.7
      const x  = i * bW
      const g  = ctx.createLinearGradient(x, H-bH, x, H)
      g.addColorStop(0, col[0])
      g.addColorStop(0.5, col[1])
      g.addColorStop(1, col[2]+'00')
      ctx.fillStyle = g
      ctx.shadowColor = col[0]
      ctx.shadowBlur  = 7
      ctx.fillRect(x+1, H-bH, Math.max(1,bW-2), bH)
      ctx.fillStyle = col[0]
      ctx.fillRect(x+1, H-bH-2, Math.max(1,bW-2), 2)
    }

  } else if (style === 'mirror') {
    const bN = fft.length
    const bW = W / bN
    ctx.fillStyle = hexAlpha(col[0], 0.25)
    ctx.fillRect(0, H/2-1, W, 2)
    for (let i = 0; i < bN; i++) {
      const v  = (fft[i]/255) * sens
      const bH = v * H * 0.42
      const x  = i * bW
      const g1 = ctx.createLinearGradient(0, H/2, 0, H/2+bH)
      g1.addColorStop(0, col[0]); g1.addColorStop(1, col[1]+'22')
      ctx.fillStyle = g1; ctx.fillRect(x+1, H/2, Math.max(1,bW-2), bH)
      const g2 = ctx.createLinearGradient(0, H/2, 0, H/2-bH)
      g2.addColorStop(0, col[0]); g2.addColorStop(1, col[1]+'22')
      ctx.fillStyle = g2; ctx.fillRect(x+1, H/2-bH, Math.max(1,bW-2), bH)
    }

  } else if (style === 'radial') {
    const cx = W/2, cy = H/2
    const baseR = Math.min(W,H) * 0.2
    const bN = fft.length
    // Outer glow ring
    ctx.beginPath()
    ctx.arc(cx, cy, baseR + bass*45, 0, Math.PI*2)
    ctx.strokeStyle = hexAlpha(col[0], 0.35)
    ctx.lineWidth   = 2 + bass*9
    ctx.shadowColor = col[0]; ctx.shadowBlur = 22+bass*28
    ctx.stroke(); ctx.shadowBlur = 0
    // Radial bars
    for (let i = 0; i < bN; i++) {
      const angle = (i/bN)*Math.PI*2 - Math.PI/2
      const v     = (fft[i]/255)*sens
      const r1    = baseR + 4
      const r2    = baseR + v*baseR*1.6 + 4
      ctx.beginPath()
      ctx.moveTo(cx+Math.cos(angle)*r1, cy+Math.sin(angle)*r1)
      ctx.lineTo(cx+Math.cos(angle)*r2, cy+Math.sin(angle)*r2)
      ctx.strokeStyle = i < bN/2 ? col[0] : col[1]
      ctx.lineWidth   = Math.max(1, (W/bN)*0.85)
      ctx.shadowColor = col[0]; ctx.shadowBlur = 5
      ctx.stroke()
    }
    ctx.shadowBlur = 0
    // Center fill
    const cG = ctx.createRadialGradient(cx,cy,0,cx,cy,baseR)
    cG.addColorStop(0, hexAlpha(col[0], 0.28+bass*0.35))
    cG.addColorStop(1, hexAlpha(col[1], 0.06))
    ctx.fillStyle = cG; ctx.beginPath(); ctx.arc(cx,cy,baseR,0,Math.PI*2); ctx.fill()
    // Center text
    if (cfg.showTitle && cfg.artistName) {
      ctx.font = `bold ${Math.floor(baseR*0.26)}px Orbitron,monospace`
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.shadowColor = col[0]; ctx.shadowBlur = 14
      ctx.fillText(cfg.artistName, cx, cy)
      ctx.shadowBlur = 0
    }

  } else if (style === 'waveform') {
    ctx.beginPath()
    const slW = W / timeData.length
    for (let i = 0; i < timeData.length; i++) {
      const v = ((timeData[i]/128)-1) * H*0.42 * sens
      i === 0 ? ctx.moveTo(0, H/2+v) : ctx.lineTo(i*slW, H/2+v)
    }
    const wG = ctx.createLinearGradient(0,0,W,0)
    wG.addColorStop(0,col[0]); wG.addColorStop(0.5,col[1]); wG.addColorStop(1,col[2])
    ctx.strokeStyle = wG; ctx.lineWidth = 2+energy*3
    ctx.shadowColor = col[0]; ctx.shadowBlur = 10+energy*16
    ctx.stroke(); ctx.shadowBlur = 0
    ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2)
    ctx.strokeStyle = hexAlpha(col[0],0.14); ctx.lineWidth = 1; ctx.stroke()

  } else if (style === 'particles') {
    spawnParticles(particles, energy, W, H, col)
    for (let i = particles.length-1; i >= 0; i--) {
      const p = particles[i]
      p.life -= p.decay; if (p.life <= 0) { particles.splice(i,1); continue }
      p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.vx *= 0.99
      ctx.globalAlpha = p.life * 0.85
      ctx.fillStyle   = p.color
      ctx.shadowColor = p.color; ctx.shadowBlur = 5
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size*p.life, 0, Math.PI*2); ctx.fill()
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0
    // Bass pulse
    const rG = ctx.createRadialGradient(W/2,H*0.75,0,W/2,H*0.75,80+bass*220)
    rG.addColorStop(0, hexAlpha(col[0], bass*0.45)); rG.addColorStop(1,'transparent')
    ctx.fillStyle = rG; ctx.fillRect(0,0,W,H)

  } else if (style === 'minimal') {
    // Waveform fill at bottom
    ctx.beginPath()
    const slW2 = W / timeData.length
    for (let i = 0; i < timeData.length; i++) {
      const v = ((timeData[i]/128)-1) * H*0.07 * sens
      i===0 ? ctx.moveTo(0, H*0.88+v) : ctx.lineTo(i*slW2, H*0.88+v)
    }
    ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath()
    const mG = ctx.createLinearGradient(0, H*0.85, 0, H)
    mG.addColorStop(0, hexAlpha(col[0],0.6)); mG.addColorStop(1, hexAlpha(col[2],0.1))
    ctx.fillStyle = mG; ctx.fill()
    // Thin spectrum ticks at bottom
    const bN2 = fft.length
    const bW2 = W / bN2
    for (let i = 0; i < bN2; i++) {
      const v  = (fft[i]/255)*sens*0.5
      const bH = v * H * 0.12
      ctx.fillStyle = hexAlpha(col[0], 0.4)
      ctx.fillRect(i*bW2+1, H-bH, Math.max(1,bW2-2), bH)
    }
  }
  ctx.restore()

  // ── Artist / Title (top-left, except radial draws it in center) ──
  if (cfg.showTitle && style !== 'radial') {
    ctx.save()
    const fade = Math.min(1, t * 2)
    ctx.globalAlpha = fade
    const nS = Math.floor(H*0.046), tS = Math.floor(H*0.028)
    if (cfg.artistName) {
      ctx.font = `bold ${nS}px Orbitron,monospace`
      ctx.fillStyle  = col[0]; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.shadowColor = col[0]; ctx.shadowBlur = 15
      ctx.fillText(cfg.artistName, W*0.038, H*0.046)
      ctx.shadowBlur = 0
    }
    if (cfg.songTitle) {
      ctx.font = `${tS}px Orbitron,monospace`
      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      ctx.fillText(cfg.songTitle, W*0.038, H*0.046 + nS + 5)
    }
    ctx.restore()
  }

  // ── Current lyric ──
  if (cfg.showLyrics && lyricLines.length > 0) {
    const lyric = lyricLines.find(l => t >= l.start && t < l.end)
    if (lyric) {
      const prog   = (t - lyric.start) / (lyric.end - lyric.start)
      const fadeIn  = Math.min(1, prog / 0.08)
      const fadeOut = Math.min(1, (1 - prog) / 0.08)
      ctx.save()
      ctx.globalAlpha = Math.min(fadeIn, fadeOut)
      const lyricSz = Math.floor(H * 0.056)
      ctx.font = `bold ${lyricSz}px Rajdhani,sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const tw = ctx.measureText(lyric.text).width
      const px = 28, py = 14
      const rx = W/2 - tw/2 - px, ry = H*0.73 - lyricSz/2 - py
      ctx.fillStyle = 'rgba(0,0,0,0.52)'
      roundRect(ctx, rx, ry, tw+px*2, lyricSz+py*2, 8)
      ctx.fill()
      ctx.shadowColor = col[0]; ctx.shadowBlur = 18 + energy*22
      ctx.fillStyle = '#ffffff'
      ctx.fillText(lyric.text, W/2, H*0.73)
      ctx.shadowBlur = 0
      ctx.restore()
    }
  }

  // ── Progress bar ──
  if (cfg.duration > 0) {
    const prog = Math.min(1, t / cfg.duration)
    ctx.fillStyle = hexAlpha(col[0], 0.25)
    ctx.fillRect(0, H-3, W, 3)
    const pG = ctx.createLinearGradient(0,0,W*prog,0)
    pG.addColorStop(0, col[0]); pG.addColorStop(1, col[1])
    ctx.fillStyle = pG
    ctx.fillRect(0, H-3, W*prog, 3)
    // Playhead dot
    ctx.beginPath()
    ctx.arc(W*prog, H-3, 5, 0, Math.PI*2)
    ctx.fillStyle = col[0]
    ctx.shadowColor = col[0]; ctx.shadowBlur = 8
    ctx.fill(); ctx.shadowBlur = 0
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AIMusicVideoGenView() {
  const { lyricAnalysis } = useStudioStore()

  // UI state
  const [audioFile,   setAudioFile]   = useState(null)
  const [duration,    setDuration]    = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recProgress, setRecProgress] = useState(0)
  const [isGenerating,setIsGenerating]= useState(false)
  const [genStatus,   setGenStatus]   = useState('')

  // Config state
  const [visualStyle, setVisualStyle] = useState('spectrum')
  const [colorTheme,  setColorTheme]  = useState('cyber')
  const [artistName,  setArtistName]  = useState('')
  const [songTitle,   setSongTitle]   = useState('')
  const [lyricsText,  setLyricsText]  = useState('')
  const [showTitle,   setShowTitle]   = useState(true)
  const [showLyrics,  setShowLyrics]  = useState(true)
  const [bgDark,      setBgDark]      = useState(true)
  const [sensitivity, setSensitivity] = useState(1.5)

  // Refs
  const canvasRef      = useRef(null)
  const audioCtxRef    = useRef(null)
  const analyserRef    = useRef(null)
  const sourceRef      = useRef(null)
  const audioBufferRef = useRef(null)
  const fftRef         = useRef(new Uint8Array(128))
  const timeDataRef    = useRef(new Uint8Array(256))
  const particlesRef   = useRef([])
  const animFrameRef   = useRef(null)
  const startRealRef   = useRef(0)
  const pauseOffsetRef = useRef(0)
  const isPlayingRef   = useRef(false)
  const durationRef    = useRef(0)
  const lyricLinesRef  = useRef([])

  // Sync refs
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { durationRef.current  = duration  }, [duration])

  // Parse lyrics into timed lines whenever text or duration change
  useEffect(() => {
    const dur = durationRef.current
    if (!lyricsText.trim() || !dur) { lyricLinesRef.current = []; return }
    const lines    = lyricsText.split('\n').filter(l => l.trim())
    const lineTime = dur / (lines.length + 1)
    lyricLinesRef.current = lines.map((text, i) => ({
      text,
      start: i * lineTime + lineTime * 0.4,
      end:   (i+1) * lineTime + lineTime * 0.4,
    }))
  }, [lyricsText, duration])

  // Build config object from current state for renderFrame
  const buildCfg = useCallback(() => {
    const theme = COLOR_THEMES.find(c => c.id === colorTheme) || COLOR_THEMES[0]
    return {
      style: visualStyle,
      colors: theme.c,
      dark: bgDark,
      sens: sensitivity,
      artistName,
      songTitle,
      showTitle,
      showLyrics,
      duration: durationRef.current,
    }
  }, [visualStyle, colorTheme, bgDark, sensitivity, artistName, songTitle, showTitle, showLyrics])

  // ── Draw frame ──────────────────────────────────────────────────────────────

  const drawFrame = useCallback((t) => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Pull live FFT data
    const analyser = analyserRef.current
    if (analyser) {
      analyser.getByteFrequencyData(fftRef.current)
      analyser.getByteTimeDomainData(timeDataRef.current)
    }
    renderFrame(canvas, fftRef.current, timeDataRef.current, t, buildCfg(), lyricLinesRef.current, particlesRef.current)
  }, [buildCfg])

  // ── Animation loop ──────────────────────────────────────────────────────────

  const startAnimLoop = useCallback(() => {
    if (animFrameRef.current) return
    const tick = () => {
      const ctx2 = audioCtxRef.current
      const t    = ctx2
        ? Math.max(0, ctx2.currentTime - startRealRef.current + pauseOffsetRef.current)
        : pauseOffsetRef.current
      const tC   = Math.min(durationRef.current || 9999, t)
      setCurrentTime(tC)
      drawFrame(tC)
      if (isPlayingRef.current) {
        animFrameRef.current = requestAnimationFrame(tick)
      } else {
        animFrameRef.current = null
      }
    }
    animFrameRef.current = requestAnimationFrame(tick)
  }, [drawFrame])

  // ── Audio helpers ───────────────────────────────────────────────────────────

  const stopSource = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop() } catch {}
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
  }, [])

  const ensureAnalyser = useCallback((ctx2) => {
    if (!analyserRef.current) {
      const a = ctx2.createAnalyser()
      a.fftSize = 256
      a.smoothingTimeConstant = 0.82
      analyserRef.current = a
      fftRef.current      = new Uint8Array(a.frequencyBinCount)
      timeDataRef.current = new Uint8Array(a.fftSize)
    }
    return analyserRef.current
  }, [])

  const startPlayback = useCallback((offset = 0) => {
    const ctx2   = audioCtxRef.current
    const buffer = audioBufferRef.current
    if (!ctx2 || !buffer) return
    stopSource()
    const analyser = ensureAnalyser(ctx2)
    const src      = ctx2.createBufferSource()
    src.buffer     = buffer
    src.connect(analyser)
    analyser.connect(ctx2.destination)
    sourceRef.current = src
    src.start(0, offset)
    startRealRef.current   = ctx2.currentTime - offset
    pauseOffsetRef.current = offset
    src.onended = () => {
      if (isPlayingRef.current) {
        setIsPlaying(false)
        isPlayingRef.current   = false
        pauseOffsetRef.current = 0
        setCurrentTime(0)
      }
    }
  }, [stopSource, ensureAnalyser])

  const loadAudioFile = useCallback(async (file) => {
    setAudioFile(file)
    const ab  = await file.arrayBuffer()
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const buf = await audioCtxRef.current.decodeAudioData(ab)
    audioBufferRef.current = buf
    durationRef.current    = buf.duration
    setDuration(buf.duration)
    pauseOffsetRef.current = 0
    setCurrentTime(0)
    // Draw a static preview frame
    setTimeout(() => drawFrame(0), 50)
  }, [drawFrame])

  const play = useCallback(() => {
    if (!audioBufferRef.current) return
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume()
    startPlayback(pauseOffsetRef.current)
    setIsPlaying(true)
    isPlayingRef.current = true
    startAnimLoop()
  }, [startPlayback, startAnimLoop])

  const pause = useCallback(() => {
    if (audioCtxRef.current && sourceRef.current) {
      pauseOffsetRef.current = audioCtxRef.current.currentTime - startRealRef.current
    }
    stopSource()
    setIsPlaying(false)
    isPlayingRef.current = false
  }, [stopSource])

  const seek = useCallback((t) => {
    const was = isPlayingRef.current
    if (was) { stopSource(); isPlayingRef.current = false }
    pauseOffsetRef.current = t
    setCurrentTime(t)
    drawFrame(t)
    if (was) { startPlayback(t); setIsPlaying(true); isPlayingRef.current = true; startAnimLoop() }
  }, [stopSource, startPlayback, startAnimLoop, drawFrame])

  // Redraw static preview when config changes while paused
  useEffect(() => {
    if (!isPlaying && canvasRef.current) drawFrame(pauseOffsetRef.current)
  }, [visualStyle, colorTheme, bgDark, sensitivity, artistName, songTitle, showTitle, showLyrics, isPlaying, drawFrame])

  // ── AI Style Generator ───────────────────────────────────────────────────────

  const generateAIStyle = useCallback(async () => {
    setIsGenerating(true)
    setGenStatus('Analyzing your song…')
    try {
      const model  = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const result = await model.generateContent(
        `You are a music video director. Suggest the best visual settings for an animated music video.\n` +
        `Artist: ${artistName||'Unknown'}\nSong: ${songTitle||'Untitled'}\n` +
        `${lyricsText ? `Lyrics:\n${lyricsText.slice(0,500)}` : ''}\n\n` +
        `Return ONLY valid JSON (no markdown):\n` +
        `{"visualStyle":"spectrum|mirror|radial|waveform|particles|minimal","colorTheme":"cyber|fire|forest|gold|violet|mono",` +
        `"bgDark":true,"sensitivity":1.5,"showTitle":true,"showLyrics":true,"reason":"why these fit"}`
      )
      let text = result.response.text().trim()
      if (text.includes('```')) { const m = text.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) text = m[1].trim() }
      const cfg = JSON.parse(text)
      if (cfg.visualStyle && VISUAL_STYLES.find(v=>v.id===cfg.visualStyle))  setVisualStyle(cfg.visualStyle)
      if (cfg.colorTheme  && COLOR_THEMES.find(c=>c.id===cfg.colorTheme))    setColorTheme(cfg.colorTheme)
      if (cfg.bgDark      !== undefined) setBgDark(cfg.bgDark)
      if (cfg.sensitivity !== undefined) setSensitivity(Math.max(0.5, Math.min(3, cfg.sensitivity)))
      if (cfg.showLyrics  !== undefined) setShowLyrics(cfg.showLyrics)
      setGenStatus(cfg.reason ? `✓ ${cfg.reason}` : '✓ Style applied!')
    } catch (err) {
      console.error(err)
      setGenStatus('Error: ' + err.message)
    } finally {
      setIsGenerating(false)
    }
  }, [artistName, songTitle, lyricsText])

  // ── Export ───────────────────────────────────────────────────────────────────

  const exportVideo = useCallback(async () => {
    const canvas = canvasRef.current
    const buffer = audioBufferRef.current
    if (!canvas || !buffer) return

    pause()
    await new Promise(r => setTimeout(r, 120))
    setIsRecording(true)
    setRecProgress(0)

    const ctx2 = audioCtxRef.current || new (window.AudioContext || window.webkitAudioContext)()
    audioCtxRef.current = ctx2

    const analyser = ctx2.createAnalyser()
    analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.82
    analyserRef.current = analyser
    fftRef.current      = new Uint8Array(analyser.frequencyBinCount)
    timeDataRef.current = new Uint8Array(analyser.fftSize)

    const dest = ctx2.createMediaStreamDestination()
    const src  = ctx2.createBufferSource()
    src.buffer = buffer
    src.connect(analyser)
    analyser.connect(dest)
    sourceRef.current = src

    const videoStream = canvas.captureStream(30)
    const combined    = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ])
    const mime    = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus' : 'video/webm'
    const recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
    const chunks   = []
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${(artistName||'video')}_${(songTitle||'music_video')}.webm`.replace(/\s+/g,'_')
      a.click()
      URL.revokeObjectURL(url)
      setIsRecording(false)
      setRecProgress(0)
      particlesRef.current = []
    }

    recorder.start(100)
    src.start(0)
    startRealRef.current   = ctx2.currentTime
    pauseOffsetRef.current = 0
    isPlayingRef.current   = true
    const dur = buffer.duration

    const recTick = () => {
      const elapsed = ctx2.currentTime - startRealRef.current
      const prog    = Math.min(1, elapsed / dur)
      setRecProgress(prog)
      drawFrame(elapsed)
      if (elapsed < dur) {
        animFrameRef.current = requestAnimationFrame(recTick)
      } else {
        isPlayingRef.current = false
        recorder.stop()
        try { src.stop() } catch {}
      }
    }
    animFrameRef.current = requestAnimationFrame(recTick)
  }, [pause, drawFrame, artistName, songTitle])

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && (file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name))) {
      loadAudioFile(file)
    }
  }, [loadAudioFile])

  const pullFromAnalyzer = useCallback(() => {
    if (!lyricAnalysis) return
    setArtistName(lyricAnalysis.artistName || '')
    setSongTitle(lyricAnalysis.songTitle   || '')
    setLyricsText((lyricAnalysis.lines || []).map(l => l.text).join('\n'))
  }, [lyricAnalysis])

  const theme    = COLOR_THEMES.find(c => c.id === colorTheme) || COLOR_THEMES[0]
  const progress = duration > 0 ? currentTime / duration : 0

  // ── JSX ──────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ background: '#080810', color: '#e0e0ff' }}>

      {/* ── Toolbar ── */}
      <div
        className="flex items-center gap-2 px-4 py-2 shrink-0"
        style={{ background: '#0d0d1f', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span
          className="text-sm font-display tracking-widest uppercase shrink-0"
          style={{ background: 'linear-gradient(90deg,#ff2d55,#b44fff,#00e5ff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}
        >
          AI Music Video Generator
        </span>
        <div className="w-px h-4 shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />

        <label
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-ui font-semibold cursor-pointer transition-all shrink-0"
          style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.25)' }}
        >
          ♫ {audioFile
            ? (audioFile.name.length > 22 ? audioFile.name.slice(0,22)+'…' : audioFile.name)
            : 'Load Audio'}
          <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" className="hidden"
            onChange={e => e.target.files[0] && loadAudioFile(e.target.files[0])} />
        </label>

        <div className="flex-1" />

        <button
          onClick={generateAIStyle} disabled={isGenerating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-ui font-semibold transition-all"
          style={{ background: 'rgba(180,79,255,0.12)', color: '#b44fff', border: '1px solid rgba(180,79,255,0.3)', opacity: isGenerating ? 0.5 : 1 }}
        >
          {isGenerating ? '…' : '✦'} AI Style
        </button>

        <button
          onClick={exportVideo} disabled={!audioFile || isRecording}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-ui font-bold transition-all"
          style={{
            background: isRecording ? 'rgba(255,45,85,0.2)' : 'linear-gradient(135deg,#ff2d55,#b44fff)',
            color: '#fff',
            border: isRecording ? '1px solid rgba(255,45,85,0.5)' : 'none',
            opacity: !audioFile ? 0.4 : 1,
            cursor: !audioFile || isRecording ? 'not-allowed' : 'pointer',
          }}
        >
          {isRecording ? `⏺ ${Math.round(recProgress*100)}%` : '↓ Export WebM'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left config ── */}
        <div
          className="flex flex-col shrink-0 overflow-y-auto"
          style={{ width: 248, borderRight: '1px solid rgba(255,255,255,0.06)', background: '#0a0a18' }}
        >
          <div className="p-4 space-y-4">

            {/* Lyric Analyzer bridge */}
            {lyricAnalysis && (
              <div className="rounded-lg p-3" style={{ background: 'rgba(180,79,255,0.08)', border: '1px solid rgba(180,79,255,0.2)' }}>
                <div className="text-xs font-display tracking-wider mb-1" style={{ color: '#b44fff' }}>LYRIC ANALYZER</div>
                <div className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {lyricAnalysis.artistName} — {lyricAnalysis.songTitle}
                </div>
                <button onClick={pullFromAnalyzer}
                  className="w-full py-1.5 rounded text-xs font-ui font-semibold"
                  style={{ background: 'rgba(180,79,255,0.15)', color: '#b44fff', border: '1px solid rgba(180,79,255,0.3)' }}
                >
                  ✦ Import Lyrics
                </button>
              </div>
            )}

            {/* Artist / Song */}
            {[['ARTIST NAME', artistName, setArtistName, 'Artist name'],
              ['SONG TITLE',  songTitle,  setSongTitle,  'Song title']].map(([lbl, val, set, ph]) => (
              <div key={lbl}>
                <label className="block text-xs font-display tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{lbl}</label>
                <input value={val} onChange={e => set(e.target.value)} placeholder={ph}
                  className="w-full px-2 py-1.5 rounded text-xs font-mono outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0e0ff' }} />
              </div>
            ))}

            {/* Visual style */}
            <div>
              <label className="block text-xs font-display tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>VISUAL STYLE</label>
              <div className="space-y-1">
                {VISUAL_STYLES.map(s => (
                  <button key={s.id} onClick={() => setVisualStyle(s.id)}
                    className="w-full px-3 py-2 rounded text-left transition-all"
                    style={{
                      background: visualStyle===s.id ? 'rgba(0,229,255,0.09)' : 'rgba(255,255,255,0.03)',
                      border: visualStyle===s.id ? '1px solid rgba(0,229,255,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ color: visualStyle===s.id ? '#00e5ff' : 'rgba(255,255,255,0.4)' }}>{s.icon}</span>
                      <div>
                        <div className="text-xs font-ui font-semibold" style={{ color: visualStyle===s.id ? '#00e5ff' : 'rgba(255,255,255,0.65)' }}>{s.label}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)' }}>{s.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Color theme */}
            <div>
              <label className="block text-xs font-display tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>COLOR THEME</label>
              <div className="grid grid-cols-3 gap-1">
                {COLOR_THEMES.map(t => (
                  <button key={t.id} onClick={() => setColorTheme(t.id)}
                    className="py-2 rounded text-xs font-ui font-semibold transition-all"
                    style={{
                      background: colorTheme===t.id ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                      border: colorTheme===t.id ? `2px solid ${t.c[0]}` : '1px solid rgba(255,255,255,0.07)',
                      color: colorTheme===t.id ? t.c[0] : 'rgba(255,255,255,0.42)',
                    }}
                  >
                    <div className="flex justify-center gap-0.5 mb-1">
                      {t.c.map((c,i) => <div key={i} className="w-2 h-2 rounded-full" style={{ background: c }} />)}
                    </div>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              <label className="block text-xs font-display tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>OPTIONS</label>
              {[['Dark BG', bgDark, setBgDark],['Show Title', showTitle, setShowTitle],['Show Lyrics', showLyrics, setShowLyrics]].map(([lbl,val,set]) => (
                <div key={lbl} className="flex items-center justify-between">
                  <span className="text-xs font-ui" style={{ color: 'rgba(255,255,255,0.5)' }}>{lbl}</span>
                  <button onClick={() => set(v => !v)}
                    className="w-9 h-5 rounded-full relative transition-all"
                    style={{ background: val ? '#00e5ff' : 'rgba(255,255,255,0.1)' }}
                  >
                    <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                      style={{ left: val ? '18px' : '2px' }} />
                  </button>
                </div>
              ))}
            </div>

            {/* Sensitivity */}
            <div>
              <label className="block text-xs font-display tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                SENSITIVITY — {sensitivity.toFixed(1)}×
              </label>
              <input type="range" min={0.5} max={3} step={0.1}
                value={sensitivity} onChange={e => setSensitivity(Number(e.target.value))}
                className="w-full" />
            </div>

            {/* Lyrics */}
            <div>
              <label className="block text-xs font-display tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                LYRICS <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)' }}>(auto-timed)</span>
              </label>
              <textarea value={lyricsText} onChange={e => setLyricsText(e.target.value)}
                placeholder="One line per lyric / section…" rows={6}
                className="w-full px-2 py-1.5 rounded text-xs font-mono outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0e0ff' }} />
              {lyricLinesRef.current.length > 0 && (
                <div className="text-xs font-mono mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {lyricLinesRef.current.length} lines timed
                </div>
              )}
            </div>

            {genStatus && (
              <div className="rounded px-2 py-1.5 text-xs font-ui"
                style={{ background: 'rgba(180,79,255,0.08)', color: '#b44fff', border: '1px solid rgba(180,79,255,0.2)' }}>
                {genStatus}
              </div>
            )}
          </div>
        </div>

        {/* ── Canvas area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className="flex-1 flex items-center justify-center"
            style={{ background: '#04040e', padding: 16 }}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            {!audioFile ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl"
                style={{ width:'100%', maxWidth: 640, aspectRatio:'16/9',
                  border:'2px dashed rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.015)' }}>
                <div style={{ fontSize: 52 }}>🎵</div>
                <div className="font-display text-lg tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>DROP AUDIO HERE</div>
                <div className="text-xs font-ui" style={{ color: 'rgba(255,255,255,0.22)' }}>MP3, WAV, M4A, OGG, FLAC</div>
                <label className="px-4 py-2 rounded text-xs font-ui font-semibold cursor-pointer"
                  style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.3)' }}>
                  Browse File
                  <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" className="hidden"
                    onChange={e => e.target.files[0] && loadAudioFile(e.target.files[0])} />
                </label>
              </div>
            ) : (
              <div className="relative" style={{ width:'100%', maxWidth:'100%', aspectRatio:'16/9' }}>
                <canvas ref={canvasRef} width={CW} height={CH}
                  style={{ width:'100%', height:'100%', display:'block', borderRadius: 8, background:'#000' }} />
                {isRecording && (
                  <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-xs font-bold"
                    style={{ background: 'rgba(255,45,85,0.92)', color: '#fff' }}>
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    REC {Math.round(recProgress*100)}%
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Transport */}
          {audioFile && (
            <div className="shrink-0 px-4 py-3 flex flex-col gap-2"
              style={{ background: '#0d0d1f', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {/* Seek bar */}
              <div className="relative h-2 rounded-full cursor-pointer group"
                style={{ background: 'rgba(255,255,255,0.1)' }}
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect()
                  seek(((e.clientX - r.left) / r.width) * durationRef.current)
                }}
              >
                <div className="absolute inset-y-0 left-0 rounded-full transition-all"
                  style={{ width:`${progress*100}%`, background:`linear-gradient(90deg,${theme.c[0]},${theme.c[1]})` }} />
                <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                  style={{ left:`calc(${progress*100}% - 6px)`, background: theme.c[0], boxShadow:`0 0 8px ${theme.c[0]}` }} />
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs" style={{ color:'rgba(255,255,255,0.4)', minWidth:80 }}>
                  {fmtTime(currentTime)} / {fmtTime(duration)}
                </span>
                <div className="flex-1 flex items-center justify-center gap-3">
                  <button onClick={() => seek(0)}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-sm transition-all"
                    style={{ background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.5)' }}>⏮</button>
                  <button onClick={() => isPlaying ? pause() : play()} disabled={isRecording}
                    className="w-12 h-12 flex items-center justify-center rounded-full text-xl transition-all font-mono"
                    style={{
                      background: `linear-gradient(135deg,${theme.c[0]},${theme.c[1]})`,
                      color: '#fff', boxShadow: `0 0 20px ${theme.c[0]}55`,
                      opacity: isRecording ? 0.4 : 1,
                    }}>
                    {isPlaying ? '⏸' : '▶'}
                  </button>
                  <button onClick={() => { pause(); seek(duration) }}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-sm transition-all"
                    style={{ background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.5)' }}>⏭</button>
                </div>
                <div className="text-right font-mono text-xs" style={{ color:'rgba(255,255,255,0.28)', minWidth:80 }}>
                  {audioFile?.name?.split('.').pop()?.toUpperCase()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
