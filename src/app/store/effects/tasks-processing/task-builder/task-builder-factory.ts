import { ITaskBuilder } from '../i-task-builder';
import { SetSpeedTaskBuilder } from './set-speed-task-builder';
import { ServoTaskBuilder } from './servo-task-builder';
import { SetAngleTaskBuilder } from './set-angle-task-builder';
import { StepperTaskBuilder } from './stepper-task-builder';
import { SpeedStepperTaskBuilder } from './speed-stepper-task-builder';

export function taskBuilderFactory(): ITaskBuilder {
    const setSpeedTaskBuilder = new SetSpeedTaskBuilder();
    const servoTaskBuilder = new ServoTaskBuilder();
    const setTaskBuilder = new SetAngleTaskBuilder();
    const stepperTaskBuilder = new StepperTaskBuilder();
    const speedStepperTaskBuilder = new SpeedStepperTaskBuilder();
    setSpeedTaskBuilder.setNext(servoTaskBuilder)
                       .setNext(setTaskBuilder)
                       .setNext(stepperTaskBuilder)
                       .setNext(speedStepperTaskBuilder);
    return setSpeedTaskBuilder;
}
