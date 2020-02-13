import { context } from './context';
import { propRefsEqual } from './propRefsEqual';
import { Action, ActionCreator, Signal, Store, WithReturnType } from '@calmdownval/predux';
import { bindActionCreators, BoundActionCreators } from './bindActionCreators';
import { Component as ClassComponent, ComponentType, FunctionalComponent, h } from 'preact';
import { useContext, useLayoutEffect, useMemo, useReducer } from 'preact/hooks';

interface StateMap<TState, TOwnProps>
{
	[key: string]: undefined | ((state: TState, ownProps?: TOwnProps) => any);
}

export interface DispatchMap<TState, TAction extends Action = Action>
{
	[key: string]: undefined | ActionCreator<TState, TAction>;
}

type Defined<T> =
	T extends undefined ? {} : T;

type Factory<K = never> =
	<T>(Component: ComponentType<T>) => FunctionalComponent<Omit<T, keyof K>>;

type MapStateParam<TStateProps> =
	TStateProps | (() => TStateProps);

type MapDispatchParam<TDispatchProps, TOwnProps> =
	TDispatchProps | ((ownProps: TOwnProps) => TDispatchProps);

type MergePropsParam<TStateProps, TDispatchProps, TOwnProps> =
	(stateProps: TStateProps, dispatchProps: BoundActionCreators<TDispatchProps>, ownProps: TOwnProps) => {};

interface Connect
{
	<TStateProps = {}, TDispatchProps = {}, TOwnProps = {}>(
		mapStateToProps?: MapStateParam<TStateProps>,
		mapDispatchToProps?: MapDispatchParam<TDispatchProps, TOwnProps>
	): Factory<Defined<TStateProps> & Defined<TDispatchProps>>;

	<TStateProps = {}, TDispatchProps = {}, TOwnProps = {}>(
		mapStateToProps?: MapStateParam<TStateProps>,
		mapDispatchToProps?: MapDispatchParam<TDispatchProps, TOwnProps>,
		mergeProps?: MergePropsParam<TStateProps, TDispatchProps, TOwnProps>
	): <T>(Component: ComponentType<T>) => FunctionalComponent<TOwnProps>;
}

function assertStore(store: Store<any> | null): asserts store is Store<any>
{
	if (!store)
	{
		throw new Error('Store was not provided. Wrap your component tree in a store <Provider> and provide a valid store.');
	}
}

function incrementReducer(updateCount: number): number
{
	return updateCount + 1;
}

function defaultMergeProps(stateProps: {}, dispatchProps: {}, ownProps: {})
{
	return Object.assign({}, ownProps, stateProps, dispatchProps);
}

function dryConnect<TState = {}, TOwnProps = {}, TStateProps extends StateMap<TState, TOwnProps> = {}, TDispatchProps extends DispatchMap<TState> = {}>(
	mapStateToProps?: MapStateParam<TStateProps>,
	mapDispatchToProps?: MapDispatchParam<TDispatchProps, TOwnProps>,
	mergeProps: MergePropsParam<TStateProps, TDispatchProps, TOwnProps> = defaultMergeProps): Factory
{
	const mapDispatchUsesOwnProps = typeof mapDispatchToProps === 'function' && mapDispatchToProps.length !== 0;
	const initComponent = () => ({
		lastProps: {},
		stateChanged: Signal.create(),
		stateSelectors: typeof mapStateToProps === 'function' ? mapStateToProps() : mapStateToProps
	});

	return <T>(Component: ComponentType<T>) =>
	{
		const Connected = (ownProps: TOwnProps) =>
		{
			const store = useContext(context);
			assertStore(store);

			// memoize all the things we need for an instance at once
			const instance = useMemo(initComponent, []);

			// forces an update when needed
			const [ x, forceUpdate ] = useReducer<number, void>(incrementReducer, 0);

			// manages store subscription
			useLayoutEffect(() =>
			{
				const onUpdate = () =>
				{
					forceUpdate();
					instance.stateChanged();
				};
				Signal.on(store.stateChanged, onUpdate);
				return () => Signal.off(store.stateChanged, onUpdate);
			}, [ store ]);

			// state props change whenever store data changes and optionally
			// whenever ownProps change, if used by the mapping function
			const stateProps = (mapStateToProps
				? useMemo(
					() =>
					{
						const { stateSelectors } = instance;
						const state = store.getState();
						const props: { [key: string]: unknown } = {};

						for (const key in stateSelectors)
						{
							const selector = stateSelectors[key];
							if (selector)
							{
								props[key] = selector(state, ownProps);
							}
						}

						return props;
					},
					[ x, ownProps ])
				: {}
			) as TStateProps;

			// dispatch props change with context changes and optionally
			// whenever ownProps change, if used by the mapping function
			const dispatchProps = (mapDispatchToProps
				? useMemo(
					() => bindActionCreators(
						typeof mapDispatchToProps === 'function'
							? mapDispatchToProps(ownProps)
							: mapDispatchToProps,
						store.dispatch
					),
					mapDispatchUsesOwnProps
						? [ ownProps, store ]
						: [ store ])
				: {}
			) as BoundActionCreators<TDispatchProps>;

			// merge props will always update
			let props = mergeProps(stateProps, dispatchProps, ownProps);

			// dump the new props object if it's equal to the previous
			if (propRefsEqual(instance.lastProps, props))
			{
				props = instance.lastProps;
			}
			else
			{
				instance.lastProps = props;
			}

			// memoize the store object to avoid updating all the child subs
			// whenever this component updates
			const storeOverride = useMemo(() => ({ ...store, stateChanged: instance.stateChanged }), [ store ]);

			// memoize the output
			return useMemo(
				() => h(context.Provider, { value: storeOverride } as any, h(Component, props as any)),
				[ props, storeOverride ]);
		};

		Connected.displayName = `Connect(${Component.displayName || Component.name || ''})`;
		return Connected as FunctionalComponent<any>;
	};
}

export const connect: Connect = dryConnect;

type AnyMapStateParam = MapStateParam<any> | undefined;
type AnyMapDispatchParam = MapDispatchParam<any, any> | undefined;
type AnyMergePropsParam = MergePropsParam<any, any, any> | undefined;

type ConnectedProps<
	TOwnProps,
	TMapState extends AnyMapStateParam,
	TMapDispatch extends AnyMapDispatchParam,
	TMergeProps extends AnyMergePropsParam> =
	TMergeProps extends undefined ? (
		& TOwnProps
		& (undefined extends TMapState ? {} : (
			TMapState extends (...args: any) => any
				? { [T in keyof ReturnType<TMapState>]: ReturnType<ReturnType<TMapState>[T]> }
				: { [T in keyof TMapState]: ReturnType<TMapState[T]> }
		))
		& (undefined extends TMapDispatch ? {} : (
			TMapDispatch extends (...args: any) => any
				? { [T in keyof ReturnType<TMapDispatch>]: WithReturnType<ReturnType<TMapDispatch>[T], void> }
				: { [T in keyof TMapDispatch]: WithReturnType<TMapDispatch[T], void> }
		))
	) : ReturnType<NonNullable<TMergeProps>>;

export type UnconnectedFunctionalComponent<
	TOwnProps extends object = {},
	TMapState extends AnyMapStateParam = undefined,
	TMapDispatch extends AnyMapDispatchParam = undefined,
	TMergeProps extends AnyMergePropsParam = undefined>
	= FunctionalComponent<ConnectedProps<TOwnProps, TMapState, TMapDispatch, TMergeProps>>;

export type UFC<
	TOwnProps extends object = {},
	TMapState extends AnyMapStateParam = undefined,
	TMapDispatch extends AnyMapDispatchParam = undefined,
	TMergeProps extends AnyMergePropsParam = undefined>
	= UnconnectedFunctionalComponent<TOwnProps, TMapState, TMapDispatch, TMergeProps>;

export type UnconnectedComponent<
	TOwnProps extends object = {},
	TOwnContext extends object = {},
	TMapState extends AnyMapStateParam = undefined,
	TMapDispatch extends AnyMapDispatchParam = undefined,
	TMergeProps extends AnyMergePropsParam = undefined>
	= ClassComponent<ConnectedProps<TOwnProps, TMapState, TMapDispatch, TMergeProps>, TOwnContext>;

export type UC<
	TOwnProps extends object = {},
	TOwnContext extends object = {},
	TMapState extends AnyMapStateParam = undefined,
	TMapDispatch extends AnyMapDispatchParam = undefined,
	TMergeProps extends AnyMergePropsParam = undefined>
	= UnconnectedComponent<TOwnProps, TOwnContext, TMapState, TMapDispatch, TMergeProps>;
