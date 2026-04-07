function flatten(inputs, acc) {
  inputs.forEach((input) => {
    if (!input) return;
    if (Array.isArray(input)) {
      flatten(input, acc);
      return;
    }
    if (typeof input === "string") {
      if (input) acc.push(input);
      return;
    }
    if (typeof input === "object") {
      Object.entries(input).forEach(([key, value]) => {
        if (value) acc.push(key);
      });
    }
  });
}

export function cx(...inputs) {
  const classes = [];
  flatten(inputs, classes);
  return classes.join(" ");
}

export const cn = cx;
