export const addNumberPadding = (number: number, maxLength: number): string => {
  return number.toString().padStart(maxLength.toString().length, '0');
};
