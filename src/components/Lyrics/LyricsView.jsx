import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { GoogleGenerativeAI } from '../../utils/gemini-compat'
import { useStudioStore } from '../../store/useStudioStore'
import { useStyleProfile } from '../../hooks/useStyleProfile'
import { ARTIST_STYLES, getStyleInstruction } from '../AICoPilot/AICoPilotView'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '')

const SECTION_COLORS = {
  verse: '#00e5ff',
  chorus: '#b44fff',
  bridge: '#00ff9d',
  hook: '#ffe600',
  outro: '#ff9500',
}

const SECTION_TYPES = ['verse', 'chorus', 'bridge', 'hook', 'outro']

const TEMPLATES = [
  {
    name: 'Hip-Hop Classic',
    description: 'Verse × 3 / Hook / Outro',
    color: '#00e5ff',
    sections: [
      { type: 'verse', label: 'Verse 1', lineCount: 16 },
      { type: 'hook', label: 'Hook', lineCount: 4 },
      { type: 'verse', label: 'Verse 2', lineCount: 16 },
      { type: 'hook', label: 'Hook', lineCount: 4 },
      { type: 'verse', label: 'Verse 3', lineCount: 16 },
      { type: 'outro', label: 'Outro', lineCount: 4 },
    ],
  },
  {
    name: 'Trap / Modern',
    description: 'Verse / Chorus × 2 / Bridge / Chorus',
    color: '#b44fff',
    sections: [
      { type: 'verse', label: 'Verse 1', lineCount: 8 },
      { type: 'chorus', label: 'Chorus', lineCount: 4 },
      { type: 'verse', label: 'Verse 2', lineCount: 8 },
      { type: 'chorus', label: 'Chorus', lineCount: 4 },
      { type: 'bridge', label: 'Bridge', lineCount: 4 },
      { type: 'chorus', label: 'Chorus', lineCount: 4 },
    ],
  },
  {
    name: 'Gospel / Worship',
    description: 'Verse / Chorus × 2 / Bridge / Chorus',
    color: '#ffe600',
    sections: [
      { type: 'verse', label: 'Verse 1', lineCount: 8 },
      { type: 'chorus', label: 'Chorus', lineCount: 8 },
      { type: 'verse', label: 'Verse 2', lineCount: 8 },
      { type: 'chorus', label: 'Chorus', lineCount: 8 },
      { type: 'bridge', label: 'Bridge', lineCount: 8 },
      { type: 'chorus', label: 'Chorus', lineCount: 8 },
    ],
  },
  {
    name: 'Pop Structure',
    description: 'Verse / Chorus × 2 / Bridge / Chorus',
    color: '#00ff9d',
    sections: [
      { type: 'verse', label: 'Verse 1', lineCount: 6 },
      { type: 'chorus', label: 'Chorus', lineCount: 4 },
      { type: 'verse', label: 'Verse 2', lineCount: 6 },
      { type: 'chorus', label: 'Chorus', lineCount: 4 },
      { type: 'bridge', label: 'Bridge', lineCount: 4 },
      { type: 'chorus', label: 'Chorus', lineCount: 4 },
    ],
  },
  {
    name: '16-Bar Showcase',
    description: 'Two full 16-bar verses',
    color: '#ff9500',
    sections: [
      { type: 'verse', label: 'Verse 1', lineCount: 16 },
      { type: 'verse', label: 'Verse 2', lineCount: 16 },
    ],
  },
]

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

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const RHYME_COLORS = ['#ff2d55', '#ffe600', '#b44fff', '#00ff9d', '#ff9500', '#00e5ff']

function detectRhymeGroups(lines) {
  const endWords = lines.map((l) =>
    l.trim().split(/\s+/).pop()?.replace(/[^a-zA-Z']/g, '').toLowerCase() || ''
  )
  const rhymes = (a, b) => {
    if (!a || !b || a === b) return false
    const s = Math.min(4, Math.min(a.length, b.length))
    return s >= 3 && a.slice(-s) === b.slice(-s)
  }
  const parent = lines.map((_, i) => i)
  const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]))
  for (let i = 0; i < endWords.length; i++)
    for (let j = i + 1; j < endWords.length; j++)
      if (rhymes(endWords[i], endWords[j])) parent[find(i)] = find(j)
  const groupColors = {}
  let nextColor = 0
  const result = {}
  for (let i = 0; i < lines.length; i++) {
    if (!endWords[i]) continue
    const root = find(i)
    const hasPartner = endWords.some((w, j) => j !== i && find(j) === root && w)
    if (!hasPartner) continue
    if (!(root in groupColors)) groupColors[root] = RHYME_COLORS[nextColor++ % RHYME_COLORS.length]
    result[i] = groupColors[root]
  }
  return result
}

function LyricLine({ line, index, sectionId, color, section, rhymeColor }) {
  const { updateLine, removeLine, addLine } = useStudioStore()
  const [focused, setFocused] = useState(false)
  const [showRhymes, setShowRhymes] = useState(false)
  const [rhymeWords, setRhymeWords] = useState([])
  const [loadingRhymes, setLoadingRhymes] = useState(false)
  const [showPunchUp, setShowPunchUp] = useState(false)
  const [punchOptions, setPunchOptions] = useState([])
  const [loadingPunch, setLoadingPunch] = useState(false)

  const syllables = countLineSyllables(line)
  const lastWord = line.trim().split(/\s+/).pop()?.replace(/[^a-zA-Z']/g, '') || ''

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addLine(sectionId)
    }
    if (e.key === 'Backspace' && line === '' && index > 0) {
      e.preventDefault()
      removeLine(sectionId, index)
    }
  }

  const fetchRhymes = async () => {
    if (!lastWord) return
    setShowRhymes(true)
    setShowPunchUp(false)
    setLoadingRhymes(true)
    setRhymeWords([])
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const result = await model.generateContent(
        `Give me 12 words that rhyme or near-rhyme with "${lastWord}". Mix single and multi-syllable words, include slant rhymes. Return ONLY the words comma-separated on one line, no explanation, no numbering.`
      )
      const text = result.response.text()
      const words = text
        .split(/[,\n]/)
        .map((w) => w.trim().replace(/[^a-zA-Z']/g, ''))
        .filter(Boolean)
        .slice(0, 12)
      setRhymeWords(words)
    } catch {
      setRhymeWords([])
    } finally {
      setLoadingRhymes(false)
    }
  }

  const fetchPunchUp = async () => {
    if (!line.trim()) return
    setShowPunchUp(true)
    setShowRhymes(false)
    setLoadingPunch(true)
    setPunchOptions([])
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const context = section?.lines
        .filter((l, i) => i !== index && Math.abs(i - index) <= 2 && l.trim())
        .join('\n') || ''
      const result = await model.generateContent(
        `Rewrite this single rap bar 4 different ways, each noticeably stronger than the original.

Section: ${section?.label || 'Verse'}
Original bar: "${line}"${context ? `\nNeighboring bars for context:\n${context}` : ''}

Rules for all 4 versions:
- Keep the same subject/meaning
- Each version improves the bar in a distinct way: better flow, sharper imagery, stronger punchline, or tighter cadence
- Natural speech — never twist a sentence just to rhyme
- Similar length to the original
- ONE LINE per version

Return ONLY the 4 versions, numbered 1-4, one per line. No labels, no explanation.`
      )
      const text = result.response.text()
      const options = text
        .split('\n')
        .map((l) => l.replace(/^[1-4][\.\)]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 4)
      setPunchOptions(options)
    } catch {
      setPunchOptions([])
    } finally {
      setLoadingPunch(false)
    }
  }

  return (
    <div>
      <div className={`flex items-center gap-2 group ${focused ? 'opacity-100' : 'opacity-90'}`}>
        <div
          className="w-5 h-5 shrink-0 rounded flex items-center justify-center font-mono text-studio-dim opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ fontSize: 10 }}
        >
          {index + 1}
        </div>
        <input
          type="text"
          value={line}
          onChange={(e) => updateLine(sectionId, index, e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Write your line here..."
          className="flex-1 bg-transparent border-b font-ui text-base text-studio-text placeholder-studio-muted focus:outline-none py-1 transition-colors"
          style={{ borderColor: focused ? color : '#252540', caretColor: color }}
        />
        {/* Syllable count */}
        {line.trim() && (
          <span
            className="shrink-0 text-xs font-mono opacity-30 group-hover:opacity-80 transition-opacity select-none"
            style={{ color, minWidth: '1.5rem', textAlign: 'right' }}
            title="syllable count"
          >
            {syllables}
          </span>
        )}
        {/* Rhyme group dot */}
        {rhymeColor && (
          <span
            className="shrink-0 w-1.5 h-1.5 rounded-full select-none transition-all"
            style={{ background: rhymeColor, boxShadow: `0 0 5px ${rhymeColor}` }}
            title="Rhyme group"
          />
        )}
        {/* Punch up button */}
        {line.trim() && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={fetchPunchUp}
            className="shrink-0 text-xs font-mono text-studio-dim hover:text-studio-yellow opacity-0 group-hover:opacity-100 transition-opacity transition-colors"
            title="Punch up this bar — get 4 stronger alternatives"
          >
            ↑
          </button>
        )}
        {/* Rhyme button */}
        {lastWord && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={fetchRhymes}
            className="shrink-0 text-xs font-mono text-studio-dim hover:text-studio-cyan opacity-0 group-hover:opacity-100 transition-opacity transition-colors"
            title={`Get rhymes for "${lastWord}"`}
          >
            ≈
          </button>
        )}
        <button
          onClick={() => removeLine(sectionId, index)}
          className="w-5 h-5 shrink-0 rounded text-studio-dim hover:text-studio-red transition-colors opacity-0 group-hover:opacity-100 text-xs"
        >
          ✕
        </button>
      </div>

      {/* Punch up panel */}
      {showPunchUp && (
        <div className="ml-7 mt-1 mb-2 px-3 py-2 rounded-lg border border-studio-border bg-studio-void">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono" style={{ color }}>↑ stronger alternatives</span>
            <button
              onClick={() => { setShowPunchUp(false); setPunchOptions([]) }}
              className="text-xs text-studio-dim hover:text-white transition-colors leading-none"
            >
              ✕
            </button>
          </div>
          {loadingPunch ? (
            <div className="text-xs font-mono text-studio-dim">generating alternatives...</div>
          ) : punchOptions.length > 0 ? (
            <div className="flex flex-col gap-1">
              {punchOptions.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => {
                    updateLine(sectionId, index, opt)
                    setShowPunchUp(false)
                    setPunchOptions([])
                  }}
                  className="text-left px-3 py-1.5 rounded text-xs font-ui border border-studio-border text-studio-text hover:border-studio-yellow hover:bg-studio-yellow/5 transition-colors"
                  title="Click to use this version"
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-studio-dim font-mono">No alternatives generated</div>
          )}
        </div>
      )}

      {/* Rhyme panel */}
      {showRhymes && (
        <div className="ml-7 mt-1 mb-2 px-3 py-2 rounded-lg border border-studio-border bg-studio-void">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono" style={{ color }}>
              ≈ rhymes for &ldquo;{lastWord}&rdquo;
            </span>
            <button
              onClick={() => { setShowRhymes(false); setRhymeWords([]) }}
              className="text-xs text-studio-dim hover:text-white transition-colors leading-none"
            >
              ✕
            </button>
          </div>
          {loadingRhymes ? (
            <div className="text-xs font-mono text-studio-dim">loading suggestions...</div>
          ) : rhymeWords.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {rhymeWords.map((word, i) => (
                <button
                  key={i}
                  onClick={() => navigator.clipboard.writeText(word)}
                  className="px-2 py-0.5 rounded text-xs font-ui border border-studio-border text-studio-text hover:border-studio-cyan hover:text-studio-cyan transition-colors"
                  title="Click to copy"
                >
                  {word}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-studio-dim font-mono">No suggestions found</div>
          )}
        </div>
      )}
    </div>
  )
}

const GHOST_MODES = [
  {
    id: 'ghostwrite',
    label: 'Full Ghost Write',
    icon: '✦',
    color: '#b44fff',
    desc: 'Tear it down, rebuild from scratch — same theme, all new bars',
    instruction: `FULL GHOST WRITE — Complete teardown and rebuild:
You are the best ghostwriter alive. Read these original bars to understand the THEME and EMOTIONAL CORE only. Now set every word aside permanently and write from scratch.

Your assignment: Write what this section should say if you attacked this theme cold, with zero limitations. The artist should hear your version and think "I didn't know it could sound like that."

NON-NEGOTIABLES:
- Zero shared phrases, rhyme endings, or sentence structures with the original — none
- Start from the most powerful way to express this theme, not the original's approach to it
- Every bar must sound like a real person talking at rap tempo, not a rhyme machine
- The emotional journey must be clear: where does this section start, where does it go?
- At least 2 bars should make the listener stop and replay
- Hard ban — never write these: "rise above", "never give up", "haters gonna hate", "I've been grinding", "on my way to the top", "I know my worth", "stay true", "chase your dreams", "nothing can stop me", "I refuse to quit"
- If a bar sounds like a motivational poster, rewrite it immediately
- Natural speech rhythm beats reaching for a rhyme — slant rhymes and unrhymed bars are better than a forced one`,
  },
  {
    id: 'elevate',
    label: 'Elevate the Craft',
    icon: '⬆',
    color: '#00e5ff',
    desc: 'Upgrade every bar — double meanings, multisyllabic rhymes, punchlines',
    instruction: `ELEVATION MODE — Technical upgrade on every single bar:
Preserve the subject and emotional direction. Rebuild every line with elite technical execution.

What "elevated" means per bar:
1. DOUBLE MEANING: Every bar carries at least one phrase that works on two levels. Surface meaning + deeper meaning in the same line. "I put in work" is one level. "These hands been building what they tried to bury" is two levels.
2. MULTISYLLABIC RHYMES: Match 2–4 syllables at a time, not single words. "time/rhyme" is low level. "motivating me/dedicated" is elevation. Stack them wherever they land naturally.
3. INTERNAL RHYME LOAD: Mid-bar rhyme sounds appear on most lines. The end rhyme is NOT the main event — it's bonus. The real complexity lives inside the bar.
4. PUNCHLINES: Every 3–4 bars must include one line that makes a listener stop and rewind. Something that takes a full second to land after they hear it.
5. ZERO CLICHÉS: If you've heard the phrase in another song, cut it. Every generic line gets replaced with something that could only exist in this specific section.`,
  },
  {
    id: 'flow',
    label: 'Fix the Flow',
    icon: '〜',
    color: '#00ff9d',
    desc: 'Repair cadence breaks, stiff phrasing, and forced rhymes',
    instruction: `FLOW DOCTOR MODE — Surgical cadence repair only:
Diagnose and fix broken bars. Leave anything that already flows naturally completely untouched.

Three types of problems you are treating:

TYPE 1 — FORCED RHYME SYNDROME: The sentence was rearranged or twisted backward just to land on a rhyme word. It sounds like no human would actually say this in normal conversation. Fix: write the most natural version of what this line is trying to say first, then find a rhyme that fits around it. If nothing fits cleanly, use a slant rhyme or drop the rhyme. Flow first. Rhyme second.

TYPE 2 — SYLLABLE MISMATCH: This bar has too many syllables to flow smoothly at tempo, or too few and sounds skeletal compared to its neighbors. Fix: trim words that add nothing, or add one rhythmically active word that actually serves the meaning.

TYPE 3 — PASSIVE/WEAK CONSTRUCTION: Starts with "I was", "I've been", "it was like", or uses vague language where concrete language would hit harder. Fix: rewrite as a direct, active declaration — subject, action, impact. Not "I was trying to make it" — "I clawed through every door they closed on me."

Return the same number of bars. Fix what's broken. Leave what works alone.`,
  },
  {
    id: 'punchlines',
    label: 'Punchline Factory',
    icon: '🥊',
    color: '#ff2d55',
    desc: 'Maximum punchlines — every 2–3 bars must land hard',
    instruction: `PUNCHLINE MODE — Build every 2–3 bars as a setup-and-knockout unit:

Four punch types — rotate through all of them, use each at least once:

1. MISDIRECTION PUNCH: Bar 1 takes the listener one direction. Bar 2 snaps to the real point. "I been walking in the dark" → "Turns out that's when I learned to see." Lead them left, land right.

2. COMPARISON PUNCH: A simile that stops people cold and reframes how they see something. Not "I'm sharp like a knife." Something unexpected — something that makes them picture two things at once and realize they're the same truth.

3. WORDPLAY PUNCH: A phrase where two meanings land simultaneously. The surface meaning and the deeper meaning hit at the exact same moment. The listener feels clever for catching it and replays it.

4. CONTRAST PUNCH: Two opposite images in consecutive bars where each one makes the other more powerful. The fall and the rise in the same breath. The wound and the proof it healed.

No bar exists just to fill space. Every line either winds the tension up or releases it. The verse should feel like a series of knockout rounds — nothing in between.`,
  },
  {
    id: 'spiritual',
    label: 'Spiritual Upgrade',
    icon: '✝',
    color: '#ffe600',
    desc: 'Deep biblical imagery, contrast pairs, scripture woven through every bar',
    instruction: `SPIRITUAL ELEVATION MODE — Minister's theology, lyricist's pen:
Rewrite with the depth of someone who actually studied the Word — not someone who adds "God" and "blessed" to make it sound spiritual.

SPECIFIC OVER VAGUE: Name the actual story and details. Not "God kept me through the storm" — something like "Like Paul in chains singing hymns at midnight, my darkest room became the place of breakthrough." Not "I was lost and found" — reference the prodigal son returning to his father's table, or Lazarus after four days, or Daniel waking in the lion's den unharmed. Pick what fits the theme — don't list them all.

CONTRAST PAIRS AS ARCHITECTURE: Use these as structural pillars, not decoration — lost/found · blind/see · bound/free · dead/alive · broken/whole · empty/filled · ashamed/redeemed · prisoner/free. Juxtapose them so each side makes the other more powerful.

STREET-TO-SCRIPTURE BRIDGE: At least one bar per 4 should translate a street reality into a biblical truth in the SAME LINE — where the listener feels the Word before they fully recognize the reference.

THE TONE: This is not Sunday school. This sounds like someone who walked through something heavy and came out on the other side with something real to say. The faith costs something. The grace lands harder because of it.`,
  },
  {
    id: 'heat',
    label: 'Turn Up the Heat',
    icon: '🔥',
    color: '#ff9500',
    desc: 'More aggressive, more confident, hit harder — prove something',
    instruction: `HEAT MODE — Max confidence, escalating energy, no neutral bars:
Rewrite like the artist is settling a debt with every person who counted them out. The energy starts hot and gets hotter bar by bar.

OPENING: Hit on the first word. No warmup, no setup from zero — land in the middle of the declaration. The listener feels the temperature immediately.

DECLARATIVE ONLY: Strip all soft language — "I think", "maybe", "kind of", "I've been trying to". Replace with certainty. Every statement is fact, not attempt.

ESCALATION ARC: Short punchy bars early (3–5 syllables, hits fast). Longer denser bars as momentum builds (8–12 syllables, rolls with weight). The final 2–3 bars should be the hardest-hitting in the entire section — the energy peaks here, it doesn't plateau.

POSITION: The artist is not chasing anything — they already arrived and others are catching up. Every bar's perspective reflects this.

CONTRAST RHYTHM: Alternate 2–3 short rapid bars with 1 longer bar that breathes. The contrast between short and long creates physical impact — jabs followed by a hook.

CLOSING BAR: Must feel like a door slamming shut. Final statement. Not a question mark.`,
  },
]

function RewriteModal({ section, color, onClose }) {
  const { replaceSectionLines } = useStudioStore()
  const { profile, buildSystemPrompt } = useStyleProfile()
  const { bpm, timeSignature } = useStudioStore()

  const [mode, setMode] = useState('ghostwrite')
  const [direction, setDirection] = useState('')
  const [showDirection, setShowDirection] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamedLines, setStreamedLines] = useState([])
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [view, setView] = useState('split') // 'split' | 'new'
  const [artistId, setArtistId] = useState('none')
  const [customArtist, setCustomArtist] = useState('')
  const [artistSearch, setArtistSearch] = useState('')
  const [lookedUpInstruction, setLookedUpInstruction] = useState(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [showArtistPicker, setShowArtistPicker] = useState(false)

  const originalLines = section.lines.filter(Boolean)
  const originalText = originalLines.join('\n')
  const selectedMode = GHOST_MODES.find((m) => m.id === mode) || GHOST_MODES[0]

  const lookupArtist = async () => {
    const name = artistSearch.trim()
    if (!name || lookingUp) return
    setLookingUp(true)
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const result = await model.generateContent(
        `You are a music and lyric style expert. Write a detailed ghostwriter style guide for the artist "${name}".

Analyze and describe: flow and cadence patterns, preferred rhyme schemes (internal, multisyllabic, slant, end rhymes), lyrical themes, delivery approach, signature techniques, punchline structure, wordplay style, and what makes their bars sound uniquely like them.

Return a focused guide (under 300 words) starting with "${name.toUpperCase()} STYLE — apply these techniques:" that a professional ghostwriter can use to write convincingly in their style.`
      )
      setLookedUpInstruction(result.response.text().trim())
      setArtistId('_looked_up')
      setCustomArtist(name)
    } catch {}
    setLookingUp(false)
  }

  const runRewrite = async () => {
    setStreaming(true)
    setStreamedLines([])
    setDone(false)
    setError(null)

    try {
      const systemPrompt = buildSystemPrompt(bpm, timeSignature)

      const hasProfile = profile.themes.length > 0 || profile.lyricsHistory.length > 0
      const styleContext = hasProfile
        ? `ARTIST CONTEXT: This is for Bulue Berry. His themes include: ${profile.themes.slice(0, 5).join(', ')}. His vocabulary and cadence: ${profile.vocabulary.slice(0, 10).join(', ')}. Write in his voice.`
        : `ARTIST CONTEXT: Write with authentic, personal voice — no generic AI lyrics.`

      const directionNote = direction.trim()
        ? `\nARTIST DIRECTION (priority instruction): "${direction.trim()}"`
        : ''

      const seed = Math.random().toString(36).slice(2, 7).toUpperCase()

      const artistStyleNote = (() => {
        if (artistId === 'none') return ''
        const instruction = lookedUpInstruction || getStyleInstruction(artistId, customArtist)
        return instruction ? `\n\n${instruction}` : ''
      })()

      const prompt = `[Ghost Write Session ${seed}]
You are the best ghostwriter alive. Your job is to write bars that sound like they came from a real artist at the top of their craft — not an AI, not a bot, not a rhyme generator.

SECTION: [${section.label}] — ${section.lines.length} bars
ORIGINAL BARS:
${section.lines.map((l, i) => `${i + 1}. ${l || '(empty)'}`).join('\n')}

${selectedMode.instruction}

${styleContext}${directionNote}${artistStyleNote}

QUALITY CHECK — every bar must pass all five:
1. Read it aloud mentally at rap tempo. Does it sound like a real person talking? If it sounds stiff or constructed, rewrite it.
2. Does this bar earn its spot? If you cut it, would anything be lost? If not, replace it with something that means something.
3. Is there at least one internal sound — rhyme, alliteration, or assonance — before the end word?
4. No clichés allowed: "I've been grinding", "never give up", "rise above", "haters gonna hate", "on my way", "I refuse to quit". If you've seen it on a motivational poster, it doesn't belong here.
5. Does the line flow naturally into the next without a jarring rhythm break?

OUTPUT FORMAT:
- Return EXACTLY ${section.lines.length} lines
- One bar per line
- No numbering, no labels, no section headers, no explanations — just the bare bars`

      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: systemPrompt,
        generationConfig: { temperature: 1.4 },
      })

      const result = await model.generateContentStream(prompt)
      let full = ''
      for await (const chunk of result.stream) {
        full += chunk.text()
        const lines = full.split('\n').map((l) => l.trim()).filter(Boolean)
        setStreamedLines(lines)
      }

      const finalLines = full.split('\n').map((l) => l.trim()).filter(Boolean)
      setStreamedLines(finalLines)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setStreaming(false)
    }
  }

  const applyRewrite = () => {
    replaceSectionLines(section.id, streamedLines)
    onClose()
  }

  const reset = () => {
    setDone(false)
    setStreamedLines([])
    setError(null)
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-studio-panel border border-studio-border rounded-2xl shadow-2xl flex flex-col"
        style={{ width: 720, maxHeight: '90vh', borderTop: `3px solid ${selectedMode.color}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-studio-border">
          <div>
            <div className="font-display text-sm font-semibold" style={{ color: selectedMode.color }}>
              Ghost Writer — {section.label.toUpperCase()}
            </div>
            <div className="text-xs text-studio-dim font-ui mt-0.5">
              {section.lines.length} bars · {selectedMode.label}
            </div>
          </div>
          <button onClick={onClose} className="text-studio-dim hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="flex flex-col gap-0 overflow-y-auto flex-1">

          {/* Mode picker */}
          {!streaming && !done && (
            <div className="px-5 pt-4 pb-3 border-b border-studio-border">
              <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">Ghost Writer Mode</div>
              <div className="grid grid-cols-3 gap-2">
                {GHOST_MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all"
                    style={{
                      borderColor: mode === m.id ? m.color : '#252540',
                      background: mode === m.id ? m.color + '15' : 'transparent',
                      boxShadow: mode === m.id ? `0 0 12px ${m.color}33` : 'none',
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: mode === m.id ? m.color : '#666688', fontSize: 13 }}>{m.icon}</span>
                      <span className="text-xs font-ui font-semibold" style={{ color: mode === m.id ? m.color : '#c0c0d0' }}>
                        {m.label}
                      </span>
                    </div>
                    <span className="text-xs font-ui text-studio-dim leading-4">{m.desc}</span>
                  </button>
                ))}
              </div>

              {/* Optional direction */}
              <div className="mt-3">
                <button
                  onClick={() => setShowDirection((v) => !v)}
                  className="text-xs font-mono text-studio-dim hover:text-studio-cyan transition-colors"
                >
                  {showDirection ? '▾' : '▸'} Add direction (optional)
                </button>
                {showDirection && (
                  <input
                    autoFocus
                    type="text"
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') runRewrite() }}
                    placeholder='e.g. "more scripture references", "open with a harder bar", "keep the word grind"'
                    className="mt-2 w-full bg-studio-void border border-studio-border rounded-xl px-4 py-2.5 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-cyan"
                  />
                )}
              </div>

              {/* Artist style reference */}
              <div className="mt-3">
                <button
                  onClick={() => setShowArtistPicker((v) => !v)}
                  className="text-xs font-mono text-studio-dim hover:text-studio-cyan transition-colors flex items-center gap-2"
                >
                  {showArtistPicker ? '▾' : '▸'} Artist style reference (optional)
                  {artistId !== 'none' && (
                    <span style={{ color: '#00e5ff' }}>
                      — {artistId === '_looked_up' ? customArtist : (ARTIST_STYLES.find(a => a.id === artistId)?.label || customArtist)}
                    </span>
                  )}
                </button>
                {showArtistPicker && (
                  <div className="mt-2 border border-studio-border rounded-xl p-3 bg-studio-void">
                    <div className="grid grid-cols-4 gap-1.5 mb-3">
                      {ARTIST_STYLES.filter(a => a.id !== 'custom').map((a) => (
                        <button
                          key={a.id}
                          onClick={() => { setArtistId(a.id); if (a.id !== '_looked_up') setLookedUpInstruction(null) }}
                          className="flex flex-col items-start gap-0.5 px-2 py-1.5 rounded-lg border text-left transition-all"
                          style={{
                            borderColor: artistId === a.id ? a.color : '#252540',
                            background: artistId === a.id ? a.color + '15' : 'transparent',
                          }}
                        >
                          <span style={{ color: artistId === a.id ? a.color : '#666688', fontSize: 11 }}>{a.icon}</span>
                          <span style={{ color: artistId === a.id ? a.color : '#c0c0d0', fontSize: 10 }} className="font-ui font-semibold leading-tight">{a.label}</span>
                        </button>
                      ))}
                      {lookedUpInstruction && (
                        <button
                          onClick={() => setArtistId('_looked_up')}
                          className="flex flex-col items-start gap-0.5 px-2 py-1.5 rounded-lg border text-left transition-all"
                          style={{
                            borderColor: artistId === '_looked_up' ? '#00ff9d' : '#252540',
                            background: artistId === '_looked_up' ? '#00ff9d15' : 'transparent',
                          }}
                        >
                          <span style={{ color: '#00ff9d', fontSize: 11 }}>✓</span>
                          <span style={{ color: artistId === '_looked_up' ? '#00ff9d' : '#c0c0d0', fontSize: 10 }} className="font-ui font-semibold leading-tight">{customArtist}</span>
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={artistSearch}
                        onChange={(e) => setArtistSearch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') lookupArtist() }}
                        placeholder="Look up any artist... (e.g. Lil Baby, Lupe Fiasco)"
                        className="flex-1 bg-studio-panel border border-studio-border rounded-lg px-3 py-1.5 text-xs font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-cyan"
                      />
                      <button
                        onClick={lookupArtist}
                        disabled={!artistSearch.trim() || lookingUp}
                        className="px-3 py-1.5 rounded-lg text-xs font-ui font-semibold text-black disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #00e5ff, #b44fff)' }}
                      >
                        {lookingUp ? '...' : 'AI Look Up'}
                      </button>
                    </div>
                    {lookedUpInstruction && (
                      <div className="mt-2 text-xs font-mono text-studio-green">✓ {customArtist} style loaded — select above to apply</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Split view: original + new */}
          <div className="flex-1 overflow-y-auto">
            {/* Original — always visible */}
            {!done && !streaming && (
              <div className="px-5 py-4">
                <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">Original</div>
                <div className="bg-studio-void rounded-xl px-4 py-3 max-h-52 overflow-y-auto">
                  {originalLines.length > 0 ? originalLines.map((line, i) => (
                    <div key={i} className="flex gap-3 py-0.5">
                      <span className="text-xs font-mono text-studio-dim w-5 shrink-0 mt-0.5">{i + 1}</span>
                      <span className="text-sm font-ui text-studio-dim leading-6">{line}</span>
                    </div>
                  )) : (
                    <div className="text-xs text-studio-dim font-mono">(empty section)</div>
                  )}
                </div>
              </div>
            )}

            {/* Streaming / done: side by side */}
            {(streaming || done) && (
              <div className="px-5 py-4 flex flex-col gap-3">
                {done && (
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-studio-border overflow-hidden">
                      {['split', 'new'].map((v) => (
                        <button
                          key={v}
                          onClick={() => setView(v)}
                          className="px-3 py-1 text-xs font-ui font-semibold transition-colors"
                          style={{
                            background: view === v ? selectedMode.color + '22' : 'transparent',
                            color: view === v ? selectedMode.color : '#888899',
                          }}
                        >
                          {v === 'split' ? 'Side by Side' : 'New Only'}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs font-mono text-studio-green ml-auto">✓ {streamedLines.length} bars ready</span>
                  </div>
                )}

                {view === 'split' && done ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">Original</div>
                      <div className="bg-studio-void rounded-xl px-3 py-3 max-h-72 overflow-y-auto flex flex-col gap-0.5">
                        {originalLines.map((line, i) => (
                          <div key={i} className="flex gap-2 py-0.5">
                            <span className="text-xs font-mono text-studio-dim w-4 shrink-0">{i + 1}</span>
                            <span className="text-xs font-ui text-studio-dim leading-5">{line}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: selectedMode.color }}>
                        {selectedMode.icon} {selectedMode.label}
                      </div>
                      <div className="bg-studio-void rounded-xl px-3 py-3 max-h-72 overflow-y-auto flex flex-col gap-0.5"
                        style={{ borderLeft: `2px solid ${selectedMode.color}44` }}>
                        {streamedLines.map((line, i) => (
                          <div key={i} className="flex gap-2 py-0.5">
                            <span className="text-xs font-mono text-studio-dim w-4 shrink-0">{i + 1}</span>
                            <span className="text-xs font-ui text-studio-text leading-5">{line}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-xs font-mono uppercase tracking-wider" style={{ color: selectedMode.color }}>
                        {selectedMode.icon} {selectedMode.label}
                      </div>
                      {streaming && (
                        <div className="flex gap-1 ml-1">
                          {[0, 1, 2].map((i) => (
                            <div
                              key={i}
                              className="w-1 h-1 rounded-full"
                              style={{ background: selectedMode.color, animation: `vu-pulse 1s ease-in-out ${i * 0.2}s infinite` }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="bg-studio-void rounded-xl px-4 py-3 max-h-80 overflow-y-auto flex flex-col gap-0.5">
                      {streamedLines.map((line, i) => (
                        <div key={i} className="flex gap-3 py-0.5">
                          <span className="text-xs font-mono text-studio-dim w-4 shrink-0 mt-0.5">{i + 1}</span>
                          <span
                            className="text-sm font-ui leading-6"
                            style={{ color: done ? '#e0e0f0' : '#888899' }}
                          >{line}</span>
                        </div>
                      ))}
                      {streaming && streamedLines.length === 0 && (
                        <div className="text-xs font-mono text-studio-dim">Writing...</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="mx-5 mb-4 text-xs font-mono text-studio-red bg-studio-red/10 border border-studio-red/30 rounded-lg px-4 py-3">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-studio-border">
          {!streaming && !done && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-ui font-semibold border border-studio-border text-studio-dim hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={runRewrite}
                disabled={originalLines.length === 0}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-ui font-semibold text-black transition-all disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${selectedMode.color}, #b44fff)` }}
              >
                {selectedMode.icon} {selectedMode.label}
              </button>
            </>
          )}
          {streaming && (
            <div className="flex-1 flex items-center justify-center text-xs font-mono text-studio-dim">
              Ghost writing your bars...
            </div>
          )}
          {done && (
            <>
              <button
                onClick={reset}
                className="px-4 py-2 rounded-xl text-sm font-ui font-semibold border border-studio-border text-studio-dim hover:text-white transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-ui font-semibold border border-studio-border text-studio-dim hover:text-white transition-colors"
              >
                Discard
              </button>
              <button
                onClick={applyRewrite}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-ui font-semibold text-black transition-all"
                style={{ background: `linear-gradient(135deg, ${selectedMode.color}, #00ff9d)`, boxShadow: `0 0 16px ${selectedMode.color}44` }}
              >
                ✓ Apply to Section
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CoWriteModal({ section, color, onClose }) {
  const { replaceSectionLines } = useStudioStore()
  const { buildSystemPrompt } = useStyleProfile()
  const { bpm, timeSignature } = useStudioStore()

  const [bars, setBars] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  const context = section.lines.filter(Boolean).join('\n')

  const submitBar = async () => {
    if (!input.trim() || loading) return
    const userBar = input.trim()
    setInput('')
    inputRef.current?.focus()
    const newBars = [...bars, { role: 'user', text: userBar }]
    setBars(newBars)
    setLoading(true)
    try {
      const systemPrompt = buildSystemPrompt(bpm, timeSignature)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', systemInstruction: systemPrompt })
      const history = newBars.map((b) => `${b.role === 'user' ? 'You' : 'AI'}: ${b.text}`).join('\n')
      const result = await model.generateContent(
        `You are co-writing a ${section.label} with an artist. Write exactly ONE strong bar (line) responding to theirs.

Existing section:
${context || '(no context yet)'}

Co-write exchange so far:
${history}

Rules: one line only, match their energy and style, no labels, no quotes, no explanation.`
      )
      const aiBar = result.response.text().trim().split('\n').find((l) => l.trim()) || '...'
      setBars([...newBars, { role: 'ai', text: aiBar }])
    } catch {
      setBars([...newBars, { role: 'ai', text: '(AI unavailable)' }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const applyAll = () => {
    replaceSectionLines(section.id, bars.map((b) => b.text))
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-studio-panel border border-studio-border rounded-2xl shadow-2xl flex flex-col"
        style={{ width: 560, maxHeight: '85vh', borderTop: `3px solid ${color}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-studio-border">
          <div>
            <div className="font-display text-sm font-semibold" style={{ color }}>
              Co-Write — {section.label.toUpperCase()}
            </div>
            <div className="text-xs text-studio-dim font-ui mt-0.5">You write a bar, AI writes the next — back and forth</div>
          </div>
          <button onClick={onClose} className="text-studio-dim hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-2 min-h-0">
          {bars.length === 0 && (
            <div className="text-xs font-mono text-studio-dim text-center py-6">
              Drop your first bar — AI will respond with the next one
            </div>
          )}
          {bars.map((bar, i) => (
            <div key={i} className={`flex ${bar.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[82%] px-3 py-2 rounded-xl text-sm font-ui leading-relaxed"
                style={{
                  background: bar.role === 'user' ? color + '22' : '#1c1c30',
                  border: `1px solid ${bar.role === 'user' ? color + '55' : '#252540'}`,
                  color: bar.role === 'user' ? '#e8e8f8' : '#c0c0d0',
                }}
              >
                <div className="text-xs font-mono mb-1 opacity-60">{bar.role === 'user' ? 'You' : 'AI'}</div>
                {bar.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-xl border border-studio-border text-xs font-mono text-studio-dim">
                AI writing...
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-studio-border p-4 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitBar() }}
              placeholder="Write your bar..."
              disabled={loading}
              className="flex-1 bg-studio-void border border-studio-border rounded-xl px-4 py-2 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-cyan disabled:opacity-50"
            />
            <button
              onClick={submitBar}
              disabled={loading || !input.trim()}
              className="px-4 py-2 rounded-xl text-sm font-ui font-semibold text-black transition-all disabled:opacity-40"
              style={{ background: `linear-gradient(135deg, ${color}, #b44fff)` }}
            >
              Drop It
            </button>
          </div>
          {bars.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-ui border border-studio-border text-studio-dim hover:text-white transition-colors"
              >
                Discard
              </button>
              <button
                onClick={applyAll}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-ui font-semibold text-black transition-all"
                style={{ background: 'linear-gradient(135deg, #00ff9d, #00e5ff)', boxShadow: '0 0 16px rgba(0,255,157,0.3)' }}
              >
                ✓ Apply {bars.length} bars to Section
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Annotation helpers ───────────────────────────────────────────────────────

const TONE_TAGS = [
  { id: 'aggressive', emoji: '🔴', label: 'Aggressive', hint: 'Hit hard — punch it', color: '#ff2d55' },
  { id: 'smooth',     emoji: '🔵', label: 'Smooth',     hint: 'Stretch the note',    color: '#00e5ff' },
  { id: 'whisper',    emoji: '🟡', label: 'Whisper',    hint: 'Pull back — breathy', color: '#ffe600' },
  { id: 'rising',     emoji: '🟢', label: 'Rising',     hint: 'Lift the tone — hopeful', color: '#00ff9d' },
]

const STRESS_LEVELS = ['normal', 'strong', 'soft']

function getStressStyle(level) {
  if (level === 'strong') return { color: '#ffe600', fontWeight: 700, textTransform: 'uppercase' }
  if (level === 'soft')   return { color: '#666688', fontStyle: 'italic', fontSize: '0.85em' }
  return {}
}

function analyzeFlow(section) {
  const result = {}
  const lines = section.lines
  const endWords = lines.map((l) =>
    l.trim().split(/\s+/).pop()?.replace(/[^a-zA-Z']/g, '').toLowerCase() || ''
  )

  lines.forEach((line, li) => {
    result[li] = []
    const words = line.trim().split(/\s+/)

    // Internal rhymes: pairs within the same line sharing 3+ char suffix
    for (let a = 0; a < words.length; a++) {
      for (let b = a + 1; b < words.length; b++) {
        const wa = words[a].replace(/[^a-z]/gi, '').toLowerCase()
        const wb = words[b].replace(/[^a-z]/gi, '').toLowerCase()
        if (!wa || !wb) continue
        const s = Math.min(4, Math.min(wa.length, wb.length))
        if (s >= 3 && wa.slice(-s) === wb.slice(-s)) {
          result[li].push({ wordIdx: a, type: 'internal', pair: b })
          result[li].push({ wordIdx: b, type: 'internal', pair: a })
        }
      }
    }

    // Multisyllabic: words sharing 4+ char suffix with end-words of OTHER lines
    words.forEach((word, wi) => {
      const w = word.replace(/[^a-z]/gi, '').toLowerCase()
      if (!w || countSyllables(w) < 2) return
      endWords.forEach((ew, ei) => {
        if (ei === li || !ew) return
        const s = Math.min(5, Math.min(w.length, ew.length))
        if (s >= 4 && w.slice(-s) === ew.slice(-s)) {
          if (!result[li].some((x) => x.wordIdx === wi && x.type === 'multi'))
            result[li].push({ wordIdx: wi, type: 'multi' })
        }
      })
    })

    // Triplet groups: 3 consecutive 1-syllable words
    for (let i = 0; i + 2 < words.length; i++) {
      const w1 = words[i].replace(/[^a-z]/gi, '').toLowerCase()
      const w2 = words[i + 1].replace(/[^a-z]/gi, '').toLowerCase()
      const w3 = words[i + 2].replace(/[^a-z]/gi, '').toLowerCase()
      if (countSyllables(w1) === 1 && countSyllables(w2) === 1 && countSyllables(w3) === 1) {
        [i, i + 1, i + 2].forEach((idx) => {
          if (!result[li].some((x) => x.wordIdx === idx && x.type === 'triplet'))
            result[li].push({ wordIdx: idx, type: 'triplet' })
        })
      }
    }
  })

  return result
}

// ─── Stress Tab ───────────────────────────────────────────────────────────────

function StressTab({ section, color }) {
  const { annotations, setStressAnnotation } = useStudioStore()

  const cycleStress = (lineIdx, wordIdx, current) => {
    const next = { normal: 'strong', strong: 'soft', soft: 'normal' }[current] || 'strong'
    setStressAnnotation(section.id, lineIdx, wordIdx, next === 'normal' ? null : next)
  }

  const getAiSuggest = async (lineIdx, line) => {
    if (!line.trim()) return
    const words = line.trim().split(/\s+/)
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const result = await model.generateContent(
        `For this rap bar: "${line}"
Mark which words should be emphasized (STRONG=ALL CAPS) and which should be delivered soft/quiet (soft=lowercase italic).
Return JSON only: { "strong": [word_index_array], "soft": [word_index_array] }
Word indices start at 0. Only include words that truly need emphasis or de-emphasis.`
      )
      const text = result.response.text().replace(/```json?|```/g, '').trim()
      const parsed = JSON.parse(text)
      ;(parsed.strong || []).forEach((wi) => setStressAnnotation(section.id, lineIdx, wi, 'strong'))
      ;(parsed.soft || []).forEach((wi) => setStressAnnotation(section.id, lineIdx, wi, 'soft'))
    } catch {}
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-mono text-studio-dim">Click any word to cycle: normal → STRONG → soft → normal</div>
      {section.lines.map((line, li) => {
        if (!line.trim()) return null
        const words = line.trim().split(/\s+/)
        return (
          <div key={li} className="flex flex-wrap items-center gap-1">
            <span className="text-xs font-mono text-studio-dim mr-1 w-5 shrink-0">{li + 1}</span>
            {words.map((word, wi) => {
              const key = `${section.id}:${li}:${wi}`
              const level = annotations.stress[key] || 'normal'
              return (
                <button
                  key={wi}
                  onClick={() => cycleStress(li, wi, level)}
                  className="px-1 py-0.5 rounded text-sm font-ui transition-all hover:bg-white/5"
                  style={getStressStyle(level)}
                  title={`${word} — click to change stress (${level})`}
                >
                  {word}
                </button>
              )
            })}
            <button
              onClick={() => getAiSuggest(li, line)}
              className="ml-2 px-2 py-0.5 rounded text-xs font-mono border border-studio-border text-studio-dim hover:text-studio-yellow hover:border-studio-yellow transition-colors"
              title="AI suggests emphasis for this line"
            >
              ✦ AI
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Beat Map Tab ─────────────────────────────────────────────────────────────

function BeatMapTab({ section }) {
  const { annotations, setBeatMap } = useStudioStore()
  const COLS = 16

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-mono text-studio-dim">Click beat cells to map syllables to 16th-note positions (1 bar = 16 steps)</div>
      {section.lines.map((line, li) => {
        if (!line.trim()) return null
        const key = `${section.id}:${li}`
        const map = annotations.beatMap[key] || Array(COLS).fill(null)
        const syllables = line.trim().split(/\s+/).flatMap((w) => {
          const n = countSyllables(w)
          return Array(n).fill(w.replace(/[^a-zA-Z]/g, ''))
        })
        let sylIdx = 0

        const toggle = (col) => {
          const next = [...map]
          if (next[col]) {
            next[col] = null
          } else {
            next[col] = syllables[sylIdx] || '•'
            sylIdx++
          }
          setBeatMap(section.id, li, next)
        }

        return (
          <div key={li} className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-mono text-studio-dim w-5 shrink-0">{li + 1}</span>
              <span className="text-xs font-ui text-studio-dim truncate flex-1">{line}</span>
              <button
                onClick={() => setBeatMap(section.id, li, Array(COLS).fill(null))}
                className="text-xs font-mono text-studio-dim hover:text-studio-red transition-colors"
                title="Clear beat map"
              >✕</button>
            </div>
            <div className="flex gap-0.5 ml-6">
              {Array(COLS).fill(0).map((_, col) => {
                const beat = map[col]
                const isBeat = col % 4 === 0
                return (
                  <button
                    key={col}
                    onClick={() => toggle(col)}
                    className="flex flex-col items-center justify-end rounded transition-all"
                    style={{
                      width: 20, height: 32,
                      background: beat ? '#00e5ff22' : isBeat ? '#ffffff08' : '#ffffff04',
                      border: `1px solid ${beat ? '#00e5ff' : isBeat ? '#333355' : '#1e1e30'}`,
                    }}
                    title={`Beat ${col + 1}${beat ? ` — ${beat}` : ''}`}
                  >
                    {beat && (
                      <span className="text-center leading-none font-mono text-studio-cyan"
                        style={{ fontSize: 7, maxWidth: 18, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {beat.slice(0, 3)}
                      </span>
                    )}
                    <span className="font-mono text-studio-dim" style={{ fontSize: 7 }}>{col + 1}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Tone Tags Tab ────────────────────────────────────────────────────────────

function ToneTagsTab({ section }) {
  const { annotations, setToneTag } = useStudioStore()

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-mono text-studio-dim">Tag each line with a delivery mood</div>
      {section.lines.map((line, li) => {
        if (!line.trim()) return null
        const key = `${section.id}:${li}`
        const current = annotations.toneTag[key] || null
        return (
          <div key={li} className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-studio-dim w-5 shrink-0">{li + 1}</span>
            <span className="text-xs font-ui text-studio-dim truncate flex-1 min-w-0">{line}</span>
            <div className="flex gap-1 flex-shrink-0">
              {TONE_TAGS.map((tag) => {
                const active = current === tag.id
                return (
                  <button
                    key={tag.id}
                    onClick={() => setToneTag(section.id, li, active ? null : tag.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-ui font-semibold border transition-all"
                    style={{
                      borderColor: active ? tag.color : '#252540',
                      background: active ? tag.color + '22' : 'transparent',
                      color: active ? tag.color : '#888899',
                    }}
                    title={tag.hint}
                  >
                    {tag.emoji} {tag.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Contour Tab ──────────────────────────────────────────────────────────────

function ContourTab({ section, color }) {
  const { annotations, setContourAnnotation } = useStudioStore()
  const SVG_H = 60
  const DOT_R = 5

  const initPoints = (line) => {
    const words = line.trim().split(/\s+/)
    return words.map((_, i) => ({ x: (i / Math.max(words.length - 1, 1)), y: 0.5 }))
  }

  const handleDrag = (sectionId, li, points, ptIdx, svgEl, e) => {
    const rect = svgEl.getBoundingClientRect()
    const move = (me) => {
      const nx = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width))
      const ny = Math.max(0, Math.min(1, (me.clientY - rect.top) / rect.height))
      const next = points.map((p, i) => i === ptIdx ? { x: nx, y: ny } : p)
      setContourAnnotation(sectionId, li, next)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-mono text-studio-dim">Drag dots to draw the melodic contour for each line (up = high note)</div>
      {section.lines.map((line, li) => {
        if (!line.trim()) return null
        const key = `${section.id}:${li}`
        const words = line.trim().split(/\s+/)
        const pts = annotations.contour[key] || initPoints(line)
        const W = Math.max(words.length * 40, 200)

        const pathD = pts.length > 1
          ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * W} ${p.y * SVG_H}`).join(' ')
          : ''

        return (
          <div key={li}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-studio-dim w-5 shrink-0">{li + 1}</span>
              <span className="text-xs font-ui text-studio-dim">{line}</span>
              <button
                onClick={() => setContourAnnotation(section.id, li, initPoints(line))}
                className="ml-auto text-xs font-mono text-studio-dim hover:text-studio-red"
                title="Reset"
              >✕</button>
            </div>
            <svg
              width={W} height={SVG_H}
              className="ml-6 overflow-visible rounded"
              style={{ background: '#0c0c1a', border: '1px solid #252540', display: 'block' }}
            >
              {/* guide lines */}
              {[0.25, 0.5, 0.75].map((y) => (
                <line key={y} x1={0} y1={y * SVG_H} x2={W} y2={y * SVG_H}
                  stroke="#1e1e30" strokeWidth={1} />
              ))}
              {pathD && <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6} />}
              {pts.map((p, pi) => (
                <g key={pi}>
                  <circle
                    cx={p.x * W} cy={p.y * SVG_H} r={DOT_R}
                    fill={color} opacity={0.85} style={{ cursor: 'grab' }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleDrag(section.id, li, pts, pi, e.currentTarget.ownerSVGElement, e)
                    }}
                  />
                  <text x={p.x * W} y={SVG_H + 12} textAnchor="middle"
                    fill="#666688" fontSize={9} fontFamily="monospace">
                    {words[pi]?.slice(0, 6)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )
      })}
    </div>
  )
}

// ─── Flow Analyzer Tab ────────────────────────────────────────────────────────

function FlowTab({ section }) {
  const flowData = useMemo(() => analyzeFlow(section), [section])

  const TYPE_STYLE = {
    internal: { background: '#b44fff33', border: '1px solid #b44fff88', color: '#d088ff' },
    multi:    { background: '#00e5ff22', border: '1px solid #00e5ff66', color: '#00e5ff', textDecoration: 'underline' },
    triplet:  { background: '#ffe60022', border: '1px solid #ffe60066', color: '#ffe600' },
  }
  const TYPE_LABEL = { internal: 'internal rhyme', multi: 'multi-syllabic', triplet: 'triplet' }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3 mb-1">
        {Object.entries(TYPE_STYLE).map(([t, s]) => (
          <span key={t} className="px-2 py-0.5 rounded text-xs font-ui" style={s}>{TYPE_LABEL[t]}</span>
        ))}
      </div>
      {section.lines.map((line, li) => {
        if (!line.trim()) return null
        const hits = flowData[li] || []
        const words = line.trim().split(/\s+/)
        return (
          <div key={li} className="flex flex-wrap items-center gap-1">
            <span className="text-xs font-mono text-studio-dim w-5 shrink-0">{li + 1}</span>
            {words.map((word, wi) => {
              const types = hits.filter((h) => h.wordIdx === wi).map((h) => h.type)
              const dominantType = types.includes('triplet') ? 'triplet' : types.includes('multi') ? 'multi' : types.includes('internal') ? 'internal' : null
              const st = dominantType ? TYPE_STYLE[dominantType] : {}
              return (
                <span
                  key={wi}
                  className="px-1 py-0.5 rounded text-sm font-ui"
                  style={dominantType ? st : { color: '#c0c0d0' }}
                  title={dominantType ? TYPE_LABEL[dominantType] : undefined}
                >
                  {word}
                </span>
              )
            })}
          </div>
        )
      })}
      {!section.lines.some((l) => l.trim()) && (
        <div className="text-xs font-mono text-studio-dim">Add some lyrics first to analyze the flow.</div>
      )}
    </div>
  )
}

// ─── AI Performance Suggestions Tab ──────────────────────────────────────────

function AIPerformanceTab({ section, color }) {
  const { annotations, setPerformanceAnnotation } = useStudioStore()
  const [loading, setLoading] = useState(false)
  const perf = annotations.performance[section.id] || null

  const analyze = async () => {
    const text = section.lines.filter(Boolean).join('\n')
    if (!text.trim()) return
    setLoading(true)
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const result = await model.generateContent(
        `You are a vocal performance coach analyzing these rap/vocal lyrics line by line.

Section: ${section.label}
Lyrics:
${section.lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}

For each numbered line, give one SHORT, specific performance directive (5-10 words max).
Focus on: breath placement, holds, ad-libs, doubles, vocal texture, energy delivery.

Return JSON only:
{ "lines": [ { "idx": 0, "note": "..." }, ... ] }
Only include lines that have actual content (non-empty). idx is 0-based.`
      )
      const raw = result.response.text().replace(/```json?|```/g, '').trim()
      const parsed = JSON.parse(raw)
      setPerformanceAnnotation(section.id, parsed.lines || [])
    } catch {
      setPerformanceAnnotation(section.id, [{ idx: -1, note: 'AI unavailable — try again' }])
    } finally {
      setLoading(false)
    }
  }

  const noteMap = {}
  if (perf) perf.forEach((p) => { noteMap[p.idx] = p.note })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={analyze}
          disabled={loading}
          className="px-3 py-1.5 rounded text-xs font-ui font-semibold text-black transition-all disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${color}, #b44fff)` }}
        >
          {loading ? 'Analyzing...' : '✦ Analyze Performance'}
        </button>
        {perf && (
          <button
            onClick={() => setPerformanceAnnotation(section.id, null)}
            className="text-xs font-mono text-studio-dim hover:text-studio-red transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      {!perf && !loading && (
        <div className="text-xs font-mono text-studio-dim">
          Click Analyze to get AI-generated performance cues for each line.
        </div>
      )}
      {loading && (
        <div className="text-xs font-mono text-studio-dim">Reading your flow...</div>
      )}
      {perf && section.lines.map((line, li) => {
        if (!line.trim()) return null
        const note = noteMap[li]
        return (
          <div key={li} className="flex items-start gap-2">
            <span className="text-xs font-mono text-studio-dim w-5 shrink-0 mt-0.5">{li + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-ui text-studio-text">{line}</div>
              {note && (
                <div
                  className="mt-0.5 px-2 py-0.5 rounded text-xs font-mono inline-block"
                  style={{ background: color + '22', color, border: `1px solid ${color}55` }}
                >
                  {note}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Annotation Panel ─────────────────────────────────────────────────────────

const ANNOT_TABS = [
  { id: 'stress',  label: 'Stress',   icon: 'S' },
  { id: 'beatmap', label: 'Beat Map', icon: '♩' },
  { id: 'tone',    label: 'Tone',     icon: '◉' },
  { id: 'contour', label: 'Contour',  icon: '~' },
  { id: 'flow',    label: 'Flow',     icon: '≋' },
  { id: 'ai',      label: 'AI Coach', icon: '✦' },
]

function AnnotationPanel({ section, color }) {
  const [tab, setTab] = useState('stress')
  const { clearSectionAnnotations } = useStudioStore()

  return (
    <div className="border-t border-studio-border bg-studio-void">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-studio-border px-3 pt-2 overflow-x-auto">
        {ANNOT_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-ui font-semibold transition-colors whitespace-nowrap"
            style={{
              color: tab === t.id ? color : '#888899',
              borderBottom: tab === t.id ? `2px solid ${color}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => { if (window.confirm('Clear all annotations for this section?')) clearSectionAnnotations(section.id) }}
          className="px-2 py-1 text-xs font-mono text-studio-dim hover:text-studio-red transition-colors"
          title="Clear all annotations for this section"
        >
          Clear all
        </button>
      </div>
      <div className="p-4 max-h-72 overflow-y-auto">
        {tab === 'stress'  && <StressTab section={section} color={color} />}
        {tab === 'beatmap' && <BeatMapTab section={section} />}
        {tab === 'tone'    && <ToneTagsTab section={section} />}
        {tab === 'contour' && <ContourTab section={section} color={color} />}
        {tab === 'flow'    && <FlowTab section={section} />}
        {tab === 'ai'      && <AIPerformanceTab section={section} color={color} />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function SectionBlock({ section }) {
  const { addLine } = useStudioStore()
  const color = SECTION_COLORS[section.type] || '#888899'
  const [showRewrite, setShowRewrite] = useState(false)
  const [showCoWrite, setShowCoWrite] = useState(false)
  const [showRhymeViz, setShowRhymeViz] = useState(false)
  const [showAnnotate, setShowAnnotate] = useState(false)

  const rhymeGroups = showRhymeViz ? detectRhymeGroups(section.lines) : {}
  const rhymeGroupCount = showRhymeViz ? new Set(Object.values(rhymeGroups)).size : 0

  return (
    <div
      className="bg-studio-panel border border-studio-border rounded-xl overflow-hidden"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-studio-border flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
          <span className="font-display text-sm font-semibold" style={{ color }}>
            {section.label.toUpperCase()}
          </span>
          <span className="text-xs text-studio-dim font-mono">{section.lines.length} lines</span>
          {showRhymeViz && rhymeGroupCount > 0 && (
            <span className="text-xs font-mono text-studio-dim">{rhymeGroupCount} rhyme group{rhymeGroupCount !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setShowRhymeViz((v) => !v)}
            className="px-2 py-1 rounded text-xs font-ui font-semibold border transition-colors"
            style={{
              borderColor: showRhymeViz ? '#ffe600' : '#252540',
              color: showRhymeViz ? '#ffe600' : '#888899',
              background: showRhymeViz ? 'rgba(255,230,0,0.08)' : 'transparent',
            }}
            title="Show rhyme scheme — dots color-code lines that rhyme together"
          >
            ≈ Rhymes
          </button>
          <button
            onClick={() => setShowAnnotate((v) => !v)}
            className="px-2 py-1 rounded text-xs font-ui font-semibold border transition-colors"
            style={{
              borderColor: showAnnotate ? color : '#252540',
              color: showAnnotate ? color : '#888899',
              background: showAnnotate ? color + '15' : 'transparent',
            }}
            title="Annotate — stress markers, beat map, tone tags, contour, flow analyzer, AI coach"
          >
            ✎ Annotate
          </button>
          <button
            onClick={() => setShowCoWrite(true)}
            className="px-2 py-1 rounded text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:border-studio-green hover:text-studio-green transition-colors"
            title="Co-write this section with AI"
          >
            ✦ Co-Write
          </button>
          <button
            onClick={() => setShowRewrite(true)}
            className="px-2 py-1 rounded text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:border-studio-purple hover:text-studio-purple transition-colors"
            title="AI rewrite this section"
          >
            ✦ Rewrite
          </button>
          <button
            onClick={() => addLine(section.id)}
            className="px-2 py-1 rounded text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:text-studio-cyan hover:border-studio-cyan transition-colors"
          >
            + Line
          </button>
        </div>
      </div>
      <div className="p-4 flex flex-col gap-1.5">
        {section.lines.map((line, i) => (
          <LyricLine
            key={i} line={line} index={i} sectionId={section.id}
            color={color} section={section} rhymeColor={rhymeGroups[i]}
          />
        ))}
        {section.lines.length === 0 && (
          <div className="text-sm text-studio-dim font-ui py-2 text-center">
            Click + Line to start writing
          </div>
        )}
      </div>

      {showAnnotate && <AnnotationPanel section={section} color={color} />}

      {showCoWrite && (
        <CoWriteModal section={section} color={color} onClose={() => setShowCoWrite(false)} />
      )}
      {showRewrite && (
        <RewriteModal section={section} color={color} onClose={() => setShowRewrite(false)} />
      )}
    </div>
  )
}

function SaveModal({ onSave, onClose, defaultName }) {
  const [name, setName] = useState(defaultName || '')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const submit = () => {
    onSave(name.trim() || 'Untitled Song')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-studio-panel border border-studio-border rounded-2xl p-6 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-display text-base font-semibold text-studio-text mb-1">Save Song</div>
        <div className="text-xs text-studio-dim font-ui mb-4">Give this song a name so you can find it later.</div>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="e.g. Never Give Up, Late Night Vibes..."
          className="w-full bg-studio-void border border-studio-border rounded-xl px-4 py-2.5 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-cyan mb-4"
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-ui font-semibold border border-studio-border text-studio-dim hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-ui font-semibold text-black transition-all"
            style={{ background: 'linear-gradient(135deg, #00e5ff, #b44fff)' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function AiSongCard({ song, onOpen, onDelete }) {
  const { aiSongs } = useStudioStore()
  const [renaming, setRenaming] = useState(false)
  const [nameVal, setNameVal] = useState(song.name)

  const commitRename = () => {
    const trimmed = nameVal.trim()
    if (!trimmed) { setRenaming(false); return }
    const updated = aiSongs.map((s) => (s.id === song.id ? { ...s, name: trimmed } : s))
    localStorage.setItem('hsmm_ai_songs', JSON.stringify(updated))
    useStudioStore.setState({ aiSongs: updated })
    setRenaming(false)
  }

  return (
    <div className="group rounded-lg border border-studio-border hover:border-studio-purple/60 hover:bg-studio-purple/5 px-3 py-2 transition-colors">
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenaming(false)
              }}
              className="w-full bg-studio-void border border-studio-purple/50 rounded px-2 py-0.5 text-xs font-ui text-studio-text focus:outline-none"
            />
          ) : (
            <div
              className="text-xs font-ui font-semibold truncate cursor-pointer"
              style={{ color: song.autoSaved ? '#888899' : '#b44fff' }}
              onClick={() => setRenaming(true)}
              title="Click to rename"
            >
              {song.autoSaved && <span className="text-studio-dim mr-1">⟳</span>}
              {song.name}
            </div>
          )}
          <div className="text-xs font-mono text-studio-dim mt-0.5">
            {song.savedAt} · {song.sectionCount} sections
            {song.autoSaved && <span className="text-studio-dim ml-1">· auto-saved</span>}
          </div>
        </div>
        <button
          onClick={onDelete}
          className="shrink-0 text-studio-dim hover:text-studio-red text-xs opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
        >
          ✕
        </button>
      </div>
      {song.sectionCount > 0 && (
        <button
          onClick={onOpen}
          className="w-full text-left px-2 py-1 rounded text-xs font-ui text-studio-dim hover:text-studio-cyan border border-transparent hover:border-studio-cyan/40 transition-colors"
        >
          → Open in Editor
        </button>
      )}
    </div>
  )
}

export default function LyricsView() {
  const {
    lyrics, addSection, currentSongName, setCurrentSongName,
    saveSong, loadSong, deleteSavedSong, newSong, savedSongs,
    aiSongs, loadAiSongToEditor, deleteAiSong, loadTemplate,
  } = useStudioStore()

  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveFlash, setSaveFlash] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(currentSongName)
  const [sidebarTab, setSidebarTab] = useState('My Songs')
  const [showTemplates, setShowTemplates] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showTitles, setShowTitles] = useState(false)
  const [titleSuggestions, setTitleSuggestions] = useState([])
  const [loadingTitles, setLoadingTitles] = useState(false)

  const exportAllSongs = () => {
    const total = savedSongs.length + aiSongs.length
    if (total === 0) return
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const divider = '═'.repeat(60)

    const formatSong = (song, tag) => {
      const header = `${divider}\n${tag}${song.name}\nSaved: ${song.savedAt}\n${divider}`
      const body = (song.sections || [])
        .map((s) => `\n[${s.label.toUpperCase()}]\n${(s.lines || []).filter((l) => l.trim()).join('\n') || '(empty)'}`)
        .join('\n')
      return `${header}${body}`
    }

    const parts = []
    if (savedSongs.length > 0) {
      parts.push(`MY SONGS (${savedSongs.length})\n${'─'.repeat(60)}`)
      savedSongs.forEach((s) => parts.push(formatSong(s, '')))
    }
    if (aiSongs.length > 0) {
      parts.push(`\nAI SONGS (${aiSongs.length})\n${'─'.repeat(60)}`)
      aiSongs.forEach((s) => parts.push(formatSong(s, '✦ AI: ')))
    }

    const blob = new Blob(
      [`Home Studio Music Maker — All Songs Backup\nExported: ${date}\n${total} songs total\n\n\n${parts.join('\n\n')}`],
      { type: 'text/plain;charset=utf-8' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `HSMM_AllSongs_${date.replace(/ /g, '_').replace(/,/g, '')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const allLyrics = lyrics
    .map((s) => `[${s.label}]\n${s.lines.join('\n')}`)
    .join('\n\n')

  const handleSave = (name) => {
    saveSong(name)
    setSaveFlash(true)
    setTimeout(() => setSaveFlash(false), 1800)
  }

  const handleLoadSong = (id) => {
    loadSong(id)
  }

  const handleNewSong = () => {
    newSong()
  }

  const applyTemplate = (template) => {
    const hasContent = lyrics.some((s) => s.lines.some((l) => l.trim()))
    if (hasContent) {
      if (!window.confirm(`Replace your current lyrics with the "${template.name}" template?`)) return
    }
    loadTemplate(template.sections)
    setShowTemplates(false)
  }

  const exportTxt = () => {
    const header = `${currentSongName}\n${'─'.repeat(currentSongName.length)}\n\n`
    const body = lyrics
      .map((s) => `[${s.label.toUpperCase()}]\n${s.lines.filter((l) => l.trim()).join('\n')}`)
      .join('\n\n')
    const blob = new Blob([header + body], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentSongName.replace(/[^a-z0-9]/gi, '_')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setShowExport(false)
  }

  const printLyrics = () => {
    const sections = lyrics
      .map((s) => {
        const lines = s.lines.filter((l) => l.trim())
        return `<div style="margin-bottom:2.5rem">
          <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.12em;color:#888;border-top:1px solid #ddd;padding-top:1rem;margin-bottom:0.75rem">${escHtml(s.label)}</div>
          <div style="line-height:2.3;font-size:1rem">${lines.map(escHtml).join('<br>') || '<em style="color:#aaa">empty</em>'}</div>
        </div>`
      })
      .join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escHtml(currentSongName)}</title>
  <style>
    @page { margin: 1in; }
    body { font-family: Georgia, "Times New Roman", serif; color: #000; max-width: 520px; margin: 0 auto; }
    h1 { font-size: 1.6rem; margin: 0 0 0.2rem; font-weight: bold; }
    .sub { font-size: 0.8rem; color: #666; margin-bottom: 2.5rem; }
  </style>
</head>
<body>
  <h1>${escHtml(currentSongName)}</h1>
  <div class="sub">Home Studio Music Maker</div>
  ${sections}
  <script>window.onload = function(){ window.print() }</script>
</body>
</html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
    }
    setShowExport(false)
  }

  const generateTitles = async () => {
    if (!allLyrics.trim()) return
    setShowTitles(true)
    setShowExport(false)
    setShowTemplates(false)
    setLoadingTitles(true)
    setTitleSuggestions([])
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const result = await model.generateContent(
        `Based on these song lyrics, suggest 5 great song titles. Make them memorable, evocative, and fitting the mood and content.

Lyrics:
${allLyrics}

Return ONLY the 5 titles, one per line, no numbers, no bullet points, no explanation.`
      )
      const titles = result.response.text()
        .split('\n')
        .map((t) => t.trim().replace(/^[-–•\d.)\s]+/, ''))
        .filter(Boolean)
        .slice(0, 5)
      setTitleSuggestions(titles)
    } catch {
      setTitleSuggestions([])
    } finally {
      setLoadingTitles(false)
    }
  }

  const copyAll = () => {
    navigator.clipboard.writeText(allLyrics)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const commitName = () => {
    setEditingName(false)
    setCurrentSongName(nameInput.trim() || 'Untitled Song')
  }

  return (
    <div className="flex h-full bg-studio-void">
      {/* Main editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-studio-panel border-b border-studio-border flex-wrap">
          {/* Song name */}
          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') commitName() }}
              className="bg-studio-void border border-studio-cyan rounded px-2 py-0.5 text-sm font-display font-semibold text-studio-text focus:outline-none w-44"
            />
          ) : (
            <button
              onClick={() => { setEditingName(true); setNameInput(currentSongName) }}
              className="font-display text-sm font-semibold text-studio-text hover:text-studio-cyan transition-colors"
              title="Click to rename"
            >
              {currentSongName} ✎
            </button>
          )}

          <div className="w-px h-4 bg-studio-border mx-1" />

          {/* Templates dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowTemplates((t) => !t); setShowExport(false) }}
              className="px-2 py-1 rounded text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:text-studio-text hover:border-studio-border/80 transition-colors"
            >
              Templates ▾
            </button>
            {showTemplates && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTemplates(false)} />
                <div className="absolute top-full left-0 mt-1 z-20 bg-studio-panel border border-studio-border rounded-xl shadow-2xl py-1 w-64">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                        <span className="text-sm font-ui font-semibold text-studio-text">{t.name}</span>
                      </div>
                      <div className="text-xs text-studio-dim font-mono mt-0.5 ml-4">{t.description}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="w-px h-4 bg-studio-border mx-1" />

          {/* Add section buttons */}
          {SECTION_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => addSection(type)}
              className="px-2 py-1 rounded text-xs font-ui font-semibold border transition-colors"
              style={{
                borderColor: SECTION_COLORS[type] + '44',
                color: SECTION_COLORS[type],
                background: SECTION_COLORS[type] + '11',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = SECTION_COLORS[type] + '22'
                e.currentTarget.style.borderColor = SECTION_COLORS[type]
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = SECTION_COLORS[type] + '11'
                e.currentTarget.style.borderColor = SECTION_COLORS[type] + '44'
              }}
            >
              + {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}

          <div className="flex-1" />

          <button
            onClick={copyAll}
            className="px-3 py-1.5 rounded text-xs font-ui font-semibold transition-colors"
            style={{
              background: 'transparent',
              border: `1px solid ${copied ? '#00e5ff' : '#252540'}`,
              color: copied ? '#00e5ff' : '#888899',
            }}
          >
            {copied ? '✓ Copied!' : 'Copy All'}
          </button>

          {/* Title generator */}
          <div className="relative">
            <button
              onClick={() => { if (showTitles) { setShowTitles(false) } else { generateTitles() } }}
              disabled={!allLyrics.trim()}
              className="px-3 py-1.5 rounded text-xs font-ui font-semibold border transition-colors disabled:opacity-40"
              style={{
                borderColor: showTitles ? '#b44fff' : '#252540',
                color: showTitles ? '#b44fff' : '#888899',
                background: showTitles ? 'rgba(180,79,255,0.08)' : 'transparent',
              }}
              title="Generate title ideas from your lyrics"
            >
              ✦ Titles
            </button>
            {showTitles && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTitles(false)} />
                <div className="absolute top-full right-0 mt-1 z-20 bg-studio-panel border border-studio-border rounded-xl shadow-2xl py-1 w-64">
                  <div className="px-4 py-1.5 text-xs font-mono text-studio-dim border-b border-studio-border">
                    Title ideas — click to apply
                  </div>
                  {loadingTitles ? (
                    <div className="px-4 py-3 text-xs font-mono text-studio-dim">Generating titles...</div>
                  ) : titleSuggestions.length > 0 ? (
                    titleSuggestions.map((title, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setCurrentSongName(title)
                          setNameInput(title)
                          setShowTitles(false)
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors"
                      >
                        <div className="text-sm font-ui text-studio-text">{title}</div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-xs font-mono text-studio-dim">No suggestions. Add more lyrics first.</div>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setShowSaveModal(true)}
            className="px-3 py-1.5 rounded text-xs font-ui font-semibold transition-all"
            style={{
              background: saveFlash ? 'rgba(0,255,157,0.2)' : 'rgba(0,255,157,0.1)',
              border: `1px solid ${saveFlash ? '#00ff9d' : 'rgba(0,255,157,0.3)'}`,
              color: '#00ff9d',
            }}
          >
            {saveFlash ? '✓ Saved!' : '💾 Save Song'}
          </button>

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowExport((e) => !e); setShowTemplates(false) }}
              className="px-3 py-1.5 rounded text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:text-studio-text transition-colors"
            >
              ↓ Export
            </button>
            {showExport && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExport(false)} />
                <div className="absolute top-full right-0 mt-1 z-20 bg-studio-panel border border-studio-border rounded-xl shadow-2xl py-1 w-48">
                  <button
                    onClick={exportTxt}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors"
                  >
                    <div className="text-sm font-ui text-studio-text">Download .txt</div>
                    <div className="text-xs text-studio-dim font-mono">Save as text file</div>
                  </button>
                  <button
                    onClick={printLyrics}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors"
                  >
                    <div className="text-sm font-ui text-studio-text">Print / Save PDF</div>
                    <div className="text-xs text-studio-dim font-mono">Open print dialog</div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-3xl mx-auto flex flex-col gap-4">
            {lyrics.map((section) => (
              <SectionBlock key={section.id} section={section} />
            ))}
            {lyrics.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-5xl mb-4 opacity-20">✍️</div>
                <div className="font-ui text-studio-dim">No sections yet. Add a Verse or Chorus above to start writing.</div>
              </div>
            )}
          </div>
        </div>

        {/* Full lyrics preview */}
        {lyrics.length > 0 && (
          <div className="border-t border-studio-border bg-studio-panel px-4 py-3">
            <div className="text-xs font-mono text-studio-dim mb-1 uppercase tracking-wider">Full Lyrics Preview</div>
            <div className="font-ui text-xs text-studio-dim whitespace-pre-wrap max-h-20 overflow-y-auto leading-5">
              {allLyrics || 'Start writing above...'}
            </div>
          </div>
        )}
      </div>

      {/* Songs sidebar — two tabs */}
      <div className="w-64 border-l border-studio-border flex flex-col bg-studio-panel">
        <div className="flex border-b border-studio-border">
          {['My Songs', 'AI Songs'].map((tab) => (
            <button
              key={tab}
              onClick={() => setSidebarTab(tab)}
              className="flex-1 py-2 text-xs font-display font-semibold tracking-wider transition-colors"
              style={{
                color: sidebarTab === tab ? '#00e5ff' : '#888899',
                borderBottom: sidebarTab === tab ? '2px solid #00e5ff' : '2px solid transparent',
                background: 'transparent',
              }}
            >
              {tab}
              <span className="ml-1 font-mono font-normal">
                ({tab === 'My Songs' ? savedSongs.length : aiSongs.length})
              </span>
            </button>
          ))}
        </div>

        {/* My Songs tab */}
        {sidebarTab === 'My Songs' && (
          <>
            <button
              onClick={handleNewSong}
              className="mx-3 mt-3 px-3 py-2 rounded-lg border border-dashed border-studio-border text-xs font-ui text-studio-dim hover:text-studio-cyan hover:border-studio-cyan transition-colors text-center"
            >
              + New Song
            </button>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 mt-2">
              {savedSongs.length === 0 && (
                <div className="text-xs text-studio-dim font-ui text-center py-6 px-2 leading-relaxed">
                  No saved songs yet. Hit "Save Song" to keep your work here.
                </div>
              )}
              {savedSongs.map((song) => (
                <div
                  key={song.id}
                  className={`group rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                    song.name === currentSongName
                      ? 'border-studio-cyan bg-studio-cyan/5'
                      : 'border-studio-border hover:border-studio-border/80 hover:bg-studio-surface/50'
                  }`}
                  onClick={() => handleLoadSong(song.id)}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <div
                        className="text-xs font-ui font-semibold truncate"
                        style={{ color: song.name === currentSongName ? '#00e5ff' : '#c0c0d0' }}
                      >
                        {song.name}
                      </div>
                      <div className="text-xs font-mono text-studio-dim mt-0.5">
                        {song.savedAt} · {song.sections.length} sections
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSavedSong(song.id) }}
                      className="shrink-0 text-studio-dim hover:text-studio-red text-xs opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* AI Songs tab */}
        {sidebarTab === 'AI Songs' && (
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 mt-2">
            {aiSongs.length === 0 && (
              <div className="text-xs text-studio-dim font-ui text-center py-6 px-2 leading-relaxed">
                AI-generated songs auto-save here. Go to AI Co-Pilot and generate a song to get started.
              </div>
            )}
            {aiSongs.map((song) => (
              <AiSongCard
                key={song.id}
                song={song}
                onOpen={() => { loadAiSongToEditor(song.id); setSidebarTab('My Songs') }}
                onDelete={() => deleteAiSong(song.id)}
              />
            ))}
          </div>
        )}

        {/* Export All — always visible at the bottom */}
        <div className="border-t border-studio-border p-2">
          <button
            onClick={exportAllSongs}
            disabled={savedSongs.length === 0 && aiSongs.length === 0}
            className="w-full px-3 py-2 rounded-lg text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:text-studio-cyan hover:border-studio-cyan disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Download all your songs as a single backup text file"
          >
            ⬇ Export All Songs ({savedSongs.length + aiSongs.length})
          </button>
        </div>
      </div>

      {showSaveModal && (
        <SaveModal
          defaultName={currentSongName}
          onSave={handleSave}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  )
}
