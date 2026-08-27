import React, { useState, useRef, useEffect } from 'react'
import { GoogleGenerativeAI } from '../../utils/gemini-compat'
import { useStudioStore } from '../../store/useStudioStore'
import { useStyleProfile } from '../../hooks/useStyleProfile'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '')

function Message({ msg }) {
  const isUser = msg.role === 'user'
  const { saveAiSong } = useStudioStore()
  const hasSections = !isUser && (msg.content.includes('[Verse') || msg.content.includes('[Chorus') || msg.content.includes('[Hook'))
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const doSave = () => {
    const name = saveName.trim() || 'AI Song'
    saveAiSong(name, msg.content)
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
  }

  const doCopy = () => {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center font-display font-bold text-xs ${
          isUser
            ? 'bg-studio-purple text-white shadow-purple'
            : 'bg-gradient-to-br from-studio-cyan to-studio-purple text-black shadow-cyan'
        }`}
      >
        {isUser ? 'B' : 'AI'}
      </div>
      <div className="max-w-[80%] flex flex-col gap-2">
        <div
          className={`rounded-xl px-4 py-3 text-sm font-ui leading-relaxed select-text cursor-text ${
            isUser
              ? 'bg-studio-purple/20 border border-studio-purple/30 text-studio-text'
              : 'bg-studio-surface border border-studio-border text-studio-text'
          }`}
        >
          {msg.content.split('\n').map((line, i) => {
            if (line.startsWith('[') && line.includes(']')) {
              return (
                <div key={i} className="font-display text-xs text-studio-cyan tracking-widest uppercase mt-3 mb-1 first:mt-0">
                  {line}
                </div>
              )
            }
            return <p key={i} className={line === '' ? 'h-2' : ''}>{line}</p>
          })}
        </div>

        {/* Action buttons for AI messages */}
        {!isUser && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={doCopy}
              className="self-start px-3 py-1.5 rounded-lg text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:border-studio-cyan hover:text-studio-cyan transition-colors"
            >
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
            {hasSections && !saved && !saving && (
              <button
                onClick={() => setSaving(true)}
                className="self-start px-3 py-1.5 rounded-lg text-xs font-ui font-semibold border border-studio-purple/40 text-studio-purple hover:border-studio-purple hover:bg-studio-purple/10 transition-colors"
              >
                💾 Save to AI Songs
              </button>
            )}
          </div>
        )}
        {!isUser && hasSections && saving && (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') setSaving(false) }}
              placeholder="Name this song..."
              className="bg-studio-void border border-studio-purple/50 rounded-lg px-3 py-1.5 text-xs font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-purple w-44"
            />
            <button onClick={doSave} className="px-3 py-1.5 rounded-lg text-xs font-ui font-semibold text-black" style={{ background: 'linear-gradient(135deg,#b44fff,#00e5ff)' }}>Save</button>
            <button onClick={() => setSaving(false)} className="text-xs text-studio-dim hover:text-white">✕</button>
          </div>
        )}
        {!isUser && saved && (
          <span className="text-xs font-mono text-studio-purple self-start">✓ Saved to AI Songs</span>
        )}
      </div>
    </div>
  )
}

function StyleProfileDisplay({ profile }) {
  const { resetProfile } = useStyleProfile()
  const hasData = profile.themes.length > 0 || profile.rhymeSchemes.length > 0 || profile.vocabulary.length > 0
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <div className="bg-studio-panel border border-studio-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-studio-green shadow-green" />
        <span className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase">
          Style Profile
        </span>
        {hasData && !confirmReset && (
          <button
            onClick={() => setConfirmReset(true)}
            className="text-xs font-mono text-studio-dim hover:text-studio-red transition-colors ml-auto"
            title="Clear style profile"
          >
            reset
          </button>
        )}
        {confirmReset && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-mono text-studio-dim">sure?</span>
            <button onClick={() => { resetProfile(); setConfirmReset(false) }} className="text-xs font-mono text-studio-red hover:text-red-400">yes</button>
            <button onClick={() => setConfirmReset(false)} className="text-xs font-mono text-studio-dim hover:text-white">no</button>
          </div>
        )}
        {!hasData && (
          <span className="text-xs text-studio-dim font-mono ml-auto">learning...</span>
        )}
      </div>
      {!hasData ? (
        <p className="text-xs text-studio-dim font-ui">
          Write lyrics in the Lyrics tab and chat here — the AI will learn your style over time.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {profile.themes.length > 0 && (
            <div>
              <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">Themes: </span>
              <span className="text-xs font-ui text-studio-cyan">{profile.themes.join(' · ')}</span>
            </div>
          )}
          {profile.rhymeSchemes.length > 0 && (
            <div>
              <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">Rhyme: </span>
              <span className="text-xs font-ui text-studio-purple">{profile.rhymeSchemes.join(' · ')}</span>
            </div>
          )}
          {profile.vocabulary.length > 0 && (
            <div>
              <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">Vocab: </span>
              <span className="text-xs font-ui text-studio-text leading-5">
                {profile.vocabulary.slice(0, 15).join(', ')}
                {profile.vocabulary.length > 15 && (
                  <span className="text-studio-dim"> +{profile.vocabulary.length - 15} more</span>
                )}
              </span>
            </div>
          )}
          {profile.lyricsHistory.length > 0 && (
            <div>
              <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">Sessions: </span>
              <span className="text-xs font-ui text-studio-green">{profile.lyricsHistory.length} saved</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const MOODS = [
  { label: 'motivational',  color: '#00e5ff' },
  { label: 'hype',          color: '#ff2d55' },
  { label: 'spiritual',     color: '#b44fff' },
  { label: 'emotional',     color: '#ff9500' },
  { label: 'reflective',    color: '#00ff9d' },
  { label: 'love',          color: '#ff6b9d' },
  { label: 'triumphant',    color: '#ffe600' },
  { label: 'melancholy',    color: '#6b8cff' },
  { label: 'nostalgic',     color: '#c0a060' },
  { label: 'aggressive',    color: '#ff4444' },
  { label: 'peaceful',      color: '#80ffcc' },
  { label: 'grateful',      color: '#ffcc44' },
  { label: 'lonely',        color: '#8899bb' },
  { label: 'determined',    color: '#44ddff' },
  { label: 'gospel',        color: '#ddaaff' },
  { label: 'dark',          color: '#aa44ff' },
  { label: 'storytelling',  color: '#ff9944' },
  { label: 'heartbreak',    color: '#ff4488' },
  { label: 'trap / street', color: '#44ff88' },
  { label: 'uplifting',     color: '#ffee44' },
]

const RHYME_TYPES = [
  {
    label: 'Mixed',
    desc: 'Combines all rhyme types freely — keeps it unpredictable and dynamic',
    color: '#ffe600',
    instruction: 'Use a mix of all rhyme types freely throughout — end rhymes, internal rhymes, multisyllabic, slant, chain, and cross rhymes. Switch it up bar to bar to keep the listener engaged.',
  },
  {
    label: 'End Rhyme',
    desc: 'Classic rhyme at the last word of each bar',
    color: '#00e5ff',
    instruction: 'Use end rhymes — each bar ends with a word that rhymes with the previous or next bar. Keep it clean and satisfying.',
  },
  {
    label: 'Internal Rhyme',
    desc: 'Rhymes land inside the bar, not just at the end',
    color: '#b44fff',
    instruction: 'Load bars with internal rhymes — words within the middle of the line rhyme with each other AND with end words. Every bar should have at least one mid-bar rhyme.',
  },
  {
    label: 'Multisyllabic',
    desc: 'Multiple syllables rhyme together (mo-ti-VA-tion / ded-i-CA-tion)',
    color: '#00ff9d',
    instruction: 'Use multisyllabic rhymes — 2 to 4 syllables rhyming together at a time, not just single words. Prioritize complex rhyme matches over simple ones.',
  },
  {
    label: 'AABB Couplet',
    desc: 'Every two lines rhyme as a pair',
    color: '#ff9500',
    instruction: 'Use AABB couplet rhyme scheme — every pair of consecutive bars rhymes together. Line 1 rhymes with line 2, line 3 rhymes with line 4, and so on.',
  },
  {
    label: 'ABAB Alternating',
    desc: 'Every other line rhymes (1 with 3, 2 with 4)',
    color: '#ff6b9d',
    instruction: 'Use ABAB alternating rhyme scheme — odd-numbered bars rhyme with each other, even-numbered bars rhyme with each other. Creates a woven, cross-stitched feel.',
  },
  {
    label: 'Chain Rhyme',
    desc: 'One rhyme sound carries through 4+ consecutive bars',
    color: '#44ddff',
    instruction: 'Use chain rhymes — lock onto a single rhyme sound and sustain it across 4 to 8 consecutive bars before switching. Creates a relentless, hypnotic momentum.',
  },
  {
    label: 'Slant / Near Rhyme',
    desc: 'Words that sound close but don\'t perfectly rhyme',
    color: '#c0a060',
    instruction: 'Use slant rhymes — words that share similar sounds but don\'t perfectly rhyme (e.g., "prove/move", "time/mind"). Gives a looser, conversational authenticity.',
  },
  {
    label: 'Cross Rhyme',
    desc: 'Rhymes skip and interlock across non-adjacent bars',
    color: '#ddaaff',
    instruction: 'Use cross rhymes — set up a rhyme in bar 1, resolve it in bar 3; set up another in bar 2, resolve in bar 4. Creates a layered, puzzle-like rhyme structure.',
  },
  {
    label: 'ABBA Enclosed',
    desc: 'Lines 1 & 4 rhyme, lines 2 & 3 rhyme — circular and wrapping',
    color: '#ee77cc',
    instruction: 'Use ABBA enclosed rhyme scheme — in each 4-bar block: line 1 and line 4 share one rhyme sound, lines 2 and 3 share a different rhyme sound. Creates a wrapping, circular feel that pulls the listener back.',
  },
  {
    label: 'AAAA Monorhyme',
    desc: 'Every bar locks onto one single rhyme sound — relentless',
    color: '#ff5544',
    instruction: 'Use AAAA monorhyme — every single bar ends on the same rhyme sound. Sustain it through the entire verse, leaning on internal rhymes too. Creates a wall of sound that feels inevitable.',
  },
  {
    label: 'AABA Rubaiyat',
    desc: 'Lines 1, 2, 4 rhyme; line 3 is free — creates a surprising open bar',
    color: '#88cc44',
    instruction: 'Use AABA rubaiyat pattern — in each 4-bar block: lines 1, 2, and 4 rhyme together; line 3 is deliberately free (unrhymed). The free bar creates tension that the 4th bar resolves.',
  },
  {
    label: 'ABCB Ballad',
    desc: 'Only lines 2 & 4 rhyme — open and song-like',
    color: '#cc9944',
    instruction: 'Use ABCB ballad meter — in each 4-bar block only lines 2 and 4 rhyme; lines 1 and 3 are unrhymed. Creates a spacious, song-like feel with a natural cadence that breathes.',
  },
  {
    label: 'AAB-CCB Triplet',
    desc: 'Two couplets share a pivot rhyme at bar 3 and bar 6',
    color: '#77aaff',
    instruction: 'Use AAB-CCB triplet structure — bars 1 & 2 rhyme together (AA), bar 3 is the pivot rhyme (B), bars 4 & 5 rhyme together (CC), bar 6 returns to the B rhyme. Creates a 6-bar bridge rhyme anchor that feels satisfying and unexpected.',
  },
]

const LYRIC_STRUCTURES = [
  {
    id: 'none',
    label: 'Free Form',
    icon: '〜',
    color: '#666688',
    desc: 'No forced structure — let the content flow naturally',
    instruction: '',
  },
  {
    id: 'setup_punchline',
    label: 'Setup / Punchline',
    icon: '🥊',
    color: '#ff2d55',
    desc: 'Bar 1 builds the premise; bar 2 lands the knockout. Every couplet.',
    instruction: `LYRIC STRUCTURE — SETUP / PUNCHLINE:
Every couplet in each verse MUST follow this pattern:
- BAR 1 (SETUP): Plant the premise, image, or expectation. Don't resolve it yet.
- BAR 2 (PUNCHLINE): Twist, subvert, or hit the knockout blow. The listener didn't see it coming.
Apply this across all 8 couplets in each 16-bar verse. Never let a punchline be predictable. Force the unexpected.`,
  },
  {
    id: 'question_answer',
    label: 'Question / Answer',
    icon: '❓',
    color: '#00e5ff',
    desc: 'Odd bars ask; even bars answer. Tension and release.',
    instruction: `LYRIC STRUCTURE — QUESTION / ANSWER:
Alternate bars throughout each verse:
- ODD BARS: Ask a question (explicit or implied) — rhetorical, direct, or existential
- EVEN BARS: Answer it — with a reveal, a confession, a truth, or a twist
This creates a call-and-response feel that pulls the listener through each verse.`,
  },
  {
    id: 'contrast_pairs',
    label: 'Contrast Pairs',
    icon: '⚡',
    color: '#ff9500',
    desc: 'Bar 1: the problem. Bar 2: the flip. Every couplet.',
    instruction: `LYRIC STRUCTURE — CONTRAST PAIRS:
Each couplet in every verse follows a before-and-after contrast:
- BAR 1: State the darkness, failure, struggle, or false belief
- BAR 2: Flip it — the victory, the truth, the transformation, the counter-punch
Make bar 1 real and specific enough that bar 2 earns its impact. Never let the flip feel cheap.`,
  },
  {
    id: 'metaphor_ladder',
    label: 'Metaphor Ladder',
    icon: '🪜',
    color: '#00ff9d',
    desc: 'One metaphor — each bar extends, deepens, or twists it.',
    instruction: `LYRIC STRUCTURE — METAPHOR LADDER:
Choose ONE central metaphor at the top of each verse and commit to it through every bar:
- Every bar extends, deepens, or twists the same core metaphor
- Start surface-level, go deeper, arrive at spiritual or emotional truth by bar 16
- No metaphor-hopping — one metaphor climbs from literal to profound across the entire verse
- The bridge can introduce a counter-metaphor that makes the original land harder.`,
  },
  {
    id: 'storytelling',
    label: 'Storytelling Arc',
    icon: '📖',
    color: '#b44fff',
    desc: 'Open mid-scene, build tension, climax, resolve.',
    instruction: `LYRIC STRUCTURE — STORYTELLING ARC:
Structure each verse as a compressed narrative:
- BARS 1-3: Drop into the middle of a scene — specific who, where, what is happening right now
- BARS 4-8: Rising tension — internal conflict, obstacles, or stakes building
- BARS 9-12: Climax — the turning point, breakthrough, darkest moment, or the decision
- BARS 13-16: Resolution or reveal — the meaning behind the story, what changed, what it costs
Make it feel like a short film, not a lecture.`,
  },
  {
    id: 'repetition_flip',
    label: 'Repetition & Flip',
    icon: '🔄',
    color: '#ffd23f',
    desc: 'Repeat a phrase 3x across the verse — meaning shifts each time.',
    instruction: `LYRIC STRUCTURE — REPETITION & FLIP:
Plant one phrase or image at 2-3 anchor points across the verse:
- FIRST USAGE: Introduce it at face value — seems like a simple statement
- SECOND USAGE: Repeat it in a new context that reframes the meaning
- THIRD USAGE: Drop it one final time — now it hits completely differently with all the context built
The phrase itself doesn't change. The context around it does. That's the power move.`,
  },
  {
    id: 'list_build',
    label: 'List / Accumulation',
    icon: '📋',
    color: '#44ddff',
    desc: 'Stack bars building a list; final 2 bars are the payoff.',
    instruction: `LYRIC STRUCTURE — LIST / ACCUMULATION:
Build each verse as a mounting list of evidence, observations, or images:
- BARS 1-14: Each bar adds one more item to the list — a specific detail, fact, image, or truth
- Items should escalate in weight and specificity as the list grows
- BARS 15-16: The payoff — the conclusion, thesis, or knockout that makes the whole list land
Do NOT state the point before bar 15. Let the list do the work.`,
  },
  {
    id: 'cinematic',
    label: 'Cinematic Cold Open',
    icon: '🎬',
    color: '#ff6b9d',
    desc: 'Open in a vivid scene; later bars reveal the deeper meaning.',
    instruction: `LYRIC STRUCTURE — CINEMATIC COLD OPEN:
Open each verse by dropping the listener directly into a specific, vivid scene:
- BARS 1-4: Pure scene-painting — who is in the frame, exactly where, what they're doing, sensory details
- BARS 5-10: The scene shifts — internal thoughts, complications, the emotional undercurrent
- BARS 11-16: Pull back and reveal what the scene means — the spiritual, emotional, or thematic truth
Think of it like a film opening — you don't explain the scene, you let the scene speak.`,
  },
]

const SONG_STYLES = [
  {
    id: 'balanced',
    label: 'Balanced',
    icon: '◈',
    color: '#888899',
    desc: 'Well-rounded craft across all sections',
    instruction: '',
  },
  {
    id: 'showcase',
    label: 'Lyrical Showcase',
    icon: '⬆',
    color: '#00e5ff',
    desc: 'Maximum wordplay, multisyllabics, technical depth on every bar',
    instruction: `SONG STYLE — LYRICAL SHOWCASE:
This song must demonstrate elite technical lyricism. Every verse should have: multisyllabic rhyme matches (2–4 syllables), internal rhymes mid-bar on most lines, at least 3 punchlines per verse with true setup/payoff structure, and wordplay where phrases operate on two levels. The listener should have to replay bars to catch everything.`,
  },
  {
    id: 'gospel',
    label: 'Street Gospel',
    icon: '✝',
    color: '#ffe600',
    desc: 'Biblical imagery and scripture woven through hip-hop grit',
    instruction: `SONG STYLE — STREET GOSPEL:
This song lives at the intersection of the block and the Bible. Every verse must contain: specific biblical figures and stories (not vague references — name Lazarus, Daniel, David, Joseph, the armor of God), contrast pairs that mirror redemption (lost/found, bound/free, dead/alive, empty/filled), and at least one bar per verse where street reality and scripture meaning collide in the same line. It should sound like a sermon that slaps.`,
  },
  {
    id: 'anthem',
    label: 'Motivational Anthem',
    icon: '🔥',
    color: '#ff9500',
    desc: 'Hook-driven, crowd-moving, built to uplift and push people forward',
    instruction: `SONG STYLE — MOTIVATIONAL ANTHEM:
This song is built to move crowds and change mindsets. The chorus must be immediately singable — short, powerful phrases that lock in on the first listen. Verses should build real momentum bar by bar, escalating toward the hook. Use declarative, empowering language — no passive voice, no uncertainty. The bridge should be the emotional peak that leaves people feeling like they can conquer anything. Think stadium energy.`,
  },
  {
    id: 'story',
    label: 'Storytelling',
    icon: '◎',
    color: '#b44fff',
    desc: 'Cinematic narrative arc — vivid scenes, characters, emotional journey',
    instruction: `SONG STYLE — STORYTELLING:
This song tells a complete story with a clear arc. Verse 1 establishes the situation and character. Verse 2 deepens the conflict or transformation. Bridge is the emotional turning point. Outro resolves the arc. Use specific, vivid details — not "I was struggling" but the scene of the struggle. Name places, describe moments, show don't tell. The listener should be able to see a movie playing.`,
  },
  {
    id: 'punchlines',
    label: 'Punchline Heavy',
    icon: '🥊',
    color: '#ff2d55',
    desc: 'Every 2–3 bars must land a knockout — setups and payoffs throughout',
    instruction: `SONG STYLE — PUNCHLINE HEAVY:
Every verse is a sequence of knockout punches. No neutral bars — every line either builds tension or releases it. Apply ALL of these techniques across the song:

MISDIRECTION: Set up an expectation in bar 1 — then completely subvert it in bar 2. The listener should go one direction and get snapped the other way. The farther the misdirection, the harder the landing.

DOUBLE MEANING: Write phrases where every word can be read two ways simultaneously — one literal, one metaphorical or spiritual. Both readings must be relevant. "I been grinding till the sun come up" = the work AND the spiritual discipline.

COMPARISON PUNCHLINES: Drop a simile so accurate it stops the listener cold. Not "I'm cold like ice" — find the exact unexpected comparison that no one has used before. The more surprising the vehicle, the better the punchline.

CONTRAST PUNCHLINES: Slam two opposites in the same bar. The gap between them is the punchline. "They said I'd never make it — now they asking for my table."

CALLBACK: Plant a word, image, or idea in bar 1 of a verse. Don't pay it off until the last 2 bars — by then the listener forgot it was coming. The delayed payoff hits twice as hard.

ESCALATION PUNCHLINE: Build a series of 3–4 bars that each raise the stakes, culminating in a final line that is the peak of everything before it. The listener feels the momentum and the crash simultaneously.

UNDERSTATEMENT: Say the least powerful-sounding version of the most powerful fact. Let the listener do the work of recognizing the weight. The gap between what's said and what's meant IS the punchline.

STRUCTURE: Every 3 bars maximum = one complete punch (1–2 setup bars + 1 payoff bar). Never waste a payoff bar position on setup. Count your punches — a 16-bar verse should have at least 5 distinct punchlines.`,
  },
]

function GenerateSongModal({ onGenerate, onClose }) {
  const { artistLibrary } = useStudioStore()
  const [topic, setTopic] = useState('')
  const [songStyle, setSongStyle] = useState('balanced')
  const [moods, setMoods] = useState(['motivational'])
  const [artistId, setArtistId] = useState('none')
  const [customArtist, setCustomArtist] = useState('')
  const [artistSearch, setArtistSearch] = useState('')
  const [lookedUpInstruction, setLookedUpInstruction] = useState(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [showArtistPicker, setShowArtistPicker] = useState(false)
  const [rhymeTypes, setRhymeTypes] = useState(['Mixed'])
  const [lyricStructure, setLyricStructure] = useState('none')
  const topicRef = useRef(null)

  useEffect(() => { topicRef.current?.focus() }, [])

  const toggleMood = (label) => {
    setMoods((prev) =>
      prev.includes(label)
        ? prev.length > 1 ? prev.filter((m) => m !== label) : prev
        : [...prev, label]
    )
  }

  const toggleRhyme = (label) => {
    setRhymeTypes((prev) =>
      prev.includes(label)
        ? prev.length > 1 ? prev.filter((r) => r !== label) : prev
        : [...prev, label]
    )
  }

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

  const submit = () => {
    if (!topic.trim()) return
    onGenerate(topic.trim(), moods.join(', '), artistId, customArtist, rhymeTypes, songStyle, lookedUpInstruction, lyricStructure)
    onClose()
  }

  const activeStyle = SONG_STYLES.find((s) => s.id === songStyle) || SONG_STYLES[0]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-studio-panel border border-studio-border rounded-2xl p-6 w-[520px] shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ borderTop: `3px solid ${activeStyle.color}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-display text-base font-semibold text-studio-text mb-1">Generate a Full Song</div>
        <div className="text-xs text-studio-dim font-ui mb-5">
          Set your topic, style, flow, rhyme types, and mood — the AI does the rest.
        </div>

        <label className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-1.5 block">What's the song about?</label>
        <input
          ref={topicRef}
          autoFocus
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="e.g. never giving up, faith through hard times, grinding to the top..."
          className="w-full bg-studio-void border border-studio-border rounded-xl px-4 py-2.5 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-cyan mb-4"
        />

        {/* Song Style */}
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-mono text-studio-dim uppercase tracking-wider">Song Style</label>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {SONG_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSongStyle(s.id)}
              className="flex flex-col gap-0.5 px-3 py-2 rounded-xl border text-left transition-all"
              style={{
                borderColor: songStyle === s.id ? s.color : '#252540',
                background: songStyle === s.id ? s.color + '15' : 'transparent',
                boxShadow: songStyle === s.id ? `0 0 10px ${s.color}33` : 'none',
              }}
            >
              <div className="flex items-center gap-1.5">
                <span style={{ color: songStyle === s.id ? s.color : '#666688', fontSize: 12 }}>{s.icon}</span>
                <span className="text-xs font-ui font-semibold" style={{ color: songStyle === s.id ? s.color : '#c0c0d0' }}>
                  {s.label}
                </span>
              </div>
              <span className="text-xs font-ui text-studio-dim leading-4">{s.desc}</span>
            </button>
          ))}
        </div>

        {/* Lyric Structure */}
        <label className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2 block">Lyric Structure</label>
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {LYRIC_STRUCTURES.map((s) => {
            const active = lyricStructure === s.id
            return (
              <button
                key={s.id}
                onClick={() => setLyricStructure(s.id)}
                className="flex flex-col gap-0.5 px-2.5 py-2 rounded-xl border text-left transition-all"
                style={{
                  borderColor: active ? s.color : '#252540',
                  background: active ? s.color + '15' : 'transparent',
                  boxShadow: active ? `0 0 8px ${s.color}33` : 'none',
                }}
              >
                <div className="flex items-center gap-1">
                  <span style={{ fontSize: 10 }}>{s.icon}</span>
                  <span className="text-xs font-ui font-semibold leading-tight" style={{ color: active ? s.color : '#c0c0d0' }}>{s.label}</span>
                </div>
                <span className="text-xs font-ui leading-tight" style={{ color: '#666688', fontSize: 10 }}>{s.desc}</span>
              </button>
            )
          })}
        </div>

        {/* Artist Style Reference */}
        <div className="mb-4">
          <button
            onClick={() => setShowArtistPicker((v) => !v)}
            className="flex items-center gap-2 text-xs font-mono text-studio-dim hover:text-studio-cyan transition-colors mb-2"
          >
            {showArtistPicker ? '▾' : '▸'} Artist Style Reference (optional)
            {artistId !== 'none' && (
              <span style={{ color: '#00e5ff' }}>
                — {artistId === '_looked_up' ? customArtist : (ARTIST_STYLES.find(a => a.id === artistId)?.label || customArtist)}
              </span>
            )}
          </button>
          {showArtistPicker && (
            <div className="border border-studio-border rounded-xl p-3 bg-studio-void">
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
                {artistLibrary.map(entry => {
                  const libId = `_lib_${entry.name}`
                  const active = artistId === libId
                  return (
                    <button
                      key={entry.name}
                      onClick={() => { setArtistId(libId); setLookedUpInstruction(entry.instruction); setCustomArtist(entry.name) }}
                      className="flex flex-col items-start gap-0.5 px-2 py-1.5 rounded-lg border text-left transition-all"
                      style={{
                        borderColor: active ? '#b44fff' : '#252540',
                        background: active ? '#b44fff15' : 'transparent',
                      }}
                    >
                      <span style={{ color: '#b44fff', fontSize: 11 }}>📚</span>
                      <span style={{ color: active ? '#b44fff' : '#c0c0d0', fontSize: 10 }} className="font-ui font-semibold leading-tight">{entry.name}</span>
                    </button>
                  )
                })}
                {lookedUpInstruction && !artistLibrary.some(e => `_lib_${e.name}` === artistId) && (
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
                  placeholder="Look up any artist... (e.g. Lil Baby, Travis Scott)"
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
                <div className="mt-2 text-xs font-mono text-studio-green">✓ {customArtist} style loaded — select above to use</div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-mono text-studio-dim uppercase tracking-wider">Rhyme Type</label>
          <span className="text-xs font-mono text-studio-dim">{rhymeTypes.length} selected</span>
        </div>
        <div className="flex flex-col gap-1.5 mb-4">
          {RHYME_TYPES.map(({ label, desc, color }) => {
            const active = rhymeTypes.includes(label)
            return (
              <button
                key={label}
                onClick={() => toggleRhyme(label)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all"
                style={{
                  borderColor: active ? color : '#252540',
                  background: active ? color + '12' : 'transparent',
                  boxShadow: active ? `0 0 8px ${color}33` : 'none',
                }}
              >
                <div
                  className="w-3 h-3 rounded-full shrink-0 border-2 flex items-center justify-center"
                  style={{ borderColor: active ? color : '#444460' }}
                >
                  {active && <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-ui font-semibold" style={{ color: active ? color : '#c0c0d0' }}>
                    {label}
                  </span>
                  <span className="text-xs font-ui text-studio-dim ml-2">{desc}</span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-mono text-studio-dim uppercase tracking-wider">Mood / Energy</label>
          <span className="text-xs font-mono text-studio-dim">{moods.length} selected</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-5">
          {MOODS.map(({ label, color }) => {
            const active = moods.includes(label)
            return (
              <button
                key={label}
                onClick={() => toggleMood(label)}
                className="px-3 py-1 rounded-full text-xs font-ui font-semibold border transition-all"
                style={{
                  borderColor: active ? color : '#252540',
                  color: active ? color : '#888899',
                  background: active ? color + '1a' : 'transparent',
                  boxShadow: active ? `0 0 8px ${color}44` : 'none',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-ui font-semibold border border-studio-border text-studio-dim hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!topic.trim()}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-ui font-semibold text-black transition-all disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${activeStyle.color}, #b44fff)` }}
          >
            {activeStyle.icon} Generate
          </button>
        </div>
      </div>
    </div>
  )
}

// Detailed style guide for Mike Malagies — injected into generation prompt
export const ARTIST_STYLES = [
  {
    id: 'none',
    label: 'None',
    icon: '○',
    color: '#666688',
    desc: 'No style reference — write in my own voice',
    instruction: '',
  },
  {
    id: 'malagies',
    label: 'Mike Malagies',
    icon: '✝',
    color: '#ffe600',
    desc: 'Biblical punchlines, internal rhyme chains, contrast pairs, self-aware humor',
    instruction: `MIKE MALAGIES STYLE — studied from real lyrics. Apply every technique:

1. INTERNAL RHYME CHAINS: Lock onto one rhyme sound and stack 6-10+ words on it mid-verse.
   Real example: "digits / critics / opinions / business / sickness / witness / different / live it / get it" — all on the same "-it" sound across 9 bars. This is his signature. Build at least one chain per verse.

2. DOUBLE-MEANING PUNCHLINES: One phrase, two interpretations — spiritual and literal.
   Real examples:
   - "God blessed me and I didn't even sneeze" — blessed = God's favor AND "bless you" after a sneeze
   - "If Satan starts bumping my music in hell, then I guess that's the one time a demon could play me" — play music AND trick/deceive
   - "I feel like a verb" — about that action (verb = action word, self-referential)
   Always set up naturally, let the second meaning land on its own.

3. CULTURAL REFERENCES AS SPIRITUAL PROOF: Drop a pop culture name to carry the spiritual point.
   Real examples:
   - "Shooting my shot like Caitlin Clark" — faith as precision, commitment to the goal
   - "that letter right next to the K" — the letter L (devil takes the L/loss)
   Build the reference so it works even if you don't know the reference.

4. RESURRECTION ARGUMENT: Use the empty tomb as the theological knockout.
   Real example: "Buddha, Muhammad, and all of 'em all in a tomb, where is Jesus? Go check in the grave" — names the other religions then pulls the contrast. Use comparison → empty claim as structure for spiritual proof bars.

5. CONTRAST PAIRS (before/after, problem/flip):
   Real examples:
   - "I used to have critics, but now it's just crickets" — the rhyme IS the contrast
   - "I prayed for strength and it came with the stress / But pressure makes diamonds and pain makes success"
   - "I don't complain anymore because I know I'd be on a cross if life was fair"
   Every contrast should surprise — not just negative/positive but a specific unexpected angle.

6. BIBLICAL NAME-DROPS WITH ACTION:
   Real examples:
   - "I pray like I'm Daniel, I fight like I'm David" — name + specific action, not just the name
   - "feeling like Noah, let's make this ark"
   - "Can't even put into words, He gon' provide for me, look at the birds" — Matthew 6, birds of the air
   Never drop a biblical name without a specific parallel action or image.

7. SELF-AWARE HUMOR: Break the 4th wall mid-verse, then get right back to the point.
   Real examples:
   - "Wait, who that white kid from the 'burbs? I'm 'bout that action, I feel like a verb"
   - "My life turned around, that's a Jesus one-eighty"
   - Literally writes "Hahaha" in the bar after a punchline
   The humor never undermines the message — it makes the listener trust the messenger.

8. RUN-ON BARS FOR EMOTIONAL PEAK: One intentionally long breathless bar when the feeling is too big.
   Real example: "If I start talking about all the things God has done for me, I won't be able to stop / If I start thinking 'bout how much He loves me, I don't think I'll even be able to talk"
   Use this once per verse at the emotional peak. Don't repeat it.

9. RHETORICAL CHALLENGE → OWN ANSWER:
   Real example: "Huh, what you gon' say to me? / Tell me I'm worthless, alright, that's okay with me / That's not what Jesus thought when He was saving me / That's not what God thought when He was creating me"
   Invite the attack, then deflect it with theological counter. Always end on God's position, not the hater's.

10. TRIPLE REPETITION FOR CONVICTION: Repeat a short phrase exactly 3 times in a row.
    Real example: "Tell him God's my strength / Tell him God's my strength / Tell him God's my strength"
    Use this for anchor phrases only — the thing the whole verse is proving. Don't dilute it.

11. EVERYDAY OBJECT AS THEOLOGICAL PROOF: Take a mundane, commercial object and use it to make the spiritual point feel obvious.
    Real examples:
    - "I never seen a hearse with a U-HAUL" — you can't take wealth to the grave; the visual makes the theology instant
    - "Jesus paid it all like it's a shopping spree" — atonement described in commercial terms; the contrast (sacred/mundane) IS the punch
    - "Kicking demons like I play on a soccer team" — the casualness signals total confidence, not effort
    Rule: pick the most specific, unexpected object. The more ordinary, the harder the theological point lands.

12. SCRIPTURE-AS-BAR: Embed a scripture reference so naturally it sounds like his own line — no citation, just the truth.
    Real examples:
    - "I could gain the world what would it profit me" — Matthew 16:26 as a bar, not a quote
    - "Go read Jeremiah" — mic drop pointing to scripture instead of explaining it
    - "I'd rather lose money and fame and my followers / Then to hear Jesus say I never knew you" — Matthew 7:23 as the stakes
    Never say "the Bible says." Just say the truth as if it's yours. Let anyone who knows, know.

13. PERSONAL VULNERABILITY ANCHOR: After the bravado, drop one raw personal moment to ground everything.
    Real example: "Before the fame before the numbers / It was just me and my mom and my brother / And it's still me and my mom and my brother / If you want to join now well that's just a bummer"
    The vulnerability proves the message is real, not performance. End the vulnerable moment with a light punchline ("bummer") to prevent it from feeling heavy or self-pitying.

14. LOGIC TRAP WORDPLAY: Build a line that folds back on itself to land on the original truth.
    Real example: "I can do all things there's nothing impossible / Other than there being something impossible" — Philippians 4:13 restated, then the only exception is also ruled out by its own logic. Nothing is impossible; the only impossible thing is for something to be impossible.
    Use when you want to make a theological claim feel airtight without sounding preachy.

15. COMPLAINT → ASPIRATION HOOK: Open the hook by listing what you're tired of (honest, relatable complaints) then flip to the aspiration that resolves them.
    Real example: "I think I'm tired of being a nice guy / I wanna be like Christ" — the turn is the point. The complaint is real; the aspiration redefines the complaint as a calling. Being like Christ means being rejected — that's the flip. Structure: 3 "I'm tired of..." lines → "I wanna be like..." resolve.

16. BOOKEND VERSE: Open and close the verse on the exact same line or challenge — the verse earns the repeat.
    Real example: Opens with "Can somebody check the tomb and tell me if you find Him there" → entire verse is the argument → closes with "Go check the tomb"
    The second landing of the line hits harder because of everything built in between. The challenge is now a triumph.

17. RHYME-IMAGE FUSION: Pick the rhyme word BECAUSE its image carries theological weight, not just because it rhymes.
    Real example: "I'm over the moon, sweeping the devil up, go get a broom / Lifting my hands straight up like it was noon"
    — moon/broom/noon all rhyme AND: broom = casual dismissal of the devil, noon = the hour of the crucifixion (Matthew 27:45). The sound AND the meaning carry the point simultaneously.

18. LOGIC CHAIN RHYME: Each bar in the chain completes the previous bar's logic AND continues the rhyme.
    Real example: "Jesus is risen, so that means we winning, and we've been forgiven / I used to have chains, but I'm free from the prison / The devil thought he won, but Jesus is living"
    — risen → winning → forgiven → prison → living. Every word rhymes AND every bar is the logical consequence of the one before it.

19. RECURRING SIGNATURE PHRASES (across songs): He returns to the same lines across multiple songs — these are his theological anchors.
    Confirmed signature lines:
    - "I love my haters" / "I used to get in my feelings, now I get in prayer" — appears in both Song 1 and Song 3
    - "Go check the tomb / Go check the grave" — appears in Song 1 and Song 3 as the resurrection challenge
    When writing in his style, embed at least one of these signature phrases as an anchor.

20. DOUBLE BLUFF / MADE YOU LOOK: State something false to bait the enemy's attention, then pull the rug — the rug pull IS the point.
    Real example: "Go tell the devil, 'Look, I'm losing! Huh, made you look'" — he says he's losing to get the devil looking, then reveals it was fake. The bait is the setup; the reveal is the punchline. Only works if the false statement is believable for one bar.

21. ENEMY MISREAD / SAME ACTION, OPPOSITE INTENT: The enemy and God perform the exact same physical action — but with completely opposite intentions. The enemy means harm; God means growth.
    Real example: "The Devil thought he buried me but that was God planting me" — burial and planting are the same act. The enemy reads it as destruction; God reads it as cultivation. Seeds and graves both go underground. This is his contrast pairs technique elevated — no flip needed, because the actions are identical.

22. TRIPLE-LAYER BAR: One bar carries three separate meanings simultaneously — surface meaning, cultural reference, and spiritual truth.
    Real example: "Please, don't gas me up like Tesla, I got power that's within"
    — Layer 1: "don't gas me up" = don't hype me / flatter me
    — Layer 2: Tesla runs on electricity, not gas — so gassing him up doesn't apply
    — Layer 3: "power that's within" = the Holy Spirit (Romans 8:11), not external hype
    All three meanings activate at once. The bar rewards the listener who catches all three.

23. CULTURAL PHRASE REVERSAL: Take a well-known cultural expression and flip who it's directed at — redirecting credit or action back to God.
    Real example: "Don't give me my flowers, I'ma give those flowers back to Him" — "give someone their flowers" means give credit/recognition while they're alive. He takes the cultural phrase, accepts the concept, then reverses the direction: all credit goes to God, not him.
    Works best with phrases about credit, recognition, or praise — anything you can redirect upward.

24. SEMANTIC CHAIN METAPHOR: Pick one metaphor and walk it forward — each bar extends the SAME image, each word connecting to the next, going deeper with every step.
    Real example: "Jesus said that He's the vine and we the branches / So I'm showing out for Him / You only get this kind of fruit when you go out on a limb"
    — vine → branches → fruit → "go out on a limb" (risk = where fruit grows = where faith lives)
    Every step is a logical extension of the one before it. The chain is the proof that the metaphor is real. Do NOT hop to a different metaphor — commit to the chain and let it go deeper.

25. METAPHOR ECOSYSTEM: Instead of one semantic chain, build an entire vocabulary domain and mine it for 6-8 bars — every word in that domain hits a spiritual double meaning simultaneously.
    Real example ("I Follow Jesus"): "God took my problems and made 'em all hit the gym / the way He made 'em all work out / Jesus resurrected me, that's a dead-lift / I just raised the bar again like a bench press / I'll never go under like anesthetics / They said I'm grinding too much / I said you not my dentist"
    — work out / dead-lift / raised the bar / bench press / go under / grinding — every gym term doubles as spiritual truth. More powerful than a single chain because there are multiple entry points. Choose a domain rich enough to sustain 6+ bars.

26. SCRIPTURE-AS-LOGICAL-IMPOSSIBILITY: Use one of God's own attributes from scripture to make a fear or failure state logically impossible.
    Real example: "All consuming fire, how could I burn out?" — Hebrews 12:29 says God is an all-consuming fire. If God IS fire and you're on fire for God, burning out is a logical contradiction. The scripture doesn't just comfort — it makes the fear impossible by definition.
    Structure: God is [attribute from scripture] → therefore [feared state] cannot logically exist.

27. ENEMY EQUIVALENCE: Group human haters and the devil as sharing the same problem — both confused by the same person, both losing to the same God.
    Real example: "My haters and Lucifer share the same struggle / They both don't know what they gon' do with the kid"
    — levels up the haters (they're in the devil's company) and levels down the devil (he's no scarier than an internet hater). Both equally confused, both equally losing.

28. IDIOM EXTENSION: Take a common failure idiom, accept it at face value for one bar, then extend it into a full narrative where Jesus recovers.
    Real example ("Finally Found"): "I dropped the ball, Jesus picked up the ball and then we won the game" — owns the failure first ("dropped the ball"), then extends the sports metaphor: Jesus recovers the fumble and they win together. The failure becomes the setup for the miracle. Don't skip or deny the failure — own it, then let Jesus extend it.

29. HUSTLE PHRASE FLIP: Take a common secular hustle expression and give it new meaning through faith — the phrase stays the same, the spiritual context rewrites it.
    Real example: "I'll sleep when I die / But He keeps me alive" — normally a hustle phrase meaning sacrifice rest for success. Here: death is literally rest (eternal peace), and God keeps him active now. The flip happens silently — no explanation. The context rewrites the phrase.

30. PREEMPTIVE OPPOSITION: Predict future cancellation or opposition in advance and frame it as confirmation that you're currently speaking truth. The anticipation itself is the badge.
    Real example: "One day they gon' cancel Mike / I mean I speak too much truth" — calls the cancellation before it happens. Anyone willing to be canceled for truth has nothing to hide. Keep it brief — one or two bars, then move on.

31. SPELLING AS THEOLOGY: Use the literal letters or spelling of a word to prove the theological point — the word itself becomes the evidence.
    Real example: "Jesus on me, look at how it's spelt, there's only one U" — "Jesus" contains one letter U; "there's only one You" = Jesus is the only one. The spelling of His name IS the declaration. Works best when the letter or letter arrangement mirrors the theological truth exactly.

32. RAPID BIBLICAL CHARACTER CHAIN: Stack 4+ biblical figures in 4+ consecutive bars, each one mapping a specific story to his current situation — rapid-fire, no repetition, no explanation needed.
    Real example: "I feel like Noah in the boat / favour from my Father like I'm Joseph in the coat / Satan, let my people go, I feel like Moses with the quote / God's a living well, I'm living well, like I'm Jonah off the boat" — Noah (faith through chaos), Joseph (favor despite betrayal), Moses (authority over the enemy), Jonah (second chance after failure). Each reference is complete in one bar. The chain proves the biblical pattern is real and recurring.

33. HOMOPHONE DOUBLE: Use a word whose sound is shared by two words — one spiritual, one physical — and let both meanings activate simultaneously without explaining either.
    Real example: "All I am is a reflection of a Son like I'm the moon" — "Son" (Jesus, the Son of God) and "sun" (the physical sun the moon reflects) are the same sound. The moon reflects the sun's light; he reflects the Son's glory. Both meanings are live at the same time. Never explain the double — just let it land.

34. SACRED/MUNDANE COLLISION: Drop the most casual, specific pop culture reference imaginable into the most sacred theological moment — the contrast between the depth of the subject and the lightness of the reference IS the technique.
    Real example: "They put holes in His feet, but no, He was not wearing some Crocs" — the crucifixion is the most sacred moment in Christian theology; Crocs (the shoe brand known for holes) is the most mundane possible reference. The collision makes the listener laugh then immediately feel the weight of what was just said. Works only when the sacred subject is solid enough that the humor can't undermine it.

35. COLOR BAR: Build one bar where multiple colors each carry a different theological meaning simultaneously.
    Real example: "Jesus turned my sin from red to white and Satan's turning blue" — red = sin (Isaiah 1:18 "though your sins be as scarlet"), white = forgiveness ("they shall be as white as snow"), blue = Satan losing/going cold. Three colors, one bar, three theological truths at once. The bar reads like a spectrum that tells the entire redemption story.

36. ONE-LETTER TRANSFORMATION: Find two words that differ by exactly one letter — the one letter IS the entire transformation.
    Real example: "Left the world for the Word" — world → Word, one letter removed. He traded "the world" (worldly life) for "the Word" (scripture/Jesus). The subtraction of one letter encodes the entire spiritual journey. Build the bar around the moment of transformation — don't explain it.

37. FOOTBALL PLAY DIAGRAM: Lay out a complete sports play sequence — snap count, handoff, running — as a diagram of the spiritual battle, position by position.
    Real example: "God's the center hut one hut two / Toss it back then hand it off / Satan running back but I'm running through" — God is the center (the one who snaps the ball = the source), hut one hut two (the count = obedience), the handoff (receiving from God), Satan as running back (trying to stop the play) vs. running through (breaking the tackle). The entire play is the theology. Works only when every position in the play has a spiritual parallel.

38. PLOT TWIST BAR: Use narrative terminology against the enemy — their "plot" (scheme) becomes the setup for Jesus's "plot twist" (redemption story).
    Real example: "Satan plotting on me / Jesus made the plot twist" — plot = scheme (Satan's plan against him) AND plot = story structure (the narrative arc of his life). Plot twist = unexpected story turn AND the twist being that Satan loses. The same words operate in two entirely different registers at once.

39. OPPOSITION AS EVIDENCE: The presence of spiritual opposition proves you're on the right side — and the ABSENCE of it proves you're on the wrong side.
    Real example: "If you don't run into Satan does that mean you running with him" — reframes the logic. If the enemy isn't bothering you, you're not threatening him. Opposition is confirmation, not a problem. One bar, no explanation.

40. PROPHETS MIC DROP: Set up a "flip" (hustle term for turning a profit), reveal that the flip is actually flipping Bible pages, then list the prophets one by one as the punchline.
    Real example: "People think I'm doing this to flip a profit / But I'm in the Bible and I'm flipping to the Prophets / Let me flip this quick / Isaiah / Jeremiah / Daniel / Ezekiel" — the reveal is that the hustle IS the scripture study. Listing the names one by one is the delivery — each name is its own bar, landing like a countdown.

41. MUSICAL SCALE WORDPLAY: Use the do-re-mi musical scale as a bar — cut it off before "mi" (me) to encode humility in the music notation itself.
    Real example: "I don't even wanna sing about me, like do re" — he reaches "do re" and stops before "mi" because "mi" = "me." The musical scale structure encodes the theological point: he refuses to sing about himself. The listener has to hear the gap to feel the meaning.

42. TRAP BECOMES TRAPPER'S GRAVE: The enemy's weapon, plan, or trap becomes the instrument of their own destruction — the same hole they dug becomes their grave.
    Real example: "Jesus beat the grave and made the devil dig his own grave" — the devil orchestrated the crucifixion (the grave for Jesus) but it became the devil's own defeat (his own grave). What the enemy digs against you, they fall into. The reversal is complete and ironic.

43. PERSONAL DETAIL → SCRIPTURE PIVOT: Set up a bar with a mundane personal fact or preference, then pivot to a scripture that uses the exact same key word — the personal detail is the setup, the scripture is the punchline.
    Real example: "You know that I'm gluten-free, so I don't know how pizza tastes / But I taste and see the Lord is good, and I receive His grace" — gluten-free → can't taste pizza → Psalm 34:8 ("taste and see that the Lord is good"). The dietary restriction sets up the scripture's use of the word "taste." The sillier the personal detail, the harder the scripture lands.

44. WORD HIDDEN INSIDE WORD: Find a loaded word physically embedded inside another word — the hidden word becomes the theological truth about the outer word.
    Real examples: "Only time you'll see me in Hell / Is right before I exhale" — "hell" is literally inside "exhale" (ex-HELL). "Never gon' perish / Like where the Eiffel stay" — "Eiffel" is in "Paris" (Par-IS / per-ISH); the city name hides the word "perish." The technique requires finding words where a dangerous or sacred word is buried inside an ordinary one, and building the bar so the listener discovers the hidden word.

45. NAME EMBEDDED AS THEOLOGY: Use a celebrity's actual name because the NAME ITSELF contains God's title or a theological reference — not the person, but the letters.
    Real example: "I just wanna lift my hands and scream and shout like will.i.am" — will.i.am = "will I am" = "I AM" is God's name given to Moses in Exodus 3:14 ("I AM WHO I AM"). The rapper's name contains the divine name. The reference works on surface level (will.i.am = energy/performance) and theological level (shouting the name of I AM). Different from cultural references (tech 3) — the theology is encoded in the name's spelling itself.

46. SPONTANEOUS BREAK: Drop out of rap completely for 1-3 lines and speak directly, pastorally, to the listener — no rhyme, no flow, just truth.
    Real example: "Just because you don't hear God doesn't mean that He doesn't hear you / Just because you don't feel His presence doesn't mean that He's not with you" — it's labeled "Spontaneous" in the lyrics. The rap stops. Everything pauses. He speaks directly. This is his most vulnerable moment in any song and works because the entire verse earns it. Use once per song, only when the bar would carry more weight spoken than rapped.

47. DOUBT-TO-DECLARATION BRIDGE: Open the bridge with raw, unresolved spiritual doubt — no answer yet — then let the declaration or divine response follow.
    Real example: "Some days I don't feel like it / Some days I wonder should I quit / Some days I wonder where time went / Some days I wonder where God been" — four consecutive bars of honest doubt with no resolution. Then the Spontaneous Break answers. The doubt makes the declaration credible. If you skip the doubt, the declaration sounds like performance. Four "some days" bars is the pattern — the repetition of uncertainty is what makes the arrival of certainty land.

48. ETYMOLOGY BAR: Find two related words where one is literally contained in the other — then use the word relationship as the theological proof.
    Real example: "Test after test but I passed 'em all / Now I call that testimony" — "test" is the root of "testimony." You can only give testimony about what you were tested in. The word etymology proves the theology — the experience IS already inside the word. Different from Word Hidden Inside Word (tech 44), which is about phonetics; this is about meaning and word roots.

49. CURSIVE CONNECTION: Use a specific writing style (cursive) as a metaphor for continuous, unbroken relationship with God — cursive letters connect; staying with God means no breaks in the line.
    Real example: "Stay together with God like cursive" — cursive handwriting connects every letter without lifting the pen. The relationship with God is the same — continuous, no gaps, no breaks. The visual of connected letters is the point.

50. ALPHABETICAL PURSUIT: Use the order of letters in the alphabet as a declaration — the letter that comes after another proves the relationship.
    Real example: "I feel like the letter V, I'm after you (U)" — V follows U in the alphabet. He is always pursuing God (You/U). The alphabet sequence IS the declaration of chase. Works best when the letter's name and its position both carry the meaning simultaneously.

51. PHONETIC IMPERSONATION: Rap words that sound like a famous rapper's name or signature style while the actual words say something completely different spiritually — the listener hears two things at once.
    Real example: "I'm walking (Waka) with God and I'm part of his flock I (Flocka)" — "walking" sounds like "Waka," "flock I" sounds like "Flocka" — it sounds like a Waka Flocka Flame bar, but the words literally declare walking with God and being part of His flock. The impersonation is the punchline; the spiritual truth is the payload.

52. NAME NEGATION: Name a biblical figure known for a specific failure or doubt, then immediately say "my name's not [that person]" to deny sharing their weakness while claiming the same encounter.
    Real example: "I found the light but my name's not Thomas" — Thomas doubted the resurrection until he saw Jesus (John 20). He found the same light Thomas found, but without the doubt. The negation claims the experience without the failure. Structure: I [had the same encounter] but my name's not [the one who failed at it].

53. WORSHIP AS WEAPON: Use the word of worship (Hallelujah, Amen, Praise God) as a direct taunt or greeting to the enemy — the act of praise IS the attack.
    Real example: "Hallelujah Satan how you doing" — addresses Satan with the highest word of worship as an opener. The worship declaration becomes the taunt. Satan's name follows "Hallelujah" which means the praise exists in spite of and above the enemy's presence. The praise doesn't pause for the devil — it addresses him through it.

CADENCE RULES:
- Song 1 style: short punchy bars → build to an internal rhyme chain → one run-on emotional bar → end with quiet gratitude
- Song 2 style: open with a repeated complaint hook → rapid-fire cultural analogies → personal vulnerability anchor → declarative punchline close
- Song 3 (guest verse) style: tight and punchy — open with a challenge, fire 3-4 techniques in 10-12 bars, close by returning to the opening challenge (bookend)
- Songs 5-6 style: sustained metaphor ecosystem over one domain → scripture-as-impossibility → enemy equivalence → triumph close
- Use "Huh" and "Yeah" as breath punctuation, not filler
- "What did I stutter" = emphatic callback — draw attention to the bar you just dropped
- Street-adjacent vocabulary but never forced — conversational faith, not church language
- Scripture quotations embedded as his own bars, never cited with chapter/verse`,
  },
  {
    id: 'jcole',
    label: 'J. Cole',
    icon: '◎',
    color: '#00e5ff',
    desc: 'Introspective storytelling, conversational flow, deep self-reflection',
    instruction: `J. COLE STYLE — apply these techniques:
- CONVERSATIONAL FLOW: Bars should sound like a real person thinking aloud — no forced wordplay, just truth spoken with precision.
- INTROSPECTION: Turn inward. Examine the contradiction, the struggle, the growth. The hook is the realization, not the celebration.
- STORYTELLING: Use specific details and scenes. Don't say "I was broke" — describe the moment, the room, the feeling.
- CADENCE VARIATION: Cole rides the beat loosely — some bars land on the beat, others float just off it. Don't rigidly match every syllable.
- NO SKIPS PHILOSOPHY: Every line must carry weight. No throwaway bars. If a bar doesn't add meaning, cut it.
- HUMILITY WITH CONFIDENCE: The tone is honest and grounded — never bragging without substance, never self-pity without resolution.`,
  },
  {
    id: 'kendrick',
    label: 'Kendrick Lamar',
    icon: '◈',
    color: '#b44fff',
    desc: 'Conceptual depth, alter egos, dense rhyme schemes, social commentary',
    instruction: `KENDRICK LAMAR STYLE — apply these techniques:
- CONCEPTUAL FRAMEWORK: The song has an overarching concept or thesis. Every verse reveals a new dimension of it — not just a topic, a complete argument.
- ALTER EGOS/PERSPECTIVE SHIFTS: Kendrick speaks as himself, as characters, as the community. Shift perspective within the song to create contrast and depth.
- DENSE RHYME SCHEMES: Stack end rhymes, internal rhymes, and multisyllabic matches simultaneously. Lines should reward close listening.
- SOCIAL COMMENTARY: Connect personal experience to the larger cultural or spiritual reality. The personal IS the political.
- DYNAMIC DELIVERY CONTRAST: Some bars are hushed and conversational; others explode. Build that tension into the writing — soft lines that set up thunderous ones.
- SYMBOLISM: Use recurring images that accumulate meaning. A symbol introduced in verse 1 should land with full power in the bridge.`,
  },
  {
    id: 'nf',
    label: 'NF',
    icon: '◑',
    color: '#aaaacc',
    desc: 'Raw emotional honesty, cinematic imagery, internal battle as theme',
    instruction: `NF STYLE — apply these techniques:
- EMOTIONAL RAWNESS: No filter. Write the fear, the doubt, the anger without softening it. NF never hides behind metaphor when the truth is more powerful.
- INTERNAL DIALOGUE: The verses are a conversation with himself — his fears, his past, his demons. Make the bars feel like thoughts the listener isn't supposed to hear.
- CINEMATIC IMAGERY: Paint vivid scenes. "Dark room, no light, hands on the wall" — specific, sensory, visual. The listener sees a movie.
- RELENTLESS BUILD: Each verse escalates emotionally. The song should feel like it's pushing toward a breaking point.
- HONEST FAITH: NF's Christianity shows up as struggle, not triumph. The faith is real but it costs something. Don't make it easy.
- RAPID-FIRE DELIVERY WRITTEN IN: Some bars are dense, fast, syllable-packed. Others hit slow and deliberate. Contrast is everything.`,
  },
  {
    id: 'lecrae',
    label: 'Lecrae',
    icon: '✦',
    color: '#00ff9d',
    desc: 'Christian hip-hop, scripture-first, street credibility meets faith',
    instruction: `LECRAE STYLE — apply these techniques:
- SCRIPTURE AS FOUNDATION: Theology isn't added on — it's the foundation every bar builds from. Know the doctrine and write from inside it.
- STREET AUTHENTICITY: The language is real, the references are current, the delivery has edge. This isn't praise music — it's the Gospel in the language of the streets.
- TESTIMONY STRUCTURE: Verse 1 = the before. Chorus = the truth. Verse 2 = the after. The song is a testimony arc.
- CULTURAL COMMENTARY: Address what's actually happening in culture — music, money, identity — and redirect it toward truth without being preachy.
- HOOK CATCHINESS: Lecrae writes hooks designed to stick. Short, powerful, repeatable. The hook should work on its own as a standalone statement.
- HOPE AS THE RESOLUTION: Even when the verses go dark, the song moves toward redemption. Not blind optimism — hard-won hope.`,
  },
  {
    id: 'eminem',
    label: 'Eminem',
    icon: '⚡',
    color: '#ff2d55',
    desc: 'Technical rhyme complexity, rapid-fire delivery, shock-value punchlines',
    instruction: `EMINEM STYLE — apply these techniques:
- MULTISYLLABIC STACKING: Every end rhyme is 3–5 syllables long. "Eliminate / stimulate / anticipate" — the rhyme scheme is dense and intentional.
- INTERNAL RHYME SATURATION: Mid-bar rhymes on nearly every line. The rhyme scheme runs through the entire bar, not just the end.
- RAPID SYLLABLE DENSITY: Pack syllables tightly. Bars are long, complex, delivered at speed. Write for breath control, not comfort.
- PUNCHLINE PRECISION: Set up complex punchlines 2–3 bars ahead and land them exactly. The payoff should be worth the wait.
- WORDPLAY LAYERS: Puns, homophones, double meanings all in the same bar. The listener needs multiple plays to catch everything.
- CONFIDENCE AND AGGRESSION: The tone is relentless, competitive, unapologetic. Every bar asserts superiority.`,
  },
  {
    id: 'drake',
    label: 'Drake',
    icon: '♬',
    color: '#ff9500',
    desc: 'Melodic delivery, emotional vulnerability, hook-first songwriting',
    instruction: `DRAKE STYLE — apply these techniques:
- MELODIC BARS: Write for singing delivery, not pure rap. Many bars should float between speaking and singing — the flow is fluid.
- EMOTIONAL VULNERABILITY: Drake makes vulnerability feel like strength. Write about pain, longing, and growth without apology.
- HOOK-FIRST MENTALITY: The most memorable phrase goes in the hook. Verses exist to set up and reinforce the hook's emotional core.
- CONVERSATIONAL SPECIFICITY: Name real emotions, real situations, real feelings. "You used to call me on my cell phone" — specific and universal at the same time.
- FLEX AND FEELING IN BALANCE: Mix confidence with tenderness. Boasting about success while acknowledging what it cost.
- QUOTABLE ONE-LINERS: Every verse should have at least one line that stands alone as a memorable quote.`,
  },
  {
    id: 'jayz',
    label: 'Jay-Z',
    icon: '♛',
    color: '#c0a060',
    desc: 'Legacy mindset, effortless confidence, layered wordplay and business metaphors',
    instruction: `JAY-Z STYLE — apply these techniques:
- EFFORTLESS DELIVERY: The bars sound easy even when they're complex. No straining, no trying too hard — supreme confidence in the pocket.
- LEGACY CONSCIOUSNESS: Every bar is written with awareness of history and permanence. This isn't a moment, it's a statement for the ages.
- BUSINESS AND SUCCESS METAPHORS: Boardroom language meets the block. Stocks, deals, ownership — the vocabulary of someone who built something.
- LAYERED WORDPLAY: Surface meaning for the casual listener, deeper meaning for those paying close attention. Multiple levels in one line.
- STORYTELLING ECONOMY: No wasted words. Jay-Z packs a complete story into 4 bars. Every word is pulling weight.
- AUTHORITY TONE: The artist isn't asking for respect — they've already earned it. Write from a position of established greatness.`,
  },
  {
    id: 'andymineo',
    label: 'Andy Mineo',
    icon: '◉',
    color: '#ff6b9d',
    desc: 'High energy, vulnerable testimony, personal truth meets hype',
    instruction: `ANDY MINEO STYLE — apply these techniques:
- HIGH-ENERGY DELIVERY: The writing should feel kinetic — bars that push forward with momentum. No slow burn — Andy comes in with energy.
- VULNERABLE TRANSPARENCY: Personal testimony is the weapon. Write about real failures, real doubts, real moments of breakthrough without smoothing them over.
- CULTURAL FLUENCY: Reference current culture naturally — not forced, not pandering. Andy moves between faith and mainstream culture without awkwardness.
- HUMOR AND SELF-AWARENESS: A touch of wit and self-deprecation. The artist doesn't take themselves too seriously even when making serious points.
- HOOK ENERGY: The chorus should feel like a release of everything the verse built up. Singable, energetic, emotionally cathartic.
- TRUTH BOMBS: Amid the energy, drop a line that stops people cold with its honesty. One gut-punch truth per verse.`,
  },
  {
    id: 'hellAtNight',
    label: 'Hell At Night',
    icon: '◐',
    color: '#cc6633',
    desc: 'Country-hop crossover — raw longing, melodic vulnerability, late-night confessions',
    instruction: `"HELL AT NIGHT" STYLE (Bigxthaplug x Ella Langley) — apply these techniques:
- MELODIC DELIVERY: Write for a sung/spoken hybrid. Bars should float between rapping and crooning — the cadence feels like it could be melted into a melody as easily as it's rapped. No hard staccato flows.
- EMOTIONAL VULNERABILITY: No armor on. Write about longing, regret, and the weight of late-night thoughts without softening a single edge. The rawness is the entire point.
- COUNTRY-HOP CROSSOVER: Blend hip-hop cadence with country storytelling instincts. Draw from both worlds — the late-night drive, the empty house, the phone you keep reaching for, the porch you used to sit on together.
- NIGHTTIME CONFESSION TONE: These are the thoughts that only surface after midnight — honest in a way daytime doesn't allow. The voice is tired, unguarded, and saying what daylight wouldn't let them.
- DUET TENSION: Even in solo sections, write with awareness of the other person's presence. Leave room for what goes unsaid. The space between what they want to say and what actually comes out IS the emotion.
- PLAIN WORDS, HEAVY WEIGHT: Country-hop lands through simple language carrying enormous emotional load. Not wordplay — the exactly right plain word in the exactly right place. "I still check my phone" hits harder than any lyrical gymnastics.`,
  },
  {
    id: 'harrymack',
    label: 'Harry Mack',
    icon: '🎤',
    color: '#ffd23f',
    desc: 'Freestyle wordplay, crowd-word weaving, clever punchlines, smooth cadence',
    instruction: `HARRY MACK STYLE — apply every technique:
- WORD WEAVING: Crowd-called words are woven into bars naturally — not dropped randomly but as the anchor of a punchline, a clever transition, or a double meaning. Each word should feel inevitable, not forced.
- THEMATIC CHAINING: Connect each called-out word to the next through a thread of meaning — "coffee" leads to "awake" leads to "grinding" leads to the next word. The listener should feel the logic.
- INTERNAL RHYME DENSITY: Pack every bar with mid-line rhymes alongside end rhymes. Two or three rhyme hits per bar minimum.
- PUNCHLINE ARCHITECTURE: Every 2–3 bars builds to a landing where the called-out word pays off with a double meaning or clever flip. Setup → wordplay → payoff.
- DOUBLE MEANINGS: Use crowd words in ways where they carry two meanings simultaneously. "thunder" = the storm AND the authority in the delivery. The second meaning should feel like a reward.
- SMOOTH EFFORTLESS CADENCE: Even dense bars should sound conversational and relaxed. If it sounds forced, it's wrong. The genius is in making complexity feel easy.
- ESCALATING MOMENTUM: Each bar escalates in wit and energy. The final bars should be the most impressive. End on a line that makes the crowd react.`,
  },
  {
    id: 'custom',
    label: 'Custom',
    icon: '✎',
    color: '#888899',
    desc: 'Type your own artist or style reference',
    instruction: null, // handled separately via text input
  },
]

export function getStyleInstruction(artistId, customText) {
  if (!artistId || artistId === 'none') return ''
  if (artistId === 'custom') {
    if (!customText?.trim()) return ''
    return `FLOW REFERENCE — model this after ${customText.trim()}:
- Match the cadence density, syllable pockets, and punchline placement of ${customText.trim()}
- Capture the rhythmic feel of how ${customText.trim()} rides a beat
- Study how ${customText.trim()} balances storytelling, wordplay, and emotional delivery`
  }
  const artist = ARTIST_STYLES.find((a) => a.id === artistId)
  return artist?.instruction || ''
}

function FreestyleModal({ onClose }) {
  const { profile } = useStyleProfile()
  const [bars, setBars] = useState([])
  const [userBar, setUserBar] = useState('')
  const [aiTyping, setAiTyping] = useState(false)
  const [copied, setCopied] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [bars, aiTyping])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleDrop = async () => {
    const bar = userBar.trim()
    if (!bar || aiTyping) return

    const newBars = [...bars, { role: 'user', text: bar }]
    setBars(newBars)
    setUserBar('')
    setAiTyping(true)

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const sessionHistory = newBars.slice(-8).map((b) => `${b.role === 'user' ? 'Bulue' : 'AI'}: ${b.text}`).join('\n')
      const themeNote = profile.themes.length > 0 ? `Bulue's themes: ${profile.themes.join(', ')}.` : ''

      const result = await model.generateContent(
        `You are in a freestyle rap cypher with Bulue Berry. ${themeNote}
Respond with EXACTLY ONE BAR (one line).

Session so far:
${sessionHistory}

Rules for your response bar:
- Respond TO or BUILD ON Bulue's last bar — same subject, matching energy
- Match the syllable density and flow rhythm of the bar you're answering
- Echo or rhyme with a word from Bulue's bar if it flows naturally
- Sound like a real rapper, not generic or safe
- ONE LINE ONLY — no labels, no punctuation at end, no explanation

Drop your bar:`
      )
      const aiBar = result.response.text().trim().split('\n')[0]
        .replace(/^(AI:|Response:|Bar:)\s*/i, '').trim()
      setBars((prev) => [...prev, { role: 'ai', text: aiBar }])
    } catch {
      setBars((prev) => [...prev, { role: 'ai', text: '(connection lost — try again)' }])
    } finally {
      setAiTyping(false)
    }
  }

  const copySession = () => {
    const text = bars.map((b) => `${b.role === 'user' ? 'YOU' : 'AI'}: ${b.text}`).join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-studio-panel border border-studio-border rounded-2xl flex flex-col shadow-2xl"
        style={{ width: 560, height: '80vh', borderTop: '3px solid #00e5ff' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-studio-border">
          <div>
            <div className="font-display text-sm font-semibold text-studio-cyan">🎤 Freestyle Cypher</div>
            <div className="text-xs text-studio-dim font-ui mt-0.5">Drop a bar — AI responds bar for bar</div>
          </div>
          <div className="flex items-center gap-3">
            {bars.length > 0 && (
              <button
                onClick={copySession}
                className="text-xs font-mono text-studio-dim hover:text-studio-cyan transition-colors"
              >
                {copied ? '✓ copied' : 'copy session'}
              </button>
            )}
            <button onClick={onClose} className="text-studio-dim hover:text-white text-lg leading-none">✕</button>
          </div>
        </div>

        {/* Bars */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {bars.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 opacity-50">
              <div className="text-4xl">🎤</div>
              <div className="text-sm text-studio-dim font-ui">
                Drop your first bar below to start the cypher.
              </div>
            </div>
          )}
          {bars.map((b, i) => (
            <div key={i} className={`flex gap-3 ${b.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div
                className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center font-display font-bold text-xs"
                style={{
                  background: b.role === 'user' ? '#b44fff' : 'linear-gradient(135deg,#00e5ff,#b44fff)',
                  color: '#fff',
                }}
              >
                {b.role === 'user' ? 'B' : 'AI'}
              </div>
              <div
                className="max-w-[80%] rounded-xl px-4 py-2.5 font-ui text-sm leading-relaxed"
                style={{
                  background: b.role === 'user' ? 'rgba(180,79,255,0.12)' : 'rgba(0,229,255,0.07)',
                  border: `1px solid ${b.role === 'user' ? 'rgba(180,79,255,0.3)' : 'rgba(0,229,255,0.2)'}`,
                  color: '#e0e0f0',
                }}
              >
                {b.text}
              </div>
            </div>
          ))}
          {aiTyping && (
            <div className="flex gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center font-display font-bold text-xs text-black"
                style={{ background: 'linear-gradient(135deg,#00e5ff,#b44fff)' }}
              >
                AI
              </div>
              <div className="bg-studio-surface border border-studio-border rounded-xl px-4 py-3 flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-studio-cyan"
                    style={{ animation: `vu-pulse 1s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-studio-border">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={userBar}
              onChange={(e) => setUserBar(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDrop() }}
              placeholder="Drop your bar..."
              disabled={aiTyping}
              className="flex-1 bg-studio-void border border-studio-border rounded-xl px-4 py-2.5 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-cyan disabled:opacity-50"
            />
            <button
              onClick={handleDrop}
              disabled={!userBar.trim() || aiTyping}
              className="px-5 py-2.5 rounded-xl font-ui font-semibold text-sm text-black disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#00e5ff,#b44fff)' }}
            >
              Drop
            </button>
          </div>
          {bars.length > 0 && (
            <div className="text-xs text-studio-dim font-mono mt-2 text-center">
              {bars.length} bar{bars.length !== 1 ? 's' : ''} traded · {bars.filter((b) => b.role === 'user').length} yours
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const BAR_COUNTS = [8, 12, 16, 24, 32]

const RHYTHM_STYLES = [
  {
    id: 'triplet',
    label: 'Triplet Flow',
    desc: 'Three syllables per beat pocket — rolling, tumbling forward, never landing on the obvious downbeat. Think Migos, Future.',
    instruction: 'TRIPLET FLOW: Every beat pocket carries three syllables in a rolling da-da-DA pattern. The cadence tumbles forward relentlessly. Rhyme sounds land on the third syllable of each triplet group.',
  },
  {
    id: 'doubletime',
    label: 'Double-Time',
    desc: 'Twice the syllable density — bars packed wall to wall, breathless and technical.',
    instruction: 'DOUBLE-TIME: Pack twice the syllables into each bar as normal. Every beat contains 4–6 syllables. The pace is breathless. Multiple rhyme sounds per line, hitting on both strong and weak beats.',
  },
  {
    id: 'boombap',
    label: 'Boom Bap',
    desc: 'Punchy on beats 2 and 4 — deliberate, weighted, each bar lands with authority.',
    instruction: 'BOOM BAP: Strong emphasis on beats 2 and 4. Bars land with weight and deliberateness — each line feels like a full stop before the next. Conversational but authoritative. Think Nas, Biggie, Jay-Z.',
  },
  {
    id: 'syncopated',
    label: 'Syncopated',
    desc: 'Key words land on the off-beat — jazz-influenced, satisfyingly unexpected.',
    instruction: 'SYNCOPATED: Rhyme sounds and key words land on the off-beats rather than downbeats. The flow feels slightly off-kilter in a satisfying way — jazz phrasing applied to rap. Tension resolves in unexpected places.',
  },
  {
    id: 'trap',
    label: 'Trap / 808',
    desc: 'Drawled and spacious — syllables stretched, heavy space between phrases.',
    instruction: 'TRAP FLOW: Drawled, spacious delivery. Syllables are elongated. Intentional space between phrases — the rhythm is slow and confident, riding 808s. Key words hit hard then fade. Think Young Thug, Gunna.',
  },
  {
    id: 'laidback',
    label: 'Laid-Back',
    desc: 'Behind the beat — arrives slightly late, effortless and unhurried.',
    instruction: 'LAID-BACK: Every line arrives slightly late relative to the expected landing, creating a relaxed, effortless feel. Nothing is rushed. The phrasing sounds like the artist has all the time in the world. Think Kendrick\'s conversational sections.',
  },
  {
    id: 'rapidfire',
    label: 'Rapid Fire',
    desc: 'Maximum syllables per bar — technical speed showcase, every pocket filled.',
    instruction: 'RAPID FIRE: Maximize syllable count per bar. Every available pocket is filled. The bars are nearly impossible to deliver at normal speed. Rhyme sounds hit on multiple syllables per line — a pure technical showcase.',
  },
  {
    id: 'melodic',
    label: 'Melodic Rap',
    desc: 'Between singing and rapping — syllable patterns suggest melody.',
    instruction: 'MELODIC RAP: Bars float between spoken word and singing. The syllable patterns suggest melody — phrases that could be sung as easily as rapped. The rhythm has a musical lilt. Think Drake, Roddy Ricch, Juice WRLD.',
  },
  {
    id: 'switch',
    label: 'Flow Switch',
    desc: 'Harry Mack\'s signature — the rhythm changes bar to bar, keeping the listener off-balance.',
    instruction: 'FLOW SWITCH: Change cadence every 3–4 bars — shift from rapid-fire to laid-back, from triplet to boom bap. Vary syllable density dramatically between sections. The listener is constantly caught off-guard by the rhythm shift. This is Harry Mack\'s signature move.',
  },
]

function WordDropModal({ onClose }) {
  const [words, setWords] = useState([])
  const [wordInput, setWordInput] = useState('')
  const [bars, setBars] = useState('')
  const [barCount, setBarCount] = useState(16)
  const [rhythms, setRhythms] = useState(['triplet', 'boombap', 'switch'])
  const [showRhythmDetail, setShowRhythmDetail] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveName, setSaveName] = useState('')
  const inputRef = useRef(null)
  const { saveAiSong } = useStudioStore()

  useEffect(() => { inputRef.current?.focus() }, [])

  const addWord = () => {
    const w = wordInput.trim()
    if (!w) return
    setWords(prev => [...prev, w])
    setWordInput('')
  }

  const removeWord = (i) => setWords(prev => prev.filter((_, idx) => idx !== i))

  const spit = async () => {
    if (words.length === 0 || loading) return
    setLoading(true)
    setBars('')
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const selectedRhythms = RHYTHM_STYLES.filter(r => rhythms.includes(r.id))
      const rhythmBlock = selectedRhythms.length > 0
        ? `\n\nRHYTHM INSTRUCTIONS — apply these cadence styles across the bars:\n${selectedRhythms.map(r => `- ${r.instruction}`).join('\n')}`
        : ''
      const result = await model.generateContent(
        `You are freestyling in the style of Harry Mack's street/public freestyles: clever wordplay, internal rhyme, punchlines built on double meanings, confident delivery. You are given random crowd words. Weave ALL of them into a freestyle rap of exactly ${barCount} lines, using them roughly in order, spacing them evenly throughout, each landing as the anchor of a clever line or punchline. Transitions between words should feel natural and thematically connected. Do not use headers, intros, or explanations. Output ONLY the bars, one per line.${rhythmBlock}

Words called out by the crowd, in order: ${words.join(', ')}`
      )
      setBars(result.response.text().trim())
    } catch {
      setBars('(flow broke — check your connection and try again)')
    } finally {
      setLoading(false)
    }
  }

  const highlightWords = (text) => {
    if (!text || words.length === 0) return [<span key="0">{text}</span>]
    const regex = new RegExp(`\\b(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi')
    const parts = []
    let lastIndex = 0
    let match
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(<span key={lastIndex}>{text.slice(lastIndex, match.index)}</span>)
      parts.push(<span key={match.index} style={{ color: '#ffd23f', fontWeight: 700 }}>{match[0]}</span>)
      lastIndex = regex.lastIndex
    }
    if (lastIndex < text.length) parts.push(<span key={lastIndex}>{text.slice(lastIndex)}</span>)
    return parts
  }

  const doSave = () => {
    const name = saveName.trim() || 'Harry Mack Freestyle'
    saveAiSong(name, bars)
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-studio-panel border border-studio-border rounded-2xl flex flex-col shadow-2xl"
        style={{ width: 580, maxHeight: '85vh', borderTop: '3px solid #ffd23f' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-studio-border">
          <div>
            <div className="font-display text-sm font-semibold" style={{ color: '#ffd23f' }}>🎤 Word Drop — Harry Mack Mode</div>
            <div className="text-xs text-studio-dim font-ui mt-0.5">Drop random words — AI weaves them into {barCount} bars of fire</div>
          </div>
          <button onClick={onClose} className="text-studio-dim hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2 block">Bar Count</label>
            <div className="flex gap-2 mb-4">
              {BAR_COUNTS.map(n => (
                <button
                  key={n}
                  onClick={() => setBarCount(n)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all"
                  style={{
                    borderColor: barCount === n ? '#ffd23f' : '#3a3a3d',
                    color: barCount === n ? '#ffd23f' : '#666688',
                    background: barCount === n ? 'rgba(255,210,63,0.1)' : 'transparent',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Rhythm selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-mono text-studio-dim uppercase tracking-wider">Rhythm Style <span style={{ color: '#ffd23f' }}>({rhythms.length} active)</span></label>
              <button
                onClick={() => setShowRhythmDetail(v => !v)}
                className="text-xs font-mono text-studio-dim hover:text-studio-cyan transition-colors"
              >
                {showRhythmDetail ? '▾ hide details' : '▸ show details'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {RHYTHM_STYLES.map(r => {
                const active = rhythms.includes(r.id)
                return (
                  <button
                    key={r.id}
                    onClick={() => setRhythms(prev =>
                      prev.includes(r.id)
                        ? prev.length > 1 ? prev.filter(x => x !== r.id) : prev
                        : [...prev, r.id]
                    )}
                    className="px-3 py-1.5 rounded-full text-xs font-mono border transition-all"
                    style={{
                      borderColor: active ? '#ffd23f' : '#3a3a3d',
                      color: active ? '#ffd23f' : '#666688',
                      background: active ? 'rgba(255,210,63,0.1)' : 'transparent',
                    }}
                  >
                    {active ? '✓ ' : ''}{r.label}
                  </button>
                )
              })}
            </div>
            {showRhythmDetail && (
              <div className="mt-3 flex flex-col gap-2">
                {RHYTHM_STYLES.filter(r => rhythms.includes(r.id)).map(r => (
                  <div
                    key={r.id}
                    className="px-3 py-2 rounded-lg text-xs font-ui leading-5"
                    style={{ background: 'rgba(255,210,63,0.06)', border: '1px solid rgba(255,210,63,0.2)' }}
                  >
                    <span className="font-semibold" style={{ color: '#ffd23f' }}>{r.label}: </span>
                    <span className="text-studio-dim">{r.desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2 block">Crowd Words</label>
            <div className="flex gap-2 mb-2">
              <input
                ref={inputRef}
                type="text"
                value={wordInput}
                onChange={e => setWordInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addWord() }}
                placeholder="Type a word, hit Enter (coffee, thunder, sneakers...)"
                maxLength={24}
                className="flex-1 bg-studio-void border border-studio-border rounded-xl px-4 py-2.5 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-cyan"
                style={{ fontFamily: 'monospace' }}
              />
              <button
                onClick={addWord}
                disabled={!wordInput.trim()}
                className="px-4 py-2.5 rounded-xl text-sm font-ui font-semibold text-black disabled:opacity-40"
                style={{ background: '#ffd23f' }}
              >
                Add
              </button>
            </div>
            {words.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {words.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono"
                    style={{ background: '#1a1a1d', border: '1px solid #3a3a3d', color: '#ffd23f' }}
                  >
                    {w}
                    <button onClick={() => removeWord(i)} className="text-studio-dim hover:text-white ml-0.5">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={spit}
              disabled={words.length === 0 || loading}
              className="flex-1 py-3 rounded-xl font-ui font-bold text-sm text-white disabled:opacity-40"
              style={{ background: '#d1453b' }}
            >
              {loading ? 'Spitting...' : '🎤 Spit It'}
            </button>
            {(words.length > 0 || bars) && (
              <button
                onClick={() => { setWords([]); setBars('') }}
                className="px-4 py-3 rounded-xl font-ui text-sm text-studio-dim border border-studio-border hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {(loading || bars) && (
            <div className="rounded-xl p-5 relative" style={{ background: '#1a1a1d', border: '1px solid #2c2c30' }}>
              <div className="absolute top-3 right-4 font-mono tracking-widest" style={{ color: '#d1453b', fontSize: 10 }}>●REC</div>
              {loading ? (
                <div className="flex items-center gap-2 text-studio-dim font-mono text-sm">
                  <span>Freestyling</span>
                  <span className="inline-flex gap-1">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-studio-dim inline-block"
                        style={{ animation: `vu-pulse 1s ease-in-out ${i*0.2}s infinite` }} />
                    ))}
                  </span>
                </div>
              ) : (
                <div className="font-ui text-sm leading-8 whitespace-pre-wrap" style={{ fontFamily: 'Georgia, serif', fontSize: 15 }}>
                  {highlightWords(bars)}
                </div>
              )}
            </div>
          )}

          {bars && !loading && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => { navigator.clipboard.writeText(bars); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
                className="px-3 py-1.5 rounded-lg text-xs font-ui font-semibold border border-studio-border text-studio-dim hover:border-studio-cyan hover:text-studio-cyan transition-colors"
              >
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
              {!saved && !saving && (
                <button
                  onClick={() => setSaving(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-ui font-semibold border text-studio-purple hover:bg-studio-purple/10 transition-colors"
                  style={{ borderColor: 'rgba(180,79,255,0.4)' }}
                >
                  💾 Save to AI Songs
                </button>
              )}
              {saving && (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') setSaving(false) }}
                    placeholder="Name this freestyle..."
                    className="bg-studio-void border border-studio-purple/50 rounded-lg px-3 py-1.5 text-xs font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-purple w-44"
                  />
                  <button onClick={doSave} className="px-3 py-1.5 rounded-lg text-xs font-ui font-semibold text-black" style={{ background: 'linear-gradient(135deg,#b44fff,#00e5ff)' }}>Save</button>
                  <button onClick={() => setSaving(false)} className="text-xs text-studio-dim hover:text-white">✕</button>
                </div>
              )}
              {saved && <span className="text-xs font-mono text-studio-purple self-center">✓ Saved to AI Songs</span>}
            </div>
          )}

          {!bars && !loading && words.length === 0 && (
            <div className="text-center text-studio-dim font-mono text-xs py-2">
              Add 2–5 random words above, then hit "Spit It" — words light up gold in the bars
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const STUDY_PROMPT = (name, lyrics) =>
`You are a professional ghostwriter and rap analyst. Analyze the following lyrics from "${name}" and write a detailed ghostwriter style guide that a skilled writer can follow to produce new lyrics that convincingly replicate this artist's exact style.

LYRICS TO ANALYZE:
${lyrics}

Write the style guide starting with "${name.toUpperCase()} STYLE — apply every technique:" and cover ALL of the following in specific detail:

1. FLOW & CADENCE: How syllables land on the beat — is the delivery ahead of, behind, or on the beat? What pocket does this artist prefer? How dense are the bars?
2. RHYME SCHEMES: What types of rhymes dominate — end rhymes, internal rhymes, multisyllabic matches, slant rhymes, chain rhymes? Give specific examples from the lyrics.
3. WORDPLAY & DOUBLE MEANINGS: How does this artist construct phrases with two meanings? Show specific examples from the lyrics and explain how the double meaning works.
4. PUNCHLINE STRUCTURE: How are setups and payoffs built? How many bars between setup and payoff? What techniques (misdirection, contrast, callback) appear most?
5. SPIRITUAL/BIBLICAL REFERENCES: Which specific figures, stories, scriptures, and theological concepts appear? How are they integrated into secular language?
6. CONTRAST PAIRS: What opposites appear regularly? (e.g. lost/found, hard/harder, flesh/spirit)
7. VOCABULARY & SIGNATURE PHRASES: What specific words, phrases, or constructions recur? What does this artist say that no one else would say the same way?
8. HOOK CONSTRUCTION: How are hooks built — repetition, call-and-response, single anchor phrase? What makes them sticky?
9. EMOTIONAL TONE & CONFIDENCE LEVEL: How does this artist hold themselves in the bars — humble, confident, aggressive, joyful? How does that tone show up in word choice?
10. WHAT TO AVOID: What would sound out of character? What clichés does this artist specifically avoid?

Be specific — reference actual lines from the lyrics. This guide will be used to generate new songs that sound authentically like ${name}.`

function StudyArtistModal({ onClose }) {
  const { artistLibrary, saveArtistStyle, deleteArtistStyle } = useStudioStore()
  const [artistName, setArtistName] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [instruction, setInstruction] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState('study')

  const analyze = async () => {
    if (!artistName.trim() || !lyrics.trim() || analyzing) return
    setAnalyzing(true)
    setInstruction('')
    setSaved(false)
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const result = await model.generateContent(STUDY_PROMPT(artistName.trim(), lyrics.trim()))
      setInstruction(result.response.text().trim())
    } catch { setInstruction('(analysis failed — check your connection and try again)') }
    finally { setAnalyzing(false) }
  }

  const save = () => {
    if (!instruction || !artistName.trim()) return
    saveArtistStyle(artistName.trim(), instruction, lyrics.trim().slice(0, 300))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-studio-panel border border-studio-border rounded-2xl flex flex-col shadow-2xl"
        style={{ width: 640, maxHeight: '90vh', borderTop: '3px solid #b44fff' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-studio-border">
          <div>
            <div className="font-display text-sm font-semibold text-studio-text">📚 Artist Style Library</div>
            <div className="text-xs text-studio-dim font-ui mt-0.5">Paste lyrics — AI studies and saves the full style to your library</div>
          </div>
          <button onClick={onClose} className="text-studio-dim hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="flex border-b border-studio-border">
          {[{ id: 'study', label: 'Study New Artist' }, { id: 'library', label: `Library (${artistLibrary.length})` }].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-5 py-2.5 text-xs font-mono tracking-wide transition-colors relative"
              style={{ color: tab === t.id ? '#e0e0f0' : '#666688', fontWeight: tab === t.id ? 700 : 400 }}
            >
              {t.label}
              {tab === t.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-studio-purple" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {tab === 'study' ? (
            <>
              <div>
                <label className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-1.5 block">Artist Name</label>
                <input
                  autoFocus
                  type="text"
                  value={artistName}
                  onChange={e => setArtistName(e.target.value)}
                  placeholder="e.g. Mike Malagies"
                  className="w-full bg-studio-void border border-studio-border rounded-xl px-4 py-2.5 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-purple"
                />
              </div>
              <div>
                <label className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-1.5 block">
                  Paste Lyrics <span className="normal-case text-studio-dim">(one song or multiple — more = better analysis)</span>
                </label>
                <textarea
                  value={lyrics}
                  onChange={e => setLyrics(e.target.value)}
                  placeholder="Paste the lyrics here..."
                  rows={8}
                  className="w-full bg-studio-void border border-studio-border rounded-xl px-4 py-3 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-purple resize-none"
                />
              </div>
              <button
                onClick={analyze}
                disabled={analyzing || !artistName.trim() || !lyrics.trim()}
                className="w-full py-3 rounded-xl font-ui font-bold text-sm text-white disabled:opacity-40"
                style={{ background: analyzing ? '#444' : 'linear-gradient(135deg,#b44fff,#00e5ff)' }}
              >
                {analyzing ? 'Analyzing style...' : '🔍 Analyze Style'}
              </button>

              {instruction && (
                <div className="flex flex-col gap-3">
                  <div className="bg-studio-void border border-studio-purple/30 rounded-xl p-4">
                    <div className="text-xs font-mono text-studio-dim uppercase tracking-widest mb-2">Generated Style Guide</div>
                    <div className="text-xs font-ui text-studio-text leading-6 whitespace-pre-wrap max-h-64 overflow-y-auto">{instruction}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={save}
                      className="flex-1 py-2.5 rounded-xl font-ui font-semibold text-sm text-black"
                      style={{ background: 'linear-gradient(135deg,#b44fff,#00e5ff)' }}
                    >
                      {saved ? '✓ Saved to Library!' : '💾 Save to Library'}
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(instruction)}
                      className="px-4 py-2.5 rounded-xl font-ui text-sm border border-studio-border text-studio-dim hover:text-white"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-3">
              {artistLibrary.length === 0 ? (
                <div className="text-xs font-mono text-studio-dim italic py-4 text-center">
                  No artists studied yet — go to "Study New Artist" and paste some lyrics.
                </div>
              ) : artistLibrary.map(entry => (
                <div key={entry.name} className="bg-studio-void border border-studio-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-display text-sm font-semibold text-studio-purple">{entry.name}</div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-studio-dim">
                        {new Date(entry.savedAt).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => deleteArtistStyle(entry.name)}
                        className="text-xs font-mono text-studio-dim hover:text-studio-red transition-colors"
                      >
                        delete
                      </button>
                    </div>
                  </div>
                  {entry.lyricsSnippet && (
                    <div className="text-xs font-ui text-studio-dim italic mb-2 leading-5">
                      "{entry.lyricsSnippet.slice(0, 120)}..."
                    </div>
                  )}
                  <div className="text-xs font-ui text-studio-text leading-5 whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {entry.instruction.slice(0, 400)}{entry.instruction.length > 400 ? '...' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const PUNCHLINE_TECHNIQUES = [
  {
    id: 'misdirection',
    label: 'Misdirection',
    color: '#ff2d55',
    desc: 'Set up an expectation — snap it the other way completely',
    instruction: 'MISDIRECTION: Set up a clear expectation in the first half, then snap it in the exact opposite direction. The farther the subversion, the harder the landing.',
  },
  {
    id: 'doublemeaning',
    label: 'Double Meaning',
    color: '#00e5ff',
    desc: 'One phrase, two meanings — both land simultaneously',
    instruction: 'DOUBLE MEANING: Write a phrase where every key word operates on two levels at once — literal and figurative, secular and spiritual, surface and deep. Both readings must be equally valid and relevant.',
  },
  {
    id: 'comparison',
    label: 'Comparison',
    color: '#00ff9d',
    desc: 'A simile so accurate and unexpected it stops the listener cold',
    instruction: 'COMPARISON PUNCHLINE: Find the exact unexpected comparison — not the obvious vehicle, the surprising one nobody has used. The more specific and unlikely the simile, the harder it lands.',
  },
  {
    id: 'contrast',
    label: 'Contrast',
    color: '#ff9500',
    desc: 'Slam two opposites in one bar — the gap is the punch',
    instruction: 'CONTRAST PUNCHLINE: Place two extreme opposites in the same bar or couplet. The emotional gap between where they were and where they are now IS the punchline.',
  },
  {
    id: 'callback',
    label: 'Callback',
    color: '#b44fff',
    desc: 'Plant it early, pay it off late — the delayed hit lands hardest',
    instruction: 'CALLBACK PUNCHLINE: Drop a word, image, or idea early in the verse without drawing attention to it. Return to it in the final 2 bars and pay it off. The delayed payoff doubles the impact.',
  },
  {
    id: 'escalation',
    label: 'Escalation',
    color: '#ffe600',
    desc: '3–4 bars raising stakes to a peak line that makes everything before it count',
    instruction: 'ESCALATION PUNCHLINE: Build a 3–4 bar sequence where each bar raises the stakes higher than the last, culminating in a final line that is the peak of everything before it. The listener feels the momentum and the landing simultaneously.',
  },
  {
    id: 'understatement',
    label: 'Understatement',
    color: '#aaaacc',
    desc: 'Say the least powerful version — the gap between words and weight is the punch',
    instruction: 'UNDERSTATEMENT PUNCHLINE: Deliver the most powerful fact in the least dramatic-sounding language. The listener has to do the work of recognizing the weight. The gap between what is said and what it means IS the punchline.',
  },
]

function PunchlineWorkshopModal({ onClose }) {
  const [mode, setMode] = useState('generate')
  const [topic, setTopic] = useState('')
  const [setupBar, setSetupBar] = useState('')
  const [techniques, setTechniques] = useState(['misdirection', 'doublemeaning', 'comparison', 'contrast'])
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const toggleTech = (id) => setTechniques(prev =>
    prev.includes(id) ? (prev.length > 1 ? prev.filter(x => x !== id) : prev) : [...prev, id]
  )

  const generate = async () => {
    if (loading) return
    if (mode === 'generate' && !topic.trim()) return
    if (mode === 'setup' && !setupBar.trim()) return
    setLoading(true)
    setOutput('')
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      let prompt
      if (mode === 'generate') {
        const selectedTechs = PUNCHLINE_TECHNIQUES.filter(t => techniques.includes(t.id))
        const techInstructions = selectedTechs.map(t => `- ${t.instruction}`).join('\n')
        prompt = `You are an elite rap ghostwriter specializing in punchline craft. Generate 8–10 standalone punchlines on the topic: "${topic.trim()}"

For each punchline, use one of the following techniques and label it:
${techInstructions}

FORMAT — output each punchline exactly like this, one per line:
[TECHNIQUE NAME] punchline bar here

Rules:
- Each punchline must be one bar (one line) — a setup couplet counts as two bars max
- Make each one genuinely surprising — no generic or safe bars
- Every punchline must be complete: the payoff is in the same line or the line immediately after
- Do not number them, do not add explanation, do not add any text other than the labeled punchlines`
      } else {
        prompt = `You are an elite rap ghostwriter. The rapper has written a setup bar and needs 5 different payoff completions — each using a distinct punchline technique.

Setup bar: "${setupBar.trim()}"

Write 5 payoff bars that complete this punchline, each using a different technique from this list:
${PUNCHLINE_TECHNIQUES.map(t => `- ${t.instruction}`).join('\n')}

FORMAT — output each payoff exactly like this:
[TECHNIQUE NAME] payoff bar here

Rules:
- The payoff must rhyme with or directly respond to the setup bar
- Each payoff uses a different technique
- One line each — no explanation, no numbering, just the labeled payoffs`
      }
      const result = await model.generateContent(prompt)
      setOutput(result.response.text().trim())
    } catch { setOutput('(something broke — try again)') }
    finally { setLoading(false) }
  }

  const formatOutput = (text) => {
    if (!text) return null
    return text.split('\n').filter(l => l.trim()).map((line, i) => {
      const match = line.match(/^\[([^\]]+)\]\s*(.+)$/)
      if (match) {
        const tech = PUNCHLINE_TECHNIQUES.find(t => t.label.toLowerCase() === match[1].toLowerCase()) || null
        return (
          <div key={i} className="mb-3">
            <div className="text-xs font-mono uppercase tracking-wider mb-0.5" style={{ color: tech?.color || '#666688' }}>
              {match[1]}
            </div>
            <div className="text-sm font-ui text-studio-text leading-relaxed pl-1">{match[2]}</div>
          </div>
        )
      }
      return <div key={i} className="text-sm font-ui text-studio-text leading-relaxed mb-1">{line}</div>
    })
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-studio-panel border border-studio-border rounded-2xl flex flex-col shadow-2xl"
        style={{ width: 600, maxHeight: '88vh', borderTop: '3px solid #ff2d55' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-studio-border">
          <div>
            <div className="font-display text-sm font-semibold text-studio-text">🥊 Punchline Workshop</div>
            <div className="text-xs text-studio-dim font-ui mt-0.5">Generate labeled punchlines or complete a setup bar</div>
          </div>
          <button onClick={onClose} className="text-studio-dim hover:text-white text-lg leading-none">✕</button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-studio-border">
          {[{ id: 'generate', label: 'Generate Punchlines' }, { id: 'setup', label: 'Setup → Payoff' }].map(m => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setOutput('') }}
              className="px-5 py-2.5 text-xs font-mono tracking-wide transition-colors relative"
              style={{ color: mode === m.id ? '#e0e0f0' : '#666688', fontWeight: mode === m.id ? 700 : 400 }}
            >
              {m.label}
              {mode === m.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-studio-red" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {mode === 'generate' ? (
            <>
              <div>
                <label className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2 block">Topic / Subject / Angle</label>
                <input
                  autoFocus
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') generate() }}
                  placeholder="e.g. grinding through hard times, faith over fear, outworking everyone..."
                  className="w-full bg-studio-void border border-studio-border rounded-xl px-4 py-2.5 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-red"
                />
              </div>
              <div>
                <label className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2 block">
                  Techniques <span className="text-studio-dim normal-case">({techniques.length} selected)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {PUNCHLINE_TECHNIQUES.map(t => {
                    const active = techniques.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTech(t.id)}
                        title={t.desc}
                        className="px-3 py-1.5 rounded-full text-xs font-mono border transition-all"
                        style={{
                          borderColor: active ? t.color : '#252540',
                          color: active ? t.color : '#666688',
                          background: active ? t.color + '18' : 'transparent',
                        }}
                      >
                        {active ? '✓ ' : ''}{t.label}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {PUNCHLINE_TECHNIQUES.filter(t => techniques.includes(t.id)).map(t => (
                    <div key={t.id} className="text-xs font-ui leading-5" style={{ color: t.color + 'cc' }}>
                      <span className="font-semibold">{t.label}:</span> <span className="text-studio-dim">{t.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2 block">Your Setup Bar</label>
              <textarea
                autoFocus
                value={setupBar}
                onChange={e => setSetupBar(e.target.value)}
                placeholder="e.g. They said I'd never make it out the bottom of the pit..."
                rows={2}
                className="w-full bg-studio-void border border-studio-border rounded-xl px-4 py-3 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-red resize-none"
              />
              <div className="text-xs font-mono text-studio-dim mt-2">
                AI writes 5 payoff bars — one for each punchline technique, labeled.
              </div>
            </div>
          )}

          <button
            onClick={generate}
            disabled={loading || (mode === 'generate' ? !topic.trim() : !setupBar.trim())}
            className="w-full py-3 rounded-xl font-ui font-bold text-sm text-white disabled:opacity-40 transition-all"
            style={{ background: loading ? '#444' : '#ff2d55' }}
          >
            {loading ? 'Writing...' : mode === 'generate' ? '🥊 Generate Punchlines' : '🥊 Complete the Setup'}
          </button>

          {output && (
            <div className="bg-studio-void border border-studio-border rounded-xl p-4" style={{ borderLeft: '3px solid #ff2d55' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-mono text-studio-dim uppercase tracking-widest">Output</div>
                <button
                  onClick={() => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="text-xs font-mono border border-studio-border text-studio-dim hover:border-studio-red hover:text-studio-red px-3 py-1 rounded-lg transition-colors"
                >
                  {copied ? '✓ Copied' : '📋 Copy All'}
                </button>
              </div>
              {formatOutput(output)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BeatSuggestionsPanel() {
  const { lyrics } = useStudioStore()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState(null)
  const [error, setError] = useState(null)

  const allLyrics = lyrics
    .map((s) => `[${s.label}]\n${s.lines.filter((l) => l.trim()).join('\n')}`)
    .join('\n\n')

  const analyze = async () => {
    if (!allLyrics.trim()) return
    setOpen(true)
    setLoading(true)
    setSuggestions(null)
    setError(null)

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const result = await model.generateContent(
        `Analyze these lyrics and suggest the perfect beat profile.

LYRICS:
${allLyrics}

Give me a beat profile using these EXACT labels (one per line):
BPM: [suggested range or value]
Key: [key and mode, e.g. "F# minor"]
Vibe: [2-3 sentences on feel and energy]
Instruments: [4-6 comma-separated sounds/instruments]
References: [2-3 existing artist/song references]
Arc: [one sentence on how the energy should move through the song]

Be specific, not generic.`
      )
      const text = result.response.text()
      const parsed = {}
      for (const line of text.split('\n')) {
        const m = line.match(/^(BPM|Key|Vibe|Instruments|References|Arc):\s*(.+)$/i)
        if (m) parsed[m[1]] = m[2].trim()
      }
      setSuggestions(Object.keys(parsed).length > 2 ? parsed : { Vibe: text.trim() })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={analyze}
        disabled={!allLyrics.trim()}
        className="w-full py-2.5 rounded-xl font-ui font-semibold text-xs border border-studio-border text-studio-dim hover:border-studio-green hover:text-studio-green transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title={!allLyrics.trim() ? 'Write some lyrics first' : 'Analyze your lyrics for beat suggestions'}
      >
        🎵 Beat Ideas from Lyrics
      </button>
    )
  }

  return (
    <div className="bg-studio-panel border border-studio-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-studio-green" style={{ boxShadow: '0 0 6px #00ff9d' }} />
          <span className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase">Beat Profile</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={analyze}
            disabled={loading}
            className="text-xs font-mono text-studio-dim hover:text-studio-green transition-colors"
          >
            {loading ? '...' : 'refresh'}
          </button>
          <button onClick={() => setOpen(false)} className="text-xs text-studio-dim hover:text-white">✕</button>
        </div>
      </div>

      {loading && (
        <div className="text-xs font-mono text-studio-dim">Analyzing your lyrics...</div>
      )}
      {error && (
        <div className="text-xs font-mono text-studio-red">{error}</div>
      )}
      {suggestions && !loading && (
        <div className="flex flex-col gap-2">
          {suggestions.BPM && (
            <div>
              <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">BPM </span>
              <span className="text-xs font-ui text-studio-cyan font-semibold">{suggestions.BPM}</span>
            </div>
          )}
          {suggestions.Key && (
            <div>
              <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">Key </span>
              <span className="text-xs font-ui text-studio-purple font-semibold">{suggestions.Key}</span>
            </div>
          )}
          {suggestions.Vibe && (
            <div>
              <span className="text-xs font-mono text-studio-dim uppercase tracking-wider block mb-0.5">Vibe</span>
              <span className="text-xs font-ui text-studio-text leading-5">{suggestions.Vibe}</span>
            </div>
          )}
          {suggestions.Instruments && (
            <div>
              <span className="text-xs font-mono text-studio-dim uppercase tracking-wider block mb-0.5">Sounds</span>
              <span className="text-xs font-ui text-studio-text">{suggestions.Instruments}</span>
            </div>
          )}
          {suggestions.References && (
            <div>
              <span className="text-xs font-mono text-studio-dim uppercase tracking-wider block mb-0.5">Like</span>
              <span className="text-xs font-ui text-studio-green">{suggestions.References}</span>
            </div>
          )}
          {suggestions.Arc && (
            <div>
              <span className="text-xs font-mono text-studio-dim uppercase tracking-wider block mb-0.5">Energy Arc</span>
              <span className="text-xs font-ui text-studio-text">{suggestions.Arc}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AICoPilotView() {
  const { bpm, timeSignature, aiMessages, addAiMessage, isAiTyping, setAiTyping, aiSongs, savedSongs, lyricAnalysis, clearLyricAnalysis } = useStudioStore()
  const { profile, buildSystemPrompt, learnFromLyrics } = useStyleProfile()

  const [input, setInput] = useState('')
  const [streamedText, setStreamedText] = useState('')
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showFreestyle, setShowFreestyle] = useState(false)
  const [showWordDrop, setShowWordDrop] = useState(false)
  const [showPunchlineWorkshop, setShowPunchlineWorkshop] = useState(false)
  const [showStudyArtist, setShowStudyArtist] = useState(false)
  const [vaultTab, setVaultTab] = useState('ai')
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages, streamedText])

  const sendMessage = async (overrideText) => {
    const text = (overrideText || input).trim()
    if (!text || isAiTyping) return

    const userMsg = { role: 'user', content: text }
    addAiMessage(userMsg)
    if (!overrideText) setInput('')
    setAiTyping(true)
    setStreamedText('')

    try {
      const systemPrompt = buildSystemPrompt(bpm, timeSignature)
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: systemPrompt,
        generationConfig: { temperature: 1.0 },
      })

      // Build chat history (Gemini uses 'model' instead of 'assistant')
      const history = aiMessages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

      const chat = model.startChat({ history })
      const result = await chat.sendMessageStream(text)

      let full = ''
      for await (const chunk of result.stream) {
        const chunkText = chunk.text()
        full += chunkText
        setStreamedText(full)
      }

      addAiMessage({ role: 'assistant', content: full })
      setStreamedText('')

      // Learn from content if it looks like lyrics
      if (full.includes('[Verse]') || full.includes('[Chorus]') || full.includes('[Hook]')) {
        learnFromLyrics(full)
      }
    } catch (err) {
      addAiMessage({
        role: 'assistant',
        content: `Error: ${err.message}\n\nCheck that your Anthropic API key (VITE_ANTHROPIC_API_KEY) is set correctly in the .env file.`,
      })
    } finally {
      setAiTyping(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleGenerate = async (topic, mood, artistId, customArtist, rhymeTypeLabels, songStyleId = 'balanced', lookedUpInstruction = null, lyricStructureId = 'none') => {
    if (isAiTyping) return

    const hasProfile = profile.themes.length > 0 || profile.lyricsHistory.length > 0
    const styleNote = hasProfile
      ? 'Incorporate Bulue\'s personal lyrical voice — his vocabulary, cadence, spiritual themes, and writing patterns.'
      : 'Keep it raw, authentic, and deeply personal — not generic or surface-level.'

    const styleInstruction = lookedUpInstruction || getStyleInstruction(artistId, customArtist)
    const flowNote = styleInstruction ? `\n${styleInstruction}` : ''

    const selectedRhymes = RHYME_TYPES.filter((r) => rhymeTypeLabels.includes(r.label))
    const rhymeNote = selectedRhymes.length > 0
      ? `RHYME SCHEME — apply all of the following:
${selectedRhymes.map((r) => `- ${r.label}: ${r.instruction}`).join('\n')}`
      : 'Use complex interlocking rhyme patterns throughout.'

    const selectedSongStyle = SONG_STYLES.find((s) => s.id === songStyleId) || SONG_STYLES[0]
    const songStyleNote = selectedSongStyle.instruction
      ? `\n${selectedSongStyle.instruction}`
      : ''

    const selectedStructure = LYRIC_STRUCTURES.find((s) => s.id === lyricStructureId) || LYRIC_STRUCTURES[0]
    const structureNote = selectedStructure.instruction ? `\n${selectedStructure.instruction}` : ''

    const seed = Math.random().toString(36).slice(2, 8).toUpperCase()

    const prompt = `[Generation ID: ${seed}] Write a BRAND NEW complete song about "${topic}". Mood/energy: ${mood}.
This song must be completely original — fresh words, fresh bars, fresh imagery.
${songStyleNote}

${flowNote}

${rhymeNote}
${structureNote}

FLOW INTELLIGENCE — every bar:
- Write as natural speech first — never twist a sentence to reach a rhyme
- Read each bar aloud mentally — if it sounds stiff, rewrite it
- Vary bar length and rhythm — some bars hit short and hard, others roll long
- No throwaway lines — every bar earns its spot or gets cut

STRUCTURE — follow exactly:
[Verse 1] — 16 bars (16 lines)
[Pre-Chorus] — 4 bars
[Chorus] — 8 bars
[Verse 2] — 16 bars (16 lines)
[Bridge] — 8 bars
[Outro] — 4 bars

Every verse = exactly 16 lines. Count them.
${styleNote}

Write the complete song now. Do not cut it short.`

    const artistLabel = artistId && artistId !== 'none'
      ? (customArtist || ARTIST_STYLES.find(a => a.id === artistId)?.label || null)
      : null
    const userLabel = `✦ Generate song — "${topic}" · ${mood} · ${selectedSongStyle.label}${artistLabel ? ` · ${artistLabel} style` : ''} · ${rhymeTypeLabels.join(', ')}${selectedStructure.id !== 'none' ? ` · ${selectedStructure.label}` : ''}`
    addAiMessage({ role: 'user', content: userLabel })
    setAiTyping(true)
    setStreamedText('')

    try {
      const systemPrompt = buildSystemPrompt(bpm, timeSignature)
      // Fresh model call — no chat history — so previous songs can't anchor the output.
      // Higher temperature (1.5) ensures creative variety between generations.
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: systemPrompt,
        generationConfig: { temperature: 1.0 },
      })

      const result = await model.generateContentStream(prompt)

      let full = ''
      for await (const chunk of result.stream) {
        full += chunk.text()
        setStreamedText(full)
      }

      addAiMessage({ role: 'assistant', content: full })
      setStreamedText('')

      if (full.includes('[Verse') || full.includes('[Chorus') || full.includes('[Hook')) {
        learnFromLyrics(full)
      }
    } catch (err) {
      addAiMessage({
        role: 'assistant',
        content: `Error generating song: ${err.message}`,
      })
    } finally {
      setAiTyping(false)
    }
  }

  const quickPrompts = [
    'Write a verse about overcoming obstacles',
    'Give me a hook for a motivational song',
    'Write a bridge that transitions to a higher energy chorus',
    'Suggest rhyme schemes I should try',
  ]

  const noKey = !import.meta.env.VITE_ANTHROPIC_API_KEY

  return (
    <div className="flex h-full bg-studio-void">
      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-2 bg-studio-panel border-b border-studio-border">
          <div className="w-2 h-2 rounded-full bg-studio-cyan shadow-cyan" />
          <span className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase">AI Co-Pilot</span>
          <span className="text-xs text-studio-dim font-mono">claude-sonnet-4-6</span>
          <button
            onClick={() => { if (window.confirm('Clear all chat messages?')) useStudioStore.getState().clearAiChat() }}
            className="ml-auto text-xs font-mono text-studio-dim hover:text-studio-red transition-colors"
            title="Clear chat history"
          >
            clear chat
          </button>
        </div>

        {noKey && (
          <div className="mx-4 mt-3 p-3 bg-studio-red/10 border border-studio-red/30 rounded-lg text-xs font-mono text-studio-red">
            No Anthropic API key found. Add VITE_ANTHROPIC_API_KEY to your .env file.
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {aiMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-studio-cyan to-studio-purple flex items-center justify-center shadow-glow">
                <span className="font-display font-bold text-xl text-black">AI</span>
              </div>
              <div>
                <div className="font-display text-lg font-semibold text-studio-text mb-1">Your Co-Pilot is ready</div>
                <div className="text-sm text-studio-dim font-ui max-w-xs">
                  Ask for lyrics, feedback, hooks — the more you write, the better it knows your voice.
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-sm mt-2">
                {quickPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setInput(p); textareaRef.current?.focus() }}
                    className="text-left px-3 py-2 rounded-lg bg-studio-surface border border-studio-border hover:border-studio-cyan text-xs font-ui text-studio-dim hover:text-studio-text transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {aiMessages.map((msg, i) => (
            <Message key={i} msg={msg} />
          ))}

          {/* Streaming response */}
          {streamedText && (
            <Message msg={{ role: 'assistant', content: streamedText }} />
          )}

          {isAiTyping && !streamedText && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-studio-cyan to-studio-purple flex items-center justify-center font-display font-bold text-xs text-black shadow-cyan">
                AI
              </div>
              <div className="bg-studio-surface border border-studio-border rounded-xl px-4 py-3 flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-studio-cyan"
                    style={{ animation: `vu-pulse 1s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-studio-border bg-studio-panel">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask for lyrics, feedback, hooks... (Enter to send, Shift+Enter for newline)"
              rows={2}
              className="flex-1 bg-studio-void border border-studio-border rounded-xl px-4 py-3 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-cyan resize-none"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isAiTyping || noKey}
              className="px-5 py-3 rounded-xl font-ui font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #00e5ff, #b44fff)',
                color: '#000',
                boxShadow: input.trim() && !isAiTyping ? '0 0 16px rgba(0,229,255,0.4)' : 'none',
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Style profile sidebar */}
      <div className="w-64 border-l border-studio-border p-4 flex flex-col gap-4 bg-studio-panel overflow-y-auto">

        {/* Generate Song — primary CTA */}
        <button
          onClick={() => setShowGenerateModal(true)}
          disabled={isAiTyping || noKey}
          className="w-full py-3 rounded-xl font-display font-bold text-sm text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(135deg, #00e5ff, #b44fff)',
            boxShadow: '0 0 20px rgba(0,229,255,0.25)',
          }}
        >
          ✦ Generate Full Song
        </button>

        {/* Freestyle cypher */}
        <button
          onClick={() => setShowFreestyle(true)}
          disabled={noKey}
          className="w-full py-2.5 rounded-xl font-ui font-semibold text-xs border border-studio-border text-studio-dim hover:border-studio-cyan hover:text-studio-cyan transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          🎤 Freestyle Cypher
        </button>

        {/* Word Drop — Harry Mack mode */}
        <button
          onClick={() => setShowWordDrop(true)}
          disabled={noKey}
          className="w-full py-2.5 rounded-xl font-ui font-semibold text-xs border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: '#3a3a3d', color: '#ffd23f' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#ffd23f'; e.currentTarget.style.background = 'rgba(255,210,63,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#3a3a3d'; e.currentTarget.style.background = 'transparent' }}
        >
          🎤 Word Drop — Harry Mack
        </button>

        {/* Artist Style Library */}
        <button
          onClick={() => setShowStudyArtist(true)}
          disabled={noKey}
          className="w-full py-2.5 rounded-xl font-ui font-semibold text-xs border border-studio-border text-studio-dim hover:border-studio-purple hover:text-studio-purple transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          📚 Artist Style Library
        </button>

        {/* Punchline Workshop */}
        <button
          onClick={() => setShowPunchlineWorkshop(true)}
          disabled={noKey}
          className="w-full py-2.5 rounded-xl font-ui font-semibold text-xs border border-studio-border text-studio-dim hover:border-studio-red hover:text-studio-red transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          🥊 Punchline Workshop
        </button>

        {/* Beat ideas from lyrics */}
        <BeatSuggestionsPanel />

        <StyleProfileDisplay profile={profile} />

        {/* Lyric Analyzer context */}
        {lyricAnalysis && (
          <div className="bg-studio-surface/50 border rounded-xl p-3" style={{ borderColor: '#b44fff44' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-studio-purple" style={{ boxShadow: '0 0 5px #b44fff' }} />
                <span className="font-display text-xs font-semibold tracking-widest uppercase" style={{ color: '#b44fff' }}>
                  Lyric Analyzer
                </span>
              </div>
              <button
                onClick={clearLyricAnalysis}
                className="text-xs font-mono text-studio-dim hover:text-studio-red transition-colors"
                title="Clear analyzer context"
              >
                ✕
              </button>
            </div>

            {/* Summary line */}
            <div className="text-xs font-ui text-studio-dim mb-2 leading-4">
              {lyricAnalysis.artistName
                ? <><span className="text-studio-text font-semibold">{lyricAnalysis.artistName}</span>{lyricAnalysis.songTitle ? ` — ${lyricAnalysis.songTitle}` : ''}</>
                : 'Analyzed lyrics'}
              {' · '}<span style={{ color: '#b44fff' }}>{lyricAnalysis.pattern}</span>
              {lyricAnalysis.styleProfile && !lyricAnalysis.styleProfile.error && (
                <> · {lyricAnalysis.styleProfile.flowStyle}</>
              )}
              {' · '}{lyricAnalysis.lines.length} lines
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => {
                  const sp = lyricAnalysis.styleProfile
                  const styleText = sp && !sp.error
                    ? `Flow: ${sp.flowStyle} · ${sp.cadence} · ${sp.rhymeComplexity}\nTechniques: ${(sp.techniques || []).join(', ')}\nMood: ${sp.mood}\n${sp.summary ? `Style: ${sp.summary}` : ''}`
                    : `Rhyme scheme: ${lyricAnalysis.pattern}`
                  const source = lyricAnalysis.artistName
                    ? `"${lyricAnalysis.songTitle || 'this song'}" by ${lyricAnalysis.artistName}`
                    : 'a song I analyzed'
                  const sampleLines = lyricAnalysis.lines.slice(0, 8).join('\n')
                  const msg = `I just analyzed ${source} in the Lyric Analyzer. Here's what it found:\n\nRhyme scheme: ${lyricAnalysis.pattern}\n${styleText}\n\nSample lyrics:\n${sampleLines}\n\nHelp me write something new in this exact style.`
                  setInput(msg)
                  textareaRef.current?.focus()
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-ui border transition-colors"
                style={{ borderColor: '#b44fff44', color: '#b44fff', background: 'rgba(180,79,255,0.07)' }}
              >
                ✦ Write in this style
              </button>
              <button
                onClick={() => {
                  const sampleLines = lyricAnalysis.lines.slice(0, 12).join('\n')
                  const source = lyricAnalysis.artistName
                    ? `${lyricAnalysis.artistName}${lyricAnalysis.songTitle ? ` — "${lyricAnalysis.songTitle}"` : ''}`
                    : 'analyzed lyrics'
                  const msg = `Here are lyrics from ${source} that I analyzed:\n\n${sampleLines}\n\nBreak down what makes this style effective — the rhyme scheme (${lyricAnalysis.pattern}), the flow, and specific techniques I can apply to my own writing.`
                  setInput(msg)
                  textareaRef.current?.focus()
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-ui border border-studio-border text-studio-dim hover:text-studio-text hover:border-studio-border/80 transition-colors"
              >
                ✦ Break down the technique
              </button>
              <button
                onClick={() => {
                  const sampleLines = lyricAnalysis.lines.slice(0, 6).join('\n')
                  const msg = `I want to blend my personal style with what I found in the Lyric Analyzer.\n\nAnalyzed style: ${lyricAnalysis.pattern}${lyricAnalysis.styleProfile?.flowStyle ? ` · ${lyricAnalysis.styleProfile.flowStyle}` : ''}\nSample reference:\n${sampleLines}\n\nWrite me 8 bars that mix my voice with this style — keep my themes but use their rhyme scheme and flow.`
                  setInput(msg)
                  textareaRef.current?.focus()
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-ui border border-studio-border text-studio-dim hover:text-studio-text hover:border-studio-border/80 transition-colors"
              >
                ✦ Blend with my style
              </button>
            </div>
          </div>
        )}

        {/* Song Vault */}
        <div className="bg-studio-surface/50 border border-studio-border rounded-xl p-3">
          <div className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase mb-2">Song Vault</div>
          <div className="flex gap-1 mb-2">
            {['ai', 'my'].map(t => (
              <button
                key={t}
                onClick={() => setVaultTab(t)}
                className="flex-1 py-1 rounded-lg text-xs font-ui font-semibold transition-all"
                style={{
                  background: vaultTab === t ? 'rgba(0,229,255,0.15)' : 'transparent',
                  color: vaultTab === t ? '#00e5ff' : '#888899',
                  border: `1px solid ${vaultTab === t ? 'rgba(0,229,255,0.4)' : '#252540'}`,
                }}
              >
                {t === 'ai' ? `AI Songs (${aiSongs.length})` : `My Songs (${savedSongs.length})`}
              </button>
            ))}
          </div>

          {vaultTab === 'ai' && (
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {aiSongs.length === 0 && (
                <p className="text-xs text-studio-dim font-ui text-center py-3">No AI songs yet — generate one above.</p>
              )}
              {aiSongs.map(song => (
                <button
                  key={song.id}
                  onClick={() => {
                    const msg = `I want to work on my AI-generated song called "${song.name}". Here are the lyrics:\n\n${song.rawText}\n\nHelp me improve, refine, or continue working on this.`
                    setInput(msg)
                    textareaRef.current?.focus()
                  }}
                  className="text-left px-2.5 py-2 rounded-lg border border-studio-border hover:border-studio-cyan text-xs font-ui text-studio-dim hover:text-studio-text transition-colors"
                >
                  <div className="text-studio-text font-semibold truncate">{song.name}</div>
                  <div className="text-studio-dim mt-0.5 opacity-60">{new Date(song.savedAt).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          )}

          {vaultTab === 'my' && (
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {savedSongs.length === 0 && (
                <p className="text-xs text-studio-dim font-ui text-center py-3">No saved songs yet — save one in the Lyrics tab.</p>
              )}
              {savedSongs.map(song => {
                const lyrics = (song.sections || [])
                  .map(s => `[${s.label}]\n${(s.lines || []).filter(l => l.trim()).join('\n')}`)
                  .filter(s => s.split('\n').length > 1)
                  .join('\n\n')
                return (
                  <button
                    key={song.id}
                    onClick={() => {
                      const msg = `I want to work on my song called "${song.name}". Here are my lyrics:\n\n${lyrics || '(no lyrics saved)'}\n\nHelp me improve, refine, or continue working on this.`
                      setInput(msg)
                      textareaRef.current?.focus()
                    }}
                    className="text-left px-2.5 py-2 rounded-lg border border-studio-border hover:border-studio-purple text-xs font-ui text-studio-dim hover:text-studio-text transition-colors"
                  >
                    <div className="text-studio-text font-semibold truncate">{song.name}</div>
                    <div className="text-studio-dim mt-0.5 opacity-60">{song.sections?.length || 0} sections</div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-studio-surface/50 border border-studio-border rounded-xl p-3">
          <div className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase mb-2">Quick Actions</div>
          <div className="flex flex-col gap-1.5">
            {[
              { label: 'Give me a hook', prompt: 'Write 3 different hook options for a high-energy song in my style' },
              { label: 'Analyze my style', prompt: 'Based on what you know about me, describe my lyrical style and what makes my writing unique' },
              { label: 'Suggest a concept', prompt: 'Suggest a creative concept or story for my next song that fits my themes' },
              { label: 'Improve this line', prompt: 'I\'ll paste a line below — give me 3 stronger versions of it in my style:\n' },
            ].map(({ label, prompt }) => (
              <button
                key={label}
                onClick={() => { setInput(prompt); textareaRef.current?.focus() }}
                className="text-left px-3 py-2 rounded-lg bg-studio-void border border-studio-border hover:border-studio-purple text-xs font-ui text-studio-dim hover:text-studio-text transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showGenerateModal && (
        <GenerateSongModal
          onGenerate={handleGenerate}
          onClose={() => setShowGenerateModal(false)}
        />
      )}

      {showFreestyle && (
        <FreestyleModal onClose={() => setShowFreestyle(false)} />
      )}

      {showWordDrop && (
        <WordDropModal onClose={() => setShowWordDrop(false)} />
      )}

      {showPunchlineWorkshop && (
        <PunchlineWorkshopModal onClose={() => setShowPunchlineWorkshop(false)} />
      )}

      {showStudyArtist && (
        <StudyArtistModal onClose={() => setShowStudyArtist(false)} />
      )}
    </div>
  )
}
