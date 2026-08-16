import React, { useRef, useEffect, useCallback, useState } from 'react'

// Interpolate curve value at x (0-1). y=1 = max, y=0 = min.
export function lerpCurve(points, x, def = 1.0) {
  if (!points || points.length === 0) return def
  const s = [...points].sort((a, b) => a.x - b.x)
  if (x <= s[0].x) return s[0].y
  if (x >= s[s.length - 1].x) return s[s.length - 1].y
  for (let i = 0; i < s.length - 1; i++) {
    if (x >= s[i].x && x <= s[i + 1].x) {
      const t = (x - s[i].x) / (s[i + 1].x - s[i].x)
      return s[i].y + t * (s[i + 1].y - s[i].y)
    }
  }
  return def
}

// points: [{ id, x, y }]  x,y ∈ [0,1]   y=1=top (max), y=0=bottom (min)
// onChange: (newPoints) => void  — null = read-only
export default function AutoCurveCanvas({
  points = [],
  onChange,
  color = '#00e5ff',
  width = 400,
  height = 56,
  playheadX = -1,
  defaultValue = 1.0,
  label = '',
  beatMarkers = [],  // x positions (0-1) to draw faint vertical markers
}) {
  const canvasRef = useRef(null)
  const [hoverId, setHoverId] = useState(null)
  const PT_R = 5
  const HIT  = 9

  const vy  = (v)  => (1 - v) * height            // value → canvas y
  const yv  = (cy) => 1 - Math.max(0, Math.min(height, cy)) / height  // canvas y → value

  const draw = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    ctx.clearRect(0, 0, width, height)

    ctx.fillStyle = '#07071a'
    ctx.fillRect(0, 0, width, height)

    // Horizontal value grid
    ctx.strokeStyle = '#151530'
    ctx.lineWidth = 1
    ;[0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      ctx.beginPath()
      ctx.moveTo(0, vy(v)); ctx.lineTo(width, vy(v))
      ctx.stroke()
    })

    // Beat / bar markers
    if (beatMarkers.length) {
      ctx.strokeStyle = '#1a1a35'
      beatMarkers.forEach((bx) => {
        ctx.beginPath()
        ctx.moveTo(bx * width, 0); ctx.lineTo(bx * width, height)
        ctx.stroke()
      })
    }

    const sorted = [...points].sort((a, b) => a.x - b.x)

    if (sorted.length === 0) {
      // Dashed default line
      const dy = vy(defaultValue)
      ctx.beginPath()
      ctx.moveTo(0, dy); ctx.lineTo(width, dy)
      ctx.strokeStyle = color + '44'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])
    } else {
      // Filled area under curve
      ctx.beginPath()
      ctx.moveTo(0, height)
      ctx.lineTo(0, vy(sorted[0].y))
      sorted.forEach((p) => ctx.lineTo(p.x * width, vy(p.y)))
      ctx.lineTo(width, vy(sorted[sorted.length - 1].y))
      ctx.lineTo(width, height)
      ctx.closePath()
      ctx.fillStyle = color + '18'
      ctx.fill()

      // Curve line
      ctx.beginPath()
      ctx.moveTo(0, vy(sorted[0].y))
      sorted.forEach((p) => ctx.lineTo(p.x * width, vy(p.y)))
      ctx.lineTo(width, vy(sorted[sorted.length - 1].y))
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.shadowColor = color
      ctx.shadowBlur = 5
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // Playhead
    if (playheadX >= 0) {
      ctx.beginPath()
      ctx.moveTo(playheadX, 0); ctx.lineTo(playheadX, height)
      ctx.strokeStyle = '#ffffff55'
      ctx.lineWidth = 1
      ctx.setLineDash([])
      ctx.stroke()
    }

    // Control points
    sorted.forEach((p) => {
      const px = p.x * width
      const py = vy(p.y)
      const r  = hoverId === p.id ? PT_R + 2 : PT_R
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fillStyle   = hoverId === p.id ? '#ffffff' : color
      ctx.shadowColor = color
      ctx.shadowBlur  = hoverId === p.id ? 14 : 6
      ctx.fill()
      ctx.shadowBlur  = 0
    })
  }, [points, color, width, height, playheadX, hoverId, defaultValue, beatMarkers])

  useEffect(() => { draw() }, [draw])

  const rect = () => canvasRef.current?.getBoundingClientRect()

  const getXY = (e) => {
    const r = rect()
    return {
      cx: Math.max(0, Math.min(width,  e.clientX - r.left)),
      cy: Math.max(0, Math.min(height, e.clientY - r.top)),
    }
  }

  const nearPt = (cx, cy) =>
    points.find((p) => {
      const dx = p.x * width - cx
      const dy = vy(p.y) - cy
      return Math.sqrt(dx * dx + dy * dy) <= HIT
    })

  const onMouseDown = (e) => {
    if (!onChange) return
    e.preventDefault()
    const { cx, cy } = getXY(e)
    const pt = nearPt(cx, cy)

    if (pt) {
      const onMove = (me) => {
        const r = rect()
        if (!r) return
        const nx = Math.max(0, Math.min(1, (me.clientX - r.left)  / width))
        const nv = yv(me.clientY - r.top)
        onChange(points.map((p) => p.id === pt.id ? { ...p, x: nx, y: nv } : p))
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    } else {
      onChange([...points, { id: Date.now(), x: cx / width, y: yv(cy) }])
    }
  }

  const onCtxMenu = (e) => {
    if (!onChange) return
    e.preventDefault()
    const { cx, cy } = getXY(e)
    const pt = nearPt(cx, cy)
    if (pt) onChange(points.filter((p) => p.id !== pt.id))
  }

  const onMouseMove = (e) => {
    if (!canvasRef.current) return
    const { cx, cy } = getXY(e)
    setHoverId(nearPt(cx, cy)?.id ?? null)
  }

  return (
    <div style={{ position: 'relative', width, height, flexShrink: 0 }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: 'block', cursor: onChange ? 'crosshair' : 'default' }}
        onMouseDown={onMouseDown}
        onContextMenu={onCtxMenu}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverId(null)}
      />
      {label && (
        <span style={{
          position: 'absolute', top: 2, left: 4,
          fontSize: 8, fontFamily: 'monospace', pointerEvents: 'none',
          color: color + 'bb', textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>{label}</span>
      )}
    </div>
  )
}
