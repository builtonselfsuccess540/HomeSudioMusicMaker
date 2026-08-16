import React, { useState, useRef, useCallback } from 'react'
import { GoogleGenerativeAI } from '../../utils/gemini-compat'
import Anthropic from '@anthropic-ai/sdk'
import { useStudioStore } from '../../store/useStudioStore'

// ── API clients ───────────────────────────────────────────────────────────────
const GEMINI_KEY    = import.meta.env.VITE_GEMINI_API_KEY || ''
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
const genAI         = new GoogleGenerativeAI(GEMINI_KEY)
const anthropic     = new Anthropic({ apiKey: ANTHROPIC_KEY, dangerouslyAllowBrowser: true })

// ── Image style presets ───────────────────────────────────────────────────────
const IMG_STYLES = {
  cinematic:    'cinematic film, dramatic lighting, shallow depth of field, 4K',
  neon:         'neon cyberpunk, glowing lights, dark atmosphere, ultra-detailed',
  photorealism: 'photorealistic, 8K photography, professional studio lighting',
  anime:        'anime art style, vibrant, detailed illustration, Studio Ghibli',
  abstract:     'abstract digital art, geometric shapes, fluid motion, colorful',
  watercolor:   'watercolor painting, soft colors, artistic brushstrokes, dreamy',
  dark_moody:   'dark and moody, shadows, noir aesthetic, high contrast, cinematic',
  retro:        'retro 80s aesthetic, VHS filter, synthwave colors, nostalgic',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
let _uid = 0
const uid = () => `id_${++_uid}_${Date.now()}`

function fmtTime(s) {
  if (!isFinite(s)) return '0:00'
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`
}

function fmtSRT(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60)
  const sec = Math.floor(s%60),   ms = Math.round((s%1)*1000)
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')},${ms.toString().padStart(3,'0')}`
}

// ── Image generation via Imagen 4 (confirmed available on this API key) ────────
async function generateImageURL(prompt, style) {
  const full = `${prompt}. ${IMG_STYLES[style] || ''}. Cinematic quality, highly detailed, 16:9 widescreen.`

  // Primary: Imagen 4.0 Fast — fastest, confirmed working with this key
  for (const model of [
    'imagen-4.0-fast-generate-001',
    'imagen-4.0-generate-001',
  ]) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances:  [{ prompt: full }],
            parameters: { sampleCount: 1, aspectRatio: '16:9', personGeneration: 'ALLOW_ADULT' },
          }),
        }
      )
      if (res.ok) {
        const data = await res.json()
        const b64  = data.predictions?.[0]?.bytesBase64Encoded
        if (b64) return `data:image/png;base64,${b64}`
      }
    } catch {}
  }

  // Fallback: Gemini image models (generateContent with IMAGE modality)
  for (const model of ['gemini-2.0-flash-image', 'gemini-3.1-flash-image']) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Generate a photorealistic image: ${full}` }] }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
          }),
        }
      )
      if (res.ok) {
        const data  = await res.json()
        const parts = data.candidates?.[0]?.content?.parts || []
        const imgP  = parts.find(p => p.inlineData)
        if (imgP) return `data:${imgP.inlineData.mimeType};base64,${imgP.inlineData.data}`
      }
    } catch {}
  }

  throw new Error('Image generation failed — all models exhausted. Check the browser console for details.')
}

// ── Beat detection (Web Audio energy analysis) ─────────────────────────────────
async function detectBeatsFromFile(file) {
  const ctx    = new (window.AudioContext || window.webkitAudioContext)()
  const ab     = await file.arrayBuffer()
  const buffer = await ctx.decodeAudioData(ab)
  const data   = buffer.getChannelData(0)
  const sr     = buffer.sampleRate
  const winSz  = Math.round(sr * 0.01) // 10ms windows
  ctx.close()

  const energies = []
  for (let i = 0; i < data.length; i += winSz) {
    const slice = data.slice(i, Math.min(i + winSz, data.length))
    const rms   = Math.sqrt(slice.reduce((s, v) => s + v*v, 0) / slice.length)
    energies.push({ t: i / sr, rms })
  }

  const lookback = 43
  const beats    = []
  let lastBeat   = -0.4

  for (let i = lookback; i < energies.length; i++) {
    const avg = energies.slice(i - lookback, i).reduce((s, e) => s + e.rms, 0) / lookback
    if (energies[i].rms > avg * 1.35 && energies[i].t - lastBeat > 0.28) {
      beats.push(energies[i].t)
      lastBeat = energies[i].t
    }
  }

  // Estimate BPM from median beat interval
  const intervals = beats.slice(1).map((b, i) => b - beats[i])
  intervals.sort((a, b) => a - b)
  const median = intervals[Math.floor(intervals.length / 2)] || 0.5
  const bpm    = median > 0 ? Math.round(60 / median) : 120

  return { beats: beats.slice(0, 800), bpm, duration: buffer.duration }
}

// ── SRT export ─────────────────────────────────────────────────────────────────
function downloadSRT(captions, filename = 'captions.srt') {
  const lines = captions.map((c, i) => {
    const end = captions[i+1] ? captions[i+1].time - 0.1 : c.time + 4
    return `${i+1}\n${fmtSRT(c.time)} --> ${fmtSRT(end)}\n${c.text}`
  })
  const blob = new Blob([lines.join('\n\n')], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Canvas scene renderer for export ─────────────────────────────────────────
function drawSceneFrame(ctx, imgs, scenes, captions, t, W, H) {
  let cumTime = 0
  for (let i = 0; i < scenes.length; i++) {
    const sc    = scenes[i]
    const scEnd = cumTime + sc.duration
    if (t >= cumTime && t < scEnd) {
      const local = t - cumTime
      const prog  = local / sc.duration
      const zoom  = 1 + prog * 0.05
      const dir   = i % 2 === 0 ? 1 : -1
      const panX  = dir * prog * 0.02 * W

      ctx.clearRect(0, 0, W, H)
      ctx.save()
      ctx.translate(W/2 + panX, H/2)
      ctx.scale(zoom, zoom)
      ctx.drawImage(imgs[i], -W/2, -H/2, W, H)
      ctx.restore()

      // Cross-fade to next
      const fadeLen = Math.min(0.5, sc.duration * 0.18)
      if (i < scenes.length - 1 && imgs[i+1] && local > sc.duration - fadeLen) {
        const alpha = (local - (sc.duration - fadeLen)) / fadeLen
        ctx.globalAlpha = alpha
        ctx.drawImage(imgs[i+1], 0, 0, W, H)
        ctx.globalAlpha = 1
      }

      // Fade in from black
      if (local < 0.25) {
        ctx.fillStyle = `rgba(0,0,0,${1 - local / 0.25})`
        ctx.fillRect(0, 0, W, H)
      }

      // Scene-level caption
      if (sc.caption) drawCaptionText(ctx, sc.caption, W, H)
      break
    }
    cumTime = scEnd
  }

  // Timed captions overlay
  const cap = captions.find(c => t >= c.time && t < c.time + 4)
  if (cap) drawCaptionText(ctx, cap.text, W, H, true)
}

function drawCaptionText(ctx, text, W, H, timed = false) {
  const sz   = Math.floor(H * 0.047)
  ctx.font   = `bold ${sz}px Arial, sans-serif`
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'bottom'
  const tw = ctx.measureText(text).width
  const y  = H - Math.floor(H * 0.05)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(W/2 - tw/2 - 18, y - sz - 10, tw + 36, sz + 18)
  ctx.fillStyle = timed ? '#ffe600' : '#ffffff'
  ctx.fillText(text, W/2, y)
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AIDreamStudioView() {
  const { lyricAnalysis } = useStudioStore()
  const [activeTab, setActiveTab] = useState('generate')

  // ── Generate tab ──
  const [genPrompt,   setGenPrompt]   = useState('')
  const [genStyle,    setGenStyle]    = useState('cinematic')
  const [gallery,     setGallery]     = useState([])   // {id, url, prompt, loading}
  const [scenes,      setScenes]      = useState([])   // {id, imageUrl, caption, duration}
  const [isGenImg,    setIsGenImg]    = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProg,  setExportProg]  = useState(0)

  // ── Caption tab ──
  const [capFile,      setCapFile]      = useState(null)
  const [captions,     setCaptions]     = useState([])  // {id, time, text}
  const [isTranscrib,  setIsTranscrib]  = useState(false)
  const [transStatus,  setTransStatus]  = useState('')
  const editCapRef = useRef({})

  // ── Beat tab ──
  const [beatFile,    setBeatFile]    = useState(null)
  const [beats,       setBeats]       = useState([])
  const [bpm,         setBpm]         = useState(0)
  const [beatDur,     setBeatDur]     = useState(0)
  const [isDetecting, setIsDetecting] = useState(false)

  // ── Script tab ──
  const [scriptText,  setScriptText]  = useState('')
  const [storyboard,  setStoryboard]  = useState([])  // {id, section, description, visualPrompt, caption, duration, imageUrl, imgLoading}
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeStatus, setAnalyzeStatus] = useState('')

  // ── Generate an image ──────────────────────────────────────────────────────
  const generateImage = useCallback(async (prompt = genPrompt) => {
    if (!prompt.trim()) return
    setIsGenImg(true)
    const id = uid()
    setGallery(prev => [{ id, url: null, prompt, loading: true, status: 'Requesting image…' }, ...prev])
    try {
      const url = await generateImageURL(prompt, genStyle)
      // URL is ready — now wait for the image to actually finish generating/loading
      setGallery(prev => prev.map(g => g.id === id ? { ...g, status: 'Generating with Flux AI… (~20s)' } : g))
      await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload  = resolve
        img.onerror = () => reject(new Error('Image failed to load. Pollinations.ai may be busy — try again.'))
        // 90-second timeout
        const t = setTimeout(() => reject(new Error('Timed out after 90s — try again')), 90000)
        img.onload = () => { clearTimeout(t); resolve() }
        img.src = url
      })
      setGallery(prev => prev.map(g => g.id === id ? { ...g, url, loading: false, status: '' } : g))
    } catch (err) {
      setGallery(prev => prev.map(g => g.id === id ? { ...g, loading: false, error: err.message, status: '' } : g))
    } finally {
      setIsGenImg(false)
    }
  }, [genPrompt, genStyle])

  const addToScenes = useCallback((img) => {
    setScenes(prev => [...prev, { id: uid(), imageUrl: img.url, caption: '', duration: 4 }])
  }, [])

  const removeScene = useCallback((id) => {
    setScenes(prev => prev.filter(s => s.id !== id))
  }, [])

  const updateScene = useCallback((id, patch) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }, [])

  // ── Export scene sequence as video ────────────────────────────────────────
  const exportVideo = useCallback(async () => {
    const validScenes = scenes.filter(s => s.imageUrl)
    if (validScenes.length === 0) return
    setIsExporting(true)
    setExportProg(0)

    const W = 1920, H = 1080
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')

    // Preload images
    const imgs = await Promise.all(
      validScenes.map(sc => new Promise((res) => {
        const img = new Image()
        img.onload  = () => res(img)
        img.onerror = () => res(null)
        img.src = sc.imageUrl
      }))
    )

    const fps      = 24
    const totalDur = validScenes.reduce((s, sc) => s + sc.duration, 0)
    const stream   = canvas.captureStream(fps)
    const mime     = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
    const chunks   = []
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = 'ai_dream_studio_video.webm'; a.click()
      URL.revokeObjectURL(url)
      setIsExporting(false)
      setExportProg(0)
    }

    recorder.start(200)
    let startTS = null
    await new Promise(resolve => {
      const tick = (ts) => {
        if (!startTS) startTS = ts
        const elapsed = Math.min((ts - startTS) / 1000, totalDur)
        setExportProg(elapsed / totalDur)
        drawSceneFrame(ctx, imgs, validScenes, captions, elapsed, W, H)
        if (elapsed < totalDur) requestAnimationFrame(tick)
        else { recorder.stop(); resolve() }
      }
      requestAnimationFrame(tick)
    })
  }, [scenes, captions])

  // ── Transcribe audio to captions ──────────────────────────────────────────
  const transcribeAudio = useCallback(async () => {
    if (!capFile) return
    setIsTranscrib(true)
    setTransStatus('Reading audio file…')
    try {
      const ab      = await capFile.arrayBuffer()
      const bytes   = new Uint8Array(ab)
      let   binary  = ''
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      const b64    = btoa(binary)
      const model  = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      setTransStatus('Transcribing with Gemini AI…')
      const result = await model.generateContent([
        { inlineData: { data: b64, mimeType: capFile.type || 'audio/mpeg' } },
        `Transcribe this audio to timed captions. For each caption line return ONLY valid JSON array:
[{"time": 0.0, "text": "first words"}, {"time": 3.5, "text": "next words"}, ...]
Include real timestamps in seconds. Return ONLY the JSON array, no markdown or explanation.`,
      ])
      let text = result.response.text().trim()
      if (text.includes('```')) { const m = text.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) text = m[1].trim() }
      const parsed = JSON.parse(text)
      setCaptions(parsed.map(c => ({ id: uid(), time: Number(c.time) || 0, text: String(c.text) })))
      setTransStatus(`✓ ${parsed.length} captions generated`)
    } catch (err) {
      setTransStatus('Error: ' + err.message)
    } finally {
      setIsTranscrib(false)
    }
  }, [capFile])

  // ── Beat detection ────────────────────────────────────────────────────────
  const detectBeats = useCallback(async () => {
    if (!beatFile) return
    setIsDetecting(true)
    try {
      const result = await detectBeatsFromFile(beatFile)
      setBeats(result.beats)
      setBpm(result.bpm)
      setBeatDur(result.duration)
    } catch (err) {
      console.error(err)
    } finally {
      setIsDetecting(false)
    }
  }, [beatFile])

  const exportBeatsJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify({ bpm, beats }, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'beat_markers.json'; a.click()
    URL.revokeObjectURL(url)
  }, [bpm, beats])

  // ── Script → Storyboard (Claude) ─────────────────────────────────────────
  const analyzeScript = useCallback(async () => {
    if (!scriptText.trim()) return
    setIsAnalyzing(true)
    setAnalyzeStatus('Claude is analyzing your script…')
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content:
            `You are a professional video director. Break this script/concept into a detailed video storyboard.\n` +
            `Return ONLY valid JSON (no markdown):\n` +
            `{"scenes":[{"section":"INTRO","description":"what happens","visualPrompt":"detailed prompt for AI image generation, cinematic, 16:9","caption":"text shown on screen","duration":4}]}\n\n` +
            `Create 6-12 scenes. Make visual prompts rich and descriptive for image generation.\n\nScript:\n${scriptText}`,
        }],
      })
      let text = msg.content[0].text.trim()
      if (text.includes('```')) { const m = text.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) text = m[1].trim() }
      const parsed = JSON.parse(text)
      setStoryboard((parsed.scenes || []).map(sc => ({ id: uid(), ...sc, imageUrl: null, imgLoading: false })))
      setAnalyzeStatus(`✓ ${(parsed.scenes||[]).length} scenes generated`)
    } catch (err) {
      setAnalyzeStatus('Error: ' + err.message)
    } finally {
      setIsAnalyzing(false)
    }
  }, [scriptText])

  const generateSceneImage = useCallback(async (sceneId) => {
    const scene = storyboard.find(s => s.id === sceneId)
    if (!scene) return
    setStoryboard(prev => prev.map(s => s.id === sceneId ? { ...s, imgLoading: true } : s))
    try {
      const url = await generateImageURL(scene.visualPrompt, genStyle)
      setStoryboard(prev => prev.map(s => s.id === sceneId ? { ...s, imageUrl: url, imgLoading: false } : s))
    } catch (err) {
      setStoryboard(prev => prev.map(s => s.id === sceneId ? { ...s, imgLoading: false } : s))
      console.error(err)
    }
  }, [storyboard, genStyle])

  const generateAllSceneImages = useCallback(async () => {
    for (const sc of storyboard) {
      if (!sc.imageUrl && !sc.imgLoading) await generateSceneImage(sc.id)
    }
  }, [storyboard, generateSceneImage])

  const addStoryboardToTimeline = useCallback(() => {
    const newScenes = storyboard
      .filter(sc => sc.imageUrl)
      .map(sc => ({ id: uid(), imageUrl: sc.imageUrl, caption: sc.caption || '', duration: sc.duration || 4 }))
    setScenes(prev => [...prev, ...newScenes])
    setActiveTab('generate')
  }, [storyboard])

  const pullLyricsToScript = useCallback(() => {
    if (!lyricAnalysis) return
    const lines = (lyricAnalysis.lines || []).map(l => l.text).join('\n')
    setScriptText(
      `Music video for "${lyricAnalysis.songTitle}" by ${lyricAnalysis.artistName}\n` +
      `Style: ${lyricAnalysis.styleProfile?.style || 'hip-hop'}, Rhyme scheme: ${lyricAnalysis.pattern || 'mixed'}\n\n` +
      `Lyrics:\n${lines}`
    )
  }, [lyricAnalysis])

  // ── Tabs config ──
  const TABS = [
    { id: 'generate', label: '🎨 AI Generate',  desc: 'Imagen 3 + video assembly' },
    { id: 'captions', label: '💬 Captions',      desc: 'Gemini audio transcription' },
    { id: 'beats',    label: '🥁 Beat Detector', desc: 'Auto beat timestamp analysis' },
    { id: 'script',   label: '📝 Script → Video',desc: 'Claude storyboard + images' },
  ]

  const canExport = scenes.filter(s => s.imageUrl).length > 0

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full" style={{ background: '#080810', color: '#e0e0ff' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-0 shrink-0" style={{ background: '#0d0d1f', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div
          className="px-4 py-3 shrink-0"
          style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span
            className="text-sm font-display tracking-widest uppercase"
            style={{ background: 'linear-gradient(90deg,#ff2d55,#b44fff,#00e5ff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}
          >
            AI Dream Studio
          </span>
        </div>
        <div className="flex flex-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-3 text-xs font-ui font-semibold transition-all relative"
              style={{
                color: activeTab === tab.id ? '#00e5ff' : 'rgba(255,255,255,0.38)',
                borderBottom: activeTab === tab.id ? '2px solid #00e5ff' : '2px solid transparent',
                background: activeTab === tab.id ? 'rgba(0,229,255,0.05)' : 'transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {canExport && (
          <button
            onClick={exportVideo}
            disabled={isExporting}
            className="mx-3 px-4 py-1.5 rounded text-xs font-ui font-bold transition-all shrink-0"
            style={{
              background: isExporting ? 'rgba(255,45,85,0.15)' : 'linear-gradient(135deg,#ff2d55,#b44fff)',
              color: '#fff',
              border: isExporting ? '1px solid rgba(255,45,85,0.4)' : 'none',
            }}
          >
            {isExporting ? `⏺ ${Math.round(exportProg*100)}%` : `↓ Export Video (${scenes.filter(s=>s.imageUrl).length} scenes)`}
          </button>
        )}
      </div>

      {/* ── Generate Tab ── */}
      {activeTab === 'generate' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: generation controls */}
          <div className="flex flex-col shrink-0 overflow-y-auto" style={{ width: 260, borderRight: '1px solid rgba(255,255,255,0.06)', background: '#0a0a18' }}>
            <div className="p-4 space-y-4">
              <div>
                <div className="text-xs font-display tracking-widest mb-2" style={{ color: '#00e5ff' }}>IMAGE GENERATION</div>
                <div className="text-xs mb-3 font-ui" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Powered by Imagen 3 + Gemini AI
                </div>
              </div>

              <div>
                <label className="block text-xs font-display tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>DESCRIBE YOUR SCENE</label>
                <textarea
                  value={genPrompt} onChange={e => setGenPrompt(e.target.value)}
                  placeholder="A rapper performing on stage with neon lights and smoke, crowd in background…"
                  rows={4}
                  className="w-full px-2 py-1.5 rounded text-xs font-mono outline-none resize-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0e0ff' }}
                  onKeyDown={e => e.key === 'Enter' && e.ctrlKey && generateImage()}
                />
                <div className="text-right mt-0.5" style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>Ctrl+Enter to generate</div>
              </div>

              <div>
                <label className="block text-xs font-display tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>VISUAL STYLE</label>
                <div className="grid grid-cols-2 gap-1">
                  {Object.keys(IMG_STYLES).map(s => (
                    <button
                      key={s}
                      onClick={() => setGenStyle(s)}
                      className="px-2 py-1.5 rounded text-xs font-ui transition-all capitalize text-left"
                      style={{
                        background: genStyle===s ? 'rgba(0,229,255,0.1)'          : 'rgba(255,255,255,0.03)',
                        color:      genStyle===s ? '#00e5ff'                        : 'rgba(255,255,255,0.45)',
                        border:     genStyle===s ? '1px solid rgba(0,229,255,0.3)' : '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      {s.replace(/_/g,' ')}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => generateImage()}
                disabled={isGenImg || !genPrompt.trim()}
                className="w-full py-3 rounded-lg font-display font-bold text-sm tracking-widest uppercase transition-all"
                style={{
                  background: (isGenImg || !genPrompt.trim()) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#ff2d55,#b44fff,#00e5ff)',
                  color: (isGenImg || !genPrompt.trim()) ? 'rgba(255,255,255,0.2)' : '#fff',
                  boxShadow: (!isGenImg && genPrompt.trim()) ? '0 0 20px rgba(180,79,255,0.3)' : 'none',
                  cursor: (isGenImg || !genPrompt.trim()) ? 'not-allowed' : 'pointer',
                }}
              >
                {isGenImg ? '⏳ Generating…' : '✦ Generate Image'}
              </button>

              {/* Quick prompts */}
              <div>
                <label className="block text-xs font-display tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>QUICK PROMPTS</label>
                <div className="space-y-1">
                  {[
                    'Artist performing on stage, dramatic spotlights',
                    'Dark studio with neon glow, recording session',
                    'City skyline at night, aerial view, cinematic',
                    'Abstract energy waves, music visualization',
                    'Crowd at concert, hands raised, silhouettes',
                  ].map(p => (
                    <button
                      key={p}
                      onClick={() => { setGenPrompt(p); generateImage(p) }}
                      className="w-full text-left px-2 py-1 rounded text-xs font-ui transition-all truncate"
                      style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.05)' }}
                    >
                      ✦ {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Center: gallery + scene sequence */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Gallery */}
            <div className="flex-1 overflow-y-auto p-4">
              {gallery.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                  <div style={{ fontSize: 56 }}>🎨</div>
                  <div className="font-display text-xl tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    IMAGEN 3 · GEMINI AI
                  </div>
                  <div className="text-sm font-ui max-w-sm" style={{ color: 'rgba(255,255,255,0.25)', lineHeight: 1.7 }}>
                    Describe a scene and generate AI images. Add them to your scene sequence, then export as a real video file.
                  </div>
                </div>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
                  {gallery.map(img => (
                    <div
                      key={img.id}
                      className="rounded-lg overflow-hidden"
                      style={{ border: '1px solid rgba(255,255,255,0.07)', background: '#0e0e1a' }}
                    >
                      <div className="relative" style={{ aspectRatio: '16/9', background: '#050510' }}>
                        {img.loading ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
                            <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#b44fff', borderRightColor: '#00e5ff' }} />
                            <div className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>{img.status || 'Generating…'}</div>
                          </div>
                        ) : img.error ? (
                          <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
                            <div className="text-xs font-mono" style={{ color: '#ff2d55' }}>{img.error}</div>
                          </div>
                        ) : (
                          <img src={img.url} alt={img.prompt} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="p-2">
                        <div className="text-xs font-ui mb-2 truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>{img.prompt}</div>
                        {img.url && (
                          <button
                            onClick={() => addToScenes(img)}
                            className="w-full py-1.5 rounded text-xs font-ui font-semibold transition-all"
                            style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.25)' }}
                          >
                            + Add to Scene Sequence
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Scene sequence */}
            {scenes.length > 0 && (
              <div className="shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#0a0a18' }}>
                <div className="flex items-center gap-3 px-4 py-2">
                  <span className="text-xs font-display tracking-wider" style={{ color: '#b44fff' }}>
                    SCENE SEQUENCE — {scenes.filter(s=>s.imageUrl).length} scenes · {scenes.reduce((s,sc)=>s+sc.duration,0)}s total
                  </span>
                  <button onClick={() => setScenes([])} className="ml-auto text-xs font-ui" style={{ color: 'rgba(255,45,85,0.7)' }}>Clear All</button>
                </div>
                <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
                  {scenes.map((sc, i) => (
                    <div
                      key={sc.id}
                      className="shrink-0 rounded-lg overflow-hidden"
                      style={{ width: 140, border: '1px solid rgba(255,255,255,0.08)', background: '#0e0e1a' }}
                    >
                      <div className="relative" style={{ height: 78 }}>
                        {sc.imageUrl
                          ? <img src={sc.imageUrl} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center" style={{ background: '#050510' }}>
                              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>No image</span>
                            </div>
                        }
                        <div className="absolute top-1 left-1 w-4 h-4 rounded-full flex items-center justify-center font-mono"
                          style={{ fontSize: 8, background: 'rgba(0,0,0,0.7)', color: '#00e5ff' }}>{i+1}</div>
                        <button onClick={() => removeScene(sc.id)}
                          className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center font-mono"
                          style={{ fontSize: 9, background: 'rgba(255,45,85,0.8)', color: '#fff' }}>×</button>
                      </div>
                      <div className="p-1.5">
                        <input
                          value={sc.caption} onChange={e => updateScene(sc.id, { caption: e.target.value })}
                          placeholder="Caption…" className="w-full bg-transparent outline-none font-mono"
                          style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                        />
                        <div className="flex items-center gap-1 mt-1">
                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Dur:</span>
                          <input type="number" min={1} max={15} value={sc.duration}
                            onChange={e => updateScene(sc.id, { duration: Math.max(1, Number(e.target.value)) })}
                            className="w-10 bg-transparent outline-none text-center font-mono"
                            style={{ fontSize: 9, color: '#00e5ff', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 3 }}
                          />
                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>s</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Captions Tab ── */}
      {activeTab === 'captions' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: upload + controls */}
          <div className="flex flex-col shrink-0 overflow-y-auto p-4 gap-4" style={{ width: 280, borderRight: '1px solid rgba(255,255,255,0.06)', background: '#0a0a18' }}>
            <div>
              <div className="text-xs font-display tracking-widest mb-1" style={{ color: '#00e5ff' }}>AUTO-CAPTION GENERATOR</div>
              <div className="text-xs font-ui" style={{ color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
                Upload any audio/video file. Gemini AI transcribes it to timed captions. Export as SRT subtitle file.
              </div>
            </div>

            <label
              className="flex flex-col items-center justify-center gap-2 rounded-lg cursor-pointer transition-all"
              style={{ height: 100, border: '2px dashed rgba(0,229,255,0.2)', background: 'rgba(0,229,255,0.04)' }}
            >
              <div className="text-2xl">{capFile ? '🎵' : '📁'}</div>
              <div className="text-xs font-ui text-center" style={{ color: capFile ? '#00e5ff' : 'rgba(255,255,255,0.35)' }}>
                {capFile ? capFile.name.slice(0,30)+(capFile.name.length>30?'…':'') : 'Drop audio or video file'}
              </div>
              <input type="file" accept="audio/*,video/*,.mp3,.wav,.m4a,.mp4,.webm" className="hidden"
                onChange={e => e.target.files[0] && setCapFile(e.target.files[0])} />
            </label>

            <button
              onClick={transcribeAudio}
              disabled={!capFile || isTranscrib}
              className="w-full py-3 rounded-lg font-display font-bold text-sm tracking-widest uppercase transition-all"
              style={{
                background: (capFile && !isTranscrib) ? 'linear-gradient(135deg,#00e5ff,#b44fff)' : 'rgba(255,255,255,0.05)',
                color: (capFile && !isTranscrib) ? '#fff' : 'rgba(255,255,255,0.2)',
                cursor: (capFile && !isTranscrib) ? 'pointer' : 'not-allowed',
              }}
            >
              {isTranscrib ? '⏳ Transcribing…' : '✦ Transcribe Audio'}
            </button>

            {transStatus && (
              <div className="rounded px-2 py-1.5 text-xs font-ui"
                style={{ background: 'rgba(0,229,255,0.07)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.2)' }}>
                {transStatus}
              </div>
            )}

            {captions.length > 0 && (
              <>
                <button onClick={() => downloadSRT(captions)}
                  className="w-full py-2 rounded font-ui font-semibold text-xs transition-all"
                  style={{ background: 'rgba(0,255,157,0.1)', color: '#00ff9d', border: '1px solid rgba(0,255,157,0.25)' }}>
                  ↓ Export SRT File
                </button>
                <button onClick={() => setCaptions([])}
                  className="w-full py-1.5 rounded font-ui text-xs"
                  style={{ background: 'rgba(255,45,85,0.08)', color: '#ff2d55', border: '1px solid rgba(255,45,85,0.2)' }}>
                  Clear Captions
                </button>
              </>
            )}
          </div>

          {/* Right: caption list */}
          <div className="flex-1 overflow-y-auto p-4">
            {captions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div style={{ fontSize: 52 }}>💬</div>
                <div className="font-display text-xl tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>WHISPER-STYLE CAPTIONS</div>
                <div className="text-sm font-ui max-w-sm" style={{ color: 'rgba(255,255,255,0.25)', lineHeight: 1.7 }}>
                  Upload an MP3, WAV, or video file. Gemini AI listens and generates timed captions you can export as an SRT subtitle file.
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-w-2xl mx-auto">
                <div className="text-xs font-display tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {captions.length} CAPTIONS — click to edit
                </div>
                {captions.map((cap, i) => (
                  <div
                    key={cap.id}
                    className="flex gap-3 rounded-lg px-3 py-2 group"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="shrink-0 font-mono text-xs pt-1 w-12 text-right" style={{ color: '#00e5ff' }}>
                      {fmtTime(cap.time)}
                    </div>
                    <input
                      defaultValue={cap.text}
                      onChange={e => { editCapRef.current[cap.id] = e.target.value }}
                      onBlur={e => setCaptions(prev => prev.map(c => c.id === cap.id ? { ...c, text: e.target.value } : c))}
                      className="flex-1 bg-transparent outline-none text-sm font-ui"
                      style={{ color: 'rgba(255,255,255,0.75)' }}
                    />
                    <button
                      onClick={() => setCaptions(prev => prev.filter(c => c.id !== cap.id))}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-all text-xs"
                      style={{ color: 'rgba(255,45,85,0.7)' }}
                    >×</button>
                  </div>
                ))}
                <button
                  onClick={() => setCaptions(prev => [...prev, { id: uid(), time: (prev[prev.length-1]?.time||0)+4, text: 'New caption' }])}
                  className="w-full py-2 rounded text-xs font-ui text-center transition-all"
                  style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.35)', border: '1px dashed rgba(255,255,255,0.1)' }}
                >
                  + Add Caption
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Beat Detector Tab ── */}
      {activeTab === 'beats' && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-col shrink-0 overflow-y-auto p-4 gap-4" style={{ width: 280, borderRight: '1px solid rgba(255,255,255,0.06)', background: '#0a0a18' }}>
            <div>
              <div className="text-xs font-display tracking-widest mb-1" style={{ color: '#ffe600' }}>BEAT DETECTOR</div>
              <div className="text-xs font-ui" style={{ color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
                Upload an audio file. Web Audio API analyzes frequency energy peaks to detect beat timestamps and calculate BPM.
              </div>
            </div>

            <label
              className="flex flex-col items-center justify-center gap-2 rounded-lg cursor-pointer"
              style={{ height: 100, border: '2px dashed rgba(255,230,0,0.2)', background: 'rgba(255,230,0,0.04)' }}
            >
              <div className="text-2xl">{beatFile ? '🥁' : '📁'}</div>
              <div className="text-xs font-ui text-center" style={{ color: beatFile ? '#ffe600' : 'rgba(255,255,255,0.35)' }}>
                {beatFile ? beatFile.name.slice(0,30)+(beatFile.name.length>30?'…':'') : 'Drop audio file'}
              </div>
              <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg" className="hidden"
                onChange={e => { if (e.target.files[0]) { setBeatFile(e.target.files[0]); setBeats([]); setBpm(0) } }} />
            </label>

            <button
              onClick={detectBeats}
              disabled={!beatFile || isDetecting}
              className="w-full py-3 rounded-lg font-display font-bold text-sm tracking-widest uppercase transition-all"
              style={{
                background: (beatFile && !isDetecting) ? 'linear-gradient(135deg,#ffe600,#ff9500)' : 'rgba(255,255,255,0.05)',
                color: (beatFile && !isDetecting) ? '#000' : 'rgba(255,255,255,0.2)',
                cursor: (beatFile && !isDetecting) ? 'pointer' : 'not-allowed',
              }}
            >
              {isDetecting ? '⏳ Analyzing…' : '✦ Detect Beats'}
            </button>

            {bpm > 0 && (
              <>
                <div className="rounded-lg p-4 text-center" style={{ background: 'rgba(255,230,0,0.08)', border: '1px solid rgba(255,230,0,0.2)' }}>
                  <div className="font-mono text-4xl font-bold" style={{ color: '#ffe600' }}>{bpm}</div>
                  <div className="text-xs font-display tracking-wider mt-1" style={{ color: 'rgba(255,230,0,0.6)' }}>BPM DETECTED</div>
                  <div className="text-xs font-mono mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{beats.length} beats · {fmtTime(beatDur)}</div>
                </div>
                <button onClick={exportBeatsJSON}
                  className="w-full py-2 rounded font-ui font-semibold text-xs"
                  style={{ background: 'rgba(255,230,0,0.1)', color: '#ffe600', border: '1px solid rgba(255,230,0,0.25)' }}>
                  ↓ Export Beat Markers JSON
                </button>
              </>
            )}
          </div>

          {/* Beat timeline visualization */}
          <div className="flex-1 overflow-y-auto p-6">
            {beats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div style={{ fontSize: 52 }}>🥁</div>
                <div className="font-display text-xl tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>BEAT ANALYSIS</div>
                <div className="text-sm font-ui max-w-sm" style={{ color: 'rgba(255,255,255,0.25)', lineHeight: 1.7 }}>
                  Upload an audio file and detect beats. The analyzer finds energy peaks in the audio to generate precise beat timestamps for auto-cut video editing.
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto">
                <div className="text-xs font-display tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  BEAT TIMELINE — {beats.length} beats detected at {bpm} BPM
                </div>
                {/* Visual timeline */}
                <div
                  className="relative rounded-lg overflow-hidden mb-6"
                  style={{ height: 80, background: 'rgba(255,230,0,0.04)', border: '1px solid rgba(255,230,0,0.15)' }}
                >
                  {beats.slice(0,200).map((t, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 w-px"
                      style={{
                        left: `${(t / beatDur) * 100}%`,
                        background: i % 4 === 0 ? '#ffe600' : 'rgba(255,230,0,0.4)',
                        opacity: i % 4 === 0 ? 1 : 0.6,
                      }}
                    />
                  ))}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-mono text-xs" style={{ color: 'rgba(255,230,0,0.5)' }}>
                      {beats.length > 200 ? 'Showing first 200 beats' : `${beats.length} beats`}
                    </span>
                  </div>
                </div>
                {/* Beat list */}
                <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(100px,1fr))' }}>
                  {beats.slice(0, 120).map((t, i) => (
                    <div
                      key={i}
                      className="px-2 py-1 rounded font-mono text-center"
                      style={{ fontSize: 10, background: 'rgba(255,230,0,0.07)', color: '#ffe600', border: '1px solid rgba(255,230,0,0.15)' }}
                    >
                      {fmtTime(t)}
                    </div>
                  ))}
                  {beats.length > 120 && (
                    <div className="px-2 py-1 rounded font-mono text-center" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                      +{beats.length-120} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Script → Video Tab ── */}
      {activeTab === 'script' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: script input */}
          <div className="flex flex-col shrink-0 overflow-y-auto p-4 gap-4" style={{ width: 300, borderRight: '1px solid rgba(255,255,255,0.06)', background: '#0a0a18' }}>
            <div>
              <div className="text-xs font-display tracking-widest mb-1" style={{ color: '#b44fff' }}>SCRIPT → STORYBOARD → VIDEO</div>
              <div className="text-xs font-ui" style={{ color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
                Claude analyzes your script and breaks it into a visual storyboard. Then Imagen 3 generates each scene image. Export as a real video.
              </div>
            </div>

            {lyricAnalysis && (
              <button onClick={pullLyricsToScript}
                className="w-full py-2 rounded text-xs font-ui font-semibold"
                style={{ background: 'rgba(180,79,255,0.12)', color: '#b44fff', border: '1px solid rgba(180,79,255,0.3)' }}>
                ✦ Import from Lyric Analyzer
              </button>
            )}

            <div>
              <label className="block text-xs font-display tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                SCRIPT / CONCEPT
              </label>
              <textarea
                value={scriptText} onChange={e => setScriptText(e.target.value)}
                placeholder={`Write your music video concept, scene by scene…\n\nExample:\nVerse 1: Artist alone in dark studio, neon lights flickering\nChorus: Crowd scene, energy exploding\nBridge: Cityscape at night from above…`}
                rows={12}
                className="w-full px-2 py-2 rounded text-xs font-mono outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0e0ff', lineHeight: 1.6 }}
              />
            </div>

            <div>
              <label className="block text-xs font-display tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>IMAGE STYLE</label>
              <select value={genStyle} onChange={e => setGenStyle(e.target.value)}
                className="w-full px-2 py-1.5 rounded text-xs font-mono outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e0e0ff' }}>
                {Object.keys(IMG_STYLES).map(s => (
                  <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
                ))}
              </select>
            </div>

            <button
              onClick={analyzeScript}
              disabled={!scriptText.trim() || isAnalyzing}
              className="w-full py-3 rounded-lg font-display font-bold text-sm tracking-widest uppercase transition-all"
              style={{
                background: (scriptText.trim() && !isAnalyzing) ? 'linear-gradient(135deg,#b44fff,#ff2d55)' : 'rgba(255,255,255,0.05)',
                color: (scriptText.trim() && !isAnalyzing) ? '#fff' : 'rgba(255,255,255,0.2)',
                cursor: (scriptText.trim() && !isAnalyzing) ? 'pointer' : 'not-allowed',
              }}
            >
              {isAnalyzing ? '⏳ Claude Analyzing…' : '✦ Analyze with Claude'}
            </button>

            {analyzeStatus && (
              <div className="rounded px-2 py-1.5 text-xs font-ui"
                style={{ background: 'rgba(180,79,255,0.08)', color: '#b44fff', border: '1px solid rgba(180,79,255,0.2)' }}>
                {analyzeStatus}
              </div>
            )}

            {storyboard.length > 0 && (
              <div className="space-y-2">
                <button onClick={generateAllSceneImages}
                  className="w-full py-2 rounded font-ui font-semibold text-xs transition-all"
                  style={{ background: 'linear-gradient(135deg,#ff2d55,#b44fff)', color: '#fff' }}>
                  ✦ Generate All Images ({storyboard.filter(s => !s.imageUrl).length} remaining)
                </button>
                {storyboard.some(s => s.imageUrl) && (
                  <button onClick={addStoryboardToTimeline}
                    className="w-full py-2 rounded font-ui font-semibold text-xs"
                    style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.3)' }}>
                    → Add to Scene Sequence ({storyboard.filter(s => s.imageUrl).length} with images)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right: storyboard cards */}
          <div className="flex-1 overflow-y-auto p-4">
            {storyboard.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div style={{ fontSize: 52 }}>📝</div>
                <div className="font-display text-xl tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  SCRIPT TO VIDEO
                </div>
                <div className="text-sm font-ui max-w-md" style={{ color: 'rgba(255,255,255,0.25)', lineHeight: 1.7 }}>
                  Write your music video concept or paste your lyrics. Claude breaks it into scenes. Then Imagen 3 generates an AI image for each one. Export the whole thing as a real video file.
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 max-w-md">
                  {['📝 Write Script','🤖 Claude Analyzes','🎨 Imagen 3 Images','🎬 Canvas Animation','📦 WebM Export','✦ Real Video'].map(s=>(
                    <div key={s} className="px-2 py-2 rounded text-xs font-ui text-center"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>{s}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
                {storyboard.map((sc, i) => (
                  <div key={sc.id} className="rounded-lg overflow-hidden"
                    style={{ border: '1px solid rgba(255,255,255,0.07)', background: '#0e0e1a' }}>
                    {/* Image area */}
                    <div className="relative" style={{ aspectRatio: '16/9', background: '#050510' }}>
                      {sc.imgLoading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                          <div className="w-7 h-7 rounded-full border-2 border-transparent animate-spin"
                            style={{ borderTopColor: '#b44fff', borderRightColor: '#00e5ff' }} />
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Generating…</div>
                        </div>
                      ) : sc.imageUrl ? (
                        <img src={sc.imageUrl} alt={sc.section} className="w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                          <div style={{ fontSize: 28 }}>🎨</div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textAlign:'center', padding:'0 8px' }}>{sc.visualPrompt?.slice(0,60)}…</div>
                        </div>
                      )}
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded font-mono"
                        style={{ fontSize: 8, background: 'rgba(0,0,0,0.7)', color: '#b44fff', border: '1px solid rgba(180,79,255,0.3)' }}>
                        {sc.section}
                      </div>
                      <div className="absolute bottom-2 right-2 px-1 py-0.5 rounded font-mono"
                        style={{ fontSize: 8, background: 'rgba(0,0,0,0.65)', color: 'rgba(255,255,255,0.45)' }}>
                        {sc.duration}s
                      </div>
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <div className="text-xs font-ui mb-1" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>
                        {sc.description}
                      </div>
                      {sc.caption && (
                        <div className="text-xs font-mono mb-2 px-2 py-1 rounded"
                          style={{ background: 'rgba(0,229,255,0.07)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.15)' }}>
                          "{sc.caption}"
                        </div>
                      )}
                      {!sc.imageUrl && (
                        <button onClick={() => generateSceneImage(sc.id)} disabled={sc.imgLoading}
                          className="w-full py-1.5 rounded text-xs font-ui font-semibold"
                          style={{ background: 'rgba(180,79,255,0.12)', color: '#b44fff', border: '1px solid rgba(180,79,255,0.25)' }}>
                          ✦ Generate Image
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
