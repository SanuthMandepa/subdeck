export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export const uid = (): string => Math.random().toString(36).slice(2);

/** Resolve on the next macrotask, so a tight encode loop can breathe. */
export const idle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export function download(name: string, data: Blob | string, type?: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

export const megabytes = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MB`;
