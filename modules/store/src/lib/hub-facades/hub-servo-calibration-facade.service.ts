import { Injectable } from '@angular/core';
import {
    Observable,
    Subject,
    bufferCount,
    catchError,
    concatAll,
    concatWith,
    debounceTime,
    delay,
    distinctUntilChanged,
    finalize,
    from,
    last,
    map,
    of,
    startWith,
    switchMap,
    take,
    takeUntil
} from 'rxjs';
import { IHub, MOTOR_LIMITS, MotorServoEndState, PortModeName, ValueTransformers } from 'rxpoweredup';
import { concatLatestFrom } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { transformRelativeDegToAbsoluteDeg } from '@app/shared-misc';

import { HubStorageService } from '../hub-storage.service';
import { HubMotorPositionFacadeService } from './hub-motor-position-facade.service';
import { ATTACHED_IO_PORT_MODE_INFO_SELECTORS } from '../selectors';

class MaxDistanceReachedError extends Error {
    constructor(public readonly finalPosition: number) {
        super('Max distance reached');
    }
}

export enum CalibrationResultType {
    finished,
    error
}

export type CalibrationResultFinished = {
    type: CalibrationResultType.finished;
    aposCenter: number;
    range: number;
};

export type CalibrationResultError = {
    type: CalibrationResultType.error;
    error: Error;
};

export type CalibrationResult = CalibrationResultFinished | CalibrationResultError;

@Injectable()
export class HubServoCalibrationFacadeService {
    private readonly singleProbeTimeoutMs = 500;

    private readonly maxRange = MOTOR_LIMITS.maxServoDegreesRange * 2;

    // used to compensate possible encoder jitter
    private readonly calibrationPositionMinimumThreshold = ValueTransformers.position.toValueThreshold(2);

    constructor(
        private readonly hubStorage: HubStorageService,
        private readonly motorPositionFacade: HubMotorPositionFacadeService,
        private readonly store: Store
    ) {
    }

    public calibrateServo(
        hubId: string,
        portId: number,
        speed: number,
        power: number,
        calibrationRuns: number = 1
    ): Observable<CalibrationResult> {
        return new Observable<CalibrationResult>((subscriber) => {
            const cancel$ = new Subject<void>();
            this.doCalibration(hubId, portId, speed, power, calibrationRuns).pipe(
                takeUntil(cancel$),
                catchError((error) => {
                    console.warn('Calibration error', error);
                    return of({
                        type: CalibrationResultType.error,
                        error
                    } satisfies CalibrationResultError);
                })
            ).subscribe(subscriber);

            return () => {
                cancel$.next();
                cancel$.complete();
            };
        });
    }

    private doCalibration(
        hubId: string,
        portId: number,
        speed: number,
        power: number,
        calibrationRuns: number,
    ): Observable<CalibrationResultFinished> {
        return this.getPreCalibrationData(hubId, portId).pipe(
            switchMap(({ startAbsolutePosition, startRelativePosition, positionModeId }) => {
                return this.getServoRange(hubId, portId, positionModeId, speed, power, calibrationRuns).pipe(
                    map((result) => {
                        return this.calculateServoCalibrationResults(
                            result.ccwProbeResult,
                            result.cwProbeResult,
                            startRelativePosition,
                            startAbsolutePosition
                        );
                    }),
                );
            }),
            switchMap((data) => this.finalizeCalibration(hubId, portId, speed, power, data.arcCenterPosition).pipe(
                map(() => {
                    const result: CalibrationResultFinished = {
                        type: CalibrationResultType.finished,
                        aposCenter: data.arcCenterAbsolutePosition,
                        range: data.servoRange
                    };
                    return result;
                })
            ))
        );
    }

    private getPreCalibrationData(
        hubId: string,
        portId: number,
    ): Observable<{ startRelativePosition: number; startAbsolutePosition: number; positionModeId: number }> {
        return this.motorPositionFacade.getMotorPosition(hubId, portId).pipe(
            concatWith(this.motorPositionFacade.getMotorAbsolutePosition(hubId, portId)),
            bufferCount(2),
            concatLatestFrom(() =>
                this.store.select(ATTACHED_IO_PORT_MODE_INFO_SELECTORS.selectHubPortInputModeForPortModeName({
                    hubId, portId, portModeName: PortModeName.position
                }))
            ),
            map(([[ startRelativePosition, startAbsolutePosition ], positionModeInfo]) => {
                if (positionModeInfo === null) {
                    throw new Error('Position mode not found');
                }
                return { startRelativePosition, startAbsolutePosition, positionModeId: positionModeInfo.modeId };
            }),
            take(1)
        );
    }

    private finalizeCalibration(
        hubId: string,
        portId: number,
        speed: number,
        power: number,
        finalPosition: number
    ): Observable<unknown> {
        const hub = this.getHub(hubId);
        return hub.motors.goToPosition(portId, finalPosition, { speed, power, endState: MotorServoEndState.hold }).pipe(
            last(),
            // delay is necessary to ensure the motor is stabilized before the next command is sent
            delay(500),
            concatWith(hub.motors.goToPosition(portId, finalPosition, { speed, power, endState: MotorServoEndState.float })),
            last(),
        );
    }

    private getServoRange(
        hubId: string,
        portId: number,
        positionPortModeId: number,
        speed: number,
        power: number,
        calibrationRuns: number
    ): Observable<{ ccwProbeResult: number; cwProbeResult: number }> {
        const hub = this.hubStorage.get(hubId);

        const probes: Array<Observable<number>> = [];
        for (let i = 0; i < calibrationRuns; i++) {
            probes.push(this.probeDirectionLimit(hub, portId, -speed, power, i === 0 ? this.maxRange : this.maxRange * 2, positionPortModeId));
            probes.push(this.probeDirectionLimit(hub, portId, speed, power, this.maxRange * 2, positionPortModeId));
        }

        return from(probes).pipe(
            concatAll(),
            bufferCount(2 * calibrationRuns),
            map((results) => {
                const ccwProbeResults = results.filter((_, i) => i % 2 === 0);
                const cwProbeResults = results.filter((_, i) => i % 2 === 1);
                return {
                    ccwProbeResult: Math.max(...ccwProbeResults),
                    cwProbeResult: Math.min(...cwProbeResults)
                };
            })
        );
    }

    /**
     * Probes the servo in a given direction until the motor reaches the limit or the maximum distance is reached.
     * Approach with setSpeed is used instead of goToPosition since the former is much faster.
     */
    private probeDirectionLimit(
        hub: IHub,
        portId: number,
        speed: number,
        power: number,
        maxDistance: number,
        positionModeId: number
    ): Observable<number> {
        return new Observable((subscriber) => {
            const speedSubscription = hub.motors.startSpeed(portId, speed, {power}).subscribe();

            // TODO: use motorPositionFacade
            const positionSubscription = hub.ports.getPortValue(portId, positionModeId).pipe(
                map((value) => ValueTransformers.position.fromRawValue(value)),
                switchMap((startPosition) => hub.ports.portValueChanges(portId, positionModeId, this.calibrationPositionMinimumThreshold).pipe(
                    map((value) => ValueTransformers.position.fromRawValue(value)),
                    startWith(startPosition),
                    map((currentPosition) => ({ currentPosition, distance: Math.abs(currentPosition - startPosition)}))
                )),
                map(({ currentPosition, distance }) => {
                    if (distance >= maxDistance) {
                        throw new MaxDistanceReachedError(currentPosition);
                    }
                    return currentPosition;
                }),
                distinctUntilChanged(),
                debounceTime(this.singleProbeTimeoutMs),
                take(1),
                finalize(() => hub.motors.startSpeed(portId, 0, {power: 0}).subscribe())
            ).subscribe({
                next: (result) => {
                    subscriber.next(result);
                    subscriber.complete();
                },
                error: (error) => {
                    if (error instanceof MaxDistanceReachedError) {
                        subscriber.next(error.finalPosition);
                        subscriber.complete();
                    } else {
                        subscriber.error(error);
                    }
                }
            });

            return () => {
                speedSubscription.unsubscribe();
                positionSubscription.unsubscribe();
            };
        });
    }

    private calculateServoCalibrationResults(
        ccwProbeResult: number,
        cwProbeResult: number,
        startRelativePosition: number,
        startAbsolutePosition: number
    ): { servoRange: number; arcCenterPosition: number; arcCenterAbsolutePosition: number } {
        const encoderOffset = startAbsolutePosition - startRelativePosition;
        const ccwDistanceFromStartPosition = startRelativePosition - ccwProbeResult;
        const cwDistanceFromStartPosition = cwProbeResult - startRelativePosition;

        const arcCenterPosition = Math.round((ccwProbeResult + cwProbeResult) / 2);
        const servoRange = Math.round(Math.abs(ccwDistanceFromStartPosition + cwDistanceFromStartPosition));
        const arcCenterAbsolutePosition = Math.round(transformRelativeDegToAbsoluteDeg(arcCenterPosition + encoderOffset));

        return {
            servoRange: servoRange > MOTOR_LIMITS.maxServoDegreesRange ? MOTOR_LIMITS.maxServoDegreesRange : servoRange,
            arcCenterPosition,
            arcCenterAbsolutePosition
        };
    }

    private getHub(
        hubId: string
    ): IHub {
        const hub = this.hubStorage.get(hubId);
        if (!hub) {
            throw new Error('Hub not found');
        }
        return hub;
    }
}
