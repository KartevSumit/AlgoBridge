import * as assert from 'assert';
import * as vscode from 'vscode';

declare function suite(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void): void;

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});
