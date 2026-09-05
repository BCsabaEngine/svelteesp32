const isUseColor = !process.env['NO_COLOR'] && (!!process.env['FORCE_COLOR'] || !!process.stdout.isTTY);

export const greenLog = (s: string): string => (isUseColor ? `\u{1B}[32m${s}\u{1B}[0m` : s);

export const yellowLog = (s: string): string => (isUseColor ? `\u{1B}[33m${s}\u{1B}[0m` : s);

export const redLog = (s: string): string => (isUseColor ? `\u{1B}[31m${s}\u{1B}[0m` : s);

export const cyanLog = (s: string): string => (isUseColor ? `\u{1B}[36m${s}\u{1B}[0m` : s);
