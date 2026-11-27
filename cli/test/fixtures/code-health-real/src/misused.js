export function check() {
  const pending = Promise.resolve(true);
  if (pending) return 1;
  return 0;
}
