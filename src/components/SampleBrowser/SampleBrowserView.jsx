import React, { useState, useRef, useCallback, useEffect } from 'react'
import { getCtx } from '../../audio/audioEngine'

const AUDIO_EXTS = ['.wav','.mp3','.ogg','.flac','.aiff','.aif','.m4a','.opus']
const EXT_COLOR  = { WAV:'#00e5ff', MP3:'#b44fff', OGG:'#00ff9d', FLAC:'#ffe600',
                     AIFF:'#ff9500', AIF:'#ff9500', M4A:'#ff2d55', OPUS:'#a8ff78' }

function isAudio(name) { return AUDIO_EXTS.some(e => name.toLowerCase().endsWith(e)) }
function extOf(name)   { return name.split('.').pop().toUpperCase() }
function fmtSize(b)    { return b < 1024*1024 ? `${(b/1024).toFixed(0)} KB` : `${(b/1024/1024).toFixed(1)} MB` }

async function decodeAndPeaks(arrayBuffer, points = 200) {
  const c = getCtx()
  try {
    const buf = await c.decodeAudioData(arrayBuffer.slice(0))
    const data = buf.getChannelData(0)
    const block = Math.floor(data.length / points)
    const peaks = []
    for (let i = 0; i < points; i++) {
      let max = 0
      for (let j = 0; j < block; j++) { const v = Math.abs(data[i * block + j]); if (v > max) max = v }
      peaks.push(max)
    }
    return { peaks, duration: buf.duration, sampleRate: buf.sampleRate, channels: buf.numberOfChannels }
  } catch { return null }
}

// ─── Waveform canvas ─────────────────────────────────────────────

function WaveformCanvas({ peaks, color, progress = 0, height = 80, width = null }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !peaks) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const bw = w / peaks.length
    const cutoff = progress * peaks.length
    peaks.forEach((p, i) => {
      const bh = Math.max(1, p * (h - 2))
      ctx.fillStyle = i < cutoff ? color : `${color}44`
      ctx.fillRect(i * bw, (h - bh) / 2, Math.max(1, bw - 0.5), bh)
    })
    if (progress > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.fillRect(progress * w - 0.5, 0, 1, h)
    }
  }, [peaks, color, progress])

  return (
    <canvas
      ref={canvasRef}
      width={width || 248}
      height={height}
      style={{ display: 'block', width: '100%', height }}
    />
  )
}

// ─── File row ────────────────────────────────────────────────────

function FileRow({ file, selected, fav, onSelect, onFav, onPreview, isPreviewing }) {
  const color = EXT_COLOR[extOf(file.name)] || '#888'
  return (
    <div
      draggable
      onDragStart={(e) => {
        if (!window.__sampleURLs) window.__sampleURLs = {}
        if (!window.__sampleURLs[file.id]) window.__sampleURLs[file.id] = URL.createObjectURL(file.blob)
        e.dataTransfer.setData('sampleId', file.id)
        e.dataTransfer.setData('sampleName', file.name)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={onSelect}
      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer select-none transition-all hover:brightness-125"
      style={{
        background: selected ? '#1a1a3a' : 'transparent',
        border: `1px solid ${selected ? '#2a2a5a' : 'transparent'}`,
      }}
    >
      {/* Format badge */}
      <div className="shrink-0 w-9 text-center rounded px-0.5 py-0.5 text-xs font-mono font-bold"
           style={{ background: `${color}22`, color, fontSize: 9 }}>
        {extOf(file.name)}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-ui truncate" style={{ color: selected ? '#e0e0e0' : '#999' }}>
          {file.name}
        </div>
        <div className="text-xs font-mono" style={{ color: '#444', fontSize: 9 }}>{fmtSize(file.size)}</div>
      </div>

      {/* Fav */}
      <button onClick={(e) => { e.stopPropagation(); onFav() }}
              className="shrink-0 text-sm transition-all"
              style={{ color: fav ? '#ff9500' : '#2a2a2a' }}>★</button>

      {/* Play */}
      <button onClick={(e) => { e.stopPropagation(); onPreview() }}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-xs transition-all"
              style={{
                background: isPreviewing ? '#00ff9d22' : '#111120',
                border: `1px solid ${isPreviewing ? '#00ff9d' : '#1a1a2e'}`,
                color: isPreviewing ? '#00ff9d' : '#555',
              }}>
        {isPreviewing ? '■' : '▶'}
      </button>
    </div>
  )
}

// ─── Detail panel ────────────────────────────────────────────────

function DetailPanel({ file, meta, fav, isPreviewing, previewPos, onFav, onPreview }) {
  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: '#333' }}>
        <div style={{ fontSize: 32 }}>♪</div>
        <div className="text-xs font-mono text-center">Select a sample<br/>to preview</div>
      </div>
    )
  }

  const color = EXT_COLOR[extOf(file.name)] || '#888'
  const fmtDur = (s) => s ? `${Math.floor(s/60)}:${(s%60).toFixed(2).padStart(5,'0')}` : '—'

  return (
    <div className="flex flex-col p-4 gap-3 h-full overflow-y-auto">
      {/* Name */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-ui font-semibold break-all" style={{ color: '#e0e0e0' }}>{file.name}</div>
          <div className="flex gap-1 mt-1 flex-wrap">
            <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background:`${color}22`, color, fontSize:9 }}>{extOf(file.name)}</span>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background:'#1a1a2e', color:'#666', fontSize:9 }}>{fmtSize(file.size)}</span>
            {meta && <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background:'#1a1a2e', color:'#666', fontSize:9 }}>{meta.sampleRate/1000}kHz</span>}
            {meta && <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background:'#1a1a2e', color:'#666', fontSize:9 }}>{meta.channels}ch</span>}
          </div>
        </div>
        <button onClick={onFav} className="text-xl shrink-0" style={{ color: fav ? '#ff9500' : '#333' }}>
          {fav ? '★' : '☆'}
        </button>
      </div>

      {/* Waveform */}
      <div className="rounded-lg overflow-hidden" style={{ background:'#111120', border:'1px solid #1a1a2e' }}>
        {meta?.peaks
          ? <WaveformCanvas peaks={meta.peaks} color={color} progress={previewPos} height={80} />
          : <div className="flex items-center justify-center" style={{ height:80, color:'#333', fontSize:12 }}>Loading waveform…</div>
        }
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full overflow-hidden" style={{ background:'#1a1a2e' }}>
        <div className="h-full rounded-full transition-none" style={{ width:`${previewPos*100}%`, background:color }} />
      </div>

      {/* Duration */}
      {meta && (
        <div className="text-xs font-mono text-center" style={{ color:'#555' }}>
          {fmtDur(meta.duration)} — {meta.sampleRate} Hz — {meta.channels === 1 ? 'Mono' : 'Stereo'}
        </div>
      )}

      {/* Play button */}
      <button onClick={onPreview}
              className="py-2 rounded font-ui font-semibold text-sm transition-all"
              style={{
                background: isPreviewing ? `${color}22` : '#1a1a2e',
                border: `1px solid ${isPreviewing ? color : '#2a2a3e'}`,
                color: isPreviewing ? color : '#888',
                boxShadow: isPreviewing ? `0 0 10px ${color}44` : 'none',
              }}>
        {isPreviewing ? '■ Stop' : '▶ Preview'}
      </button>

      {/* Folder */}
      {file.folder && (
        <div className="text-xs font-mono" style={{ color:'#444' }}>
          📁 {file.folder}
        </div>
      )}

      {/* Drag hint */}
      <div className="text-xs font-mono text-center" style={{ color:'#2a2a2a' }}>
        Drag into Session or Arrange
      </div>
    </div>
  )
}

// ─── Main view ───────────────────────────────────────────────────

export default function SampleBrowserView() {
  const [files,        setFiles]        = useState([])
  const [selected,     setSelected]     = useState(null)
  const [meta,         setMeta]         = useState(null)   // decoded info for selected
  const [favs,         setFavs]         = useState(() => {
    try { return JSON.parse(localStorage.getItem('sb-favs') || '[]') } catch { return [] }
  })
  const [search,       setSearch]       = useState('')
  const [filterFavs,   setFilterFavs]   = useState(false)
  const [filterExt,    setFilterExt]    = useState('All')
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewPos,   setPreviewPos]   = useState(0)
  const [loadingMeta,  setLoadingMeta]  = useState(false)

  const previewSrcRef = useRef(null)
  const rafRef        = useRef(null)
  const startMsRef    = useRef(0)
  const durRef        = useRef(0)

  // ── Favorites ──────────────────────────────────────────────────
  const toggleFav = (id) => {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
      localStorage.setItem('sb-favs', JSON.stringify(next))
      return next
    })
  }

  // ── File loading ───────────────────────────────────────────────
  const addFiles = useCallback(async (fileList) => {
    const audio = Array.from(fileList).filter(f => isAudio(f.name))
    const items = audio.map(f => ({
      id:     f.name + f.size,
      name:   f.name,
      folder: '',
      size:   f.size,
      blob:   f,
    }))
    setFiles(prev => {
      const ids = new Set(prev.map(f => f.id))
      return [...prev, ...items.filter(i => !ids.has(i.id))]
    })
  }, [])

  const openFolder = async () => {
    if (typeof window.showDirectoryPicker !== 'function') return
    try {
      const dir = await window.showDirectoryPicker({ mode: 'read' })
      const items = []
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && isAudio(entry.name)) {
          const f = await entry.getFile()
          items.push({ id: dir.name + '/' + entry.name, name: entry.name, folder: dir.name, size: f.size, blob: f })
        }
      }
      setFiles(prev => {
        const ids = new Set(prev.map(f => f.id))
        return [...prev, ...items.filter(i => !ids.has(i.id))]
      })
    } catch (e) { if (e.name !== 'AbortError') console.error(e) }
  }

  // ── Preview ────────────────────────────────────────────────────
  const stopPreview = useCallback(() => {
    if (previewSrcRef.current) { try { previewSrcRef.current.stop() } catch {} previewSrcRef.current = null }
    cancelAnimationFrame(rafRef.current)
    setIsPreviewing(false)
    setPreviewPos(0)
  }, [])

  const playPreview = useCallback(async (file) => {
    stopPreview()
    const ab = await file.blob.arrayBuffer()
    const c = getCtx()
    c.decodeAudioData(ab, (buf) => {
      durRef.current = buf.duration
      const src = c.createBufferSource()
      src.buffer = buf
      src.connect(c.destination)
      src.start()
      src.onended = () => { previewSrcRef.current = null; setIsPreviewing(false); cancelAnimationFrame(rafRef.current); setPreviewPos(0) }
      previewSrcRef.current = src
      startMsRef.current = performance.now()
      const tick = () => {
        if (!previewSrcRef.current) return
        setPreviewPos(Math.min((performance.now() - startMsRef.current) / 1000 / durRef.current, 1))
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
      setIsPreviewing(true)
    })
  }, [stopPreview])

  // ── Select + decode waveform ───────────────────────────────────
  const selectFile = useCallback(async (file) => {
    setSelected(file)
    setMeta(null)
    setLoadingMeta(true)
    const ab = await file.blob.arrayBuffer()
    const result = await decodeAndPeaks(ab)
    setMeta(result)
    setLoadingMeta(false)
  }, [])

  useEffect(() => () => stopPreview(), [stopPreview])

  // ── Filtering ──────────────────────────────────────────────────
  const allExts = ['All', ...new Set(files.map(f => extOf(f.name)))]
  const filtered = files.filter(f => {
    if (filterFavs && !favs.includes(f.id)) return false
    if (filterExt !== 'All' && extOf(f.name) !== filterExt) return false
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const folders = [...new Set(filtered.map(f => f.folder || '(root)'))]

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background:'#09090f', color:'#e0e0e0' }}>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0 flex-wrap"
           style={{ borderColor:'#1a1a2e', background:'#0d0d1a' }}>
        <span className="font-display text-sm tracking-widest uppercase shrink-0"
              style={{ background:'linear-gradient(90deg,#ff9500,#ffe600)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Sample Browser
        </span>
        <div className="w-px h-4 shrink-0" style={{ background:'#1a1a2e' }} />

        {typeof window.showDirectoryPicker === 'function' && (
          <button onClick={openFolder}
                  className="text-xs px-3 py-1 rounded font-ui transition-all shrink-0"
                  style={{ background:'#1a1a2e', border:'1px solid #2a2a3e', color:'#ff9500' }}>
            + Open Folder
          </button>
        )}

        <label className="text-xs px-3 py-1 rounded font-ui cursor-pointer shrink-0 transition-all"
               style={{ background:'#1a1a2e', border:'1px solid #2a2a3e', color:'#ffe600' }}>
          + Add Files
          <input type="file" multiple accept={AUDIO_EXTS.join(',')}
                 onChange={e => { addFiles(e.target.files); e.target.value = '' }} className="hidden" />
        </label>

        <div className="w-px h-4 shrink-0" style={{ background:'#1a1a2e' }} />

        <input type="text" placeholder="Search…" value={search}
               onChange={e => setSearch(e.target.value)}
               className="text-xs px-3 py-1 rounded font-mono w-36"
               style={{ background:'#111120', border:'1px solid #1a1a2e', color:'#e0e0e0' }} />

        {/* Ext filter */}
        <select value={filterExt} onChange={e => setFilterExt(e.target.value)}
                className="text-xs px-2 py-1 rounded font-mono"
                style={{ background:'#1a1a2e', border:'1px solid #2a2a3e', color:'#888' }}>
          {allExts.map(e => <option key={e}>{e}</option>)}
        </select>

        {/* Favs filter */}
        <button onClick={() => setFilterFavs(v => !v)}
                className="text-xs px-2 py-1 rounded font-ui transition-all shrink-0"
                style={{ background: filterFavs ? '#ff950022' : 'transparent',
                         border: `1px solid ${filterFavs ? '#ff9500' : '#1a1a2e'}`,
                         color:   filterFavs ? '#ff9500' : '#555' }}>
          ★ Favorites
        </button>

        <div className="flex-1" />
        <span className="text-xs font-mono shrink-0" style={{ color:'#444' }}>
          {filtered.length} file{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* File list */}
        <div className="flex-1 overflow-y-auto p-2" style={{ borderRight:'1px solid #1a1a2e' }}>
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color:'#333' }}>
              <div style={{ fontSize:40 }}>♫</div>
              <div className="text-sm font-mono text-center">
                Click <strong style={{ color:'#ff9500' }}>+ Open Folder</strong> or <strong style={{ color:'#ffe600' }}>+ Add Files</strong><br/>
                to load your samples
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-xs font-mono pt-8" style={{ color:'#444' }}>No samples match</div>
          ) : (
            folders.map(folder => {
              const items = filtered.filter(f => (f.folder || '(root)') === folder)
              if (!items.length) return null
              return (
                <div key={folder} className="mb-3">
                  {folder !== '(root)' && (
                    <div className="text-xs font-ui font-semibold px-2 py-1 tracking-wider" style={{ color:'#444' }}>
                      📁 {folder} <span style={{ color:'#333' }}>({items.length})</span>
                    </div>
                  )}
                  {items.map(file => (
                    <FileRow
                      key={file.id}
                      file={file}
                      selected={selected?.id === file.id}
                      fav={favs.includes(file.id)}
                      isPreviewing={isPreviewing && selected?.id === file.id}
                      onSelect={() => selectFile(file)}
                      onFav={() => toggleFav(file.id)}
                      onPreview={() => {
                        if (isPreviewing && selected?.id === file.id) stopPreview()
                        else { selectFile(file); playPreview(file) }
                      }}
                    />
                  ))}
                </div>
              )
            })
          )}
        </div>

        {/* Detail panel */}
        <div className="flex flex-col shrink-0 overflow-y-auto" style={{ width:280, background:'#0b0b16' }}>
          <DetailPanel
            file={selected}
            meta={loadingMeta ? null : meta}
            fav={selected ? favs.includes(selected.id) : false}
            isPreviewing={isPreviewing}
            previewPos={previewPos}
            onFav={() => selected && toggleFav(selected.id)}
            onPreview={() => {
              if (!selected) return
              if (isPreviewing) stopPreview()
              else playPreview(selected)
            }}
          />
        </div>
      </div>
    </div>
  )
}
