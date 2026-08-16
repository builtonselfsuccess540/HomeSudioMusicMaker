import React, { useState, useRef } from 'react'
import { GoogleGenerativeAI } from '../../utils/gemini-compat'
import { useStudioStore } from '../../store/useStudioStore'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '')

// ─── MP3 → Lyrics Transcription ───────────────────────────────────────────────

async function transcribeAudioFile(file, onProgress) {
  onProgress('Reading audio file...')
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  const base64 = btoa(binary)

  onProgress('Sending to AI for transcription...')
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const mimeType = file.type || 'audio/mpeg'

  const result = await model.generateContent([
    {
      inlineData: {
        data: base64,
        mimeType,
      },
    },
    `Listen to this audio and transcribe the lyrics being rapped or sung.

Rules:
- Write out every word you can clearly hear
- Put each line on its own line
- If you can identify song sections (verse, chorus, hook, bridge) label them like [Verse 1], [Chorus], etc.
- Skip instrumental-only sections
- If a word is unclear, write your best guess in (parentheses)
- Return ONLY the transcribed lyrics with section labels — no commentary, no explanation`,
  ])

  return result.response.text().trim()
}

// ─── Rhyme Detection ──────────────────────────────────────────────────────────

const SCHEME_COLORS = [
  '#ff2d55', '#00e5ff', '#b44fff', '#00ff9d', '#ffe600',
  '#ff9500', '#ff6b9d', '#44ddff', '#ddaaff', '#c0a060',
  '#44ff88', '#ffee44', '#aa44ff', '#80ffcc', '#ff4488',
]

function getEndWord(line) {
  return line.trim().split(/\s+/).pop()?.replace(/[^a-zA-Z']/g, '').toLowerCase() || ''
}

function wordsRhyme(a, b) {
  if (!a || !b || a === b) return false
  const s = Math.min(4, Math.min(a.length, b.length))
  return s >= 3 && a.slice(-s) === b.slice(-s)
}

function analyzeEndRhymes(lines) {
  const ews = lines.map(getEndWord)
  const parent = ews.map((_, i) => i)
  const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]))
  for (let i = 0; i < ews.length; i++)
    for (let j = i + 1; j < ews.length; j++)
      if (wordsRhyme(ews[i], ews[j])) parent[find(i)] = find(j)

  const rootToIdx = {}
  let nextIdx = 0
  const labelIndices = ews.map((w, i) => {
    if (!w) return -1
    const root = find(i)
    const hasPartner = ews.some((ew, j) => j !== i && find(j) === root && ew)
    if (!hasPartner) return -1
    if (!(root in rootToIdx)) rootToIdx[root] = nextIdx++
    return rootToIdx[root]
  })

  return { labelIndices, endWords: ews }
}

function detectSchemePattern(labelIndices) {
  const filtered = labelIndices.filter((l) => l >= 0)
  if (filtered.length < 2) return 'No rhymes detected'

  const unique = new Set(filtered)
  if (unique.size === 1) return 'AAAA Chain'

  // AABB: consecutive pairs rhyme
  let aabbScore = 0, aabbChecks = 0
  const activePairs = []
  for (let i = 0; i < labelIndices.length - 1; i++) {
    if (labelIndices[i] < 0) continue
    for (let j = i + 1; j < labelIndices.length; j++) {
      if (labelIndices[j] < 0) continue
      if (labelIndices[i] === labelIndices[j]) { activePairs.push([i, j]); break }
    }
  }

  // Check consecutive pairs (AABB)
  let couplets = 0
  for (const [a, b] of activePairs) if (b - a === 1) couplets++
  if (couplets / Math.max(activePairs.length, 1) > 0.6) return 'AABB Couplet'

  // Check alternating (ABAB)
  let altMatches = 0
  for (const [a, b] of activePairs) if (b - a === 2) altMatches++
  if (altMatches / Math.max(activePairs.length, 1) > 0.5) return 'ABAB Alternating'

  // Check chain: same label for 4+ consecutive active lines
  let maxRun = 1, run = 1
  for (let i = 1; i < filtered.length; i++) {
    if (filtered[i] === filtered[i - 1]) { run++; maxRun = Math.max(maxRun, run) }
    else run = 1
  }
  if (maxRun >= 4) return 'Chain Rhyme'

  // Cross rhyme: labels interlock ABAB-ish but skip
  for (const [a, b] of activePairs) if (b - a === 3) return 'Cross Rhyme'

  return 'Mixed / Free'
}

function getInternalRhymes(line) {
  const words = line.trim().split(/\s+/).map((w) => w.replace(/[^a-zA-Z']/g, '').toLowerCase())
  const highlighted = new Set()
  for (let a = 0; a < words.length - 1; a++)
    for (let b = a + 1; b < words.length; b++)
      if (words[a] && words[b] && wordsRhyme(words[a], words[b])) {
        highlighted.add(a); highlighted.add(b)
      }
  return highlighted
}

// ─── Syllable Counter ─────────────────────────────────────────────────────────

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!word) return 0
  if (word.length <= 3) return 1
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
  word = word.replace(/^y/, '')
  const m = word.match(/[aeiouy]{1,2}/g)
  return Math.max(1, m ? m.length : 1)
}

function countLineSyllables(line) {
  if (!line.trim()) return 0
  return line.trim().split(/\s+/).reduce((sum, w) => sum + countSyllables(w), 0)
}

// ─── Style tag chips ──────────────────────────────────────────────────────────

const STYLE_COLORS = {
  'Trap': '#44ff88', 'Boom Bap': '#00e5ff', 'Drill': '#ff2d55',
  'Melodic': '#ff9500', 'Gospel Rap': '#ddaaff', 'Conscious': '#ffe600',
  'Jazz Rap': '#c0a060', 'Storytelling': '#ff6b9d', 'Battle Rap': '#ff4444',
  'Double-time': '#b44fff', 'Triplet flow': '#44ddff', 'Half-time': '#80ffcc',
  'Multisyllabic': '#00ff9d', 'Internal Rhyme': '#b44fff', 'Slant Rhyme': '#c0a060',
  'Punchlines': '#ff9500', 'Wordplay': '#00e5ff', 'Biblical refs': '#ffe600',
  'Metaphors': '#ff6b9d', 'Similes': '#ff9500', 'Storytelling': '#ffcc44',
  default: '#888899',
}

function StyleChip({ label }) {
  const color = STYLE_COLORS[label] || STYLE_COLORS.default
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-ui font-semibold border"
      style={{ borderColor: color + '66', color, background: color + '15' }}
    >
      {label}
    </span>
  )
}

// ─── Line Renderer ────────────────────────────────────────────────────────────

function AnalyzedLine({ line, lineIdx, labelIndex, showInternal }) {
  const color = labelIndex >= 0 ? SCHEME_COLORS[labelIndex % SCHEME_COLORS.length] : null
  const letter = labelIndex >= 0 ? String.fromCharCode(65 + (labelIndex % 26)) : null
  const internalSet = showInternal ? getInternalRhymes(line) : new Set()
  const words = line.trim().split(/\s+/)
  const syllables = countLineSyllables(line)

  return (
    <div className="flex items-start gap-2 group py-0.5">
      <span className="text-xs font-mono text-studio-dim w-5 shrink-0 mt-1 text-right">{lineIdx + 1}</span>
      <div className="flex flex-wrap gap-x-1 gap-y-0 flex-1 font-ui text-sm leading-7">
        {words.map((word, wi) => {
          const isInternal = internalSet.has(wi)
          const isLastWord = wi === words.length - 1 && color
          return (
            <span
              key={wi}
              className="rounded px-0.5 transition-all"
              style={{
                color: isLastWord ? color : isInternal ? '#b44fff' : '#c0c0d0',
                background: isInternal && !isLastWord ? 'rgba(180,79,255,0.12)' : 'transparent',
                border: isInternal && !isLastWord ? '1px solid rgba(180,79,255,0.3)' : '1px solid transparent',
                fontWeight: isLastWord ? 600 : 400,
              }}
              title={isInternal ? 'Internal rhyme' : undefined}
            >
              {word}
            </span>
          )
        })}
      </div>
      {/* Syllable count */}
      <span
        className="shrink-0 text-xs font-mono mt-1 w-6 text-right opacity-40 group-hover:opacity-90 transition-opacity select-none"
        style={{ color: color || '#888899' }}
        title={`${syllables} syllables`}
      >
        {syllables}
      </span>
      {/* Rhyme letter badge */}
      {letter ? (
        <span
          className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs font-mono font-bold mt-0.5"
          style={{ background: color + '22', color, border: `1px solid ${color}66` }}
          title={`Rhyme group ${letter}`}
        >
          {letter}
        </span>
      ) : (
        <span className="shrink-0 w-5 h-5 mt-0.5" />
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LyricAnalyzerView() {
  const { setLyricAnalysis } = useStudioStore()

  const [inputLyrics, setInputLyrics] = useState('')
  const [artistName, setArtistName] = useState('')
  const [songTitle, setSongTitle] = useState('')
  const [analyzed, setAnalyzed] = useState(null)
  const [styleProfile, setStyleProfile] = useState(null)
  const [loadingStyle, setLoadingStyle] = useState(false)
  const [showInternal, setShowInternal] = useState(false)

  // Audio transcription
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeStatus, setTranscribeStatus] = useState('')
  const [transcribeError, setTranscribeError] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef(null)

  // Generator
  const [genTopic, setGenTopic] = useState('')
  const [genLines, setGenLines] = useState([])
  const [genRaw, setGenRaw] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genDone, setGenDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const textareaRef = useRef(null)

  const handleAudioFile = async (file) => {
    if (!file) return
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/webm']
    const isAudio = allowedTypes.includes(file.type) || /\.(mp3|wav|m4a|ogg|webm|mp4)$/i.test(file.name)
    if (!isAudio) {
      setTranscribeError('Please upload an audio file (.mp3, .wav, .m4a, .ogg)')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setTranscribeError('File too large (max 50 MB). Try a shorter clip.')
      return
    }
    setTranscribing(true)
    setTranscribeError('')
    setTranscribeStatus('')
    // Pre-fill song info from filename
    const baseName = file.name.replace(/\.[^.]+$/, '')
    if (!songTitle) setSongTitle(baseName)
    try {
      const lyrics = await transcribeAudioFile(file, setTranscribeStatus)
      setInputLyrics(lyrics)
      setTranscribeStatus('Transcription complete!')
    } catch (e) {
      setTranscribeError(`Transcription failed: ${e.message}`)
    } finally {
      setTranscribing(false)
    }
  }

  const handleFileDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleAudioFile(file)
  }

  const handleAnalyze = async () => {
    const raw = inputLyrics.trim()
    if (!raw) return

    const lines = raw.split('\n').filter((l) => l.trim())
    const { labelIndices, endWords } = analyzeEndRhymes(lines)
    const pattern = detectSchemePattern(labelIndices)
    const groupCount = new Set(labelIndices.filter((l) => l >= 0)).size
    const rhymingLines = labelIndices.filter((l) => l >= 0).length

    setAnalyzed({ lines, labelIndices, endWords, pattern, groupCount, rhymingLines })
    setStyleProfile(null)
    setGenLines([])
    setGenDone(false)

    // Kick off AI style analysis
    setLoadingStyle(true)
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const context = artistName ? `Artist: ${artistName}${songTitle ? ` — Song: ${songTitle}` : ''}` : ''
      const result = await model.generateContent(
        `Analyze these rap/hip-hop lyrics and identify the style, flow, and techniques.${context ? `\n${context}` : ''}

LYRICS:
${raw.slice(0, 2000)}

Return a JSON object with these exact keys:
{
  "flowStyle": "one of: Trap, Boom Bap, Drill, Melodic, Gospel Rap, Conscious, Jazz Rap, Battle Rap, or custom",
  "cadence": "one of: Double-time, Half-time, Triplet flow, On-beat, Mixed",
  "rhymeComplexity": "one of: Simple, Compound, Multisyllabic, Slant/Near",
  "bpmFeel": "Slow (60-80), Mid (80-100), Fast (100-140), or Very Fast (140+)",
  "techniques": ["array", "of", "techniques", "like", "Punchlines", "Wordplay", "Metaphors", "Similes", "Storytelling", "Biblical refs", "Internal Rhyme", "Double meaning"],
  "mood": "overall emotional tone in 3-5 words",
  "similarArtists": ["2-3 artist names"],
  "summary": "2-3 sentence description of the lyrical style, what makes it distinctive, and how someone could write in this style"
}

Return ONLY valid JSON. No markdown, no explanation.`
      )
      const text = result.response.text().replace(/```json?|```/g, '').trim()
      const parsed = JSON.parse(text)
      setStyleProfile(parsed)
      // Share with AI Co-Pilot
      setLyricAnalysis({
        artistName, songTitle,
        lines,
        pattern,
        styleProfile: parsed,
        analyzedAt: Date.now(),
      })
    } catch (e) {
      setStyleProfile({ error: 'Could not analyze style — check your API key or try again.' })
      // Still share the rhyme scheme even if style AI failed
      setLyricAnalysis({ artistName, songTitle, lines, pattern, styleProfile: null, analyzedAt: Date.now() })
    } finally {
      setLoadingStyle(false)
    }
  }

  const handleGenerate = async () => {
    if (!genTopic.trim() || !analyzed) return
    setGenerating(true)
    setGenLines([])
    setGenRaw('')
    setGenDone(false)

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

      const styleContext = styleProfile && !styleProfile.error
        ? `Flow style: ${styleProfile.flowStyle}
Cadence: ${styleProfile.cadence}
Rhyme complexity: ${styleProfile.rhymeComplexity}
Techniques: ${(styleProfile.techniques || []).join(', ')}
Style summary: ${styleProfile.summary || ''}`
        : `Rhyme scheme: ${analyzed.pattern}`

      const refLyrics = analyzed.lines.slice(0, 12).join('\n')

      const schemeInstruction = analyzed.pattern === 'AABB Couplet'
        ? 'Use AABB couplet rhyme — every consecutive pair of lines must rhyme.'
        : analyzed.pattern === 'ABAB Alternating'
        ? 'Use ABAB alternating rhyme — lines 1&3 rhyme, lines 2&4 rhyme.'
        : analyzed.pattern === 'Chain Rhyme' || analyzed.pattern === 'AAAA Chain'
        ? 'Use chain/mono rhyme — sustain one rhyme sound for 4-8 lines before switching.'
        : analyzed.pattern === 'Cross Rhyme'
        ? 'Use cross rhyme — set up rhymes in bars 1 & 2, resolve them in bars 4 & 3 respectively.'
        : 'Use a mix of end rhymes, internal rhymes, and slant rhymes freely.'

      const artistRef = artistName ? `\nMatch the style of: ${artistName}` : ''

      const prompt = `Write a 16-bar verse about "${genTopic}" in this exact lyrical style:

STYLE PROFILE:
${styleContext}
${artistRef}

RHYME SCHEME RULE: ${schemeInstruction}

REFERENCE LYRICS (match this energy and technique level):
${refLyrics}

RULES:
- Write exactly 16 lines
- Apply all the identified techniques from the style profile
- Natural speech first — never force a rhyme that sounds awkward
- Every line must earn its place — no filler
- Match the syllable density of the reference lyrics
- Do NOT copy any lines from the reference — write something new about "${genTopic}"

Return ONLY the 16 bare lines, one per line. No section labels, no numbering, no explanation.`

      const resultStream = await model.generateContentStream(prompt)
      let full = ''
      for await (const chunk of resultStream.stream) {
        full += chunk.text()
        const ls = full.split('\n').map((l) => l.trim()).filter(Boolean)
        setGenLines(ls)
        setGenRaw(full)
      }
      setGenDone(true)
    } catch (e) {
      setGenLines([`Error: ${e.message}`])
    } finally {
      setGenerating(false)
    }
  }

  const copyGenerated = () => {
    navigator.clipboard.writeText(genLines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const sendToLyrics = () => {
    // Store in localStorage for LyricsView to pick up (simple cross-tab communication)
    const transfer = JSON.stringify({ topic: genTopic, lines: genLines, ts: Date.now() })
    localStorage.setItem('hsmm_lyric_transfer', transfer)
    window.alert('Lyrics copied to clipboard! Paste them in the Lyrics tab.')
    copyGenerated()
  }

  const noKey = !import.meta.env.VITE_GEMINI_API_KEY

  return (
    <div className="flex h-full bg-studio-void overflow-hidden">

      {/* ── Left: Input ──────────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-studio-border bg-studio-panel">
        <div className="px-4 py-3 border-b border-studio-border">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-2 h-2 rounded-full bg-studio-purple" style={{ boxShadow: '0 0 6px #b44fff' }} />
            <span className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase">
              Lyric Analyzer
            </span>
          </div>
          <p className="text-xs text-studio-dim font-ui mt-1">
            Paste any song's lyrics to detect rhyme schemes, rap style, and flow techniques — then generate new lyrics in that style.
          </p>
        </div>

        <div className="flex flex-col gap-3 p-4 flex-1 overflow-y-auto">
          {/* Artist + Song */}
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder="Artist name (optional)"
              className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2 text-xs font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-purple"
            />
            <input
              type="text"
              value={songTitle}
              onChange={(e) => setSongTitle(e.target.value)}
              placeholder="Song title (optional)"
              className="w-full bg-studio-void border border-studio-border rounded-lg px-3 py-2 text-xs font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-purple"
            />
          </div>

          {/* Audio file upload zone */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">From Audio File</span>
              <span className="text-xs font-mono text-studio-dim">MP3 / WAV / M4A</span>
            </div>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => !transcribing && fileInputRef.current?.click()}
              className="rounded-xl border-2 border-dashed px-4 py-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all"
              style={{
                borderColor: isDragOver ? '#b44fff' : transcribing ? '#00e5ff' : '#252540',
                background: isDragOver ? 'rgba(180,79,255,0.07)' : transcribing ? 'rgba(0,229,255,0.05)' : 'transparent',
              }}
            >
              {transcribing ? (
                <>
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-studio-cyan"
                        style={{ animation: `vu-pulse 1s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                  <span className="text-xs font-mono text-studio-cyan text-center">{transcribeStatus || 'Transcribing...'}</span>
                </>
              ) : (
                <>
                  <span className="text-2xl opacity-60">🎵</span>
                  <span className="text-xs font-ui text-studio-dim text-center">
                    Drop an audio file here<br />or click to browse
                  </span>
                  <span className="text-xs font-mono text-studio-dim opacity-60">Max 50 MB</span>
                </>
              )}
            </div>
            {transcribeError && (
              <div className="mt-1.5 text-xs font-mono text-studio-red bg-studio-red/10 border border-studio-red/30 rounded-lg px-3 py-1.5">
                {transcribeError}
              </div>
            )}
            {transcribeStatus === 'Transcription complete!' && !transcribing && (
              <div className="mt-1.5 text-xs font-mono text-studio-green text-center">✓ Lyrics extracted — review below</div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg"
              className="hidden"
              onChange={(e) => handleAudioFile(e.target.files?.[0])}
            />
          </div>

          {/* Lyrics textarea */}
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">Lyrics</span>
              {inputLyrics && (
                <button
                  onClick={() => { setInputLyrics(''); setAnalyzed(null); setStyleProfile(null); setTranscribeStatus('') }}
                  className="text-xs font-mono text-studio-dim hover:text-studio-red transition-colors"
                >
                  clear
                </button>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={inputLyrics}
              onChange={(e) => setInputLyrics(e.target.value)}
              placeholder={`Paste lyrics here, or drop an audio file above to extract them automatically…`}
              className="flex-1 min-h-0 bg-studio-void border border-studio-border rounded-xl px-4 py-3 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-purple resize-none leading-6"
              style={{ minHeight: 200 }}
            />
            <div className="text-xs font-mono text-studio-dim text-right">
              {inputLyrics.split('\n').filter((l) => l.trim()).length} lines
            </div>
          </div>

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={!inputLyrics.trim() || noKey}
            className="w-full py-3 rounded-xl font-display font-bold text-sm text-black transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #b44fff, #00e5ff)', boxShadow: inputLyrics.trim() ? '0 0 16px rgba(180,79,255,0.3)' : 'none' }}
          >
            ✦ Analyze Lyrics
          </button>

          {noKey && (
            <div className="text-xs font-mono text-studio-red bg-studio-red/10 border border-studio-red/30 rounded-lg px-3 py-2">
              No Gemini API key. Add VITE_GEMINI_API_KEY to .env
            </div>
          )}

          {/* Sample lyrics for quick testing */}
          {!inputLyrics && (
            <div className="border-t border-studio-border pt-3">
              <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">Try a sample</div>
              <button
                onClick={() => setInputLyrics(`I stay focused on the grind, never losing track of time
Every bar I spit is fire, every rhyme is by design
Built from nothing, now I'm rising, watch me reach a higher climb
In this game of life I'm winning, I was born to shine and shine

They said I couldn't do it, now they're playing catch-up fast
Everything I touch turns golden, built to forever last
Started from the bottom, never let 'em see me crack
Made it out the struggle, and I'm never going back`)}
                className="w-full text-left px-3 py-2 rounded-lg border border-studio-border text-xs font-ui text-studio-dim hover:text-studio-text hover:border-studio-purple transition-colors"
              >
                Load sample rap verse →
              </button>
              <button
                onClick={() => setInputLyrics(`Started with a dream, ended with a throne
Every single scar became a stepping stone
Planted in the dark, watch me reach the light
Faith kept me moving through the longest night

Rose from the ashes, nobody believed
Now I'm walking in the blessings that I once conceived
Every door they closed became a window wide
Jesus on my left and He is on my right`)}
                className="w-full text-left px-3 py-2 rounded-lg border border-studio-border text-xs font-ui text-studio-dim hover:text-studio-text hover:border-studio-cyan transition-colors mt-1.5"
              >
                Load sample gospel rap →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Center: Analysis Results ──────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {!analyzed ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 opacity-40">
            <div className="text-6xl">🔍</div>
            <div>
              <div className="font-display text-lg font-semibold text-studio-text mb-1">No lyrics analyzed yet</div>
              <div className="text-sm text-studio-dim font-ui max-w-xs">
                Paste lyrics into the left panel and click Analyze Lyrics
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            {/* Analysis header bar */}
            <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-3 bg-studio-panel border-b border-studio-border flex-wrap">
              <div
                className="px-3 py-1 rounded-full text-xs font-mono font-bold border"
                style={{ color: '#b44fff', borderColor: '#b44fff55', background: 'rgba(180,79,255,0.1)' }}
              >
                {analyzed.pattern}
              </div>
              <span className="text-xs font-mono text-studio-dim">
                {analyzed.lines.length} lines · {analyzed.groupCount} rhyme group{analyzed.groupCount !== 1 ? 's' : ''} · {analyzed.rhymingLines} rhyming
              </span>
              {artistName && (
                <span className="text-xs font-ui text-studio-dim">
                  {artistName}{songTitle ? ` — ${songTitle}` : ''}
                </span>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setShowInternal((v) => !v)}
                className="px-2.5 py-1 rounded text-xs font-ui font-semibold border transition-all"
                style={{
                  borderColor: showInternal ? '#b44fff' : '#252540',
                  color: showInternal ? '#b44fff' : '#888899',
                  background: showInternal ? 'rgba(180,79,255,0.1)' : 'transparent',
                }}
              >
                {showInternal ? '◉' : '○'} Internal rhymes
              </button>
            </div>

            {/* Visual rhyme-scheme map — one tile per line */}
            <div className="px-5 py-3 bg-studio-void border-b border-studio-border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">Scheme Map</span>
                <span className="text-xs font-mono text-studio-dim opacity-60">— one tile per line</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {analyzed.labelIndices.map((idx, i) => {
                  const color = idx >= 0 ? SCHEME_COLORS[idx % SCHEME_COLORS.length] : '#333350'
                  const letter = idx >= 0 ? String.fromCharCode(65 + (idx % 26)) : '·'
                  const syl = countLineSyllables(analyzed.lines[i])
                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center gap-0.5"
                      title={`Line ${i + 1}: ${analyzed.lines[i].trim().slice(0, 60)}…\n${syl} syllables · rhyme group ${letter}`}
                    >
                      <span
                        className="w-7 h-7 rounded flex items-center justify-center text-xs font-mono font-bold transition-all hover:scale-110"
                        style={{
                          background: idx >= 0 ? color + '25' : '#1a1a2a',
                          color: idx >= 0 ? color : '#444460',
                          border: `1px solid ${idx >= 0 ? color + '66' : '#252540'}`,
                        }}
                      >
                        {letter}
                      </span>
                      <span className="text-center font-mono" style={{ fontSize: 9, color: '#555570', lineHeight: 1 }}>
                        {syl}
                      </span>
                    </div>
                  )
                })}
              </div>
              {/* Rhyme-group key */}
              <div className="flex flex-wrap gap-3 mt-3">
                {Array.from(new Set(analyzed.labelIndices.filter((l) => l >= 0))).slice(0, 10).map((idx) => {
                  const color = SCHEME_COLORS[idx % SCHEME_COLORS.length]
                  const letter = String.fromCharCode(65 + (idx % 26))
                  const words = analyzed.lines
                    .filter((_, i) => analyzed.labelIndices[i] === idx)
                    .map((l) => `"${getEndWord(l)}"`)
                    .join(', ')
                  return (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span
                        className="w-4 h-4 rounded flex items-center justify-center text-xs font-mono font-bold shrink-0"
                        style={{ background: color + '22', color, border: `1px solid ${color}55` }}
                      >
                        {letter}
                      </span>
                      <span className="text-xs font-mono" style={{ color: color + 'cc' }}>{words}</span>
                    </div>
                  )
                })}
                {showInternal && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded" style={{ background: 'rgba(180,79,255,0.2)', border: '1px solid rgba(180,79,255,0.5)' }} />
                    <span className="text-xs font-mono text-studio-dim">internal rhyme</span>
                  </div>
                )}
              </div>
            </div>

            {/* Column header */}
            <div className="flex items-center gap-2 px-5 pt-3 pb-1">
              <span className="text-xs font-mono text-studio-dim w-5 text-right shrink-0">#</span>
              <span className="flex-1 text-xs font-mono text-studio-dim uppercase tracking-wider">Line</span>
              <span className="w-6 text-right text-xs font-mono text-studio-dim shrink-0" title="Syllable count">Syl</span>
              <span className="w-5 text-center text-xs font-mono text-studio-dim shrink-0">Rh</span>
            </div>

            {/* Line-by-line analysis */}
            <div className="px-5 pb-5 flex flex-col gap-0.5">
              {analyzed.lines.map((line, i) => (
                <AnalyzedLine
                  key={i}
                  line={line}
                  lineIdx={i}
                  labelIndex={analyzed.labelIndices[i]}
                  showInternal={showInternal}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right sidebar: Style Profile + Generator ──────────────── */}
      <div className="w-72 shrink-0 flex flex-col border-l border-studio-border bg-studio-panel overflow-y-auto">

        {/* Style Profile */}
        <div className="p-4 border-b border-studio-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-studio-cyan" style={{ boxShadow: '0 0 6px #00e5ff' }} />
            <span className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase">Style Profile</span>
          </div>

          {!analyzed && !loadingStyle && (
            <p className="text-xs text-studio-dim font-ui">Analyze lyrics to see the style breakdown here.</p>
          )}

          {loadingStyle && (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-mono text-studio-dim">Identifying style...</div>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-studio-cyan"
                    style={{ animation: `vu-pulse 1s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}

          {styleProfile && !loadingStyle && (
            <div className="flex flex-col gap-3">
              {styleProfile.error ? (
                <div className="text-xs font-mono text-studio-red">{styleProfile.error}</div>
              ) : (
                <>
                  {/* Flow + Cadence chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {styleProfile.flowStyle && <StyleChip label={styleProfile.flowStyle} />}
                    {styleProfile.cadence && <StyleChip label={styleProfile.cadence} />}
                    {styleProfile.rhymeComplexity && <StyleChip label={styleProfile.rhymeComplexity} />}
                  </div>

                  {/* BPM feel */}
                  {styleProfile.bpmFeel && (
                    <div>
                      <span className="text-xs font-mono text-studio-dim">BPM Feel </span>
                      <span className="text-xs font-ui text-studio-yellow">{styleProfile.bpmFeel}</span>
                    </div>
                  )}

                  {/* Mood */}
                  {styleProfile.mood && (
                    <div>
                      <span className="text-xs font-mono text-studio-dim block mb-1">Mood</span>
                      <span className="text-xs font-ui text-studio-text">{styleProfile.mood}</span>
                    </div>
                  )}

                  {/* Techniques */}
                  {styleProfile.techniques?.length > 0 && (
                    <div>
                      <span className="text-xs font-mono text-studio-dim block mb-1.5">Techniques</span>
                      <div className="flex flex-wrap gap-1">
                        {styleProfile.techniques.map((t, i) => <StyleChip key={i} label={t} />)}
                      </div>
                    </div>
                  )}

                  {/* Similar artists */}
                  {styleProfile.similarArtists?.length > 0 && (
                    <div>
                      <span className="text-xs font-mono text-studio-dim block mb-1">Sounds Like</span>
                      <div className="flex flex-wrap gap-1">
                        {styleProfile.similarArtists.map((a, i) => (
                          <span key={i} className="text-xs font-ui text-studio-cyan px-2 py-0.5 rounded border border-studio-cyan/30 bg-studio-cyan/10">
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  {styleProfile.summary && (
                    <div className="bg-studio-void rounded-lg px-3 py-2.5 border border-studio-border">
                      <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-1.5">Style Summary</div>
                      <div className="text-xs font-ui text-studio-text leading-5">{styleProfile.summary}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Generator */}
        <div className="p-4 flex flex-col gap-3 flex-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-studio-green" style={{ boxShadow: '0 0 6px #00ff9d' }} />
            <span className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase">Generate in This Style</span>
          </div>

          <input
            type="text"
            value={genTopic}
            onChange={(e) => setGenTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && analyzed) handleGenerate() }}
            placeholder="What's the new verse about?"
            disabled={!analyzed}
            className="w-full bg-studio-void border border-studio-border rounded-xl px-3 py-2 text-xs font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-green disabled:opacity-40"
          />

          <button
            onClick={handleGenerate}
            disabled={!analyzed || !genTopic.trim() || generating || noKey}
            className="w-full py-2.5 rounded-xl font-display font-bold text-xs text-black transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #00ff9d, #00e5ff)', boxShadow: analyzed && genTopic.trim() ? '0 0 12px rgba(0,255,157,0.25)' : 'none' }}
          >
            {generating ? 'Writing verse...' : '✦ Generate 16-Bar Verse'}
          </button>

          {!analyzed && (
            <p className="text-xs font-ui text-studio-dim text-center">
              Analyze some lyrics first — then generate new bars in that exact style.
            </p>
          )}

          {/* Generated lyrics */}
          {(genLines.length > 0 || generating) && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">Generated Verse</span>
                  {generating && (
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="w-1 h-1 rounded-full bg-studio-green"
                          style={{ animation: `vu-pulse 1s ease-in-out ${i * 0.2}s infinite` }} />
                      ))}
                    </div>
                  )}
                  {genDone && <span className="text-xs font-mono text-studio-green">✓ done</span>}
                </div>
                {genDone && (
                  <button
                    onClick={copyGenerated}
                    className="text-xs font-mono transition-colors"
                    style={{ color: copied ? '#00ff9d' : '#888899' }}
                  >
                    {copied ? '✓ copied' : 'copy'}
                  </button>
                )}
              </div>

              <div
                className="bg-studio-void rounded-xl border border-studio-border px-4 py-3 flex flex-col gap-1 max-h-72 overflow-y-auto"
                style={{ scrollbarWidth: 'thin' }}
              >
                {genLines.map((l, i) => (
                  <div key={i} className="text-xs font-ui text-studio-text leading-6">{l}</div>
                ))}
              </div>

              {genDone && (
                <div className="text-xs font-mono text-studio-dim">{genLines.length} bars generated</div>
              )}

              {genDone && (
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerate}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-ui border border-studio-border text-studio-dim hover:text-white transition-colors"
                  >
                    Regenerate
                  </button>
                  <button
                    onClick={copyGenerated}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-ui font-semibold text-black transition-all"
                    style={{ background: 'linear-gradient(135deg, #00ff9d, #00e5ff)' }}
                  >
                    {copied ? '✓ Copied!' : 'Copy Verse'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
