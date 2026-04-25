'use client'

import { useRef, useState, type ReactNode, type MouseEvent } from 'react'
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion'

interface ThreeDCardProps {
  children: ReactNode
  className?: string
  /** Show a moving radial highlight that tracks the cursor. */
  glare?: boolean
  /** Hover-lift scale. 1 disables the lift. */
  scale?: number
  /** Max degrees of rotation along each axis. */
  rotationFactor?: number
  /** CSS perspective in pixels. */
  perspective?: number
  /** Border radius in px applied to the inner clipping layer (used for the glare overlay). */
  radius?: number
}

// ThreeDCard: cursor-tracked 3D tilt with optional radial glare.
//
// Two notes for future maintainers:
//   1. We use useMotionTemplate to drive the glare gradient. The naive
//      approach of reading motion-value.get() inside style {} silently
//      breaks because MotionValues update imperatively without triggering
//      a re-render — the gradient gets stuck at the initial position.
//   2. The 3D tilt is desktop-only by design. Touch devices have no
//      hover/mousemove, so mobile users see a flat (but still styled)
//      card. That's the right tradeoff — don't over-animate phones.
export function ThreeDCard({
  children,
  className = '',
  glare = true,
  scale = 1.04,
  rotationFactor = 12,
  perspective = 1000,
  radius = 16,
}: ThreeDCardProps) {
  const [isHovering, setIsHovering] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const rotateX = useSpring(
    useTransform(y, [-0.5, 0.5], [rotationFactor, -rotationFactor]),
    { stiffness: 300, damping: 25 }
  )
  const rotateY = useSpring(
    useTransform(x, [-0.5, 0.5], [-rotationFactor, rotationFactor]),
    { stiffness: 300, damping: 25 }
  )

  const glareX = useTransform(x, (v) => `${(v + 0.5) * 100}%`)
  const glareY = useTransform(y, (v) => `${(v + 0.5) * 100}%`)
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX} ${glareY}, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 70%)`

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left) / rect.width - 0.5
    const mouseY = (e.clientY - rect.top) / rect.height - 0.5
    x.set(mouseX)
    y.set(mouseY)
  }

  const handleMouseLeave = () => {
    setIsHovering(false)
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={() => setIsHovering(true)}
      style={{ perspective: `${perspective}px` }}
      animate={{ scale: isHovering ? scale : 1 }}
      transition={{ scale: { duration: 0.2, ease: 'easeOut' } }}
      className={className}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
          borderRadius: radius,
        }}
        className="relative w-full h-full"
      >
        {children}

        {glare && isHovering && (
          <motion.div
            aria-hidden
            className="absolute inset-0 pointer-events-none overflow-hidden"
            style={{ background: glareBackground, borderRadius: radius }}
          />
        )}
      </motion.div>
    </motion.div>
  )
}
