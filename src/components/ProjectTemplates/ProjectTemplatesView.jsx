import React, { useState } from 'react'
import { useStudioStore } from '../../store/useStudioStore'

const TEMPLATES = [
  {
    id: 'hiphop',
    name: 'Hip-Hop',
    bpm: 90,
    accent: '#b44fff',
    emoji: '🎤',
    description: 'Classic boom-bap with 808s and sample chops. Perfect for storytelling and bars.',
    tracks: [
      { name: 'Vocal',      type: 'audio', color: '#b44fff', volume: 0.8  },
      { name: '808 Bass',   type: 'midi',  color: '#00ff9d', volume: 0.9  },
      { name: 'Kick/Snare', type: 'midi',  color: '#00e5ff', volume: 0.85 },
      { name: 'Sample',     type: 'audio', color: '#ff9500', volume: 0.75 },
      { name: 'Hi-Hats',   type: 'midi',  color: '#ffe600', volume: 0.6  },
    ],
  },
  {
    id: 'trap',
    name: 'Trap',
    bpm: 140,
    accent: '#ff2d55',
    emoji: '🔥',
    description: 'Hard-hitting 808s, rolling hi-hats, and dark atmospheric melodies.',
    tracks: [
      { name: 'Vocal',   type: 'audio', color: '#b44fff', volume: 0.8  },
      { name: '808',     type: 'midi',  color: '#00ff9d', volume: 0.95 },
      { name: 'Drums',   type: 'midi',  color: '#00e5ff', volume: 0.9  },
      { name: 'Melody',  type: 'midi',  color: '#ff2d55', volume: 0.7  },
      { name: 'FX',      type: 'audio', color: '#ff9500', volume: 0.5  },
    ],
  },
  {
    id: 'rnb',
    name: 'R&B',
    bpm: 80,
    accent: '#ff9500',
    emoji: '🎷',
    description: 'Smooth grooves, lush chord progressions, and soulful layered vocals.',
    tracks: [
      { name: 'Lead Vocal', type: 'audio', color: '#b44fff', volume: 0.85 },
      { name: 'Harmonies',  type: 'audio', color: '#ff2d55', volume: 0.6  },
      { name: 'Keys/Piano', type: 'midi',  color: '#ffe600', volume: 0.75 },
      { name: 'Bass',       type: 'audio', color: '#00ff9d', volume: 0.8  },
      { name: 'Drums',      type: 'midi',  color: '#00e5ff', volume: 0.8  },
    ],
  },
  {
    id: 'lofi',
    name: 'Lo-Fi',
    bpm: 75,
    accent: '#ffe600',
    emoji: '☕',
    description: 'Chill, nostalgic vibes with vinyl warmth. Great for study beats and relaxing.',
    tracks: [
      { name: 'Vinyl Sample', type: 'audio', color: '#ff9500', volume: 0.8  },
      { name: 'Piano',        type: 'midi',  color: '#ffe600', volume: 0.75 },
      { name: 'Bass',         type: 'audio', color: '#00ff9d', volume: 0.7  },
      { name: 'Drums',        type: 'midi',  color: '#00e5ff', volume: 0.65 },
      { name: 'Atmosphere',   type: 'audio', color: '#b44fff', volume: 0.4  },
    ],
  },
  {
    id: 'pop',
    name: 'Pop',
    bpm: 120,
    accent: '#00e5ff',
    emoji: '⭐',
    description: 'Radio-ready energy with punchy drums, catchy synth hooks, and full harmonies.',
    tracks: [
      { name: 'Lead Vocal', type: 'audio', color: '#b44fff', volume: 0.85 },
      { name: 'Harmony',    type: 'audio', color: '#ff2d55', volume: 0.55 },
      { name: 'Synth Lead', type: 'midi',  color: '#00e5ff', volume: 0.7  },
      { name: 'Bass',       type: 'audio', color: '#00ff9d', volume: 0.8  },
      { name: 'Drums',      type: 'midi',  color: '#ffe600', volume: 0.85 },
    ],
  },
  {
    id: 'house',
    name: 'House',
    bpm: 128,
    accent: '#00ff9d',
    emoji: '🎛️',
    description: 'Four-on-the-floor kick, deep bass, lush synth pads, and vocal chops.',
    tracks: [
      { name: 'Kick',       type: 'midi',  color: '#00e5ff', volume: 0.9  },
      { name: 'Bass',       type: 'midi',  color: '#00ff9d', volume: 0.85 },
      { name: 'Synth',      type: 'midi',  color: '#b44fff', volume: 0.7  },
      { name: 'Pad',        type: 'midi',  color: '#ff9500', volume: 0.55 },
      { name: 'Vocal Chop', type: 'audio', color: '#ff2d55', volume: 0.65 },
    ],
  },
]

export default function ProjectTemplatesView() {
  const { setBpm, setPRNotes } = useStudioStore()
  const [applied, setApplied]           = useState(null)
  const [confirmTemplate, setConfirmTemplate] = useState(null)

  const applyTemplate = (tmpl) => {
    setBpm(tmpl.bpm)
    useStudioStore.setState({
      tracks: tmpl.tracks.map((t, i) => ({
        id: i + 1,
        name: t.name,
        type: t.type,
        color: t.color,
        muted: false,
        solo: false,
        volume: t.volume,
        clips: [],
      })),
      nextTrackId: tmpl.tracks.length + 1,
    })
    setPRNotes([])
    setApplied(tmpl.name)
    setConfirmTemplate(null)
    setTimeout(() => setApplied(null), 4000)
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#080810' }}>

      {/* Header */}
      <div style={{ background: '#0a0a1a', borderBottom: '1px solid #1a1a2e', padding: '20px 24px' }}>
        <div
          className="font-display text-sm tracking-widest uppercase mb-2"
          style={{ background: 'linear-gradient(90deg,#00e5ff,#b44fff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >
          Project Templates
        </div>
        <p className="font-mono text-xs" style={{ color: '#556', lineHeight: 1.7 }}>
          Choose a genre to instantly configure your BPM and track layout. Each template replaces
          your current tracks with a genre-specific setup so you can start creating immediately.
          <span className="ml-1" style={{ color: '#ff9500' }}>Save your project before loading a template.</span>
        </p>
      </div>

      {/* Template grid */}
      <div className="p-6 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
        {TEMPLATES.map((tmpl) => (
          <div
            key={tmpl.id}
            onClick={() => setConfirmTemplate(tmpl)}
            style={{
              background: '#0d0d1e',
              border: `1px solid ${tmpl.accent}33`,
              borderRadius: 12,
              padding: 20,
              cursor: 'pointer',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = tmpl.accent + '88'
              e.currentTarget.style.boxShadow   = `0 0 24px ${tmpl.accent}18`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = tmpl.accent + '33'
              e.currentTarget.style.boxShadow   = 'none'
            }}
          >
            {/* Title row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 20 }}>{tmpl.emoji}</span>
                <span className="font-display text-base font-bold" style={{ color: tmpl.accent }}>{tmpl.name}</span>
              </div>
              <span
                className="font-mono text-xs px-2 py-0.5 rounded"
                style={{ background: tmpl.accent + '1a', color: tmpl.accent, border: `1px solid ${tmpl.accent}44` }}
              >
                {tmpl.bpm} BPM
              </span>
            </div>

            {/* Description */}
            <p className="font-mono text-xs mb-4" style={{ color: '#556', lineHeight: 1.6 }}>{tmpl.description}</p>

            {/* Track list */}
            <div className="flex flex-col gap-1.5">
              {tmpl.tracks.map((track, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: track.color, boxShadow: `0 0 5px ${track.color}` }}
                  />
                  <span className="font-mono text-xs" style={{ color: '#ccc' }}>{track.name}</span>
                  <span className="font-mono ml-auto" style={{ fontSize: 9, color: '#444', textTransform: 'uppercase' }}>
                    {track.type}
                  </span>
                </div>
              ))}
            </div>

            {/* Load hint */}
            <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${tmpl.accent}22` }}>
              <span className="font-mono text-xs" style={{ color: tmpl.accent + '88' }}>Click to load →</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tip box */}
      <div className="mx-6 mb-6 p-4 rounded-xl font-mono text-xs" style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', color: '#445', lineHeight: 1.8 }}>
        <span style={{ color: '#00e5ff' }}>Tip:</span> After loading a template, switch to <span style={{ color: '#ffe600' }}>Arrange</span> to see your tracks,
        open <span style={{ color: '#b44fff' }}>Piano Roll</span> to write melodies, and use <span style={{ color: '#ff9500' }}>Beat Maker</span> to program your drums.
        Each track's color is consistent across Arrange, Mixer, and Piano Roll.
      </div>

      {/* Confirm modal */}
      {confirmTemplate && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setConfirmTemplate(null)}
        >
          <div
            className="rounded-2xl p-8 w-96"
            style={{ background: '#0d0d1e', border: `2px solid ${confirmTemplate.accent}55`, boxShadow: `0 0 60px ${confirmTemplate.accent}22` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-2">
              <span style={{ fontSize: 28 }}>{confirmTemplate.emoji}</span>
              <div>
                <div className="font-display text-base font-bold" style={{ color: confirmTemplate.accent }}>
                  Load {confirmTemplate.name} Template?
                </div>
                <div className="font-mono text-xs" style={{ color: '#444' }}>{confirmTemplate.bpm} BPM · {confirmTemplate.tracks.length} tracks</div>
              </div>
            </div>

            <p className="font-mono text-xs mt-4 mb-6" style={{ color: '#556', lineHeight: 1.7 }}>
              Your current tracks will be replaced with the {confirmTemplate.name} layout.
              Piano Roll notes will also be cleared. Make sure you've saved anything you want to keep.
            </p>

            {/* Track preview */}
            <div className="flex flex-col gap-1.5 mb-6 p-3 rounded-lg" style={{ background: '#07071a' }}>
              {confirmTemplate.tracks.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
                  <span className="font-mono text-xs" style={{ color: '#aaa' }}>{t.name}</span>
                  <span className="font-mono ml-auto" style={{ fontSize: 9, color: '#444' }}>{t.type}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => applyTemplate(confirmTemplate)}
                className="flex-1 py-2.5 rounded-xl text-sm font-mono font-bold transition-all"
                style={{
                  background: confirmTemplate.accent + '22',
                  border: `1px solid ${confirmTemplate.accent}`,
                  color: confirmTemplate.accent,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = confirmTemplate.accent + '33' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = confirmTemplate.accent + '22' }}
              >
                Load Template
              </button>
              <button
                onClick={() => setConfirmTemplate(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-mono transition-all"
                style={{ background: '#ffffff08', border: '1px solid #333', color: '#666' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {applied && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl font-mono text-sm font-bold z-50 whitespace-nowrap"
          style={{
            background: '#0d0d1e',
            border: '1px solid #00ff9d55',
            color: '#00ff9d',
            boxShadow: '0 0 30px #00ff9d18',
          }}
        >
          ✓ {applied} template loaded — switch to Arrange to start building!
        </div>
      )}
    </div>
  )
}
