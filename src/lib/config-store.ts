import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClient, getUserById } from "@get-coral/jellyfin";

export interface JellyfinSettings {
	url: string;
	apiKey: string;
	userId: string;
	username?: string;
	password?: string;
}

type SettingsSource = "database" | "env" | "merged" | "missing";

function getDataDirectory() {
	return process.env.MARQUEE_DATA_DIR ?? path.join(process.cwd(), "data");
}

function getDatabasePath() {
	return path.join(getDataDirectory(), "marquee.sqlite");
}

let database: DatabaseSync | null = null;

const CREATE_TABLE_SQL = [
	"CREATE TABLE IF NOT EXISTS app_settings (",
	"  key TEXT PRIMARY KEY,",
	"  value TEXT NOT NULL,",
	"  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
	");",
].join("\n");

function getDatabase() {
	if (database) return database;

	fs.mkdirSync(getDataDirectory(), { recursive: true });
	database = new DatabaseSync(getDatabasePath());
	database.exec(CREATE_TABLE_SQL);

	return database;
}

function getSetting(key: string) {
	const statement = getDatabase().prepare("SELECT value FROM app_settings WHERE key = ?");
	const row = statement.get(key) as { value?: string } | undefined;
	return row?.value;
}

const UPSERT_SQL = [
	"INSERT INTO app_settings (key, value, updated_at)",
	"VALUES (?, ?, CURRENT_TIMESTAMP)",
	"ON CONFLICT(key) DO UPDATE SET",
	"  value = excluded.value,",
	"  updated_at = CURRENT_TIMESTAMP",
].join("\n");

function setSetting(key: string, value: string) {
	const statement = getDatabase().prepare(UPSERT_SQL);
	statement.run(key, value);
}

function normalizeValue(value?: string) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function normalizeSettings(settings: Partial<JellyfinSettings>): Partial<JellyfinSettings> {
	return {
		url: normalizeValue(settings.url),
		apiKey: normalizeValue(settings.apiKey),
		userId: normalizeValue(settings.userId),
		username: normalizeValue(settings.username),
		password: normalizeValue(settings.password),
	};
}

function readEnvSettings(): Partial<JellyfinSettings> {
	return {
		url: process.env.JELLYFIN_URL,
		apiKey: process.env.JELLYFIN_API_KEY,
		userId: process.env.JELLYFIN_USER_ID,
		username: process.env.JELLYFIN_USERNAME,
		password: process.env.JELLYFIN_PASSWORD,
	};
}

function areRequiredSettingsComplete(
	settings: Partial<JellyfinSettings>,
): settings is JellyfinSettings {
	return Boolean(settings.url && settings.apiKey && settings.userId);
}

export function getStoredJellyfinSettings(): Partial<JellyfinSettings> {
	return normalizeSettings({
		url: getSetting("jellyfin.url"),
		apiKey: getSetting("jellyfin.apiKey"),
		userId: getSetting("jellyfin.userId"),
		username: getSetting("jellyfin.username"),
		password: getSetting("jellyfin.password"),
	});
}

export function getEffectiveJellyfinSettings(): JellyfinSettings | null {
	const stored = getStoredJellyfinSettings();
	const env = normalizeSettings(readEnvSettings());
	const merged = {
		url: stored.url || env.url,
		apiKey: stored.apiKey || env.apiKey,
		userId: stored.userId || env.userId,
		username: stored.username || env.username,
		password: stored.password || env.password,
	};

	return areRequiredSettingsComplete(merged)
		? {
				url: merged.url,
				apiKey: merged.apiKey,
				userId: merged.userId,
				username: merged.username,
				password: merged.password,
			}
		: null;
}

function getJellyfinSettingsSource(): SettingsSource {
	const stored = getStoredJellyfinSettings();
	const env = normalizeSettings(readEnvSettings());

	const storedComplete = areRequiredSettingsComplete(stored);
	const envComplete = areRequiredSettingsComplete(env);

	if (storedComplete) return "database";
	if (envComplete) return "env";
	if (Object.values({ ...stored, ...env }).some(Boolean)) return "merged";
	return "missing";
}

export function getConfigurationSummary() {
	const stored = getStoredJellyfinSettings();
	const effective = getEffectiveJellyfinSettings();

	return {
		configured: Boolean(effective),
		source: getJellyfinSettingsSource(),
		current: {
			url: stored.url ?? effective?.url ?? "",
			apiKey: stored.apiKey ?? effective?.apiKey ?? "",
			userId: stored.userId ?? effective?.userId ?? "",
			username: stored.username ?? effective?.username ?? "",
			hasPassword: Boolean(stored.password ?? effective?.password),
		},
	};
}

export function saveJellyfinSettings(settings: JellyfinSettings) {
	setSetting("jellyfin.url", settings.url.trim());
	setSetting("jellyfin.apiKey", settings.apiKey.trim());
	setSetting("jellyfin.userId", settings.userId.trim());
	setSetting("jellyfin.username", settings.username?.trim() ?? "");
	setSetting("jellyfin.password", settings.password?.trim() ?? "");
}

export async function validateJellyfinSettings(settings: JellyfinSettings) {
	const normalized = normalizeSettings(settings);

	if (!areRequiredSettingsComplete(normalized)) {
		throw new Error("Server URL, API key, and user ID are required.");
	}

	if (
		(normalized.username && !normalized.password) ||
		(!normalized.username && normalized.password)
	) {
		throw new Error("Provide both username and password, or leave both empty.");
	}

	const client = createClient({
		url: normalized.url,
		apiKey: normalized.apiKey,
		userId: normalized.userId,
		username: normalized.username,
		password: normalized.password,
		clientName: "Marquee",
		deviceName: "Marquee Display",
		deviceId: "marquee-display",
	});

	await getUserById(client, normalized.userId);

	if (normalized.username && normalized.password) {
		await client.getPlaybackAuth();
	}

	return {
		url: normalized.url,
		apiKey: normalized.apiKey,
		userId: normalized.userId,
		username: normalized.username,
		password: normalized.password,
	};
}
