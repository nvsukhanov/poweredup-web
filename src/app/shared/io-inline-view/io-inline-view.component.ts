import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IOType } from '@nvsukhanov/rxpoweredup';
import { TranslocoModule } from '@ngneat/transloco';
import { NgIf } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';

import { EllipsisTitleDirective } from '../ellipsis-title.directive';
import { IoTypeToL10nKeyPipe } from '../io-type-to-l10n-key.pipe';
import { HubConnectionState } from '../../store';

@Component({
    standalone: true,
    selector: 'app-io-inline-view',
    templateUrl: './io-inline-view.component.html',
    styleUrls: [ './io-inline-view.component.scss' ],
    imports: [
        TranslocoModule,
        NgIf,
        IoTypeToL10nKeyPipe,
        EllipsisTitleDirective,
        MatFormFieldModule,
        MatIconModule
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class IoInlineViewComponent {
    @Input() public portId: number | null = null;

    @Input() public ioType: IOType | null = null;

    @Input() public isConnected: boolean | null = null;

    protected readonly HubConnectionState = HubConnectionState;
}
