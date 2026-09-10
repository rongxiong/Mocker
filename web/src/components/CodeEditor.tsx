import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export type EditorLanguage = 'json' | 'javascript' | 'html' | 'text';

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: EditorLanguage;
  height?: string;
  readOnly?: boolean;
  placeholder?: string;
}

const CUSTOM_THEME = {
  '&': {
    backgroundColor: 'rgba(11,13,18,0.72)',
    color: '#E6E9F2',
    fontSize: '12.5px',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: '#4b5468',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'rgba(124,92,255,0.08)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#9AA3B2' },
  '.cm-selectionBackground, ::selection': { backgroundColor: 'rgba(124,92,255,0.28) !important' },
  '.cm-content': { caretColor: '#7C5CFF' },
};

export function CodeEditor({
  value,
  onChange,
  language = 'text',
  height = '360px',
  readOnly = false,
  placeholder,
}: CodeEditorProps) {
  const extensions = useMemo<Extension[]>(() => {
    switch (language) {
      case 'json':
        return [json()];
      case 'javascript':
        return [javascript()];
      case 'html':
        return [html()];
      default:
        return [];
    }
  }, [language]);

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] transition-shadow focus-within:border-brand-500/50 focus-within:shadow-glow">
      <CodeMirror
        value={value}
        height={height}
        theme={[oneDark, EditorView.theme(CUSTOM_THEME)]}
        extensions={extensions}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(next) => onChange?.(next)}
        basicSetup={{
          foldGutter: true,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          autocompletion: language !== 'text',
          bracketMatching: true,
          closeBrackets: language !== 'text',
          lineNumbers: true,
        }}
      />
    </div>
  );
}
