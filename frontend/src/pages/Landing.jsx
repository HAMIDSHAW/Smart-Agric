import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as THREE from 'three'
import { LeafParticles } from '../components/Scene3D'

// ─── DATA (unchanged) ────────────────────────────────────────
const SL_STATS = [
  { number: '63%',    label: 'of Sierra Leoneans depend on agriculture for their livelihoods', source: 'World Bank, 2023' },
  { number: '77%',    label: 'of the population faced food insecurity in 2024',                source: 'WFP Sierra Leone, 2024' },
  { number: '5.4M ha',label: 'of fertile agricultural land, only 15% currently cultivated',   source: 'FAO Sierra Leone' },
  { number: '480K',   label: 'tonnes of rice imported in 2022 despite ideal growing conditions', source: 'MAFFS Sierra Leone' },
]

const IMPACT_POINTS = [
  { icon: '🔬', title: 'Diagnose instantly',       desc: 'A farmer in Kenema photographs a diseased cassava leaf. SmartAgri identifies Cassava Brown Streak Disease and delivers a treatment plan in seconds, before the disease spreads to the whole field.' },
  { icon: '🌾', title: 'Choose the right crop',    desc: 'An extension officer in Bo district tests soil N, P, K levels. SmartAgri recommends cassava and groundnut as optimal for those exact conditions, not a generic answer, a precise one.' },
  { icon: '🧪', title: 'Spend less on fertilizer', desc: "SmartAgri detects a nitrogen deficiency and generates a fertilizer schedule that costs 30% less than default application, protecting the farmer's income while restoring yield." },
  { icon: '🇸🇱', title: 'Supporting Feed Salone', desc: "President Bio's Feed Salone programme targets 90,000+ registered farmers and $28M+ in agricultural financing. SmartAgri gives every one of those farmers expert agronomic intelligence in their pocket." },
]

const MODULES = [
  { icon: '🔬', name: 'Disease Detection',    desc: 'Upload any leaf (cassava, maize, tomato, mango, rice) for instant AI diagnosis' },
  { icon: '🌾', name: 'Crop Recommendation',  desc: 'Enter soil NPK, pH, and climate data. Get ranked crop recommendations for your land' },
  { icon: '🧪', name: 'Fertilizer Guide',     desc: 'Precise fertilizer types, quantities, and timing based on your crop and soil test' },
  { icon: '🗺️', name: 'Land Suitability',    desc: 'Score your land and predict yield for any target variety before planting' },
  { icon: '⚠️', name: 'Pest Alerts',          desc: 'Real-time environmental monitoring that warns farmers before outbreaks occur' },
  { icon: '🟤', name: 'Soil Analysis',        desc: 'Identify soil type from a photo or description. Get management advice instantly' },
  { icon: '📅', name: 'Crop Calendar',        desc: 'Week-by-week planting plan for cassava, rice, cocoa, and all major Sierra Leone crops' },
  { icon: '⚖️', name: 'Crop Comparison',     desc: 'Compare cassava vs cocoa, rice vs maize side by side on yield, revenue and soil match' },
  { icon: '📦', name: 'Post-Harvest Advice', desc: 'Reduce post-harvest losses with specific storage guidance for cocoa, rice, cassava and more' },
  { icon: '💬', name: 'AI Assistant',         desc: 'Ask any farming question in English or Krio and get instant expert farming advice' },
]

// ─── THREE.JS GLOBE (unchanged) ──────────────────────────────
function Globe3D() {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.offsetWidth || 400, H = canvas.offsetHeight || 400
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 1000)
    camera.position.set(0, 0.5, 5.5)
    scene.add(new THREE.AmbientLight(0xffeedd, 0.5))
    const sun = new THREE.DirectionalLight(0xd4931a, 2.0)
    sun.position.set(4, 6, 5); sun.castShadow = true; scene.add(sun)
    const fill = new THREE.DirectionalLight(0x2d6a2f, 1.0)
    fill.position.set(-4, -3, 3); scene.add(fill)
    const backLight = new THREE.DirectionalLight(0xfff8e0, 0.4)
    backLight.position.set(0, -5, -3)
    scene.add(backLight)
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1.5, 80, 80), new THREE.MeshStandardMaterial({ color: 0x0D1F0D, roughness: 0.85, metalness: 0.05 }))
    globe.castShadow = true; scene.add(globe)
    const land = new THREE.Mesh(new THREE.SphereGeometry(1.52, 28, 28), new THREE.MeshBasicMaterial({ color: 0x1A4D1A, wireframe: true, transparent: true, opacity: 0.18 }))
    scene.add(land)
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.72, 32, 32), new THREE.MeshStandardMaterial({ color: 0x1A5C1A, transparent: true, opacity: 0.08, side: THREE.BackSide, roughness: 1.0 }))
    scene.add(atmo)
    const mkRing = (r, thick, col, op, tiltX, tiltY = 0) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, thick, 6, 100), new THREE.MeshStandardMaterial({ color: col, opacity: op, transparent: true, roughness: 0.3, metalness: 0.6 }))
      m.rotation.x = tiltX; m.rotation.y = tiltY; scene.add(m); return m
    }
    const r1 = mkRing(2.05, 0.012, 0xF59E0B, 0.85, Math.PI / 3)
    const r2 = mkRing(2.35, 0.007, 0x4CAF50, 0.5, -Math.PI / 5)
    const r3 = mkRing(2.7, 0.005, 0x2E7D32, 0.3, Math.PI / 8, Math.PI / 6)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 12), new THREE.MeshStandardMaterial({ color: 0xF59E0B, emissive: 0xF59E0B, emissiveIntensity: 0.6, metalness: 0.8 }))
      node.position.set(Math.cos(angle) * 2.05, Math.sin(angle * 1.5) * 0.6, Math.sin(angle) * 2.05); scene.add(node)
    }
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2, r = 2.35
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), new THREE.MeshStandardMaterial({ color: 0x14532D, emissive: 0x14532D, emissiveIntensity: 0.8 }))
      node.position.set(Math.cos(angle) * r, Math.sin(angle * 0.7) * 0.5, Math.sin(angle) * r); scene.add(node)
    }
    const starPos = new Float32Array(200 * 3)
    for (let i = 0; i < 200; i++) {
      const r = 2.2 + Math.random() * 2.5, theta = Math.random() * Math.PI * 2, phi = Math.random() * Math.PI
      starPos[i*3] = r * Math.sin(phi) * Math.cos(theta); starPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta); starPos[i*3+2] = r * Math.cos(phi)
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xF59E0B, size: 0.025, transparent: true, opacity: 0.6 })))
    let mouseX = 0, mouseY = 0
    const onMouseMove = e => { mouseX = (e.clientX / window.innerWidth - 0.5) * 2; mouseY = (e.clientY / window.innerHeight - 0.5) * 2 }
    window.addEventListener('mousemove', onMouseMove)
    let t = 0, rafId
    const animate = () => {
      rafId = requestAnimationFrame(animate); t += 0.006
      globe.rotation.y = t * 0.25 + mouseX * 0.3; globe.rotation.x = mouseY * 0.15
      land.rotation.y = t * 0.255 + mouseX * 0.3; land.rotation.x = mouseY * 0.15
      atmo.rotation.y = t * 0.2; r1.rotation.z = t * 0.12; r2.rotation.z = -t * 0.09; r3.rotation.z = t * 0.06
      renderer.render(scene, camera)
    }
    animate()
    const onResize = () => { const nW = canvas.offsetWidth || 400, nH = canvas.offsetHeight || 400; camera.aspect = nW / nH; camera.updateProjectionMatrix(); renderer.setSize(nW, nH) }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(rafId); window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('resize', onResize); renderer.dispose() }
  }, [])
  return <canvas ref={canvasRef} className="w-full h-full" />
}

// ─── LEAF SCAN DEMO (signature hero visual) ──────────────────
// A stylised palmate (cassava-like) leaf inside a camera viewfinder,
// with a scan sweep that reveals a real diagnosis. This is literally
// the core product action (photograph a leaf, get a diagnosis),
// rather than decorative/generic imagery.
function LeafScanDemo() {
  const lobes = [
    { angle: -64, scale: 0.74, fill: '#245F27' },
    { angle: -32, scale: 0.95, fill: '#2E7D32' },
    { angle: 0,   scale: 1.0,  fill: '#2E7D32' },
    { angle: 32,  scale: 0.95, fill: '#2E7D32' },
    { angle: 64,  scale: 0.74, fill: '#245F27' },
  ]
  return (
    <div className="scan-demo">
      <div className="scan-frame">
        <span className="scan-corner tl" /><span className="scan-corner tr" />
        <span className="scan-corner bl" /><span className="scan-corner br" />
        <svg viewBox="0 0 220 260" className="scan-leaf-svg">
          <path d="M110,160 C107,180 112,202 110,228" stroke="#1F4D22" strokeWidth="6" strokeLinecap="round" fill="none" />
          {lobes.map(({ angle, scale, fill }, i) => (
            <g key={i} transform={`translate(110,160) rotate(${angle}) scale(${scale})`}>
              <path d="M0,0 C-16,-10 -15,-50 0,-72 C15,-50 16,-10 0,0 Z" fill={fill} />
              <line x1="0" y1="-3" x2="0" y2="-66" stroke="#173B1A" strokeWidth="1.5" opacity="0.5" />
            </g>
          ))}
          <ellipse cx="106" cy="108" rx="10" ry="7" fill="#7C4A1E" opacity="0.8" transform="rotate(-10 106 108)" />
          <ellipse cx="131" cy="123" rx="7" ry="9" fill="#92400E" opacity="0.7" transform="rotate(15 131 123)" />
          <ellipse cx="88" cy="135" rx="6" ry="5" fill="#7C4A1E" opacity="0.6" />
        </svg>
        <div className="scan-line" />
      </div>
      <div className="diagnosis-card">
        <div className="diagnosis-row">
          <span className="diagnosis-dot" />
          <span className="diagnosis-title">Cassava Brown Streak Disease</span>
        </div>
        <div className="diagnosis-sub">94% confidence · treatment plan ready</div>
      </div>
    </div>
  )
}


function AnimatedStat({ target, label, source }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); observer.disconnect() } }, { threshold: 0.5 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref} className="stat-card" style={{
      background: '#FFFFFF',
      borderRadius: 16,
      border: '1px solid #E5E7EB',
      padding: '2rem 1.5rem',
      textAlign: 'center',
      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.10)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.06)' }}
    >
      <div className="stat-number" style={{ fontFamily: 'Poppins, sans-serif', fontSize: '2.8rem', fontWeight: 800, color: '#14532D', lineHeight: 1, marginBottom: '0.75rem' }}>
        {visible ? target : '-'}
      </div>
      <p style={{ color: '#4B5563', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '0.5rem' }}>{label}</p>
      <p style={{ color: '#9CA3AF', fontSize: '0.75rem', fontStyle: 'italic' }}>{source}</p>
    </div>
  )
}

// ─── MAIN LANDING ─────────────────────────────────────────────
export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={{ background: '#FAFAF7', color: '#111827', fontFamily: 'Inter, sans-serif', overflowX: 'hidden' }}>

      {/* ─── GOOGLE FONTS ─── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        .nav-link { text-decoration: none; font-size: 0.9rem; font-weight: 500; transition: color 0.2s; color: #4B5563; }
        .nav-link:hover { color: #14532D; }
        .nav-link.on-dark { color: rgba(255,255,255,0.82); }
        .nav-link.on-dark:hover { color: #FFFFFF; }
        .signin-link { color: #4B5563; text-decoration: none; font-size: 0.9rem; font-weight: 500; }
        .signin-link.on-dark { color: rgba(255,255,255,0.82); }
        .mobile-menu-btn { display: none; background: none; border: none; cursor: pointer; padding: 6px; line-height: 0; }
        .btn-primary-hero {
          display: inline-flex; align-items: center; gap: 8px;
          background: #F59E0B; color: #111827; padding: 14px 28px;
          border-radius: 10px; font-weight: 700; font-size: 1rem;
          text-decoration: none; border: none; cursor: pointer;
          box-shadow: 0 4px 20px rgba(245,158,11,0.4);
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .btn-primary-hero:hover { background: #D97706; transform: translateY(-2px); box-shadow: 0 8px 32px rgba(245,158,11,0.5); }
        .btn-secondary-hero {
          display: inline-flex; align-items: center; gap: 8px;
          background: white; color: #14532D; padding: 14px 28px;
          border-radius: 10px; font-weight: 600; font-size: 1rem;
          text-decoration: none; border: 2px solid #14532D; cursor: pointer;
          transition: background 0.2s, transform 0.15s;
        }
        /* Fix 2: hero content aligns with logo on mobile */
        @media (max-width: 768px) {
          .hero-content-pad { padding: 3rem 2rem 3rem 2rem !important; }
          /* Fix 1: hide Sign In button in the Ready CTA section on mobile */
          .cta-signin-mobile { display: none !important; }
          /* Fix 3: force CTA buttons side-by-side on mobile */
          .hero-cta-row { flex-wrap: nowrap !important; }
          .btn-primary-hero { flex: 1; text-align: center; white-space: nowrap; font-size: 0.82rem !important; padding: 13px 14px !important; }
          .btn-secondary-hero { flex: 1; text-align: center; white-space: nowrap; font-size: 0.82rem !important; padding: 13px 14px !important; }
          /* Stat cards: left-align on mobile for readability */
          .stat-card { text-align: left !important; padding: 1.5rem 1.25rem !important; }
          .stat-card .stat-number { font-size: 2.2rem !important; margin-bottom: 0.5rem !important; }
        }
        .scan-demo { position: relative; width: 100%; max-width: 380px; }
        .scan-frame {
          position: relative; width: 100%; aspect-ratio: 4/4.4; border-radius: 28px;
          background: linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02));
          border: 1px solid rgba(255,255,255,0.14); overflow: hidden;
          box-shadow: 0 24px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .scan-corner { position: absolute; width: 24px; height: 24px; border: 2.5px solid #F59E0B; opacity: 0.9; z-index: 2; }
        .scan-corner.tl { top: 16px; left: 16px; border-right: none; border-bottom: none; border-radius: 8px 0 0 0; }
        .scan-corner.tr { top: 16px; right: 16px; border-left: none; border-bottom: none; border-radius: 0 8px 0 0; }
        .scan-corner.bl { bottom: 16px; left: 16px; border-right: none; border-top: none; border-radius: 0 0 0 8px; }
        .scan-corner.br { bottom: 16px; right: 16px; border-left: none; border-top: none; border-radius: 0 0 8px 0; }
        .scan-leaf-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; filter: drop-shadow(0 12px 28px rgba(0,0,0,0.35)); }
        .scan-line {
          position: absolute; left: 10%; right: 10%; height: 3px; top: 10%;
          background: linear-gradient(90deg, transparent, #F59E0B 20%, #FFE08A 50%, #F59E0B 80%, transparent);
          box-shadow: 0 0 18px 3px rgba(245,158,11,0.75);
          animation: scanSweep 3.4s cubic-bezier(0.45,0,0.55,1) infinite;
        }
        @keyframes scanSweep {
          0%   { top: 9%;  opacity: 0; }
          10%  { opacity: 1; }
          48%  { top: 88%; opacity: 1; }
          56%  { opacity: 0; top: 88%; }
          100% { opacity: 0; top: 9%; }
        }
        .diagnosis-card {
          position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%) translateY(14px);
          width: 88%; background: #FFFFFF; border-radius: 14px; padding: 14px 18px;
          box-shadow: 0 16px 36px rgba(0,0,0,0.4); opacity: 0; z-index: 3;
          animation: cardReveal 3.4s cubic-bezier(0.45,0,0.55,1) infinite;
        }
        .diagnosis-row { display: flex; align-items: center; gap: 8px; }
        .diagnosis-dot { width: 8px; height: 8px; border-radius: 50%; background: #16A34A; flex-shrink: 0; box-shadow: 0 0 0 4px rgba(22,163,74,0.18); }
        .diagnosis-title { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 0.88rem; color: #111827; }
        .diagnosis-sub { font-size: 0.76rem; color: #6B7280; margin-top: 5px; padding-left: 16px; }
        @keyframes cardReveal {
          0%, 50% { opacity: 0; transform: translateX(-50%) translateY(14px); }
          60%, 94% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(14px); }
        }
        .module-card {
          background: #FFFFFF; border-radius: 16px; border: 1px solid #E5E7EB;
          padding: 1.75rem; cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
          transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
        }
        .module-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(20,83,45,0.12); border-color: #4CAF50; }
        .impact-card {
          background: #FFFFFF; border-radius: 16px; border: 1px solid #E5E7EB;
          padding: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.04);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .impact-card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0,0,0,0.08); }
        .njala-item {
          display: flex; gap: 1rem; align-items: flex-start;
          background: #FFFFFF; border-radius: 12px;
          border: 1px solid #E5E7EB; padding: 1rem 1.25rem;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .njala-item:hover { border-color: #4CAF50; box-shadow: 0 4px 16px rgba(20,83,45,0.1); }
        .section-label {
          display: inline-block; font-size: 0.7rem; font-weight: 700;
          letter-spacing: 0.18em; text-transform: uppercase;
          color: #2E7D32; background: rgba(76,175,80,0.1);
          border: 1px solid rgba(76,175,80,0.25);
          padding: 4px 14px; border-radius: 20px; margin-bottom: 1rem;
        }
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .mobile-menu-btn { display: flex !important; align-items: center; justify-content: center; }
          .hero-grid { flex-direction: column; }
          .hero-visual { display: none !important; }
          .stats-grid { grid-template-columns: 1fr 1fr !important; }
          .modules-grid { grid-template-columns: 1fr !important; }
          .impact-grid { grid-template-columns: 1fr !important; }
          .njala-grid { grid-template-columns: 1fr !important; }
          .footer-inner { flex-direction: column; gap: 1.5rem; text-align: center; }
        }
      `}</style>

      {/* ─── NAVIGATION ─── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? 'rgba(250,250,247,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid #E5E7EB' : '1px solid transparent',
        transition: 'all 0.3s ease',
        padding: '0 2rem',
        height: 68,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'linear-gradient(135deg, #14532D, #2E7D32)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            boxShadow: '0 2px 8px rgba(20,83,45,0.3)',
          }}>🌿</div>
          <span style={{ fontFamily: 'Poppins, sans-serif', fontSize: '1.2rem', fontWeight: 700, color: scrolled ? '#14532D' : '#FFFFFF', transition: 'color 0.3s' }}>SmartAgri</span>
        </div>

        {/* Desktop nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }} className="hidden-mobile">
          {[['#problem','The Problem'],['#modules','Modules'],['#impact','Impact'],['#njala','Njala University']].map(([href, label]) => (
            <a key={href} href={href} className={`nav-link ${scrolled ? '' : 'on-dark'}`}>{label}</a>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} className="hidden-mobile">
          <Link to="/login" className={`signin-link ${scrolled ? '' : 'on-dark'}`}>Sign In</Link>
          <Link to="/register" style={{
            background: '#14532D', color: 'white', padding: '9px 20px',
            borderRadius: 8, fontSize: '0.9rem', fontWeight: 600, textDecoration: 'none',
            boxShadow: '0 2px 10px rgba(20,83,45,0.3)', transition: 'background 0.2s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#0F3D21'}
            onMouseLeave={e => e.currentTarget.style.background = '#14532D'}
          >Get Started →</Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="mobile-menu-btn"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(o => !o)}
        >
          <div style={{ width: 22, height: 16, position: 'relative' }}>
            {[0, 7, 14].map(top => (
              <span key={top} style={{
                position: 'absolute', top, left: 0, width: 22, height: 2, borderRadius: 2,
                background: scrolled ? '#14532D' : '#FFFFFF',
                transition: 'transform 0.2s, opacity 0.2s',
                transform: menuOpen && top === 7 ? 'scaleX(0)' : menuOpen && top === 0 ? 'translateY(7px) rotate(45deg)' : menuOpen && top === 14 ? 'translateY(-7px) rotate(-45deg)' : 'none',
                opacity: menuOpen && top === 7 ? 0 : 1,
              }} />
            ))}
          </div>
        </button>
      </nav>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div style={{
          position: 'fixed', top: 68, left: 0, right: 0, zIndex: 99,
          background: '#FFFFFF', borderBottom: '1px solid #E5E7EB',
          boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
          padding: '1.25rem 2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem',
        }}>
          {[['#problem','The Problem'],['#modules','Modules'],['#impact','Impact'],['#njala','Njala University']].map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)} style={{ color: '#1F2937', textDecoration: 'none', fontSize: '1rem', fontWeight: 600 }}>{label}</a>
          ))}
          <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '1.1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Link to="/login" onClick={() => setMenuOpen(false)} style={{ color: '#4B5563', textDecoration: 'none', fontSize: '0.95rem', fontWeight: 500 }}>Sign In</Link>
            <Link to="/register" onClick={() => setMenuOpen(false)} style={{
              background: '#14532D', color: 'white', padding: '12px 20px', textAlign: 'center',
              borderRadius: 8, fontSize: '0.95rem', fontWeight: 600, textDecoration: 'none',
            }}>Get Started →</Link>
          </div>
        </div>
      )}

      {/* ─── HERO ─── */}
      <section style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        paddingTop: 68, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #0F172A 0%, #14532D 50%, #0F172A 100%)',
      }}>
        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.04,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
        }} />
        {/* Radial glow */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 70% 60% at 60% 50%, rgba(76,175,80,0.15) 0%, transparent 70%), radial-gradient(ellipse 40% 50% at 15% 70%, rgba(245,158,11,0.12) 0%, transparent 60%)',
        }} />

        <LeafParticles count={30} />

        {/* Signature visual: the actual core product action */}
        <div style={{
          position: 'absolute', right: '6%', top: '50%', transform: 'translateY(-50%)',
          width: 380,
        }} className="hero-visual">
          <LeafScanDemo />
        </div>

        {/* Hero content */}
        <div className="hero-content-pad" style={{ position: 'relative', zIndex: 10, padding: '3rem 2rem 3rem 4rem', maxWidth: 680 }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
            color: '#F59E0B', padding: '6px 16px', borderRadius: 99,
            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', marginBottom: '1.5rem',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', animation: 'pulseSlow 2s infinite' }} />
            Njala University × Sierra Leone × Feed Salone
          </div>

          {/* H1 */}
          <h1 style={{
            fontFamily: 'Poppins, sans-serif', fontWeight: 800,
            fontSize: 'clamp(2.6rem, 5.5vw, 4.2rem)',
            lineHeight: 1.08, color: '#FFFFFF', marginBottom: '1.5rem',
          }}>
            Precision Farming<br />
            <span style={{ color: '#F59E0B' }}>for Every</span><br />
            <span style={{ color: '#4CAF50' }}>West African</span> Field
          </h1>

          {/* Subtitle */}
          <p style={{ fontSize: '1.1rem', lineHeight: 1.7, color: 'rgba(255,255,255,0.72)', marginBottom: '2.5rem', maxWidth: 520 }}>
            Photograph a leaf and get an instant disease diagnosis. Test your soil and get a ranked crop and fertilizer plan. Built for Sierra Leone's farmers, in English and Krio.
          </p>

          {/* CTA buttons */}
          <div className="hero-cta-row" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: '3rem' }}>
            <Link to="/scan" className="btn-primary-hero">🔬 Diagnose a Leaf</Link>
            <Link to="/register" className="btn-secondary-hero">Create Account →</Link>
          </div>

          {/* Mini stats: the real stakes, not just product feature counts */}
          <div style={{
            display: 'flex', gap: 36, flexWrap: 'wrap',
            borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem',
          }}>
            {[
              ['63%', 'Depend on farming to live', 'World Bank, 2023'],
              ['77%', 'Faced food insecurity in 2024', 'WFP Sierra Leone'],
              ['15%', 'Of fertile land currently farmed', 'FAO Sierra Leone'],
            ].map(([n, l, src]) => (
              <div key={l}>
                <div style={{ fontFamily: 'Poppins, sans-serif', fontSize: '1.7rem', fontWeight: 800, color: '#F59E0B' }}>{n}</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', marginTop: 2, maxWidth: 130 }}>{l}</div>
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{src}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── QUICK SCAN BANNER ─── */}
      <section style={{ background: '#0F172A', padding: '5rem 2rem' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
          <span className="section-label" style={{ color: '#4CAF50', background: 'rgba(76,175,80,0.1)', border: '1px solid rgba(76,175,80,0.25)' }}>
            Try it now, no account needed
          </span>
          <h2 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', color: '#FFFFFF', marginBottom: '1rem', lineHeight: 1.2 }}>
            Upload a Leaf.<br />Get an Instant Diagnosis.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '2rem', fontSize: '0.95rem', maxWidth: 500, margin: '0 auto 2rem' }}>
            Point your camera at any crop leaf. SmartAgri identifies disease, nutrient deficiency, or confirms it is healthy, in seconds.
          </p>
          <Link to="/scan" style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            background: 'linear-gradient(135deg, #14532D, #2E7D32)',
            color: 'white', padding: '16px 36px', borderRadius: 12,
            fontWeight: 700, fontSize: '1.05rem', textDecoration: 'none',
            boxShadow: '0 8px 32px rgba(20,83,45,0.4)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 16px 48px rgba(20,83,45,0.5)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(20,83,45,0.4)' }}
          >
            📸 Open Free Disease Scanner
          </Link>
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.78rem', marginTop: '1rem' }}>
            Works on mobile and desktop · Cassava, Rice, Maize, Tomato, Cocoa and more
          </p>
        </div>
      </section>

      {/* ─── THE PROBLEM / STATISTICS ─── */}
      <section id="problem" style={{ background: '#F3F7F1', padding: '6rem 2rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <span className="section-label">The Reality</span>
            <h2 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 'clamp(1.9rem, 3.5vw, 3rem)', color: '#111827', marginBottom: '1rem', lineHeight: 1.2 }}>
              Sierra Leone's Farmers<br />Deserve Better Tools
            </h2>
            <p style={{ color: '#4B5563', maxWidth: 560, margin: '0 auto', lineHeight: 1.7, fontSize: '1rem' }}>
              These are real numbers. Every statistic below represents a farmer who lost a harvest, a family that went hungry, or a plot of land that sat unfarmed because expert advice was unavailable.
            </p>
          </div>

          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
            {SL_STATS.map(s => <AnimatedStat key={s.number} target={s.number} label={s.label} source={s.source} />)}
          </div>
        </div>
      </section>

      {/* ─── FEED SALONE CONNECTION ─── */}
      <section style={{ background: '#FAFAF7', padding: '5rem 2rem' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{
            borderRadius: 20, padding: '3rem 3.5rem',
            background: 'linear-gradient(135deg, #14532D 0%, #1a6b38 100%)',
            boxShadow: '0 20px 60px rgba(20,83,45,0.25)',
            display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap',
          }}>
            {/* Sierra Leone flag — SVG so it renders identically on every platform */}
            <div style={{ flexShrink: 0, width: 72, height: 48, borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.3)', alignSelf: 'flex-start', marginTop: 4 }}>
              <svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', display: 'block' }}>
                <rect width="3" height="0.667" y="0" fill="#1EB53A" />
                <rect width="3" height="0.667" y="0.667" fill="#FFFFFF" />
                <rect width="3" height="0.667" y="1.333" fill="#0072C6" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#F59E0B', display: 'block', marginBottom: '0.5rem' }}>National Priority</span>
              <h2 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: '1.7rem', color: '#FFFFFF', marginBottom: '1rem' }}>Aligned with Feed Salone</h2>
              <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.75, marginBottom: '1rem', fontSize: '0.975rem' }}>
                President Julius Maada Bio's flagship <strong style={{ color: '#F59E0B' }}>Feed Salone</strong> programme is transforming Sierra Leone agriculture, distributing agricultural inputs to over <strong style={{ color: '#FFFFFF' }}>90,000 registered farmers</strong>, launching <strong style={{ color: '#FFFFFF' }}>$28M+ in agricultural financing</strong>, and targeting rice self-sufficiency to reduce the country's 480,000-tonne annual import bill.
              </p>
              <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.75, fontSize: '0.975rem' }}>
                SmartAgri gives every one of those farmers the <strong style={{ color: '#FFFFFF' }}>AI agronomic intelligence</strong> they need to maximise returns on those inputs, in English and Krio, on any phone.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── HOW IT HELPS ─── */}
      <section id="impact" style={{ background: '#F3F7F1', padding: '6rem 2rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: '3.5rem' }}>
            <span className="section-label">Real Scenarios</span>
            <h2 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 'clamp(1.8rem, 3vw, 2.8rem)', color: '#111827', lineHeight: 1.2 }}>
              What SmartAgri Does<br />for a Farmer in Sierra Leone
            </h2>
          </div>

          <div className="impact-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {IMPACT_POINTS.map((p, i) => (
              <div key={i} className="impact-card">
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: 'linear-gradient(135deg, rgba(20,83,45,0.08), rgba(76,175,80,0.12))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.6rem', marginBottom: '1.25rem',
                  border: '1px solid rgba(20,83,45,0.1)',
                }}>{p.icon}</div>
                <h3 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: '1.05rem', color: '#111827', marginBottom: '0.75rem' }}>{p.title}</h3>
                <p style={{ color: '#4B5563', fontSize: '0.9rem', lineHeight: 1.7 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── MODULES ─── */}
      <section id="modules" style={{ background: '#FAFAF7', padding: '6rem 2rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: '3.5rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <span className="section-label">Platform Modules</span>
              <h2 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 'clamp(1.8rem, 3vw, 2.8rem)', color: '#111827', lineHeight: 1.2 }}>
                12+ Precision Modules.<br />One Farming Platform.
              </h2>
            </div>
            <Link to="/register" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#14532D', color: 'white', padding: '12px 24px',
              borderRadius: 10, fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(20,83,45,0.3)',
              transition: 'background 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#0F3D21'}
              onMouseLeave={e => e.currentTarget.style.background = '#14532D'}
            >
              Access All Modules →
            </Link>
          </div>

          <div className="modules-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
            {MODULES.map((m, i) => (
              <div key={i} className="module-card">
                <div style={{
                  width: 46, height: 46, borderRadius: 12,
                  background: 'linear-gradient(135deg, #F3F7F1, #E8F5E9)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.4rem', marginBottom: '1rem',
                  border: '1px solid #E5E7EB',
                }}>{m.icon}</div>
                <h3 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600, fontSize: '0.95rem', color: '#111827', marginBottom: '0.5rem' }}>{m.name}</h3>
                <p style={{ color: '#6B7280', fontSize: '0.85rem', lineHeight: 1.6 }}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── NJALA UNIVERSITY ─── */}
      <section id="njala" style={{ background: '#F3F7F1', padding: '6rem 2rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="njala-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
            <div>
              <span className="section-label">Institutional Alignment</span>
              <h2 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 'clamp(1.6rem, 2.8vw, 2.4rem)', color: '#111827', marginBottom: '1.25rem', lineHeight: 1.2 }}>
                Built with Njala University's Mission at its Core
              </h2>
              <p style={{ color: '#4B5563', lineHeight: 1.75, marginBottom: '1.5rem', fontSize: '0.975rem' }}>
                Njala University is Sierra Leone's premier agricultural research institution. SmartAgri is not just a hackathon project. It is a platform designed to grow with the university's research mission and Sierra Leone's food security goals.
              </p>
              <Link to="/register" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#14532D', color: 'white', padding: '12px 24px',
                borderRadius: 10, fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none',
                boxShadow: '0 4px 16px rgba(20,83,45,0.25)',
              }}>
                Learn More →
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { icon: '🔬', title: 'Research Platform', desc: 'A live AI system for students and researchers to study West African crop conditions' },
                { icon: '📚', title: 'Teaching Tool', desc: 'Lecturers can teach data science, agronomy, and AI with a locally relevant live example' },
                { icon: '🚜', title: 'Field Extension', desc: 'Extension officers carry it to rural communities to diagnose diseases and advise on soil' },
                { icon: '📊', title: 'Dataset Building', desc: 'Njala can contribute local plant disease images to build a Sierra Leone-specific AI dataset' },
                { icon: '🎓', title: 'Student Projects', desc: 'Final year students can base dissertations and capstone projects around the platform' },
                { icon: '🌍', title: 'Regional Leadership', desc: 'Positions Njala as a West African leader in AI-driven precision agriculture' },
              ].map(item => (
                <div key={item.title} className="njala-item">
                  <span style={{ fontSize: '1.2rem', flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827', marginBottom: 3 }}>{item.title}</p>
                    <p style={{ fontSize: '0.82rem', color: '#6B7280', lineHeight: 1.5 }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA SECTION ─── */}
      <section style={{
        padding: '6rem 2rem', textAlign: 'center',
        background: 'linear-gradient(135deg, #0F172A 0%, #14532D 60%, #0F172A 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.05,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
        }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 600, margin: '0 auto' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1.5rem' }}>🌿</div>
          <h2 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: 'clamp(1.8rem, 3.5vw, 3rem)', color: '#FFFFFF', marginBottom: '1rem', lineHeight: 1.2 }}>
            Ready to Farm Smarter?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, marginBottom: '2.5rem', fontSize: '1rem' }}>
            Join SmartAgri. Get AI-powered disease detection, crop recommendations, and fertilizer plans, built specifically for Sierra Leone's farmers, in English and Krio.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#F59E0B', color: '#111827', padding: '16px 36px',
              borderRadius: 12, fontWeight: 700, fontSize: '1.05rem', textDecoration: 'none',
              boxShadow: '0 8px 32px rgba(245,158,11,0.4)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 16px 48px rgba(245,158,11,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(245,158,11,0.4)' }}
            >
              Create Free Account →
            </Link>
            <Link to="/login" className="cta-signin-mobile" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'transparent', color: 'rgba(255,255,255,0.8)',
              padding: '16px 36px', borderRadius: 12, fontWeight: 600,
              fontSize: '1.05rem', textDecoration: 'none',
              border: '2px solid rgba(255,255,255,0.2)',
              transition: 'border-color 0.2s, color 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.color = 'white' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={{
        background: '#0F172A',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '3rem 2rem',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="footer-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', gap: '2rem', flexWrap: 'wrap' }}>
            {/* Brand */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg, #14532D, #2E7D32)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🌿</div>
                <span style={{ fontFamily: 'Poppins, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: '#F59E0B' }}>SmartAgri</span>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', lineHeight: 1.6 }}>
                Built by Mohamed Hamidu Shaw · SmartAgri Team<br />
                Kenema, Sierra Leone · Njala University Hackathon
              </p>
            </div>

            {/* Links */}
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              {[
                ['Platform', [['Disease Detection','/scan'],['Crop Planning','#modules'],['Soil Science','#modules'],['Pest Alerts','#modules']]],
                ['Company', [['About SmartAgri','#problem'],['Njala University','#njala'],['Feed Salone','#impact'],['Community Map','/dashboard/map']]],
              ].map(([group, links]) => (
                <div key={group}>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>{group}</p>
                  {links.map(([label, href]) => (
                    <a key={label} href={href} style={{ display: 'block', color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: '0.82rem', marginBottom: '0.4rem', transition: 'color 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'}
                      onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}
                    >{label}</a>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem' }}>
              © 2026 SmartAgri. Built for Sierra Leone's farmers.
            </p>
            <a href="https://smartagricsl.netlify.app" style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem', textDecoration: 'none' }}>
              smartagricsl.netlify.app
            </a>
          </div>
        </div>
      </footer>

    </div>
  )
}
