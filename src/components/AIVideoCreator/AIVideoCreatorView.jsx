import React, { useState, useCallback } from 'react'
import { GoogleGenerativeAI } from '../../utils/gemini-compat'
import { useStudioStore } from '../../store/useStudioStore'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '')

const VIDEO_TYPES = [
  { id: 'music_video',  label: 'Music Video',   icon: '🎵' },
  { id: 'lyric_video',  label: 'Lyric Video',    icon: '✍' },
  { id: 'youtube',      label: 'YouTube Video',  icon: '▶' },
  { id: 'short',        label: 'Short / Reel',   icon: '📱' },
  { id: 'tutorial',     label: 'Tutorial',       icon: '🎓' },
  { id: 'promo',        label: 'Promo / Ad',     icon: '📢' },
  { id: 'intro',        label: 'Intro / Outro',  icon: '🎬' },
  { id: 'visualizer',  label: 'Audio Visualizer',icon: '◉' },
]

const VISUAL_STYLES = [
  { id: 'cinematic',  label: 'Cinematic',        color: '#00e5ff' },
  { id: 'neon',       label: 'Neon Cyberpunk',   color: '#ff2d55' },
  { id: 'lofi',       label: 'Lo-Fi Aesthetic',  color: '#b44fff' },
  { id: 'minimal',    label: 'Minimal Clean',    color: '#ffffff' },
  { id: 'retro',      label: 'Retro VHS',        color: '#ffe600' },
  { id: 'dark',       label: 'Dark & Moody',     color: '#44ddff' },
  { id: 'vibrant',    label: 'Vibrant Color',    color: '#00ff9d' },
  { id: 'anime',      label: 'Anime / Illustrated', color: '#ff6b9d' },
]

const SHOT_MAP = {
  wide:           { badge: 'W',   color: '#00e5ff', label: 'Wide Shot'       },
  medium:         { badge: 'M',   color: '#00ff9d', label: 'Medium Shot'     },
  closeup:        { badge: 'CU',  color: '#ffe600', label: 'Close-Up'        },
  extreme_closeup:{ badge: 'ECU', color: '#ff9500', label: 'Extreme Close-Up'},
  aerial:         { badge: 'AE',  color: '#b44fff', label: 'Aerial'          },
  pov:            { badge: 'POV', color: '#ff2d55', label: 'POV'             },
  tracking:       { badge: 'TR',  color: '#ff6b9d', label: 'Tracking'        },
  static:         { badge: 'ST',  color: '#44ddff', label: 'Static'          },
}

const SCENE_GRADIENTS = [
  'linear-gradient(135deg,#0a0a1a,#1a0a2e)',
  'linear-gradient(135deg,#0a1a0a,#0a2e1a)',
  'linear-gradient(135deg,#1a0a0a,#2e0a1a)',
  'linear-gradient(135deg,#0a0a2e,#1a1a0a)',
  'linear-gradient(135deg,#1a1a0a,#2e1a0a)',
  'linear-gradient(135deg,#0a1a1a,#1a0a2e)',
  'linear-gradient(135deg,#12001a,#001a12)',
  'linear-gradient(135deg,#1a0012,#12001a)',
]

const MOODS = ['Energetic','Melancholic','Triumphant','Dark','Romantic','Aggressive','Peaceful','Mysterious','Hype','Emotional']
const PLATFORMS = ['YouTube','TikTok','Instagram Reels','Twitter/X','Facebook','Twitch','Vimeo']

function fmt(s) {
  const m = Math.floor(s / 60)
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

function SceneCard({ scene, index, isSelected, onClick }) {
  const shot = SHOT_MAP[scene.shotType] || SHOT_MAP.medium
  const grad = SCENE_GRADIENTS[index % SCENE_GRADIENTS.length]
  return (
    <div
      onClick={onClick}
      className="rounded-lg overflow-hidden cursor-pointer transition-all select-none"
      style={{
        border: isSelected ? '2px solid #00e5ff' : '1px solid rgba(255,255,255,0.07)',
        boxShadow: isSelected ? '0 0 18px rgba(0,229,255,0.25)' : 'none',
        background: '#0e0e1a',
      }}
    >
      {/* Thumbnail area */}
      <div className="relative" style={{ height: 116, background: grad }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center gap-1">
          <div style={{ fontSize: 28 }}>{scene.emoji || '🎬'}</div>
          <div className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {scene.visualDescription?.slice(0, 60)}{scene.visualDescription?.length > 60 ? '…' : ''}
          </div>
        </div>
        {/* Scene # */}
        <div
          className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono font-bold"
          style={{ background: 'rgba(0,0,0,0.65)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.35)' }}
        >
          {index + 1}
        </div>
        {/* Shot badge */}
        <div
          className="absolute top-2 right-2 px-1.5 py-0.5 rounded font-mono font-bold"
          style={{ fontSize: 9, background: 'rgba(0,0,0,0.7)', color: shot.color, border: `1px solid ${shot.color}44` }}
        >
          {shot.badge}
        </div>
        {/* Timing */}
        <div
          className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded font-mono"
          style={{ fontSize: 9, background: 'rgba(0,0,0,0.7)', color: 'rgba(255,255,255,0.5)' }}
        >
          {fmt(scene.startTime || 0)} → {fmt((scene.startTime || 0) + (scene.duration || 0))}
        </div>
      </div>

      {/* Info */}
      <div className="p-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="font-display font-bold tracking-wider" style={{ fontSize: 9, color: '#b44fff' }}>
            {scene.section?.toUpperCase() || `SCENE ${index + 1}`}
          </span>
          <span className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
            {scene.duration}s
          </span>
        </div>
        {scene.textOverlay && (
          <div
            className="font-mono rounded px-1.5 py-1 mb-1 truncate"
            style={{ fontSize: 9, background: 'rgba(0,229,255,0.07)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.12)' }}
          >
            "{scene.textOverlay}"
          </div>
        )}
        {scene.cameraMovement && (
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>📷 {scene.cameraMovement}</div>
        )}
      </div>
    </div>
  )
}

export default function AIVideoCreatorView() {
  const { lyricAnalysis } = useStudioStore()

  const [videoType,    setVideoType]   = useState('music_video')
  const [visualStyle,  setVisualStyle] = useState('cinematic')
  const [platform,     setPlatform]    = useState('YouTube')
  const [prompt,       setPrompt]      = useState('')
  const [lyrics,       setLyrics]      = useState('')
  const [artistName,   setArtistName]  = useState('')
  const [songTitle,    setSongTitle]   = useState('')
  const [duration,     setDuration]    = useState(180)
  const [mood,         setMood]        = useState('Energetic')

  const [scenes,       setScenes]      = useState([])
  const [script,       setScript]      = useState(null)
  const [selected,     setSelected]    = useState(null)
  const [generating,   setGenerating]  = useState(false)
  const [genStatus,    setGenStatus]   = useState('')
  const [activeTab,    setActiveTab]   = useState('storyboard')
  const [projectTitle, setProjectTitle]= useState('Untitled Video')

  const pullFromAnalyzer = useCallback(() => {
    if (!lyricAnalysis) return
    setArtistName(lyricAnalysis.artistName || '')
    setSongTitle(lyricAnalysis.songTitle || '')
    const lines = (lyricAnalysis.lines || []).map(l => l.text).join('\n')
    setLyrics(lines)
    const style = lyricAnalysis.styleProfile?.flow || 'hip-hop'
    const pat   = lyricAnalysis.pattern || 'mixed'
    setPrompt(
      `Create a ${style} music video for "${lyricAnalysis.songTitle}" by ${lyricAnalysis.artistName}. ` +
      `The song has a ${pat} rhyme scheme and ${lyricAnalysis.styleProfile?.style || 'energetic'} energy.`
    )
  }, [lyricAnalysis])

  const generate = useCallback(async () => {
    if (!prompt.trim() && !lyrics.trim()) return
    setGenerating(true)
    setScenes([])
    setScript(null)
    setSelected(null)
    setGenStatus('Analyzing concept…')
    try {
      const model  = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const typeLabel  = VIDEO_TYPES.find(t => t.id === videoType)?.label  || videoType
      const styleLabel = VISUAL_STYLES.find(s => s.id === visualStyle)?.label || visualStyle
      const sceneCount = Math.max(6, Math.floor(duration / 10))

      const sysPrompt = `You are an award-winning video director and storyboard artist. Create a cinematic storyboard for a ${typeLabel}.

BRIEF:
- Platform: ${platform}
- Visual Style: ${styleLabel}
- Total Duration: ${duration} seconds
- Mood: ${mood}
- Artist: ${artistName || 'Unknown'}
- Song/Title: ${songTitle || 'Untitled'}
${prompt ? `- Concept: ${prompt}` : ''}
${lyrics ? `- Lyrics:\n${lyrics.slice(0, 2500)}` : ''}

Return ONLY valid JSON (no markdown fences) with exactly this structure:
{
  "title": "video title string",
  "concept": "2-3 sentence creative vision",
  "colorPalette": ["#hex","#hex","#hex"],
  "directorNotes": "paragraph of overall direction and vision",
  "scenes": [
    {
      "section": "INTRO | VERSE 1 | PRE-CHORUS | CHORUS | BRIDGE | OUTRO | etc",
      "startTime": 0,
      "duration": 8,
      "shotType": "wide|medium|closeup|extreme_closeup|aerial|pov|tracking|static",
      "visualDescription": "detailed 1-2 sentence visual description",
      "cameraMovement": "slow push in | dolly left | crane up | static | etc",
      "textOverlay": "text shown on screen or null",
      "mood": "single evocative phrase",
      "lighting": "lighting setup description",
      "emoji": "single emoji",
      "transition": "cut|fade|dissolve|wipe|flash|zoom"
    }
  ]
}

Generate exactly ${sceneCount} scenes that cover all ${duration} seconds. Make it creative and professional.`

      setGenStatus('Generating scenes…')
      const result = await model.generateContent(sysPrompt)
      let text = result.response.text().trim()
      if (text.includes('```')) {
        const m = text.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (m) text = m[1].trim()
      }
      setGenStatus('Building storyboard…')
      const parsed = JSON.parse(text)
      setScript(parsed)
      setScenes(parsed.scenes || [])
      setProjectTitle(parsed.title || songTitle || 'AI Video')
      setSelected(0)
    } catch (err) {
      console.error(err)
      setGenStatus('Error: ' + (err.message || 'Generation failed'))
    } finally {
      setGenerating(false)
    }
  }, [prompt, lyrics, videoType, visualStyle, platform, duration, mood, artistName, songTitle])

  const regenScene = useCallback(async (idx) => {
    if (!script) return
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const old   = scenes[idx]
      const res   = await model.generateContent(
        `Regenerate this video scene differently. Return ONLY a JSON object (no markdown).\n` +
        `Original: ${JSON.stringify(old)}\nVideo concept: ${script.concept}\nStyle: ${visualStyle}\n` +
        `Keep the same startTime (${old.startTime}), duration (${old.duration}), and section (${old.section}).`
      )
      let text = res.response.text().trim()
      if (text.includes('```')) { const m = text.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) text = m[1].trim() }
      const newScene = JSON.parse(text)
      setScenes(prev => prev.map((s, i) => i === idx ? newScene : s))
    } catch (err) { console.error(err) }
  }, [script, scenes, visualStyle])

  const totalDur  = scenes.reduce((s, c) => s + (c.duration || 0), 0)
  const selScene  = selected !== null ? scenes[selected] : null
  const canGen    = !generating && (prompt.trim() || lyrics.trim())

  return (
    <div className="flex flex-col h-full" style={{ background: '#080810', color: '#e0e0ff' }}>

      {/* ── Top bar ── */}
      <div
        className="flex items-center gap-3 px-4 py-2 shrink-0"
        style={{ background: '#0d0d1f', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span
          className="text-sm font-display tracking-widest uppercase shrink-0"
          style={{ background: 'linear-gradient(90deg,#ff2d55,#b44fff,#00e5ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >
          AI Video Creator
        </span>
        <div className="w-px h-4 shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />
        <input
          value={projectTitle}
          onChange={e => setProjectTitle(e.target.value)}
          className="bg-transparent text-sm font-mono outline-none flex-1"
          style={{ color: 'rgba(255,255,255,0.55)', minWidth: 0 }}
          placeholder="Project title…"
        />
        <div className="flex gap-1 shrink-0">
          {['storyboard','script','notes'].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className="px-3 py-1 rounded text-xs font-ui font-semibold capitalize transition-all"
              style={{
                background: activeTab === t ? 'rgba(0,229,255,0.12)' : 'transparent',
                color:      activeTab === t ? '#00e5ff' : 'rgba(255,255,255,0.35)',
                border:     activeTab === t ? '1px solid rgba(0,229,255,0.28)' : '1px solid transparent',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left config panel ── */}
        <div
          className="flex flex-col shrink-0 overflow-y-auto"
          style={{ width: 272, borderRight: '1px solid rgba(255,255,255,0.06)', background: '#0a0a18' }}
        >
          <div className="p-4 space-y-4">

            {/* Lyric Analyzer bridge */}
            {lyricAnalysis && (
              <div
                className="rounded-lg p-3"
                style={{ background: 'rgba(180,79,255,0.08)', border: '1px solid rgba(180,79,255,0.2)' }}
              >
                <div className="text-xs font-display tracking-wider mb-1.5" style={{ color: '#b44fff' }}>LYRIC ANALYZER</div>
                <div className="text-xs mb-2 font-ui" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  {lyricAnalysis.artistName} — {lyricAnalysis.songTitle}
                </div>
                <button
                  onClick={pullFromAnalyzer}
                  className="w-full py-1.5 rounded text-xs font-ui font-semibold transition-all"
                  style={{ background: 'rgba(180,79,255,0.15)', color: '#b44fff', border: '1px solid rgba(180,79,255,0.3)' }}
                >
                  ✦ Use This Song
                </button>
              </div>
            )}

            {/* Video type */}
            <div>
              <label className="block text-xs font-display tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>VIDEO TYPE</label>
              <div className="grid grid-cols-2 gap-1">
                {VIDEO_TYPES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setVideoType(t.id)}
                    className="px-2 py-1.5 rounded text-xs font-ui transition-all text-left leading-tight"
                    style={{
                      background: videoType === t.id ? 'rgba(0,229,255,0.1)'          : 'rgba(255,255,255,0.03)',
                      color:      videoType === t.id ? '#00e5ff'                        : 'rgba(255,255,255,0.45)',
                      border:     videoType === t.id ? '1px solid rgba(0,229,255,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Artist / Song */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-display tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>ARTIST</label>
                <input
                  value={artistName} onChange={e => setArtistName(e.target.value)}
                  placeholder="Name"
                  className="w-full px-2 py-1.5 rounded text-xs font-mono outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0e0ff' }}
                />
              </div>
              <div>
                <label className="block text-xs font-display tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>TITLE</label>
                <input
                  value={songTitle} onChange={e => setSongTitle(e.target.value)}
                  placeholder="Song / video"
                  className="w-full px-2 py-1.5 rounded text-xs font-mono outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0e0ff' }}
                />
              </div>
            </div>

            {/* Visual style */}
            <div>
              <label className="block text-xs font-display tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>VISUAL STYLE</label>
              <div className="grid grid-cols-2 gap-1">
                {VISUAL_STYLES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setVisualStyle(s.id)}
                    className="px-2 py-1.5 rounded text-xs font-ui transition-all text-left"
                    style={{
                      background: visualStyle === s.id ? `${s.color}14` : 'rgba(255,255,255,0.03)',
                      color:      visualStyle === s.id ? s.color          : 'rgba(255,255,255,0.45)',
                      border:     visualStyle === s.id ? `1px solid ${s.color}44` : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Platform */}
            <div>
              <label className="block text-xs font-display tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>PLATFORM</label>
              <select
                value={platform} onChange={e => setPlatform(e.target.value)}
                className="w-full px-2 py-1.5 rounded text-xs font-mono outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e0e0ff' }}
              >
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-display tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                DURATION — {Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2,'0')}
              </label>
              <input
                type="range" min={15} max={600} step={15}
                value={duration} onChange={e => setDuration(Number(e.target.value))}
                className="w-full accent-studio-cyan"
              />
              <div className="flex justify-between text-xs font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.22)' }}>
                <span>0:15</span><span>3:00</span><span>10:00</span>
              </div>
            </div>

            {/* Mood */}
            <div>
              <label className="block text-xs font-display tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>MOOD</label>
              <select
                value={mood} onChange={e => setMood(e.target.value)}
                className="w-full px-2 py-1.5 rounded text-xs font-mono outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#e0e0ff' }}
              >
                {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Lyrics */}
            <div>
              <label className="block text-xs font-display tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>LYRICS (optional)</label>
              <textarea
                value={lyrics} onChange={e => setLyrics(e.target.value)}
                placeholder="Paste lyrics here for lyric-video sync…"
                rows={4}
                className="w-full px-2 py-1.5 rounded text-xs font-mono outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0e0ff' }}
              />
            </div>

            {/* Concept prompt */}
            <div>
              <label className="block text-xs font-display tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>CONCEPT / DIRECTION</label>
              <textarea
                value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder="Describe your video concept, story, visual ideas…"
                rows={4}
                className="w-full px-2 py-1.5 rounded text-xs font-mono outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0e0ff' }}
              />
            </div>

            {/* Generate */}
            <button
              onClick={generate}
              disabled={!canGen}
              className="w-full py-3 rounded-lg font-display font-bold text-sm tracking-widest uppercase transition-all"
              style={{
                background: canGen
                  ? 'linear-gradient(135deg,#ff2d55,#b44fff,#00e5ff)'
                  : 'rgba(255,255,255,0.05)',
                color:  canGen ? '#fff' : 'rgba(255,255,255,0.25)',
                cursor: canGen ? 'pointer' : 'not-allowed',
                boxShadow: canGen ? '0 0 24px rgba(180,79,255,0.3)' : 'none',
              }}
            >
              {generating ? genStatus : '✦ Generate Storyboard'}
            </button>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Empty state */}
          {scenes.length === 0 && !generating && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
              <div style={{ fontSize: 72, lineHeight: 1 }}>🎬</div>
              <div
                className="font-display text-2xl tracking-widest"
                style={{ background: 'linear-gradient(90deg,#ff2d55,#b44fff,#00e5ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
              >
                AI VIDEO CREATOR
              </div>
              <div className="text-sm font-ui max-w-md" style={{ color: 'rgba(255,255,255,0.38)', lineHeight: 1.7 }}>
                Describe your concept, paste your lyrics, pick a visual style — and Gemini AI will generate a
                complete shot-by-shot storyboard with camera directions, lighting, text overlays, and transitions.
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {['🎵 Music Videos','📱 Shorts & Reels','🎬 YouTube Videos','✍ Lyric Videos','📢 Promos & Ads','◉ Audio Visualizers'].map(f => (
                  <div
                    key={f}
                    className="px-3 py-2 rounded-lg text-xs font-ui text-center"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.45)' }}
                  >
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {generating && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div
                className="w-16 h-16 rounded-full border-2 border-transparent animate-spin"
                style={{ borderTopColor: '#b44fff', borderRightColor: '#00e5ff' }}
              />
              <div className="font-display text-sm tracking-widest" style={{ color: '#b44fff' }}>{genStatus}</div>
              <div className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.28)' }}>
                Gemini AI is crafting your storyboard…
              </div>
            </div>
          )}

          {/* Storyboard tab */}
          {!generating && scenes.length > 0 && activeTab === 'storyboard' && (
            <div className="flex-1 overflow-y-auto p-4">
              {/* Concept header */}
              {script && (
                <div
                  className="rounded-lg p-4 mb-4"
                  style={{ background: 'rgba(180,79,255,0.06)', border: '1px solid rgba(180,79,255,0.14)' }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-base tracking-wider mb-1" style={{ color: '#b44fff' }}>
                        {script.title}
                      </div>
                      <div className="text-sm font-ui" style={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.55 }}>
                        {script.concept}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0 mt-0.5">
                      {(script.colorPalette || []).map((c, i) => (
                        <div
                          key={i}
                          className="w-5 h-5 rounded-full"
                          style={{ background: c, border: '1px solid rgba(255,255,255,0.18)' }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-3 font-mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)' }}>
                    <span>🎬 {scenes.length} scenes</span>
                    <span>⏱ {fmt(totalDur)}</span>
                    <span>📺 {platform}</span>
                    <span>🎨 {VISUAL_STYLES.find(s => s.id === visualStyle)?.label}</span>
                    <span>✦ {mood}</span>
                  </div>
                </div>
              )}

              {/* Scene grid */}
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))' }}
              >
                {scenes.map((scene, i) => (
                  <SceneCard
                    key={i}
                    scene={scene}
                    index={i}
                    isSelected={selected === i}
                    onClick={() => setSelected(i)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Script tab */}
          {!generating && scenes.length > 0 && activeTab === 'script' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto space-y-5">
                <div
                  className="font-display text-xl tracking-widest text-center mb-8"
                  style={{ color: '#00e5ff' }}
                >
                  {script?.title?.toUpperCase()}
                </div>
                {scenes.map((sc, i) => {
                  const shot = SHOT_MAP[sc.shotType] || SHOT_MAP.medium
                  return (
                    <div
                      key={i}
                      className="rounded-lg p-4"
                      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <span
                          className="font-mono px-2 py-0.5 rounded text-xs"
                          style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff' }}
                        >
                          SCENE {i + 1}
                        </span>
                        <span className="font-display text-sm tracking-wider" style={{ color: '#b44fff' }}>
                          {sc.section}
                        </span>
                        <span className="font-mono text-xs ml-auto" style={{ color: 'rgba(255,255,255,0.28)' }}>
                          {fmt(sc.startTime || 0)} — {fmt((sc.startTime || 0) + (sc.duration || 0))}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        {[
                          ['SHOT',       shot.label],
                          ['CAMERA',     sc.cameraMovement],
                          ['LIGHTING',   sc.lighting],
                          ['TRANSITION', sc.transition],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <span style={{ color: 'rgba(255,255,255,0.32)' }}>{k}: </span>
                            <span style={{ color: 'rgba(255,255,255,0.68)' }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-sm font-ui" style={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.55 }}>
                        {sc.visualDescription}
                      </div>
                      {sc.textOverlay && (
                        <div
                          className="mt-2 px-3 py-2 rounded font-mono text-sm"
                          style={{ background: 'rgba(0,229,255,0.06)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.14)' }}
                        >
                          OVERLAY: "{sc.textOverlay}"
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Director's notes tab */}
          {!generating && scenes.length > 0 && activeTab === 'notes' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto">
                <div className="font-display text-lg tracking-wider mb-4" style={{ color: '#ffe600' }}>
                  DIRECTOR'S NOTES
                </div>
                <div
                  className="rounded-lg p-5 text-sm font-ui"
                  style={{
                    background: 'rgba(255,230,0,0.04)',
                    border: '1px solid rgba(255,230,0,0.14)',
                    color: 'rgba(255,255,255,0.68)',
                    lineHeight: 1.75,
                  }}
                >
                  {script?.directorNotes || 'No notes generated.'}
                </div>

                {script?.colorPalette?.length > 0 && (
                  <div className="mt-6">
                    <div className="font-display text-sm tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      COLOR PALETTE
                    </div>
                    <div className="flex gap-3">
                      {script.colorPalette.map((c, i) => (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <div
                            className="w-12 h-12 rounded-lg"
                            style={{ background: c, border: '1px solid rgba(255,255,255,0.18)' }}
                          />
                          <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right detail panel ── */}
        {selScene && (
          <div
            className="shrink-0 overflow-y-auto"
            style={{ width: 248, borderLeft: '1px solid rgba(255,255,255,0.06)', background: '#0a0a18' }}
          >
            <div className="p-4 space-y-4">
              <div className="text-xs font-display tracking-widest uppercase" style={{ color: '#00e5ff' }}>
                Scene {(selected || 0) + 1} Details
              </div>

              {/* Mini thumbnail */}
              <div
                className="rounded-lg flex items-center justify-center"
                style={{ height: 108, background: SCENE_GRADIENTS[(selected || 0) % SCENE_GRADIENTS.length] }}
              >
                <div style={{ fontSize: 40 }}>{selScene.emoji || '🎬'}</div>
              </div>

              <div className="space-y-3 text-xs">
                {[
                  ['SECTION',    selScene.section,          '#b44fff'],
                  ['TIMING',     `${fmt(selScene.startTime||0)} → ${fmt((selScene.startTime||0)+(selScene.duration||0))} (${selScene.duration}s)`, 'rgba(255,255,255,0.65)'],
                  ['SHOT TYPE',  (SHOT_MAP[selScene.shotType]||SHOT_MAP.medium).label, '#00ff9d'],
                  ['CAMERA',     selScene.cameraMovement,   'rgba(255,255,255,0.65)'],
                  ['LIGHTING',   selScene.lighting,         'rgba(255,255,255,0.65)'],
                  ['MOOD',       selScene.mood,             '#ffe600'],
                  ['TRANSITION', selScene.transition,       'rgba(255,255,255,0.65)'],
                ].map(([k, v, c]) => (
                  <div key={k}>
                    <div className="font-display tracking-wider mb-0.5" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{k}</div>
                    <div style={{ color: c }}>{v}</div>
                  </div>
                ))}

                <div>
                  <div className="font-display tracking-wider mb-0.5" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>VISUAL</div>
                  <div style={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.5 }}>{selScene.visualDescription}</div>
                </div>

                {selScene.textOverlay && (
                  <div>
                    <div className="font-display tracking-wider mb-0.5" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>TEXT OVERLAY</div>
                    <div
                      className="px-2 py-1.5 rounded font-mono"
                      style={{ background: 'rgba(0,229,255,0.07)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.18)' }}
                    >
                      "{selScene.textOverlay}"
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => regenScene(selected || 0)}
                className="w-full py-2 rounded text-xs font-ui font-semibold transition-all"
                style={{ background: 'rgba(255,45,85,0.1)', color: '#ff2d55', border: '1px solid rgba(255,45,85,0.24)' }}
              >
                ↺ Regenerate This Scene
              </button>

              <button
                onClick={() => { setSelected(Math.max(0, (selected||0) - 1)) }}
                disabled={selected === 0}
                className="w-full py-1.5 rounded text-xs font-ui font-semibold transition-all"
                style={{
                  background: selected === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
                  color: selected === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                ← Previous Scene
              </button>
              <button
                onClick={() => { setSelected(Math.min(scenes.length - 1, (selected||0) + 1)) }}
                disabled={selected === scenes.length - 1}
                className="w-full py-1.5 rounded text-xs font-ui font-semibold transition-all"
                style={{
                  background: selected === scenes.length - 1 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
                  color: selected === scenes.length - 1 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                Next Scene →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
