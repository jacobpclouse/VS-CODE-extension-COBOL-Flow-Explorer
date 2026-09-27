const assert = require('assert');
const { analyze } = require('../src/analyzer');

const source = `IDENTIFICATION DIVISION.
PROGRAM-ID. FLOW-SAMPLE.
ENVIRONMENT DIVISION.
INPUT-OUTPUT SECTION.
FILE-CONTROL.
    SELECT INPUT-FILE ASSIGN TO 'IN.DAT'.
    SELECT OUTPUT-FILE ASSIGN TO 'OUT.DAT'.
DATA DIVISION.
FILE SECTION.
FD INPUT-FILE.
01 INPUT-REC.
   05 INPUT-AMOUNT PIC 9(5).
FD OUTPUT-FILE.
01 OUTPUT-REC.
   05 OUTPUT-AMOUNT PIC 9(5).
WORKING-STORAGE SECTION.
01 WS-TOTAL PIC 9(5).
01 CUSTOMER-TABLE.
    05 CUSTOMER-ROW OCCURS 10 TIMES.
        10 CUSTOMER-BALANCE PIC 9(5).
PROCEDURE DIVISION.
MAIN.
    PERFORM LOAD-INPUT
    PERFORM UPDATE-TOTAL
    PERFORM WRITE-RESULT
    STOP RUN.
LOAD-INPUT.
    READ INPUT-FILE INTO INPUT-REC
    END-READ.
UPDATE-TOTAL.
    MOVE INPUT-AMOUNT TO WS-TOTAL
    ADD 1 TO WS-TOTAL.
WRITE-RESULT.
    MOVE WS-TOTAL TO OUTPUT-AMOUNT
    WRITE OUTPUT-REC.
`;

const model = analyze(source, 'flow-sample.cbl');
const paragraph = name => model.paragraphs.find(item => item.name === name);
const statement = (paragraphName, start) => paragraph(paragraphName).statements.find(item => item.text.startsWith(start));

assert.deepStrictEqual(model.paragraphs.map(item => item.name), ['MAIN', 'LOAD-INPUT', 'UPDATE-TOTAL', 'WRITE-RESULT']);
assert.deepStrictEqual(paragraph('MAIN').calls, ['LOAD-INPUT', 'UPDATE-TOTAL', 'WRITE-RESULT']);
assert.deepStrictEqual(model.resources.find(item => item.name === 'INPUT-FILE').items, ['INPUT-REC', 'INPUT-AMOUNT']);
assert(!model.resources.find(item => item.name === 'OUTPUT-FILE').items.includes('WS-TOTAL'));
assert.strictEqual(model.variables.find(item => item.name === 'INPUT-AMOUNT').parent, 'INPUT-REC');
assert.strictEqual(model.variables.find(item => item.name === 'INPUT-AMOUNT').resource, 'INPUT-FILE');
assert.strictEqual(model.variables.find(item => item.name === 'CUSTOMER-ROW').kind, 'table');
assert.strictEqual(model.variables.find(item => item.name === 'CUSTOMER-BALANCE').parent, 'CUSTOMER-ROW');
assert.strictEqual(statement('LOAD-INPUT', 'READ').kind, 'input');
assert.deepStrictEqual(statement('UPDATE-TOTAL', 'MOVE').writes, ['WS-TOTAL']);
assert.deepStrictEqual(statement('UPDATE-TOTAL', 'ADD').writes, ['WS-TOTAL']);
assert.strictEqual(statement('WRITE-RESULT', 'WRITE').kind, 'output');
assert.strictEqual(statement('WRITE-RESULT', 'WRITE').resource, 'OUTPUT-FILE');

console.log('COBOL analyzer checks passed.');