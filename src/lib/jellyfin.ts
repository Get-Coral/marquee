import {
	createClient,
	getActiveSessions,
	getContinueWatching,
	getItemCounts,
	getLatestMedia,
	getSystemInfo,
	getUserById,
	imageUrl,
	type JellyfinActiveSession,
	type JellyfinItem,
	type JellyfinItemCounts,
	type JellyfinSystemInfo,
} from "@get-coral/jellyfin";
import { getEffectiveJellyfinSettings } from "./config-store";

export interface MarqueeCurrentUser {
	id: string;
	name: string;
}

export interface MarqueeSessionTile {
	id: string;
	title: string;
	subtitle: string;
	heroImageUrl?: string;
	posterImageUrl?: string;
	progress?: number;
	deviceName?: string;
	isPaused: boolean;
	playMethod?: string;
}

export interface MarqueeMediaTile {
	id: string;
	title: string;
	subtitle: string;
	description: string;
	imageUrl?: string;
	progress?: number;
}

export interface MarqueeDashboardData {
	systemInfo: JellyfinSystemInfo;
	itemCounts: JellyfinItemCounts;
	currentUser: MarqueeCurrentUser;
	liveSessions: MarqueeSessionTile[];
	upNext: MarqueeMediaTile[];
	recentlyAdded: MarqueeMediaTile[];
	generatedAt: string;
}

function getRequiredSettings() {
	const settings = getEffectiveJellyfinSettings();

	if (!settings) {
		throw new Error("Marquee is not configured yet. Visit /setup to connect Jellyfin.");
	}

	return settings;
}

function createMarqueeClient() {
	const settings = getRequiredSettings();

	return createClient({
		url: settings.url,
		apiKey: settings.apiKey,
		userId: settings.userId,
		username: settings.username,
		password: settings.password,
		clientName: "Marquee",
		deviceName: "Marquee Display",
		deviceId: "marquee-display",
	});
}

function readSessionProgress(session: JellyfinActiveSession) {
	const runtime = session.NowPlayingItem?.RunTimeTicks;
	const position = session.PlayState?.PositionTicks;
	if (!runtime || !position || runtime <= 0) return undefined;

	return Math.max(0, Math.min(100, (position / runtime) * 100));
}

function humanizeEpisodeTitle(item: JellyfinActiveSession["NowPlayingItem"]) {
	if (!item) {
		return "";
	}

	if (item.Type !== "Episode") {
		return item.Type;
	}

	const season = item.ParentIndexNumber
		? `S${String(item.ParentIndexNumber).padStart(2, "0")}`
		: "";
	const episode = item.IndexNumber ? `E${String(item.IndexNumber).padStart(2, "0")}` : "";
	const code = season || episode ? ` ${season}${episode}` : "";
	const series = item.SeriesName ? `${item.SeriesName}${code}` : `Episode${code}`;
	return series.trim();
}

function toSessionTile(
	client: ReturnType<typeof createClient>,
	session: JellyfinActiveSession,
): MarqueeSessionTile | null {
	const nowPlaying = session.NowPlayingItem;
	if (!nowPlaying?.Id || !nowPlaying.Name) {
		return null;
	}

	const subtitleParts = [
		session.UserName,
		humanizeEpisodeTitle(nowPlaying),
		session.DeviceName,
	].filter(Boolean);

	return {
		id: session.Id,
		title: nowPlaying.Name,
		subtitle: subtitleParts.join(" · "),
		heroImageUrl: imageUrl(client, nowPlaying.Id, "Backdrop", 1920),
		posterImageUrl: imageUrl(client, nowPlaying.Id, "Primary", 960),
		progress: readSessionProgress(session),
		deviceName: session.DeviceName,
		isPaused: Boolean(session.PlayState?.IsPaused),
		playMethod: session.PlayState?.PlayMethod,
	};
}

function toMediaTile(
	client: ReturnType<typeof createClient>,
	item: JellyfinItem,
): MarqueeMediaTile {
	const genre = item.GenreItems?.[0]?.Name;
	const year = item.ProductionYear;
	const subtitle = [item.Type, year].filter(Boolean).join(" · ") || item.Type;
	const description = item.Overview?.trim() || "No overview available yet.";
	const progress =
		typeof item.UserData?.PlayedPercentage === "number"
			? item.UserData.PlayedPercentage
			: undefined;

	return {
		id: item.Id,
		title: item.Name,
		subtitle: genre ? `${subtitle} · ${genre}` : subtitle,
		description,
		imageUrl: imageUrl(client, item.Id, "Primary", 420),
		progress,
	};
}

function interleaveRows(rows: JellyfinItem[][], limit: number) {
	const output: JellyfinItem[] = [];
	let index = 0;

	while (output.length < limit) {
		let addedInRound = false;
		for (const row of rows) {
			const item = row[index];
			if (!item) continue;
			output.push(item);
			addedInRound = true;
			if (output.length >= limit) break;
		}
		if (!addedInRound) break;
		index += 1;
	}

	return output;
}

export async function fetchDashboardData(): Promise<MarqueeDashboardData> {
	const client = createMarqueeClient();
	const [
		systemInfo,
		itemCounts,
		currentUser,
		activeSessions,
		continueWatching,
		recentMovies,
		recentShows,
	] = await Promise.all([
		getSystemInfo(client),
		getItemCounts(client),
		getUserById(client, client.config.userId),
		getActiveSessions(client),
		getContinueWatching(client, 8),
		getLatestMedia(client, "Movie", 8),
		getLatestMedia(client, "Series", 8),
	]);

	const liveSessions = activeSessions
		.map((session) => toSessionTile(client, session))
		.filter((session): session is MarqueeSessionTile => Boolean(session));

	const upNext = continueWatching.slice(0, 8).map((item) => toMediaTile(client, item));
	const recentlyAdded = interleaveRows([recentMovies, recentShows], 10).map((item) =>
		toMediaTile(client, item),
	);

	return {
		systemInfo,
		itemCounts,
		currentUser: {
			id: currentUser.Id,
			name: currentUser.Name,
		},
		liveSessions,
		upNext,
		recentlyAdded,
		generatedAt: new Date().toISOString(),
	};
}
