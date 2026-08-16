import React, { useState, useRef } from 'react'
import { useStudioStore } from '../../store/useStudioStore'

const MOODS = [
  { key: 'hype',      label: 'Hype',      color: '#ff2d55' },
  { key: 'chill',     label: 'Chill',     color: '#00e5ff' },
  { key: 'gospel',    label: 'Gospel',    color: '#ffe600' },
  { key: 'sad',       label: 'Sad',       color: '#b44fff' },
  { key: 'love',      label: 'Love',      color: '#ff9500' },
  { key: 'motivated', label: 'Motivated', color: '#00ff9d' },
]

const FOLDER_COLORS = ['#00e5ff', '#b44fff', '#00ff9d', '#ffe600', '#ff9500', '#ff2d55']

const SECTION_COLORS = { verse: '#b44fff', chorus: '#00e5ff', bridge: '#00ff9d', hook: '#ffe600', outro: '#ff9500' }

function moodFor(key) {
  return MOODS.find((m) => m.key === key) || null
}

function StatsPanel() {
  const { savedSongs, aiSongs, styleProfile, streak } = useStudioStore()

  const totalLines = savedSongs.reduce((sum, s) =>
    sum + s.sections.reduce((ss, sec) => ss + sec.lines.filter((l) => l.trim()).length, 0), 0)

  const totalWords = savedSongs.reduce((sum, s) =>
    sum + s.sections.reduce((ss, sec) =>
      ss + sec.lines.reduce((sl, l) => sl + l.trim().split(/\s+/).filter(Boolean).length, 0), 0), 0)

  const moodCounts = {}
  savedSongs.forEach((s) => { if (s.mood) moodCounts[s.mood] = (moodCounts[s.mood] || 0) + 1 })
  const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]

  const topRhyme = styleProfile.rhymeSchemes?.[0]
  const topTheme = styleProfile.themes?.[0]

  const stats = [
    { label: 'Songs Written', value: savedSongs.length, color: '#00e5ff' },
    { label: 'Lines Written', value: totalLines.toLocaleString(), color: '#b44fff' },
    { label: 'Words Written', value: totalWords.toLocaleString(), color: '#00ff9d' },
    { label: 'AI Songs', value: aiSongs.length, color: '#ffe600' },
    { label: 'Top Mood', value: topMood ? topMood[0] : '—', color: '#ff9500' },
    { label: 'Rhyme Style', value: topRhyme || '—', color: '#ff2d55' },
    { label: 'Top Theme', value: topTheme || '—', color: '#00e5ff' },
    { label: 'Folders', value: useStudioStore.getState().folders.length, color: '#b44fff' },
  ]

  return (
    <div className="p-6 flex flex-col gap-6 max-w-2xl">
      {/* Streak */}
      <div className="bg-studio-panel border border-studio-border rounded-xl p-5">
        <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-3">Writing Streak</div>
        <div className="flex items-end gap-6">
          <div>
            <div className="font-display text-5xl font-bold" style={{ color: streak?.count >= 3 ? '#ffe600' : '#00e5ff' }}>
              {streak?.count ?? 0}
            </div>
            <div className="text-xs font-mono text-studio-dim mt-1">days in a row</div>
          </div>
          <div className="pb-1">
            <div className="font-display text-2xl font-semibold text-studio-dim">{streak?.longest ?? 0}</div>
            <div className="text-xs font-mono text-studio-dim">longest streak</div>
          </div>
          <div className="ml-auto pb-1 text-right">
            {streak?.lastDate && (
              <>
                <div className="text-xs font-mono text-studio-dim">Last saved</div>
                <div className="text-xs font-mono text-studio-text">{streak.lastDate}</div>
              </>
            )}
          </div>
        </div>
        {streak?.count >= 3 && (
          <div className="mt-3 text-xs font-mono" style={{ color: '#ffe600' }}>
            🔥 {streak.count >= 7 ? 'On fire! Keep going!' : streak.count >= 5 ? 'Great momentum!' : 'Getting into the flow!'}
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div>
        <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-3">Your Numbers</div>
        <div className="grid grid-cols-2 gap-3">
          {stats.map(({ label, value, color }) => (
            <div key={label} className="bg-studio-panel border border-studio-border rounded-xl px-4 py-3">
              <div className="text-xs font-mono text-studio-dim mb-1">{label}</div>
              <div className="font-display text-xl font-semibold capitalize"
                style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mood breakdown */}
      {Object.keys(moodCounts).length > 0 && (
        <div>
          <div className="text-xs font-mono text-studio-dim uppercase tracking-wider mb-3">Mood Breakdown</div>
          <div className="bg-studio-panel border border-studio-border rounded-xl p-4 flex flex-col gap-2">
            {Object.entries(moodCounts).sort((a, b) => b[1] - a[1]).map(([mood, count]) => {
              const m = MOODS.find((x) => x.key === mood)
              const pct = Math.round((count / savedSongs.length) * 100)
              return (
                <div key={mood} className="flex items-center gap-3">
                  <span className="w-20 text-xs font-mono capitalize" style={{ color: m?.color || '#888' }}>{mood}</span>
                  <div className="flex-1 h-2 bg-studio-void rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: m?.color || '#888' }} />
                  </div>
                  <span className="text-xs font-mono text-studio-dim w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function SongCardGenerator({ songs }) {
  const canvasRef = useRef(null)
  const [selectedSong, setSelectedSong] = useState(songs[0]?.id ?? null)
  const [downloaded, setDownloaded] = useState(false)

  const song = songs.find((s) => s.id === selectedSong)

  const drawCard = () => {
    const canvas = canvasRef.current
    if (!canvas || !song) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, '#080810')
    grad.addColorStop(1, '#14082a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // Accent glow
    const moodMap = { hype: '#ff2d55', chill: '#00e5ff', gospel: '#ffe600', sad: '#b44fff', love: '#ff9500', motivated: '#00ff9d' }
    const accentColor = moodMap[song.mood] || '#00e5ff'
    const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7)
    glow.addColorStop(0, accentColor + '18')
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)

    // Top accent bar
    ctx.fillStyle = accentColor
    ctx.fillRect(0, 0, W, 4)

    // "Home Studio" label
    ctx.fillStyle = '#444466'
    ctx.font = '500 11px monospace'
    ctx.fillText('HOME STUDIO MUSIC MAKER', 28, 36)

    // Song name
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 28px serif'
    ctx.fillText(song.name, 28, 74)

    // Mood badge
    if (song.mood) {
      ctx.fillStyle = accentColor + '33'
      ctx.beginPath()
      ctx.roundRect(28, 86, 80, 22, 11)
      ctx.fill()
      ctx.fillStyle = accentColor
      ctx.font = '600 10px monospace'
      ctx.fillText(song.mood.toUpperCase(), 38, 101)
    }

    // Divider
    ctx.fillStyle = '#252540'
    ctx.fillRect(28, 118, W - 56, 1)

    // Best lines (first verse, up to 6 lines)
    const verse = song.sections.find((s) => s.type === 'verse' || s.type === 'hook') || song.sections[0]
    const lines = verse?.lines.filter((l) => l.trim()).slice(0, 6) || []
    ctx.fillStyle = '#c0c0d8'
    ctx.font = '400 13px sans-serif'
    lines.forEach((line, i) => {
      ctx.fillText(line.length > 55 ? line.slice(0, 52) + '…' : line, 28, 142 + i * 22)
    })

    // Date
    ctx.fillStyle = '#333355'
    ctx.font = '400 10px monospace'
    ctx.fillText(song.savedAt, 28, H - 18)

    // Bottom glow line
    const botGrad = ctx.createLinearGradient(0, H - 3, W, H - 3)
    botGrad.addColorStop(0, 'transparent')
    botGrad.addColorStop(0.5, accentColor + '88')
    botGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = botGrad
    ctx.fillRect(0, H - 3, W, 3)
  }

  const download = () => {
    drawCard()
    const a = document.createElement('a')
    a.download = `${song?.name?.replace(/[^a-z0-9]/gi, '_') || 'song'}_card.png`
    a.href = canvasRef.current.toDataURL('image/png')
    a.click()
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2000)
  }

  // Redraw whenever selection changes
  React.useEffect(() => { drawCard() }, [selectedSong, songs])

  if (!songs.length) return (
    <div className="p-6 text-xs font-mono text-studio-dim">Save some songs first to generate share cards.</div>
  )

  return (
    <div className="p-6 flex flex-col gap-4 max-w-xl">
      <div className="text-xs font-mono text-studio-dim uppercase tracking-wider">Song Card Generator</div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-mono text-studio-dim">Choose song</span>
        <select
          value={selectedSong ?? ''}
          onChange={(e) => setSelectedSong(Number(e.target.value))}
          className="bg-studio-void border border-studio-border rounded px-3 py-1.5 text-sm font-ui text-studio-text focus:outline-none focus:border-studio-cyan"
        >
          {songs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <canvas ref={canvasRef} width={480} height={280} className="rounded-xl w-full" style={{ border: '1px solid #252540' }} />
      <button
        onClick={download}
        className="px-4 py-2.5 rounded-xl text-sm font-ui font-semibold text-black transition-all"
        style={{ background: downloaded ? 'linear-gradient(135deg,#00ff9d,#00e5ff)' : 'linear-gradient(135deg,#b44fff,#00e5ff)' }}
      >
        {downloaded ? '✓ Downloaded!' : '↓ Download PNG'}
      </button>
      <p className="text-xs font-mono text-studio-dim">Card shows the song name, mood, and first verse lines — ready to share.</p>
    </div>
  )
}

export default function ProjectsView({ onSwitchToLyrics }) {
  const {
    savedSongs, folders, streak,
    loadSong, deleteSavedSong,
    addFolder, renameFolder, deleteFolder,
    moveSongToFolder, setSongNotes, setSongMood,
    restoreSongVersion,
  } = useStudioStore()

  const [selectedFolder, setSelectedFolder] = useState(null) // null = All Songs, 'stats', 'card'
  const [expandedId, setExpandedId] = useState(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0])
  const [renamingId, setRenamingId] = useState(null)
  const [renameText, setRenameText] = useState('')

  const filtered = selectedFolder === null
    ? savedSongs
    : savedSongs.filter((s) => s.folderId === selectedFolder)

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return
    addFolder(newFolderName.trim(), newFolderColor)
    setNewFolderName('')
    setNewFolderColor(FOLDER_COLORS[0])
    setShowNewFolder(false)
  }

  const handleOpen = (song) => {
    loadSong(song.id)
    onSwitchToLyrics()
  }

  const handleDelete = (song) => {
    if (!window.confirm(`Delete "${song.name}"? This cannot be undone.`)) return
    deleteSavedSong(song.id)
    if (expandedId === song.id) setExpandedId(null)
  }

  const handleRestore = (song, version) => {
    if (!window.confirm('Restore this version? The current version will be saved into history first.')) return
    restoreSongVersion(song.id, version.id)
  }

  return (
    <div className="flex h-full bg-studio-void overflow-hidden">

      {/* ── Folder sidebar ── */}
      <div className="w-52 shrink-0 bg-studio-panel border-r border-studio-border flex flex-col">
        <div className="px-3 py-2 border-b border-studio-border shrink-0">
          <span className="font-display text-xs font-semibold text-studio-dim tracking-widest uppercase">Projects</span>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-1">
          {/* All Songs */}
          <button
            onClick={() => setSelectedFolder(null)}
            className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm font-ui transition-colors ${
              selectedFolder === null
                ? 'bg-studio-cyan/10 text-studio-cyan'
                : 'text-studio-dim hover:text-studio-text hover:bg-studio-surface'
            }`}
          >
            <span className="text-base leading-none">◫</span>
            <span className="flex-1">All Songs</span>
            <span className="font-mono text-xs opacity-60">{savedSongs.length}</span>
          </button>

          {/* Special views */}
          {[
            { id: 'stats', label: 'Stats', icon: '◉' },
            { id: 'card',  label: 'Share Card', icon: '◈' },
          ].map(({ id, label, icon }) => (
            <button key={id}
              onClick={() => setSelectedFolder(id)}
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm font-ui transition-colors ${
                selectedFolder === id
                  ? 'bg-studio-orange/10 text-studio-orange'
                  : 'text-studio-dim hover:text-studio-text hover:bg-studio-surface'
              }`}
            >
              <span>{icon}</span>
              <span className="flex-1">{label}</span>
            </button>
          ))}

          {folders.length > 0 && <div className="my-1 mx-2 border-t border-studio-border" />}

          {folders.map((folder) => {
            const count = savedSongs.filter((s) => s.folderId === folder.id).length
            const isActive = selectedFolder === folder.id
            return (
              <div key={folder.id} className="relative group">
                {renamingId === folder.id ? (
                  <div className="px-2 py-1 flex items-center gap-1">
                    <input
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { renameFolder(folder.id, renameText.trim() || folder.name); setRenamingId(null) }
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onBlur={() => { renameFolder(folder.id, renameText.trim() || folder.name); setRenamingId(null) }}
                      className="flex-1 bg-studio-void border border-studio-cyan rounded px-1.5 py-0.5 text-xs font-mono text-studio-text focus:outline-none"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedFolder(folder.id)}
                    className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm font-ui transition-colors ${
                      isActive
                        ? 'bg-studio-surface text-studio-text'
                        : 'text-studio-dim hover:text-studio-text hover:bg-studio-surface'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: folder.color }} />
                    <span className="flex-1 truncate">{folder.name}</span>
                    <span className="font-mono text-xs opacity-60">{count}</span>
                  </button>
                )}
                {/* hover controls */}
                <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-studio-panel pl-1">
                  <button
                    onClick={() => { setRenamingId(folder.id); setRenameText(folder.name) }}
                    className="text-studio-dim hover:text-studio-cyan text-xs px-1 py-1"
                    title="Rename"
                  >✎</button>
                  <button
                    onClick={() => deleteFolder(folder.id)}
                    className="text-studio-dim hover:text-studio-red text-xs px-1 py-1"
                    title="Delete folder"
                  >✕</button>
                </div>
              </div>
            )
          })}
        </div>

        {/* New folder */}
        <div className="border-t border-studio-border p-2 shrink-0">
          {showNewFolder ? (
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false) }}
                placeholder="Folder name..."
                className="w-full bg-studio-void border border-studio-border rounded px-2 py-1.5 text-xs font-mono text-studio-text focus:outline-none focus:border-studio-cyan placeholder:text-studio-muted"
              />
              <div className="flex gap-1.5 flex-wrap">
                {FOLDER_COLORS.map((c) => (
                  <button key={c} onClick={() => setNewFolderColor(c)}
                    className="w-5 h-5 rounded-full transition-transform hover:scale-110 shrink-0"
                    style={{
                      background: c,
                      boxShadow: newFolderColor === c ? `0 0 0 2px #14141f, 0 0 0 3.5px ${c}` : 'none',
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleCreateFolder}
                  className="flex-1 py-1 rounded bg-studio-cyan/10 border border-studio-cyan/40 text-studio-cyan text-xs font-ui hover:bg-studio-cyan/20 transition-colors">
                  Create
                </button>
                <button onClick={() => { setShowNewFolder(false); setNewFolderName('') }}
                  className="px-3 py-1 rounded border border-studio-border text-studio-dim text-xs font-ui hover:border-studio-red hover:text-studio-red transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewFolder(true)}
              className="w-full py-1.5 rounded border border-dashed border-studio-border text-studio-dim text-xs font-ui hover:border-studio-cyan hover:text-studio-cyan transition-colors">
              + New Folder
            </button>
          )}
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 overflow-y-auto">

        {selectedFolder === 'stats' && <StatsPanel />}
        {selectedFolder === 'card'  && <SongCardGenerator songs={savedSongs} />}

        {selectedFolder !== 'stats' && selectedFolder !== 'card' && (
        <div className="p-4">
        {/* Header */}
        <div className="mb-4">
          <h2 className="font-display font-semibold text-studio-text text-base">
            {selectedFolder === null ? 'All Songs' : (folders.find((f) => f.id === selectedFolder)?.name ?? 'Folder')}
          </h2>
          <p className="text-xs font-mono text-studio-dim mt-0.5">
            {filtered.length} song{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-studio-muted gap-2">
            <span className="text-4xl">♪</span>
            <span className="font-ui text-sm">No songs here yet</span>
            <span className="font-mono text-xs">Save songs from the Lyrics tab — they'll appear here</span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {filtered.map((song) => {
            const isExpanded = expandedId === song.id
            const mood = moodFor(song.mood)
            const folder = folders.find((f) => f.id === song.folderId)
            const versionCount = song.versions?.length ?? 0

            return (
              <div key={song.id}
                className="bg-studio-panel border rounded-xl overflow-hidden transition-colors"
                style={{ borderColor: isExpanded ? '#333355' : '#1c1c30' }}
              >
                {/* Card row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Mood indicator */}
                  {mood ? (
                    <div className="w-3 h-3 rounded-full shrink-0 transition-all"
                      style={{ background: mood.color, boxShadow: `0 0 8px ${mood.color}80` }} />
                  ) : (
                    <div className="w-3 h-3 rounded-full shrink-0 bg-studio-muted" />
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-ui font-semibold text-studio-text truncate">{song.name}</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs font-mono text-studio-dim">{song.savedAt}</span>
                      {folder && (
                        <span className="text-xs font-mono px-1.5 rounded-full"
                          style={{ background: folder.color + '22', color: folder.color, border: `1px solid ${folder.color}44` }}>
                          {folder.name}
                        </span>
                      )}
                      {mood && (
                        <span className="text-xs font-mono px-1.5 rounded-full"
                          style={{ background: mood.color + '22', color: mood.color, border: `1px solid ${mood.color}44` }}>
                          {mood.label}
                        </span>
                      )}
                      {versionCount > 0 && (
                        <span className="text-xs font-mono text-studio-dim">
                          {versionCount}v
                        </span>
                      )}
                      <span className="text-xs font-mono text-studio-dim">
                        {song.sections.length} sections
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => handleOpen(song)}
                      className="px-3 py-1 rounded text-xs font-ui font-semibold border border-studio-cyan/40 text-studio-cyan hover:bg-studio-cyan/10 hover:border-studio-cyan transition-colors">
                      Open
                    </button>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : song.id)}
                      className="px-2 py-1 rounded text-xs border border-studio-border text-studio-dim hover:text-studio-text transition-colors"
                    >{isExpanded ? '▲' : '▼'}</button>
                    <button onClick={() => handleDelete(song)}
                      className="px-2 py-1 rounded text-xs border border-studio-border text-studio-dim hover:text-studio-red hover:border-studio-red transition-colors">
                      ✕
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-studio-border px-4 py-4 bg-[#0c0c1a] flex flex-col gap-4">

                    {/* Mood selector */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">Mood</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {MOODS.map((m) => {
                          const active = song.mood === m.key
                          return (
                            <button key={m.key}
                              onClick={() => setSongMood(song.id, active ? '' : m.key)}
                              className="px-2.5 py-0.5 rounded text-xs font-mono transition-all"
                              style={{
                                background: active ? m.color + '22' : 'transparent',
                                color: active ? m.color : '#555570',
                                border: `1px solid ${active ? m.color + '60' : '#252540'}`,
                              }}
                            >{m.label}</button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Folder selector */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">Folder</span>
                      <div className="flex gap-1.5 flex-wrap items-center">
                        <button
                          onClick={() => moveSongToFolder(song.id, null)}
                          className="px-2.5 py-0.5 rounded text-xs font-mono transition-all"
                          style={{
                            background: !song.folderId ? '#252540' : 'transparent',
                            color: !song.folderId ? '#e0e0f0' : '#555570',
                            border: `1px solid ${!song.folderId ? '#444' : '#252540'}`,
                          }}
                        >None</button>
                        {folders.map((f) => {
                          const active = song.folderId === f.id
                          return (
                            <button key={f.id}
                              onClick={() => moveSongToFolder(song.id, f.id)}
                              className="px-2.5 py-0.5 rounded text-xs font-mono transition-all"
                              style={{
                                background: active ? f.color + '22' : 'transparent',
                                color: active ? f.color : '#555570',
                                border: `1px solid ${active ? f.color + '60' : '#252540'}`,
                              }}
                            >{f.name}</button>
                          )
                        })}
                        {folders.length === 0 && (
                          <span className="text-xs font-mono text-studio-muted">No folders yet — create one in the sidebar</span>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">Notes</span>
                      <textarea
                        value={song.notes || ''}
                        onChange={(e) => setSongNotes(song.id, e.target.value)}
                        placeholder="BPM, references, beat ideas, next steps..."
                        rows={3}
                        className="w-full bg-studio-void border border-studio-border rounded px-3 py-2 text-xs font-mono text-studio-text focus:outline-none focus:border-studio-cyan placeholder:text-studio-muted resize-none"
                      />
                    </div>

                    {/* Version history */}
                    {versionCount > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-mono text-studio-dim uppercase tracking-wider">
                          Version History ({versionCount})
                        </span>
                        <div className="flex flex-col gap-1">
                          {(song.versions || []).map((v, idx) => (
                            <div key={v.id}
                              className="flex items-center gap-3 px-3 py-2 rounded bg-studio-void border border-studio-border">
                              <span className="text-xs font-mono text-studio-dim w-4 text-right">{idx + 1}</span>
                              <span className="text-xs font-mono text-studio-dim flex-1">{v.savedAt}</span>
                              <span className="text-xs font-mono text-studio-muted">
                                {v.sections?.length ?? 0} sections
                              </span>
                              <button
                                onClick={() => handleRestore(song, v)}
                                className="px-2 py-0.5 rounded text-xs font-mono border border-studio-border text-studio-dim hover:text-studio-yellow hover:border-studio-yellow transition-colors">
                                Restore
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sections preview chips */}
                    <div className="flex gap-1.5 flex-wrap">
                      {song.sections.map((sec, i) => {
                        const c = SECTION_COLORS[sec.type] || '#888899'
                        const filled = sec.lines.filter((l) => l.trim()).length
                        return (
                          <span key={i} className="px-2 py-0.5 rounded text-xs font-mono"
                            style={{ background: c + '22', color: c, border: `1px solid ${c}44` }}>
                            {sec.label} · {filled}L
                          </span>
                        )
                      })}
                    </div>

                  </div>
                )}
              </div>
            )
          })}
        </div>
        </div>
        )}

      </div>
    </div>
  )
}
