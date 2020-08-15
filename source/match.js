export const match = text => pattern => {
  const RE = new RegExp(pattern);
  const matched = text.match(RE);
  return matched ? matched[0] : '';
};
