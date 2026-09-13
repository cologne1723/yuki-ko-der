const LOCAL_IMAGE = /^\.\.\/images\/([1-9]\d*)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/u;
export function parseLocalProblemImageReference(value: string) {
  const match = LOCAL_IMAGE.exec(value.trim());
  if (!match) return undefined;
  const problemNo = Number(match[1]);
  const filename = match[2];
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (
    ![".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(extension) ||
    !Number.isSafeInteger(problemNo)
  )
    return undefined;
  return { problemNo, filename };
}
export function isLocalProblemImageReference(
  value: string,
  problemNo?: number,
) {
  const parsed = parseLocalProblemImageReference(value);
  return (
    !!parsed && (problemNo === undefined || parsed.problemNo === problemNo)
  );
}
