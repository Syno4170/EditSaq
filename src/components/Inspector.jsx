import { useStore, useTime } from '../store';
import { ANIM_PROPS, EASINGS, TRANSITIONS, BLEND_MODES, FONTS, evalProp, kfAt, withLinked } from '../model';
import { seek } from '../playback';
import { Icon, IconButton, ScrubNumber, Slider, Toggle, Section } from './ui';

const TYPE_NAME = { video: 'Video clip', audio: 'Sound clip', image: 'Picture', text: 'Text', shape: 'Shape', solid: 'Color background' };

// One animatable property row: slider (simple mode) or number + keyframe controls (advanced mode).
function PropRow({ clip, k, advanced }) {
  const t = useTime((s) => s.t);
  const st = useStore.getState();
  const def = ANIM_PROPS[k];
  const prop = clip.props[k];
  const lt = t - clip.start;
  const value = evalProp(prop, lt);
  const animated = prop.kf.length > 0;
  const onKf = !!kfAt(prop, lt);
  const inClip = lt >= 0 && lt <= clip.duration;
  const set = (v, live) => st.setProp(clip.id, k, v, live);
  const sliderRange = {
    x: [-1920, 1920], y: [-1080, 1080], scale: [0, 400], rotation: [-360, 360],
  }[k] || [def.min, def.max];
  const go = (dir) => {
    const times = prop.kf.map((x) => x.t).filter((x) => (dir < 0 ? x < lt - 1e-3 : x > lt + 1e-3));
    if (!times.length) return;
    seek(clip.start + (dir < 0 ? Math.max(...times) : Math.min(...times)));
  };
  return (
    <div className={`prop-row ${animated ? 'animated' : ''}`}>
      {advanced && (
        <button className={`stopwatch ${animated ? 'on' : ''}`} title={animated ? 'Stop animating this (removes keyframes)' : 'Animate this: changes over time will be remembered'} onClick={() => st.toggleAnimate(clip.id, k)}>
          <Icon name="stopwatch" size={14} />
        </button>
      )}
      <label>{def.label}</label>
      {!advanced && <Slider value={value} min={sliderRange[0]} max={sliderRange[1]} step={def.step} onBegin={st.beginGesture} onEnd={st.endGesture} onChange={(v) => set(v, true)} />}
      <ScrubNumber value={value} step={def.step} min={def.min} max={def.max} unit={def.unit} onBegin={st.beginGesture} onEnd={st.endGesture} onChange={(v, live) => set(v, live)} />
      {advanced && animated && (
        <span className="kf-nav">
          <button title="Previous keyframe" onClick={() => go(-1)}><Icon name="prev" size={12} /></button>
          <button className={onKf ? 'on' : ''} disabled={!inClip} title={onKf ? 'Remove keyframe here' : 'Add keyframe here'} onClick={() => st.toggleKeyframe(clip.id, k, value)}>
            <Icon name={onKf ? 'diamond' : 'diamondO'} size={12} />
          </button>
          <button title="Next keyframe" onClick={() => go(1)}><Icon name="next" size={12} /></button>
        </span>
      )}
      {advanced && onKf && (
        <select className="ease-select" value={kfAt(prop, lt).ease} onChange={(e) => st.setKeyframeEase(clip.id, k, e.target.value)} title="How the motion moves towards the next keyframe">
          {EASINGS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      )}
    </div>
  );
}

function Row({ label, children, hint }) {
  return <div className="row" title={hint}><label>{label}</label><div className="row-ctl">{children}</div></div>;
}

function TransitionPicker({ value, onChange, label }) {
  return (
    <Row label={label}>
      <select value={value?.type || ''} onChange={(e) => onChange(e.target.value ? { type: e.target.value, dur: value?.dur || 0.6 } : null)}>
        <option value="">None</option>
        {TRANSITIONS.map((tr) => <option key={tr.id} value={tr.id}>{tr.label}</option>)}
      </select>
      {value && <ScrubNumber value={value.dur} step={0.05} min={0.05} max={10} unit="s" width={70} onChange={(v) => onChange({ ...value, dur: v })} />}
    </Row>
  );
}

export default function Inspector() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => s.mode);
  const st = useStore.getState();
  const advanced = mode === 'advanced';

  if (!selection.length) {
    return (
      <div className="inspector empty">
        <div className="panel-title">Properties</div>
        <div className="inspector-help">
          <Icon name="cursor" size={28} />
          <h4>Click a clip to change it</h4>
          <p>Select something on the timeline or in the preview, and its settings (size, position, color, sound, text…) show up here.</p>
          <ul>
            <li><b>Move</b> a clip: drag it on the timeline</li>
            <li><b>Shorten</b> a clip: drag its left or right edge</li>
            <li><b>Cut</b> a clip in two: put the red line on it and press <kbd>S</kbd></li>
            <li><b>Move or resize</b> on screen: drag it in the preview</li>
          </ul>
        </div>
      </div>
    );
  }

  // Prefer the visual clip when a video and its linked sound are both selected.
  const linked = [...withLinked(project, selection)];
  const all = project.clips.filter((c) => linked.includes(c.id));
  const clip = project.clips.find((c) => c.id === selection[0]);
  if (!clip) return null;
  const visual = clip.type === 'audio' ? all.find((c) => c.type !== 'audio' && c.linkId && c.linkId === clip.linkId) || null : clip;
  const audio = clip.type === 'audio' ? clip : all.find((c) => c.type === 'audio' && c.linkId && c.linkId === clip.linkId) || null;
  const up = (id, fn) => st.updateClip(id, fn);
  const isMedia = clip.type === 'video' || clip.type === 'audio';

  return (
    <div className="inspector">
      <div className="panel-title">
        <span>{TYPE_NAME[clip.type]}</span>
        {selection.length > 1 && <em>{selection.length} selected</em>}
      </div>
      <div className="inspector-scroll">
        <Section title="Timing" icon="speed">
          <Row label="Starts at"><ScrubNumber value={clip.start} step={0.04} min={0} unit="s" width={84} onChange={(v) => st.updateClips([...withLinked(project, [clip.id])], (c) => { c.start = v; })} /></Row>
          <Row label="Length">
            <ScrubNumber value={clip.duration} step={0.04} min={0.05} unit="s" width={84} onChange={(v) => {
              st.updateClips([...withLinked(project, [clip.id])], (c, p) => {
                const m = p.media.find((x) => x.id === c.mediaId);
                const max = m && (c.type === 'video' || c.type === 'audio') && m.duration ? (m.duration - c.in) / c.speed : Infinity;
                c.duration = Math.min(v, max);
              });
            }} />
          </Row>
          {isMedia && (
            <Row label="Speed" hint="Slow motion or fast forward">
              <select value={clip.speed} onChange={(e) => st.setSpeed([clip.id], parseFloat(e.target.value))}>
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((s) => <option key={s} value={s}>{s === 1 ? 'Normal (1x)' : s < 1 ? `${s}x (slow motion)` : `${s}x (faster)`}</option>)}
              </select>
            </Row>
          )}
        </Section>

        {clip.type === 'text' && (
          <Section title="Text" icon="text">
            <textarea className="text-input" value={clip.text.content} rows={3} onChange={(e) => up(clip.id, (c) => { c.text.content = e.target.value; })} placeholder="Type your text" />
            <Row label="Font">
              <select value={clip.text.font} onChange={(e) => up(clip.id, (c) => { c.text.font = e.target.value; })}>
                {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
              </select>
            </Row>
            <Row label="Text size"><Slider value={clip.text.size} min={10} max={400} onBegin={st.beginGesture} onEnd={st.endGesture} onChange={(v) => st.gesture((p) => { p.clips.find((c) => c.id === clip.id).text.size = v; })} /><ScrubNumber value={clip.text.size} min={4} max={1000} onChange={(v) => up(clip.id, (c) => { c.text.size = v; })} /></Row>
            <Row label="Color"><input type="color" value={clip.text.color} onChange={(e) => up(clip.id, (c) => { c.text.color = e.target.value; })} /></Row>
            <Row label="Style">
              <div className="seg">
                <button className={clip.text.bold ? 'on' : ''} onClick={() => up(clip.id, (c) => { c.text.bold = !c.text.bold; })}><b>B</b></button>
                <button className={clip.text.italic ? 'on' : ''} onClick={() => up(clip.id, (c) => { c.text.italic = !c.text.italic; })}><i>I</i></button>
                {['left', 'center', 'right'].map((a) => <button key={a} className={clip.text.align === a ? 'on' : ''} onClick={() => up(clip.id, (c) => { c.text.align = a; })}>{a[0].toUpperCase() + a.slice(1)}</button>)}
              </div>
            </Row>
            <Row label="Outline">
              <input type="color" value={clip.text.stroke} onChange={(e) => up(clip.id, (c) => { c.text.stroke = e.target.value; })} />
              <ScrubNumber value={clip.text.strokeWidth} min={0} max={50} unit="px" onChange={(v) => up(clip.id, (c) => { c.text.strokeWidth = v; })} />
            </Row>
            <Row label="Shadow"><Toggle checked={clip.text.shadow} onChange={(v) => up(clip.id, (c) => { c.text.shadow = v; })} /></Row>
            <Row label="Background box">
              <Toggle checked={!!clip.text.bg} onChange={(v) => up(clip.id, (c) => { c.text.bg = v ? '#000000b3' : ''; })} />
              {clip.text.bg && <input type="color" value={clip.text.bg.slice(0, 7)} onChange={(e) => up(clip.id, (c) => { c.text.bg = e.target.value + 'b3'; })} />}
            </Row>
            <Row label="Animation">
              <select value={clip.text.anim} onChange={(e) => up(clip.id, (c) => { c.text.anim = e.target.value; })}>
                <option value="none">None</option>
                <option value="typewriter">Typewriter (letters appear one by one)</option>
              </select>
            </Row>
          </Section>
        )}

        {clip.type === 'shape' && (
          <Section title="Shape" icon="shapes">
            <Row label="Kind">
              <div className="seg">
                {[['rect', 'Box'], ['ellipse', 'Circle']].map(([k, l]) => <button key={k} className={clip.shape.kind === k ? 'on' : ''} onClick={() => up(clip.id, (c) => { c.shape.kind = k; })}>{l}</button>)}
              </div>
            </Row>
            <Row label="Width"><ScrubNumber value={clip.shape.w} min={1} max={8000} unit="px" width={80} onChange={(v) => up(clip.id, (c) => { c.shape.w = v; })} /></Row>
            <Row label="Height"><ScrubNumber value={clip.shape.h} min={1} max={8000} unit="px" width={80} onChange={(v) => up(clip.id, (c) => { c.shape.h = v; })} /></Row>
            <Row label="Fill color"><input type="color" value={clip.shape.fill} onChange={(e) => up(clip.id, (c) => { c.shape.fill = e.target.value; })} /></Row>
            {clip.shape.kind === 'rect' && <Row label="Round corners"><ScrubNumber value={clip.shape.radius} min={0} max={2000} unit="px" onChange={(v) => up(clip.id, (c) => { c.shape.radius = v; })} /></Row>}
            <Row label="Border">
              <input type="color" value={clip.shape.stroke} onChange={(e) => up(clip.id, (c) => { c.shape.stroke = e.target.value; })} />
              <ScrubNumber value={clip.shape.strokeWidth} min={0} max={200} unit="px" onChange={(v) => up(clip.id, (c) => { c.shape.strokeWidth = v; })} />
            </Row>
          </Section>
        )}

        {clip.type === 'solid' && (
          <Section title="Color" icon="image">
            <Row label="Color"><input type="color" value={clip.color} onChange={(e) => up(clip.id, (c) => { c.color = e.target.value; })} /></Row>
          </Section>
        )}

        {visual && (
          <Section title="Position & size" icon="shapes" right={advanced ? <span className="hint">◷ = animate</span> : null}>
            {['x', 'y', 'scale', 'rotation', 'opacity'].map((k) => <PropRow key={k} clip={visual} k={k} advanced={advanced} />)}
            <Row label="Mirror">
              <div className="seg">
                <button className={visual.fx.flipH ? 'on' : ''} onClick={() => up(visual.id, (c) => { c.fx.flipH = !c.fx.flipH; })}>Left ↔ Right</button>
                <button className={visual.fx.flipV ? 'on' : ''} onClick={() => up(visual.id, (c) => { c.fx.flipV = !c.fx.flipV; })}>Upside down</button>
              </div>
            </Row>
            {advanced && (
              <Row label="Blend mode" hint="How this layer mixes with the layers below">
                <select value={visual.blend} onChange={(e) => up(visual.id, (c) => { c.blend = e.target.value; })}>
                  {BLEND_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Row>
            )}
            <button className="text-btn small" onClick={() => up(visual.id, (c) => { for (const k of ['x', 'y', 'scale', 'rotation', 'opacity']) c.props[k] = { v: ANIM_PROPS[k].def, kf: [] }; c.fx.flipH = false; c.fx.flipV = false; })}>
              <Icon name="reset" size={13} /> Reset position & size
            </button>
          </Section>
        )}

        {visual && (
          <Section title="Color & look" icon="sparkles" defaultOpen={clip.type === 'video' || clip.type === 'image'}>
            {['brightness', 'contrast', 'saturation', 'hue', 'blur'].map((k) => <PropRow key={k} clip={visual} k={k} advanced={advanced} />)}
            {[['grayscale', 'Black & white'], ['sepia', 'Old photo'], ['invert', 'Negative'], ['vignette', 'Dark edges']].map(([k, l]) => (
              <div className="prop-row" key={k}>
                {advanced && <span className="stopwatch-spacer" />}
                <label>{l}</label>
                <Slider value={visual.fx[k]} min={0} max={100} onBegin={st.beginGesture} onEnd={st.endGesture} onChange={(v) => st.gesture((p) => { p.clips.find((c) => c.id === visual.id).fx[k] = v; })} />
                <ScrubNumber value={visual.fx[k]} min={0} max={100} unit="%" onChange={(v) => up(visual.id, (c) => { c.fx[k] = v; })} />
              </div>
            ))}
            <button className="text-btn small" onClick={() => up(visual.id, (c) => { for (const k of ['brightness', 'contrast', 'saturation', 'hue', 'blur']) c.props[k] = { v: ANIM_PROPS[k].def, kf: [] }; Object.assign(c.fx, { grayscale: 0, sepia: 0, invert: 0, vignette: 0 }); })}>
              <Icon name="reset" size={13} /> Reset colors
            </button>
          </Section>
        )}

        {visual && (visual.type === 'video' || visual.type === 'image') && (
          <Section title="Green screen" icon="wand" defaultOpen={visual.fx.chroma.on}>
            <Row label="Remove a color" hint="Makes one color see-through, e.g. a green screen behind a person">
              <Toggle checked={visual.fx.chroma.on} onChange={(v) => up(visual.id, (c) => { c.fx.chroma.on = v; })} />
            </Row>
            {visual.fx.chroma.on && <>
              <Row label="Color to remove"><input type="color" value={visual.fx.chroma.color} onChange={(e) => up(visual.id, (c) => { c.fx.chroma.color = e.target.value; })} /></Row>
              <Row label="Strength"><Slider value={visual.fx.chroma.tol} min={0} max={100} onBegin={st.beginGesture} onEnd={st.endGesture} onChange={(v) => st.gesture((p) => { p.clips.find((c) => c.id === visual.id).fx.chroma.tol = v; })} /></Row>
              <Row label="Soft edges"><Slider value={visual.fx.chroma.soft} min={0} max={100} onBegin={st.beginGesture} onEnd={st.endGesture} onChange={(v) => st.gesture((p) => { p.clips.find((c) => c.id === visual.id).fx.chroma.soft = v; })} /></Row>
            </>}
          </Section>
        )}

        {visual && (
          <Section title="Transitions" icon="transition" defaultOpen={!!(visual.transIn || visual.transOut)}>
            <TransitionPicker label="At the start" value={visual.transIn} onChange={(v) => up(visual.id, (c) => { c.transIn = v; })} />
            <TransitionPicker label="At the end" value={visual.transOut} onChange={(v) => up(visual.id, (c) => { c.transOut = v; })} />
          </Section>
        )}

        {audio && (
          <Section title="Sound" icon="volume">
            <Row label="Volume">
              <Slider value={audio.volume} min={0} max={300} onBegin={st.beginGesture} onEnd={st.endGesture} onChange={(v) => st.gesture((p) => { p.clips.find((c) => c.id === audio.id).volume = v; })} />
              <ScrubNumber value={audio.volume} min={0} max={400} unit="%" onChange={(v) => up(audio.id, (c) => { c.volume = v; })} />
            </Row>
            <Row label="Fade in"><ScrubNumber value={audio.audioFadeIn} min={0} max={30} step={0.1} unit="s" width={70} onChange={(v) => up(audio.id, (c) => { c.audioFadeIn = Math.min(v, c.duration); })} /></Row>
            <Row label="Fade out"><ScrubNumber value={audio.audioFadeOut} min={0} max={30} step={0.1} unit="s" width={70} onChange={(v) => up(audio.id, (c) => { c.audioFadeOut = Math.min(v, c.duration); })} /></Row>
            <Row label="Mute"><Toggle checked={audio.volume === 0} onChange={(v) => up(audio.id, (c) => { c.volume = v ? 0 : 100; })} /></Row>
          </Section>
        )}
      </div>
    </div>
  );
}
