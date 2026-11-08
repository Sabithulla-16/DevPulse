import React, { useState, useMemo } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import { Check, Copy, FileCode, Terminal } from 'lucide-react';

interface MonacoCodeBlockProps {
  code: string;
  language: string;
}

export const MonacoCodeBlock: React.FC<MonacoCodeBlockProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  const normalizedLang = (language || 'text').toLowerCase().trim();

  const langMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'jsx',
    tsx: 'tsx',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    html: 'markup',
    xml: 'markup',
    svg: 'markup',
    md: 'markup',
    cs: 'csharp',
    'c++': 'cpp'
  };

  const resolvedLang = langMap[normalizedLang] || normalizedLang;

  // Normalize newlines and strictly strip leading & trailing blank lines so code ends precisely at the last line
  const cleanCode = useMemo(() => {
    return (code || '')
      .replace(/\r\n/g, '\n')
      .replace(/^\n+/, '')
      .trimEnd();
  }, [code]);

  const lines = useMemo(() => {
    if (!cleanCode) return [''];
    return cleanCode.split('\n');
  }, [cleanCode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlightedHtml = useMemo(() => {
    try {
      const grammar = Prism.languages[resolvedLang] || Prism.languages.clike || Prism.languages.text;
      if (grammar) {
        return Prism.highlight(cleanCode, grammar, resolvedLang);
      }
    } catch {
      // Fallback if grammar error
    }
    return cleanCode
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }, [cleanCode, resolvedLang]);

  return (
    <div className="monaco-code-container my-3 rounded-lg overflow-hidden border border-black/15 dark:border-white/10 shadow-md w-full max-w-full min-w-0">
      {/* VS Code Monaco Titlebar */}
      <div className="monaco-titlebar flex items-center justify-between px-3.5 py-1.5 border-b text-xs font-mono select-none">
        <div className="flex items-center gap-2">
          {resolvedLang === 'bash' ? (
            <Terminal size={13} className="text-emerald-400" />
          ) : (
            <FileCode size={13} className="text-sky-400" />
          )}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
            {resolvedLang}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="monaco-copy-btn flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded transition cursor-pointer"
          title="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Editor Body with line numbers */}
      <div className="monaco-body p-3 overflow-x-auto text-xs font-mono leading-5 custom-scrollbar max-h-[520px] flex min-w-0 w-full">
        {/* Line Numbers */}
        <div className="monaco-line-numbers select-none pr-3 text-right text-zinc-600 font-mono shrink-0 leading-5">
          {lines.map((_, idx) => (
            <div key={idx} className="h-5 leading-5">{idx + 1}</div>
          ))}
        </div>

        {/* Highlighted Code */}
        <pre className="m-0 p-0 font-mono overflow-x-auto flex-1 min-w-0 leading-5">
          <code
            className={`language-${resolvedLang} font-mono block whitespace-pre leading-5`}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </pre>
      </div>
    </div>
  );
};
