import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Whole numbers render bare, no thousands separators (per the house style). */
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, useGrouping: false });
export function num(n: number): string {
  return nf.format(n);
}
