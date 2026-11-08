import React, { useMemo } from 'react';
import { marked } from 'marked';
import { MonacoCodeBlock } from './MonacoCodeBlock';

interface MarkdownMessageProps {
  content: string;
  isStreaming?: boolean;
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content, isStreaming }) => {
  // Configure marked for GFM and line breaks
  marked.setOptions({
    gfm: true,
    breaks: true
  });

  const parsedElements = useMemo(() => {
    if (!content) return [];

    try {
      // Use marked lexer to tokenize markdown into blocks
      const tokens = marked.lexer(content);
      const elements: React.ReactNode[] = [];

      let markdownAccumulator = '';
      let keyCounter = 0;

      const flushMarkdown = () => {
        if (markdownAccumulator.trim()) {
          const rawHtml = marked.parse(markdownAccumulator) as string;
          elements.push(
            <div
              key={`md-${keyCounter++}`}
              className="prose-content select-text leading-relaxed text-xs space-y-2 min-w-0 max-w-full overflow-hidden break-words"
              dangerouslySetInnerHTML={{ __html: rawHtml }}
            />
          );
          markdownAccumulator = '';
        }
      };

      for (const token of tokens) {
        if (token.type === 'code') {
          flushMarkdown();
          elements.push(
            <MonacoCodeBlock
              key={`code-${keyCounter++}`}
              code={token.text.trimEnd()}
              language={token.lang || 'plaintext'}
            />
          );
        } else {
          // Accumulate raw markdown text for marked parser
          markdownAccumulator += token.raw;
        }
      }

      flushMarkdown();
      return elements;
    } catch (err) {
      console.warn('[DevPulse] Markdown parsing error, falling back to plain text:', err);
      return [
        <div key="fallback" className="whitespace-pre-wrap font-sans text-xs select-text">
          {content}
        </div>
      ];
    }
  }, [content]);

  return (
    <div className="markdown-container space-y-1 select-text w-full max-w-full min-w-0 overflow-hidden break-words">
      {parsedElements}
      {isStreaming && (
        <span className="inline-block w-1.5 h-3.5 ml-1 bg-current animate-pulse align-middle" />
      )}
    </div>
  );
};
