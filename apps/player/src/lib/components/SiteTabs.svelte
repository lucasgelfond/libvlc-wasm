<!-- The site's four pages, as tabs; the current one is highlighted. -->
<script lang="ts">
	import { page } from '$app/state';

	const TABS: [href: string, label: string][] = [
		['/', 'Demo'],
		['/formats', 'Supported formats'],
		['/benchmarks', 'Benchmarks'],
		['/tests', 'Test coverage']
	];
	const current = $derived(page.url.pathname.replace(/\/$/, '') || '/');
</script>

<nav class="bg-muted/60 inline-flex w-fit max-w-full overflow-x-auto rounded-lg p-1 text-sm" aria-label="Pages">
	{#each TABS as [href, label] (href)}
		<a
			{href}
			aria-current={current === href ? 'page' : undefined}
			class="rounded-md px-3 py-1 whitespace-nowrap transition-colors {current === href
				? 'bg-background text-foreground font-medium shadow-sm'
				: 'text-muted-foreground hover:text-foreground'}">{label}</a
		>
	{/each}
</nav>
