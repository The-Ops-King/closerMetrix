import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

const Aurora = () => {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animationId
    let time = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    resize()
    window.addEventListener('resize', resize)

    // Aurora wave parameters
    const waves = [
      { amplitude: 80, frequency: 0.003, speed: 0.02, color: 'rgba(0, 255, 136, 0.15)', yOffset: 0.2 },
      { amplitude: 60, frequency: 0.004, speed: 0.015, color: 'rgba(0, 212, 255, 0.12)', yOffset: 0.25 },
      { amplitude: 100, frequency: 0.002, speed: 0.025, color: 'rgba(99, 102, 241, 0.1)', yOffset: 0.15 },
      { amplitude: 50, frequency: 0.005, speed: 0.018, color: 'rgba(0, 255, 200, 0.08)', yOffset: 0.3 },
    ]

    const drawAurora = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      waves.forEach((wave, index) => {
        ctx.beginPath()
        ctx.moveTo(0, canvas.height)

        for (let x = 0; x <= canvas.width; x += 2) {
          const y = canvas.height * wave.yOffset +
            Math.sin(x * wave.frequency + time * wave.speed) * wave.amplitude +
            Math.sin(x * wave.frequency * 0.5 + time * wave.speed * 1.5) * wave.amplitude * 0.5

          ctx.lineTo(x, y)
        }

        ctx.lineTo(canvas.width, 0)
        ctx.lineTo(0, 0)
        ctx.closePath()

        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0)
        gradient.addColorStop(0, 'transparent')
        gradient.addColorStop(0.3, wave.color)
        gradient.addColorStop(0.7, wave.color)
        gradient.addColorStop(1, 'transparent')

        ctx.fillStyle = gradient
        ctx.fill()
      })

      time++
      animationId = requestAnimationFrame(drawAurora)
    }

    drawAurora()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <>
      <canvas
        ref={canvasRef}
        className="aurora-canvas"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <Stars />
    </>
  )
}

// Animated Stars Component
const Stars = () => {
  const stars = Array.from({ length: 100 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    duration: Math.random() * 3 + 2,
    delay: Math.random() * 5,
  }))

  return (
    <div className="stars-container">
      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="star"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
          }}
          animate={{
            opacity: [0.2, 1, 0.2],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: star.duration,
            repeat: Infinity,
            delay: star.delay,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

export default Aurora
