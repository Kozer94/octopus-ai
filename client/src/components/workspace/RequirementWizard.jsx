import { useMemo, useState } from 'react';
import {
  BUILD_MODES,
  PRODUCT_TYPES,
  UI_STYLES,
  buildRequirementPrompt,
  compileRequirementSpec,
  getFeatureSuggestions,
  getStackOptions,
} from '../../utils/specCompiler';

function OptionCard({ active, description, icon, label, onClick, t }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        minHeight: 58,
        padding: '12px 14px',
        background: active ? t.accent + '16' : t.sidebar,
        border: `0.5px solid ${active ? t.accent : t.border}`,
        borderRadius: 7,
        color: t.text,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <i className={`codicon ${icon || 'codicon-symbol-field'}`} style={{ color: active ? t.accent : t.textMuted, fontSize: 16, marginTop: 1 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{label}</span>
        {description && <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: t.textMuted, lineHeight: 1.4 }}>{description}</span>}
      </span>
    </button>
  );
}

function SpecTree({ spec, t }) {
  const stackEntries = Object.entries(spec.stack || {}).filter(([, value]) => value);

  return (
    <div style={{ border: `0.5px solid ${t.border}`, borderRadius: 7, background: t.bg, padding: 12 }}>
      <p style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.9px', marginBottom: 10 }}>Editable Spec Tree</p>
      <TreeLine label="Project" t={t} strong />
      <TreeLine label={spec.productLabel} t={t} depth={1} />
      <TreeLine label="Stack" t={t} depth={1} strong />
      {stackEntries.map(([key, value]) => <TreeLine key={key} label={`${key}: ${value}`} t={t} depth={2} />)}
      <TreeLine label="Modules" t={t} depth={1} strong />
      {spec.features.map(feature => <TreeLine key={feature} label={feature} t={t} depth={2} />)}
      <TreeLine label="Architecture" t={t} depth={1} strong />
      {spec.suggestedArchitecture.map(item => <TreeLine key={item} label={item} t={t} depth={2} />)}
    </div>
  );
}

function TreeLine({ depth = 0, label, strong = false, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', paddingLeft: depth * 16 }}>
      <span style={{ color: t.textMuted, fontSize: 11 }}>{depth ? '└' : '•'}</span>
      <span style={{ color: strong ? t.text : t.textMuted, fontSize: 12, fontWeight: strong ? 600 : 400 }}>{label}</span>
    </div>
  );
}

export function RequirementWizard({ onOpenChat, projectName, selectedModel, send, t }) {
  const [productType, setProductType] = useState('ai-agent-system');
  const [stack, setStack] = useState({});
  const [features, setFeatures] = useState(() => getFeatureSuggestions('ai-agent-system').slice(0, 4));
  const [architectureMode, setArchitectureMode] = useState('production-grade');
  const [uiStyle, setUiStyle] = useState('Dark Technical');
  const [constraints, setConstraints] = useState('');
  const [previewMode, setPreviewMode] = useState(false);

  const stackOptions = getStackOptions(productType);
  const featureSuggestions = getFeatureSuggestions(productType);
  const compiledSpec = useMemo(() => compileRequirementSpec({
    productType,
    stack,
    features,
    architectureMode,
    constraints,
    uiStyle,
  }), [architectureMode, constraints, features, productType, stack, uiStyle]);

  function selectProductType(nextType) {
    setProductType(nextType);
    setStack({});
    setFeatures(getFeatureSuggestions(nextType).slice(0, 4));
    setPreviewMode(false);
  }

  function toggleFeature(feature) {
    setFeatures(prev => prev.includes(feature) ? prev.filter(item => item !== feature) : [...prev, feature]);
    setPreviewMode(false);
  }

  function setStackChoice(group, value) {
    setStack(prev => ({ ...prev, [group]: value }));
    setPreviewMode(false);
  }

  function proceed(intent) {
    onOpenChat?.();
    send(buildRequirementPrompt(compiledSpec, intent), selectedModel);
  }

  return (
    <div style={{ height: '100%', minHeight: 0, overflowY: 'auto', background: t.bg }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '26px 28px 36px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <p style={{ fontSize: 10, color: t.accent, textTransform: 'uppercase', letterSpacing: '1.4px', marginBottom: 8 }}>Octopus Workspace Launcher</p>
            <h1 style={{ fontSize: 26, color: t.text, margin: 0, letterSpacing: 0 }}>Shape the product before execution</h1>
            <p style={{ fontSize: 12, color: t.textMuted, marginTop: 8, lineHeight: 1.6, maxWidth: 620 }}>
              Build a compiled spec first, then let Octopus plan, question, and execute from a clearer source of truth.
            </p>
          </div>
          <div style={{ minWidth: 170, border: `0.5px solid ${t.border}`, borderRadius: 7, padding: 10, background: t.sidebar }}>
            <p style={{ fontSize: 10, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Current Workspace</p>
            <p dir="auto" style={{ fontSize: 12, color: t.text, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName || 'Untitled Project'}</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 18, alignItems: 'start' }}>
          <main style={{ display: 'grid', gap: 18 }}>
            <section>
              <h2 style={{ fontSize: 14, color: t.text, marginBottom: 10 }}>What are we building?</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
                {PRODUCT_TYPES.map(type => (
                  <OptionCard
                    key={type.id}
                    active={productType === type.id}
                    icon={type.icon}
                    label={type.label}
                    onClick={() => selectProductType(type.id)}
                    t={t}
                  />
                ))}
              </div>
            </section>

            <section>
              <h2 style={{ fontSize: 14, color: t.text, marginBottom: 10 }}>Preferred Stack</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {Object.entries(stackOptions).map(([group, choices]) => (
                  <div key={group} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: t.textMuted, textTransform: 'capitalize' }}>{group}</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {choices.map(choice => (
                        <button
                          key={choice}
                          onClick={() => setStackChoice(group, choice)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: `0.5px solid ${stack[group] === choice ? t.accent : t.border}`,
                            background: stack[group] === choice ? t.accent + '16' : t.sidebar,
                            color: stack[group] === choice ? t.accent : t.text,
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 style={{ fontSize: 14, color: t.text, marginBottom: 10 }}>Intelligence Suggestions</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
                {featureSuggestions.map(feature => (
                  <button
                    key={feature}
                    onClick={() => toggleFeature(feature)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '9px 10px',
                      background: features.includes(feature) ? t.accent + '13' : t.sidebar,
                      border: `0.5px solid ${features.includes(feature) ? t.accent : t.border}`,
                      borderRadius: 6,
                      color: t.text,
                      cursor: 'pointer',
                      fontSize: 12,
                      textAlign: 'left',
                    }}
                  >
                    <i className={`codicon ${features.includes(feature) ? 'codicon-check' : 'codicon-add'}`} style={{ color: features.includes(feature) ? t.accent : t.textMuted }} />
                    {feature}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 style={{ fontSize: 14, color: t.text, marginBottom: 10 }}>Build Mode</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
                {BUILD_MODES.map(mode => (
                  <OptionCard
                    key={mode.id}
                    active={architectureMode === mode.id}
                    description={mode.description}
                    icon="codicon-type-hierarchy"
                    label={mode.label}
                    onClick={() => { setArchitectureMode(mode.id); setPreviewMode(false); }}
                    t={t}
                  />
                ))}
              </div>
            </section>
          </main>

          <aside style={{ display: 'grid', gap: 12, position: 'sticky', top: 16 }}>
            <div style={{ border: `0.5px solid ${t.border}`, borderRadius: 7, background: t.sidebar, padding: 12 }}>
              <p style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>UI Style</p>
              <select
                value={uiStyle}
                onChange={event => { setUiStyle(event.target.value); setPreviewMode(false); }}
                style={{ width: '100%', background: t.bg, color: t.text, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '7px 8px', fontSize: 12 }}
              >
                {UI_STYLES.map(style => <option key={style} value={style}>{style}</option>)}
              </select>
              <textarea
                value={constraints}
                onChange={event => { setConstraints(event.target.value); setPreviewMode(false); }}
                placeholder="Constraints, deadlines, must-use libraries..."
                rows={4}
                style={{ marginTop: 10, width: '100%', background: t.bg, color: t.text, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: 8, fontSize: 12, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <SpecTree spec={compiledSpec} t={t} />

            <div style={{ border: `0.5px solid ${t.border}`, borderRadius: 7, background: t.sidebar, padding: 12 }}>
              <p style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Spec Preview</p>
              {previewMode ? (
                <div style={{ display: 'grid', gap: 7, fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
                  <p><strong style={{ color: t.text }}>Octopus understood:</strong> Build a {compiledSpec.productLabel} using {compiledSpec.architectureLabel} standards.</p>
                  <p>Modules: {compiledSpec.features.join(', ') || 'none selected'}</p>
                  <p>Architecture: {compiledSpec.suggestedArchitecture.slice(0, 3).join(', ')}</p>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>Generate a preview before execution so Octopus can explain what it understood.</p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <button onClick={() => setPreviewMode(true)} style={actionStyle(t, false)}>Preview</button>
                <button onClick={() => proceed('Ask clarifying questions before planning this product.')} style={actionStyle(t, false)}>Ask Questions</button>
                <button onClick={() => setPreviewMode(false)} style={actionStyle(t, false)}>Edit Spec</button>
                <button onClick={() => proceed()} style={actionStyle(t, true)}>Proceed</button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function actionStyle(t, primary) {
  return {
    background: primary ? t.accent : t.bg,
    border: `0.5px solid ${primary ? t.accent : t.border}`,
    borderRadius: 6,
    color: primary ? '#fff' : t.text,
    cursor: 'pointer',
    fontSize: 12,
    padding: '8px 10px',
  };
}
