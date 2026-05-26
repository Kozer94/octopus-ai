export function registerMonacoThemes(monaco) {
  if (!monaco?.editor?.defineTheme) return;

  monaco.editor.defineTheme('octopus-solarized', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: '93a1a1', background: '002b36' },
      { token: 'comment', foreground: '586e75', fontStyle: 'italic' },
      { token: 'string', foreground: '2aa198' },
      { token: 'number', foreground: 'd33682' },
      { token: 'keyword', foreground: '859900' },
      { token: 'type', foreground: 'b58900' },
      { token: 'function', foreground: '268bd2' },
      { token: 'variable', foreground: '93a1a1' },
      { token: 'delimiter', foreground: '839496' },
    ],
    colors: {
      'editor.background': '#002b36',
      'editor.foreground': '#93a1a1',
      'editorLineNumber.foreground': '#586e75',
      'editorLineNumber.activeForeground': '#93a1a1',
      'editorCursor.foreground': '#2aa198',
      'editor.selectionBackground': '#073642',
      'editor.inactiveSelectionBackground': '#07364299',
      'editor.lineHighlightBackground': '#07364266',
      'editor.lineHighlightBorder': '#094857',
      'editorIndentGuide.background1': '#094857',
      'editorIndentGuide.activeBackground1': '#2aa19866',
      'editorGutter.background': '#002b36',
      'editorWidget.background': '#073642',
      'editorWidget.border': '#094857',
      'editorSuggestWidget.background': '#073642',
      'editorSuggestWidget.border': '#094857',
      'editorSuggestWidget.foreground': '#93a1a1',
      'editorSuggestWidget.selectedBackground': '#094857',
      'scrollbarSlider.background': '#09485799',
      'scrollbarSlider.hoverBackground': '#2aa19855',
      'scrollbarSlider.activeBackground': '#2aa19877',
      'minimap.background': '#002b36',
    },
  });
}
