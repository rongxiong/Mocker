import { useCallback, useEffect, useMemo, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { EditorView, keymap } from '@codemirror/view';
import { Prec, type Extension } from '@codemirror/state';
import { Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from './ui/toast';

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
  const canFormat = language === 'json' && !readOnly && Boolean(onChange);

  const format = useCallback(() => {
    if (!onChange) return false;
    try {
      onChange(JSON.stringify(JSON.parse(value), null, 2));
      return true;
    } catch (error) {
      toast(`无法格式化：${error instanceof Error ? error.message : 'JSON 不合法'}`, 'error');
      return false;
    }
  }, [onChange, value]);

  // the keymap extension is built once, so it reads the handler through a ref
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  const extensions = useMemo<Extension[]>(() => {
    const list: Extension[] =
      language === 'json'
        ? [json()]
        : language === 'javascript'
          ? [javascript()]
          : language === 'html'
            ? [html()]
            : [];
    if (canFormat) {
      list.push(
        Prec.highest(
          keymap.of([
            {
              key: 'Shift-Alt-f',
              preventDefault: true,
              run: () => {
                formatRef.current();
                return true;
              },
            },
          ]),
        ),
      );
    }
    return list;
  }, [language, canFormat]);

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] transition-shadow focus-within:border-brand-500/50 focus-within:shadow-glow">
      {canFormat ? (
        <div className="flex items-center justify-end border-b border-white/[0.06] bg-white/[0.02] px-2 py-1">
          <button
            type="button"
            onClick={format}
            title="格式化 JSON（Shift+Alt+F / ⇧⌥F）"
            className={cn(
              'flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]',
              'text-muted-300 transition-colors hover:bg-white/[0.06] hover:text-brand-300',
            )}
          >
            <Wand2 size={11} />
            格式化
            <kbd className="ml-0.5 rounded border border-white/10 px-1 font-sans text-[10px] text-muted-300">
              ⇧⌥F
            </kbd>
          </button>
        </div>
      ) : null}
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
