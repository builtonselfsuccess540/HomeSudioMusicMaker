import React, { useState, useEffect, useRef } from 'react'
import { playDrum } from '../../audio/audioEngine'

const FAV_KEY  = 'hsmm_mkt_favorites'
const BUY_KEY  = 'hsmm_mkt_purchases'
const LIST_KEY = 'hsmm_mkt_listings'

const MOCK_BEATS = [
  { id: 1,  title: 'Midnight Trap',     producer: 'BeatsByDre',    genre: 'Trap',       bpm: 140, key: 'Am',  price: 29.99, plays: 1204, rating: 4.8 },
  { id: 2,  title: 'Lo-Fi Sunday',      producer: 'ChillWave',     genre: 'Lo-Fi',      bpm:  75, key: 'Cmaj',price: 14.99, plays:  832, rating: 4.6 },
  { id: 3,  title: 'Bounce Back',       producer: 'SouthSide',     genre: 'Hip-Hop',    bpm:  95, key: 'Gm',  price: 39.99, plays: 2341, rating: 4.9 },
  { id: 4,  title: 'Dark Wave',         producer: 'NightOwl',      genre: 'Trap',       bpm: 145, key: 'Dm',  price: 24.99, plays:  567, rating: 4.3 },
  { id: 5,  title: 'Summer Groove',     producer: 'TropicBeats',   genre: 'R&B',        bpm:  98, key: 'Fmaj',price: 19.99, plays:  991, rating: 4.7 },
  { id: 6,  title: 'City Nights',       producer: 'UrbanKraft',    genre: 'R&B',        bpm: 100, key: 'Ebmaj',price:34.99, plays: 1567, rating: 4.8 },
  { id: 7,  title: 'Thunder Roll',      producer: 'DrumGod',       genre: 'Boom Bap',   bpm:  88, key: 'Cm',  price: 22.99, plays:  423, rating: 4.4 },
  { id: 8,  title: 'Glass Ceiling',     producer: 'ProducerX',     genre: 'Hip-Hop',    bpm:  92, key: 'Bbm', price: 44.99, plays: 3102, rating: 5.0 },
  { id: 9,  title: 'Chill Pill',        producer: 'VibeMaker',     genre: 'Lo-Fi',      bpm:  70, key: 'Dmaj',price: 12.99, plays:  712, rating: 4.5 },
  { id: 10, title: 'Rage Mode',         producer: 'ZapBeats',      genre: 'Drill',      bpm: 150, key: 'F#m', price: 29.99, plays:  889, rating: 4.6 },
  { id: 11, title: 'Velvet Sunrise',    producer: 'MelodyMind',    genre: 'R&B',        bpm:  94, key: 'Amaj',price: 27.99, plays: 1100, rating: 4.7 },
  { id: 12, title: 'Deep Space',        producer: 'Orbital',       genre: 'Electronic', bpm: 128, key: 'Em',  price: 19.99, plays:  654, rating: 4.2 },
  { id: 13, title: 'Hustle Hard',       producer: 'Grindstone',    genre: 'Trap',       bpm: 138, key: 'Bm',  price: 34.99, plays: 2210, rating: 4.8 },
  { id: 14, title: 'Retro Funk',        producer: 'GoldDigger',    genre: 'Funk',       bpm: 110, key: 'Gmaj',price: 22.99, plays:  443, rating: 4.3 },
  { id: 15, title: 'Pain & Gain',       producer: 'SoulPunch',     genre: 'Boom Bap',   bpm:  86, key: 'Cm',  price: 39.99, plays: 1876, rating: 4.9 },
  { id: 16, title: 'Neon Rain',         producer: 'CyberSound',    genre: 'Electronic', bpm: 125, key: 'Am',  price: 17.99, plays:  322, rating: 4.1 },
  { id: 17, title: 'Crown Up',          producer: 'KingBeats',     genre: 'Hip-Hop',    bpm:  97, key: 'Fm',  price: 49.99, plays: 4021, rating: 5.0 },
  { id: 18, title: 'Slow Burn',         producer: 'EmberTones',    genre: 'R&B',        bpm:  80, key: 'Dbmaj',price:21.99, plays:  798, rating: 4.6 },
  { id: 19, title: 'Midnight Drill',    producer: 'BlockBeats',    genre: 'Drill',      bpm: 144, key: 'Gm',  price: 32.99, plays: 1342, rating: 4.7 },
  { id: 20, title: 'Cloud Nine',        producer: 'StratoBeats',   genre: 'Lo-Fi',      bpm:  68, key: 'Emaj',price: 9.99,  plays:  511, rating: 4.4 },
  { id: 21, title: 'Hard Reset',        producer: 'DigitalForge',  genre: 'Electronic', bpm: 132, key: 'Cm',  price: 24.99, plays:  678, rating: 4.5 },
  { id: 22, title: 'Golden Hour',       producer: 'SunsetSound',   genre: 'R&B',        bpm:  96, key: 'Dmaj',price: 36.99, plays: 2087, rating: 4.8 },
  { id: 23, title: 'Street Opus',       producer: 'ClassicMoves',  genre: 'Boom Bap',   bpm:  90, key: 'Bbm', price: 28.99, plays:  934, rating: 4.6 },
  { id: 24, title: 'Infinity Loop',     producer: 'NanoBeats',     genre: 'Trap',       bpm: 142, key: 'F#m', price: 18.99, plays:  421, rating: 4.2 },
]

const GENRES = ['All', ...Array.from(new Set(MOCK_BEATS.map(b => b.genre))).sort()]

function loadSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key)) || []) } catch { return new Set() }
}
function saveSet(key, s) { localStorage.setItem(key, JSON.stringify([...s])) }
function loadListings() {
  try { return JSON.parse(localStorage.getItem(LIST_KEY)) || [] } catch { return [] }
}

const PATTERN_SEQUENCES = {
  Trap:       ['Kick','HH-C','Snare','HH-C','Kick','HH-O','Snare','HH-C'],
  'Hip-Hop':  ['Kick','HH-C','Snare','HH-C','Kick','Kick','Snare','HH-C'],
  'Lo-Fi':    ['Kick','HH-C','Snare','HH-O','Kick','HH-C','Snare','HH-C'],
  'Boom Bap': ['Kick','HH-C','Snare','HH-C','Kick','HH-C','Snare','Clap'],
  'R&B':      ['Kick','HH-C','Snare','HH-O','Kick','HH-C','Snare','HH-C'],
  Electronic: ['Kick','HH-O','Kick','HH-C','Snare','HH-O','Kick','HH-C'],
  Drill:      ['Kick','HH-C','HH-C','Snare','Kick','HH-C','HH-O','Snare'],
  Funk:       ['Kick','HH-C','Snare','HH-O','Kick','HH-C','Snare','Perc1'],
}

export default function MarketplaceView() {
  const [favorites, setFavorites] = useState(() => loadSet(FAV_KEY))
  const [purchases, setPurchases] = useState(() => loadSet(BUY_KEY))
  const [listings, setListings]   = useState(loadListings)
  const [genre, setGenre]         = useState('All')
  const [search, setSearch]       = useState('')
  const [sort, setSort]           = useState('plays')
  const [tab, setTab]             = useState('browse')
  const [previewId, setPreviewId] = useState(null)
  const [listForm, setListForm]   = useState({ title: '', bpm: 120, key: 'Am', genre: 'Trap', price: '' })
  const [listMsg, setListMsg]     = useState('')
  const previewTimers = useRef([])

  const toggleFav = (id) => {
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      saveSet(FAV_KEY, next)
      return next
    })
  }

  const purchase = (beat) => {
    setPurchases(prev => {
      const next = new Set(prev)
      next.add(beat.id)
      saveSet(BUY_KEY, next)
      return next
    })
  }

  const startPreview = (beat) => {
    previewTimers.current.forEach(clearTimeout)
    previewTimers.current = []
    setPreviewId(beat.id)
    const genre = beat.genre.replace(/[^a-zA-Z]/g, '_').replace('__', '_') || 'Trap'
    const seq = PATTERN_SEQUENCES[genre.replace('&','_')] || PATTERN_SEQUENCES['Hip-Hop']
    const bps = (beat.bpm / 60) / 2
    const stepMs = 1000 / bps
    seq.forEach((type, i) => {
      const t = setTimeout(() => playDrum(type, 0.8), i * stepMs)
      previewTimers.current.push(t)
    })
    const done = setTimeout(() => setPreviewId(null), seq.length * stepMs + 200)
    previewTimers.current.push(done)
  }

  const submitListing = () => {
    if (!listForm.title.trim() || !listForm.price) { setListMsg('Please fill in title and price.'); return }
    const entry = { ...listForm, id: Date.now(), producer: 'You', plays: 0, rating: null }
    const updated = [entry, ...listings]
    setListings(updated)
    localStorage.setItem(LIST_KEY, JSON.stringify(updated))
    setListForm({ title: '', bpm: 120, key: 'Am', genre: 'Trap', price: '' })
    setListMsg('Beat listed successfully!')
    setTimeout(() => setListMsg(''), 3000)
  }

  const allBeats = [...MOCK_BEATS, ...listings]

  const filtered = allBeats
    .filter(b => genre === 'All' || b.genre === genre)
    .filter(b => search === '' || b.title.toLowerCase().includes(search.toLowerCase()) || b.producer.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'plays')  return b.plays  - a.plays
      if (sort === 'price')  return a.price  - b.price
      if (sort === 'rating') return (b.rating||0) - (a.rating||0)
      if (sort === 'bpm')    return a.bpm    - b.bpm
      return 0
    })

  const favBeats = allBeats.filter(b => favorites.has(b.id))
  const ownedBeats = allBeats.filter(b => purchases.has(b.id))

  return (
    <div className="flex flex-col h-full" style={{ background: '#080810' }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-studio-border shrink-0">
        <span className="font-display text-xs tracking-widest uppercase" style={{ color: '#ff9500' }}>
          Beat Marketplace
        </span>
        {['browse','favorites','owned','sell'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-1 rounded text-xs font-semibold capitalize transition-all"
            style={{
              background: tab === t ? '#ff950022' : 'transparent',
              color: tab === t ? '#ff9500' : '#8899aa',
              border: `1px solid ${tab === t ? '#ff950044' : 'transparent'}`,
            }}
          >
            {t === 'sell' ? 'List a Beat' : t}
            {t === 'favorites' && favorites.size > 0 && ` (${favorites.size})`}
            {t === 'owned'     && purchases.size > 0 && ` (${purchases.size})`}
          </button>
        ))}
      </div>

      {/* Browse tab */}
      {tab === 'browse' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Filters */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-studio-border shrink-0 flex-wrap">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search beats or producers…"
              className="bg-studio-panel border border-studio-border rounded px-3 py-1 text-xs text-studio-text placeholder-studio-muted focus:outline-none w-52"
            />
            <select
              value={genre}
              onChange={e => setGenre(e.target.value)}
              className="bg-studio-panel border border-studio-border rounded px-2 py-1 text-xs text-studio-text focus:outline-none"
            >
              {GENRES.map(g => <option key={g}>{g}</option>)}
            </select>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="bg-studio-panel border border-studio-border rounded px-2 py-1 text-xs text-studio-text focus:outline-none"
            >
              <option value="plays">Most Popular</option>
              <option value="rating">Top Rated</option>
              <option value="price">Price: Low</option>
              <option value="bpm">BPM</option>
            </select>
            <span className="text-xs text-studio-muted ml-auto">{filtered.length} beats</span>
          </div>

          {/* Beat grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {filtered.map(beat => (
                <BeatCard
                  key={beat.id}
                  beat={beat}
                  isFav={favorites.has(beat.id)}
                  isOwned={purchases.has(beat.id)}
                  isPreviewing={previewId === beat.id}
                  onFav={() => toggleFav(beat.id)}
                  onPreview={() => startPreview(beat)}
                  onBuy={() => purchase(beat)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Favorites tab */}
      {tab === 'favorites' && (
        <div className="flex-1 overflow-y-auto p-4">
          {favBeats.length === 0
            ? <Empty icon="♡" msg="No favorites yet — browse beats and tap ♡" />
            : <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {favBeats.map(beat => (
                  <BeatCard key={beat.id} beat={beat} isFav isOwned={purchases.has(beat.id)}
                    isPreviewing={previewId === beat.id} onFav={() => toggleFav(beat.id)}
                    onPreview={() => startPreview(beat)} onBuy={() => purchase(beat)} />
                ))}
              </div>
          }
        </div>
      )}

      {/* Owned tab */}
      {tab === 'owned' && (
        <div className="flex-1 overflow-y-auto p-4">
          {ownedBeats.length === 0
            ? <Empty icon="🎵" msg="No purchased beats yet" />
            : <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {ownedBeats.map(beat => (
                  <BeatCard key={beat.id} beat={beat} isFav={favorites.has(beat.id)} isOwned
                    isPreviewing={previewId === beat.id} onFav={() => toggleFav(beat.id)}
                    onPreview={() => startPreview(beat)} onBuy={() => {}} />
                ))}
              </div>
          }
        </div>
      )}

      {/* Sell tab */}
      {tab === 'sell' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-md mx-auto">
            <h2 className="text-sm font-semibold text-studio-text mb-4">List Your Beat</h2>
            <div className="flex flex-col gap-3">
              <Field label="Title">
                <input value={listForm.title} onChange={e => setListForm(p => ({...p, title: e.target.value}))}
                  placeholder="e.g. Dark Energy Vol. 2" className="w-full bg-studio-panel border border-studio-border rounded px-3 py-1.5 text-xs text-studio-text placeholder-studio-muted focus:outline-none focus:border-studio-dim" />
              </Field>
              <div className="flex gap-3">
                <Field label="BPM">
                  <input type="number" value={listForm.bpm} onChange={e => setListForm(p => ({...p, bpm: +e.target.value}))}
                    className="w-full bg-studio-panel border border-studio-border rounded px-3 py-1.5 text-xs text-studio-text focus:outline-none focus:border-studio-dim" min={40} max={300} />
                </Field>
                <Field label="Key">
                  <input value={listForm.key} onChange={e => setListForm(p => ({...p, key: e.target.value}))}
                    placeholder="Am" className="w-full bg-studio-panel border border-studio-border rounded px-3 py-1.5 text-xs text-studio-text placeholder-studio-muted focus:outline-none focus:border-studio-dim" />
                </Field>
              </div>
              <Field label="Genre">
                <select value={listForm.genre} onChange={e => setListForm(p => ({...p, genre: e.target.value}))}
                  className="w-full bg-studio-panel border border-studio-border rounded px-3 py-1.5 text-xs text-studio-text focus:outline-none focus:border-studio-dim">
                  {GENRES.filter(g => g !== 'All').map(g => <option key={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="Price ($)">
                <input type="number" value={listForm.price} onChange={e => setListForm(p => ({...p, price: e.target.value}))}
                  placeholder="19.99" step="0.01" min="0" className="w-full bg-studio-panel border border-studio-border rounded px-3 py-1.5 text-xs text-studio-text placeholder-studio-muted focus:outline-none focus:border-studio-dim" />
              </Field>
              <button
                onClick={submitListing}
                className="px-4 py-2 rounded text-sm font-semibold transition-all"
                style={{ background: '#ff950022', color: '#ff9500', border: '1px solid #ff950044' }}
              >
                List Beat
              </button>
              {listMsg && <div className="text-xs" style={{ color: listMsg.includes('success') ? '#00ff9d' : '#ff2d55' }}>{listMsg}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BeatCard({ beat, isFav, isOwned, isPreviewing, onFav, onPreview, onBuy }) {
  return (
    <div
      className="rounded-lg p-3 border transition-all"
      style={{ background: '#0d0d1a', borderColor: isPreviewing ? '#ff9500' : '#ffffff15' }}
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-studio-text truncate">{beat.title}</div>
          <div className="text-xs text-studio-muted">{beat.producer}</div>
        </div>
        <button onClick={onFav} className="text-lg leading-none" title="Favorite"
          style={{ color: isFav ? '#ff2d55' : '#ffffff30' }}>
          {isFav ? '♥' : '♡'}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Badge text={beat.genre} color="#ff9500" />
        <Badge text={`${beat.bpm} BPM`} color="#00e5ff" />
        <Badge text={beat.key} color="#b44fff" />
        {beat.rating && <Badge text={`★ ${beat.rating}`} color="#ffe600" />}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onPreview}
          className="px-3 py-1 rounded text-xs font-semibold transition-all"
          style={{
            background: isPreviewing ? '#ff950033' : '#ffffff11',
            color: isPreviewing ? '#ff9500' : '#8899aa',
          }}
        >
          {isPreviewing ? '▶ Playing' : '▶ Preview'}
        </button>
        <div className="flex-1" />
        <span className="text-sm font-bold" style={{ color: '#00ff9d' }}>
          ${typeof beat.price === 'number' ? beat.price.toFixed(2) : beat.price}
        </span>
        <button
          onClick={onBuy}
          disabled={isOwned}
          className="px-3 py-1 rounded text-xs font-semibold transition-all"
          style={{
            background: isOwned ? '#00ff9d22' : '#00ff9d',
            color: isOwned ? '#00ff9d' : '#000',
            opacity: isOwned ? 0.7 : 1,
          }}
        >
          {isOwned ? 'Owned' : 'Buy'}
        </button>
      </div>
      <div className="mt-2 text-xs text-studio-muted">{beat.plays?.toLocaleString()} plays</div>
    </div>
  )
}

function Badge({ text, color }) {
  return (
    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${color}22`, color }}>
      {text}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-studio-dim mb-1">{label}</label>
      {children}
    </div>
  )
}

function Empty({ icon, msg }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center">
      <div className="text-4xl mb-2">{icon}</div>
      <div className="text-sm text-studio-muted">{msg}</div>
    </div>
  )
}
