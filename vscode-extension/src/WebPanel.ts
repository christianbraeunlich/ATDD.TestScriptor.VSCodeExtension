import { CommandHandlerService } from './Services/CommandHandlerService';
import * as vscode from 'vscode';
import * as path from 'path';
import * as utils from './utils';
import { IMessageBase } from './typings/IMessageBase';
import { LoadProjectsCommand } from './Commands/LoadProjectsCommand';

export class WebPanel {

    public static instance: WebPanel;

    protected panel!: vscode.WebviewPanel;

    protected extensionPath: string = '';

    private _disposables: vscode.Disposable[] = [];

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
    }

    async createPanel() {
        this.panel = vscode.window.createWebviewPanel("attTestScriptor", "Test Scenarios", vscode.ViewColumn.One, {
            // Enable javascript in the webview
            enableScripts: true,
            enableFindWidget: true,
            retainContextWhenHidden: true,

            localResourceRoots: [
                vscode.Uri.file(path.join(this.extensionPath, 'WebView')),
                vscode.Uri.file(path.join(this.extensionPath, 'WebView', 'scripts'))
            ]
        });

        this.panel.webview.html = await this._getHtmlForWebview();

        // events
        this.panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(async (messages: Array<IMessageBase>) => {
            let handler: CommandHandlerService = new CommandHandlerService(this.extensionPath);

            for (let message of messages) {
                await handler.dispatch(message);
            }
        }, null, this._disposables);

        let command = new LoadProjectsCommand();
        await command.execute({Command: 'LoadProjects'});
    }

    public static async open(extensionPath: string) {
        if (WebPanel.instance) {
            WebPanel.instance.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        let instance = new WebPanel(extensionPath);
        WebPanel.instance = instance;
        await instance.createPanel();        
    }

    public static async postMessage(message: any) {
        await WebPanel.instance.postMessage(message);
    }

    public async postMessage(message: any) {
        await this.panel.webview.postMessage(message);
    }

    private async _getHtmlForWebview() {
        let content: string = await utils.read(path.join(this.extensionPath, 'WebView', 'index.html'));
        let appOnDiskPath = vscode.Uri.file(path.join(this.extensionPath, 'WebView', 'scripts', 'vendor-bundle.js'));
        let appJsSrc: any = appOnDiskPath.with({ scheme: 'vscode-resource' });
        content = content.replace('scripts/vendor-bundle.js', appJsSrc);

        return content;
    }

    public dispose() {
        (WebPanel.instance as any) = null;

        // Clean up our resources
        this.panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}