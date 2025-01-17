import { readFileSync } from 'fs-extra';
import { commands, CompletionItem, CompletionItemKind, CompletionList, Position, Range, RelativePattern, TextDocument, Uri, workspace, WorkspaceEdit, WorkspaceFolder } from 'vscode';
import { TypeChanged } from '../../typings/types';
import { ALFullSyntaxTreeNodeExt } from '../AL Code Outline Ext/alFullSyntaxTreeNodeExt';
import { FullSyntaxTreeNodeKind } from '../AL Code Outline Ext/fullSyntaxTreeNodeKind';
import { SyntaxTreeExt } from '../AL Code Outline Ext/syntaxTreeExt';
import { TextRangeExt } from '../AL Code Outline Ext/textRangeExt';
import { ALFullSyntaxTreeNode } from '../AL Code Outline/alFullSyntaxTreeNode';
import { SyntaxTree } from '../AL Code Outline/syntaxTree';
import { Config } from './config';
import { ElementUtils } from './elementUtils';
import { RangeUtils } from './rangeUtils';
import { TestMethodUtils } from './testMethodUtils';

export class TestCodeunitUtils {
    public static async getTestUrisOfDirectories(paths: string[]): Promise<Uri[]> {
        let alUris: Uri[] = await TestCodeunitUtils.getUniqueALFileUris(paths);
        let testUris: Uri[] = [];
        let checkUriPromiseArr: Promise<{ uri: Uri, isTestCodeunit: boolean }>[] = [];
        for (let i = 0; i < alUris.length; i++) {
            checkUriPromiseArr.push(this.checkIfUriIsTestCodeunit(alUris[i]));
            if (checkUriPromiseArr.length > 100) {
                testUris = testUris.concat(await this.resolvePromiseSAndReturnTestUris(checkUriPromiseArr))
                checkUriPromiseArr = []
            }
        }
        testUris = testUris.concat(await this.resolvePromiseSAndReturnTestUris(checkUriPromiseArr))
        checkUriPromiseArr = []
        return testUris;
    }
    private static async getUniqueALFileUris(paths: string[]): Promise<Uri[]> {
        let alUris: Uri[] = [];
        let alFilePaths: string[] = [];
        for (let i = 0; i < paths.length; i++) {
            let alFileUrisOfWorkspaceFolder: Uri[] = await workspace.findFiles(new RelativePattern(paths[i], '**/*.al'));
            for (const alFileUri of alFileUrisOfWorkspaceFolder)
                if (!alFilePaths.includes(alFileUri.path)) {
                    alFilePaths.push(alFileUri.path);
                    alUris.push(alFileUri);
                }
        }
        return alUris;
    }

    private static async checkIfUriIsTestCodeunit(uri: Uri): Promise<{ uri: Uri, isTestCodeunit: boolean }> {
        let regex: RegExp = /^.*codeunit \d+.*Subtype\s+=\s+Test;.*/is;
        let fileContent: string = readFileSync(uri.fsPath, { encoding: 'utf8', flag: 'r' });
        let isTestCodeunit: boolean = regex.test(fileContent);
        return { uri: uri, isTestCodeunit: isTestCodeunit };
    }
    private static async resolvePromiseSAndReturnTestUris(checkUriPromiseArr: Promise<{ uri: Uri; isTestCodeunit: boolean; }>[]): Promise<Uri[]> {
        let checkUriResults: { uri: Uri, isTestCodeunit: boolean }[] = await Promise.all(checkUriPromiseArr);
        return checkUriResults.filter(checkUriResult => checkUriResult.isTestCodeunit).map(checkUriResult => checkUriResult.uri);
    }
    public static async getTestMethodsOfDocument(document: TextDocument): Promise<ALFullSyntaxTreeNode[]> {
        let syntaxTree: SyntaxTree = await SyntaxTree.getInstance(document);
        let methods: ALFullSyntaxTreeNode[] = syntaxTree.collectNodesOfKindXInWholeDocument(FullSyntaxTreeNodeKind.getMethodDeclaration());
        let testMethods: ALFullSyntaxTreeNode[] = [];
        for (let i = 0; i < methods.length; i++) {
            let memberAttributes: ALFullSyntaxTreeNode[] = [];
            ALFullSyntaxTreeNodeExt.collectChildNodes(methods[i], FullSyntaxTreeNodeKind.getMemberAttribute(), false, memberAttributes);
            if (memberAttributes.some(attribute => document.getText(TextRangeExt.createVSCodeRange(attribute.fullSpan)).trim().toLowerCase().includes('[test]'))) {
                testMethods.push(methods[i]);
            }
        }
        return testMethods;
    }
    static async getObjectName(document: TextDocument, somePositionInsideObject: Position): Promise<string> {
        let syntaxTree: SyntaxTree = await SyntaxTree.getInstance(document);
        let objectTreeNode: ALFullSyntaxTreeNode = SyntaxTreeExt.getObjectTreeNodeUnsafe(syntaxTree, somePositionInsideObject);
        return ALFullSyntaxTreeNodeExt.findIdentifierAndGetValueOfTreeNode(document, objectTreeNode).replace(/"/g, '');
    }
    public static async getAppNameOfDocument(document: TextDocument): Promise<string> {
        let workspaceFolder: WorkspaceFolder | undefined = workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            throw new Error('File should be inside a workspace');
        }
        let appUris: Uri[] = await workspace.findFiles(new RelativePattern(workspaceFolder, 'app.json'));
        if (appUris.length == 1) {
            let appDoc: TextDocument = await workspace.openTextDocument(appUris[0]);
            let appJson = JSON.parse(appDoc.getText());
            return appJson.name;
        }
        return '';
    }
    static async addProcedure(edit: WorkspaceEdit, document: TextDocument, procedureName: string) {
        if (await this.isProcedureAlreadyDeclared(document, procedureName, []))
            return;
        await this.addProcedureWithSpecificHeader(edit, document, procedureName, '    local procedure ' + procedureName + "()");
    }
    static async addProcedureWithSpecificHeader(edit: WorkspaceEdit, document: TextDocument, procedureNameOnly: string, procedureHeader: string) {
        let syntaxTree: SyntaxTree = await SyntaxTree.getInstance(document);
        let methodTreeNodes: ALFullSyntaxTreeNode[] = syntaxTree.collectNodesOfKindXInWholeDocument(FullSyntaxTreeNodeKind.getMethodDeclaration());
        if (methodTreeNodes.length > 0) {
            let lastRange: Range = RangeUtils.trimRange(document, TextRangeExt.createVSCodeRange(methodTreeNodes[methodTreeNodes.length - 1].fullSpan));
            let textToAdd: string = '\r\n\r\n';
            textToAdd += procedureHeader + '\r\n';
            textToAdd += '    begin\r\n';
            if (Config.getAddException(document.uri))
                textToAdd += '        Error(\'Procedure ' + procedureNameOnly + ' not yet implemented.\');\r\n';
            textToAdd += '    end;'
            edit.insert(document.uri, lastRange.end, textToAdd);
        }
    }
    static deleteProcedure(edit: WorkspaceEdit, uri: Uri, methodTreeNode: ALFullSyntaxTreeNode) {
        let rangeToDelete = TextRangeExt.createVSCodeRange(methodTreeNode.fullSpan);
        edit.delete(uri, rangeToDelete);
    }

    public static async getProcedureDeclarations(document: TextDocument): Promise<Map<string, Array<string[]>>> {
        // Map: Key = Procedurename, Values: Parameters
        let procedureDeclarations: Map<string, Array<string[]>> = new Map();
        let syntaxTree: SyntaxTree = await SyntaxTree.getInstance(document);
        let methodTreeNodes: ALFullSyntaxTreeNode[] = syntaxTree.collectNodesOfKindXInWholeDocument(FullSyntaxTreeNodeKind.getMethodDeclaration());
        if (methodTreeNodes.length > 0) {
            for (let i = 0; i < methodTreeNodes.length; i++) {
                let methodName = ALFullSyntaxTreeNodeExt.findIdentifierAndGetValueOfTreeNode(document, methodTreeNodes[i]);
                if (!procedureDeclarations.get(methodName))
                    procedureDeclarations.set(methodName, []);
                let implementationsOfProcedure: Array<string[]> = procedureDeclarations.get(methodName) as Array<string[]>;
                let parameterTypesOfMethod: string[] = TestMethodUtils.getParameterTypesOfMethod(methodTreeNodes[i], document);
                implementationsOfProcedure.push(parameterTypesOfMethod);
                procedureDeclarations.set(methodName, implementationsOfProcedure);
            }
        }
        return procedureDeclarations;
    }

    public static async isProcedureOfElementAlreadyDeclared(document: TextDocument, elementType: TypeChanged, elementName: string, parameterTypesToSearch: string[]): Promise<{ alreadyDeclared: boolean, procedureName: string }> {
        let newProcedureName: string = TestMethodUtils.getProcedureName(elementType, elementName);
        let procedureAlreadyDeclared: boolean = await TestCodeunitUtils.isProcedureAlreadyDeclared(document, newProcedureName, parameterTypesToSearch)
        if (!procedureAlreadyDeclared) {
            let possibleProcedureNamesHistorical: string[] = TestMethodUtils.getProcedureNameHistory(elementType, elementName);
            for (const possibleProcedureNameHistorical of possibleProcedureNamesHistorical) {
                if (await TestCodeunitUtils.isProcedureAlreadyDeclared(document, possibleProcedureNameHistorical, parameterTypesToSearch)) {
                    newProcedureName = possibleProcedureNameHistorical
                    procedureAlreadyDeclared = true
                    break
                }
            }
        }
        return { alreadyDeclared: procedureAlreadyDeclared, procedureName: newProcedureName };
    }
    public static async isProcedureAlreadyDeclared(document: TextDocument, procedureNameToSearch: string, parameterTypesToSearch: string[]): Promise<boolean> {
        let procedureDeclarations: Map<string, Array<string[]>> = await this.getProcedureDeclarations(document);
        let procedureNameExisting: string | undefined = Array.from(procedureDeclarations.keys()).find(procedureName => procedureName.toLowerCase() == procedureNameToSearch.toLowerCase());
        if (!procedureNameExisting)
            return false;
        else {
            let implementations: Array<string[]> = procedureDeclarations.get(procedureNameExisting) as Array<string[]>;
            let existsWithSameTypes: boolean = implementations.some(parameterTypes => {
                if (parameterTypes.length != parameterTypesToSearch.length)
                    return false;
                else {
                    for (let i = 0; i < parameterTypes.length; i++) {
                        if (parameterTypes[i].toLowerCase().trim() != parameterTypesToSearch[i].toLowerCase().trim())
                            return false;
                    }
                }
                return true;
            });
            return existsWithSameTypes;
        }
    }
    public static async isProcedureAlreadyDeclaredRegardlesOfParametersGenerally(document: TextDocument, procedureNameToSearch: string): Promise<boolean> {
        let procedureDeclarations: Map<string, Array<string[]>> = await this.getProcedureDeclarations(document);
        let procedureNameExisting: boolean = Array.from(procedureDeclarations.keys()).some(procedureName => procedureName.toLowerCase() == procedureNameToSearch.toLowerCase());
        return procedureNameExisting;
    }
    static async getGlobalVariableDeclaration(document: TextDocument, variableName: string, type: string): Promise<ALFullSyntaxTreeNode | undefined> {
        let syntaxTree: SyntaxTree = await SyntaxTree.getInstance(document);
        let objectTreeNode: ALFullSyntaxTreeNode | undefined = SyntaxTreeExt.getFirstObjectTreeNodeInDocument(syntaxTree);
        if (objectTreeNode) {
            let globalVarSection: ALFullSyntaxTreeNode | undefined = ALFullSyntaxTreeNodeExt.getFirstChildNodeOfKind(objectTreeNode, FullSyntaxTreeNodeKind.getGlobalVarSection(), false)
            if (globalVarSection) {
                let variables: ALFullSyntaxTreeNode[] = []
                ALFullSyntaxTreeNodeExt.collectChildNodesOfKindArr(globalVarSection, [FullSyntaxTreeNodeKind.getVariableDeclaration(), FullSyntaxTreeNodeKind.getVariableListDeclaration()], false, variables)
                let variablesOfSearchedType: ALFullSyntaxTreeNode[] = variables.filter(variable => document.getText(TextRangeExt.createVSCodeRange(variable.fullSpan)).toLowerCase().includes(': ' + type.toLowerCase()))
                return variablesOfSearchedType.find(variable => variable.name?.toLowerCase() == variableName.toLowerCase());
            }
        }
        return undefined;
    }
    static async addGlobalVariable(document: TextDocument, variableName: string, variableTypeToAdd: string): Promise<{ positionToInsert: Position; textToInsert: string; }> {
        let syntaxTree: SyntaxTree = await SyntaxTree.getInstance(document);
        let objectTreeNode: ALFullSyntaxTreeNode | undefined = SyntaxTreeExt.getFirstObjectTreeNodeInDocument(syntaxTree);
        if (!objectTreeNode)
            throw new Error('Unable to find an object.');
        let globalVarSection: ALFullSyntaxTreeNode | undefined = ALFullSyntaxTreeNodeExt.getFirstChildNodeOfKind(objectTreeNode, FullSyntaxTreeNodeKind.getGlobalVarSection(), false)
        if (globalVarSection) {
            let variables: ALFullSyntaxTreeNode[] = []
            ALFullSyntaxTreeNodeExt.collectChildNodesOfKindArr(globalVarSection, [FullSyntaxTreeNodeKind.getVariableDeclaration(), FullSyntaxTreeNodeKind.getVariableListDeclaration()], false, variables)
            let variablesOfSearchedType: ALFullSyntaxTreeNode[] = variables.filter(variable => document.getText(TextRangeExt.createVSCodeRange(variable.fullSpan)).toLowerCase().includes(': ' + variableTypeToAdd))
            let addAfterVariable: ALFullSyntaxTreeNode | undefined;
            if (variablesOfSearchedType.length > 0)
                addAfterVariable = variablesOfSearchedType[variablesOfSearchedType.length - 1];
            else {
                let typeHierarchy: string[] = ['record', 'report', 'codeunit', 'xmlport', 'page', 'query', 'notification', 'bigtext', 'dateformula', 'recordid', 'recordref', 'fieldref', 'filterpagebuilder']
                if (typeHierarchy.includes(variableTypeToAdd.toLowerCase())) {
                    for (const type of typeHierarchy) {
                        let variablesOfHierarchy: ALFullSyntaxTreeNode[] = variables.filter(variable => document.getText(TextRangeExt.createVSCodeRange(variable.fullSpan)).toLowerCase().includes(': ' + type))
                        if (variablesOfHierarchy.length > 0)
                            addAfterVariable = variablesOfHierarchy[variablesOfHierarchy.length - 1];
                        if (type == variableTypeToAdd.toLowerCase())
                            break;
                    }
                } else
                    addAfterVariable = variables[variables.length - 1];
            }
            let positionToInsert: Position;
            if (addAfterVariable)
                positionToInsert = RangeUtils.trimRange(document, TextRangeExt.createVSCodeRange(addAfterVariable.fullSpan)).end;
            else
                positionToInsert = RangeUtils.trimRange(document, TextRangeExt.createVSCodeRange(globalVarSection.fullSpan)).start.translate(undefined, 'var'.length)
            let textToInsert: string = '\r\n        ' + variableName + ': ' + variableTypeToAdd + ';';
            return { positionToInsert: positionToInsert, textToInsert: textToInsert };
        } else {
            let propertyList: ALFullSyntaxTreeNode | undefined = ALFullSyntaxTreeNodeExt.getFirstChildNodeOfKind(objectTreeNode, FullSyntaxTreeNodeKind.getPropertyList(), false);
            if (!propertyList)
                throw new Error('Expected to find a PropertyList.')
            let positionToInsert: Position = RangeUtils.trimRange(document, TextRangeExt.createVSCodeRange(propertyList.fullSpan)).end;
            let textToInsert: string = '\r\n\r\n    var';
            textToInsert += '\r\n        ' + variableName + ': ' + variableTypeToAdd + ';';
            return { positionToInsert: positionToInsert, textToInsert: textToInsert };
        }
    }
    public static includesFeature(fileContent: string, feature: string): boolean {
        let regexFeature: RegExp = new RegExp('\\[Feature\\]\\s*' + feature + '\\s*\\\\r\\\\n', 'i');
        return regexFeature.test(fileContent);
    }
    public static async getDefaultTestCodeunit(elementValue: string, uri: Uri): Promise<string[]> {
        let nextCodeunitId: string | undefined = await this.getNextCodeunitId();

        let codeunitName: string = elementValue.includes(' ') ? '"' + elementValue + '"' : elementValue;
        let defaultCodeunit: string[] = [
            'codeunit ' + (nextCodeunitId ? nextCodeunitId : 0) + ' ' + codeunitName,
            '{',
            '    Subtype = Test;',
            '',
            '    trigger OnRun()',
            '    begin',
            '        // [Feature] ' + elementValue,
            '    end;',
            '',
            '    [Test]',
            '    procedure NewTestProcedure()',
            '    begin',
            '        // [Scenario #0001] New Test Procedure',
            '    end;',
            '}'
        ];
        if (Config.getAddInitializeFunction(uri)) {
            defaultCodeunit.splice(13, 0, '        Initialize();');
            defaultCodeunit.splice(9, 0, '    var', '        IsInitialized: Boolean;', '')
            let initializeProcAsTextArr: string[] = TestCodeunitUtils.getInitializeMethod(codeunitName);
            defaultCodeunit.pop()
            defaultCodeunit.push('')
            defaultCodeunit = defaultCodeunit.concat(initializeProcAsTextArr)
            defaultCodeunit.push('}')
        }
        return defaultCodeunit;
    }
    static async getNextCodeunitId(fsPath?: string): Promise<string | undefined> {
        if (!fsPath)
            //TODO: create API of Andrzejs extension
            return undefined;
        let document: TextDocument = await workspace.openTextDocument(fsPath);
        let nextIDCompletionItem: CompletionItem | undefined;
        let timeStarted: Date = new Date();
        do {
            let completionList: CompletionList | undefined = await commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, new Position(0, 'codeunit '.length));
            if (!completionList)
                return undefined;
            nextIDCompletionItem = completionList.items.find(item => item.kind && item.kind == CompletionItemKind.Reference)
            let currentTime: Date = new Date()
            let millisecondsAlreadyRan: number = currentTime.getTime() - timeStarted.getTime();
            let secondsRan: number = millisecondsAlreadyRan / 1000
            if (secondsRan > 5)
                break;
        } while (!nextIDCompletionItem);
        return nextIDCompletionItem?.label;
    }
    public static getDefaultTestMethod(id: number | undefined, scenario: string, uri: Uri, feature: string, featureNecessary: boolean): string[] {
        let scenarioNameTitleCase: string = TestMethodUtils.getProcedureName(TypeChanged.ScenarioName, scenario);
        let idAsString: string = '';
        if (id)
            idAsString = ' #' + (id + '').padStart(4, '0');
        let procedure: string[] = [
            '    [Test]',
            '    procedure ' + scenarioNameTitleCase + '()',
            '    begin',
            '        // [Scenario' + idAsString + '] ' + scenario,
            '    end;'
        ];
        if (Config.getAddInitializeFunction(uri))
            procedure.splice(4, 0, '        Initialize();');
        if (featureNecessary && feature) {
            procedure.splice(2, 0, '    ' + ElementUtils.getElementComment(TypeChanged.Feature, feature));
        }

        return procedure;
    }
    static getInitializeMethod(nameOfCodeunit: string): string[] {
        if(/[^w]/.test(nameOfCodeunit) && !nameOfCodeunit.startsWith('"'))
            nameOfCodeunit = `"${nameOfCodeunit}"`
        return [
            '    local procedure Initialize()',
            '    var',
            '        LibraryTestInitialize: Codeunit "Library - Test Initialize";',
            '    begin',
            '        LibraryTestInitialize.OnTestInitialize(Codeunit::' + nameOfCodeunit + ');',
            '        ',
            '        if IsInitialized then',
            '            exit;',
            '        ',
            '        LibraryTestInitialize.OnBeforeTestSuiteInitialize(Codeunit::' + nameOfCodeunit + ');',
            '        ',
            '        IsInitialized := true;',
            '        Commit();',
            '        ',
            '        LibraryTestInitialize.OnAfterTestSuiteInitialize(Codeunit::' + nameOfCodeunit + ');',
            '    end;'
        ]
    }
    static async getPositionToInsertForGlobalProcedure(document: TextDocument): Promise<Position> {
        let syntaxTree: SyntaxTree = await SyntaxTree.getInstance(document);
        let methodDeclarations: ALFullSyntaxTreeNode[] = syntaxTree.collectNodesOfKindXInWholeDocument(FullSyntaxTreeNodeKind.getMethodDeclaration())
        if (methodDeclarations.length > 0) {
            let localMethods: ALFullSyntaxTreeNode[] = methodDeclarations.filter(methodDeclaration => document.getText(RangeUtils.trimRange(document, TextRangeExt.createVSCodeRange(methodDeclaration.fullSpan))).toLowerCase().startsWith('local procedure'));
            if (localMethods.length > 0) {
                return RangeUtils.trimRange(document, TextRangeExt.createVSCodeRange(localMethods[localMethods.length - 1].fullSpan)).end;
            }
            let publicMethods: ALFullSyntaxTreeNode[] = methodDeclarations.filter(methodDeclaration => document.getText(RangeUtils.trimRange(document, TextRangeExt.createVSCodeRange(methodDeclaration.fullSpan))).toLowerCase().startsWith('procedure'));
            if (publicMethods.length > 0) {
                return RangeUtils.trimRange(document, TextRangeExt.createVSCodeRange(publicMethods[publicMethods.length - 1].fullSpan)).end;
            }
            return RangeUtils.trimRange(document, TextRangeExt.createVSCodeRange(methodDeclarations[methodDeclarations.length - 1].fullSpan)).end;
        } else {
            let triggerDeclarations: ALFullSyntaxTreeNode[] = syntaxTree.collectNodesOfKindXInWholeDocument(FullSyntaxTreeNodeKind.getTriggerDeclaration())
            if (triggerDeclarations.length > 0) {
                return RangeUtils.trimRange(document, TextRangeExt.createVSCodeRange(triggerDeclarations[triggerDeclarations.length - 1].fullSpan)).end;
            } else {
                let objectTreeNode: ALFullSyntaxTreeNode | undefined = SyntaxTreeExt.getFirstObjectTreeNodeInDocument(syntaxTree)
                if (!objectTreeNode)
                    throw new Error('Expected to find an AL object inside this file.');
                else {
                    if (objectTreeNode.childNodes) {
                        let lastChildNode: ALFullSyntaxTreeNode = objectTreeNode.childNodes[objectTreeNode.childNodes.length - 1];
                        return RangeUtils.trimRange(document, TextRangeExt.createVSCodeRange(lastChildNode.fullSpan)).end;
                    } else {
                        let objectRange: Range = RangeUtils.trimRange(document, TextRangeExt.createVSCodeRange(objectTreeNode.fullSpan));
                        let range: Range | undefined = RangeUtils.getRangeOfTextInsideRange(document, objectRange, /\{/);
                        if (range) {
                            return range.start.translate(undefined, 1);
                        }
                    }
                }
            }
        }
        throw new Error('Unable to find position to insert procedure.');
    }
}