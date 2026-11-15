"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
  compact?: boolean;
}

export function MarkdownContent({ content, compact = false }: MarkdownContentProps) {
  return (
    <div
      className={
        compact
          ? "markdown-content text-xs leading-relaxed text-slate-700 dark:text-slate-300"
          : "markdown-content text-xs leading-relaxed text-slate-800 dark:text-slate-200"
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-3 text-sm font-bold tracking-tight text-slate-900 first:mt-0 dark:text-white">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1.5 mt-2.5 text-[13px] font-bold tracking-tight text-slate-900 first:mt-0 dark:text-slate-100">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 text-xs font-bold text-slate-900 first:mt-0 dark:text-slate-100">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-2 leading-relaxed last:mb-0">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-950 dark:text-white">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-slate-700 dark:text-slate-300">{children}</em>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-indigo-300 bg-indigo-50/40 py-1 pl-3 italic text-slate-700 dark:border-indigo-500/70 dark:bg-indigo-950/35 dark:text-slate-300">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-2.5 border-slate-200 dark:border-slate-700" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800 dark:text-indigo-400 dark:decoration-indigo-500/50 dark:hover:text-indigo-300"
            >
              {children}
            </a>
          ),
          pre: ({ children }) => (
            <pre className="sleek-scroll my-2 overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100 last:mb-0">
              {children}
            </pre>
          ),
          code: ({ className, children }) => {
            const rawText = String(children ?? "");
            const isBlock = Boolean(className) || rawText.includes("\n");
            if (isBlock) {
              return <code className="font-mono text-[11px] text-slate-100">{children}</code>;
            }
            return (
              <code className="rounded bg-indigo-50/90 px-1.5 py-0.5 font-mono text-[11px] text-indigo-800 ring-1 ring-indigo-100 dark:bg-indigo-950/80 dark:text-indigo-300 dark:ring-indigo-800/60">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="sleek-scroll my-2 overflow-x-auto rounded-lg border border-slate-200 last:mb-0 dark:border-slate-700">
              <table className="w-full border-collapse text-left text-[11px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-100/80 text-slate-700 dark:bg-slate-800/90 dark:text-slate-200">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border-b border-slate-200 px-2.5 py-1.5 font-semibold dark:border-slate-700">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-slate-100 px-2.5 py-1.5 text-slate-700 dark:border-slate-800 dark:text-slate-300">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
