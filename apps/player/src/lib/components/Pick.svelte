<script lang="ts">
	import * as Select from '$lib/components/ui/select';

	/** A labelled single-choice select. Options are [value, label] pairs. */
	let {
		label,
		value,
		options,
		onchange,
		disabled = false,
		placeholder = 'None'
	}: {
		label: string;
		value: string;
		options: [string, string][];
		onchange: (v: string) => void;
		disabled?: boolean;
		placeholder?: string;
	} = $props();

	const current = $derived(options.find(([v]) => v === value)?.[1] ?? placeholder);
</script>

<div class="flex flex-col gap-1.5">
	<span class="text-muted-foreground text-xs font-medium">{label}</span>
	<Select.Root type="single" {value} onValueChange={(v) => onchange(v)} disabled={disabled || !options.length}>
		<Select.Trigger class="w-full" aria-label={label}>
			<span class="truncate">{options.length ? current : placeholder}</span>
		</Select.Trigger>
		<Select.Content class="max-h-72">
			{#each options as [v, l] (v)}
				<Select.Item value={v} label={l}><span class="truncate">{l}</span></Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
