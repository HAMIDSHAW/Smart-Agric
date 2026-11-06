import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// ─── FLOATING LEAF PARTICLES ────────────────────────────────
// Used on the Dashboard hero area - subtle organic particles
export function LeafParticles({ count = 40, className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    if (!W || !H) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100)
    camera.position.set(0, 0, 8)

    // Gentle ambient + directional light
    scene.add(new THREE.AmbientLight(0xffeedd, 0.8))
    const dl = new THREE.DirectionalLight(0xd4931a, 1.2)
    dl.position.set(5, 8, 5)
    scene.add(dl)
    const gl = new THREE.DirectionalLight(0x2d6a2f, 0.6)
    gl.position.set(-4, -3, 3)
    scene.add(gl)

    // Create leaf-shaped geometry using a custom shape
    const leafShape = new THREE.Shape()
    leafShape.moveTo(0, 0.5)
    leafShape.quadraticCurveTo(0.3, 0.3, 0.25, 0)
    leafShape.quadraticCurveTo(0.3, -0.3, 0, -0.5)
    leafShape.quadraticCurveTo(-0.3, -0.3, -0.25, 0)
    leafShape.quadraticCurveTo(-0.3, 0.3, 0, 0.5)

    const leafGeo = new THREE.ShapeGeometry(leafShape)
    const leaves = []
    const colors = [0x14532D, 0x4CAF50, 0xF59E0B, 0x2E7D32, 0x4CAF50]

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: 0.15 + Math.random() * 0.25,
        side: THREE.DoubleSide,
        roughness: 0.8,
      })
      const mesh = new THREE.Mesh(leafGeo, mat)
      const spread = 12
      mesh.position.set(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread * 0.6,
        (Math.random() - 0.5) * 4
      )
      const s = 0.3 + Math.random() * 0.7
      mesh.scale.setScalar(s)
      mesh.rotation.z = Math.random() * Math.PI * 2
      mesh.userData = {
        vx: (Math.random() - 0.5) * 0.003,
        vy: -0.004 - Math.random() * 0.006,
        vr: (Math.random() - 0.5) * 0.008,
        originY: mesh.position.y,
      }
      scene.add(mesh)
      leaves.push(mesh)
    }

    let running = true
    const animate = () => {
      if (!running) return
      requestAnimationFrame(animate)
      leaves.forEach(leaf => {
        leaf.position.x += leaf.userData.vx
        leaf.position.y += leaf.userData.vy
        leaf.rotation.z += leaf.userData.vr
        // Reset when leaf falls off screen
        if (leaf.position.y < -8) {
          leaf.position.y = 7
          leaf.position.x = (Math.random() - 0.5) * 12
        }
      })
      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      const nW = canvas.offsetWidth, nH = canvas.offsetHeight
      if (!nW || !nH) return
      camera.aspect = nW / nH
      camera.updateProjectionMatrix()
      renderer.setSize(nW, nH)
    }
    window.addEventListener('resize', onResize)

    return () => {
      running = false
      window.removeEventListener('resize', onResize)
      renderer.dispose()
    }
  }, [count])

  return (
    <canvas ref={canvasRef} className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
  )
}

// ─── ROTATING SOIL / EARTH ORB ────────────────────────────────
// Used on the Land Suitability and Soil pages
export function EarthOrb({ size = 200, className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setSize(size, size)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 3.5)

    scene.add(new THREE.AmbientLight(0xffeedd, 0.6))
    const dl = new THREE.DirectionalLight(0xd4931a, 1.5)
    dl.position.set(3, 4, 5)
    scene.add(dl)
    const gl = new THREE.DirectionalLight(0x2d6a2f, 0.8)
    gl.position.set(-3, -2, 2)
    scene.add(gl)

    // Core orb
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshStandardMaterial({ color: 0x3D1A08, roughness: 0.9, metalness: 0.0 })
    )
    scene.add(orb)

    // Green wireframe overlay (vegetation layer)
    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(1.02, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0x14532D, wireframe: true, transparent: true, opacity: 0.12 })
    )
    scene.add(wire)

    // Gold ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.012, 4, 80),
      new THREE.MeshBasicMaterial({ color: 0xF59E0B, transparent: true, opacity: 0.7 })
    )
    ring.rotation.x = Math.PI / 3
    scene.add(ring)

    // Outer glow ring
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.006, 4, 80),
      new THREE.MeshBasicMaterial({ color: 0x4CAF50, transparent: true, opacity: 0.35 })
    )
    glow.rotation.x = -Math.PI / 5
    scene.add(glow)

    let running = true
    let frame = 0
    const animate = () => {
      if (!running) return
      requestAnimationFrame(animate)
      frame++
      orb.rotation.y += 0.004
      wire.rotation.y += 0.004
      ring.rotation.z += 0.003
      glow.rotation.z -= 0.002
      renderer.render(scene, camera)
    }
    animate()

    return () => { running = false; renderer.dispose() }
  }, [size])

  return (
    <canvas ref={canvasRef} width={size} height={size} className={className}
      style={{ width: size, height: size }} />
  )
}

// ─── DISEASE SCAN RING ─────────────────────────────────────────
// Animated scanning ring shown while disease detection runs
export function ScanRing({ active = false, size = 180 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setSize(size, size)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 4)

    const rings = []
    const ringData = [
      { r: 0.9, thick: 0.04, col: 0x14532D, op: 0.9, speed: 0.04 },
      { r: 1.1, thick: 0.02, col: 0xF59E0B, op: 0.6, speed: -0.03 },
      { r: 1.3, thick: 0.015, col: 0x4CAF50, op: 0.4, speed: 0.02 },
    ]

    ringData.forEach(({ r, thick, col, op, speed }) => {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(r, thick, 4, 80),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op })
      )
      mesh.userData.speed = speed
      scene.add(mesh)
      rings.push(mesh)
    })

    // Center dot
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x14532D })
    )
    scene.add(dot)

    let running = true
    const animate = () => {
      if (!running) return
      requestAnimationFrame(animate)
      if (active) {
        rings.forEach(r => { r.rotation.z += r.userData.speed })
      }
      renderer.render(scene, camera)
    }
    animate()

    return () => { running = false; renderer.dispose() }
  }, [size, active])

  return (
    <canvas ref={canvasRef} width={size} height={size}
      style={{ width: size, height: size }} />
  )
}

// ─── HARVEST COUNTDOWN ORB ──────────────────────────────────
// Shows harvest progress as a 3D filling sphere
export function HarvestOrb({ progress = 0, size = 120 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setSize(size, size)
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 3.5)

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dl = new THREE.DirectionalLight(0xffd700, 1.2)
    dl.position.set(3, 4, 5)
    scene.add(dl)

    // Base sphere (grey = not grown)
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0xE8D5B0, roughness: 0.9 })
    ))

    // Progress sphere (green = grown portion) - clip using y position
    const fill = new THREE.Mesh(
      new THREE.SphereGeometry(1.01, 32, 32),
      new THREE.MeshStandardMaterial({
        color: progress >= 100 ? 0xF59E0B : 0x14532D,
        roughness: 0.6,
        transparent: true,
        opacity: 0.9,
        clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, -1, 0), 1 - (progress / 50))],
      })
    )
    renderer.localClippingEnabled = true
    scene.add(fill)

    let running = true
    const animate = () => {
      if (!running) return
      requestAnimationFrame(animate)
      fill.rotation.y += 0.008
      renderer.render(scene, camera)
    }
    animate()

    return () => { running = false; renderer.dispose() }
  }, [size, progress])

  return (
    <canvas ref={canvasRef} width={size} height={size}
      style={{ width: size, height: size }} />
  )
}
