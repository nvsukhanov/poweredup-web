import { Inject, Injectable, InjectionToken } from '@angular/core';
import { ControllerAxesState, ControllerButtonsState, GamepadControllerConfig, IState } from '../i-state';
import { Store } from '@ngrx/store';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { ACTION_CONTROLLER_READ, ACTIONS_CONFIGURE_CONTROLLER } from '../actions';
import { animationFrameScheduler, filter, fromEvent, interval, map, NEVER, Observable, switchMap, withLatestFrom } from 'rxjs';
import { ExtractTokenType, WINDOW } from '../../types';
import { SELECTED_GAMEPAD_INDEX } from '../controller-selectors';

export interface IGamepadMapper {
    mapGamepadToConfig(gamepad: Gamepad): GamepadControllerConfig | null;
}

export const GAMEPAD_MAPPER = new InjectionToken<IGamepadMapper>('GAMEPAD_MAPPER');

@Injectable()
export class ConfigureControllerEffects {
    public readonly readGamepad$ = createEffect(() => this.actions$.pipe(
        ofType(ACTIONS_CONFIGURE_CONTROLLER.gamepadConnected, ACTIONS_CONFIGURE_CONTROLLER.disconnectGamepad),
        withLatestFrom(this.store.select(SELECTED_GAMEPAD_INDEX)),
        switchMap(([ e, index ]) => e.type === ACTIONS_CONFIGURE_CONTROLLER.gamepadConnected.type
                                    ? interval(0, animationFrameScheduler).pipe(map(() => index))
                                    : NEVER
        ),
        filter((index) => index !== null),
        map((index) => {
            const gamepad = this.window.navigator.getGamepads()[index as number]; // TODO: get rid of null & remove casts
            if (!gamepad) {
                return ACTIONS_CONFIGURE_CONTROLLER.disconnectGamepad({ index: index as number });
            }
            const buttons: ControllerButtonsState = gamepad.buttons.reduce((acc, val, index) => {
                return {
                    ...acc,
                    [index]: {
                        value: Math.round(val.value * 100),
                        index: index
                    }
                }
            }, {} as ControllerButtonsState);

            const axes: ControllerAxesState = gamepad.axes.reduce((acc, val, index) => {
                return {
                    ...acc,
                    [index]: {
                        value: Math.round(val * 100),
                        index: index
                    }
                }
            }, {} as ControllerAxesState);
            return ACTION_CONTROLLER_READ({ axes, buttons });
        })
    ));

    public readonly startGamepadListening$ = createEffect(() => this.actions$.pipe(
        ofType(
            ACTIONS_CONFIGURE_CONTROLLER.listenForGamepad,
            ACTIONS_CONFIGURE_CONTROLLER.cancelListeningForGamepad,
            ACTIONS_CONFIGURE_CONTROLLER.gamepadConnected
        ),
        switchMap((e) => e.type === ACTIONS_CONFIGURE_CONTROLLER.listenForGamepad.type ? interval(0, animationFrameScheduler) : NEVER),
        map(() => this.window.navigator.getGamepads().find((g) => !!g)),
        filter((g) => !!g),
        map((e) => {
            for (const mapper of this.gamepadMappers) {
                const result = mapper.mapGamepadToConfig(e as Gamepad);
                if (result) {
                    return result;
                }
            }
            throw new Error(`unsupported gamepad ${e}`);
        }),
        map((gamepad) => ACTIONS_CONFIGURE_CONTROLLER.gamepadConnected({ gamepad })), // TODO: handle error
    ));

    private readonly gamepadConnectedEvent = 'gamepadconnected';
    private readonly gamepadDisconnectedEvent = 'gamepaddisconnected';

    public readonly listenToGamepadDisconnects$ = createEffect(() => this.actions$.pipe(
        ofType(ACTIONS_CONFIGURE_CONTROLLER.gamepadConnected, ACTIONS_CONFIGURE_CONTROLLER.gamepadDisconnected),
        switchMap((e) => e.type === ACTIONS_CONFIGURE_CONTROLLER.gamepadDisconnected.type
                         ? fromEvent(this.window, this.gamepadDisconnectedEvent) as Observable<GamepadEvent>
                         : NEVER
        ),
        map((e: GamepadEvent) => ACTIONS_CONFIGURE_CONTROLLER.disconnectGamepad({ index: e.gamepad.index }))
    ));

    constructor(
        private readonly actions$: Actions,
        private readonly store: Store<IState>,
        @Inject(WINDOW) private readonly window: Window,
        @Inject(GAMEPAD_MAPPER) private gamepadMappers: ReadonlyArray<ExtractTokenType<typeof GAMEPAD_MAPPER>>
    ) {
    }
}
