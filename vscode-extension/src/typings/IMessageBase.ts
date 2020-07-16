export interface IMessageBase {
    Command?: string;
    Params?: any;
    Data?: any;
}

export interface Message {
    Project: string;
    Feature: string;
    Id?: number;
    Scenario: string;
    Codeunit: string;
    FsPath: string;
    MethodName: string;
    IsDirty: boolean;
    State: MessageState;
    TestRunnerResult: ALTestRunnerResult;
    Details: MessageDetails;
}

export interface MessageDetails {
    feature: string;
    name: string;
    given: Array<string>;
    when: Array<string>;
    then: Array<string>;
}

export enum ALTestRunnerResult {
    NoInfo,
    Success,
    Failure
}

export enum MessageState {
    Unchanged,
    New,
    Modified,
    Deleted
}

export interface MessageUpdate
{
    Scenario: string;
    Type: TypeChanged;
    State: MessageState;
    OldValue: string;
    NewValue: string;
    FsPath: string;
    DeleteProcedure: boolean;
}

export enum TypeChanged
{
    Feature,
    ScenarioId,
    ScenarioName,
    Given,
    When,
    Then
}