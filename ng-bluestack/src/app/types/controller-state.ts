export type ControllerState = ControllerButtonState | ControllerAxisState;

export type ControllerButtonState = {
    readonly index: number;
    readonly value: number;
}

export type ControllerAxisState = {
    readonly index: number;
    readonly value: number;
}
