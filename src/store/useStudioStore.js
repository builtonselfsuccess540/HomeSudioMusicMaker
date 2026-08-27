import { create } from 'zustand'

const PROFILE_KEY = 'hsmm_style_profile'
const SONGS_KEY = 'hsmm_saved_songs'
const AI_SONGS_KEY = 'hsmm_ai_songs'
const ARTIST_LIBRARY_KEY = 'hsmm_artist_library'
const DRAFT_KEY = 'hsmm_lyrics_draft'
const CHAT_KEY = 'hsmm_ai_chat'
const FOLDERS_KEY = 'hsmm_folders'
const STREAK_KEY    = 'hsmm_streak'
const PR_KEY        = 'hsmm_piano_roll'
const PATTERNS_KEY  = 'hsmm_patterns'
const MIXER_KEY          = 'hsmm_mixer'
const SONG_PATTERNS_KEY  = 'hsmm_song_patterns'
const ARRANGEMENT_KEY    = 'hsmm_arrangement'
const ANNOTATIONS_KEY    = 'hsmm_annotations'
const AUTOMATION_KEY     = 'hsmm_automation'

const DEFAULT_PROFILE = {
  themes: [],
  rhymeSchemes: [],
  vocabulary: [],
  references: [],
  mood: 'uplifting',
  lyricsHistory: [],
}

const DEFAULT_LYRICS = [
  { id: 1, type: 'verse', label: 'Verse 1', lines: ['', ''] },
  { id: 2, type: 'chorus', label: 'Chorus', lines: ['', ''] },
]

function loadArtistLibrary() {
  try { return JSON.parse(localStorage.getItem(ARTIST_LIBRARY_KEY)) || [] } catch { return [] }
}

function writeArtistLibrary(library) {
  localStorage.setItem(ARTIST_LIBRARY_KEY, JSON.stringify(library))
}

function loadProfile() {
  try {
    const stored = localStorage.getItem(PROFILE_KEY)
    return stored ? JSON.parse(stored) : DEFAULT_PROFILE
  } catch { return DEFAULT_PROFILE }
}

function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

function loadSavedSongs() {
  try {
    const stored = localStorage.getItem(SONGS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

function writeSavedSongs(songs) {
  localStorage.setItem(SONGS_KEY, JSON.stringify(songs))
}

function loadAiSongs() {
  try {
    const stored = localStorage.getItem(AI_SONGS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

function writeAiSongs(songs) {
  localStorage.setItem(AI_SONGS_KEY, JSON.stringify(songs))
}

function loadFolders() {
  try {
    const stored = localStorage.getItem(FOLDERS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

function writeFolders(folders) {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders))
}

function loadPRNotes() {
  try {
    const s = localStorage.getItem(PR_KEY)
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

function savePRNotes(notes) {
  localStorage.setItem(PR_KEY, JSON.stringify(notes))
}

function loadPatterns() {
  try {
    const s = localStorage.getItem(PATTERNS_KEY)
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

function writePatterns(patterns) {
  localStorage.setItem(PATTERNS_KEY, JSON.stringify(patterns))
}

function loadStreak() {
  try {
    const stored = localStorage.getItem(STREAK_KEY)
    return stored ? JSON.parse(stored) : { lastDate: null, count: 0, longest: 0 }
  } catch { return { lastDate: null, count: 0, longest: 0 } }
}

function updateStreak() {
  const today = new Date().toISOString().slice(0, 10)
  const s = loadStreak()
  if (s.lastDate === today) return s
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const count = s.lastDate === yesterday ? s.count + 1 : 1
  const longest = Math.max(s.longest, count)
  const updated = { lastDate: today, count, longest }
  localStorage.setItem(STREAK_KEY, JSON.stringify(updated))
  return updated
}

function getStreak() {
  return loadStreak()
}

// Parse AI-generated song text ([Verse 1], [Chorus] etc.) into sections array
function parseAiTextToSections(text) {
  const lines = text.split('\n')
  const sections = []
  let current = null
  let nextId = 1
  for (const raw of lines) {
    const line = raw.trim()
    const match = line.match(/^\[([^\]]+)\]/)
    if (match) {
      if (current && current.lines.length > 0) sections.push(current)
      const label = match[1].trim()
      const lower = label.toLowerCase()
      const type = lower.includes('verse') ? 'verse'
        : lower.includes('chorus') ? 'chorus'
        : lower.includes('bridge') ? 'bridge'
        : lower.includes('hook') ? 'hook'
        : lower.includes('outro') ? 'outro'
        : 'verse'
      current = { id: nextId++, type, label, lines: [] }
    } else if (current && line) {
      current.lines.push(line)
    }
  }
  if (current && current.lines.length > 0) sections.push(current)
  return sections.length > 0 ? sections : null
}

function loadChat() {
  try {
    const stored = localStorage.getItem(CHAT_KEY)
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

function writeChat(messages) {
  // Keep last 60 messages to avoid localStorage bloat
  localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-60)))
}

function loadDraft() {
  try {
    const stored = localStorage.getItem(DRAFT_KEY)
    if (!stored) return null
    return JSON.parse(stored)
  } catch { return null }
}

function saveDraft(data) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
}

const BEAT_INSTRUMENTS = ['Kick','Snare','HH-C','HH-O','Clap','Tom','Perc']

const DEFAULT_ARRANGEMENT = {
  blocks: [],
  rows: [
    { id: 1, name: 'Drums',  color: '#00e5ff' },
    { id: 2, name: 'Bass',   color: '#00ff9d' },
    { id: 3, name: 'Melody', color: '#b44fff' },
  ],
}

function loadSongPatterns() {
  try { const s = localStorage.getItem(SONG_PATTERNS_KEY); return s ? JSON.parse(s) : [] }
  catch { return [] }
}
function writeSongPatterns(v) { localStorage.setItem(SONG_PATTERNS_KEY, JSON.stringify(v)) }

function loadArrangement() {
  try {
    const s = localStorage.getItem(ARRANGEMENT_KEY)
    if (!s) return DEFAULT_ARRANGEMENT
    const parsed = JSON.parse(s)
    return { ...DEFAULT_ARRANGEMENT, ...parsed }
  } catch { return DEFAULT_ARRANGEMENT }
}
function writeArrangement(v) { localStorage.setItem(ARRANGEMENT_KEY, JSON.stringify(v)) }

const INSERT_PARAM_DEFAULTS = {
  EQ3:        { low: 0, mid: 0, high: 0 },
  Compressor: { threshold: -20, ratio: 4, attack: 10, release: 100, gain: 0 },
  Reverb:     { room: 60, decay: 2.5, predelay: 20, wet: 30 },
  Delay:      { time: 375, feedback: 35, damp: 50, wet: 25 },
  Saturate:   { drive: 30, mix: 50 },
  Chorus:     { rate: 1.5, depth: 40, mix: 30 },
  Filter:     { ftype: 'LP', freq: 2000, q: 1 },
  BitCrush:   { bits: 12, mix: 50 },
  Gain:       { gain: 0 },
}

function loadMixer() {
  try {
    const s = localStorage.getItem(MIXER_KEY)
    if (!s) return null
    const channels = JSON.parse(s)
    if (!channels.some((c) => c.id === 'fx-reverb')) return null  // old format → reset
    return channels.map((c) => ({ sends: { reverb: 0, delay: 0 }, inserts: [], trackId: null, ...c }))
  } catch { return null }
}

function writeMixer(channels) {
  localStorage.setItem(MIXER_KEY, JSON.stringify(channels))
}

const DEFAULT_ANNOTATIONS = { stress: {}, toneTag: {}, beatMap: {}, contour: {}, performance: {} }

function loadAnnotations() {
  try {
    const s = localStorage.getItem(ANNOTATIONS_KEY)
    return s ? { ...DEFAULT_ANNOTATIONS, ...JSON.parse(s) } : DEFAULT_ANNOTATIONS
  } catch { return DEFAULT_ANNOTATIONS }
}
function writeAnnotations(v) { localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(v)) }

const DEFAULT_AUTOMATION = { tracks: {}, patterns: {} }
function loadAutomation() {
  try {
    const s = localStorage.getItem(AUTOMATION_KEY)
    return s ? { ...DEFAULT_AUTOMATION, ...JSON.parse(s) } : DEFAULT_AUTOMATION
  } catch { return DEFAULT_AUTOMATION }
}
function writeAutomation(v) { localStorage.setItem(AUTOMATION_KEY, JSON.stringify(v)) }

const DEFAULT_TRACKS = [
  { id: 1, name: 'Vocal', type: 'audio', color: '#b44fff', muted: false, solo: false, volume: 0.8, clips: [] },
  { id: 2, name: 'Beat', type: 'midi', color: '#00e5ff', muted: false, solo: false, volume: 0.9, clips: [] },
  { id: 3, name: 'Bass', type: 'audio', color: '#00ff9d', muted: false, solo: false, volume: 0.75, clips: [] },
]

const DEFAULT_MIXER_CHANNELS = [
  { id: 1, name: 'Vocal',  color: '#b44fff', volume: 75, pan:  0,   muted: false, solo: false, trackId: 1, sends: { reverb:  0, delay:  0 }, inserts: [] },
  { id: 2, name: 'Beat',   color: '#00e5ff', volume: 85, pan:  0,   muted: false, solo: false, trackId: 2, sends: { reverb:  0, delay:  0 }, inserts: [] },
  { id: 3, name: 'Bass',   color: '#00ff9d', volume: 70, pan: -20,  muted: false, solo: false, trackId: 3, sends: { reverb: 20, delay:  0 }, inserts: [] },
  { id: 'fx-reverb', name: 'Reverb', color: '#b44fff', volume: 80, pan: 0, muted: false, solo: false, isBus: true, sends: { reverb: 0, delay: 0 }, inserts: [] },
  { id: 'fx-delay',  name: 'Delay',  color: '#ffe600', volume: 75, pan: 0, muted: false, solo: false, isBus: true, sends: { reverb: 0, delay: 0 }, inserts: [] },
  { id: 'master',    name: 'Master', color: '#ffe600', volume: 90, pan: 0, muted: false, solo: false, isMaster: true, sends: { reverb: 0, delay: 0 }, inserts: [] },
]

export const useStudioStore = create((set, get) => ({
  // Transport
  isPlaying: false,
  isRecording: false,
  bpm: 90,
  timeSignature: '4/4',
  masterVolume: 85,
  playheadPosition: 0,

  // Tracks
  tracks: DEFAULT_TRACKS,
  nextTrackId: 4,

  // Mixer
  mixerChannels: loadMixer() || DEFAULT_MIXER_CHANNELS,

  // Lyrics — auto-restored from last session
  lyrics: (() => { const d = loadDraft(); return d?.lyrics ?? DEFAULT_LYRICS })(),
  nextSectionId: (() => { const d = loadDraft(); return d?.nextSectionId ?? 3 })(),
  currentSongName: (() => { const d = loadDraft(); return d?.currentSongName ?? 'Untitled Song' })(),

  // Named song saves (user-written)
  savedSongs: loadSavedSongs(),

  // AI generated songs vault
  aiSongs: loadAiSongs(),

  // Project folders
  folders: loadFolders(),

  // Piano Roll notes
  pianoRollNotes: loadPRNotes(),

  // Saved patterns (Piano Roll)
  patterns: loadPatterns(),

  // Song patterns (pattern-based workflow)
  songPatterns: loadSongPatterns(),

  // Song arrangement
  songArrangement: loadArrangement(),

  // Lyric annotations
  annotations: loadAnnotations(),

  // Automation
  automation: loadAutomation(),

  // Writing streak
  streak: getStreak(),

  // Style profile (shared, persisted)
  styleProfile: loadProfile(),

  // Artist style library — custom studied artists saved by the user
  artistLibrary: loadArtistLibrary(),

  // AI
  aiMessages: loadChat(),
  aiSuggestion: null,
  isAiTyping: false,

  // Lyric Analyzer — session result shared with AI Co-Pilot
  lyricAnalysis: null,

  // Artist style library actions
  saveArtistStyle: (name, instruction, lyricsSnippet = '') => {
    const entry = { name, instruction, lyricsSnippet, savedAt: Date.now() }
    const updated = [entry, ...loadArtistLibrary().filter(a => a.name !== name)]
    writeArtistLibrary(updated)
    set({ artistLibrary: updated })
  },
  deleteArtistStyle: (name) => {
    const updated = loadArtistLibrary().filter(a => a.name !== name)
    writeArtistLibrary(updated)
    set({ artistLibrary: updated })
  },

  // Reload all persisted state from localStorage (use after loading a project cloud snapshot)
  rehydrate: () => {
    const d = loadDraft()
    set({
      mixerChannels:   loadMixer() || DEFAULT_MIXER_CHANNELS,
      lyrics:          d?.lyrics ?? DEFAULT_LYRICS,
      nextSectionId:   d?.nextSectionId ?? 3,
      currentSongName: d?.currentSongName ?? 'Untitled Song',
      savedSongs:      loadSavedSongs(),
      aiSongs:         loadAiSongs(),
      folders:         loadFolders(),
      pianoRollNotes:  loadPRNotes(),
      patterns:        loadPatterns(),
      songPatterns:    loadSongPatterns(),
      songArrangement: loadArrangement(),
      annotations:     loadAnnotations(),
      automation:      loadAutomation(),
      styleProfile:    loadProfile(),
      artistLibrary:   loadArtistLibrary(),
      aiMessages:      loadChat(),
    })
  },

  // Actions: Transport
  setPlaying: (v) => set({ isPlaying: v }),
  setRecording: (v) => set({ isRecording: v }),
  setBpm: (bpm) => set({ bpm: Math.max(40, Math.min(300, Number(bpm))) }),
  setTimeSignature: (ts) => set({ timeSignature: ts }),
  setMasterVolume: (v) => set({ masterVolume: v }),

  // Actions: Tracks
  addTrack: (preset = null) => {
    const { nextTrackId, tracks } = get()
    const colors = ['#ff9500', '#ff2d55', '#ffe600', '#00ff9d', '#b44fff', '#00e5ff']
    const newTrack = preset
      ? { id: nextTrackId, muted: false, solo: false, volume: 0.8, clips: [], ...preset }
      : {
          id: nextTrackId,
          name: `Track ${nextTrackId}`,
          type: 'audio',
          color: colors[nextTrackId % colors.length],
          muted: false,
          solo: false,
          volume: 0.8,
          clips: [],
        }
    set({ tracks: [...tracks, newTrack], nextTrackId: nextTrackId + 1 })
  },

  removeTrack: (id) => set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),

  addClipToTrack: (trackId, clip) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t
      ),
    })),

  removeClipFromTrack: (trackId, clipId) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t
      ),
    })),

  updateClipStart: (trackId, clipId, newStart) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              clips: t.clips.map((c) =>
                c.id === clipId ? { ...c, start: Math.max(0, newStart) } : c
              ),
            }
          : t
      ),
    })),

  toggleTrackMute: (id) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)),
    })),

  toggleTrackSolo: (id) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, solo: !t.solo } : t)),
    })),

  setTrackVolume: (id, vol) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, volume: vol } : t)),
    })),

  // Actions: Mixer
  setChannelVolume: (id, vol) =>
    set((s) => {
      const mixerChannels = s.mixerChannels.map((c) => (c.id === id ? { ...c, volume: vol } : c))
      writeMixer(mixerChannels)
      return { mixerChannels }
    }),

  setChannelPan: (id, pan) =>
    set((s) => {
      const mixerChannels = s.mixerChannels.map((c) => (c.id === id ? { ...c, pan } : c))
      writeMixer(mixerChannels)
      return { mixerChannels }
    }),

  toggleChannelMute: (id) =>
    set((s) => {
      const mixerChannels = s.mixerChannels.map((c) => (c.id === id ? { ...c, muted: !c.muted } : c))
      writeMixer(mixerChannels)
      return { mixerChannels }
    }),

  toggleChannelSolo: (id) =>
    set((s) => {
      const mixerChannels = s.mixerChannels.map((c) => (c.id === id ? { ...c, solo: !c.solo } : c))
      writeMixer(mixerChannels)
      return { mixerChannels }
    }),

  setChannelSend: (channelId, bus, value) =>
    set((s) => {
      const mixerChannels = s.mixerChannels.map((c) =>
        c.id === channelId ? { ...c, sends: { ...(c.sends || {}), [bus]: value } } : c
      )
      writeMixer(mixerChannels)
      return { mixerChannels }
    }),

  setChannelTrackRoute: (channelId, trackId) =>
    set((s) => {
      const mixerChannels = s.mixerChannels.map((c) =>
        c.id === channelId ? { ...c, trackId } : c
      )
      writeMixer(mixerChannels)
      return { mixerChannels }
    }),

  addChannelInsert: (channelId, type) => {
    const insert = {
      id: Date.now(),
      type,
      bypass: false,
      params: { ...(INSERT_PARAM_DEFAULTS[type] || {}) },
    }
    set((s) => {
      const mixerChannels = s.mixerChannels.map((c) =>
        c.id === channelId ? { ...c, inserts: [...(c.inserts || []), insert] } : c
      )
      writeMixer(mixerChannels)
      return { mixerChannels }
    })
  },

  removeChannelInsert: (channelId, insertId) =>
    set((s) => {
      const mixerChannels = s.mixerChannels.map((c) =>
        c.id === channelId
          ? { ...c, inserts: (c.inserts || []).filter((ins) => ins.id !== insertId) }
          : c
      )
      writeMixer(mixerChannels)
      return { mixerChannels }
    }),

  updateChannelInsert: (channelId, insertId, changes) =>
    set((s) => {
      const mixerChannels = s.mixerChannels.map((c) =>
        c.id === channelId
          ? { ...c, inserts: (c.inserts || []).map((ins) => ins.id === insertId ? { ...ins, ...changes } : ins) }
          : c
      )
      writeMixer(mixerChannels)
      return { mixerChannels }
    }),

  // Actions: Lyrics
  setCurrentSongName: (name) => {
    set((s) => {
      saveDraft({ lyrics: s.lyrics, nextSectionId: s.nextSectionId, currentSongName: name })
      return { currentSongName: name }
    })
  },

  addSection: (type) => {
    const { lyrics, nextSectionId, currentSongName } = get()
    const labels = { verse: 'Verse', chorus: 'Chorus', bridge: 'Bridge', hook: 'Hook', outro: 'Outro' }
    const count = lyrics.filter((s) => s.type === type).length + 1
    const newLyrics = [
      ...lyrics,
      { id: nextSectionId, type, label: `${labels[type] || type} ${count}`, lines: [''] },
    ]
    const newNextId = nextSectionId + 1
    saveDraft({ lyrics: newLyrics, nextSectionId: newNextId, currentSongName })
    set({ lyrics: newLyrics, nextSectionId: newNextId })
  },

  updateLine: (sectionId, lineIdx, text) =>
    set((s) => {
      const lyrics = s.lyrics.map((sec) =>
        sec.id === sectionId
          ? { ...sec, lines: sec.lines.map((l, i) => (i === lineIdx ? text : l)) }
          : sec
      )
      saveDraft({ lyrics, nextSectionId: s.nextSectionId, currentSongName: s.currentSongName })
      return { lyrics }
    }),

  addLine: (sectionId) =>
    set((s) => {
      const lyrics = s.lyrics.map((sec) =>
        sec.id === sectionId ? { ...sec, lines: [...sec.lines, ''] } : sec
      )
      saveDraft({ lyrics, nextSectionId: s.nextSectionId, currentSongName: s.currentSongName })
      return { lyrics }
    }),

  removeLine: (sectionId, lineIdx) =>
    set((s) => {
      const lyrics = s.lyrics.map((sec) =>
        sec.id === sectionId
          ? { ...sec, lines: sec.lines.filter((_, i) => i !== lineIdx) }
          : sec
      )
      saveDraft({ lyrics, nextSectionId: s.nextSectionId, currentSongName: s.currentSongName })
      return { lyrics }
    }),

  replaceSectionLines: (sectionId, newLines) =>
    set((s) => {
      const lyrics = s.lyrics.map((sec) =>
        sec.id === sectionId ? { ...sec, lines: newLines } : sec
      )
      saveDraft({ lyrics, nextSectionId: s.nextSectionId, currentSongName: s.currentSongName })
      return { lyrics }
    }),

  // Save current lyrics as a named song (also trains the AI profile)
  saveSong: (name) => {
    const { lyrics, savedSongs, learnFromLyrics } = get()
    const songName = name?.trim() || 'Untitled Song'
    const allText = lyrics.map((s) => `[${s.label}]\n${s.lines.join('\n')}`).join('\n\n')
    const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

    const existing = savedSongs.find((s) => s.name === songName)
    let updated

    if (existing) {
      // Snapshot current sections into version history before overwriting
      const snapshot = { id: Date.now() - 1, savedAt: existing.savedAt, sections: JSON.parse(JSON.stringify(existing.sections)) }
      const versions = [snapshot, ...(existing.versions || [])].slice(0, 10)
      updated = savedSongs.map((s) =>
        s.id === existing.id
          ? { ...s, sections: JSON.parse(JSON.stringify(lyrics)), savedAt: now, versions }
          : s
      )
    } else {
      const song = {
        id: Date.now(),
        name: songName,
        savedAt: now,
        sections: JSON.parse(JSON.stringify(lyrics)),
        folderId: null,
        mood: '',
        notes: '',
        versions: [],
      }
      updated = [song, ...savedSongs].slice(0, 50)
    }

    writeSavedSongs(updated)
    const streak = updateStreak()
    set({ savedSongs: updated, currentSongName: songName, streak })
    saveDraft({ lyrics, nextSectionId: get().nextSectionId, currentSongName: songName })

    if (allText.trim()) learnFromLyrics(allText)
  },

  // Load a saved song back into the editor
  loadSong: (id) => {
    const { savedSongs } = get()
    const song = savedSongs.find((s) => s.id === id)
    if (!song) return
    const nextId = Math.max(...song.sections.map((s) => s.id), 0) + 1
    saveDraft({ lyrics: song.sections, nextSectionId: nextId, currentSongName: song.name })
    set({ lyrics: song.sections, nextSectionId: nextId, currentSongName: song.name })
  },

  deleteSavedSong: (id) => {
    set((s) => {
      const updated = s.savedSongs.filter((song) => song.id !== id)
      writeSavedSongs(updated)
      return { savedSongs: updated }
    })
  },

  // Folder actions
  addFolder: (name, color) => {
    set((s) => {
      const folder = { id: Date.now(), name, color }
      const updated = [...s.folders, folder]
      writeFolders(updated)
      return { folders: updated }
    })
  },

  renameFolder: (id, name) => {
    set((s) => {
      const updated = s.folders.map((f) => f.id === id ? { ...f, name } : f)
      writeFolders(updated)
      return { folders: updated }
    })
  },

  deleteFolder: (id) => {
    set((s) => {
      const folders = s.folders.filter((f) => f.id !== id)
      const savedSongs = s.savedSongs.map((song) =>
        song.folderId === id ? { ...song, folderId: null } : song
      )
      writeFolders(folders)
      writeSavedSongs(savedSongs)
      return { folders, savedSongs }
    })
  },

  moveSongToFolder: (songId, folderId) => {
    set((s) => {
      const updated = s.savedSongs.map((song) =>
        song.id === songId ? { ...song, folderId } : song
      )
      writeSavedSongs(updated)
      return { savedSongs: updated }
    })
  },

  setSongNotes: (songId, notes) => {
    set((s) => {
      const updated = s.savedSongs.map((song) =>
        song.id === songId ? { ...song, notes } : song
      )
      writeSavedSongs(updated)
      return { savedSongs: updated }
    })
  },

  setSongMood: (songId, mood) => {
    set((s) => {
      const updated = s.savedSongs.map((song) =>
        song.id === songId ? { ...song, mood } : song
      )
      writeSavedSongs(updated)
      return { savedSongs: updated }
    })
  },

  restoreSongVersion: (songId, versionId) => {
    set((s) => {
      const song = s.savedSongs.find((x) => x.id === songId)
      if (!song) return {}
      const version = (song.versions || []).find((v) => v.id === versionId)
      if (!version) return {}
      const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      // Push current sections into history, remove the version being restored
      const snapshot = { id: Date.now() - 1, savedAt: song.savedAt, sections: JSON.parse(JSON.stringify(song.sections)) }
      const versions = [snapshot, ...(song.versions || []).filter((v) => v.id !== versionId)].slice(0, 10)
      const updatedSongs = s.savedSongs.map((x) =>
        x.id === songId ? { ...x, sections: version.sections, savedAt: now, versions } : x
      )
      writeSavedSongs(updatedSongs)
      // If this song is open in the editor, update it too
      if (s.currentSongName === song.name) {
        const nextId = Math.max(...version.sections.map((sec) => sec.id), 0) + 1
        saveDraft({ lyrics: version.sections, nextSectionId: nextId, currentSongName: song.name })
        return { savedSongs: updatedSongs, lyrics: version.sections, nextSectionId: nextId }
      }
      return { savedSongs: updatedSongs }
    })
  },

  // AI Songs vault
  saveAiSong: (name, rawText) => {
    set((s) => {
      const sections = parseAiTextToSections(rawText)
      const song = {
        id: Date.now(),
        name: name?.trim() || 'AI Song',
        savedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        rawText,
        sections: sections || [],
        sectionCount: sections ? sections.length : 0,
      }
      const updated = [song, ...s.aiSongs].slice(0, 100)
      writeAiSongs(updated)
      return { aiSongs: updated }
    })
  },

  loadAiSongToEditor: (id) => {
    const { aiSongs } = get()
    const song = aiSongs.find((s) => s.id === id)
    if (!song || !song.sections.length) return
    const nextId = Math.max(...song.sections.map((s) => s.id), 0) + 1
    saveDraft({ lyrics: song.sections, nextSectionId: nextId, currentSongName: song.name })
    set({ lyrics: song.sections, nextSectionId: nextId, currentSongName: song.name })
  },

  deleteAiSong: (id) => {
    set((s) => {
      const updated = s.aiSongs.filter((song) => song.id !== id)
      writeAiSongs(updated)
      return { aiSongs: updated }
    })
  },

  newSong: () => {
    const nextSectionId = 3
    const lyrics = DEFAULT_LYRICS.map((s) => ({ ...s, lines: [...s.lines] }))
    saveDraft({ lyrics, nextSectionId, currentSongName: 'Untitled Song' })
    set({ lyrics, nextSectionId, currentSongName: 'Untitled Song' })
  },

  loadTemplate: (templateSections) => {
    const { currentSongName } = get()
    const newLyrics = templateSections.map((s, i) => ({
      id: i + 1,
      type: s.type,
      label: s.label,
      lines: Array(s.lineCount).fill(''),
    }))
    const nextId = templateSections.length + 1
    saveDraft({ lyrics: newLyrics, nextSectionId: nextId, currentSongName })
    set({ lyrics: newLyrics, nextSectionId: nextId })
  },

  // Actions: Style Profile
  learnFromLyrics: (text) => {
    if (!text.trim()) return
    set((s) => {
      const words = text.toLowerCase().split(/\s+/)
      const lines = text.split('\n').filter(Boolean)

      const themeMap = {
        faith: ['god', 'lord', 'faith', 'grace', 'blessed', 'heaven', 'pray', 'spirit', 'jesus', 'holy'],
        struggle: ['fight', 'pain', 'hard', 'grind', 'rise', 'survive', 'overcome', 'hustle'],
        love: ['love', 'heart', 'feel', 'soul', 'together', 'forever', 'her', 'him'],
        motivation: ['win', 'never', 'stop', 'top', 'dream', 'real', 'prove', 'build'],
      }

      const detectedThemes = []
      for (const [theme, keywords] of Object.entries(themeMap)) {
        if (keywords.some((k) => words.includes(k))) detectedThemes.push(theme)
      }

      // Extract last word of each line as a rhyme token (last 3+ chars, lowercase, no punctuation)
      const endWords = lines
        .map((l) => l.trim().split(/\s+/).pop()?.replace(/[^a-z]/gi, '').toLowerCase() || '')
        .filter(Boolean)

      const rhymes = (a, b) => {
        if (!a || !b || a === b) return false
        const minLen = Math.min(a.length, b.length)
        const suffix = Math.min(4, minLen)
        return suffix >= 3 && a.slice(-suffix) === b.slice(-suffix)
      }

      // Score each pattern across 4-line windows
      const scores = { AABB: 0, ABAB: 0, ABCB: 0, chain: 0 }
      let windows = 0
      for (let i = 0; i + 3 < endWords.length; i += 4) {
        const [a, b, c, d] = endWords.slice(i, i + 4)
        windows++
        if (rhymes(a, b) && rhymes(c, d)) scores.AABB++
        if (rhymes(a, c) && rhymes(b, d)) scores.ABAB++
        if (rhymes(b, d) && !rhymes(a, c)) scores.ABCB++
        if (rhymes(a, b) && rhymes(b, c) && rhymes(c, d)) scores.chain++
      }

      // Only record schemes that appear in at least half the windows with a minimum of 1 hit
      const detectedSchemes = []
      if (windows > 0) {
        const threshold = Math.max(1, Math.floor(windows * 0.4))
        if (scores.chain >= threshold) detectedSchemes.push('chain rhyme')
        else if (scores.AABB >= threshold) detectedSchemes.push('AABB')
        else if (scores.ABAB >= threshold) detectedSchemes.push('ABAB')
        else if (scores.ABCB >= threshold) detectedSchemes.push('ABCB')
      }

      const newVocab = [...new Set(words.filter((w) => w.length >= 5))]

      const updated = {
        ...s.styleProfile,
        themes: [...new Set([...s.styleProfile.themes, ...detectedThemes])].slice(0, 10),
        rhymeSchemes: detectedSchemes.length > 0
          ? [...new Set([...s.styleProfile.rhymeSchemes, ...detectedSchemes])].slice(0, 5)
          : s.styleProfile.rhymeSchemes,
        vocabulary: [...new Set([...s.styleProfile.vocabulary, ...newVocab])].slice(0, 80),
        lyricsHistory: [...s.styleProfile.lyricsHistory, text].slice(-10),
      }

      saveProfile(updated)
      return { styleProfile: updated }
    })
  },

  resetStyleProfile: () => {
    saveProfile(DEFAULT_PROFILE)
    set({ styleProfile: DEFAULT_PROFILE })
  },

  // Actions: AI
  addAiMessage: (msg) => set((s) => {
    const messages = [...s.aiMessages, msg]
    writeChat(messages)

    // Auto-save AI songs that contain song sections — never lose a generated song
    if (msg.role === 'assistant') {
      const hasSections = msg.content.includes('[Verse') || msg.content.includes('[Chorus') || msg.content.includes('[Hook')
      if (hasSections) {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const autoName = `Auto-save ${dateStr} ${timestamp}`
        const sections = parseAiTextToSections(msg.content)
        const song = {
          id: Date.now(),
          name: autoName,
          savedAt: dateStr,
          rawText: msg.content,
          sections: sections || [],
          sectionCount: sections ? sections.length : 0,
          autoSaved: true,
        }
        const updated = [song, ...s.aiSongs].slice(0, 100)
        writeAiSongs(updated)
        return { aiMessages: messages, aiSongs: updated }
      }
    }

    return { aiMessages: messages }
  }),

  clearAiChat: () => {
    writeChat([])
    set({ aiMessages: [] })
  },

  setAiSuggestion: (text) => set({ aiSuggestion: text }),
  setAiTyping: (v) => set({ isAiTyping: v }),
  clearAiSuggestion: () => set({ aiSuggestion: null }),
  setLyricAnalysis: (result) => set({ lyricAnalysis: result }),
  clearLyricAnalysis: () => set({ lyricAnalysis: null }),

  // Actions: Song Patterns
  addSongPattern: (name, color, type) => {
    const id = Date.now()
    const steps = {}
    BEAT_INSTRUMENTS.forEach((inst) => { steps[inst] = Array(16).fill(false) })
    const pattern = {
      id, name: name || 'Pattern', color: color || '#00e5ff',
      type: type || 'beats', bars: 1, steps, melodyNotes: [],
      velocities: {}, swing: 0,
      createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }
    set((s) => {
      const songPatterns = [...s.songPatterns, pattern]
      writeSongPatterns(songPatterns)
      return { songPatterns }
    })
    return id
  },

  deleteSongPattern: (id) =>
    set((s) => {
      const songPatterns = s.songPatterns.filter((p) => p.id !== id)
      const arr = s.songArrangement
      const songArrangement = { ...arr, blocks: arr.blocks.filter((b) => b.patternId !== id) }
      writeSongPatterns(songPatterns)
      writeArrangement(songArrangement)
      return { songPatterns, songArrangement }
    }),

  updateSongPattern: (id, changes) =>
    set((s) => {
      const songPatterns = s.songPatterns.map((p) => (p.id === id ? { ...p, ...changes } : p))
      writeSongPatterns(songPatterns)
      return { songPatterns }
    }),

  // Actions: Song Arrangement
  addArrangementBlock: (patternId, rowId, startBar) =>
    set((s) => {
      const pat = s.songPatterns.find((p) => p.id === patternId)
      if (!pat) return {}
      // Remove any existing blocks that overlap this new block
      const patBars = pat.bars
      const existing = s.songArrangement.blocks.filter((b) => {
        if (b.rowId !== rowId) return true
        const bp = s.songPatterns.find((p) => p.id === b.patternId)
        if (!bp) return false
        return b.startBar + bp.bars <= startBar || b.startBar >= startBar + patBars
      })
      const block = { id: Date.now(), patternId, rowId, startBar }
      const songArrangement = { ...s.songArrangement, blocks: [...existing, block] }
      writeArrangement(songArrangement)
      return { songArrangement }
    }),

  removeArrangementBlock: (id) =>
    set((s) => {
      const songArrangement = { ...s.songArrangement, blocks: s.songArrangement.blocks.filter((b) => b.id !== id) }
      writeArrangement(songArrangement)
      return { songArrangement }
    }),

  addArrangementRow: (name, color) =>
    set((s) => {
      const row = { id: Date.now(), name: name || 'Row', color: color || '#888899' }
      const songArrangement = { ...s.songArrangement, rows: [...(s.songArrangement.rows || []), row] }
      writeArrangement(songArrangement)
      return { songArrangement }
    }),

  removeArrangementRow: (id) =>
    set((s) => {
      const rows   = s.songArrangement.rows.filter((r) => r.id !== id)
      const blocks = s.songArrangement.blocks.filter((b) => b.rowId !== id)
      const songArrangement = { rows, blocks }
      writeArrangement(songArrangement)
      return { songArrangement }
    }),

  // Actions: Piano Roll
  addPRNote: (note) => set((s) => {
    const notes = [...s.pianoRollNotes, note]
    savePRNotes(notes)
    return { pianoRollNotes: notes }
  }),

  removePRNote: (id) => set((s) => {
    const notes = s.pianoRollNotes.filter((n) => n.id !== id)
    savePRNotes(notes)
    return { pianoRollNotes: notes }
  }),

  updatePRNote: (id, changes) => set((s) => {
    const notes = s.pianoRollNotes.map((n) => n.id === id ? { ...n, ...changes } : n)
    savePRNotes(notes)
    return { pianoRollNotes: notes }
  }),

  clearPRNotes: () => {
    savePRNotes([])
    set({ pianoRollNotes: [] })
  },

  setPRNotes: (notes) => {
    savePRNotes(notes)
    set({ pianoRollNotes: notes })
  },

  // Actions: Patterns
  addPattern: (name, color, notes) => set((s) => {
    const pattern = {
      id: Date.now(),
      name,
      color: color || '#00e5ff',
      notes: JSON.parse(JSON.stringify(notes)),
      createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }
    const patterns = [pattern, ...s.patterns]
    writePatterns(patterns)
    return { patterns }
  }),

  deletePattern: (id) => set((s) => {
    const patterns = s.patterns.filter((p) => p.id !== id)
    writePatterns(patterns)
    return { patterns }
  }),

  // Actions: Annotations
  setStressAnnotation: (sectionId, lineIdx, wordIdx, level) =>
    set((s) => {
      const key = `${sectionId}:${lineIdx}:${wordIdx}`
      const stress = { ...s.annotations.stress, [key]: level }
      const annotations = { ...s.annotations, stress }
      writeAnnotations(annotations)
      return { annotations }
    }),

  setToneTag: (sectionId, lineIdx, tag) =>
    set((s) => {
      const key = `${sectionId}:${lineIdx}`
      const toneTag = { ...s.annotations.toneTag, [key]: tag }
      const annotations = { ...s.annotations, toneTag }
      writeAnnotations(annotations)
      return { annotations }
    }),

  setBeatMap: (sectionId, lineIdx, data) =>
    set((s) => {
      const key = `${sectionId}:${lineIdx}`
      const beatMap = { ...s.annotations.beatMap, [key]: data }
      const annotations = { ...s.annotations, beatMap }
      writeAnnotations(annotations)
      return { annotations }
    }),

  setContourAnnotation: (sectionId, lineIdx, points) =>
    set((s) => {
      const key = `${sectionId}:${lineIdx}`
      const contour = { ...s.annotations.contour, [key]: points }
      const annotations = { ...s.annotations, contour }
      writeAnnotations(annotations)
      return { annotations }
    }),

  setPerformanceAnnotation: (sectionId, data) =>
    set((s) => {
      const performance = { ...s.annotations.performance, [sectionId]: data }
      const annotations = { ...s.annotations, performance }
      writeAnnotations(annotations)
      return { annotations }
    }),

  // Actions: Automation
  setTrackAutomation: (trackId, param, points) =>
    set((s) => {
      const tracks = {
        ...s.automation.tracks,
        [trackId]: { ...(s.automation.tracks[trackId] || {}), [param]: points },
      }
      const automation = { ...s.automation, tracks }
      writeAutomation(automation)
      return { automation }
    }),

  setPatternAutomation: (patternId, param, points) =>
    set((s) => {
      const patterns = {
        ...s.automation.patterns,
        [patternId]: { ...(s.automation.patterns[patternId] || {}), [param]: points },
      }
      const automation = { ...s.automation, patterns }
      writeAutomation(automation)
      return { automation }
    }),

  clearSectionAnnotations: (sectionId) =>
    set((s) => {
      const filter = (obj) => {
        const out = {}
        for (const k of Object.keys(obj)) {
          if (!k.startsWith(`${sectionId}:`)) out[k] = obj[k]
        }
        return out
      }
      const annotations = {
        stress: filter(s.annotations.stress),
        toneTag: filter(s.annotations.toneTag),
        beatMap: filter(s.annotations.beatMap),
        contour: filter(s.annotations.contour),
        performance: { ...s.annotations.performance },
      }
      delete annotations.performance[sectionId]
      writeAnnotations(annotations)
      return { annotations }
    }),
}))
