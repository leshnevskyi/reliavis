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

			const ast = postfixToAst(toPostfix([...removeSpaces(expression)]));
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

	$inspect(systemStateNetwork);

	let expressionIsValid = $derived(systemRootNode != null);

	let svgElement = $state<SVGElement | null>(null);

	$effect(() => {
		if (svgElement == null || systemStateNetwork == null) return;

		renderNetwork(svgElement, systemStateNetwork);
	});
</script>

<div class="flex h-screen flex-col">
	<section class="flex w-full flex-col items-center gap-2 p-6">
		<input
			bind:value={expression}
			type="text"
			class:bg-red-100={!expressionIsValid}
			class="w-2/3 border-b border-b-neutral-400 py-1 text-center"
			placeholder="logical expression, e.g. (a | b) & c"
		/>
		<form class="w-4/12 min-w-96 flex-col">
			{#snippet recoverySelect(elementName: string, recoveryKind: RecoveryKind)}
				<select
					name={`${recoveryKind}-recoveries`}
					class="py-1"
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
			{/snippet}
			<table class="w-full">
				<thead>
					<tr>
						{#each ["Element", "Software Recoveries", "Hardware Recoveries"] as header, index}
							<th class="text-start text-xs" {...index == 0 && { style: "width: 25%" }}>{header}</th
							>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each getElementNamesFromTokens(tokenize(expression)) as elementName}
						<tr>
							<td class="py-1">{elementName}</td>
							<td>
								{@render recoverySelect(elementName, RecoveryKind.Software)}
							</td>
							<td>
								{@render recoverySelect(elementName, RecoveryKind.Hardware)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</form>
	</section>
	<section class="w-full flex-1">
		<svg bind:this={svgElement} class="h-full w-full text-sm"></svg>
	</section>
</div>
