import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameDb, GameItem } from '../gamedata';
import { prettifyKey } from '../gamedata';

export function NumberField({
  value,
  onChange,
  min = 0,
  max = 2_147_483_647,
  step = 1,
  big = false,
  prefixIcon,
  className = '',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  big?: boolean;
  prefixIcon?: string | null;
  className?: string;
}): JSX.Element {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string): void => {
    const n = Math.round(Number(raw.replace(/[^\d-]/g, '')));
    if (Number.isNaN(n)) {
      setText(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, n));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  const bump = (d: number): void => {
    const n = Math.max(min, Math.min(max, value + d));
    onChange(n);
  };
  return (
    <div className={`num ${big ? 'big' : ''} ${className}`}>
      {prefixIcon && (
        <span className="prefix">
          <img src={prefixIcon} alt="" />
        </span>
      )}
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            bump(step * (e.shiftKey ? 10 : 1));
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            bump(-step * (e.shiftKey ? 10 : 1));
          }
        }}
      />
      <button type="button" onClick={() => bump(-step)} title="Decrease">
        −
      </button>
      <button type="button" onClick={() => bump(step)} title="Increase">
        +
      </button>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: ReactNode }): JSX.Element {
  return (
    <span className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="sw" />
      {label}
    </span>
  );
}

/** Item icon; largos (no icon of their own) are drawn as a composite of their two base slimes. */
export function ItemIcon({ db, itemKey, size = 64, className = '' }: { db: GameDb; itemKey: string | null; size?: number; className?: string }): JSX.Element {
  const it = itemKey ? db.item(itemKey) : undefined;
  const url = db.iconUrl(it?.icon);
  if (url) return <img src={url} alt="" width={size} height={size} className={className} draggable={false} />;
  const bases = largoBases(db, it);
  if (bases) {
    return (
      <span className={`largo ${className}`} style={{ position: 'relative', display: 'inline-block', width: size, height: size }}>
        <img src={bases[0]} alt="" style={{ position: 'absolute', left: 0, top: 0, width: size * 0.78, height: size * 0.78 }} draggable={false} />
        <img
          src={bases[1]}
          alt=""
          style={{ position: 'absolute', right: 0, bottom: 0, width: size * 0.62, height: size * 0.62 }}
          draggable={false}
        />
      </span>
    );
  }
  return (
    <span
      className={`no-icon ${className}`}
      style={{ display: 'inline-grid', placeItems: 'center', width: size, height: size, borderRadius: size / 4, background: 'rgba(255,255,255,0.08)', color: '#7f90ad', fontSize: size / 3 }}
    >
      ?
    </span>
  );
}

export function largoBases(db: GameDb, it: GameItem | undefined): [string, string] | null {
  if (!it || it.cls !== 'SlimeDefinition' || !it.baseSlimes || it.baseSlimes.length < 2) return null;
  const a = db.itemsByKey.get(`SlimeDefinition.${it.baseSlimes[0]}`);
  const b = db.itemsByKey.get(`SlimeDefinition.${it.baseSlimes[1]}`);
  const ua = db.iconUrl(a?.icon);
  const ub = db.iconUrl(b?.icon);
  return ua && ub ? [ua, ub] : null;
}

export function itemLabel(db: GameDb, key: string | null): string {
  if (!key) return 'Empty';
  const it = db.item(key);
  if (it?.name) return it.name;
  return prettifyKey(key);
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }): JSX.Element {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
