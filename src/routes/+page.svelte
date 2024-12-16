<script lang="ts">
	import { twMerge } from "tailwind-merge";

	import {
		astNodeToSystemNode,
		getElementNamesFromTokens,
		isOperandToken,
		isValidSystemRootNode,
		postfixToAst,
		removeSpaces,
		tokenize,
		toPostfix
	} from "$lib/utils";
	import {
		buildSystemStateNetwork,
		StateChangeKind,
		type SystemElementConfig
	} from "$lib/utils/network";
	import { renderNetwork } from "$lib/utils/network-renderer";

	let expression = $state("(a | b) & c");
	let expressionIsEmpty = $derived(expression.trim() == "");
	let operands = $derived(tokenize(expression).filter((token) => isOperandToken(token)));

	class ElementConfigStore {
		#cachedValue = $state(new Map<string, SystemElementConfig>());

		#getDefaultRecoveryCounts() {
			return { software: 0, hardware: 0 };
		}

		get value() {
			const value = operands.reduce((map, operand) => {
				let defaultRecoveryCounts = $state(this.#getDefaultRecoveryCounts());

				return map.set(operand, {
					recoveryCounts: this.#cachedValue.get(operand)?.recoveryCounts || defaultRecoveryCounts
				});
			}, new Map<string, SystemElementConfig>());

			return value;
		}

		getConfigByElementName(elementName: string) {
			return this.#cachedValue.get(elementName);
		}

		setElementRecoveryCount(
			elementName: string,
			recoveryKind: StateChangeKind,
			recoveryCount: number
		) {
			const prevElementConfig = this.#cachedValue.get(elementName) || {
				recoveryCounts: this.#getDefaultRecoveryCounts()
			};
			const newRecoveryCounts = {
				...prevElementConfig.recoveryCounts,
				[recoveryKind]: recoveryCount
			};
			const newElementConfig = { ...prevElementConfig, recoveryCounts: newRecoveryCounts };
			prevElementConfig.recoveryCounts = newRecoveryCounts;
			this.#cachedValue = new Map(this.#cachedValue).set(elementName, newElementConfig);
		}
	}

	const elementConfigStore = new ElementConfigStore();

	const systemRootNode = $derived.by(() => {
		try {
			const operandsAreUnique = operands.length == new Set(operands).size;
			const operandsAreAlphanumeric = operands.every((operand) => /^[a-zA-Z0-9]+$/.test(operand));

			if (!operandsAreUnique || !operandsAreAlphanumeric) return null;

			const ast = postfixToAst(toPostfix(tokenize(removeSpaces(expression))));
			const systemNode = astNodeToSystemNode(ast, elementConfigStore.value);

			if (!isValidSystemRootNode(systemNode)) throw new Error("No root node found in AST.");

			return systemNode;
		} catch {
			return null;
		}
	});

	const systemStateNetwork = $derived.by(() => {
		if (systemRootNode == null) return null;

		return buildSystemStateNetwork(systemRootNode);
	});

	let expressionIsValid = $derived(systemRootNode != null);

	let svgElement = $state<SVGSVGElement | null>(null);

	$inspect(systemStateNetwork);

	$effect(() => {
		if (svgElement == null || systemStateNetwork == null) return;

		renderNetwork(svgElement, systemStateNetwork, operands);
	});
</script>

<div class="flex h-screen flex-col">
	<section class="fixed z-10 flex w-full items-center gap-2 py-1">
		<form class="flex w-full flex-col-reverse">
			<div class="self-start px-4">
				<div
					class="flex gap-1.5 rounded-2xl bg-white/50 p-2 pl-4 shadow-md shadow-stone-900/5 backdrop-blur-md duration-200"
				>
					<span class="text-nowrap text-base text-stone-400">logical expression</span>
					<span
						bind:textContent={expression}
						oninput={(event) => {
							if (!event.currentTarget.textContent) {
								event.currentTarget.innerHTML = "";
							}
						}}
						role="textbox"
						contenteditable="true"
						class={twMerge(
							"min-w-32 rounded-lg bg-transparent px-2.5 font-bold text-stone-900 duration-200 placeholder:text-stone-400 hover:bg-stone-900/5 focus:bg-stone-900/5",
							!expressionIsValid && !expressionIsEmpty && "text-red-600"
						)}
						data-placeholder="e.g., (a | b) & c"
					></span>
				</div>
			</div>
			{#snippet recoverySelect(elementName: string, recoveryKind: StateChangeKind)}
				<label class="flex h-full flex-col gap-1">
					<span class="ml-2 text-nowrap text-xs font-medium text-stone-400">
						{recoveryKind} rec.
					</span>
					<select
						name={`${recoveryKind}-recoveries`}
						class="rounded-lg bg-transparent px-1 py-0.5 text-sm font-medium text-stone-900 duration-200 hover:bg-stone-900/5 focus:bg-stone-900/5"
						value={elementConfigStore.getConfigByElementName(elementName)?.recoveryCounts[
							recoveryKind
						]}
						onchange={(event) => {
							const recoveryCount = Number(event.currentTarget.value);
							elementConfigStore.setElementRecoveryCount(elementName, recoveryKind, recoveryCount);
						}}
					>
						{#each [...Array(4).keys(), Infinity] as number}
							<option value={number}>{number}</option>
						{/each}
					</select>
				</label>
			{/snippet}
			{#snippet elementFieldset(name: string)}
				<fieldset
					class="flex items-end gap-4 rounded-2xl p-2 shadow-md shadow-stone-900/5 backdrop-blur-md duration-200"
				>
					<legend class="sr-only">{name}</legend>
					<span aria-hidden="true" class="ml-2 font-bold leading-6 text-stone-900">
						{name}
					</span>
					{@render recoverySelect(name, StateChangeKind.Software)}
					{@render recoverySelect(name, StateChangeKind.Hardware)}
				</fieldset>
			{/snippet}
			<div class="h-full flex-1 overflow-auto px-4 py-2">
				<fieldset class="flex gap-2">
					{#each getElementNamesFromTokens(tokenize(expression)) as elementName}
						{@render elementFieldset(elementName)}
					{/each}
				</fieldset>
			</div>
		</form>
	</section>
	<section class="w-full flex-1">
		<svg
			bind:this={svgElement}
			class={twMerge(
				"h-full w-full text-sm duration-200",
				!expressionIsValid && "opacity-30 grayscale"
			)}
		></svg>
		<div
			class="pointer-events-none absolute left-0 top-0 h-full w-full bg-gradient-to-b from-white/90 from-5% to-transparent to-25%"
		></div>
	</section>
</div>
