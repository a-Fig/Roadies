import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { demoCar, savedProfile } from './lib/identity';
import { Join } from './pages/Join';
import { Setup } from './pages/Setup';
import { Sounds } from './pages/Sounds';
import './styles.css';

// The projector's map and QR code libraries never ship to phones.
const Presenter = lazy(() => import('./pages/Presenter').then((m) => ({ default: m.Presenter })));

function App() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(location.search);

  if (path === '/presenter') {
    return (
      <Suspense fallback={null}>
        <Presenter />
      </Suspense>
    );
  }
  if (path === '/setup') return <Setup />;
  if (path === '/sounds') return <Sounds />;
  if (path === '/demo') {
    return (
      <Join
        mode="demo"
        profile={demoCar()}
        spot={params.get('spot') ?? undefined}
        kicker="Stuck on US-101 northbound · 8:15 AM"
        cta="Join the jam"
      />
    );
  }

  const profile = savedProfile();
  if (!profile) {
    location.replace('/setup');
    return null;
  }
  return (
    <Join
      mode="live"
      profile={profile}
      kicker="Proximity voice for the jam you’re in"
      cta="Start driving"
      footer={
        <p className="links">
          <a href="/setup">Edit car</a> · <a href="/demo">Try the demo</a>
        </p>
      }
    />
  );
}

// No StrictMode: its dev-only double mount would tear down the live voice session.
createRoot(document.getElementById('root')!).render(<App />);
