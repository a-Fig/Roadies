import { CAR_COLORS, CAR_MAKES, colorHex, type CarProfile } from '@roadies/shared';
import { useState } from 'react';
import { CarIcon } from '../components/icons';
import { savedProfile, saveProfile } from '../lib/identity';

/** Normal mode: pick your car and name once; saved on this device. */
export function Setup() {
  const initial = savedProfile();
  const [make, setMake] = useState<string>(initial?.make ?? 'Civic');
  const [color, setColor] = useState<string>(initial?.color ?? 'Teal');
  const defaultName = `${color} ${make}`;
  const [name, setName] = useState(initial && initial.name !== `${initial.color} ${initial.make}` ? initial.name : '');

  const save = () => {
    const profile: CarProfile = { make, color, name: name.trim() || defaultName };
    saveProfile(profile);
    location.assign('/');
  };

  return (
    <main className="setup">
      <h1>Set up your car</h1>
      <p className="car-sub">This is how other roadies see you.</p>

      <div className="car-card">
        <span className="avatar big" style={{ color: colorHex(color) }}>
          <CarIcon />
        </span>
        <div className="car-name">{name.trim() || defaultName}</div>
      </div>

      <label className="field">
        <span>Display name</span>
        <input value={name} maxLength={32} placeholder={defaultName} onChange={(e) => setName(e.target.value)} />
      </label>

      <fieldset className="field">
        <legend>Color</legend>
        <div className="swatches">
          {CAR_COLORS.map((c) => (
            <button
              key={c.name}
              className={`swatch ${c.name === color ? 'selected' : ''}`}
              style={{ background: c.hex }}
              aria-label={c.name}
              aria-pressed={c.name === color}
              onClick={() => setColor(c.name)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Car</legend>
        <div className="chips">
          {CAR_MAKES.map((m) => (
            <button key={m} className={`chip ${m === make ? 'selected' : ''}`} aria-pressed={m === make} onClick={() => setMake(m)}>
              {m}
            </button>
          ))}
        </div>
      </fieldset>

      <button className="primary big" onClick={save}>
        Save
      </button>
    </main>
  );
}
