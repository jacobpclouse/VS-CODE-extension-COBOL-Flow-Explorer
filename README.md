# VS CODE extension - COBOL Flow Explorer

A local VS Code extension prototype for exploring COBOL paragraph flow and tracing data through source. Analysis is deterministic and runs in the extension; it does not use AI or send source to a service.

## Required:
- node js
- npm
- vs code

## Run in VS Code

1. Open this folder in VS Code.
2. Open the Run and Debug view and start **Run COBOL Flow Explorer**.
3. In the Extension Development Host, open a COBOL source file and run **COBOL: Open Flow Explorer** from the Command Palette.

The explorer shows a map of recognized paragraphs, statement flows for each paragraph, and a data trace for declared fields, OCCURS tables, and files. Select a statement to inspect recognized reads, changes, and resources; use **Reveal in editor** to jump to its source line. Source edits are re-analyzed while the explorer is open.

## Current analysis boundaries

This is a static, name-based prototype, not a COBOL compiler. It recognizes common declarations and operations including `MOVE`, arithmetic verbs, `READ`, `WRITE`, `REWRITE`, `PERFORM`, and `GO TO`. File records declared beneath `FD` entries are associated with those files. The trace links statements that reference the same declared names and can over-approximate data dependencies; inspect the source before relying on a trace for program changes.

Copybook expansion, full COBOL grammar and scope rules, condition-sensitive paths, dynamic calls, and precise table-element/index semantics are not implemented yet. Unsupported layouts may be omitted from the graph.

## Test

With Node.js installed, run `npm test` to check paragraph recognition, FD record ownership, calls, data changes, and file read/write classification.

## Note: if the extension does not run correctly or fails to open:
With Run COBOL Flow Explorer selected in Run and Debug, press Ctrl+F5 (Run Without Debugging) instead of F5. This should launch the Extension Development Host without waiting for the debugger; then open your COBOL file and run the command in that window.
