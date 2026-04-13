import { CoralErrorState } from "@get-coral/ui";
import { createRootRoute, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import "@get-coral/ui/styles.css";
import "#/styles.css";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Marquee" },
			{
				name: "description",
				content:
					"A passive Jellyfin display for now playing sessions, up next queue, and recent additions.",
			},
		],
	}),
	component: RootComponent,
	errorComponent: RootErrorPage,
	notFoundComponent: RootNotFoundPage,
});

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}

function RootErrorPage({ error, reset }: { error: Error; reset: () => void }) {
	const router = useRouter();

	function handleRetry() {
		reset();
		void router.invalidate();
	}

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<CoralErrorState
					eyebrow="Marquee"
					title="Something went wrong"
					description={error?.message ?? "An unexpected error happened while loading this route."}
					primaryAction={{ label: "Try again", onClick: handleRetry }}
					secondaryAction={{ label: "Back home", href: "/", variant: "neutral" }}
				/>
				<Scripts />
			</body>
		</html>
	);
}

function RootNotFoundPage() {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<CoralErrorState
					code="404"
					eyebrow="Marquee"
					title="Page not found"
					description="The page you are looking for does not exist or has moved."
					primaryAction={{ label: "Back home", href: "/" }}
				/>
				<Scripts />
			</body>
		</html>
	);
}
