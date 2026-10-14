import { useId, useState } from 'react';
import { defaultDevice, DEFAULT_MATRIX, type DeviceConfig } from '../../core/device.ts';
import { LIMITS } from '../../core/limits.ts';
import {
  connectionsFor,
  DEFAULT_PROFILE_ID,
  DISPLAY_PROFILES,
  getProfile,
  MATRIX_ROTATIONS,
  MATRIX_WIRINGS,
  MAX7219_BRIGHTNESS_MAX,
  profileCanvasSize,
  targetsFor,
  type ConnectionId,
  type DisplayFamily,
  type DisplayProfile,
  type MatrixRotation,
  type MatrixWiringId,
} from '../../device-profiles/index.ts';
import { usePreferences } from '../app-context.tsx';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { Dialog } from './Dialog.tsx';

/**
 * Configuración guiada del proyecto y campos del dispositivo. Solo se
 * muestran combinaciones válidas: la conexión depende del perfil y el destino
 * de código de la conexión.
 */

export const FAMILIES: readonly DisplayFamily[] = ['character', 'graphic', 'led-matrix'];

/** Campos de conexión, destino de código y (matrices LED) orientación física. */
export function DeviceFields(props: {
  profile: DisplayProfile;
  device: DeviceConfig;
  onChange: (device: DeviceConfig) => void;
  /** Qué parte mostrar: conexión (y matriz), destino de código o todo. */
  part?: 'connection' | 'target' | 'all';
}) {
  const part = props.part ?? 'all';
  const { tk, t } = useI18n();
  const prefs = usePreferences();
  const ids = useId();
  const { profile, device, onChange } = props;
  const connections = connectionsFor(profile);
  const targets = device.connection ? targetsFor(profile, device.connection) : [];
  const matrix = device.matrix ?? DEFAULT_MATRIX;
  return (
    <>
      {part === 'target' ? null : connections.length > 0 ? (
        <div className="row">
          <label htmlFor={`${ids}-conn`}>{tk('setup.connection')}</label>
          <select
            id={`${ids}-conn`}
            className="field grow"
            value={device.connection ?? ''}
            data-testid="setup-connection"
            onChange={(e) => {
              const connection = (e.target.value || null) as ConnectionId | null;
              const available = connection ? targetsFor(profile, connection) : [];
              onChange({
                ...device,
                connection,
                codeTarget: available.some((x) => x.exporterId === device.codeTarget)
                  ? device.codeTarget
                  : null,
              });
            }}
          >
            <option value="">{tk('setup.later')}</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {t(c.labelKey)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="hint">{tk('setup.noConnection')}</p>
      )}
      {part !== 'connection' && device.connection ? (
        <fieldset className="group">
          <legend>{tk('setup.target')}</legend>
          <label className="check">
            <input
              type="radio"
              name={`${ids}-target`}
              checked={device.codeTarget === null}
              onChange={() => onChange({ ...device, codeTarget: null })}
            />
            {tk('setup.later')}
          </label>
          {targets.map((target) => {
            const hidden = target.stability === 'experimental' && !prefs.experimental;
            return (
              <div key={target.exporterId + target.labelKey}>
                <label className="check">
                  <input
                    type="radio"
                    name={`${ids}-target`}
                    checked={device.codeTarget === target.exporterId}
                    disabled={hidden}
                    onChange={() => onChange({ ...device, codeTarget: target.exporterId })}
                    data-testid={`setup-target-${target.exporterId}`}
                  />
                  {t(target.labelKey)}
                </label>
                {hidden ? <p className="hint">{tk('setup.experimentalOff')}</p> : null}
              </div>
            );
          })}
        </fieldset>
      ) : null}
      {profile.kind === 'led-matrix' && part !== 'target' ? (
        <fieldset className="group">
          <legend>{tk('setup.matrix')}</legend>
          <div className="row">
            <label htmlFor={`${ids}-rot`}>{tk('setup.rotation')}</label>
            <select
              id={`${ids}-rot`}
              className="field"
              value={matrix.rotation}
              data-testid="setup-rotation"
              onChange={(e) =>
                onChange({
                  ...device,
                  matrix: { ...matrix, rotation: Number(e.target.value) as MatrixRotation },
                })
              }
            >
              {MATRIX_ROTATIONS.map((r) => (
                <option key={r} value={r}>
                  {tk('setup.rotation.value', { deg: r })}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <label htmlFor={`${ids}-wiring`}>{tk('setup.wiring')}</label>
            <select
              id={`${ids}-wiring`}
              className="field grow"
              value={matrix.wiring}
              data-testid="setup-wiring"
              onChange={(e) =>
                onChange({
                  ...device,
                  matrix: { ...matrix, wiring: e.target.value as MatrixWiringId },
                })
              }
            >
              {MATRIX_WIRINGS.map((w) => (
                <option key={w} value={w}>
                  {tk(`wiring.${w}` as MessageKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <label htmlFor={`${ids}-bright`}>{tk('setup.brightness')}</label>
            <input
              id={`${ids}-bright`}
              type="range"
              min={0}
              max={MAX7219_BRIGHTNESS_MAX}
              value={matrix.brightness}
              aria-valuetext={tk('setup.brightness.value', { value: matrix.brightness })}
              onChange={(e) =>
                onChange({ ...device, matrix: { ...matrix, brightness: Number(e.target.value) } })
              }
            />
            <span>{matrix.brightness}</span>
          </div>
          <p className="hint">{tk('setup.matrix.hint')}</p>
        </fieldset>
      ) : null}
    </>
  );
}

const STEPS = ['family', 'display', 'connection', 'target', 'summary'] as const;
type Step = (typeof STEPS)[number];

export interface NewProjectOptions {
  name: string;
  profileId: string;
  width?: number;
  height?: number;
  device: DeviceConfig;
}

/**
 * Nuevo proyecto: familia → pantalla → conexión → plataforma → resumen. Se
 * puede empezar solo con el diseño y configurar la conexión y el código
 * después (Proyecto → Configuración).
 */
export function NewProjectWizard(props: {
  open: boolean;
  onClose: () => void;
  onCreate: (options: NewProjectOptions) => void;
}) {
  return props.open ? <Wizard onClose={props.onClose} onCreate={props.onCreate} /> : null;
}

function Wizard({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (o: NewProjectOptions) => void;
}) {
  const { tk, t } = useI18n();
  const ids = useId();
  const [step, setStep] = useState<Step>('family');
  const [family, setFamily] = useState<DisplayFamily>('character');
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
  const [size, setSize] = useState({ width: 128, height: 64 });
  const [name, setName] = useState('');
  const profile = getProfile(profileId)!;
  const [device, setDevice] = useState<DeviceConfig>(() => defaultDevice(profile));
  const custom = profile.kind === 'graphic' && !profile.fixedSize;
  const sizeValid =
    !custom ||
    (Number.isInteger(size.width) &&
      Number.isInteger(size.height) &&
      size.width >= 1 &&
      size.height >= 1 &&
      size.width <= LIMITS.canvasMaxSide &&
      size.height <= LIMITS.canvasMaxSide);
  const canvas = profileCanvasSize(profile, size);
  const index = STEPS.indexOf(step);

  const chooseProfile = (id: string) => {
    const p = getProfile(id)!;
    setProfileId(id);
    setDevice(defaultDevice(p));
  };
  const chooseFamily = (f: DisplayFamily) => {
    setFamily(f);
    const first = DISPLAY_PROFILES.find((p) => p.kind === f)!;
    chooseProfile(f === 'character' ? DEFAULT_PROFILE_ID : first.id);
  };
  const create = () => {
    if (!sizeValid) return;
    onCreate({
      name: name.trim() || tk('app.defaultProjectName'),
      profileId,
      ...(custom ? size : {}),
      device,
    });
  };
  const designOnly = () => {
    setDevice({ ...device, connection: null, codeTarget: null });
    setStep('summary');
  };
  const canNext = step !== 'display' || sizeValid;

  return (
    <Dialog
      open
      title={tk('dialog.new.title')}
      onClose={onClose}
      testId="new-dialog"
      actions={
        <>
          {index > 0 ? (
            <button type="button" className="btn" onClick={() => setStep(STEPS[index - 1]!)}>
              {tk('wizard.back')}
            </button>
          ) : null}
          {step === 'connection' || step === 'target' ? (
            <button
              type="button"
              className="btn"
              onClick={designOnly}
              data-testid="new-design-only"
            >
              {tk('setup.designOnly')}
            </button>
          ) : null}
          {step !== 'summary' ? (
            <button
              type="button"
              className="btn primary"
              disabled={!canNext}
              onClick={() =>
                setStep(
                  // Sin conexiones (gráfica genérica) o sin conexión elegida no hay plataforma que elegir.
                  (step === 'display' && connectionsFor(profile).length === 0) ||
                    (step === 'connection' && device.connection === null)
                    ? 'summary'
                    : STEPS[index + 1]!,
                )
              }
              data-testid="new-next"
            >
              {tk('wizard.next')}
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={!sizeValid}
              onClick={create}
              data-testid="new-create"
            >
              {tk('dialog.new.create')}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            {tk('dialog.cancel')}
          </button>
        </>
      }
    >
      <ol className="wizard-steps" aria-label={tk('wizard.steps')}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={s === step ? 'step' : undefined} data-done={i < index}>
            {i + 1}. {tk(`setup.step.${s}` as MessageKey)}
          </li>
        ))}
      </ol>

      {step === 'family' ? (
        <fieldset className="group" data-testid="new-step-family">
          <legend>{tk('setup.step.family')}</legend>
          {FAMILIES.map((f) => (
            <div key={f}>
              <label className="check">
                <input
                  type="radio"
                  name={`${ids}-family`}
                  checked={family === f}
                  onChange={() => chooseFamily(f)}
                  data-testid={`new-family-${f}`}
                />
                {tk(`family.${f}` as MessageKey)}
              </label>
              <p className="hint">{tk(`family.${f}.hint` as MessageKey)}</p>
            </div>
          ))}
        </fieldset>
      ) : null}

      {step === 'display' ? (
        <fieldset className="group" data-testid="new-step-display">
          <legend>{tk('setup.step.display')}</legend>
          {DISPLAY_PROFILES.filter((p) => p.kind === family).map((p) => (
            <label key={p.id} className="check">
              <input
                type="radio"
                name={`${ids}-profile`}
                checked={profileId === p.id}
                onChange={() => chooseProfile(p.id)}
                data-testid={`new-profile-${p.id}`}
              />
              {t(p.labelKey)}
            </label>
          ))}
          {custom ? (
            <div className="row">
              <label htmlFor="new-width">{tk('project.width')}</label>
              <input
                id="new-width"
                className="field narrow"
                type="number"
                min={1}
                max={LIMITS.canvasMaxSide}
                value={Number.isFinite(size.width) ? size.width : ''}
                aria-invalid={!sizeValid}
                onChange={(e) => setSize({ ...size, width: e.target.valueAsNumber })}
              />
              <label htmlFor="new-height">{tk('project.height')}</label>
              <input
                id="new-height"
                className="field narrow"
                type="number"
                min={1}
                max={LIMITS.canvasMaxSide}
                value={Number.isFinite(size.height) ? size.height : ''}
                aria-invalid={!sizeValid}
                onChange={(e) => setSize({ ...size, height: e.target.valueAsNumber })}
              />
            </div>
          ) : null}
          {!sizeValid ? (
            <p className="error-text" role="alert">
              {tk('limits.canvasSize', {
                width: String(size.width),
                height: String(size.height),
                max: LIMITS.canvasMaxSide,
              })}
            </p>
          ) : null}
          <p className="hint">{tk(`setup.features.${profile.kind}` as MessageKey)}</p>
        </fieldset>
      ) : null}

      {step === 'connection' ? (
        <div data-testid="new-step-connection">
          <DeviceFields profile={profile} device={device} onChange={setDevice} part="connection" />
        </div>
      ) : null}

      {step === 'target' ? (
        <div data-testid="new-step-target">
          {device.connection ? (
            <DeviceFields profile={profile} device={device} onChange={setDevice} part="target" />
          ) : (
            <p>{tk('setup.noTargetWithoutConnection')}</p>
          )}
        </div>
      ) : null}

      {step === 'summary' ? (
        <div data-testid="new-step-summary">
          <div className="row">
            <label htmlFor="new-name">{tk('project.name')}</label>
            <input
              id="new-name"
              className="field grow"
              maxLength={LIMITS.nameMaxLength}
              value={name}
              placeholder={tk('app.defaultProjectName')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
          </div>
          <dl className="summary-list">
            <dt>{tk('setup.step.display')}</dt>
            <dd>
              {t(profile.labelKey)}
              {canvas ? ` — ${canvas.width} × ${canvas.height} px` : ''}
            </dd>
            <dt>{tk('setup.connection')}</dt>
            <dd>
              {device.connection
                ? t(connectionsFor(profile).find((c) => c.id === device.connection)!.labelKey)
                : tk('setup.notConfigured')}
            </dd>
            <dt>{tk('setup.target')}</dt>
            <dd>
              {device.codeTarget
                ? t(
                    targetsFor(profile, device.connection).find(
                      (x) => x.exporterId === device.codeTarget,
                    )!.labelKey,
                  )
                : tk('setup.notConfigured')}
            </dd>
            {device.matrix ? (
              <>
                <dt>{tk('setup.matrix')}</dt>
                <dd>
                  {tk('setup.rotation.value', { deg: device.matrix.rotation })} ·{' '}
                  {tk(`wiring.${device.matrix.wiring}` as MessageKey)} ·{' '}
                  {tk('setup.brightness.value', { value: device.matrix.brightness })}
                </dd>
              </>
            ) : null}
          </dl>
          <p className="hint">{tk('setup.summary.hint')}</p>
          <p className="hint">{tk('dialog.new.unsaved')}</p>
        </div>
      ) : null}
    </Dialog>
  );
}
