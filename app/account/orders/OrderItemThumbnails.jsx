import Image from "next/image";
import { getOrderThumbnailItems } from "@/lib/orders/itemThumbnails";

function ThumbnailFrame({ item }) {
  const className =
    "h-12 w-12 shrink-0 rounded-[10px] object-cover sm:h-14 sm:w-14";

  if (item.url) {
    return (
      <Image
        src={item.url}
        alt=""
        width={56}
        height={56}
        sizes="(min-width: 640px) 56px, 48px"
        loading="lazy"
        className={className}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="h-12 w-12 shrink-0 rounded-[10px] sm:h-14 sm:w-14"
      style={{
        background:
          "linear-gradient(135deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.02))",
        border: "1px solid rgba(15, 23, 42, 0.06)",
      }}
    />
  );
}

export default function OrderItemThumbnails({ order }) {
  const { items, overflowCount } = getOrderThumbnailItems(order);
  const hasOverflow = overflowCount > 0;
  const previewCount = items.length;

  let minWidthClass = "min-w-[3rem] sm:min-w-[3.5rem]";
  if (previewCount >= 3) {
    minWidthClass = hasOverflow
      ? "min-w-[14.75rem] sm:min-w-[16.5rem]"
      : "min-w-[9.75rem] sm:min-w-[11.25rem]";
  } else if (previewCount === 2) {
    minWidthClass = hasOverflow
      ? "min-w-[10.75rem] sm:min-w-[12.5rem]"
      : "min-w-[6.5rem] sm:min-w-[7.5rem]";
  } else if (previewCount === 1 && hasOverflow) {
    minWidthClass = "min-w-[8rem] sm:min-w-[9.5rem]";
  }

  return (
    <div
      className={`flex flex-none items-center gap-1.5 self-start ${minWidthClass}`}
      aria-label="Order item previews"
    >
      {items.map((item) => (
        <ThumbnailFrame key={item.key} item={item} />
      ))}
      {hasOverflow ? (
        <span
          className="inline-flex h-12 min-w-[4.25rem] shrink-0 items-center justify-center rounded-[10px] px-2 text-xs font-semibold sm:h-14 sm:min-w-[4.75rem]"
          style={{
            background: "rgba(15, 23, 42, 0.05)",
            border: "1px solid rgba(15, 23, 42, 0.08)",
            color: "var(--text)",
          }}
        >
          +{overflowCount} items
        </span>
      ) : null}
    </div>
  );
}
