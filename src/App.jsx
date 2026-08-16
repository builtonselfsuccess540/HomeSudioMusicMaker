import React, { useState, useCallback } from 'react'
import Transport from './components/shared/Transport'
import ArrangeView from './components/Arrange/ArrangeView'
import MixerView from './components/Mixer/MixerView'
import InstrumentsView from './components/Instruments/InstrumentsView'
import AICoPilotView from './components/AICoPilot/AICoPilotView'
import LyricsView from './components/Lyrics/LyricsView'
import ProjectsView from './components/Projects/ProjectsView'
import PianoRollView from './components/PianoRoll/PianoRollView'
import PatternsView from './components/Patterns/PatternsView'
import PluginsView  from './components/Plugins/PluginsView'
import EdisonView   from './components/Edison/EdisonView'
import NewtoneView  from './components/Newtone/NewtoneView'
import SessionView    from './components/Session/SessionView'
import ElasticAudioView from './components/ElasticAudio/ElasticAudioView'
import BeatMakerView  from './components/BeatMaker/BeatMakerView'
import ChordProgressionView from './components/ChordProgression/ChordProgressionView'
import SampleBrowserView from './components/SampleBrowser/SampleBrowserView'
import EffectsRackView   from './components/EffectsRack/EffectsRackView'
import ArpeggiatorView   from './components/Arpeggiator/ArpeggiatorView'
import BusRoutingView    from './components/BusRouting/BusRoutingView'
import RegionLoopView    from './components/RegionLoop/RegionLoopView'
import CollaborationView from './components/Collaboration/CollaborationView'
import LoopLibraryView  from './components/LoopLibrary/LoopLibraryView'
import ExportView       from './components/Export/ExportView'
import VisualizerView   from './components/Visualizer/VisualizerView'
import NotepadView      from './components/Notepad/NotepadView'
import MarketplaceView  from './components/Marketplace/MarketplaceView'
import ToneSynthView    from './components/ToneSynth/ToneSynthView'
import WaveformView     from './components/Waveform/WaveformView'
import MasteringSuiteView  from './components/MasteringSuite/MasteringSuiteView'
import SpectrumAnalyzerView from './components/SpectrumAnalyzer/SpectrumAnalyzerView'
import TransientShaperView  from './components/TransientShaper/TransientShaperView'
import AutoTuneView         from './components/AutoTune/AutoTuneView'
import TurntableView        from './components/Turntable/TurntableView'
import VocalRemovalView     from './components/VocalRemoval/VocalRemovalView'
import ProjectTemplatesView  from './components/ProjectTemplates/ProjectTemplatesView'
import GranularSynthView    from './components/GranularSynth/GranularSynthView'
import SampleSlicerView     from './components/SampleSlicer/SampleSlicerView'
import VocoderView          from './components/Vocoder/VocoderView'
import ChordDictionaryView  from './components/ChordDictionary/ChordDictionaryView'
import VocalChainView       from './components/VocalChain/VocalChainView'
import VocalDoublerView     from './components/VocalDoubler/VocalDoublerView'
import DeEsserView          from './components/DeEsser/DeEsserView'
import LyricAnalyzerView    from './components/LyricAnalyzer/LyricAnalyzerView'
import VideoEditorView      from './components/VideoEditor/VideoEditorView'
import AIVideoCreatorView   from './components/AIVideoCreator/AIVideoCreatorView'
import AIMusicVideoGenView  from './components/AIMusicVideoGen/AIMusicVideoGenView'
import AIDreamStudioView    from './components/AIDreamStudio/AIDreamStudioView'

// Maps tab id → component so we can render dynamically
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
