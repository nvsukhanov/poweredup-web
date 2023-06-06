import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgIf } from '@angular/common';
import { HubInlineViewComponent } from '../../../../common';
import { ControlSchemeViewHubTreeNode } from '../../../../store';

@Component({
    standalone: true,
    selector: 'app-hub-tree-node',
    templateUrl: './hub-tree-node.component.html',
    styleUrls: [ './hub-tree-node.component.scss' ],
    imports: [
        NgIf,
        HubInlineViewComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class HubTreeNodeComponent {
    @Input() public hub?: ControlSchemeViewHubTreeNode;
}
