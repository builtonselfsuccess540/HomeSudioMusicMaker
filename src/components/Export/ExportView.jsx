import React, { useState, useCallback } from 'react'
import { useStudioStore } from '../../store/useStudioStore'
import { getCtx, bufferToWavBlob, bufferToMp3Blob } from '../../audio/audioEngine'

// ── Mix bounce engine ──────────────────────────────────────────────────────

async function bounceMix({ tracks, mixerChannels, bpm, onProgress }) {
  const beatsPerSec = bpm / 60
  const c = getCtx()

  // Collect clips that have audio URLs (skip MIDI-only tracks and muted tracks)
  const items = []
  for (const track of tracks) {
    if (track.muted) continue
    const ch = mixerChannels.find((m) => m.trackId === track.id)
    const vol  = ch?.muted ? 0 : (ch ? ch.volume / 100 : 0.8)
    const pan  = ch ? (ch.pan / 100) : 0
    for (const clip of track.clips) {
      if (!clip.url) continue
      items.push({ clip, vol, pan, name: clip.name, trackName: track.name, color: track.color })
    }
  }

  if (items.length === 0)
    throw new Error('No audio clips found on non-muted tracks. Add recordings or samples to Arrange first.')

  // Determine total render length
  let totalSecs = 2
  for (const { clip } of items) {
    const end = (clip.start + clip.length) / beatsPerSec
    if (end > totalSecs) totalSecs = end
  }
  totalSecs += 2 // 2s tail for reverb/release

  const SR = 44100
  const offline = new OfflineAudioContext(2, Math.ceil(totalSecs * SR), SR)

  let ok = 0, skipped = 0
  for (let i = 0; i < items.length; i++) {
    const { clip, vol, pan } = items[i]
    onProgress?.(`Decoding ${i + 1}/${items.length}: ${clip.name}`)
    try {
      const res = await fetch(clip.url)
      const ab  = await res.arrayBuffer()
      // Decode using the live AudioContext (compatible with all Chromium builds)
      const buf = await new Promise((resolve, reject) =>
        c.decodeAudioData(ab.slice(0), resolve, reject)
      )

      const src  = offline.createBufferSource()
      src.buffer = buf

      const gain = offline.createGain()
      gain.gain.value = Math.max(0, Math.min(1.5, vol))

      const panner = offline.createStereoPanner()
      panner.pan.value = Math.max(-1, Math.min(1, pan))

      src.connect(gain)
      gain.connect(panner)
      panner.connect(offline.destination)
      src.start(Math.max(0, clip.start / beatsPerSec))
      ok++
    } catch (e) {
      skipped++
      console.warn(`Skipped "${clip.name}": ${e.message}`)
    }
  }

  if (ok === 0)
    throw new Error(`All ${items.length} clips failed to decode — they may have been revoked. Re-import your samples.`)

  onProgress?.(`Rendering mix (${ok} clip${ok !== 1 ? 's' : ''}${skipped ? `, ${skipped} skipped` : ''})…`)
  return offline.startRendering()
}

// ── Local project snapshot system ─────────────────────────────────────────

const SNAP_KEY  = 'hsmm_project_snapshots'
const MAX_SNAPS = 20

// All localStorage keys owned by the app
const ALL_STORE_KEYS = [
  'hsmm_mixer', 'hsmm_arrangement', 'hsmm_automation',
  'hsmm_patterns', 'hsmm_song_patterns', 'hsmm_piano_roll',
  'hsmm_lyrics_draft', 'hsmm_saved_songs', 'hsmm_ai_songs',
  'hsmm_style_profile', 'hsmm_folders', 'hsmm_streak',
  'hs-beats', 'hs-chords', 'hs-lyrics', 'hs-mixer',
  'hs-patterns', 'hs-instruments', 'hs-effects',
  'hs-busroute', 'hs-arpeggio',
]

function readSnapshots() {
  try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '[]') } catch { return [] }
}

function takeSnapshot(label) {
  const data = {}
  ALL_STORE_KEYS.forEach((k) => {
    const v = localStorage.getItem(k)
    if (v !== null) data[k] = v
  })
  const snap = {
    id: Date.now(),
    label: label || `Snapshot — ${new Date().toLocaleString()}`,
    savedAt: new Date().toISOString(),
    keyCount: Object.keys(data).length,
    data,
  }
  const list = [snap, ...readSnapshots()].slice(0, MAX_SNAPS)
  localStorage.setItem(SNAP_KEY, JSON.stringify(list))
  return snap
}

function applySnapshot(snap) {
  if (!snap?.data) return 0
  let n = 0
  Object.entries(snap.data).forEach(([k, v]) => {
    try { localStorage.setItem(k, v); n++ } catch {}
  })
  return n
}

function removeSnapshot(id) {
  const list = readSnapshots().filter((s) => s.id !== id)
  localStorage.setItem(SNAP_KEY, JSON.stringify(list))
}

// ── Stat pill ─────────────────────────────────────────────────────────────

function Pill({ label, value, color = '#00e5ff' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 14px', background: '#ffffff06', borderRadius: 8, border: `1px solid ${color}22`, minWidth: 80 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'monospace' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ExportView() {
  const { tracks, mixerChannels, bpm, currentSongName } = useStudioStore()

  const [bouncing,   setBouncing]   = useState(false)
  const [exporting,  setExporting]  = useState(false)
  const [progress,   setProgress]   = useState('')
  const [rendered,   setRendered]   = useState(null) // AudioBuffer | null
  const [error,      setError]      = useState('')
  const [format,     setFormat]     = useState('both')
  const [mp3Kbps,    setMp3Kbps]   = useState(192)
  const [snapshots,  setSnapshots]  = useState(readSnapshots)
  const [snapLabel,  setSnapLabel]  = useState('')
  const [snapMsg,    setSnapMsg]    = useState('')

  const audioTracks  = tracks.filter((t) => !t.muted && t.clips.some((c) => c.url))
  const clipCount    = audioTracks.reduce((n, t) => n + t.clips.filter((c) => c.url).length, 0)
  const totalBeats   = tracks.reduce((n, t) => {
    const end = t.clips.reduce((m, c) => Math.max(m, c.start + c.length), 0)
    return Math.max(n, end)
  }, 0)
  const totalSecs    = totalBeats / (bpm / 60)

  // ── Bounce ──────────────────────────────────────────────────────────────

  const doBounce = useCallback(async () => {
    setError(''); setRendered(null); setBouncing(true); setProgress('Starting…')
    try {
      const buf = await bounceMix({ tracks, mixerChannels, bpm, onProgress: setProgress })
      setRendered(buf)
      return buf
    } catch (e) {
      setError(e.message); setProgress(''); return null
    } finally {
      setBouncing(false)
    }
  }, [tracks, mixerChannels, bpm])

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  const handleExportWav = useCallback(async (existingBuf = null) => {
    const buf = existingBuf || rendered
    if (!buf) return
    downloadBlob(bufferToWavBlob(buf), `${currentSongName || 'mix'}.wav`)
  }, [rendered, currentSongName])

  const handleExportMp3 = useCallback(async (existingBuf = null) => {
    const buf = existingBuf || rendered
    if (!buf) return
    setExporting(true)
    setProgress('Encoding MP3…')
    try {
      const blob = await bufferToMp3Blob(buf, mp3Kbps)
      downloadBlob(blob, `${currentSongName || 'mix'}.mp3`)
      setProgress(`MP3 exported at ${mp3Kbps} kbps`)
    } catch (e) {
      setError('MP3 encode failed: ' + e.message)
    } finally {
      setExporting(false)
    }
  }, [rendered, mp3Kbps, currentSongName])

  const handleBounceAndExport = useCallback(async () => {
    setError(''); setRendered(null); setBouncing(true); setExporting(true); setProgress('Starting bounce…')
    try {
      const buf = await bounceMix({ tracks, mixerChannels, bpm, onProgress: setProgress })
      setRendered(buf)

      if (format === 'wav' || format === 'both') {
        setProgress('Writing WAV…')
        downloadBlob(bufferToWavBlob(buf), `${currentSongName || 'mix'}.wav`)
      }
      if (format === 'mp3' || format === 'both') {
        setProgress('Encoding MP3…')
        const blob = await bufferToMp3Blob(buf, mp3Kbps)
        downloadBlob(blob, `${currentSongName || 'mix'}.mp3`)
      }

      const fmt = format === 'both' ? 'WAV + MP3' : format.toUpperCase()
      setProgress(`✓ Exported ${fmt} — ${buf.duration.toFixed(2)} s`)
    } catch (e) {
      setError(e.message); setProgress('')
    } finally {
      setBouncing(false); setExporting(false)
    }
  }, [tracks, mixerChannels, bpm, format, mp3Kbps, currentSongName])

  // ── Snapshots ────────────────────────────────────────────────────────────

  const handleSaveSnapshot = () => {
    const snap = takeSnapshot(snapLabel.trim() || undefined)
    setSnapshots(readSnapshots())
    setSnapLabel('')
    setSnapMsg(`Saved "${snap.label}"`)
    setTimeout(() => setSnapMsg(''), 3000)
  }

  const handleRestoreSnapshot = (snap) => {
    const n = applySnapshot(snap)
    setSnapMsg(`Restored "${snap.label}" (${n} keys). Reloading…`)
    setTimeout(() => window.location.reload(), 1200)
  }

  const handleDeleteSnapshot = (id) => {
    removeSnapshot(id)
    setSnapshots(readSnapshots())
  }

  const busy = bouncing || exporting

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#080810', color: '#e0e0e0', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', background: '#0d0d1a', borderBottom: '1px solid #1a1a2e', flexShrink: 0 }}>
        <span style={{ fontSize: 18 }}>↓</span>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: 1, background: 'linear-gradient(90deg, #00ff9d, #00e5ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Export & Project Save
        </span>
        <div style={{ flexGrow: 1 }} />
        <div style={{ display: 'flex', gap: 12 }}>
          <Pill label="tracks"   value={tracks.length}   color="#b44fff" />
          <Pill label="audio clips" value={clipCount}    color="#00ff9d" />
          <Pill label="BPM"      value={bpm}             color="#ffe600" />
          <Pill label="duration" value={totalSecs > 0 ? `${totalSecs.toFixed(1)}s` : '—'} color="#00e5ff" />
        </div>
      </div>

      {/* Body — two-column */}
      <div style={{ flexGrow: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── Left: Bounce & Export ── */}
        <div style={{ width: 440, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0, borderRight: '1px solid #1a1a2e', overflowY: 'auto' }}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Section header */}
            <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Bounce Final Mix</div>

            {/* Track summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              {tracks.length === 0 && (
                <div style={{ color: '#444', fontSize: 12, padding: '8px 0' }}>
                  No tracks yet. Go to <strong style={{ color: '#00e5ff' }}>Arrange</strong> to add tracks and clips.
                </div>
              )}
              {tracks.map((t) => {
                const ch = mixerChannels.find((m) => m.trackId === t.id)
                const audioCnt = t.clips.filter((c) => c.url).length
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 6, background: '#ffffff06', border: '1px solid #1a1a2e' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: t.muted ? '#555' : '#ddd', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}{t.muted ? <span style={{ color: '#555', fontSize: 10, marginLeft: 6 }}>MUTED</span> : null}
                    </span>
                    {ch && <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', flexShrink: 0 }}>Vol {ch.volume}% · Pan {ch.pan > 0 ? '+' : ''}{ch.pan}</span>}
                    <span style={{ fontSize: 10, fontFamily: 'monospace', flexShrink: 0, color: audioCnt ? '#00ff9d' : '#444' }}>
                      {audioCnt} {audioCnt === 1 ? 'clip' : 'clips'}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Format picker */}
            <div style={{ padding: '12px 14px', background: '#ffffff06', borderRadius: 8, border: '1px solid #1a1a2e', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, color: '#888' }}>Export format</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['wav', 'mp3', 'both'].map((f) => (
                  <button key={f} onClick={() => setFormat(f)} style={{
                    flex: 1, padding: '5px 0', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace',
                    background: format === f ? '#00e5ff22' : '#ffffff08',
                    border: `1px solid ${format === f ? '#00e5ff' : '#2a2a3e'}`,
                    color: format === f ? '#00e5ff' : '#666',
                  }}>{f.toUpperCase()}</button>
                ))}
              </div>
              {(format === 'mp3' || format === 'both') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#666' }}>Quality:</span>
                  {[128, 192, 320].map((k) => (
                    <button key={k} onClick={() => setMp3Kbps(k)} style={{
                      padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace',
                      background: mp3Kbps === k ? '#b44fff22' : '#ffffff08',
                      border: `1px solid ${mp3Kbps === k ? '#b44fff' : '#2a2a3e'}`,
                      color: mp3Kbps === k ? '#b44fff' : '#666',
                    }}>{k}k</button>
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div style={{ background: '#ff2d5514', border: '1px solid #ff2d5540', color: '#ff8099', fontSize: 12, padding: '8px 12px', borderRadius: 6, lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            {/* Progress */}
            {progress && !error && (
              <div style={{ background: '#00e5ff08', border: '1px solid #00e5ff22', color: '#00e5ff', fontSize: 11, padding: '7px 10px', borderRadius: 6, fontFamily: 'monospace', lineHeight: 1.4 }}>
                {busy && <span style={{ marginRight: 6 }}>⏳</span>}{progress}
              </div>
            )}

            {/* Primary bounce button */}
            <button
              onClick={handleBounceAndExport}
              disabled={busy || clipCount === 0}
              style={{
                padding: '13px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
                cursor: (busy || clipCount === 0) ? 'not-allowed' : 'pointer',
                background: (busy || clipCount === 0) ? '#1a1a2e' : 'linear-gradient(135deg, #00ff9d22, #00e5ff22)',
                border: `1px solid ${(busy || clipCount === 0) ? '#2a2a3e' : '#00e5ff66'}`,
                color: (busy || clipCount === 0) ? '#444' : '#00e5ff',
                boxShadow: (!busy && clipCount > 0) ? '0 0 20px #00e5ff12' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {busy ? '⏳ Working…' : `↓ Bounce & Export ${format.toUpperCase()}`}
            </button>

            {/* Secondary download buttons (appear after bounce) */}
            {rendered && !busy && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleExportWav()} style={{
                  flex: 1, padding: '8px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  background: '#00ff9d14', border: '1px solid #00ff9d44', color: '#00ff9d',
                }}>↓ Download WAV</button>
                <button onClick={() => handleExportMp3()} style={{
                  flex: 1, padding: '8px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  background: '#b44fff14', border: '1px solid #b44fff44', color: '#b44fff',
                }}>↓ Download MP3</button>
              </div>
            )}

            {/* Info cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 }}>How It Works</div>
              {[
                ['Bounce',      'Renders all non-muted audio clips into one stereo mix using your BPM for exact timing.'],
                ['Mixer',       'Per-track volume and pan from your Mixer settings are baked into the bounce.'],
                ['WAV',         'Lossless 16-bit stereo PCM at 44.1 kHz — best for mastering or further editing.'],
                ['MP3',         `Lossy compression at ${mp3Kbps} kbps — good for sharing, smaller file size.`],
                ['MIDI tracks', 'Beat Maker / Piano Roll MIDI are not included — bounce those first via BeatMaker.'],
              ].map(([t, d]) => (
                <div key={t} style={{ display: 'flex', gap: 10, padding: '7px 10px', background: '#ffffff06', borderRadius: 5, border: '1px solid #1a1a2e' }}>
                  <span style={{ fontWeight: 700, fontSize: 10, color: '#00e5ff', minWidth: 80, flexShrink: 0, paddingTop: 1 }}>{t}</span>
                  <span style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>{d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Local Version History ── */}
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a2e', flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Local Project Snapshots</div>
            <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6, marginBottom: 12 }}>
              Snapshots save every setting, mixer state, lyrics, patterns, and arrangement to your browser storage. Restore any point to roll back the whole project. Audio clips are not included — they live in memory.
            </div>
            {/* Save control */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={snapLabel}
                onChange={(e) => setSnapLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveSnapshot()}
                placeholder={`e.g. "Before chorus rewrite"`}
                style={{ flex: 1, background: '#ffffff0a', border: '1px solid #2a2a3e', borderRadius: 6, color: '#e0e0e0', padding: '7px 10px', fontSize: 12 }}
              />
              <button onClick={handleSaveSnapshot} style={{
                background: '#00ff9d18', border: '1px solid #00ff9d44', color: '#00ff9d',
                borderRadius: 6, padding: '7px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit', flexShrink: 0,
              }}>
                Save Snapshot
              </button>
            </div>
            {snapMsg && (
              <div style={{ marginTop: 8, background: '#00ff9d08', border: '1px solid #00ff9d33', color: '#00ff9d', fontSize: 12, padding: '6px 10px', borderRadius: 6, lineHeight: 1.4 }}>
                {snapMsg}
              </div>
            )}
          </div>

          {/* Snapshot list */}
          <div style={{ flexGrow: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {snapshots.length === 0 && (
              <div style={{ color: '#444', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.3 }}>◫</div>
                No snapshots yet. Save one above to create your first restore point.
              </div>
            )}
            {snapshots.map((snap, i) => (
              <div key={snap.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                background: '#ffffff06', border: '1px solid #1a1a2e', borderRadius: 8,
              }}>
                {/* Index badge */}
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#ffffff0a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, color: '#555', fontFamily: 'monospace' }}>
                  {i + 1}
                </div>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {snap.label}
                  </div>
                  <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', marginTop: 2 }}>
                    {new Date(snap.savedAt).toLocaleString()} · {snap.keyCount} keys
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => handleRestoreSnapshot(snap)} style={{
                    background: '#00e5ff10', border: '1px solid #00e5ff44', color: '#00e5ff',
                    borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                  }}>Restore</button>
                  <button onClick={() => handleDeleteSnapshot(snap.id)} style={{
                    background: '#ff2d5510', border: '1px solid #ff2d5533', color: '#ff8099',
                    borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
                  }}>✕</button>
                </div>
              </div>
            ))}
          </div>

          {snapshots.length > 0 && (
            <div style={{ padding: '6px 20px', borderTop: '1px solid #1a1a2e', fontSize: 10, color: '#444', fontFamily: 'monospace', flexShrink: 0 }}>
              {snapshots.length}/{MAX_SNAPS} snapshots stored locally · oldest auto-removed after {MAX_SNAPS}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
