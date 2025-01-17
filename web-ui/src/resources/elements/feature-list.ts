import { EventAggregator } from 'aurelia-event-aggregator';
import { transient, Disposable } from 'aurelia-framework';
import { AppService } from 'services/app-service';
import { AppEditMode, AppEventPublisher, Message, MessageState, MessageUpdate, TypeChanged } from 'types';
import dragula from 'dragula';

@transient()
export class FeatureList {

    currentFeature: any;
    entries = [];
    dragApi: any;
    subscriptions: Array<Disposable> = [];

    constructor(private appService: AppService, private eventAggregator: EventAggregator) {
    }

    bind() {
        this.entries = this.appService.sidebarLinks;

        this.subscriptions.push(this.eventAggregator.subscribe(AppEventPublisher.saveChangesCancelled, async (message: MessageUpdate) => {
            if (message.Type != TypeChanged.Feature)
                return;

            let i = this.entries.findIndex(f => f.name == message.Project);
            if (i != -1) {
                let parent = this.entries[i];
                parent.children.splice(message.ArrayIndex, 1, '');
            }            
        }));
    }

    attached() {
    }

    unbind() {
        this.subscriptions.forEach(s => s.dispose());
    }

    setupDragula() {
        this.dragApi = dragula({
            isContainer: (el: Element) => {
                if (!el) {
                    return false;
                }
                if (this.dragApi.dragging) {
                    return el.classList.contains('sortable-group');
                }

                return el.classList.contains('sortable-group');
            },
            moves: (el: Element, source: Element, handle: Element, sibling: Element) => {
                return true; // elements are always draggable by default
            },
            accepts: (el: Element, target: Element, source: Element, sibling: Element) => {
                return true;
            },
            invalid: (el: Element, handle: Element) => {
                return false; // don't prevent any drags from initiating by default
            },
            //direction: 'horizontal',
            revertOnSpill: true,
            ignoreInputTextSelection: true,
        });

        this.trackDrop(this.dragApi);
    }

    trackDrop(dragApi: any) {
        dragApi.on('drop', async (el, container, source, sibling) => {
            //console.log('drop', el, source);
        });
    }

    save() {
        this.appService.editMode = AppEditMode.Scenario;
    }

    cancel() {
        this.appService.editMode = AppEditMode.Scenario;
    }

    add(parent: any) {
        if (this.entries) {
            let i = this.entries.indexOf(parent);
            if (i != -1) {
                parent.children.splice(parent.children.length, 0, '');
            }
        }
    }

    update(index: number, parent: any, newValue: any) {
        if (!newValue || newValue == '') {
            return;
        }

        if (this.entries) {
            let i = this.entries.indexOf(parent);
            if (i != -1) {
                let oldValue = parent.children[index];

                if (oldValue == newValue) {
                    return;
                }

                parent.children.splice(index, 1, newValue);
                //this.entries.splice(i, 1, parent);

                let message: Message = new Message();
                message.ArrayIndex = index;
                message.Project = parent.name;

                let newState = !oldValue || oldValue.length == 0 ? MessageState.New : MessageState.Modified;
                this.appService.sendChangeNotification(TypeChanged.Feature, newState, newValue, oldValue, message);
            }
        }
    }

    remove(index: number, parent: any, link: any) {
        if (index !== -1) {
            let i = this.entries.indexOf(parent);
            if (i != -1) {
                let message: Message = new Message();
                message.ArrayIndex = index;
                this.appService.sendChangeNotification(TypeChanged.Feature, MessageState.Deleted, '', link, message);
                parent.children.splice(index, 1);
            }
        }
    }

}