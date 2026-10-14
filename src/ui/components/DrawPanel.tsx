import { useEffect, useId, useRef } from 'react';
import { resolveColors } from '../../core/appearance.ts';
import { CGRAM_SLOTS, glyphKey } from '../../core/charlcd.ts';
import { patternUses } from '../../core/constraints.ts';
import { unsupportedTextChars } from '../../engine/text.ts';
import { useEditor, useServices } from '../app-context.tsx';
import { useCharAnalysis, useProfile } from '../hooks.ts';
import { useI18n } from '../i18n/index.tsx';
import { useCommands } from '../commands.tsx';
import { PixelIcon } from './PixelIcon.tsx';

export function DrawPanel() {
  const { tk } = useI18n();
  const { store, toasts } = useServices();
  const tool = useEditor((s) => s.tool);
  const text = useEditor((s) => s.text);
  const transformAll = useEditor((s) => s.transformAll);
  const wrapShift = useEditor((s) => s.wrapShift);
  const selection = useEditor((s) => s.selection);
  const clipboard = useEditor((s) => s.clipboard);
  const profile = useProfile();
  const unsupported = unsupportedTextChars(text.value);

  return (
    <>
      {tool === 'text' ? (
        <fieldset className="group">
          <legend>{tk('draw.textGroup')}</legend>
          <div className="row">
            <label htmlFor="text-value">{tk('draw.text')}</label>
            <input
              id="text-value"
              className="field grow"
              value={text.value}
              maxLength={64}
              aria-invalid={unsupported.length > 0}
              aria-describedby="text-error text-hint"
              onChange={(e) => store.setText({ value: e.target.value })}
            />
          </div>
          <p id="text-error" className="error-text" role="alert">
            {unsupported.length > 0
              ? tk('draw.textUnsupported', { chars: unsupported.join(' ') })
              : ''}
          </p>
          <div className="row">
            <label htmlFor="text-scale">{tk('draw.textScale')}</label>
            <select
              id="text-scale"
              className="field"
              value={text.scale}
              onChange={(e) => store.setText({ scale: Number(e.target.value) })}
            >
              {[1, 2, 3, 4].map((s) => (
                <option key={s} value={s}>
                  ×{s}
                </option>
              ))}
            </select>
            <label htmlFor="text-advance">{tk('draw.textAdvance')}</label>
            <select
              id="text-advance"
              className="field"
              value={text.advance}
              onChange={(e) => store.setText({ advance: Number(e.target.value) })}
            >
              {[5, 6].map((a) => (
                <option key={a} value={a}>
                  {tk('draw.textAdvance.value', { px: a })}
                </option>
              ))}
            </select>
          </div>
          <p id="text-hint" className="hint">
            {tk('draw.textHint')}
          </p>
        </fieldset>
      ) : null}

      <fieldset className="group">
        <legend>{tk('draw.transformGroup')}</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={transformAll}
            onChange={(e) => store.setTransformAll(e.target.checked)}
          />
          {tk('draw.allFrames')}
        </label>
        <div className="row">
          <button type="button" className="btn" onClick={() => store.invert()}>
            <PixelIcon name="invert" />
            {tk('draw.invert')}
          </button>
          <button type="button" className="btn" onClick={() => store.clear()}>
            <PixelIcon name="clear" />
            {tk('draw.clear')}
          </button>
          <button type="button" className="btn" onClick={() => store.flipH()}>
            <PixelIcon name="flipH" />
            {tk('draw.flipH')}
          </button>
          <button type="button" className="btn" onClick={() => store.flipV()}>
            <PixelIcon name="flipV" />
            {tk('draw.flipV')}
          </button>
        </div>
        <div className="row" role="group" aria-label={tk('draw.shift')}>
          <span>{tk('draw.shift')}</span>
          <button
            type="button"
            className="btn icon-only"
            onClick={() => store.shift(-1, 0)}
            aria-label={tk('draw.shiftLeft')}
          >
            <PixelIcon name="left" />
          </button>
          <button
            type="button"
            className="btn icon-only"
            onClick={() => store.shift(0, -1)}
            aria-label={tk('draw.shiftUp')}
          >
            <PixelIcon name="up" />
          </button>
          <button
            type="button"
            className="btn icon-only"
            onClick={() => store.shift(0, 1)}
            aria-label={tk('draw.shiftDown')}
          >
            <PixelIcon name="down" />
          </button>
          <button
            type="button"
            className="btn icon-only"
            onClick={() => store.shift(1, 0)}
            aria-label={tk('draw.shiftRight')}
          >
            <PixelIcon name="right" />
          </button>
          <label className="check">
            <input
              type="checkbox"
              checked={wrapShift}
              onChange={(e) => store.setWrapShift(e.target.checked)}
            />
            {tk('draw.wrap')}
          </label>
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>{tk('draw.selectionGroup')}</legend>
        <div className="row">
          <button type="button" className="btn" onClick={() => store.selectAll()}>
            {tk('draw.selectAll')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!selection}
            onClick={() => store.deselect()}
          >
            {tk('draw.deselect')}
          </button>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={!selection}
            onClick={() => store.copy() && toasts.push('info', 'toast.copied')}
          >
            {tk('draw.copy')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!selection}
            onClick={() => store.cut() && toasts.push('info', 'toast.cut')}
          >
            {tk('draw.cut')}
          </button>
          <button type="button" className="btn" disabled={!clipboard} onClick={() => store.paste()}>
            {tk('draw.paste')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!selection}
            onClick={() => store.deleteSelection()}
          >
            <PixelIcon name="delete" />
            {tk('draw.deleteSelection')}
          </button>
        </div>
      </fieldset>

      {profile.kind === 'character' ? <CgramInfo /> : null}
    </>
  );
}

function CgramInfo() {
  const { tk } = useI18n();
  const { store } = useServices();
  const { openDialog } = useCommands();
  const analysis = useCharAnalysis();
  const appearance = useEditor((s) => s.project.appearance);
  const brush = useEditor((s) => s.patternBrush);
  const tool = useEditor((s) => s.tool);
  const sharedEdit = useEditor((s) => s.sharedEdit);
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);
  const ids = useId();
  useEffect(() => {
    if (!analysis) return;
    const colors = resolveColors(appearance);
    refs.current.forEach((canvas, slot) => {
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;
      const glyph = analysis.glyphs[slot];
      ctx.fillStyle = colors.off;
      ctx.fillRect(0, 0, 5, 8);
      if (!glyph) return;
      ctx.fillStyle = colors.on;
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 5; x++) if (glyph[y]! & (0x10 >> x)) ctx.fillRect(x, y, 1, 1);
    });
  }, [analysis, appearance]);
  if (!analysis) return null;
  const total = analysis.glyphs.length;
  const uses = patternUses(analysis);
  const full = total >= CGRAM_SLOTS;
  const over = total > CGRAM_SLOTS;
  const brushKey = brush ? glyphKey(brush) : null;
  return (
    <fieldset className="group">
      <legend>{tk('draw.cgramGroup')}</legend>
      <p className={over ? 'error-text' : full ? 'warn-text' : 'ok-text'} data-testid="cgram-used">
        {tk('draw.cgramUsed', { used: total })}
      </p>
      <div className="cgram-slots" role="group" aria-label={tk('draw.cgramSlots')}>
        {Array.from({ length: CGRAM_SLOTS }, (_, slot) => {
          const glyph = analysis.glyphs[slot];
          const selected =
            glyph !== undefined && tool === 'pattern' && brushKey === glyphKey(glyph);
          return (
            <button
              key={slot}
              type="button"
              className="cgram-slot btn"
              data-testid="cgram-slot"
              disabled={!glyph}
              aria-pressed={selected}
              aria-label={
                glyph
                  ? tk('draw.cgramSlot', { slot, uses: uses[slot] ?? 0 })
                  : tk('draw.cgramSlotEmpty', { slot })
              }
              title={glyph ? tk('draw.cgramSlot.tip') : undefined}
              onClick={() => glyph && store.setPatternBrush(glyph)}
            >
              <canvas
                width={5}
                height={8}
                ref={(el) => {
                  refs.current[slot] = el;
                }}
                aria-hidden="true"
              />
              <span className="cgram-uses" aria-hidden="true">
                {glyph ? `×${uses[slot]}` : '—'}
              </span>
            </button>
          );
        })}
      </div>
      {full ? (
        <p className={over ? 'error-text' : 'warn-text'} id={`${ids}-full`}>
          {over ? tk('draw.cgramOver', { extra: total - CGRAM_SLOTS }) : tk('draw.cgramFull')}
        </p>
      ) : null}
      <fieldset className="group inner">
        <legend>{tk('draw.sharedEdit')}</legend>
        <label className="check">
          <input
            type="radio"
            name={`${ids}-shared`}
            checked={sharedEdit === 'copy'}
            onChange={() => store.setSharedEdit('copy')}
            data-testid="shared-copy"
          />
          {tk('draw.sharedEdit.copy')}
        </label>
        <label className="check">
          <input
            type="radio"
            name={`${ids}-shared`}
            checked={sharedEdit === 'global'}
            onChange={() => store.setSharedEdit('global')}
            data-testid="shared-global"
          />
          {tk('draw.sharedEdit.global')}
        </label>
        <p className="hint">{tk('draw.sharedEdit.hint')}</p>
      </fieldset>
      {over ? (
        <button
          type="button"
          className="btn"
          onClick={() => openDialog('cgramFit')}
          data-testid="cgram-fit-open"
        >
          {tk('draw.cgramFit')}
        </button>
      ) : null}
      <p className="hint">{tk('draw.cgramHint')}</p>
    </fieldset>
  );
}
