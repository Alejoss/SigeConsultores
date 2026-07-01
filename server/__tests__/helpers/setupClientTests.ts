import "@testing-library/jest-dom/vitest";

if (typeof document !== "undefined" && !document.execCommand) {
  document.execCommand = () => true;
}
