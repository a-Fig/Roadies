import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { lang, strings } from './lib/i18n';
import { demoCar, savedProfile } from './lib/identity';
import { Join } from './pages/Join';
import { Setup } from './pages/Setup';
import { Sounds } from './pages/Sounds';
import './styles.css';
// Roboto 400/500/700, restricted to the subsets the app actually needs
// (en/fr/es use latin + latin-ext; vi needs the vietnamese subset too).
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/roboto/latin-ext-400.css';
import '@fontsource/roboto/latin-ext-500.css';
import '@fontsource/roboto/latin-ext-700.css';
import '@fontsource/roboto/vietnamese-400.css';
import '@fontsource/roboto/vietnamese-500.css';
import '@fontsource/roboto/vietnamese-700.css';
import './brand.css';

// The projector's map and QR code libraries never ship to phones.
const Presenter = lazy(() => import('./pages/Presenter').then((m) => ({ default: m.Presenter })));
// Dev-only brand kit preview (intro, tokens, fonts, car colors); not linked from the app.
const Brand = lazy(() => import('./pages/Brand').then((m) => ({ default: m.Brand })));

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
  if (path === '/brand') {
    return (
      <Suspense fallback={null}>
        <Brand />
      </Suspense>
    );
  }
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
