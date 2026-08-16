import React, { useState, useRef, useCallback } from 'react'
import { getCtx } from '../../audio/audioEngine'

const ROOT_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const isBlack = (n) => [1,3,6,8,10].includes(n % 12)

const CHORD_DB = {
  'Major':         { ivs:[0,4,7],          sym:'',       names:['R','3','5'],        color:'#00e5ff' },
  'Minor':         { ivs:[0,3,7],          sym:'m',      names:['R','b3','5'],       color:'#b44fff' },
  'Major 7':       { ivs:[0,4,7,11],       sym:'maj7',   names:['R','3','5','7'],    color:'#00ff9d' },
  'Minor 7':       { ivs:[0,3,7,10],       sym:'m7',     names:['R','b3','5','b7'],  color:'#b44fff' },
  'Dom 7':         { ivs:[0,4,7,10],       sym:'7',      names:['R','3','5','b7'],   color:'#ff9500' },
  'Major 9':       { ivs:[0,4,7,11,14],    sym:'maj9',   names:['R','3','5','7','9'],color:'#00ff9d' },
  'Minor 9':       { ivs:[0,3,7,10,14],    sym:'m9',     names:['R','b3','5','b7','9'],color:'#b44fff' },
  'Dom 9':         { ivs:[0,4,7,10,14],    sym:'9',      names:['R','3','5','b7','9'],color:'#ff9500' },
  'Diminished':    { ivs:[0,3,6],          sym:'dim',    names:['R','b3','b5'],      color:'#ff2d55' },
  'Dim 7':         { ivs:[0,3,6,9],        sym:'dim7',   names:['R','b3','b5','bb7'],color:'#ff2d55' },
  'Half Dim':      { ivs:[0,3,6,10],       sym:'ø7',     names:['R','b3','b5','b7'], color:'#ff2d55' },
  'Augmented':     { ivs:[0,4,8],          sym:'aug',    names:['R','3','#5'],       color:'#ffe600' },
  'Sus2':          { ivs:[0,2,7],          sym:'sus2',   names:['R','2','5'],        color:'#888' },
  'Sus4':          { ivs:[0,5,7],          sym:'sus4',   names:['R','4','5'],        color:'#888' },
  'Add 9':         { ivs:[0,4,7,14],       sym:'add9',   names:['R','3','5','9'],    color:'#00e5ff' },
  '6':             { ivs:[0,4,7,9],        sym:'6',      names:['R','3','5','6'],    color:'#ffe600' },
  'Minor 6':       { ivs:[0,3,7,9],        sym:'m6',     names:['R','b3','5','6'],   color:'#b44fff' },
  'Dom 11':        { ivs:[0,4,7,10,14,17], sym:'11',     names:['R','3','5','b7','9','11'],color:'#ff9500' },
  'Major 11':      { ivs:[0,4,7,11,14,17], sym:'maj11',  names:['R','3','5','7','9','11'],color:'#00ff9d' },
  'Dom 13':        { ivs:[0,4,7,10,14,17,21],sym:'13',   names:['R','3','5','b7','9','11','13'],color:'#ff9500' },
}

// Compute inversions: rotate intervals so each becomes the bass note
function getInversions(ivs) {
  const result = [ivs.map(i => i)] // root position
  for (let n = 1; n < Math.min(ivs.length, 4); n++) {
    const inv = [...ivs.slice(n), ...ivs.slice(0, n).map(i => i + 12)]
    const base = inv[0]
    result.push(inv.map(i => i - base))
  }
  return result
}

const INV_LABELS = ['Root', '1st', '2nd', '3rd']

function playChord(ivs, root, octave = 4, type = 'triangle') {
  const ctx = getCtx()
  ivs.forEach((iv, idx) => {
    const midi = octave * 12 + root + iv
    const freq = 440 * Math.pow(2, (midi - 69) / 12)
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.connect(env); env.connect(ctx.destination)
    osc.type = type
    osc.frequency.value = freq
    const t = ctx.currentTime + idx * 0.03 // slight arpeggiate
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.18, t + 0.02)
    env.gain.setValueAtTime(0.15, t + 0.6)
    env.gain.exponentialRampToValueAtTime(0.001, t + 1.8)
    osc.start(t); osc.stop(t + 1.85)
  })
}

function MiniKeyboard({ root, ivs, highlightColor }) {
  // 2 octaves of keys starting at C below root
  const startNote = Math.floor(root / 12) * 12  // C of root's octave
  const keys = Array.from({ length: 25 }, (_, i) => startNote + i) // 25 keys = 2 oct + 1
  const activeNotes = new Set(ivs.map(iv => (root + iv) % 12))

  const whites = keys.filter(k => !isBlack(k))
  const W = 22, H = 60

  return (
    <div className="relative select-none" style={{ width: whites.length * W, height: H }}>
      {/* White keys */}
      {whites.map((k, i) => {
        const active = activeNotes.has(k % 12)
        return (
          <div key={k} className="absolute top-0 border border-black/30 rounded-b"
            style={{
              left: i * W, width: W - 1, height: H,
              background: active ? highlightColor + 'cc' : '#e8e8f0',
              boxShadow: active ? `0 0 8px ${highlightColor}` : 'none',
              zIndex: 1,
            }} />
        )
      })}
      {/* Black keys */}
      {keys.filter(k => isBlack(k)).map((k) => {
        const whitesBefore = whites.filter(w => w < k).length
        const active = activeNotes.has(k % 12)
        return (
          <div key={k} className="absolute top-0 rounded-b"
            style={{
              left: whitesBefore * W - 7, width: 14, height: H * 0.6,
              background: active ? highlightColor : '#1a1a2e',
              boxShadow: active ? `0 0 8px ${highlightColor}` : 'none',
              zIndex: 2,
            }} />
        )
      })}
    </div>
  )
}

export default function ChordDictionaryView() {
  const [root,     setRoot]     = useState(0)
  const [chordKey, setChordKey] = useState('Major')
  const [invIdx,   setInvIdx]   = useState(0)
  const [octave,   setOctave]   = useState(4)
  const [oscType,  setOscType]  = useState('triangle')

  const chord = CHORD_DB[chordKey]
  const inversions = getInversions(chord.ivs)
  const currentIvs = inversions[Math.min(invIdx, inversions.length - 1)]
  const noteNames = currentIvs.map(iv => ROOT_NAMES[(root + iv) % 12])

  const handlePlay = () => playChord(currentIvs, root, octave, oscType)

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#080810' }}>

      {/* ── Left: selector panel ── */}
      <div className="flex flex-col gap-4 p-5 border-r border-studio-border shrink-0 overflow-y-auto" style={{ width: 240 }}>
        <span className="font-display text-xs tracking-widest uppercase"
          style={{ background: `linear-gradient(90deg,${chord.color},#b44fff)`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Chord Dictionary
        </span>

        {/* Root note */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Root Note</div>
          <div className="grid grid-cols-6 gap-1">
            {ROOT_NAMES.map((n, i) => (
              <button key={i} onClick={() => setRoot(i)}
                className="py-1 rounded text-xs font-mono font-bold transition-all"
                style={{
                  background: root === i ? chord.color + '33' : '#ffffff08',
                  border: `1px solid ${root === i ? chord.color : '#2a2a3e'}`,
                  color: root === i ? chord.color : '#666',
                }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Chord type */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Chord Type</div>
          <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
            {Object.entries(CHORD_DB).map(([name, c]) => (
              <button key={name} onClick={() => { setChordKey(name); setInvIdx(0) }}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono transition-all text-left"
                style={{
                  background: chordKey === name ? c.color + '22' : 'transparent',
                  border: `1px solid ${chordKey === name ? c.color + '66' : 'transparent'}`,
                  color: chordKey === name ? c.color : '#666',
                }}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.color }} />
                <span>{name}</span>
                <span className="ml-auto font-bold" style={{ color: c.color + '88', fontSize: 9 }}>{ROOT_NAMES[root]}{c.sym}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Playback options */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Sound</div>
          <div className="flex gap-1 flex-wrap">
            {['triangle','sine','sawtooth','square'].map(t => (
              <button key={t} onClick={() => setOscType(t)}
                className="px-2 py-0.5 rounded text-xs font-mono transition-all"
                style={{
                  background: oscType === t ? chord.color + '22' : '#ffffff08',
                  border: `1px solid ${oscType === t ? chord.color : '#2a2a3e'}`,
                  color: oscType === t ? chord.color : '#555',
                }}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="font-mono text-xs text-studio-dim">Oct</span>
            <button onClick={() => setOctave(v => Math.max(2, v-1))} className="w-5 h-5 rounded bg-studio-surface border border-studio-border text-xs text-studio-dim">−</button>
            <span className="font-mono text-xs" style={{ color: chord.color }}>{octave}</span>
            <button onClick={() => setOctave(v => Math.min(6, v+1))} className="w-5 h-5 rounded bg-studio-surface border border-studio-border text-xs text-studio-dim">+</button>
          </div>
        </div>
      </div>

      {/* ── Right: chord display ── */}
      <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">

        {/* Chord name hero */}
        <div className="flex items-end gap-4">
          <div>
            <div className="font-display font-bold" style={{ fontSize: 48, color: chord.color, lineHeight: 1 }}>
              {ROOT_NAMES[root]}<span style={{ fontSize: 28 }}>{chord.sym}</span>
            </div>
            <div className="font-mono text-sm mt-1" style={{ color: '#445' }}>{chordKey}</div>
          </div>
          <button onClick={handlePlay}
            className="ml-auto mb-2 flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono font-bold text-sm transition-all"
            style={{ background: chord.color + '22', border: `1.5px solid ${chord.color}`, color: chord.color }}
            onMouseEnter={e => e.currentTarget.style.background = chord.color + '44'}
            onMouseLeave={e => e.currentTarget.style.background = chord.color + '22'}>
            ▶ Play
          </button>
        </div>

        {/* Mini keyboard */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-3 uppercase tracking-wider">Keyboard</div>
          <MiniKeyboard root={root} ivs={currentIvs} highlightColor={chord.color} />
        </div>

        {/* Notes row */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Notes</div>
          <div className="flex gap-2 flex-wrap">
            {noteNames.map((n, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-sm"
                  style={{ background: chord.color + '22', border: `1.5px solid ${chord.color}55`, color: chord.color }}>
                  {n}
                </div>
                <span className="font-mono" style={{ fontSize: 9, color: '#445' }}>{chord.names[i % chord.names.length]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Inversions */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Inversions</div>
          <div className="flex gap-2">
            {inversions.map((inv, i) => (
              <button key={i} onClick={() => { setInvIdx(i); playChord(inv, root, octave, oscType) }}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all"
                style={{
                  background: invIdx === i ? chord.color + '22' : '#0d0d1e',
                  border: `1px solid ${invIdx === i ? chord.color : '#1a1a2e'}`,
                }}>
                <span className="font-mono font-bold text-xs" style={{ color: invIdx === i ? chord.color : '#555' }}>
                  {INV_LABELS[i]}
                </span>
                <span className="font-mono" style={{ fontSize: 9, color: '#444' }}>
                  {inv.map(v => ROOT_NAMES[(root + v) % 12]).join('–')}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Intervals */}
        <div style={{ background: '#0a0a1a', border: '1px solid #1a1a2e', borderRadius: 10, padding: 16 }}>
          <div className="font-mono text-xs text-studio-dim mb-3 uppercase tracking-wider">Intervals</div>
          <div className="flex gap-3 flex-wrap">
            {chord.ivs.map((iv, i) => {
              const intervalNames = ['Unison','m2','M2','m3','M3','P4','Tritone','P5','m6','M6','m7','M7','Octave','m9','M9']
              return (
                <div key={i} className="font-mono text-xs" style={{ color: '#445' }}>
                  <span style={{ color: chord.color, fontWeight: 'bold' }}>{chord.names[i]}</span>
                  <span className="ml-1">{intervalNames[iv % 12] || `+${iv}`}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Related chords */}
        <div>
          <div className="font-mono text-xs text-studio-dim mb-2 uppercase tracking-wider">Related Chords</div>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: `${ROOT_NAMES[root]}${CHORD_DB['Major'].sym}`, key:'Major' },
              { label: `${ROOT_NAMES[root]}${CHORD_DB['Minor'].sym}`, key:'Minor' },
              { label: `${ROOT_NAMES[(root+4)%12]}${CHORD_DB['Minor'].sym}`, key:'Minor' },
              { label: `${ROOT_NAMES[(root+7)%12]}${CHORD_DB['Major'].sym}`, key:'Major' },
              { label: `${ROOT_NAMES[(root+5)%12]}${CHORD_DB['Major'].sym}`, key:'Major' },
              { label: `${ROOT_NAMES[(root+9)%12]}${CHORD_DB['Minor'].sym}`, key:'Minor' },
            ].filter(r => r.label !== `${ROOT_NAMES[root]}${chord.sym}`).slice(0, 5).map((r, i) => (
              <button key={i}
                onClick={() => { setChordKey(r.key); setInvIdx(0); playChord(CHORD_DB[r.key].ivs, root, octave, oscType) }}
                className="px-3 py-1.5 rounded-lg font-mono text-xs transition-all"
                style={{ background:'#0d0d1e', border:'1px solid #1a1a2e', color:'#556' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = chord.color + '66'; e.currentTarget.style.color = chord.color }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a1a2e'; e.currentTarget.style.color = '#556' }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
