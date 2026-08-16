export const getTruncatedTitle = (name, maxLen = 24) => {
  if (!name) return "Select a Document";
  if (name.length <= maxLen) return name;
  const extIndex = name.lastIndexOf('.');
  if (extIndex !== -1 && name.length - extIndex <= 5) {
    const ext = name.slice(extIndex);
    const base = name.slice(0, extIndex);
    return base.slice(0, Math.max(1, maxLen - ext.length - 3)) + '...' + ext;
  }
  return name.slice(0, maxLen - 3) + '...';
};
