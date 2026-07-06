export function main(): string {
  return process.env.API_URL ?? import.meta.env.VITE_API_URL ?? "ok";
}
