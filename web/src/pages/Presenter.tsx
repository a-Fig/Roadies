import { colorHex, type CarSnapshot, type LatLng, type PresenterAction, type WorldSnapshot } from '@roadies/shared';
import QRCode from 'qrcode';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CorridorMap } from '../components/CorridorMap';
import { CarIcon, HeadphonesIcon, MicIcon, SpeakerIcon } from '../components/icons';
import { RoadiesSocket } from '../lib/socket';

const ROOM_PALETTE = ['#5865f2', '#f5a524', '#eb459e', '#00b0f4', '#fee75c', '#b57bff', '#ff7a45', '#1abc9c', '#a3e635', '#60a5fa'];
const DEMO_START_MINUTES = 8 * 60 + 15;

function demoClock(startedAt: number, now: number): string {
  const minutes = DEMO_START_MINUTES + Math.floor((now - startedAt) / 60_000);
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The projector: Discord-style channel list + live map of 101 + QR code. */
export function Presenter() {
  const params = new URLSearchParams(location.search);
  const key = params.get('key') ?? '';
  const joinUrl = params.get('join') ?? `${location.origin}/demo`;

  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [admin, setAdmin] = useState(params.has('admin'));
  const [qr, setQr] = useState('');
  const [startedAt, setStartedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [fitSignal, setFitSignal] = useState(0);
  const [focus, setFocus] = useState<LatLng[] | null>(null);
  const socket = useRef<RoadiesSocket<WorldSnapshot, PresenterAction> | null>(null);
  const colors = useRef(new Map<string, string>());

  useEffect(() => {
    const s = new RoadiesSocket<WorldSnapshot, PresenterAction>(
      { onMessage: setSnapshot, onRejected: (reason) => setRejected(reason || 'Rejected') },
      `?role=presenter&key=${encodeURIComponent(key)}`,
    );
    s.start();
    socket.current = s;
    return () => s.stop();
  }, [key]);

  useEffect(() => {
    void QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: '#111214', light: '#ffffff' } }).then(setQr);
  }, [joinUrl]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const act = useCallback((msg: PresenterAction) => socket.current?.send(msg), []);
  const reset = useCallback(() => {
    if (!confirm('Reset the demo? Everyone is re-placed from scratch.')) return;
    act({ t: 'admin', action: 'reset' });
    colors.current.clear();
    setStartedAt(Date.now());
  }, [act]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (k === 'a') setAdmin((v) => !v);
      else if (k === 'f') setFitSignal((n) => n + 1);
      else if (k === 'l') act({ t: 'admin', action: 'spawn-loner' });
      else if (k === 'm') act({ t: 'admin', action: 'mute-all' });
      else if (k === 'r') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, reset]);

  const roomColor = useCallback((roomId: string | null) => {
    if (!roomId) return '#8a8e99';
    let c = colors.current.get(roomId);
    if (!c) {
      c = ROOM_PALETTE[colors.current.size % ROOM_PALETTE.length]!;
      colors.current.set(roomId, c);
    }
    return c;
  }, []);

  const cars = snapshot?.cars ?? [];
  const byId = useMemo(() => new Map(cars.map((c) => [c.id, c])), [cars]);
  const rooms = useMemo(
    () => [...(snapshot?.rooms ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [snapshot],
  );
  const activeCars = cars.filter((c) => c.roomId && c.state.connected);
  const muteCar = (car: CarSnapshot) => {
    if (admin) act({ t: 'admin', action: 'mute-car', carId: car.id });
  };

  if (rejected) {
    return (
      <main className="splash">
        <h1>Presenter view</h1>
        <p className="notice error">{rejected}. Open /presenter?key=YOUR_KEY.</p>
      </main>
    );
  }

  return (
    <div className="presenter">
      <nav className="rail">
        <button className={`rail-icon ${admin ? 'active' : ''}`} title="Presenter controls (A)" onClick={() => setAdmin((v) => !v)}>
          <img src="/favicon.svg" alt="Roadies" />
        </button>
      </nav>

      <aside className="sidebar">
        <header className="sidebar-header">Roadies · US-101 NB</header>
        <div className="channels">
          <div className="category">Voice channels — {rooms.length}</div>
          {rooms.length === 0 && <p className="empty">Nobody here yet. Scan the code to join the jam.</p>}
          {rooms.map((room) => {
            const members = room.memberIds.map((id) => byId.get(id)).filter((c): c is CarSnapshot => !!c && c.state.connected);
            return (
              <div key={room.id} className="channel">
                <button className="channel-name" onClick={() => setFocus(members.map((m) => m.pos))}>
                  <SpeakerIcon />
                  <span className="dot" style={{ background: roomColor(room.id) }} />
                  <span className="label">{room.name}</span>
                  <span className={`count ${room.activeCount >= (snapshot?.capacity ?? 8) ? 'full' : ''}`}>
                    {room.activeCount}/{snapshot?.capacity ?? 8}
                  </span>
                </button>
                {room.mergeInMs !== null && (
                  <div className="merge">⏱ Alone — merging in {Math.ceil(room.mergeInMs / 1000)}s</div>
                )}
                {members.map((m) => (
                  <button key={m.id} className={`member ${m.speaking ? 'speaking' : ''}`} onClick={() => muteCar(m)}>
                    <span className="avatar" style={{ color: colorHex(m.color) }}>
                      <CarIcon />
                    </span>
                    <span className="label">
                      {m.name}
                      {m.bot && <em> bot</em>}
                    </span>
                    {m.state.selfDeaf ? (
                      <HeadphonesIcon slashed className="state-icon" />
                    ) : m.state.selfMute ? (
                      <MicIcon slashed className="state-icon" />
                    ) : null}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </aside>

      <main className="stage">
        <header className="stage-header">
          <span className="hash">#</span>
          <span className="stage-title">us-101-northbound</span>
          <span className="divider" />
          <span className="stage-sub">South Bay → San Francisco, morning commute</span>
          <span className="spacer" />
          <span className="stat">🕗 {demoClock(startedAt, now)}</span>
          <span className="stat">
            {activeCars.length} roadies · {rooms.length} rooms
          </span>
        </header>
        <div className="stage-body">
          <CorridorMap cars={cars} roomColor={roomColor} onCarClick={muteCar} fitSignal={fitSignal} focus={focus} />

          <div className="ticker">
            {(snapshot?.log ?? []).slice(0, 5).map((line, i) => (
              <div key={`${i}-${line}`} className="ticker-line">
                {line}
              </div>
            ))}
          </div>

          <div className="qr-card">
            <div className="qr-title">Scan to join the jam</div>
            {qr && <img src={qr} alt={`QR code for ${joinUrl}`} />}
            <div className="qr-url">{joinUrl.replace(/^https?:\/\//, '')}</div>
          </div>

          {admin && (
            <div className="admin">
              <div className="admin-title">Presenter controls</div>
              <button onClick={() => act({ t: 'admin', action: 'spawn-loner' })}>🚗 Spawn lone commuter (L)</button>
              <button onClick={() => act({ t: 'admin', action: 'mute-all' })}>🔇 Mute everyone (M)</button>
              <button onClick={() => setFitSignal((n) => n + 1)}>🗺️ Show whole corridor (F)</button>
              <button className="danger" onClick={reset}>
                🔄 Reset demo (R)
              </button>
              <p>Click a car or a member to mute them. A hides this panel.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
