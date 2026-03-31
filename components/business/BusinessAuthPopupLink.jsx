export default function BusinessAuthPopupLink({ href, className, children, style }) {
  const targetUrl = href?.includes("?") ? `${href}&popup=1` : `${href}?popup=1`;
  const classes = ["touch-manipulation", className].filter(Boolean).join(" ");

  return (
    <a
      href={targetUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-no-safe-nav="1"
      className={classes}
      style={style}
    >
      {children}
    </a>
  );
}
