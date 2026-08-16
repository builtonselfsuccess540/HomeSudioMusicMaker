import React, { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'hsmm_notepad_notes'
const TAG_COLORS = {
  Idea:    '#b44fff',
  Lyrics:  '#00ff9d',
  Chords:  '#00e5ff',
  Melody:  '#ff9500',
  Todo:    '#ffe600',
  General: '#8899aa',
}

function loadNotes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
}

function saveNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

function newNote() {
  return { id: Date.now(), title: 'Untitled', body: '', tag: 'General', created: new Date().toISOString() }
}

export default function NotepadView() {
  const [notes, setNotes]       = useState(loadNotes)
  const [activeId, setActiveId] = useState(null)
  const [search, setSearch]     = useState('')

  const active = notes.find(n => n.id === activeId) || null

  useEffect(() => {
    if (notes.length > 0 && !activeId) setActiveId(notes[0].id)
  }, [])

  const updateNote = useCallback((id, patch) => {
    setNotes(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, ...patch } : n)
      saveNotes(updated)
      return updated
    })
  }, [])

  const addNote = () => {
    const n = newNote()
    setNotes(prev => {
      const updated = [n, ...prev]
      saveNotes(updated)
      return updated
    })
    setActiveId(n.id)
  }

  const deleteNote = (id) => {
    const remaining = notes.filter(n => n.id !== id)
    setNotes(remaining)
    saveNotes(remaining)
    if (activeId === id) setActiveId(remaining[0]?.id || null)
  }

  const filtered = notes.filter(n =>
    search === '' ||
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.body.toLowerCase().includes(search.toLowerCase())
  )

  const wordCount = active ? active.body.trim().split(/\s+/).filter(Boolean).length : 0

  return (
    <div className="flex h-full" style={{ background: '#080810' }}>
      {/* Sidebar */}
      <div className="flex flex-col w-64 border-r border-studio-border shrink-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-studio-border">
          <span className="font-display text-xs tracking-widest uppercase flex-1" style={{ color: '#00ff9d' }}>
            Notepad
          </span>
          <button
            onClick={addNote}
            title="New note"
            className="w-6 h-6 rounded flex items-center justify-center text-base font-bold transition-all"
            style={{ background: '#00ff9d22', color: '#00ff9d' }}
          >
            +
          </button>
        </div>

        {/* Search */}
        <div className="px-2 py-2 border-b border-studio-border">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search notes…"
            className="w-full bg-transparent border border-studio-border rounded px-2 py-1 text-xs text-studio-text placeholder-studio-muted focus:outline-none focus:border-studio-dim"
          />
        </div>

        {/* Note list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-studio-muted">No notes yet — hit + to create one</div>
          )}
          {filtered.map(n => (
            <div
              key={n.id}
              onClick={() => setActiveId(n.id)}
              className="px-3 py-2 cursor-pointer border-b border-studio-border transition-all"
              style={{
                background: activeId === n.id ? '#ffffff08' : 'transparent',
                borderLeft: activeId === n.id ? `3px solid ${TAG_COLORS[n.tag] || '#8899aa'}` : '3px solid transparent',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs font-semibold text-studio-text truncate">{n.title || 'Untitled'}</span>
                <span
                  className="text-xs px-1 rounded"
                  style={{ background: `${TAG_COLORS[n.tag] || '#8899aa'}22`, color: TAG_COLORS[n.tag] || '#8899aa' }}
                >
                  {n.tag}
                </span>
              </div>
              <div className="text-xs text-studio-muted truncate mt-0.5">
                {n.body.slice(0, 60) || 'Empty…'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      {active ? (
        <div className="flex flex-col flex-1 min-w-0">
          {/* Note toolbar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-studio-border shrink-0">
            <input
              value={active.title}
              onChange={e => updateNote(active.id, { title: e.target.value })}
              className="flex-1 bg-transparent text-sm font-semibold text-studio-text placeholder-studio-muted focus:outline-none"
              placeholder="Note title…"
            />
            <select
              value={active.tag}
              onChange={e => updateNote(active.id, { tag: e.target.value })}
              className="bg-studio-panel border border-studio-border rounded px-2 py-1 text-xs focus:outline-none"
              style={{ color: TAG_COLORS[active.tag] || '#8899aa' }}
            >
              {Object.keys(TAG_COLORS).map(t => (
                <option key={t} value={t} style={{ color: TAG_COLORS[t] }}>{t}</option>
              ))}
            </select>
            <button
              onClick={() => deleteNote(active.id)}
              className="text-xs px-2 py-1 rounded transition-all hover:bg-red-500/20"
              style={{ color: '#ff2d55' }}
            >
              Delete
            </button>
          </div>

          {/* Text area */}
          <textarea
            value={active.body}
            onChange={e => updateNote(active.id, { body: e.target.value })}
            placeholder="Start writing… lyrics, chord ideas, melody notes, anything."
            className="flex-1 bg-transparent resize-none p-4 text-sm text-studio-text placeholder-studio-muted focus:outline-none font-mono leading-relaxed"
            style={{ lineHeight: '1.7' }}
          />

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-1 border-t border-studio-border shrink-0">
            <span className="text-xs text-studio-muted">{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
            <span className="text-xs text-studio-muted">{active.body.length} chars</span>
            <div className="flex-1" />
            <span className="text-xs text-studio-muted">
              Created {new Date(active.created).toLocaleDateString()}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">✍</div>
            <div className="text-sm text-studio-dim mb-2">No note selected</div>
            <button
              onClick={addNote}
              className="px-4 py-2 rounded text-sm font-semibold transition-all"
              style={{ background: '#00ff9d22', color: '#00ff9d', border: '1px solid #00ff9d44' }}
            >
              Create First Note
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
