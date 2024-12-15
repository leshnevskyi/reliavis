<script lang="ts">
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
		RecoveryKind,
		type SystemElementConfig
	} from "$lib/utils/network";
	import { renderNetwork } from "$lib/utils/network-renderer";

	let expression = $state("(a | b) & c");
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
			recoveryKind: RecoveryKind,
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

		renderNetwork(svgElement, systemStateNetwork);
	});
</script>

<div class="flex h-screen flex-col">
	<section class="fixed m-6 flex w-full items-center gap-2">
		<form class="flex w-full gap-5">
			<label
				class="group flex h-full w-1/6 flex-col gap-1 rounded-2xl bg-white/60 p-2 shadow-md shadow-stone-900/5 backdrop-blur-md duration-200"
			>
				<span class="text-nowrap px-2 text-xs font-medium text-stone-400">logical expression</span>
				<input
					bind:value={expression}
					type="text"
					class="h-6 w-full rounded-lg bg-transparent px-2 font-bold text-stone-900 duration-200 hover:bg-stone-900/5 focus:bg-stone-900/5"
					placeholder="logical expression, e.g. (a | b) & c"
				/>
			</label>
			{#snippet recoverySelect(elementName: string, recoveryKind: RecoveryKind)}
				<label class="flex h-full flex-col gap-1">
					<span class="text-nowrap px-2 text-xs font-medium text-stone-400">
						{recoveryKind} rec.
					</span>
					<select
						name={`${recoveryKind}-recoveries`}
						class="h-6 rounded-lg bg-transparent px-1 py-0.5 text-sm font-medium text-stone-900 duration-200 hover:bg-stone-900/5 focus:bg-stone-900/5"
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
					class="group flex items-end gap-4 rounded-2xl bg-white/60 p-2 shadow-md shadow-stone-900/5 backdrop-blur-md duration-200"
				>
					<legend class="sr-only">{name}</legend>
					<span aria-hidden="true" class="px-2 font-bold leading-6 text-stone-900">
						{name}
					</span>
					{@render recoverySelect(name, RecoveryKind.Software)}
					{@render recoverySelect(name, RecoveryKind.Hardware)}
				</fieldset>
			{/snippet}
			<fieldset class="flex flex-1 gap-3">
				{#each getElementNamesFromTokens(tokenize(expression)) as elementName}
					{@render elementFieldset(elementName)}
				{/each}
			</fieldset>
		</form>
	</section>
	<section class="w-full flex-1">
		<svg bind:this={svgElement} class="h-full w-full text-sm"></svg>
	</section>
</div>
