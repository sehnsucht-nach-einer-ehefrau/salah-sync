
"use client"

import {
  animate,
  AnimatePresence,
  motion,
  useIsPresent,
  useMotionValue,
  useTransform,
} from "motion/react"
import { useEffect, useState } from "react"

export default function WarpButton({ intensity = 0.1 }: { intensity?: number }) {
  const [isWarping, setIsWarping] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })

  // grab viewport size for the overlay
  useEffect(() => {
    function update() {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  // drive our deform animation
  const deform = useMotionValue(0)
  const rotateX = useTransform(deform, (v) => v * -5)
  const skewY   = useTransform(deform, (v) => v * -1.5)
  const scaleY  = useTransform(deform, (v) => 1 + v * intensity)
  const scaleX  = useTransform(deform, (v) => 1 - v * intensity * 0.6)

  const handleClick = () => {
    setIsWarping(true)
    animate([
      [deform, 1,   { duration: 0.3, ease: [0.65, 0, 0.35, 1] }],
      [deform, 0,   { duration: 1.5, ease: [0.22, 1, 0.36, 1] }],
    ]).finished.then(() => setIsWarping(false))
  }

  return (
    <>
      <motion.div
        style={{
          rotateX,
          skewY,
          scaleY,
          scaleX,
          originX: 0.5,
          originY: 0,
          transformPerspective: 500,
          willChange: "transform",
        }}
      >
        <button onClick={handleClick} className="warp-button">
          Warp
        </button>
      </motion.div>

      <AnimatePresence>
        {isWarping && <GradientOverlay size={size} />}
      </AnimatePresence>

      <style jsx>{`
        .warp-button {
          padding: 12px 24px;
          font-size: 16px;
          border: none;
          background: rgb(246, 63, 42);
          color: white;
          border-radius: 4px;
          cursor: pointer;
        }
        .warp-button:active {
          transform: scale(0.95);
        }
      `}</style>
    </>
  )
}

function GradientOverlay({ size }: { size: { width: number; height: number } }) {
  const breathe = useMotionValue(0)
  const isPresent = useIsPresent()

  useEffect(() => {
    if (!isPresent) {
      animate(breathe, 0, { duration: 0.5, ease: "easeInOut" })
    }

    async function playBreathingAnimation() {
      await animate(breathe, 1, {
        duration: 0.5,
        delay: 0.35,
        ease: [0, 0.55, 0.45, 1],
      })
      animate(breathe, [null, 0.7, 1], {
        duration: 15,
        repeat: Infinity,
        repeatType: "loop",
        ease: "easeInOut",
      })
    }

    playBreathingAnimation()
  }, [isPresent])

  const enterDuration = 0.75
  const exitDuration = 0.5
  const expandingCircleRadius = size.width / 3

  return (
    <div className="overlay-root">
      <motion.div
        className="expanding-circle"
        initial={{
          scale: 0,
          opacity: 1,
          backgroundColor: "rgb(233, 167, 160)",
        }}
        animate={{
          scale: 10,
          opacity: 0.2,
          backgroundColor: "rgb(246, 63, 42)",
          transition: {
            duration: enterDuration,
            opacity: { duration: enterDuration, ease: "easeInOut" },
          },
        }}
        exit={{
          scale: 0,
          opacity: 1,
          backgroundColor: "rgb(233, 167, 160)",
          transition: { duration: exitDuration },
        }}
        style={{
          left: `calc(50% - ${expandingCircleRadius / 2}px)`,
          top: "100%",
          width: expandingCircleRadius,
          height: expandingCircleRadius,
        }}
      />

      <motion.div
        className="gradient-circle top-left"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.9, transition: { duration: enterDuration } }}
        exit={{ opacity: 0, transition: { duration: exitDuration } }}
        style={{
          scale: breathe,
          width: size.width * 2,
          height: size.width * 2,
          top: -size.width,
          left: -size.width,
        }}
      />

      <motion.div
        className="gradient-circle bottom-right"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.9, transition: { duration: enterDuration } }}
        exit={{ opacity: 0, transition: { duration: exitDuration } }}
        style={{
          scale: breathe,
          width: size.width * 2,
          height: size.width * 2,
          top: size.height - size.width,
          left: 0,
        }}
      />

      <style jsx global>{`
        .overlay-root {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          overflow: hidden;
          z-index: 999;
          pointer-events: none;
        }
        .expanding-circle {
          position: absolute;
          border-radius: 50%;
          filter: blur(15px);
          transform-origin: center;
          will-change: transform;
        }
        .gradient-circle {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          will-change: transform;
        }
        .top-left {
          background: rgb(246, 63, 42, 0.9);
        }
        .bottom-right {
          background: rgb(243, 92, 76, 0.9);
        }
      `}</style>
    </div>
  )
}
