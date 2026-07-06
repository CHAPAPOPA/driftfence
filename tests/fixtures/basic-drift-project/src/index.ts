export function main(): string {
  return process.env.DATABASE_URL ?? "ok";
}
