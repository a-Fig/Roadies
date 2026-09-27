import { CAR_COLORS, CAR_MAKES, colorHex, LANG_NAMES, LANGS, type CarProfile, type Lang, type Mode } from '@roadies/shared';
import { useEffect, useState } from 'react';
import { CarArt } from '../components/CarArt';
import { LineArrowLeft } from '../components/icons';
import { colorLabel, defaultName, hasDefaultName, lang, setLang, strings } from '../lib/i18n';
import { savedProfile, saveProfile } from '../lib/identity';

interface InApp {
  mode: Mode;
  lang: Lang;
  profile: CarProfile;
  onSave: (profile: CarProfile, lang: Lang) => void;
  onBack: () => void;
}

/**
 * Settings: car, color, name and language. Opened in place from Your jam or
 * the voice chat (`inApp`), so a call keeps going; saving applies to it right
 * away. A direct visit to /setup edits the saved live profile and goes home.
 */
export function Setup({ inApp }: { inApp?: InApp }) {
  const startLang = inApp?.lang ?? lang();
  const initial = inApp?.profile ?? savedProfile();
  const [picked, setPicked] = useState<Lang>(startLang);
  const [make, setMake] = useState<string>(initial?.make ?? 'Civic');
  const [color, setColor] = useState<string>(initial?.color ?? 'Teal');
  // A default name ("Teal Civic", "Civic turquoise"…) is not something the driver typed.
  const [name, setName] = useState(initial && !hasDefaultName(initial) ? initial.name : '');
  const t = strings(picked);
  const fallbackName = defaultName(picked, make, color);

  // Picking a language shows the page in it right away; leaving without Save puts it back.
  useEffect(() => {
    document.documentElement.lang = picked;
  }, [picked]);
  useEffect(() => () => void (document.documentElement.lang = lang()), []);

  const save = () => {
    const profile: CarProfile = { make, color, name: name.trim() || fallbackName };
    if (inApp) return inApp.onSave(profile, picked);
    setLang(picked);
    saveProfile(profile);
    location.assign('/');
  };

  return (
    <main className="screen setup">
      <header className="setup-top">
        {inApp ? (
          <button className="icon-btn" aria-label={t.back} onClick={inApp.onBack}>
            <LineArrowLeft />
          </button>
        ) : (
          <a className="icon-btn" aria-label={t.back} href="/">
            <LineArrowLeft />
          </a>
        )}
        <h1>{t.setupTitle}</h1>
      </header>

      <div className="car-preview">
        <CarArt color={colorHex(color)} size={150} />
        <div className="car-name">{name.trim() || fallbackName}</div>
      </div>

      <label className="field">
        <span>{t.displayName}</span>
        <input value={name} maxLength={32} placeholder={fallbackName} onChange={(e) => setName(e.target.value)} />
      </label>

      <fieldset className="field">
        <legend>{t.color}</legend>
        <div className="swatches">
          {CAR_COLORS.map((c) => (
            <button
              key={c.name}
              className={`swatch ${c.name === color ? 'selected' : ''}`}
              aria-label={colorLabel(picked, c.name)}
              aria-pressed={c.name === color}
              onClick={() => setColor(c.name)}
            >
              <CarArt color={c.hex} size={44} />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>{t.car}</legend>
        <div className="chips">
          {CAR_MAKES.map((m) => (
            <button key={m} className={`chip ${m === make ? 'selected' : ''}`} aria-pressed={m === make} onClick={() => setMake(m)}>
              {m}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>{t.language}</legend>
        <div className="chips">
          {LANGS.map((l) => (
            // Each language's name in itself, so anyone can find theirs.
            <button key={l} lang={l} className={`chip ${l === picked ? 'selected' : ''}`} aria-pressed={l === picked} onClick={() => setPicked(l)}>
              {LANG_NAMES[l]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="save-bar">
        <button className="btn-primary" onClick={save}>
          {t.save}
        </button>
      </div>
    </main>
  );
}
