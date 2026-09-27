const vscode = acquireVsCodeApi();
const state = { model: null, paragraph: null, statement: null, traceName: null, traceKind: null, mode: 'map', query: '' };
const elements = {
  paragraphList: document.getElementById('paragraph-list'),
  dataList: document.getElementById('data-list'),
  paragraphSearch: document.getElementById('paragraph-search'),
  dataSearch: document.getElementById('data-search'),
  paragraphCount: document.getElementById('paragraph-count'),
  dataCount: document.getElementById('data-count'),
  title: document.getElementById('view-title'),
  kicker: document.getElementById('view-kicker'),
  canvas: document.getElementById('canvas'),
  summary: document.getElementById('flow-summary'),
  status: document.getElementById('analysis-status'),
  details: document.getElementById('details-panel'),
  trace: document.getElementById('trace-panel')
};

window.addEventListener('message', event => {
  if (event.data.type !== 'analysis') return;
  state.model = event.data.model;
  if (!state.paragraph || !state.model.paragraphs.some(item => item.name === state.paragraph)) state.paragraph = state.model.paragraphs[0]?.name || null;
  render();
});

document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'ready' }));
elements.paragraphSearch.addEventListener('input', renderParagraphList);
elements.dataSearch.addEventListener('input', renderDataList);
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));
window.addEventListener('message', event => {
  if (event.data.type === 'analysis') return;
});
vscode.postMessage({ type: 'ready' });

function render() {
  if (!state.model) return;
  elements.status.textContent = `${state.model.paragraphs.length} paragraphs · static analysis`;
  elements.paragraphCount.textContent = String(state.model.paragraphs.length);
  elements.dataCount.textContent = String(state.model.variables.length + state.model.resources.length);
  renderParagraphList();
  renderDataList();
  if (state.mode === 'map') renderProgramMap();
  else if (state.mode === 'trace') renderTrace();
  else renderParagraph();
  if (state.statement) renderDetails(state.statement);
}

function renderParagraphList() {
  if (!state.model) return;
  const query = elements.paragraphSearch.value.trim().toUpperCase();
  const list = state.model.paragraphs.filter(item => item.name.includes(query));
  elements.paragraphList.replaceChildren();
  const mapButton = document.createElement('button');
  mapButton.className = `nav-item map-item ${state.mode === 'map' ? 'selected' : ''}`;
  mapButton.innerHTML = '<span class="nav-glyph">⌘</span><span class="nav-label">Program map</span><span class="nav-count">↗</span>';
  mapButton.addEventListener('click', () => { state.mode = 'map'; state.statement = null; render(); });
  elements.paragraphList.append(mapButton);
  for (const paragraph of list) {
    const button = document.createElement('button');
    button.className = `nav-item ${state.mode === 'paragraph' && state.paragraph === paragraph.name ? 'selected' : ''}`;
    button.innerHTML = `<span class="nav-glyph">¶</span><span class="nav-label">${escapeHtml(paragraph.name)}</span><span class="nav-count">${paragraph.statements.length}</span>`;
    button.addEventListener('click', () => { state.paragraph = paragraph.name; state.mode = 'paragraph'; state.statement = null; render(); });
    elements.paragraphList.append(button);
  }
}

function renderDataList() {
  if (!state.model) return;
  const query = elements.dataSearch.value.trim().toUpperCase();
  elements.dataList.replaceChildren();
  const items = [
    ...state.model.resources.map(item => ({ ...item, category: 'resource' })),
    ...state.model.variables.map(item => ({ ...item, category: item.kind }))
  ].filter(item => item.name.includes(query));
  for (const item of items) {
    const button = document.createElement('button');
    const selected = state.traceName === item.name;
    button.className = `data-item ${selected ? 'selected' : ''}`;
    button.innerHTML = `<span class="data-icon ${escapeHtml(item.category)}">${item.category === 'resource' ? '▤' : item.category === 'table' ? '▦' : 'ƒ'}</span><span class="data-label">${escapeHtml(item.name)}</span><span class="data-type">${item.category === 'resource' ? 'FILE' : item.category.toUpperCase()}</span>`;
    button.addEventListener('click', () => {
      state.traceName = item.name;
      state.traceKind = item.category;
      state.mode = 'trace';
      state.statement = null;
      setTab('trace');
      render();
    });
    elements.dataList.append(button);
  }
}

function renderProgramMap() {
  const paragraphs = state.model.paragraphs;
  elements.kicker.textContent = 'PROGRAM FLOW';
  elements.title.textContent = 'All paragraphs';
  elements.summary.textContent = `${paragraphs.length} paragraphs · ${state.model.edges.length} control-flow links`;
  if (!paragraphs.length) return showEmpty('No paragraphs found', 'Check that the source contains a PROCEDURE DIVISION.');

  const columns = 2;
  const width = 880;
  const cardWidth = 340;
  const cardHeight = 88;
  const rowGap = 72;
  const rowCount = Math.ceil(paragraphs.length / columns);
  const height = Math.max(250, rowCount * (cardHeight + rowGap) + 48);
  const positions = new Map();
  paragraphs.forEach((paragraph, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    positions.set(paragraph.name, { x: 42 + column * 440, y: 26 + row * (cardHeight + rowGap) });
  });
  const svg = createSvg(width, height);
  const defs = svgElement('defs');
  const marker = svgElement('marker', { id: 'arrow', markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: 'auto', markerUnits: 'strokeWidth' });
  marker.append(svgElement('path', { d: 'M0,0 L0,6 L7,3 z', class: 'arrow-head' }));
  defs.append(marker);
  svg.append(defs);

  for (const edge of state.model.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;
    const startX = from.x + cardWidth / 2;
    const startY = from.y + cardHeight;
    const endX = to.x + cardWidth / 2;
    const endY = to.y;
    const path = svgElement('path', {
      d: `M ${startX} ${startY} C ${startX} ${startY + 36}, ${endX} ${endY - 36}, ${endX} ${endY}`,
      class: `flow-edge ${edge.type === 'next' ? 'edge-next' : 'edge-call'}`,
      'marker-end': 'url(#arrow)'
    });
    svg.append(path);
  }
  for (const paragraph of paragraphs) {
    const point = positions.get(paragraph.name);
    const group = svgElement('g', { class: 'paragraph-node', tabindex: 0, role: 'button', 'aria-label': `Open paragraph ${paragraph.name}` });
    group.append(svgElement('rect', { x: point.x, y: point.y, width: cardWidth, height: cardHeight, rx: 4, class: 'node-rect' }));
    addSvgText(group, point.x + 18, point.y + 29, paragraph.name, 'node-name');
    addSvgText(group, point.x + 18, point.y + 53, `${paragraph.statements.length} statements`, 'node-meta');
    addSvgText(group, point.x + cardWidth - 36, point.y + 48, '→', 'node-arrow');
    group.addEventListener('click', () => openParagraph(paragraph.name));
    group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') openParagraph(paragraph.name); });
    svg.append(group);
  }
  elements.canvas.replaceChildren(svg);
}

function renderParagraph() {
  const paragraph = state.model.paragraphs.find(item => item.name === state.paragraph);
  if (!paragraph) return showEmpty('Paragraph not found', 'Choose a paragraph from the program list.');
  elements.kicker.textContent = 'PARAGRAPH FLOW';
  elements.title.textContent = paragraph.name;
  elements.summary.textContent = `${paragraph.statements.length} statements · source line ${paragraph.line}${paragraph.calls.length ? ` · calls ${paragraph.calls.join(', ')}` : ''}`;
  if (!paragraph.statements.length) return showEmpty('No statements in this paragraph', 'The paragraph may be empty or contain unsupported source layout.');
  const wrapper = document.createElement('div');
  wrapper.className = 'statement-flow';
  for (const [index, statement] of paragraph.statements.entries()) {
    if (index > 0) {
      const connector = document.createElement('div');
      connector.className = 'statement-connector';
      connector.innerHTML = '<span></span>';
      wrapper.append(connector);
    }
    const node = document.createElement('button');
    node.className = `statement-node ${statement.kind} ${state.statement?.id === statement.id ? 'focused' : ''}`;
    node.innerHTML = `<span class="statement-glyph">${statement.kind === 'input' ? '↓' : statement.kind === 'output' ? '↑' : statement.kind === 'call' ? '↗' : '·'}</span><span class="statement-main"><span class="statement-text">${escapeHtml(statement.text)}</span><span class="statement-meta">LINE ${statement.line}${statement.operation ? ` · ${statement.operation}` : ''}${statement.resource ? ` · ${statement.resource}` : ''}</span></span><span class="node-chevron">›</span>`;
    node.addEventListener('click', () => { state.statement = statement; renderDetails(statement); renderParagraph(); });
    wrapper.append(node);
  }
  elements.canvas.replaceChildren(wrapper);
}

function renderTrace() {
  const trace = getTrace();
  elements.kicker.textContent = 'DATA TRACE';
  elements.title.textContent = state.traceName || 'Choose a data item';
  elements.summary.textContent = trace ? `${trace.events.length} related statements · ${trace.fields.size} connected data items` : 'Select a field, table, or file to trace';
  if (!trace || !trace.events.length) return showEmpty('No references found', 'This source does not contain recognized references to the selected item.');
  const wrapper = document.createElement('div');
  wrapper.className = 'statement-flow trace-flow';
  const grouped = new Map();
  for (const statement of trace.events) {
    if (!grouped.has(statement.paragraph)) grouped.set(statement.paragraph, []);
    grouped.get(statement.paragraph).push(statement);
  }
  let index = 0;
  for (const [paragraph, statements] of grouped) {
    const heading = document.createElement('button');
    heading.className = 'trace-paragraph';
    heading.innerHTML = `<span>¶</span><strong>${escapeHtml(paragraph)}</strong><span>${statements.length} EVENTS</span>`;
    heading.addEventListener('click', () => openParagraph(paragraph));
    wrapper.append(heading);
    for (const statement of statements) {
      if (index++ > 0) {
        const connector = document.createElement('div');
        connector.className = 'statement-connector trace-connector';
        connector.innerHTML = '<span></span>';
        wrapper.append(connector);
      }
      const node = document.createElement('button');
      node.className = `statement-node ${statement.kind}`;
      node.innerHTML = `<span class="statement-glyph">${statement.kind === 'input' ? '↓' : statement.kind === 'output' ? '↑' : '·'}</span><span class="statement-main"><span class="statement-text">${escapeHtml(statement.text)}</span><span class="statement-meta">${escapeHtml(statement.paragraph)} · LINE ${statement.line}${statement.resource ? ` · ${statement.resource}` : ''}</span></span><span class="node-chevron">›</span>`;
      node.addEventListener('click', () => { state.paragraph = statement.paragraph; state.statement = statement; revealLine(statement.line); setTab('details'); render(); });
      wrapper.append(node);
    }
  }
  elements.canvas.replaceChildren(wrapper);
  renderTraceDetails(trace);
}

function getTrace() {
  if (!state.traceName || !state.model) return null;
  const resource = state.model.resources.find(item => item.name === state.traceName)
    || state.model.resources.find(item => item.items.includes(state.traceName));
  const fields = new Set([state.traceName, resource?.name, ...(resource?.items || [])].filter(Boolean));
  let hierarchyChanged = true;
  while (hierarchyChanged) {
    hierarchyChanged = false;
    for (const item of state.model.variables) {
      if (item.parent && (fields.has(item.name) || fields.has(item.parent))) {
        if (!fields.has(item.name)) {
          fields.add(item.name);
          hierarchyChanged = true;
        }
        if (!fields.has(item.parent)) {
          fields.add(item.parent);
          hierarchyChanged = true;
        }
      }
    }
  }
  const events = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    for (const paragraph of state.model.paragraphs) {
      for (const statement of paragraph.statements) {
        const matchesResource = [...fields].some(name => statement.resource === name);
        const matchesField = statement.identifiers.some(name => fields.has(name));
        if (!matchesResource && !matchesField) continue;
        events.set(statement.id, statement);
        for (const name of statement.identifiers) {
          if (name !== statement.resource && !fields.has(name) && (statement.reads.includes(name) || statement.writes.includes(name) || statement.tableRefs.includes(name))) {
            fields.add(name);
            changed = true;
          }
        }
      }
    }
  }
  return { events: [...events.values()].sort((a, b) => a.line - b.line), fields };
}

function renderDetails(statement) {
  setTab('details');
  elements.details.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'detail-heading';
  heading.innerHTML = `<span class="detail-kind ${statement.kind}">${escapeHtml(statement.kind.toUpperCase())}</span><h2>${escapeHtml(statement.operation || statement.paragraph)}</h2><p>${escapeHtml(statement.paragraph)} · line ${statement.line}</p>`;
  const source = document.createElement('button');
  source.className = 'source-jump';
  source.innerHTML = '<span>↗</span> Reveal in editor';
  source.addEventListener('click', () => revealLine(statement.line));
  const code = document.createElement('pre');
  code.className = 'source-preview';
  code.textContent = statement.text;
  elements.details.append(heading, source);
  addDetailList(elements.details, 'READS', statement.reads);
  addDetailList(elements.details, 'CHANGES', statement.writes);
  if (statement.resource) addDetailList(elements.details, 'FILE / RESOURCE', [statement.resource]);
  if (statement.tableRefs.length) addDetailList(elements.details, 'TABLES', statement.tableRefs);
  elements.details.append(code);
}

function renderTraceDetails(trace) {
  elements.trace.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'detail-heading';
  heading.innerHTML = `<span class="detail-kind trace-kind">TRACE TARGET</span><h2>${escapeHtml(state.traceName)}</h2><p>${trace.events.length} statements included in this trace</p>`;
  elements.trace.append(heading);
  addDetailList(elements.trace, 'CONNECTED ITEMS', [...trace.fields].sort());
  const outputs = trace.events.filter(item => item.kind === 'output');
  addDetailList(elements.trace, 'FILE WRITES', outputs.map(item => `${item.resource || item.paragraph} · line ${item.line}`));
  const inputs = trace.events.filter(item => item.kind === 'input');
  addDetailList(elements.trace, 'FILE READS', inputs.map(item => `${item.resource || item.paragraph} · line ${item.line}`));
  const note = document.createElement('p');
  note.className = 'trace-note';
  note.textContent = 'Static name-based analysis. Review source context before treating inferred data paths as complete.';
  elements.trace.append(note);
}

function addDetailList(parent, title, values) {
  const section = document.createElement('section');
  section.className = 'detail-list';
  const heading = document.createElement('h3');
  heading.textContent = title;
  section.append(heading);
  if (!values.length) {
    const empty = document.createElement('span');
    empty.className = 'muted';
    empty.textContent = 'None detected';
    section.append(empty);
  } else {
    for (const value of values) {
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.textContent = value;
      section.append(item);
    }
  }
  parent.append(section);
}

function setTab(tab) {
  document.querySelectorAll('.tab').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  elements.details.classList.toggle('hidden', tab !== 'details');
  elements.trace.classList.toggle('hidden', tab !== 'trace');
}

function openParagraph(name) {
  state.paragraph = name;
  state.mode = 'paragraph';
  state.statement = null;
  render();
}

function revealLine(line) {
  vscode.postMessage({ type: 'revealLine', line });
}

function showEmpty(title, description) {
  const panel = document.createElement('div');
  panel.className = 'empty-state';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const detail = document.createElement('span');
  detail.textContent = description;
  panel.append(heading, detail);
  elements.canvas.replaceChildren(panel);
}

function createSvg(width, height) {
  const svg = svgElement('svg', { class: 'program-svg', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'COBOL paragraph flow graph' });
  return svg;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function addSvgText(parent, x, y, text, className) {
  const element = svgElement('text', { x, y, class: className });
  element.textContent = text;
  parent.append(element);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}