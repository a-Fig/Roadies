import { CAR_COLORS, CAR_MAKES, colorHex, LANG_NAMES, LANGS, type CarProfile, type Lang } from '@roadies/shared';
import { useEffect, useState } from 'react';
import { CarArt } from '../components/CarArt';
import { CarIcon } from '../components/icons';
import { colorLabel, defaultName, hasDefaultName, lang, setLang, strings } from '../lib/i18n';
import { savedProfile, saveProfile } from '../lib/identity';

/**
 * Settings (normal mode): language, car and name, saved on this device.
 * Picking a language re-renders the page in it right away; Save keeps it.
 */
export function Setup() {
  const initial = savedProfile();
  const [picked, setPicked] = useState<Lang>(lang());
  const [make, setMake] = useState<string>(initial?.make ?? 'Civic');
  const [color, setColor] = useState<string>(initial?.color ?? 'Teal');
  // A default name ("Teal Civic", "Civic turquoise"…) is not something the driver typed.
  const [name, setName] = useState(initial && !hasDefaultName(initial) ? initial.name : '');
  const t = strings(picked);
  const fallbackName = defaultName(picked, make, color);

  useEffect(() => {
    document.documentElement.lang = picked;
  }, [picked]);

  const save = () => {
    const profile: CarProfile = { make, color, name: name.trim() || fallbackName };
    setLang(picked);
    saveProfile(profile);
    location.assign('/');
  };

  return (
    <main className="setup brand-kit">
      <h1>{t.setupTitle}</h1>
      <p className="car-sub">{t.setupSub}</p>

      <div className="car-card">
        <span className="avatar big" style={{ color: colorHex(color) }}>
          <CarIcon />
        </span>
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
              <CarArt color={c.hex} size={40} />
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

      <button className="primary big" onClick={save}>
        {t.save}
      </button>
    </main>
  );
}
