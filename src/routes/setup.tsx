import { CoralButton, CoralSection } from "@get-coral/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { fetchSetupStatus, saveSetupConfiguration } from "#/server/functions";

export const Route = createFileRoute("/setup")({
	loader: async () => fetchSetupStatus(),
	component: SetupPage,
});

function SetupPage() {
	const navigate = useNavigate();
	const summary = Route.useLoaderData();
	const [url, setUrl] = useState(summary.current.url);
	const [apiKey, setApiKey] = useState(summary.current.apiKey);
	const [userId, setUserId] = useState(summary.current.userId);
	const [username, setUsername] = useState(summary.current.username);
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setError(null);

		try {
			await saveSetupConfiguration({
				data: {
					url,
					apiKey,
					userId,
					username,
					password,
				},
			});
			await navigate({ to: "/" });
		} catch (submitError) {
			setError(
				submitError instanceof Error
					? submitError.message
					: "Marquee could not save your Jellyfin settings.",
			);
		} finally {
			setSaving(false);
		}
	}

	return (
		<main className="min-h-screen bg-abyss px-6 py-10 text-ink sm:px-8 lg:px-12">
			<div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
				<CoralSection
					eyebrow="Marquee Setup"
					title={summary.configured ? "Update connection" : "Connect Marquee to Jellyfin"}
					subtitle="Marquee reads from Jellyfin and keeps this display in ambient sync."
				>
					<div className="space-y-3 text-sm text-ink-muted">
						<p>Server URL, API key, and user ID are required.</p>
						<p>Username and password are optional, but validated if provided.</p>
						<p>Saved values are stored in Marquee's local SQLite database.</p>
					</div>
				</CoralSection>

				<CoralSection eyebrow="Credentials" title="Jellyfin Connection">
					<form className="space-y-4" onSubmit={handleSubmit}>
						<div>
							<label htmlFor="setup-url" className="mb-2 block text-sm font-medium text-ink">
								Jellyfin URL
							</label>
							<input
								id="setup-url"
								className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-ink outline-none transition focus:border-teal/40"
								value={url}
								onChange={(event) => setUrl(event.target.value)}
								placeholder="http://localhost:8096"
							/>
						</div>

						<div>
							<label htmlFor="setup-api-key" className="mb-2 block text-sm font-medium text-ink">
								API key
							</label>
							<input
								id="setup-api-key"
								className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-ink outline-none transition focus:border-teal/40"
								value={apiKey}
								onChange={(event) => setApiKey(event.target.value)}
								placeholder="Paste a Jellyfin API key"
							/>
						</div>

						<div>
							<label htmlFor="setup-user-id" className="mb-2 block text-sm font-medium text-ink">
								User ID
							</label>
							<input
								id="setup-user-id"
								className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-ink outline-none transition focus:border-teal/40"
								value={userId}
								onChange={(event) => setUserId(event.target.value)}
								placeholder="Jellyfin user UUID"
							/>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<label htmlFor="setup-username" className="mb-2 block text-sm font-medium text-ink">
									Username
								</label>
								<input
									id="setup-username"
									className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-ink outline-none transition focus:border-teal/40"
									value={username}
									onChange={(event) => setUsername(event.target.value)}
									placeholder="Optional"
								/>
							</div>
							<div>
								<label htmlFor="setup-password" className="mb-2 block text-sm font-medium text-ink">
									Password
								</label>
								<input
									id="setup-password"
									type="password"
									className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-ink outline-none transition focus:border-teal/40"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									placeholder="Optional"
								/>
							</div>
						</div>

						{error ? <div className="marquee-inline-error">{error}</div> : null}

						<div className="flex items-center gap-3 pt-2">
							<CoralButton disabled={saving} size="lg" type="submit">
								{saving ? "Connecting..." : "Connect Jellyfin"}
							</CoralButton>
							<span className="text-sm text-ink-faint">Marquee validates before saving.</span>
						</div>
					</form>
				</CoralSection>
			</div>
		</main>
	);
}
