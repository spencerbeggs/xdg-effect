import { Option } from "effect";
import { describe, expect, it } from "vitest";
import { nativeDirs } from "../src/services/NativeDirs.js";

describe("nativeDirs", () => {
	it("maps macOS (darwin) dirs to Application Support and Caches", () => {
		const result = nativeDirs({ platform: "darwin", home: "/Users/me", namespace: "my-tool" });
		expect(Option.isSome(result)).toBe(true);
		const dirs = Option.getOrThrow(result);
		expect(dirs.config).toBe("/Users/me/Library/Application Support/my-tool");
		expect(dirs.data).toBe("/Users/me/Library/Application Support/my-tool");
		expect(dirs.state).toBe("/Users/me/Library/Application Support/my-tool");
		expect(dirs.cache).toBe("/Users/me/Library/Caches/my-tool");
	});

	it("maps Windows (win32) dirs using APPDATA/LOCALAPPDATA", () => {
		const result = nativeDirs({
			platform: "win32",
			home: "C:\\Users\\me",
			appData: "C:\\Users\\me\\AppData\\Roaming",
			localAppData: "C:\\Users\\me\\AppData\\Local",
			namespace: "my-tool",
		});
		const dirs = Option.getOrThrow(result);
		expect(dirs.config).toBe("C:\\Users\\me\\AppData\\Roaming/my-tool");
		expect(dirs.data).toBe("C:\\Users\\me\\AppData\\Roaming/my-tool");
		expect(dirs.cache).toBe("C:\\Users\\me\\AppData\\Local/my-tool/Cache");
		expect(dirs.state).toBe("C:\\Users\\me\\AppData\\Local/my-tool");
	});

	it("falls back to ~/AppData paths on win32 when env vars are absent", () => {
		const result = nativeDirs({ platform: "win32", home: "C:\\Users\\me", namespace: "my-tool" });
		const dirs = Option.getOrThrow(result);
		expect(dirs.config).toBe("C:\\Users\\me/AppData/Roaming/my-tool");
		expect(dirs.cache).toBe("C:\\Users\\me/AppData/Local/my-tool/Cache");
		expect(dirs.data).toBe("C:\\Users\\me/AppData/Roaming/my-tool");
		expect(dirs.state).toBe("C:\\Users\\me/AppData/Local/my-tool");
	});

	it("returns None on linux (native == XDG)", () => {
		const result = nativeDirs({ platform: "linux", home: "/home/me", namespace: "my-tool" });
		expect(Option.isNone(result)).toBe(true);
	});

	it("returns None on other platforms (e.g. freebsd)", () => {
		const result = nativeDirs({ platform: "freebsd", home: "/home/me", namespace: "my-tool" });
		expect(Option.isNone(result)).toBe(true);
	});
});
