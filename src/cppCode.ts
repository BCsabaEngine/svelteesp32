export type cppCodeSource = {
	filename: string;
	content: Buffer;
	isGzip: boolean;
};

export const getCppCode = (source: cppCodeSource): string => {
	return source.filename;
};
