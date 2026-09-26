import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { lang, strings } from './lib/i18n';
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
  // Phone pages follow the driver's language; the projector and /sounds stay English.
  const l = path === '/presenter' || path === '/sounds' ? 'en' : lang();
  const t = strings(l);
  document.documentElement.lang = l;

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
    return <Join mode="demo" lang={l} profile={demoCar()} spot={params.get('spot') ?? undefined} kicker={t.demoKicker} cta={t.demoCta} />;
  }

  const profile = savedProfile();
  if (!profile) {
    location.replace('/setup');
    return null;
  }
  return (
    <Join
      mode="live"
      lang={l}
      profile={profile}
      kicker={t.liveKicker}
      cta={t.liveCta}
      footer={
        <p className="links">
          <a href="/setup">{t.settings}</a> · <a href="/demo">{t.tryDemo}</a>
        </p>
      }
    />
  );
}

// No StrictMode: its dev-only double mount would tear down the live voice session.
createRoot(document.getElementById('root')!).render(<App />);
