import React, { useState } from 'react'
import { GoogleGenerativeAI } from '../../utils/gemini-compat'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '')

const STYLE_GUIDE = `You are ghostwriting short-form Christian/faith creative content in a specific contemporary style: direct second-person address ("you," "if you're reading this"), urgent and personal framing, plainspoken and conversational rather than formal or liturgical, short punchy sentences mixed with one or two longer ones for rhythm, a confident but warm tone (never preachy or condescending), grounded in everyday struggles (temptation, doubt, comparison, burnout, relationships) rather than abstract theology, and often built around a single turn or reveal rather than a linear sermon structure. Avoid cliché church-flyer language ("God is good all the time," "let go and let God") unless deliberately reframing it. Avoid being saccharine. This is content for social video and captions, not a sermon manuscript.`

async function callAI(userPrompt, variantIndex, total) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const variantNote = total > 1
    ? `\n\nThis is variant ${variantIndex + 1} of ${total} — make it meaningfully different in angle or opening line from the others, not just reworded.`
    : ''
  const result = await model.generateContent(`${STYLE_GUIDE}\n\n${userPrompt}${variantNote}`)
  return result.response.text().trim()
}

function FieldLabel({ children }) {
  return (
    <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-1.5 mt-4 first:mt-0">
      {children}
    </div>
  )
}

function ChipGroup({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="px-3 py-1.5 rounded-full text-xs font-mono border transition-all"
          style={{
            borderColor: value === opt.value ? '#00e5ff' : '#252540',
            color: value === opt.value ? '#00e5ff' : '#666688',
            background: value === opt.value ? 'rgba(0,229,255,0.08)' : 'transparent',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function OutputCard({ text, variantNum, total }) {
  const [copied, setCopied] = useState(false)
  return (
    <div
      className="bg-studio-surface border border-studio-border rounded-xl p-4 mb-3"
      style={{ borderLeft: '3px solid #00e5ff' }}
    >
      {total > 1 && (
        <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-2">
          Variant {variantNum}
        </div>
      )}
      <div className="text-sm font-ui text-studio-text leading-7 whitespace-pre-wrap">{text}</div>
      <div className="mt-3">
        <button
          onClick={() => {
            navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="text-xs font-mono border border-studio-border text-studio-dim hover:border-studio-cyan hover:text-studio-cyan px-3 py-1 rounded-lg transition-colors"
        >
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
    </div>
  )
}

function GenerateButtons({ onSingle, onVariants, loading, status }) {
  return (
    <div className="flex items-center gap-3 mt-5">
      <button
        onClick={onSingle}
        disabled={loading}
        className="px-5 py-2.5 rounded-xl text-xs font-mono font-semibold text-black disabled:opacity-40 transition-all"
        style={{ background: 'linear-gradient(135deg,#00e5ff,#b44fff)' }}
      >
        {loading ? 'Writing...' : 'Write It'}
      </button>
      <button
        onClick={onVariants}
        disabled={loading}
        className="px-4 py-2.5 rounded-xl text-xs font-mono border border-studio-border text-studio-dim hover:border-studio-cyan hover:text-studio-cyan disabled:opacity-40 transition-colors"
      >
        3 Variants
      </button>
      {status && <span className="text-xs font-mono text-studio-cyan">{status}</span>}
    </div>
  )
}

function OutputSection({ outputs }) {
  if (outputs.length === 0) return (
    <div className="mt-5 pt-5 border-t border-studio-border text-xs font-mono text-studio-dim italic">
      Nothing written yet — fill in the fields above and hit "Write It".
    </div>
  )
  return (
    <div className="mt-5 pt-5 border-t border-studio-border">
      <div className="text-xs font-mono text-studio-dim uppercase tracking-widest mb-3">Output</div>
      {outputs.map((t, i) => <OutputCard key={i} text={t} variantNum={i + 1} total={outputs.length} />)}
    </div>
  )
}

// ─── PRAYER PANEL ──────────────────────────────────────────────────────────
const PRAYER_TONES = [
  { value: 'urgent-direct',   label: 'Urgent & Direct' },
  { value: 'gentle-comfort',  label: 'Gentle & Comforting' },
  { value: 'bold-warfare',    label: 'Bold / Spiritual Warfare' },
  { value: 'quiet-reflective',label: 'Quiet & Reflective' },
]
const PRAYER_LENGTHS = [
  { value: 'short',  label: 'Short (15-sec clip)' },
  { value: 'medium', label: 'Medium (30–45 sec)' },
  { value: 'long',   label: 'Long (full post)' },
]

function PrayerPanel({ onSaved }) {
  const [topic, setTopic] = useState('')
  const [tone, setTone] = useState('urgent-direct')
  const [length, setLength] = useState('medium')
  const [outputs, setOutputs] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  const buildPrompt = () => {
    const t = topic.trim() || 'a general prayer for strength this week'
    const toneMap = {
      'urgent-direct':    "urgent and direct, like you're stopping someone mid-scroll to tell them something they need to hear right now",
      'gentle-comfort':   'gentle and comforting, like sitting with someone in a hard moment',
      'bold-warfare':     "bold, framed as spiritual warfare — naming the enemy's tactics and declaring authority over them, but without being cheesy or over-the-top",
      'quiet-reflective': 'quiet and reflective, more meditative, slower pace',
    }
    const lengthMap = {
      short:  'Keep it to about 6-8 lines — a tight 15-second spoken clip.',
      medium: 'About 12-16 lines — a 30-45 second spoken prayer.',
      long:   'About 20-25 lines — a fuller post-length prayer.',
    }
    return {
      prompt: `Write a spoken-word style prayer about: ${t}\n\nTone: ${toneMap[tone]}\n${lengthMap[length]}\n\nWrite it as something meant to be spoken aloud to camera, addressed to God but clearly meant for a listener to feel personally called out/comforted by it. No verse/chapter citations needed unless it strengthens a line. Output ONLY the prayer text, no headers or explanation.`,
      topic: t,
    }
  }

  const run = async (count) => {
    const { prompt, topic } = buildPrompt()
    setLoading(true)
    setStatus(count > 1 ? 'writing 3 variants...' : 'writing...')
    try {
      const results = await Promise.all(Array.from({ length: count }, (_, i) => callAI(prompt, i, count)))
      setOutputs(results)
      onSaved('prayer', topic, results)
      setStatus('done')
      setTimeout(() => setStatus(''), 2000)
    } catch { setStatus('error') } finally { setLoading(false) }
  }

  return (
    <div>
      <FieldLabel>What's this prayer for? (topic, situation, or season)</FieldLabel>
      <textarea
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="e.g. starting a new week, breaking a bad habit, facing rejection, a friend going through loss..."
        rows={3}
        className="w-full bg-studio-void border border-studio-border rounded-xl px-4 py-3 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-cyan resize-none"
      />
      <FieldLabel>Tone</FieldLabel>
      <ChipGroup options={PRAYER_TONES} value={tone} onChange={setTone} />
      <FieldLabel>Length</FieldLabel>
      <ChipGroup options={PRAYER_LENGTHS} value={length} onChange={setLength} />
      <GenerateButtons onSingle={() => run(1)} onVariants={() => run(3)} loading={loading} status={status} />
      <OutputSection outputs={outputs} />
    </div>
  )
}

// ─── HOOK PANEL ────────────────────────────────────────────────────────────
function HookPanel({ onSaved }) {
  const [topic, setTopic] = useState('')
  const [style, setStyle] = useState('warning')
  const [platform, setPlatform] = useState('tiktok')
  const [outputs, setOutputs] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  const HOOK_STYLES = [
    { value: 'warning',          label: 'Warning ("if you\'re seeing this...")' },
    { value: 'callout',          label: 'Direct Callout ("you")' },
    { value: 'confession',       label: 'Personal Confession' },
    { value: 'scripture-twist',  label: 'Scripture Reframe' },
  ]
  const PLATFORMS = [
    { value: 'tiktok',        label: 'TikTok / Reels (fast cut)' },
    { value: 'youtube-short', label: 'YouTube Short' },
    { value: 'long-form',     label: 'Long-form intro' },
  ]

  const buildPrompt = () => {
    const t = topic.trim() || 'why you keep repeating the same mistake'
    const styleMap = {
      'warning':         'Open with a warning-style hook: "if you\'re seeing this..." or "this is for the one person who..." — creates urgency and makes the viewer feel personally singled out.',
      'callout':         'Open with a direct second-person callout that names a specific behavior or feeling the viewer is having right now, before they even know what the video is about.',
      'confession':      'Open with a personal, vulnerable confession that pulls the viewer in through relatability before pivoting to the lesson.',
      'scripture-twist': 'Open by referencing a common belief or verse and immediately reframing or subverting the expected interpretation.',
    }
    const platformMap = {
      'tiktok':        'Write for TikTok/Reels — needs to hook in the first 2 seconds, short punchy lines, one clear idea.',
      'youtube-short': 'Write for a YouTube Short — slightly more room to build before the turn, but still fast-paced.',
      'long-form':     'Write as the cold open to a longer video — can build a bit more before the turn.',
    }
    return {
      prompt: `Write a video hook/opening for a short-form faith content video about: ${t}\n\n${styleMap[style]}\n${platformMap[platform]}\n\nWrite 3-5 lines max — just the hook/opening, the part that would play before the video cuts to the main content. This needs to stop someone mid-scroll. Output ONLY the hook lines, no headers or explanation.`,
      topic: t,
    }
  }

  const run = async (count) => {
    const { prompt, topic } = buildPrompt()
    setLoading(true)
    setStatus(count > 1 ? 'writing 3 variants...' : 'writing...')
    try {
      const results = await Promise.all(Array.from({ length: count }, (_, i) => callAI(prompt, i, count)))
      setOutputs(results)
      onSaved('hook', topic, results)
      setStatus('done')
      setTimeout(() => setStatus(''), 2000)
    } catch { setStatus('error') } finally { setLoading(false) }
  }

  return (
    <div>
      <FieldLabel>What's the video about?</FieldLabel>
      <textarea
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="e.g. why you keep sabotaging your own blessings, a verse that changed how I see rejection..."
        rows={3}
        className="w-full bg-studio-void border border-studio-border rounded-xl px-4 py-3 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-cyan resize-none"
      />
      <FieldLabel>Hook Style</FieldLabel>
      <ChipGroup options={HOOK_STYLES} value={style} onChange={setStyle} />
      <FieldLabel>Platform</FieldLabel>
      <ChipGroup options={PLATFORMS} value={platform} onChange={setPlatform} />
      <GenerateButtons onSingle={() => run(1)} onVariants={() => run(3)} loading={loading} status={status} />
      <OutputSection outputs={outputs} />
    </div>
  )
}

// ─── CAPTION PANEL ─────────────────────────────────────────────────────────
const CAPTION_CTAS = [
  { value: 'none',    label: 'None' },
  { value: 'comment', label: 'Ask to comment' },
  { value: 'share',   label: 'Ask to share / tag' },
  { value: 'follow',  label: 'Invite to follow' },
]

function CaptionPanel({ onSaved }) {
  const [topic, setTopic] = useState('')
  const [cta, setCta] = useState('none')
  const [outputs, setOutputs] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  const buildPrompt = () => {
    const t = topic.trim() || 'a clip about staying faithful during a hard season'
    const ctaMap = {
      'none':    'No call-to-action needed — just let the caption stand on its own.',
      'comment': 'End with a natural, non-generic prompt inviting people to comment (avoid "comment AMEN below" cliché — make it specific to the topic).',
      'share':   'End with a natural prompt inviting people to share this with or tag someone who needs to see it.',
      'follow':  "End with a soft invite to follow or join a community, framed around the value they'll get, not a bare \"follow for more.\"",
    }
    return {
      prompt: `Write a social media caption to accompany a short faith content video about: ${t}\n\n${ctaMap[cta]}\n\nKeep it to 3-6 lines. Conversational, not preachy. This sits below a video, so it should add something (context, a personal note, a question) rather than just repeat the video's content. Output ONLY the caption text, no headers or explanation.`,
      topic: t,
    }
  }

  const run = async (count) => {
    const { prompt, topic } = buildPrompt()
    setLoading(true)
    setStatus(count > 1 ? 'writing 3 variants...' : 'writing...')
    try {
      const results = await Promise.all(Array.from({ length: count }, (_, i) => callAI(prompt, i, count)))
      setOutputs(results)
      onSaved('caption', topic, results)
      setStatus('done')
      setTimeout(() => setStatus(''), 2000)
    } catch { setStatus('error') } finally { setLoading(false) }
  }

  return (
    <div>
      <FieldLabel>What's the post about?</FieldLabel>
      <textarea
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="e.g. a testimony clip about getting sober, a worship moment, a lesson from a hard season..."
        rows={3}
        className="w-full bg-studio-void border border-studio-border rounded-xl px-4 py-3 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-cyan resize-none"
      />
      <FieldLabel>Include a call-to-action?</FieldLabel>
      <ChipGroup options={CAPTION_CTAS} value={cta} onChange={setCta} />
      <GenerateButtons onSingle={() => run(1)} onVariants={() => run(3)} loading={loading} status={status} />
      <OutputSection outputs={outputs} />
    </div>
  )
}

// ─── TESTIMONY PANEL ───────────────────────────────────────────────────────
const TESTIMONY_STRUCTURES = [
  { value: 'before-after', label: 'Before / Turning Point / After' },
  { value: 'letter',       label: 'Letter to Past Self' },
  { value: 'scene',        label: 'Cold-Open Scene' },
]

function TestimonyPanel({ onSaved }) {
  const [topic, setTopic] = useState('')
  const [structure, setStructure] = useState('before-after')
  const [outputs, setOutputs] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  const buildPrompt = () => {
    const t = topic.trim()
    const structureMap = {
      'before-after': "Structure it in three clear beats: what life looked like before, the specific turning point, and what's different now. Keep the transitions tight, not a slow build.",
      'letter':       'Write it as a short letter addressed to their past self at the lowest point, written from where they are now.',
      'scene':        'Open cold, dropped into a specific remembered moment (a scene, not a summary) before pulling back to explain the fuller story.',
    }
    const prompt = t
      ? `Using these rough facts from the person, write a testimony post/video script:\n\n"${t}"\n\n${structureMap[structure]}\n\nKeep it honest and specific rather than generic — use the actual details given, don't sand them down into vague platitudes. About 12-18 lines. Output ONLY the testimony text, no headers or explanation.`
      : `Write a short, generic testimony post about finding strength through a difficult season and coming out the other side with renewed faith. Keep specifics vague since none were provided. ${structureMap[structure]}`
    return { prompt, topic: t || 'general testimony (no details given)' }
  }

  const run = async (count) => {
    const { prompt, topic } = buildPrompt()
    setLoading(true)
    setStatus(count > 1 ? 'writing 3 variants...' : 'writing...')
    try {
      const results = await Promise.all(Array.from({ length: count }, (_, i) => callAI(prompt, i, count)))
      setOutputs(results)
      onSaved('testimony', topic, results)
      setStatus('done')
      setTimeout(() => setStatus(''), 2000)
    } catch { setStatus('error') } finally { setLoading(false) }
  }

  return (
    <div>
      <FieldLabel>What's the testimony about? (rough facts — AI will shape it)</FieldLabel>
      <textarea
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="e.g. struggled with addiction for 6 years, hit rock bottom, found faith through a friend, now 2 years clean..."
        rows={4}
        className="w-full bg-studio-void border border-studio-border rounded-xl px-4 py-3 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-cyan resize-none"
      />
      <FieldLabel>Structure</FieldLabel>
      <ChipGroup options={TESTIMONY_STRUCTURES} value={structure} onChange={setStructure} />
      <GenerateButtons onSingle={() => run(1)} onVariants={() => run(3)} loading={loading} status={status} />
      <OutputSection outputs={outputs} />
    </div>
  )
}

// ─── HISTORY PANEL ─────────────────────────────────────────────────────────
function HistoryPanel({ history, onRestore }) {
  if (history.length === 0) return (
    <div className="text-xs font-mono text-studio-dim italic py-4">
      Nothing generated yet this session.
    </div>
  )
  return (
    <div className="flex flex-col divide-y divide-studio-border">
      {history.map((entry, i) => (
        <button
          key={i}
          onClick={() => onRestore(entry)}
          className="flex items-center justify-between py-3 text-left text-xs font-mono text-studio-dim hover:text-studio-text transition-colors"
        >
          <span>
            <span className="text-studio-cyan mr-2">[{entry.type}]</span>
            {entry.topic.length > 60 ? entry.topic.slice(0, 60) + '…' : entry.topic}
          </span>
          <span className="text-studio-dim ml-4 shrink-0">{entry.time}</span>
        </button>
      ))}
    </div>
  )
}

// ─── SONG PANEL ────────────────────────────────────────────────────────────
const SONG_STYLES_GW = [
  {
    id: 'balanced',
    label: 'Balanced',
    icon: '◈',
    instruction: '',
  },
  {
    id: 'showcase',
    label: 'Lyrical Showcase',
    icon: '⬆',
    instruction: `SONG STYLE — LYRICAL SHOWCASE: Every verse must have multisyllabic rhyme matches (2–4 syllables), internal rhymes mid-bar on most lines, at least 3 punchlines per verse with true setup/payoff structure, and wordplay where phrases operate on two levels.`,
  },
  {
    id: 'gospel',
    label: 'Street Gospel',
    icon: '✝',
    instruction: `SONG STYLE — STREET GOSPEL: Every verse must contain specific biblical figures and stories (name Lazarus, Daniel, David, Joseph), contrast pairs (lost/found, bound/free, dead/alive), and at least one bar per verse where street reality and scripture collide in the same line.`,
  },
  {
    id: 'anthem',
    label: 'Motivational Anthem',
    icon: '🔥',
    instruction: `SONG STYLE — MOTIVATIONAL ANTHEM: The chorus must be immediately singable — short, powerful phrases that lock in on the first listen. Verses build real momentum bar by bar. Use declarative, empowering language. The bridge is the emotional peak. Think stadium energy.`,
  },
  {
    id: 'story',
    label: 'Storytelling',
    icon: '◎',
    instruction: `SONG STYLE — STORYTELLING: Verse 1 establishes the situation. Verse 2 deepens the conflict or transformation. Bridge is the emotional turning point. Outro resolves the arc. Use specific vivid details — name places, describe moments, show don't tell.`,
  },
  {
    id: 'punchlines',
    label: 'Punchline Heavy',
    icon: '🥊',
    instruction: `SONG STYLE — PUNCHLINE HEAVY: Every 2–3 bars = one setup and one payoff. Use misdirection, comparison punchlines, wordplay punchlines, and contrast punchlines. There should be no neutral bars — every line either builds tension or releases it.`,
  },
]

const SONG_MOODS_GW = [
  'motivational', 'hype', 'spiritual', 'emotional', 'reflective',
  'love', 'triumphant', 'melancholy', 'aggressive', 'grateful',
  'storytelling', 'heartbreak', 'gospel', 'dark', 'uplifting',
]

const SONG_RHYMES_GW = [
  { value: 'Mixed',        instruction: 'Use a mix of all rhyme types freely — end rhymes, internal rhymes, multisyllabic, slant, chain, and cross rhymes. Switch it up bar to bar.' },
  { value: 'Internal',     instruction: 'Load bars with internal rhymes — words within the middle of the line rhyme with each other AND with end words. Every bar should have at least one mid-bar rhyme.' },
  { value: 'Multisyllabic',instruction: 'Use multisyllabic rhymes — 2 to 4 syllables rhyming together at a time. Prioritize complex rhyme matches over simple ones.' },
  { value: 'Chain',        instruction: 'Lock onto a single rhyme sound and sustain it across 4 to 8 consecutive bars before switching. Creates relentless momentum.' },
  { value: 'AABB Couplet', instruction: 'Every pair of consecutive bars rhymes together. Line 1 rhymes with line 2, line 3 with line 4.' },
  { value: 'Slant / Near', instruction: 'Words that share similar sounds but don\'t perfectly rhyme. Gives a looser, conversational authenticity.' },
]

async function callSongAI(prompt) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const result = await model.generateContent(prompt)
  return result.response.text().trim()
}

function MultiChipGroup({ options, values, onChange }) {
  const toggle = (v) => onChange(values.includes(v) ? (values.length > 1 ? values.filter(x => x !== v) : values) : [...values, v])
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const active = values.includes(opt)
        return (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className="px-3 py-1.5 rounded-full text-xs font-mono border transition-all"
            style={{
              borderColor: active ? '#b44fff' : '#252540',
              color: active ? '#b44fff' : '#666688',
              background: active ? 'rgba(180,79,255,0.1)' : 'transparent',
            }}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function SongPanel({ onSaved }) {
  const [topic, setTopic] = useState('')
  const [styleId, setStyleId] = useState('balanced')
  const [moods, setMoods] = useState(['motivational'])
  const [rhymes, setRhymes] = useState(['Mixed'])
  const [outputs, setOutputs] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  const toggleMood = (m) => setMoods(prev => prev.includes(m) ? (prev.length > 1 ? prev.filter(x => x !== m) : prev) : [...prev, m])
  const toggleRhyme = (r) => setRhymes(prev => prev.includes(r) ? (prev.length > 1 ? prev.filter(x => x !== r) : prev) : [...prev, r])

  const buildPrompt = (seed) => {
    const t = topic.trim() || 'overcoming hard times through faith'
    const style = SONG_STYLES_GW.find(s => s.id === styleId)
    const styleNote = style?.instruction ? `\n${style.instruction}` : ''
    const rhymeNotes = SONG_RHYMES_GW.filter(r => rhymes.includes(r.value)).map(r => `- ${r.value}: ${r.instruction}`).join('\n')
    return {
      prompt: `[Generation ID: ${seed}] Write a BRAND NEW complete song about "${t}". Mood/energy: ${moods.join(', ')}.
This song must be completely original — fresh words, fresh bars, fresh imagery.
${styleNote}

RHYME SCHEME — apply all of the following:
${rhymeNotes}

FLOW INTELLIGENCE — every bar:
- Write as natural speech first — never twist a sentence to reach a rhyme
- Read each bar aloud mentally — if it sounds stiff, rewrite it
- Vary bar length and rhythm
- No throwaway lines

STRUCTURE — follow exactly:
[Verse 1] — 16 bars (16 lines)
[Pre-Chorus] — 4 bars
[Chorus] — 8 bars
[Verse 2] — 16 bars (16 lines)
[Bridge] — 8 bars
[Outro] — 4 bars

Every verse = exactly 16 lines. Count them.
Write the complete song now. Do not cut it short.`,
      topic: t,
    }
  }

  const run = async (count) => {
    setLoading(true)
    setStatus(count > 1 ? 'writing 3 variants...' : 'writing...')
    setOutputs([])
    try {
      const results = await Promise.all(
        Array.from({ length: count }, (_, i) => {
          const seed = Math.random().toString(36).slice(2, 8).toUpperCase()
          const { prompt } = buildPrompt(seed)
          return callSongAI(prompt)
        })
      )
      setOutputs(results)
      const { topic } = buildPrompt('_')
      onSaved('song', topic, results)
      setStatus('done')
      setTimeout(() => setStatus(''), 2000)
    } catch { setStatus('error') } finally { setLoading(false) }
  }

  const activeStyle = SONG_STYLES_GW.find(s => s.id === styleId)

  return (
    <div>
      <FieldLabel>What's the song about?</FieldLabel>
      <textarea
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="e.g. never giving up, faith through hard times, grinding to the top, a relationship that changed you..."
        rows={2}
        className="w-full bg-studio-void border border-studio-border rounded-xl px-4 py-3 text-sm font-ui text-studio-text placeholder-studio-dim focus:outline-none focus:border-studio-cyan resize-none"
      />

      <FieldLabel>Song Style</FieldLabel>
      <div className="grid grid-cols-3 gap-2">
        {SONG_STYLES_GW.map(s => (
          <button
            key={s.id}
            onClick={() => setStyleId(s.id)}
            className="flex flex-col gap-0.5 px-3 py-2 rounded-xl border text-left transition-all"
            style={{
              borderColor: styleId === s.id ? '#00e5ff' : '#252540',
              background: styleId === s.id ? 'rgba(0,229,255,0.08)' : 'transparent',
            }}
          >
            <span className="text-xs" style={{ color: styleId === s.id ? '#00e5ff' : '#444460' }}>{s.icon}</span>
            <span className="text-xs font-ui font-semibold" style={{ color: styleId === s.id ? '#00e5ff' : '#c0c0d0' }}>{s.label}</span>
          </button>
        ))}
      </div>

      <FieldLabel>Mood / Energy <span className="normal-case text-studio-dim">({moods.length} selected)</span></FieldLabel>
      <div className="flex flex-wrap gap-2">
        {SONG_MOODS_GW.map(m => {
          const active = moods.includes(m)
          return (
            <button
              key={m}
              onClick={() => toggleMood(m)}
              className="px-3 py-1 rounded-full text-xs font-mono border transition-all"
              style={{
                borderColor: active ? '#ff9500' : '#252540',
                color: active ? '#ff9500' : '#666688',
                background: active ? 'rgba(255,149,0,0.1)' : 'transparent',
              }}
            >
              {m}
            </button>
          )
        })}
      </div>

      <FieldLabel>Rhyme Type <span className="normal-case text-studio-dim">({rhymes.length} selected)</span></FieldLabel>
      <div className="flex flex-col gap-1.5">
        {SONG_RHYMES_GW.map(r => {
          const active = rhymes.includes(r.value)
          return (
            <button
              key={r.value}
              onClick={() => toggleRhyme(r.value)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all"
              style={{
                borderColor: active ? '#b44fff' : '#252540',
                background: active ? 'rgba(180,79,255,0.08)' : 'transparent',
              }}
            >
              <div className="w-3 h-3 rounded-full shrink-0 border-2 flex items-center justify-center" style={{ borderColor: active ? '#b44fff' : '#444460' }}>
                {active && <div className="w-1.5 h-1.5 rounded-full bg-studio-purple" />}
              </div>
              <span className="text-xs font-ui font-semibold" style={{ color: active ? '#b44fff' : '#c0c0d0' }}>{r.value}</span>
            </button>
          )
        })}
      </div>

      <GenerateButtons onSingle={() => run(1)} onVariants={() => run(3)} loading={loading} status={status} />
      <OutputSection outputs={outputs} />
    </div>
  )
}

// ─── MAIN VIEW ─────────────────────────────────────────────────────────────
const PANELS = [
  { id: 'song',      label: 'Song' },
  { id: 'prayer',    label: 'Prayer' },
  { id: 'hook',      label: 'Video Hook' },
  { id: 'caption',   label: 'Caption' },
  { id: 'testimony', label: 'Testimony' },
  { id: 'history',   label: 'History' },
]

export default function GhostwritingView() {
  const [active, setActive] = useState('prayer')
  const [history, setHistory] = useState([])
  const [restoredOutputs, setRestoredOutputs] = useState(null)

  const addToHistory = (type, topic, variants) => {
    setHistory(prev => [{ type, topic, variants, time: new Date().toLocaleTimeString() }, ...prev])
  }

  const restoreEntry = (entry) => {
    setRestoredOutputs(entry)
    setActive(entry.type)
  }

  return (
    <div className="flex h-full bg-studio-void">
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 bg-studio-panel border-b border-studio-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-studio-purple shadow-purple" />
            <span className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase">Ghostwriting Studio</span>
          </div>
          <div className="text-xs font-mono text-studio-dim">
            Faith &amp; Voice // Direct-address content
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-studio-border bg-studio-panel shrink-0">
          {PANELS.map(p => (
            <button
              key={p.id}
              onClick={() => { setActive(p.id); setRestoredOutputs(null) }}
              className="px-5 py-3 text-xs font-mono tracking-wide transition-colors relative"
              style={{
                color: active === p.id ? '#e0e0f0' : '#666688',
                fontWeight: active === p.id ? 700 : 400,
              }}
            >
              {p.label}
              {active === p.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-studio-purple" />
              )}
              {p.id === 'history' && history.length > 0 && (
                <span className="ml-1.5 text-studio-purple">{history.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl">
            {active === 'song' && (
              <SongPanel onSaved={addToHistory} />
            )}
            {active === 'prayer' && (
              <PrayerPanel onSaved={addToHistory} />
            )}
            {active === 'hook' && (
              <HookPanel onSaved={addToHistory} />
            )}
            {active === 'caption' && (
              <CaptionPanel onSaved={addToHistory} />
            )}
            {active === 'testimony' && (
              <TestimonyPanel onSaved={addToHistory} />
            )}
            {active === 'history' && (
              <HistoryPanel history={history} onRestore={restoreEntry} />
            )}

            {/* Restored entry from history */}
            {restoredOutputs && active !== 'history' && (
              <div className="mt-6 pt-6 border-t border-studio-border">
                <div className="text-xs font-mono text-studio-dim uppercase tracking-widest mb-3">
                  Restored from history
                </div>
                {restoredOutputs.variants.map((t, i) => (
                  <OutputCard key={i} text={t} variantNum={i + 1} total={restoredOutputs.variants.length} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-2 border-t border-studio-border bg-studio-panel shrink-0">
          <div className="text-xs font-mono text-studio-dim text-center">
            Calibrated for direct-address, faith-forward short-form content — prayers, hooks, testimony
          </div>
        </div>
      </div>
    </div>
  )
}
