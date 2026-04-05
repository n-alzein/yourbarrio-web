"use client";

type CategoryOption = {
  key: string;
  label: string;
};

type CategoryPillsProps = {
  categories: CategoryOption[];
  activeCategory: string;
  onSelect: (category: string) => void;
};

export default function CategoryPills({
  categories,
  activeCategory,
  onSelect,
}: CategoryPillsProps) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex min-w-max items-center gap-2 pb-1">
        {categories.map((category) => {
          const isActive = activeCategory === category.key;
          return (
            <button
              key={category.key}
              type="button"
              onClick={() => onSelect(category.key)}
              className={[
                "inline-flex h-10 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cff]/35 focus-visible:ring-offset-2",
                isActive
                  ? "border border-[#7c5cff1f] bg-[#f5f0ff] text-[#4b2aad] shadow-[0_10px_30px_-24px_rgba(76,29,149,0.55)]"
                  : "border border-black/5 bg-white/88 text-slate-600 shadow-[0_10px_30px_-28px_rgba(15,23,42,0.28)] hover:border-[#7c5cff24] hover:bg-[#faf7ff] hover:text-slate-900",
              ].join(" ")}
              aria-pressed={isActive}
            >
              {category.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
