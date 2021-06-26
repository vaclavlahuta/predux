import { globalContext } from './globalContext';
import type { Action, Store } from './Store';

// In the below decorators we ask for the third argument, the property
// descriptor, even though we don't actually use it. This makes TypeScript flag
// any attempts to use these decorators on anything but class methods.

/**
 * Decorator: Marks a method as a reducer capable of changing the state.
 *
 * To be applicable it must be used within a class that extends the Store class.
 * Furthermore the decorated method must return the modified state. The method
 * can have any number of arbitrary arguments.
 */
export function reducer<
	TState,
	TKey extends string,
	TReducer extends () => TState
>(proto: Store<TState> & { [K in TKey]: TReducer }, name: TKey, _descriptor: PropertyDescriptor) {
	const fn = proto[name];
	if (typeof fn !== 'function') {
		throw new Error('The `@reducer` decorator can only be used on class methods.');
	}

	proto[name] = function reducerWrapper(this: Store<TState>) {
		try {
			if (this.hasStaticGuid && this.actionDispatched.handlers.length > 0) {
				const length = arguments.length;
				const action = new Array(length + 1) as Action;

				action[0] = `${this.guid}/${name}`;
				for (let i = 0; i < length; ++i) {
					action[i + 1] = arguments[i];
				}

				this.actionDispatched(action);
			}

			globalContext.isStateLocked = false;
			const newState = fn.apply(this, arguments as any);
			this.setState(newState);

			return newState;
		}
		finally {
			globalContext.isStateLocked = true;
		}
	} as typeof fn;
}

/**
 * Decorator: Marks a method as a selector returning a value derived from the
 * state.
 *
 * To be applicable it must be used within a class that extends the Store class.
 */
export function selector<
	TState,
	TKey extends string,
	TSelector extends () => any
>(proto: Store<TState> & { [K in TKey]: TSelector }, name: TKey, _descriptor: PropertyDescriptor) {
	const fn = proto[name];
	if (typeof fn !== 'function') {
		throw new Error('The `@selector` decorator can only be used on class methods.');
	}

	proto[name] = function selectorWrapper(this: Store<TState>) {
		try {
			globalContext.isStateLocked = false;
			return fn.apply(this, arguments as any);
		}
		finally {
			globalContext.isStateLocked = true;
		}
	} as typeof fn;
}