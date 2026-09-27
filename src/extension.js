const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { analyze } = require('./analyzer');

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('cobolFlow.open', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('Open a COBOL source file to explore its flow.');
      return;
    }

    const document = editor.document;
    const panel = vscode.window.createWebviewPanel(
      'cobolFlowExplorer',
      `COBOL Flow: ${path.basename(document.fileName)}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] }
    );
    const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'explorer.js'));
    const styleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'explorer.css'));
    const nonce = [...Array(32)].map(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
    panel.webview.html = createHtml(panel.webview.cspSource, scriptUri, styleUri, nonce, path.basename(document.fileName));

    const sendAnalysis = () => panel.webview.postMessage({ type: 'analysis', model: analyze(document.getText(), document.fileName) });
    const messageSubscription = panel.webview.onDidReceiveMessage(async message => {
      if (message.type === 'ready') sendAnalysis();
      if (message.type === 'revealLine') {
        const line = Math.max(0, Math.min(document.lineCount - 1, message.line - 1));
        const target = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
        const position = new vscode.Position(line, 0);
        target.selection = new vscode.Selection(position, position);
        target.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      }
    });
    const changeSubscription = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document === document) sendAnalysis();
    });
    panel.onDidDispose(() => {
      messageSubscription.dispose();
      changeSubscription.dispose();
    });
  }));
}

function createHtml(cspSource, scriptUri, styleUri, nonce, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}' ${cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>COBOL Flow Explorer</title>
</head>
<body>
  <header class="topbar">
    <div class="brand"><span class="brand-mark">CF</span><div><strong>Flow Explorer</strong><small id="file-name">${escapeHtml(title)}</small></div></div>
    <div class="top-actions"><span id="analysis-status">Waiting for source</span><button id="refresh" title="Re-analyze source" aria-label="Re-analyze source">↻</button></div>
  </header>
  <main class="workspace">
    <aside class="rail">
      <div class="rail-heading"><span>PROGRAM</span><span id="paragraph-count">0</span></div>
      <label class="search-wrap"><span aria-hidden="true">⌕</span><input id="paragraph-search" placeholder="Find paragraph" autocomplete="off"></label>
      <nav id="paragraph-list" aria-label="Paragraphs"></nav>
      <div class="rail-heading data-heading"><span>DATA ITEMS</span><span id="data-count">0</span></div>
      <label class="search-wrap"><span aria-hidden="true">⌕</span><input id="data-search" placeholder="Trace a field or file" autocomplete="off"></label>
      <nav id="data-list" aria-label="Data items"></nav>
    </aside>
    <section class="canvas-area">
      <div class="canvas-toolbar"><div><div class="eyebrow" id="view-kicker">PROGRAM FLOW</div><h1 id="view-title">Analyzing source</h1></div><div class="legend"><span><i class="legend-dot process"></i>Statement</span><span><i class="legend-dot input"></i>Input</span><span><i class="legend-dot output"></i>Output</span><span><i class="legend-dot call"></i>Paragraph call</span></div></div>
      <div id="canvas" class="canvas"><div class="empty-state">Loading COBOL source…</div></div>
      <div class="canvas-footer"><span id="flow-summary">Static analysis</span><span>Click a node to jump to source</span></div>
    </section>
    <aside class="inspector">
      <div class="inspector-tabs"><button class="tab active" data-tab="details">DETAILS</button><button class="tab" data-tab="trace">DATA TRACE</button></div>
      <section id="details-panel" class="inspector-content"><div class="empty-inspector"><span class="empty-icon">⌁</span><h2>Select a statement</h2><p>Inspect its data references, changes, and source location.</p></div></section>
      <section id="trace-panel" class="inspector-content hidden"><div class="empty-inspector"><span class="empty-icon">◎</span><h2>Choose a data item</h2><p>Follow reads, transformations, and file output across paragraphs.</p></div></section>
    </aside>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function deactivate() {}

module.exports = { activate, deactivate };