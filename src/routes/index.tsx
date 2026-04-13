import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { MarqueeDashboardData, MarqueeSessionTile } from "#/lib/jellyfin";
import { fetchMarqueeDashboard, fetchSetupStatus } from "#/server/functions";

const HERO_ROTATE_INTERVAL_MS = 12000;

export const Route = createFileRoute("/")({
	loader: async () => {
		const setupStatus = await fetchSetupStatus();

		if (!setupStatus?.configured) {
			throw redirect({ to: "/setup", search: {} });
		}

		return fetchMarqueeDashboard({ data: { refreshToken: Date.now() } });
	},
	component: Home,
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Ambient home intentionally composes polling, transitions, and fullscreen overlay state.
function Home() {
	const initialData = Route.useLoaderData();
	const [dashboard, setDashboard] = useState<MarqueeDashboardData>(initialData);
	const [fetchError, setFetchError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		let refreshing = false;

		function applyDashboard(next: MarqueeDashboardData) {
			if (cancelled) {
				return;
			}

			setDashboard(next);
			setFetchError(null);
		}

		function applyRefreshError(error: unknown) {
			if (cancelled) {
				return;
			}

			setFetchError(
				error instanceof Error ? error.message : "Could not refresh Marquee dashboard.",
			);
		}

		async function refresh() {
			if (refreshing) {
				return;
			}

			try {
				refreshing = true;
				const next = await fetchMarqueeDashboard({ data: { refreshToken: Date.now() } });
				applyDashboard(next);
			} catch (error) {
				applyRefreshError(error);
			} finally {
				refreshing = false;
			}
		}

		void refresh();

		function handleWindowAttention() {
			if (document.visibilityState === "visible") {
				void refresh();
			}
		}

		const interval = window.setInterval(() => {
			void refresh();
		}, 15000);

		window.addEventListener("focus", handleWindowAttention);
		document.addEventListener("visibilitychange", handleWindowAttention);

		return () => {
			cancelled = true;
			window.clearInterval(interval);
			window.removeEventListener("focus", handleWindowAttention);
			document.removeEventListener("visibilitychange", handleWindowAttention);
		};
	}, []);

	const liveSummary = useMemo(() => {
		if (dashboard.liveSessions.length === 0) {
			return "No active playback right now";
		}

		const paused = dashboard.liveSessions.filter((session) => session.isPaused).length;
		const playing = dashboard.liveSessions.length - paused;
		return `${playing} playing · ${paused} paused`;
	}, [dashboard.liveSessions]);

	const totalLibraryCount =
		(dashboard.itemCounts.MovieCount ?? 0) +
		(dashboard.itemCounts.SeriesCount ?? 0) +
		(dashboard.itemCounts.BookCount ?? 0);

	const visibleSessions = dashboard.liveSessions.slice(0, 6);
	const [heroIndex, setHeroIndex] = useState(0);

	useEffect(() => {
		if (visibleSessions.length === 0) {
			setHeroIndex(0);
			return;
		}

		setHeroIndex((index) => (index >= visibleSessions.length ? 0 : index));
	}, [visibleSessions.length]);

	useEffect(() => {
		if (visibleSessions.length <= 1) {
			return;
		}

		const interval = window.setInterval(() => {
			setHeroIndex((index) => (index + 1) % visibleSessions.length);
		}, HERO_ROTATE_INTERVAL_MS);

		return () => {
			window.clearInterval(interval);
		};
	}, [visibleSessions.length]);

	const featuredSession = visibleSessions[heroIndex] ?? visibleSessions[0] ?? null;
	const supportingSessions = visibleSessions
		.filter((session) => session.id !== featuredSession?.id)
		.slice(0, 4);
	const [heroCurrent, setHeroCurrent] = useState<MarqueeSessionTile | null>(featuredSession);
	const [heroPrevious, setHeroPrevious] = useState<MarqueeSessionTile | null>(null);
	const [heroTransitioning, setHeroTransitioning] = useState(false);
	const [heroCurrentImage, setHeroCurrentImage] = useState<string | undefined>(
		featuredSession?.heroImageUrl ?? featuredSession?.posterImageUrl,
	);
	const [heroPreviousImage, setHeroPreviousImage] = useState<string | undefined>(undefined);

	useEffect(() => {
		if (!featuredSession) {
			setHeroCurrent(null);
			setHeroPrevious(null);
			setHeroTransitioning(false);
			return;
		}

		if (!heroCurrent) {
			setHeroCurrent(featuredSession);
			return;
		}

		if (heroCurrent.id === featuredSession.id) {
			setHeroCurrent(featuredSession);
			return;
		}

		setHeroPrevious(heroCurrent);
		setHeroPreviousImage(heroCurrent.heroImageUrl ?? heroCurrent.posterImageUrl);
		setHeroCurrent(featuredSession);
		setHeroCurrentImage(featuredSession.heroImageUrl ?? featuredSession.posterImageUrl);
		setHeroTransitioning(true);

		const timeout = window.setTimeout(() => {
			setHeroPrevious(null);
			setHeroTransitioning(false);
		}, 1400);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [featuredSession, heroCurrent]);

	useEffect(() => {
		setHeroCurrentImage(heroCurrent?.heroImageUrl ?? heroCurrent?.posterImageUrl);
	}, [heroCurrent]);

	useEffect(() => {
		if (!heroPrevious) {
			setHeroPreviousImage(undefined);
			return;
		}

		setHeroPreviousImage(heroPrevious.heroImageUrl ?? heroPrevious.posterImageUrl);
	}, [heroPrevious]);

	return (
		<main className="marquee-screen marquee-screen--ambient text-ink">
			<div className="marquee-background" aria-hidden="true" />
			<div className="marquee-ambient-stage">
				<div className="marquee-ambient-media" aria-hidden="true">
					{heroPrevious && heroPreviousImage ? (
						<img
							className={`marquee-ambient-image marquee-ambient-image--previous ${heroTransitioning ? "is-exiting" : ""}`}
							src={heroPreviousImage}
							alt=""
						/>
					) : null}
					{heroCurrent && heroCurrentImage ? (
						<img
							className={`marquee-ambient-image marquee-ambient-image--current ${heroTransitioning ? "is-entering" : ""}`}
							src={heroCurrentImage}
							alt=""
							onError={() => {
								if (heroCurrentImage !== heroCurrent.posterImageUrl) {
									setHeroCurrentImage(heroCurrent.posterImageUrl);
								}
							}}
						/>
					) : null}
					<div className="marquee-ambient-vignette" />
				</div>

				<div className="marquee-ambient-overlay">
					<header className="marquee-ambient-topbar">
						<p className="marquee-kicker">Marquee</p>
						<div className="marquee-meta-grid marquee-meta-grid--compact">
							<div className="marquee-meta-pill">
								<p>Server</p>
								<h2>{dashboard.systemInfo.ServerName}</h2>
							</div>
							<div className="marquee-meta-pill">
								<p>Live</p>
								<h2>{liveSummary}</h2>
							</div>
							<div className="marquee-meta-pill">
								<p>Library</p>
								<h2>{totalLibraryCount} titles</h2>
							</div>
						</div>
					</header>

					<div className="marquee-ambient-main">
						{heroCurrent ? (
							<>
								<p className="marquee-ambient-badge">
									{heroCurrent.isPaused ? "Paused" : "Now Playing"}
								</p>
								<h1 className="marquee-ambient-title">{heroCurrent.title}</h1>
								<p className="marquee-ambient-meta">{heroCurrent.subtitle}</p>
								{typeof heroCurrent.progress === "number" ? (
									<div className="marquee-ambient-progress" aria-hidden="true">
										<span style={{ width: `${heroCurrent.progress}%` }} />
									</div>
								) : null}
							</>
						) : (
							<>
								<p className="marquee-ambient-badge">Idle</p>
								<h1 className="marquee-ambient-title">Nothing Playing Right Now</h1>
								<p className="marquee-ambient-meta">
									The screen will update automatically when a new Jellyfin session starts.
								</p>
							</>
						)}
					</div>

					<footer className="marquee-ambient-footer">
						{supportingSessions.length > 0 ? (
							<div className="marquee-session-pills">
								{supportingSessions.map((session) => (
									<div key={session.id} className="marquee-session-pill">
										<p>{session.isPaused ? "Paused" : "Playing"}</p>
										<h3>{session.title}</h3>
									</div>
								))}
							</div>
						) : null}

						{fetchError ? (
							<div className="marquee-inline-error" role="status">
								Live updates are temporarily unavailable: {fetchError}
							</div>
						) : null}
					</footer>
				</div>
			</div>
		</main>
	);
}
