import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgForOf, NgIf } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoModule } from '@ngneat/transloco';
import { BindingTypeToL10nKeyPipe, ControlSchemeBindingType } from '@app/shared';

import { BindingEditAvailableOperationModesModel } from '../types';

@Component({
    standalone: true,
    selector: 'app-binding-select-operation-mode',
    templateUrl: './binding-control-select-operation-mode.component.html',
    styleUrls: [ './binding-control-select-operation-mode.component.scss' ],
    imports: [
        NgIf,
        BindingTypeToL10nKeyPipe,
        MatFormFieldModule,
        MatOptionModule,
        MatSelectModule,
        NgForOf,
        TranslocoModule,
        ReactiveFormsModule
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BindingControlSelectOperationModeComponent implements OnChanges {
    @Input() public availabilityData: BindingEditAvailableOperationModesModel = {};

    @Input() public control?: FormControl<ControlSchemeBindingType>;

    public readonly availableOperationTypes = Object.values(ControlSchemeBindingType) as ReadonlyArray<ControlSchemeBindingType>;

    public ngOnChanges(): void {
        if (this.control && this.control.value !== null && !this.availabilityData[this.control.value]) {
            const availableOpts = this.availableOperationTypes.filter((opt) => this.availabilityData[opt]);
            if (availableOpts.length > 0) {
                this.control.setValue(availableOpts[0]);
                this.control.updateValueAndValidity();
            } else {
                this.control.reset();
            }
        }
    }
}
