"use client";

interface CategoryBadgeProps {
  category: string | null;
  urgency?: string | null;
}

const CATEGORY_STYLES: Record<string, { pill: string; dot: string }> = {
  important: {
    pill: "bg-rose-50/90 text-rose-700 border-rose-200/90 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/70",
    dot: "bg-rose-500",
  },
  "to-do": {
    pill: "bg-amber-50/90 text-amber-800 border-amber-200/90 dark:bg-amber-950/55 dark:text-amber-300 dark:border-amber-800/70",
    dot: "bg-amber-500",
  },
  todo: {
    pill: "bg-amber-50/90 text-amber-800 border-amber-200/90 dark:bg-amber-950/55 dark:text-amber-300 dark:border-amber-800/70",
    dot: "bg-amber-500",
  },
  newsletter: {
    pill: "bg-sky-50/90 text-sky-700 border-sky-200/90 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/70",
    dot: "bg-sky-500",
  },
  spam: {
    pill: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    dot: "bg-slate-400",
  },
  meeting: {
    pill: "bg-indigo-50/90 text-indigo-700 border-indigo-200/90 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/70",
    dot: "bg-indigo-500",
  },
  vip: {
    pill: "bg-purple-50/90 text-purple-700 border-purple-200/90 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/70",
    dot: "bg-purple-500",
  },
};

export function CategoryBadge({ category, urgency }: CategoryBadgeProps) {
  if (!category) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-slate-50/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
        Unprocessed
      </span>
    );
  }

  const key = category.toLowerCase();
  const style = CATEGORY_STYLES[key] ?? {
    pill: "bg-emerald-50/90 text-emerald-700 border-emerald-200/90 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70",
    dot: "bg-emerald-500",
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${style.pill}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
        {category}
      </span>
      {urgency === "high" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-600 to-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
          Urgent
        </span>
      )}
    </span>
  );
}
