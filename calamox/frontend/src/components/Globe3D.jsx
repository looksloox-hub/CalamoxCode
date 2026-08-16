import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * Globe3D — interactive holographic blue globe (Three.js / WebGL).
 *
 * - Auto-rotates smoothly; drag with the mouse to orbit.
 * - Reacts to voice input: listens for `calamox-voice-activity` events
 *   (dispatched by VoiceController with { intensity: 0..1 }) and pulses the
 *   glow + grid lines at that frequency.
 * - Renders agent activity as glowing data nodes on the surface; dispatch
 *   `calamox-agent-activity` with { count } to spawn a burst of pulses.
 */
export default function Globe3D({ className = '' }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // --- Scene setup -------------------------------------------------------
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100)
    camera.position.set(0, 0.4, 5.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = 3
    controls.maxDistance = 9
    controls.autoRotate = true
    controls.autoRotateSpeed = 1.1
    controls.rotateSpeed = 0.6

    // --- Lights ------------------------------------------------------------
    scene.add(new THREE.AmbientLight(0x224488, 0.9))
    const keyLight = new THREE.DirectionalLight(0x4da6ff, 2.2)
    keyLight.position.set(4, 3, 5)
    scene.add(keyLight)
    const rimLight = new THREE.DirectionalLight(0x00d2ff, 1.4)
    rimLight.position.set(-4, -2, -4)
    scene.add(rimLight)

    // --- Starfield ---------------------------------------------------------
    const starGeo = new THREE.BufferGeometry()
    const starCount = 900
    const starPos = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const r = 14 + Math.random() * 22
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      starPos[i * 3 + 2] = r * Math.cos(phi)
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0x7ab8ff, size: 0.05, transparent: true, opacity: 0.8 })
    )
    scene.add(stars)

    // --- Globe core --------------------------------------------------------
    const coreGeo = new THREE.SphereGeometry(1.6, 64, 64)
    const coreMat = new THREE.MeshPhongMaterial({
      color: 0x0b2447,
      emissive: 0x0e3a66,
      emissiveIntensity: 0.55,
      specular: 0x00d2ff,
      shininess: 22,
      transparent: true,
      opacity: 0.96,
    })
    const globe = new THREE.Mesh(coreGeo, coreMat)
    scene.add(globe)

    // --- Holographic grid lines (lat / long) -------------------------------
    const gridGeo = new THREE.SphereGeometry(1.612, 28, 28)
    const grid = new THREE.LineSegments(
      gridGeo,
      new THREE.LineBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.22 })
    )
    scene.add(grid)

    // Equatorial rings for a "hologram" feel
    const ringMaterial = new THREE.LineBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.35 })
    const ringGeo = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 96 }, (_, i) => {
        const a = (i / 96) * Math.PI * 2
        return new THREE.Vector3(Math.cos(a) * 1.62, 0, Math.sin(a) * 1.62)
      })
    )
    const ring = new THREE.Line(ringGeo, ringMaterial)
    scene.add(ring)

    // --- Data nodes (agent activity) ---------------------------------------
    const nodeGroup = new THREE.Group()
    scene.add(nodeGroup)
    const nodeGeo = new THREE.SphereGeometry(0.028, 8, 8)
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.95 })
    const activePulses = []

    const spawnNodes = (count) => {
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const p = new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta)
        ).multiplyScalar(1.64)
        const node = new THREE.Mesh(nodeGeo, nodeMat.clone())
        node.position.copy(p)
        nodeGroup.add(node)
        activePulses.push({ mesh: node, life: 0, maxLife: 2 + Math.random() * 2, base: p.clone() })
        // Keep the pool bounded
        if (nodeGroup.children.length > 140) {
          const old = nodeGroup.children[0]
          nodeGroup.remove(old)
          old.material.dispose()
        }
      }
    }

    // --- Atmosphere (fresnel glow) ----------------------------------------
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.85, 48, 48),
      new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uIntensity;
          varying vec3 vNormal;
          void main() {
            float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.6);
            gl_FragColor = vec4(0.0, 0.66, 1.0, fresnel * uIntensity);
          }
        `,
        uniforms: { uIntensity: { value: 0.85 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      })
    )
    scene.add(atmosphere)

    // --- Voice reactivity ---------------------------------------------------
    let voiceIntensity = 0
    let targetVoiceIntensity = 0
    const onVoice = (e) => {
      targetVoiceIntensity = Math.max(0, Math.min(1, Number(e.detail?.intensity ?? 0.6)))
    }
    const onAgentActivity = (e) => {
      spawnNodes(Math.max(1, Math.min(12, Number(e.detail?.count ?? 4))))
    }
    window.addEventListener('calamox-voice-activity', onVoice)
    window.addEventListener('calamox-agent-activity', onAgentActivity)

    // --- Animation loop -----------------------------------------------------
    const clock = new THREE.Clock()
    let rafId
    const animate = () => {
      rafId = requestAnimationFrame(animate)
      const dt = Math.min(clock.getDelta(), 0.05)
      const t = clock.elapsedTime

      // Smooth voice intensity toward target (attack/decay)
      voiceIntensity += (targetVoiceIntensity - voiceIntensity) * Math.min(1, dt * 5)
      const pulse = 1 + voiceIntensity * 0.45 * Math.abs(Math.sin(t * 6))

      // Apply voice pulse to atmosphere + grid
      atmosphere.material.uniforms.uIntensity.value = 0.55 + voiceIntensity * 1.1
      atmosphere.scale.setScalar(pulse * (1 + voiceIntensity * 0.08))
      grid.material.opacity = 0.22 + voiceIntensity * 0.35
      ring.material.opacity = 0.3 + voiceIntensity * 0.35

      // Data nodes: rise slightly and fade out
      for (let i = activePulses.length - 1; i >= 0; i--) {
        const pulseNode = activePulses[i]
        pulseNode.life += dt
        const progress = pulseNode.life / pulseNode.maxLife
        if (progress >= 1) {
          nodeGroup.remove(pulseNode.mesh)
          pulseNode.mesh.material.dispose()
          activePulses.splice(i, 1)
          continue
        }
        pulseNode.mesh.position
          .copy(pulseNode.base)
          .multiplyScalar(1 + progress * 0.12)
        pulseNode.mesh.material.opacity = 1 - progress
        pulseNode.mesh.material.color.setHSL(0.53, 1, 0.55 + progress * 0.2)
      }

      stars.rotation.y += dt * 0.004
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // --- Resize handling ----------------------------------------------------
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

    // --- Cleanup -------------------------------------------------------------
    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      window.removeEventListener('calamox-voice-activity', onVoice)
      window.removeEventListener('calamox-agent-activity', onAgentActivity)
      controls.dispose()
      renderer.dispose()
      nodeGroup.children.forEach((c) => c.material?.dispose())
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className}`}>
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="text-center select-none" style={{ pointerEvents: 'none' }}>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight bg-gradient-to-r from-brand via-brand-glow to-brand-light bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(0,210,255,0.45)]">
            JARVIS HUB
          </h1>
          <p className="text-[11px] text-slate-500 mt-1 tracking-[0.35em] uppercase">Calamox · 200 Agents · 20 Groups</p>
        </div>
      </div>
    </div>
  )
}
