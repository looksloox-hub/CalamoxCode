import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Mic, MicOff, Zap, Loader, Cube, Sphere, TorusKnot } from 'lucide-react'

/**
 * Viewport3DCanvas — Holographic 3D Model & Particles Viewer.
 *
 * Center UI contains a glowing holographic orange/blue particle reactor.
 * Real-time 3D Model Viewer (.glb / .gltf renderer) to load assets like
 * Iron Man Mark 85 or custom CAD files upon voice/text query.
 * Renders agent activity as particle bursts; listens for
 * `calamox-agent-activity` and `calamox-voice-activity` events.
 */
export default function Viewport3DCanvas({ className = '' }) {
  const [loading, setLoading] = useState(false)
  const [modelUrl, setModelUrl] = useState(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // --- Scene setup -------------------------------------------------------
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x050508)

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 100)
    camera.position.set(0, 1.5, 8)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure: 1.2
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = 3
    controls.maxDistance = 15
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.8
    controls.rotateSpeed = 0.5

    // --- Holographic lighting ------------------------------------------------
    scene.add(new THREE.AmbientLight(0x444466, 0.6))

    const keyLight = new THREE.DirectionalLight(0xff6b00, 2.5) // Glowing Amber
    keyLight.position.set(5, 5, 5)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0x00d2ff, 1.2) // Electric Blue
    fillLight.position.set(-5, -3, 3)
    scene.add(fillLight)

    // --- Holographic particle reactor core ---------------------------------
    const reactorGeo = new THREE.SphereGeometry(1.8, 64, 64)
    const reactorMat = new THREE.MeshPhongMaterial({
      color: 0xff6b00,
      emissive: 0xff6b00,
      emissiveIntensity: 0.8,
      shininess: 100,
      transparent: true,
      opacity: 0.9,
    })
    const reactor = new THREE.Mesh(reactorGeo, reactorMat)
    scene.add(reactor)

    // --- Internal particle ring ---
    const ringGeo = new THREE.TorusGeometry(2.2, 0.15, 16, 64)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.4 })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    scene.add(ring)

    // --- Agent activity particle pool --------------------------------------
    const agentParticleGeo = new THREE.SphereGeometry(0.08, 6, 6)
    const agentParticleMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true })
    const agentParticles: THREE.Mesh[] = []
    const maxParticles = 80
    for (let i = 0; i < maxParticles; i++) {
      const p = new THREE.Mesh(agentParticleGeo, agentParticleMat.clone())
      p.position.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      )
      p.visible = false
      scene.add(p)
      agentParticles.push(p)
    }

    // --- Voice reactivity state --------------------------------------------
    let voiceIntensity = 0
    let targetVoiceIntensity = 0
    const onVoice = (e) => {
      targetVoiceIntensity = Math.max(0, Math.min(1, Number(e.detail?.intensity ?? 0.6)))
    }
    const onAgentActivity = (e) => {
      const count = Math.max(1, Math.min(maxParticles, Number(e.detail?.count ?? 4)))
      spawnAgentParticles(count)
    }
    window.addEventListener('calamox-voice-activity', onVoice)
    window.addEventListener('calamox-agent-activity', onAgentActivity)

    // --- Model loader ------------------------------------------------------
    let modelLoaded = false
    const loader = new THREE.GLTFLoader()
    const onModelLoad = (gltf: THREE.Group) => {
      modelLoaded = true
      scene.add(gltf.scene)
      // Scale and position the loaded model
      gltf.scene.position.set(0, -0.5, 0)
      gltf.scene.scale.set(2, 2, 2)
    }

    // --- Animation loop ----------------------------------------------------
    const clock = new THREE.Clock()
    let rafId: number
    const animate = () => {
      rafId = requestAnimationFrame(animate)
      const dt = Math.min(clock.getDelta(), 0.05)
      const t = clock.elapsedTime

      // Smooth voice intensity toward target
      voiceIntensity += (targetVoiceIntensity - voiceIntensity) * Math.min(1, dt * 5)
      const pulse = 1 + voiceIntensity * 0.5 * Math.abs(Math.sin(t * 3))

      // Pulse reactor
      reactor.scale.setScalar(pulse)
      reactor.material.opacity = 0.7 + voiceIntensity * 0.2

      // Pulse ring
      ring.material.opacity = 0.3 + voiceIntensity * 0.4

      // Animate agent particles
      for (let i = 0; i < agentParticles.length; i++) {
        const p = agentParticles[i]
        if (!p.visible) continue
        p.position.y += dt * (0.5 + Math.random() * 0.5)
        p.position.x += Math.sin(t * 2 + i) * 0.01
        p.position.z += Math.cos(t * 2 + i) * 0.01
        p.material.opacity = 1 - (clock.elapsedTime % p.userData.life) / p.userData.life
      }

      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // --- Resize handling ---------------------------------------------------
    const onResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(container)

    // --- Cleanup ---------------------------------------------------------
    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      window.removeEventListener('calamox-voice-activity', onVoice)
      window.removeEventListener('calamox-agent-activity', onAgentActivity)
      controls.dispose()
      renderer.dispose()
      // Dispose agent particles
      agentParticles.forEach((p) => p.material.dispose())
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [modelUrl])

  // --- Spawn agent particles ---------------------------------------------
  const spawnAgentParticles = (count: number) => {
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * agentParticles.length)
      const p = agentParticles[idx]
      if (!p.visible) {
        p.visible = true
        p.position.set(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8
        )
        p.userData.life = 2 + Math.random() * 3
        break
      }
    }
  }

  // --- UI ----------------------------------------------------------------
  const handleBrowse = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.glb,.gltf'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setLoading(true)
      const reader = new FileReader()
      reader.onload = (e) => {
        loader.load((e.target as FileReader).result as string, onModelLoad, undefined, (err) => {
          console.error('GLTF load error:', err)
          setLoading(false)
        })
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  return (
    <div className={`relative w-full h-[600px] ${className}`}>
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center min-h-[600px]">
        <div className="text-center select-none">
          {/* Controls */}
          <div className="flex flex-col items-center gap-3 pt-8">
            <button
              onClick={handleBrowse}
              className="px-4 py-2 rounded-xl bg-primary/20 text-primary hover:bg-primary/30 transition cursor-pointer"
              title="Load 3D Model (.glb/.gltf)"
            >
              <Loader size={16} className="mr-2" /> Load Model
            </button>

            {loading && (
              <div className="spinner border-4 border-primary border-t-transparent rounded-full w-12 h-12 animate-spin text-primary" /></div>
            )

            {/* Sample model buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => spawnAgentParticles(12)}
                className="px-3 py-1.5 rounded-lg text-xs text-primary hover:bg-primary/10 transition cursor-pointer"
                title="Agent burst"
              >
                <Zap size={12} className="mr-1" /> Burst
              </button>
              <button
                onClick={() => spawnAgentParticles(20)}
                className="px-3 py-1.5 rounded-lg text-xs text-primary hover:bg-primary/10 transition cursor-pointer"
                title="Heavy agent activity"
              >
                <Zap size={12} className="mr-1" /> Heavy
              </button>
            </div>
          </div>

          {/* Status when no model loaded */}
          {!modelLoaded && loading === false && (
            <div className="py-12 text-slate-400">
              <h3 className="text-xl font-bold mb-2">Holographic Reactor</h3>
              <p className="text-slate-500">
                Load a .glb or .gltf model to view it in the holographic reactor.
                Voice commands and agent activity will animate particles around the model.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Three.js canvas overlay */}
      <div
        ref={containerRef}
        className={`absolute inset-0 pointer-events-none ${
          modelLoaded ? 'mix-blend-multiply' : ''
        }`}
      >
        {/* Canvas is rendered by Three.js in useEffect */}
      </div>
    </div>
  )
}