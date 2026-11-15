"use client";

interface CategoryBadgeProps {
  category: string | null;
  urgency?: string | null;
}

const CATEGORY_STYLES: Record<string, string> = {
  important: "bg-rose-50 text-rose-700 border-rose-200",
  "to-do": "bg-amber-50 text-amber-800 border-amber-200",
  todo: "bg-amber-50 text-amber-800 border-amber-200",
  newsletter: "bg-sky-50 text-sky-700 border-sky-200",
  spam: "bg-slate-100 text-slate-600 border-slate-300",
  meeting: "bg-indigo-50 text-indigo-700 border-indigo-200",
  vip: "bg-purple-50 text-purple-700 border-purple-200",
};

export function CategoryBadge({ category, urgency }: CategoryBadgeProps) {
  if (!category) {
    return (
      <span className="inline-flex items-center rounded-full border border-dashed border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        Unprocessed
      </span>
    );
  }

  const key = category.toLowerCase();
  const style =
    CATEGORY_STYLES[key] ?? "bg-emerald-50 text-emerald-700 border-emerald-200";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style}`}
      >
        {category}
      </span>
      {urgency === "high" && (
        <span className="inline-flex items-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Urgent
        </span>
      )}
    </span>
  );
}
