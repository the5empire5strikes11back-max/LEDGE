import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Ledge — Social Prediction Market'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: '#0A0A0B',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 900,
              color: '#0A0A0B',
            }}
          >
            L
          </div>
          <span style={{ fontSize: 24, fontWeight: 700, color: '#EBEBEB', letterSpacing: -0.5 }}>
            Ledge
          </span>
          <div
            style={{
              marginLeft: 8,
              fontSize: 11,
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: 2,
              textTransform: 'uppercase',
              background: 'rgba(255,255,255,0.08)',
              padding: '4px 10px',
              borderRadius: 20,
            }}
          >
            Prediction Market
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: '#EBEBEB',
            lineHeight: 1.05,
            letterSpacing: -2,
            marginBottom: 28,
            maxWidth: 860,
          }}
        >
          You&apos;re always right.{' '}
          <span style={{ color: '#FFFFFF' }}>Now you have proof.</span>
        </div>

        {/* Subheadline */}
        <div
          style={{
            fontSize: 24,
            color: '#8585A0',
            lineHeight: 1.5,
            maxWidth: 680,
            marginBottom: 56,
          }}
        >
          Bet on sports, politics &amp; culture with free virtual credits.
          Track your accuracy. Beat your friends.
        </div>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: 48 }}>
          {[
            { value: '1,000 CR', label: 'free on signup' },
            { value: '500 CR', label: 'every day' },
            { value: '$0', label: 'real money, ever' },
          ].map((s) => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                {s.value}
              </span>
              <span style={{ fontSize: 14, color: '#8585A0', fontWeight: 500 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background: 'linear-gradient(90deg, #FFFFFF 0%, rgba(255,255,255,0.1) 100%)',
          }}
        />
      </div>
    ),
    { ...size }
  )
}
