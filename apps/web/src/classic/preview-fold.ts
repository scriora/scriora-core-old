export const foldLimit = 210;

export function foldPreview(text: string, limit = foldLimit) {
  if (text.length <= limit) {
    return { visible: text, overflow: "" };
  }
  return { visible: text.slice(0, limit), overflow: text.slice(limit) };
}
