export type WriteResult =
	| { readonly _tag: "Written"; readonly path: string }
	| { readonly _tag: "Unchanged"; readonly path: string };

export const Written = (path: string): WriteResult => ({
	_tag: "Written",
	path,
});
export const Unchanged = (path: string): WriteResult => ({
	_tag: "Unchanged",
	path,
});
