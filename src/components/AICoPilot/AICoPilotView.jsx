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
Structure every verse as a series of knockout punches. Every 2–3 bars = one setup and one payoff. Use misdirection (lead the listener one way, snap the other), comparison punchlines (similes that stop you cold), wordplay punchlines (a phrase that flips meaning), and contrast punchlines (opposites that illuminate each other). There should be no neutral bars — every line either builds tension or releases it. The listener must be rewinding constantly.`,
  },
]

function GenerateSongModal({ onGenerate, onClose }) {
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
    onGenerate(topic.trim(), moods.join(', '), artistId, customArtist, rhymeTypes, songStyle, lookedUpInstruction)
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
    desc: 'Biblical wordplay, contrast pairs, spiritual punchlines',
    instruction: `MIKE MALAGIES STYLE — apply every technique:
1. WORDPLAY: Phrases that carry a second meaning. "Life gets hard but I'ma go harder" — hard = difficulty AND effort. Build 2–3 per verse.
2. DOUBLE MEANINGS: Everyday phrases with a spiritual flip. "I got rest and peace" = relaxation AND rest in peace, redeemed.
3. POP CULTURE REFERENCES: Find the sports/movie/brand parallel to the spiritual truth. Kobe, Michael Jordan, Mufasa, Tesla.
4. BIBLICAL REFERENCES: Name specific figures and stories directly — Lazarus, Daniel, armor of God, the narrow road, Father/Son/Holy Spirit.
5. INTERNAL RHYMES: Rhyme sounds mid-bar, not just at the end. "Confess and repent and believe" — every bar loaded with hidden rhyme.
6. REPETITION/HOOKS: Short anchor phrase repeated with conviction. "I'ma go harder" / "Don't worry, just worship."
7. CONTRAST PAIRS: Opposites side by side — lost/found · blind/see · bound/free · empty/filled · dead/alive.
8. PUNCHLINES: Set up in bar 1, payoff lands in bar 2. Make the listener stop and replay.
9. EXTENDED THEME: Every bar connects to the central idea — go deeper on it, don't restate it.
10. MULTISYLLABIC RHYMES: 2–4 syllable matches. "handle me / hand on me" — "stand for God / stands with me."`,
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

  const handleGenerate = async (topic, mood, artistId, customArtist, rhymeTypeLabels, songStyleId = 'balanced', lookedUpInstruction = null) => {
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

    const seed = Math.random().toString(36).slice(2, 8).toUpperCase()

    const prompt = `[Generation ID: ${seed}] Write a BRAND NEW complete song about "${topic}". Mood/energy: ${mood}.
This song must be completely original — fresh words, fresh bars, fresh imagery.
${songStyleNote}

${flowNote}

${rhymeNote}

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
    const userLabel = `✦ Generate song — "${topic}" · ${mood} · ${selectedSongStyle.label}${artistLabel ? ` · ${artistLabel} style` : ''} · ${rhymeTypeLabels.join(', ')}`
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
    </div>
  )
}
