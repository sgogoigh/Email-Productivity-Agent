"use client";

interface CategoryBadgeProps {
  category: string | null;
  urgency?: string | null;
}

const CATEGORY_STYLES: Record<string, { pill: string; dot: string }> = {
  important: {
    pill: "bg-rose-50/90 text-rose-700 border-rose-200/90",
    dot: "bg-rose-500",
  },
  "to-do": {
    pill: "bg-amber-50/90 text-amber-800 border-amber-200/90",
    dot: "bg-amber-500",
  },
  todo: {
    pill: "bg-amber-50/90 text-amber-800 border-amber-200/90",
    dot: "bg-amber-500",
  },
  newsletter: {
    pill: "bg-sky-50/90 text-sky-700 border-sky-200/90",
    dot: "bg-sky-500",
  },
  spam: {
    pill: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  meeting: {
    pill: "bg-indigo-50/90 text-indigo-700 border-indigo-200/90",
    dot: "bg-indigo-500",
  },
  vip: {
    pill: "bg-purple-50/90 text-purple-700 border-purple-200/90",
    dot: "bg-purple-500",
  },
};

export function CategoryBadge({ category, urgency }: CategoryBadgeProps) {
  if (!category) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-slate-50/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        Unprocessed
      </span>
    );
  }

  const key = category.toLowerCase();
  const style = CATEGORY_STYLES[key] ?? {
    pill: "bg-emerald-50/90 text-emerald-700 border-emerald-200/90",
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
