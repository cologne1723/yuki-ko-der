export function mapHeadingScroll(
  sourceScroll: number,
  sourceAnchors: readonly number[],
  targetAnchors: readonly number[],
): number {
  const count = Math.min(sourceAnchors.length, targetAnchors.length);
  if (count === 0) return 0;
  if (count === 1) return targetAnchors[0] ?? 0;

  const sourceStart = sourceAnchors[0] ?? 0;
  const sourceEnd = sourceAnchors[count - 1] ?? sourceStart;
  const clamped = Math.min(sourceEnd, Math.max(sourceStart, sourceScroll));
  let upper = 1;
  while (upper < count - 1 && sourceAnchors[upper] <= clamped) {
    upper += 1;
  }

  let lower = upper - 1;
  while (lower > 0 && sourceAnchors[upper] === sourceAnchors[lower]) {
    lower -= 1;
  }
  const sourceSpan = sourceAnchors[upper] - sourceAnchors[lower];
  if (sourceSpan <= 0) return targetAnchors[upper] ?? 0;

  const progress = (clamped - sourceAnchors[lower]) / sourceSpan;
  const targetStart = targetAnchors[lower] ?? 0;
  const targetEnd = targetAnchors[upper] ?? targetStart;
  return targetStart + progress * (targetEnd - targetStart);
}
