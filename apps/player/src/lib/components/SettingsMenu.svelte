<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import RiSettings3Line from 'remixicon-svelte/icons/settings-3-line';
	import RiSpeedUpLine from 'remixicon-svelte/icons/speed-up-line';
	import RiClosedCaptioningLine from 'remixicon-svelte/icons/closed-captioning-line';
	import RiMusic2Line from 'remixicon-svelte/icons/music-2-line';
	import RiEqualizerLine from 'remixicon-svelte/icons/equalizer-line';
	import RiFilmLine from 'remixicon-svelte/icons/film-line';
	import RiTimeLine from 'remixicon-svelte/icons/time-line';
	import RiDiscLine from 'remixicon-svelte/icons/disc-line';
	import RiListUnordered from 'remixicon-svelte/icons/list-unordered';
	import { trackLabel, formatTime, type Session } from '$lib/session.svelte';

	let {
		session,
		onsubtitlefile,
		open = $bindable(false)
	}: { session: Session; onsubtitlefile: () => void; open?: boolean } = $props();

	const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];
	const aspects = [null, '16:9', '4:3', '21:9', '2.35:1', '1:1'];
	const delays = [-2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2];

	const selected = (list: { id: string; selected: boolean }[]) => list.find((t) => t.selected)?.id ?? 'off';
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon" class="text-white hover:bg-white/15 hover:text-white" aria-label="Settings">
				<RiSettings3Line class="size-5" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" side="top" sideOffset={10} class="w-64">
		{#if session.titles.length > 1}
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<RiDiscLine /> Title
					<span class="text-muted-foreground ml-auto max-w-28 truncate text-xs">
						{session.titles[session.title]?.name ?? '—'}
					</span>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent class="max-h-80 w-64 overflow-y-auto">
					<DropdownMenu.RadioGroup value={String(session.title)} onValueChange={(v) => session.setTitle(+v)}>
						{#each session.titles as t, i (i)}
							<DropdownMenu.RadioItem value={String(i)}>
								<span class="truncate">{t.name ?? `Title ${i}`}</span>
								{#if !t.menu && t.duration}<span class="text-muted-foreground ml-auto pl-2 text-xs tabular-nums">{formatTime(t.duration)}</span>{/if}
							</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		{/if}
		{#if session.chapters.length > 1}
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<RiListUnordered /> Chapter
					<span class="text-muted-foreground ml-auto max-w-28 truncate text-xs">
						{session.chapters[session.chapter]?.name ?? (session.chapter >= 0 ? `Chapter ${session.chapter + 1}` : '—')}
					</span>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent class="max-h-80 w-64 overflow-y-auto">
					<DropdownMenu.RadioGroup value={String(session.chapter)} onValueChange={(v) => session.setChapter(+v)}>
						{#each session.chapters as c, i (i)}
							<DropdownMenu.RadioItem value={String(i)}>
								<span class="truncate">{c.name ?? `Chapter ${i + 1}`}</span>
								<span class="text-muted-foreground ml-auto pl-2 text-xs tabular-nums">{formatTime(c.time)}</span>
							</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		{/if}
		{#if session.titles.length > 1 || session.chapters.length > 1}<DropdownMenu.Separator />{/if}
		<DropdownMenu.Sub>
			<DropdownMenu.SubTrigger>
				<RiSpeedUpLine /> Speed
				<span class="text-muted-foreground ml-auto text-xs">{session.rate === 1 ? 'Normal' : `${session.rate}×`}</span>
			</DropdownMenu.SubTrigger>
			<DropdownMenu.SubContent class="w-40">
				<DropdownMenu.RadioGroup value={String(session.rate)} onValueChange={(v) => session.setRate(+v)}>
					{#each speeds as s (s)}
						<DropdownMenu.RadioItem value={String(s)}>{s === 1 ? 'Normal' : `${s}×`}</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.SubContent>
		</DropdownMenu.Sub>

		<DropdownMenu.Sub>
			<DropdownMenu.SubTrigger>
				<RiClosedCaptioningLine /> Subtitles
				<span class="text-muted-foreground ml-auto text-xs">
					{session.subtitles.find((t) => t.selected) ? 'On' : session.subtitles.length ? 'Off' : 'None'}
				</span>
			</DropdownMenu.SubTrigger>
			<DropdownMenu.SubContent class="w-72">
				<DropdownMenu.RadioGroup
					value={selected(session.subtitles)}
					onValueChange={(v) => session.selectTrack('text', v === 'off' ? null : v)}
				>
					<DropdownMenu.RadioItem value="off">Off</DropdownMenu.RadioItem>
					{#each session.subtitles as t (t.id)}
						<DropdownMenu.RadioItem value={t.id}><span class="truncate">{trackLabel(t)}</span></DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onSelect={onsubtitlefile}>Load subtitle file…</DropdownMenu.Item>
				<DropdownMenu.Sub>
					<DropdownMenu.SubTrigger><RiTimeLine /> Delay
						<span class="text-muted-foreground ml-auto text-xs">{session.subtitleDelay ? `${session.subtitleDelay > 0 ? '+' : ''}${session.subtitleDelay}s` : '0'}</span>
					</DropdownMenu.SubTrigger>
					<DropdownMenu.SubContent class="w-36">
						<DropdownMenu.RadioGroup value={String(session.subtitleDelay)} onValueChange={(v) => session.setSubtitleDelay(+v)}>
							{#each delays as d (d)}
								<DropdownMenu.RadioItem value={String(d)}>{d > 0 ? '+' : ''}{d} s</DropdownMenu.RadioItem>
							{/each}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.SubContent>
				</DropdownMenu.Sub>
			</DropdownMenu.SubContent>
		</DropdownMenu.Sub>

		{#if session.audio.length > 0}
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<RiMusic2Line /> Audio track
					<span class="text-muted-foreground ml-auto text-xs">{session.audio.length}</span>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent class="w-72">
					<DropdownMenu.RadioGroup
						value={selected(session.audio)}
						onValueChange={(v) => session.selectTrack('audio', v === 'off' ? null : v)}
					>
						{#each session.audio as t (t.id)}
							<DropdownMenu.RadioItem value={t.id}><span class="truncate">{trackLabel(t)}</span></DropdownMenu.RadioItem>
						{/each}
						<DropdownMenu.RadioItem value="off">Off</DropdownMenu.RadioItem>
					</DropdownMenu.RadioGroup>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		{/if}

		<DropdownMenu.Sub>
			<DropdownMenu.SubTrigger>
				<RiEqualizerLine /> Equalizer
				<span class="text-muted-foreground ml-auto max-w-24 truncate text-xs">
					{session.equalizer == null ? 'Off' : session.presets[session.equalizer]}
				</span>
			</DropdownMenu.SubTrigger>
			<DropdownMenu.SubContent class="max-h-80 w-48 overflow-y-auto">
				<DropdownMenu.RadioGroup
					value={session.equalizer == null ? 'off' : String(session.equalizer)}
					onValueChange={(v) => session.setEqualizer(v === 'off' ? null : +v)}
				>
					<DropdownMenu.RadioItem value="off">Off</DropdownMenu.RadioItem>
					{#each session.presets as p, i (p)}
						<DropdownMenu.RadioItem value={String(i)}>{p}</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.SubContent>
		</DropdownMenu.Sub>

		{#if session.hasVideo}
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<RiFilmLine /> Aspect ratio
					<span class="text-muted-foreground ml-auto text-xs">{session.aspect ?? 'Auto'}</span>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent class="w-40">
					<DropdownMenu.RadioGroup value={session.aspect ?? 'auto'} onValueChange={(v) => session.setAspect(v === 'auto' ? null : v)}>
						{#each aspects as a (a ?? 'auto')}
							<DropdownMenu.RadioItem value={a ?? 'auto'}>{a ?? 'Auto'}</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
			<DropdownMenu.Separator />
			<DropdownMenu.Item closeOnSelect={false} onSelect={() => session.setDeinterlace(!session.deinterlace)}>
				Deinterlace
				<Switch class="ml-auto" checked={session.deinterlace} tabindex={-1} aria-hidden="true" />
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
