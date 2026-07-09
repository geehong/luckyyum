const badWords = [
  '바보', '멍청이', '씨발', '개새끼', '지랄', '병신', '좆', '썅', '미친', '새끼'
];

export const isValidName = (name: string): boolean => {
  const normalized = name.replace(/\s/g, '').toLowerCase();
  for (const bad of badWords) {
    if (normalized.includes(bad)) {
      return false;
    }
  }
  return true;
};
