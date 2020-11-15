import { autoinject, bindable, observable, BindingEngine, Disposable, ICollectionObserverSplice } from 'aurelia-framework';
import { ColumnApi, GridApi, GridOptions, RowNode } from 'ag-grid-community';
import { EventAggregator } from 'aurelia-event-aggregator';
import { BackendService } from 'services/backend-service';
import { Message, AppEventPublisher, AppEditMode, TypeChanged, MessageState, MessageUpdate } from 'types';
import { AppService } from 'services/app-service';

@autoinject()
export class TestList {

    subscriptions: Array<Disposable> = [];
    private gridOptions: GridOptions;
    private api: GridApi;
    private columnApi: ColumnApi;

    @bindable()
    entries: Array<Message> = [];

    @bindable()
    currEntry: Message = null;

    @bindable()
    searchValue: string;

    constructor(private eventAggregator: EventAggregator, private bindingEngine: BindingEngine, private appService: AppService, private backendService: BackendService) {
        this.gridOptions = <GridOptions>{
            defaultColDef: {
                resizable: true,
                sortable: true,
                editable: true
            }
        };
    }

    bind() {
        this.subscriptions.push(this.eventAggregator.subscribe(AppEventPublisher.onNewScenario, (scenario: Message) => {
            this.entries.splice(this.entries.length, 0, scenario);
            this.listChanged();
            this.focusRow(this.entries.length - 1);
            scenario.ArrayIndex = this.entries.length - 1;

            this.appService.sendChangeNotification(TypeChanged.ScenarioName, MessageState.New, scenario.Scenario, null, scenario);
        }));

        this.subscriptions.push(this.eventAggregator.subscribe(AppEventPublisher.onDeleteScenario, (scenario: Message) => {
            scenario.ArrayIndex = this.entries.indexOf(scenario);
            this.appService.sendChangeNotification(TypeChanged.ScenarioName, MessageState.Deleted, null, scenario.Scenario, scenario);
        }));

        this.subscriptions.push(this.eventAggregator.subscribe(AppEventPublisher.saveChangesOK, async (message: MessageUpdate) => {
            if (Number.isInteger(message.ArrayIndex) !== true || message.ArrayIndex < 0) {
                return;
            }

            console.log('saveChangesOK', message);
            if (message.Type == TypeChanged.ScenarioName && message.State == MessageState.Deleted) {
                this.entries.splice(message.ArrayIndex, 1);
                this.listChanged();
                this.focusRow(message.ArrayIndex - 1);
            } else {
                let entry = this.entries[message.ArrayIndex];
                if (entry && (!entry.FsPath || entry.FsPath == '')) {
                    entry.FsPath = message.FsPath;
                    this.entries.splice(message.ArrayIndex, 1, entry);
                }
            }
        }));


        this.subscriptions.push(this.eventAggregator.subscribe(AppEventPublisher.appMainColumnsResized, response => {
            this.api.sizeColumnsToFit();
        }));

        this.subscriptions.push(this.eventAggregator.subscribe(AppEventPublisher.selectedEntryEdited, entry => {
            console.log('test-list selectedEntryEdited', entry, this.entries);
            if (entry) {
                let currNode = this.api.getSelectedNodes()[0];
                if (currNode) {
                    currNode.setData(entry);
                    this.api.refreshCells({ rowNodes: [currNode] });
                }
            }
        }));


        this.subscriptions.push(this.eventAggregator.subscribe(AppEventPublisher.export, response => {
            this.backendService.send({ Command: 'Export', Data: this.entries });
        }));

        this.subscriptions.push(this.bindingEngine.collectionObserver(this.entries).subscribe(this.listChanged.bind(this)));
    }

    unbind() {
        this.subscriptions.forEach(s => s.dispose());
    }

    attached() {
        //this.gridOptions.rowHeight = 40; TODO
        this.gridOptions.onGridReady = () => {
            this.api = this.gridOptions.api;
            this.columnApi = this.gridOptions.columnApi;
            this.columnApi.setColumnVisible('Project', false);
            this.api.sizeColumnsToFit();
            this.appService.gridApi = this.api;
        };
    }

    detached() {

    }

    focusRow(rowIndex: number) {
        if (this.api.getInfiniteRowCount() < rowIndex) {
            this.api.setInfiniteRowCount(rowIndex, false);
        }
        this.api.ensureIndexVisible(rowIndex);
        this.api.selectIndex(rowIndex, false, false);
        this.selectionChanged();
    }

    listChanged(splices?: Array<ICollectionObserverSplice<any>>) {
        this.api.setRowData(this.entries);
        let projects = [...new Set(this.entries.map(item => item.Project))];
        this.columnApi.setColumnVisible('Project', projects.length > 1);
        this.appService.updateSidebarLinks(this.entries);
        this.appService.entries = this.entries;
    }

    selectionChanged() {
        let data = this.api.getSelectedRows();
        this.currEntry = data[0];
        this.appService.selectedEntry = this.currEntry;
        console.log('Selection changed', this.currEntry);
    }

    async sendCommand(entry: any, type: string) {
        await this.backendService.send({ Command: type, Data: entry });
    }

    searchValueChanged() {
        this.api.setQuickFilter(this.searchValue);
    }

}
