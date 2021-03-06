import {
	CompositeSelectorInstance,
	isSelectorFactory,
	isSelectorUsingProps,
	PropsSelectorInstance,
	Selector,
	StateSelectorInstance,
	Store
} from '@calmdownval/predux';

import type { AnyProps } from './propsShallowEqual';

interface SelectorInfo<TProps> {
	readonly instance: CompositeSelectorInstance<any, TProps> | PropsSelectorInstance<any, TProps> | StateSelectorInstance;
	readonly key: string;
}

export interface StateMap<TProps = any> {
	[key: string]: Selector<any, TProps>;
}

export type InferStateProps<T extends StateMap> =
	{ [K in keyof T]: T[K] extends Selector<infer R> ? R : never };

export function initStateMap<TProps>(map?: StateMap<TProps>) {
	const selectors: SelectorInfo<TProps>[] = [];
	let usesPropsUntil = 0;

	for (const key in map) {
		let instance = map[key];
		if (isSelectorFactory(instance)) {
			instance = instance();
		}

		if (isSelectorUsingProps(instance)) {
			selectors.unshift({
				instance,
				key
			});

			++usesPropsUntil;
		}
		else {
			selectors.push({
				instance,
				key
			});
		}
	}

	// eslint-disable-next-line no-param-reassign
	map = undefined;

	// eslint-disable-next-line max-params
	return (target: AnyProps, store: Store, props: TProps, stateChanged: boolean, propsChanged: boolean, storeChanged: boolean) => {
		const until = stateChanged || storeChanged ? selectors.length : propsChanged ? usesPropsUntil : 0;
		for (let i = 0; i < until; ++i) {
			const info = selectors[i];
			target[info.key] = store.select(info.instance, props);
		}
	};
}
