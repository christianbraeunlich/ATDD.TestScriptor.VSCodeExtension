import { AppService } from './services/app-service';
import { BackendService } from 'services/backend-service';
import { autoinject, observable, Disposable, PLATFORM } from 'aurelia-framework';
import { EventAggregator } from 'aurelia-event-aggregator';
import "jquery";
import "bootstrap";
import Split from 'split.js'
import { AppEditMode, MessageUpdate, Message, AppEventPublisher } from 'types';
(<any>PLATFORM.global).process = { env: { NODE_ENV: 'production' } };

@autoinject()
export class App {
  subscriptions: Array<Disposable> = [];

  @observable()
  entries: Array<Message> = [];

  @observable()
  sidebarLinks: Array<any> = [];

  @observable()
  selectedLink: string = 'All';

  @observable()
  currEntry: any;

  @observable()
  searchValue: string = '';

  @observable
  editMode: AppEditMode;

  options: any;

  constructor(private appService: AppService, private backendService: BackendService, private eventAggregator: EventAggregator) {
    this.backendService.determineType();
    this.options = this.backendService.startup.options;

    this.subscriptions.push(this.eventAggregator.subscribe(AppEventPublisher.sidebarLinksUpdated, response => {
      this.sidebarLinks = this.appService.sidebarLinks;
    }));

    this.subscriptions.push(this.eventAggregator.subscribe(AppEventPublisher.refresh, response => {
      this.init();
    }));

    this.subscriptions.push(this.eventAggregator.subscribe(AppEventPublisher.saveChanges, async (message: MessageUpdate) => {
      let result = await this.backendService.send({ Command: 'SaveChanges', Data: message });
      let userCancelledSaving: boolean = result.success === false;
      console.log('saveChanges', result, userCancelledSaving);
      this.appService.loading = false;
      if (userCancelledSaving === true) {
        this.eventAggregator.publish(AppEventPublisher.saveChangesCancelled, message);
      } else {
        message.FsPath = result.fsPath;
        message.MethodName = result.methodName;
        this.eventAggregator.publish(AppEventPublisher.saveChangesOK, message);
      }
    }));

  }

  async attached() {
    await this.init();

    Split(['#test-col-1', '#test-col-2'], {
      sizes: [60, 40],
      gutterSize: 3,
      onDragEnd: e => {
        this.eventAggregator.publish(AppEventPublisher.appMainColumnsResized);
      }
    });

    window.addEventListener('resize', e => {
      this.eventAggregator.publish(AppEventPublisher.appMainColumnsResized);
    });

    window.addEventListener('message', e => {
      if (!e.data)
        return;

      if (e.data.Command == 'LoadTests') {
        this.entries = [];
        this.entries = e.data.Data;
        this.appService.entries = this.entries;
        //console.log('entries updated', e.data.Data);
      }
    });
  }

  async init() {
    this.entries = await this.backendService.send({ Command: 'LoadTests' });

    this.appService.updateSidebarLinks(this.entries);
    this.appService.entries = this.entries;
  }


  detached() {
  }
}
