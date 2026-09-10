import { lazy, Suspense } from 'react';
import type { CodeEditorProps } from './CodeEditor';

// CodeMirror is the heaviest dependency of the console; keep it out of the entry chunk.
const CodeEditor = lazy(() =>
  import('./CodeEditor').then((module) => ({ default: module.CodeEditor })),
);

export function LazyCodeEditor(props: CodeEditorProps) {
  return (
    <Suspense
      fallback={
        <div
          className="skeleton rounded-xl border border-white/[0.08]"
          style={{ height: props.height ?? '360px' }}
        />
      }
    >
      <CodeEditor {...props} />
    </Suspense>
  );
}

export default LazyCodeEditor;
