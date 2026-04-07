export function buildOrderNumber() {
  const fragment = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `YB-${fragment}`;
}
