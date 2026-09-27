import { lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { lang } from './lib/i18n';
import { demoCar, ensureProfile } from './lib/identity';
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

/**
 * Every phone screen lives in one phone-sized box: the whole viewport on a
 * phone, her rounded phone frame on a composed backdrop on a laptop or tablet
 * (styles.css `.phone-shell`), so nothing ever stretches to desktop width.
 */
function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="phone-shell">
      <div className="phone brand-kit">{children}</div>
    </div>
  );
}

function App() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(location.search);
  // Phone pages follow the driver's language; the projector and /sounds stay English.
  const l = path === '/presenter' || path === '/sounds' ? 'en' : lang();
  document.documentElement.lang = l;

  if (path === '/presenter') {
    return (
      <Suspense fallback={null}>
        <Presenter />
      </Suspense>
    );
  }
  if (path === '/sounds') {
    return (
      <Phone>
        <Sounds />
      </Phone>
    );
  }
  if (path === '/brand') {
    return (
      <Suspense fallback={null}>
        <Brand />
      </Suspense>
    );
  }
  if (path === '/setup') {
    // A direct link to (or reload of) /setup. The app itself opens Settings in
    // place, so a call in progress survives it.
    return (
      <Phone>
        <Setup />
      </Phone>
    );
  }
  if (path === '/demo') {
    return (
      <Phone>
        <Join mode="demo" lang={l} profile={demoCar()} spot={params.get('spot') ?? undefined} />
      </Phone>
    );
  }

  // Live mode never forces /setup: a first-ever open gets a random car right away
  // (owner rule). Settings stays reachable any time from Your jam and the voice chat.
  return (
    <Phone>
      <Join mode="live" lang={l} profile={ensureProfile()} />
    </Phone>
  );
}

// No StrictMode: its dev-only double mount would tear down the live voice session.
createRoot(document.getElementById('root')!).render(<App />);
