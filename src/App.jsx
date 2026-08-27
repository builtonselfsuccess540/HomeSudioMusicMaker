import React, { useState, useCallback, Suspense, lazy } from 'react'
import Transport from './components/shared/Transport'

// Lazy-loaded tab views — each tab only loads its JS when first visited,
// keeping startup fast even with 50+ components.
const ArrangeView         = lazy(() => import('./components/Arrange/ArrangeView'))
const MixerView           = lazy(() => import('./components/Mixer/MixerView'))
const InstrumentsView     = lazy(() => import('./components/Instruments/InstrumentsView'))
const AICoPilotView       = lazy(() => import('./components/AICoPilot/AICoPilotView'))
const LyricsView          = lazy(() => import('./components/Lyrics/LyricsView'))
const ProjectsView        = lazy(() => import('./components/Projects/ProjectsView'))
const PianoRollView       = lazy(() => import('./components/PianoRoll/PianoRollView'))
const PatternsView        = lazy(() => import('./components/Patterns/PatternsView'))
const PluginsView         = lazy(() => import('./components/Plugins/PluginsView'))
const EdisonView          = lazy(() => import('./components/Edison/EdisonView'))
const NewtoneView         = lazy(() => import('./components/Newtone/NewtoneView'))
const SessionView         = lazy(() => import('./components/Session/SessionView'))
const ElasticAudioView    = lazy(() => import('./components/ElasticAudio/ElasticAudioView'))
const BeatMakerView       = lazy(() => import('./components/BeatMaker/BeatMakerView'))
const ChordProgressionView= lazy(() => import('./components/ChordProgression/ChordProgressionView'))
const SampleBrowserView   = lazy(() => import('./components/SampleBrowser/SampleBrowserView'))
const EffectsRackView     = lazy(() => import('./components/EffectsRack/EffectsRackView'))
const ArpeggiatorView     = lazy(() => import('./components/Arpeggiator/ArpeggiatorView'))
const BusRoutingView      = lazy(() => import('./components/BusRouting/BusRoutingView'))
const RegionLoopView      = lazy(() => import('./components/RegionLoop/RegionLoopView'))
const CollaborationView   = lazy(() => import('./components/Collaboration/CollaborationView'))
const LoopLibraryView     = lazy(() => import('./components/LoopLibrary/LoopLibraryView'))
const ExportView          = lazy(() => import('./components/Export/ExportView'))
const VisualizerView      = lazy(() => import('./components/Visualizer/VisualizerView'))
const NotepadView         = lazy(() => import('./components/Notepad/NotepadView'))
const MarketplaceView     = lazy(() => import('./components/Marketplace/MarketplaceView'))
const ToneSynthView       = lazy(() => import('./components/ToneSynth/ToneSynthView'))
const WaveformView        = lazy(() => import('./components/Waveform/WaveformView'))
const MasteringSuiteView  = lazy(() => import('./components/MasteringSuite/MasteringSuiteView'))
const SpectrumAnalyzerView= lazy(() => import('./components/SpectrumAnalyzer/SpectrumAnalyzerView'))
const TransientShaperView = lazy(() => import('./components/TransientShaper/TransientShaperView'))
const AutoTuneView        = lazy(() => import('./components/AutoTune/AutoTuneView'))
const TurntableView       = lazy(() => import('./components/Turntable/TurntableView'))
const VocalRemovalView    = lazy(() => import('./components/VocalRemoval/VocalRemovalView'))
const ProjectTemplatesView= lazy(() => import('./components/ProjectTemplates/ProjectTemplatesView'))
const GranularSynthView   = lazy(() => import('./components/GranularSynth/GranularSynthView'))
const SampleSlicerView    = lazy(() => import('./components/SampleSlicer/SampleSlicerView'))
const VocoderView         = lazy(() => import('./components/Vocoder/VocoderView'))
const ChordDictionaryView = lazy(() => import('./components/ChordDictionary/ChordDictionaryView'))
const VocalChainView      = lazy(() => import('./components/VocalChain/VocalChainView'))
const VocalDoublerView    = lazy(() => import('./components/VocalDoubler/VocalDoublerView'))
const DeEsserView         = lazy(() => import('./components/DeEsser/DeEsserView'))
const LyricAnalyzerView   = lazy(() => import('./components/LyricAnalyzer/LyricAnalyzerView'))
const VideoEditorView     = lazy(() => import('./components/VideoEditor/VideoEditorView'))
const AIVideoCreatorView  = lazy(() => import('./components/AIVideoCreator/AIVideoCreatorView'))
const AIMusicVideoGenView = lazy(() => import('./components/AIMusicVideoGen/AIMusicVideoGenView'))
const AIDreamStudioView   = lazy(() => import('./components/AIDreamStudio/AIDreamStudioView'))
const GhostwritingView    = lazy(() => import('./components/Ghostwriting/GhostwritingView'))

// Maps tab id → lazy component
const TAB_VIEWS = {
  arrange:    ArrangeView,
  session:    SessionView,
  mixer:      MixerView,
  instruments:InstrumentsView,
  ai:         AICoPilotView,
  lyrics:     LyricsView,
  projects:   ProjectsView,
  pianoroll:  PianoRollView,
  patterns:   PatternsView,
  beatmaker:  BeatMakerView,
  chords:     ChordProgressionView,
  samples:    SampleBrowserView,
  fxrack:     EffectsRackView,
  arpeggio:   ArpeggiatorView,
  busroute:   BusRoutingView,
  plugins:    PluginsView,
  edison:     EdisonView,
  elastic:    ElasticAudioView,
  newtone:    NewtoneView,
  regionloop: RegionLoopView,
  collab:     CollaborationView,
  library:    LoopLibraryView,
  export:     ExportView,
  visualizer: VisualizerView,
  notepad:    NotepadView,
  market:     MarketplaceView,
  tonesynth:  ToneSynthView,
  waveform:   WaveformView,
  mastering:  MasteringSuiteView,
  spectrum:   SpectrumAnalyzerView,
  transient:  TransientShaperView,
  autotune:   AutoTuneView,
  turntable:  TurntableView,
  vocalremove:VocalRemovalView,
  templates:  ProjectTemplatesView,
  granular:   GranularSynthView,
  slicer:     SampleSlicerView,
  vocoder:    VocoderView,
  chorddict:  ChordDictionaryView,
  vocalchain:   VocalChainView,
  vocaldoubler: VocalDoublerView,
  deesser:      DeEsserView,
  lyricanalyzer: LyricAnalyzerView,
  videoeditor:   VideoEditorView,
  aivideocreator:  AIVideoCreatorView,
  aimusicvideogen: AIMusicVideoGenView,
  aidreamstudio:   AIDreamStudioView,
  ghostwriting:    GhostwritingView,
}

const TABS = [
  { id: 'arrange',    label: 'Arrange',     icon: '≡' },
  { id: 'session',    label: 'Session',     icon: '⬡' },
  { id: 'mixer',      label: 'Mixer',       icon: '⚡' },
  { id: 'instruments',label: 'Instruments', icon: '♪' },
  { id: 'pianoroll',  label: 'Piano Roll',  icon: '⬛' },
  { id: 'patterns',   label: 'Patterns',    icon: '▦' },
  { id: 'beatmaker',  label: 'Beat Maker',  icon: '⬛' },
  { id: 'chords',     label: 'Chords',      icon: '♯' },
  { id: 'samples',    label: 'Samples',     icon: '♫' },
  { id: 'fxrack',    label: 'FX Rack',     icon: '⚙' },
  { id: 'arpeggio',  label: 'Arpeggiator', icon: '↑' },
  { id: 'busroute',  label: 'Bus Routing', icon: '⇆' },
  { id: 'plugins',    label: 'Plugins',     icon: '🔌' },
  { id: 'edison',     label: 'Edison',      icon: '⏺' },
  { id: 'elastic',    label: 'Elastic',     icon: '⇔' },
  { id: 'newtone',    label: 'Newtone',     icon: '♬' },
  { id: 'regionloop', label: 'Region Loop',  icon: '⟳' },
  { id: 'collab',     label: 'Collaborate', icon: '☁' },
  { id: 'library',    label: 'Library',     icon: '♫' },
  { id: 'export',     label: 'Export',      icon: '↓' },
  { id: 'visualizer', label: 'Visualizer',  icon: '◉' },
  { id: 'notepad',    label: 'Notepad',     icon: '✍' },
  { id: 'market',     label: 'Marketplace', icon: '♬' },
  { id: 'tonesynth',  label: 'Tone Synth',  icon: '♪' },
  { id: 'waveform',   label: 'Waveform',    icon: '〜' },
  { id: 'mastering',  label: 'Mastering',   icon: '◉' },
  { id: 'spectrum',   label: 'Spectrum',    icon: '▇' },
  { id: 'transient',  label: 'Transient',   icon: '⚡' },
  { id: 'autotune',   label: 'Auto-Tune',   icon: '♬' },
  { id: 'turntable',  label: 'Turntable',   icon: '◎' },
  { id: 'vocalremove',label: 'Vocal Remove',icon: '✂' },
  { id: 'templates',  label: 'Templates',   icon: '⊞' },
  { id: 'granular',   label: 'Granular',    icon: '◎' },
  { id: 'slicer',     label: 'Slicer',      icon: '✂' },
  { id: 'vocoder',    label: 'Vocoder',     icon: '♫' },
  { id: 'chorddict',  label: 'Chord Dict',  icon: '♯' },
  { id: 'vocalchain',   label: 'Vocal Chain',    icon: '🎤' },
  { id: 'vocaldoubler', label: 'Vocal Doubler',  icon: '⇆' },
  { id: 'deesser',      label: 'De-Esser',       icon: '✂' },
  { id: 'ai',           label: 'AI Co-Pilot',    icon: '◈' },
  { id: 'lyrics',     label: 'Lyrics',      icon: '✍' },
  { id: 'lyricanalyzer', label: 'Lyric Analyzer', icon: '🔍' },
  { id: 'videoeditor',    label: 'Video Editor',    icon: '🎬' },
  { id: 'aivideocreator',  label: 'AI Video Creator',  icon: '✦' },
  { id: 'aimusicvideogen', label: 'Music Video Gen',   icon: '🎥' },
  { id: 'aidreamstudio',  label: 'AI Dream Studio',  icon: '✨' },
  { id: 'ghostwriting', label: 'Ghostwriting', icon: '✍' },
  { id: 'projects',   label: 'Projects',    icon: '◫' },
]

export default function App() {
  const [activeTab,   setActiveTab]   = useState('arrange')
  // Track which tabs have ever been visited — those stay mounted in the background.
  // First visit mounts the component; subsequent tab switches just show/hide it.
  const [mountedTabs, setMountedTabs] = useState(() => new Set(['arrange']))

  const handleTabClick = useCallback((id) => {
    setMountedTabs(prev => { const n = new Set(prev); n.add(id); return n })
    setActiveTab(id)
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: '#080810' }}>
      {/* Top transport bar */}
      <Transport />

      {/* Tab bar */}
      <div className="flex flex-wrap items-end bg-studio-panel border-b border-studio-border px-2 shrink-0">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-ui font-semibold tracking-wide transition-all ${
                isActive
                  ? 'text-studio-text tab-active'
                  : 'text-studio-dim hover:text-studio-text'
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              {tab.label}
              {isActive && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{
                    background: tab.id === 'ai'
                      ? 'linear-gradient(90deg, #b44fff, #00e5ff)'
                      : tab.id === 'lyrics'
                      ? '#00ff9d'
                      : tab.id === 'mixer'
                      ? '#ffe600'
                      : tab.id === 'instruments'
                      ? '#b44fff'
                      : tab.id === 'projects'
                      ? '#ff9500'
                      : tab.id === 'pianoroll'
                      ? 'linear-gradient(90deg, #00e5ff, #00ff9d)'
                      : tab.id === 'patterns'
                      ? '#ffe600'
                      : tab.id === 'beatmaker'
                      ? 'linear-gradient(90deg, #ff2d55, #ff9500)'
                      : tab.id === 'chords'
                      ? 'linear-gradient(90deg, #00e5ff, #b44fff)'
                      : tab.id === 'samples'
                      ? '#ff9500'
                      : tab.id === 'fxrack'
                      ? '#ff2d55'
                      : tab.id === 'arpeggio'
                      ? '#b44fff'
                      : tab.id === 'busroute'
                      ? '#ffe600'
                      : tab.id === 'session'
                      ? '#00ff9d'
                      : tab.id === 'plugins'
                      ? '#ff2d55'
                      : tab.id === 'edison'
                      ? '#ff6b35'
                      : tab.id === 'elastic'
                      ? '#ff9500'
                      : tab.id === 'newtone'
                      ? '#a8ff78'
                      : tab.id === 'regionloop'
                      ? 'linear-gradient(90deg, #00e5ff, #00ff9d)'
                      : tab.id === 'collab'
                      ? 'linear-gradient(90deg, #00e5ff, #b44fff)'
                      : tab.id === 'library'
                      ? 'linear-gradient(90deg, #ff9500, #ffe600)'
                      : tab.id === 'export'
                      ? 'linear-gradient(90deg, #00ff9d, #00e5ff)'
                      : tab.id === 'visualizer'
                      ? 'linear-gradient(90deg, #00e5ff, #b44fff)'
                      : tab.id === 'notepad'
                      ? '#00ff9d'
                      : tab.id === 'market'
                      ? '#ff9500'
                      : tab.id === 'tonesynth'
                      ? 'linear-gradient(90deg, #b44fff, #00e5ff)'
                      : tab.id === 'waveform'
                      ? '#00e5ff'
                      : tab.id === 'mastering'
                      ? 'linear-gradient(90deg, #00ff9d, #00e5ff)'
                      : tab.id === 'spectrum'
                      ? '#00e5ff'
                      : tab.id === 'transient'
                      ? 'linear-gradient(90deg, #ff9500, #ff2d55)'
                      : tab.id === 'autotune'
                      ? 'linear-gradient(90deg, #b44fff, #00e5ff)'
                      : tab.id === 'turntable'
                      ? 'linear-gradient(90deg, #00e5ff, #ff9500)'
                      : tab.id === 'vocalremove'
                      ? 'linear-gradient(90deg, #ff2d55, #b44fff)'
                      : tab.id === 'templates'
                      ? 'linear-gradient(90deg, #00ff9d, #ffe600)'
                      : tab.id === 'granular'
                      ? 'linear-gradient(90deg, #ff9500, #b44fff)'
                      : tab.id === 'slicer'
                      ? 'linear-gradient(90deg, #ff2d55, #ff9500)'
                      : tab.id === 'vocoder'
                      ? 'linear-gradient(90deg, #b44fff, #00e5ff)'
                      : tab.id === 'chorddict'
                      ? 'linear-gradient(90deg, #00e5ff, #00ff9d)'
                      : tab.id === 'vocalchain'
                      ? 'linear-gradient(90deg, #b44fff, #ff9500)'
                      : tab.id === 'vocaldoubler'
                      ? 'linear-gradient(90deg, #ff2d55, #00e5ff)'
                      : tab.id === 'deesser'
                      ? 'linear-gradient(90deg, #ff2d55, #ff9500)'
                      : tab.id === 'videoeditor'
                      ? 'linear-gradient(90deg, #ff2d55, #b44fff, #00e5ff)'
                      : tab.id === 'aivideocreator'
                      ? 'linear-gradient(90deg, #ff2d55, #b44fff, #00e5ff)'
                      : tab.id === 'aimusicvideogen'
                      ? 'linear-gradient(90deg, #00ff9d, #00e5ff, #b44fff)'
                      : tab.id === 'aidreamstudio'
                      ? 'linear-gradient(90deg, #ff2d55, #b44fff, #00e5ff, #00ff9d)'
                      : '#00e5ff',
                    boxShadow: `0 0 8px ${
                      tab.id === 'ai' ? 'rgba(0,229,255,0.5)'
                      : tab.id === 'lyrics' ? 'rgba(0,255,157,0.5)'
                      : tab.id === 'mixer' ? 'rgba(255,230,0,0.5)'
                      : tab.id === 'instruments' ? 'rgba(180,79,255,0.5)'
                      : tab.id === 'projects' ? 'rgba(255,149,0,0.5)'
                      : tab.id === 'pianoroll' ? 'rgba(0,229,255,0.4)'
                      : tab.id === 'patterns' ? 'rgba(255,230,0,0.4)'
                      : tab.id === 'beatmaker' ? 'rgba(255,45,85,0.5)'
                      : tab.id === 'chords'    ? 'rgba(0,229,255,0.5)'
                      : tab.id === 'samples'   ? 'rgba(255,149,0,0.5)'
                      : tab.id === 'fxrack'    ? 'rgba(255,45,85,0.5)'
                      : tab.id === 'arpeggio'  ? 'rgba(180,79,255,0.5)'
                      : tab.id === 'busroute'  ? 'rgba(255,230,0,0.5)'
                      : tab.id === 'session'   ? 'rgba(0,255,157,0.5)'
                      : tab.id === 'plugins'  ? 'rgba(255,45,85,0.5)'
                      : tab.id === 'edison'   ? 'rgba(255,107,53,0.5)'
                      : tab.id === 'elastic'  ? 'rgba(255,149,0,0.5)'
                      : tab.id === 'newtone'      ? 'rgba(168,255,120,0.5)'
                      : tab.id === 'regionloop'  ? 'rgba(0,229,255,0.5)'
                      : tab.id === 'collab'      ? 'rgba(180,79,255,0.5)'
                      : tab.id === 'library'    ? 'rgba(255,149,0,0.5)'
                      : tab.id === 'export'      ? 'rgba(0,255,157,0.5)'
                      : tab.id === 'visualizer'  ? 'rgba(180,79,255,0.5)'
                      : tab.id === 'notepad'     ? 'rgba(0,255,157,0.5)'
                      : tab.id === 'market'      ? 'rgba(255,149,0,0.5)'
                      : tab.id === 'tonesynth'   ? 'rgba(180,79,255,0.5)'
                      : tab.id === 'waveform'    ? 'rgba(0,229,255,0.5)'
                      : tab.id === 'mastering'   ? 'rgba(0,255,157,0.5)'
                      : tab.id === 'spectrum'    ? 'rgba(0,229,255,0.5)'
                      : tab.id === 'transient'   ? 'rgba(255,149,0,0.5)'
                      : tab.id === 'autotune'    ? 'rgba(180,79,255,0.5)'
                      : tab.id === 'turntable'   ? 'rgba(0,229,255,0.5)'
                      : tab.id === 'vocalremove' ? 'rgba(255,45,85,0.5)'
                      : tab.id === 'templates'   ? 'rgba(0,255,157,0.5)'
                      : tab.id === 'granular'    ? 'rgba(255,149,0,0.5)'
                      : tab.id === 'slicer'      ? 'rgba(255,45,85,0.5)'
                      : tab.id === 'vocoder'     ? 'rgba(180,79,255,0.5)'
                      : tab.id === 'chorddict'   ? 'rgba(0,229,255,0.5)'
                      : tab.id === 'vocalchain'    ? 'rgba(180,79,255,0.5)'
                      : tab.id === 'vocaldoubler'  ? 'rgba(255,45,85,0.5)'
                      : tab.id === 'deesser'        ? 'rgba(255,45,85,0.5)'
                      : tab.id === 'videoeditor'     ? 'rgba(180,79,255,0.5)'
                      : tab.id === 'aivideocreator'  ? 'rgba(180,79,255,0.5)'
                      : tab.id === 'aimusicvideogen' ? 'rgba(0,229,255,0.5)'
                      : tab.id === 'aidreamstudio'  ? 'rgba(180,79,255,0.5)'
                      : 'rgba(0,229,255,0.5)'
                    }`,
                  }}
                />
              )}
            </button>
          )
        })}

        {/* Version tag */}
        <div className="ml-auto px-3 pb-2 flex items-center">
          <span className="font-mono text-xs text-studio-muted">v0.1.0</span>
        </div>
      </div>

      {/* Main content — keep-alive: each tab mounts once, then hides/shows via CSS */}
      <div className="flex-1 overflow-hidden relative">
        <Suspense fallback={<div style={{ color: '#666', padding: 24, fontFamily: 'monospace' }}>Loading…</div>}>
          {[...mountedTabs].map(id => {
            const View = TAB_VIEWS[id]
            if (!View) return null
            const isActive = id === activeTab
            return (
              <div
                key={id}
                style={{
                  position: 'absolute', inset: 0,
                  display: isActive ? 'block' : 'none',
                  overflow: 'auto',
                }}
              >
                {id === 'projects'
                  ? <View onSwitchToLyrics={() => handleTabClick('lyrics')} />
                  : <View />
                }
              </div>
            )
          })}
        </Suspense>
      </div>

      {/* Bottom status bar */}
      <div className="flex items-center gap-4 px-4 py-1 bg-studio-panel border-t border-studio-border shrink-0">
        <span
          className="font-display text-xs tracking-widest uppercase"
          style={{
            background: 'linear-gradient(90deg, #00e5ff, #b44fff)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Home Studio Music Maker
        </span>
        <div className="w-px h-3 bg-studio-border" />
        <span className="font-mono text-xs text-studio-dim">Powered by Claude AI</span>
        <div className="flex-1" />
        <span className="font-mono text-xs text-studio-dim">
          {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}
