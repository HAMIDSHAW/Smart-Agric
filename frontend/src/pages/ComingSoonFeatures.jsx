import { Link } from 'react-router-dom'

const COMING_SOON = [
  {
    icon: '📵',
    title: 'Offline Mode',
    subtitle: 'Use SmartAgri without internet',
    desc: 'Disease library, treatment advice, and basic diagnosis will work fully offline and sync automatically when your connection returns. Built for areas with poor network coverage across Sierra Leone.',
    eta: 'Q3 2026',
    why: 'Requires a mobile app with local database storage',
  },
  {
    icon: '🔔',
    title: 'Push Notifications',
    subtitle: 'Disease alerts sent to your phone',
    desc: 'When a disease is spreading near your district, based on what other farmers are uploading, you get an automatic push notification before it reaches your field.',
    eta: 'Q3 2026',
    why: 'Requires the SmartAgri mobile app on Android/iOS',
  },
  {
    icon: '📍',
    title: 'GPS Field-Level Disease Tracking',
    subtitle: 'Track disease spread field by field',
    desc: 'Every disease scan will be tagged with GPS coordinates, building a precise real-time map of disease movement across Sierra Leone, not just by district but by exact field location.',
    eta: 'Q4 2026',
    why: 'Requires the mobile app and months of GPS-tagged data collection',
  },
  {
    icon: '🤝',
    title: 'Farmer Community Forum',
    subtitle: 'Ask questions, share knowledge',
    desc: 'Farmers post questions, other farmers and Njala University agronomists answer. A living knowledge base built from real Sierra Leone farming experience.',
    eta: 'Q3 2026',
    why: 'Requires moderation system and agronomist partnerships',
  },
  {
    icon: '🏪',
    title: 'Input Seller Connection',
    subtitle: 'Find where to buy seeds, fertilizer and treatments nearby',
    desc: 'After SmartAgri diagnoses your crop, it connects you directly to the nearest agro-dealer who has the recommended treatment in stock, with a price comparison.',
    eta: 'Q4 2026',
    why: 'Requires mapping Sierra Leone agro-dealers and logistics partnerships',
  },
  {
    icon: '📱',
    title: 'SmartAgri Mobile App',
    subtitle: 'Android and iOS, coming to your phone',
    desc: 'A dedicated mobile app with offline mode, GPS tracking, push notifications, camera integration, and a better experience for farmers in the field.',
    eta: 'Q3 2026',
    why: 'Under active development. The web platform is the foundation',
  },
]

export default function ComingSoonFeatures() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">Roadmap</div>
        <h1 className="font-serif text-2xl text-bark font-bold">Coming Soon</h1>
        <p className="text-agri-muted text-sm mt-1">
          SmartAgri is actively being developed. These features are on our roadmap, built for Sierra Leone farmers.
        </p>
      </div>

      {/* Currently live banner */}
      <div className="card p-4 bg-gradient-to-r from-leaf/8 to-gold/5 border-leaf/20">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🟢</div>
          <div>
            <p className="font-semibold text-bark text-sm">What is live right now</p>
            <p className="text-agri-muted text-xs mt-0.5 leading-relaxed">
              Disease detection · Nutrient deficiency detection · Crop recommendations · Fertilizer calculator with plot size ·
              Crop calendar · Harvest tracker · Crop comparison · Post-harvest storage · Land suitability ·
              Soil analysis · Pest alerts with WhatsApp · AI assistant in English and Krio ·
              Community disease map · Farming conditions weather widget · Impact dashboard
            </p>
          </div>
        </div>
      </div>

      {/* Coming soon features */}
      <div className="grid sm:grid-cols-2 gap-4">
        {COMING_SOON.map((f, i) => (
          <div key={i} className="card p-5 border-t-4 border-gold/40 relative overflow-hidden">
            {/* Coming soon badge */}
            <div className="absolute top-3 right-3">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/20">
                {f.eta}
              </span>
            </div>

            <div className="text-3xl mb-3">{f.icon}</div>
            <h3 className="font-serif text-lg font-bold text-bark mb-0.5">{f.title}</h3>
            <p className="text-leaf text-xs font-semibold mb-2">{f.subtitle}</p>
            <p className="text-agri-muted text-sm leading-relaxed mb-3">{f.desc}</p>
            <div className="flex items-start gap-1.5 p-2.5 rounded-lg bg-sand-light border border-sand">
              <span className="text-sm">💡</span>
              <p className="text-xs text-agri-muted">{f.why}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Contact/feedback */}
      <div className="card p-5 text-center">
        <div className="text-3xl mb-2">📬</div>
        <h3 className="font-semibold text-bark mb-1">Have a feature idea?</h3>
        <p className="text-agri-muted text-sm mb-3">
          We built SmartAgri by listening to Sierra Leone farmers. Tell us what you need.
        </p>
        <a href="mailto:mohamed.shaw81756@njala.edu.sl"
          className="btn-primary inline-flex">
          Send us feedback
        </a>
      </div>

      <p className="text-center text-agri-muted text-xs pb-4">
      Built by <strong className="text-bark">Mohamed Hamidu Shaw</strong> · Kenema, Sierra Leone · Njala University
      </p>
    </div>
  )
}
